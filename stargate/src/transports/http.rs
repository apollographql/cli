use async_trait::async_trait;
use http_types::headers::HeaderValue;
use serde::{Deserialize, Serialize};
use tide::security::{CorsMiddleware, Origin};
use tide::{http::Method, Body, Request, Response};

#[derive(Serialize, Deserialize)]
pub struct GraphQLRequest {
    pub query: String,
    #[serde(rename = "operationName")]
    pub operation_name: Option<String>,
    pub variables: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
pub struct GraphQLResponse {
    pub data: Option<serde_json::Value>,
    // errors: 'a Option<async_graphql::http::GQLError>,
}

pub struct RequestContext {
    pub graphql_request: async_graphql::http::GQLRequest,
}

/// Tide request extension
#[async_trait]
pub trait RequestExt<State: Clone + Send + Sync + 'static>: Sized {
    /// Convert a query to `RequestContext`.
    async fn build_request_context(&mut self) -> tide::Result<RequestContext>;
}

#[async_trait]
impl<State: Clone + Send + Sync + 'static> RequestExt<State> for Request<State> {
    async fn build_request_context(&mut self) -> tide::Result<RequestContext> {
        if self.method() == Method::Post {
            let graphql_request: GraphQLRequest = self.body_json().await?;

            Ok(RequestContext {
                graphql_request: async_graphql::http::GQLRequest {
                    query: graphql_request.query,
                    operation_name: graphql_request.operation_name,
                    variables: graphql_request.variables,
                },
            })
        } else {
            unimplemented!("Only supports POST requests currently");
        }
    }
}

/// Tide response extension
///
pub trait ResponseExt: Sized {
    /// Set body as the result of a GraphQL query.
    fn format_graphql_response(
        self,
        res: std::result::Result<GraphQLResponse, Box<dyn std::error::Error + Send + Sync>>,
    ) -> tide::Result<Self>;
}

impl ResponseExt for Response {
    fn format_graphql_response(
        self,
        res: std::result::Result<GraphQLResponse, Box<dyn std::error::Error + Send + Sync>>,
    ) -> tide::Result<Self> {
        let mut resp = self;
        if let Ok(data) = res {
            resp.set_body(Body::from_json(&data)?);
        }
        Ok(resp)
    }
}

pub fn get_studio_middleware() -> tide::security::CorsMiddleware {
    CorsMiddleware::new()
        .allow_methods("GET, POST, OPTIONS".parse::<HeaderValue>().unwrap())
        .allow_origin(Origin::from("https://studio.apollographql.com"))
        .allow_credentials(true)
}
