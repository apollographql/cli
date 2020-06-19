use std::env;
use std::env::consts::OS;
use std::error::Error;
use std::time::Duration;

use log::debug;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::config::CliConfig;
use crate::errors::{ApolloError, ErrorDetails, Fallible};
use crate::layout::apollo_config;
use crate::version::get_installed_version;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct Platform {
    /// the platform from which the command was run (i.e. linux, macOS, or windows)
    os: String,

    /// if we think this command is being run in a CI
    is_ci: bool,

    /// the name of the CI we think is being used
    ci_name: Option<String>,
}

/// The Session represents a usage of the CLI analogous to a web session
/// It contains the "url" (command path + flags) but doesn't contain any
/// values entered by the user. It also contains some identity information
/// for the user
#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    /// the command usage where commands are paths and flags are query strings
    /// i.e. ap schema push --graph --variant would become ap/schema/push?graph&variant
    command: Option<String>,

    /// A unique session id
    session_id: String,

    /// Information about the current architecture/platform
    platform: Platform,

    /// The current version of the CLI
    release_version: String,

    /// The current instantiation of CliConfig
    pub config: CliConfig,

    /// The current instantiation of CliConfig
    pub config_path: PathBuf,

    /// The current host for the Apollo CDN, normally retreived from the APOLLO_CDN_URL
    /// environment variable, and defaults to https://install.apollographql.com
    pub cdn_host: String,
}

impl Session {
    /// This function will return an error if the api key is not defined
    pub fn require_api_key(&self) -> Fallible<String> {
        match &self.config.api_key {
            Some(api_key) => Ok(api_key.clone()),
            None => Err(ErrorDetails::NoApiKeyError.into()),
        }
    }

    pub fn init() -> Fallible<Session> {
        let command = None;
        let session_id = Uuid::new_v4().to_string();

        let platform = Platform {
            os: OS.to_string(),
            is_ci: ci_info::is_ci(),
            ci_name: ci_info::get().name,
        };

        let release_version = get_installed_version()
            .map_err(|e| ApolloError::from(ErrorDetails::CliInstallError { msg: e.to_string() }))?
            .to_string();
        let config_path = apollo_config()?;

        let config = CliConfig::load(&config_path)?;

        let cdn_host = env::var("APOLLO_CDN_URL")
            .unwrap_or_else(|_| "https://install.apollographql.com".to_string());

        Ok(Session {
            command,
            session_id,
            platform,
            release_version,
            config,
            config_path,
            cdn_host,
        })
    }

    pub fn log_command(&mut self, cmd: &str) {
        self.command = Some(cmd.to_string())
    }

    pub fn report(&self) -> Result<bool, Box<dyn Error + 'static>> {
        // don't send if APOLLO_TELEMETRY_DISABLED is set
        if env::var("APOLLO_TELEMETRY_DISABLED").is_ok() {
            return Ok(false);
        }

        let url = format!("{}/telemetry", &self.cdn_host);
        // TODO: FIXME:: https://github.com/apollographql/rust/pull/50#discussion_r434231100
        // Requiring effectively copy paste renaming for
        // data is a _high_ chance for bugs and no something
        // we should encourage. This was done to unwed the CLI's
        // notion of a Session from the Typescript telemetry
        // notion, however a larger refactor to move Session into
        // a higher up module, which can send a Telemetry struct
        // etc.
        let telemetry_session = serde_json::json!({
            "command": self.command,
            "machine_id": self.config.machine_id,
            "session_id": self.session_id,
            "platform": self.platform,
            "release_version": self.release_version,
        });
        let body = serde_json::to_string(&telemetry_session).unwrap();
        // keep the CLI waiting for 300 ms to send telemetry
        // if the request isn't sent in that time loose that report
        // to keep the experience fast for end users
        let timeout = Duration::from_millis(300);

        debug!("Sending telemetry to {}", &url);
        let resp = reqwest::blocking::Client::new()
            .post(&url)
            .body(body)
            .header("User-Agent", "Apollo CLI")
            .header("Content-Type", "application/json")
            .timeout(timeout)
            .send();

        debug!("Telemetry request done");
        match resp {
            Ok(res) => {
                debug!("response status is {}, response is {:?}", res.status(), res);
                Ok(res.status().is_success())
            }
            Err(e) => {
                debug!("telemetry request failed: {}", e);
                Ok(false)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::env::set_var;

    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, Request, ResponseTemplate};

    use super::Session;

    #[async_std::test]
    async fn reports_session() -> Result<(), Box<dyn std::error::Error>> {
        let _ = env_logger::builder().is_test(true).try_init();

        let proxy = MockServer::start().await;

        // create a session
        let mut session = Session::init()?;
        session.cdn_host = proxy.uri();
        session.log_command("test");

        let payload_matcher = move |request: &Request| {
            let body: serde_json::Value =
                serde_json::from_slice(&request.body).expect("Failed to serialize body");
            match body.get("command").unwrap() {
                serde_json::Value::String(cmd) => cmd == "test",
                _ => false,
            }
        };

        Mock::given(method("POST"))
            .and(path("/telemetry"))
            .and(payload_matcher)
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&proxy)
            .await;

        assert_eq!(session.report()?, true);

        // the mock will panic if it this report is sent
        set_var("APOLLO_TELEMETRY_DISABLED", "1");
        assert_eq!(session.report()?, false);

        Ok(())
    }
}
