use std::collections::HashMap;

use apollo_query_planner::build_query_plan;
use apollo_query_planner::helpers::directive_args_as_map;
use apollo_query_planner::{QueryPlanner, QueryPlanningOptionsBuilder};
use graphql_parser::schema;
use std::collections::HashMap;

pub mod common;
mod request_pipeline;
pub mod transports;
mod utilities;

#[derive(Clone)]
pub struct Stargate<'app> {
    service_list: HashMap<String, ServiceDefinition>,
    pub planner: QueryPlanner<'app>,
}

impl<'app> Stargate<'app> {
    pub fn new(schema: &'app str) -> Stargate<'app> {
        // TODO(ran) FIXME: gql validation on schema
        let planner = QueryPlanner::new(schema);
        let service_list = get_service_list(&planner.schema);
        Stargate {
            planner,
            service_list,
        }
    }

    pub async fn execute_query(
        &self,
        request_context: &RequestContext,
    ) -> std::result::Result<GraphQLResponse, Box<dyn std::error::Error + Send + Sync>> {
        // TODO(ran) FIXME: gql validation on query
        // TODO(james) actual request pipeline here
        let options = QueryPlanningOptionsBuilder::default().build().unwrap();
        let plan = self
            .planner
            .plan(&request_context.graphql_request.query, options);

        let plan = if let Ok(plan) = plan {
            plan
        } else {
            todo!("convert QueryPlanError to generic error")
        };
        execute_query_plan(&plan, &self.service_list, &request_context).await
    }
}

fn get_service_list(schema: &schema::Document) -> HashMap<String, ServiceDefinition> {
    let schema_defintion: Option<&schema::SchemaDefinition> = schema
        .definitions
        .iter()
        .filter_map(|d| match d {
            schema::Definition::Schema(schema) => Some(schema),
            _ => None,
        })
        .last();

    if schema_defintion.is_none() {
        todo!("handle error case")
    }

    apollo_query_planner::get_directive!(schema_defintion.unwrap().directives, "graph")
        .map(|owner_dir| directive_args_as_map(&owner_dir.arguments))
        .map(|args| {
            (
                String::from(args["name"]),
                ServiceDefinition {
                    url: String::from(args["url"]),
                },
            )
        })
        .collect()
}
