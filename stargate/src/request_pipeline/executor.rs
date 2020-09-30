use futures::future::{BoxFuture, FutureExt};
use std::collections::HashMap;
use std::sync::RwLock;

use apollo_query_planner::model::Selection::Field;
use apollo_query_planner::model::Selection::InlineFragment;
use apollo_query_planner::model::*;

use crate::request_pipeline::service_definition::{Service, ServiceDefinition};
use crate::transports::http::{GraphQLResponse, RequestContext};
use crate::utilities::deep_merge::merge;

pub struct ExecutionContext<'schema, 'request> {
    service_map: &'schema HashMap<String, ServiceDefinition>,
    // errors: Vec<async_graphql::Error>,
    request_context: &'request RequestContext,
}

pub async fn execute_query_plan<'schema, 'request>(
    query_plan: &QueryPlan,
    service_map: &'schema HashMap<String, ServiceDefinition>,
    request_context: &'request RequestContext,
) -> std::result::Result<GraphQLResponse, Box<dyn std::error::Error + Send + Sync>> {
    // let errors: Vec<async_graphql::Error> = Vec::new();

    let context = ExecutionContext {
        service_map,
        // errors,
        request_context,
    };

    let data_lock: RwLock<serde_json::Value> = RwLock::new(serde_json::from_str(r#"{}"#)?);

    if query_plan.node.is_some() {
        execute_node(
            &context,
            query_plan.node.as_ref().unwrap(),
            &data_lock,
            &vec![],
        )
        .await;
    } else {
        unimplemented!("Introspection not supported yet");
    };

    let data = data_lock.into_inner().unwrap();
    Ok(GraphQLResponse { data: Some(data) })
}

fn execute_node<'schema, 'request>(
    context: &'request ExecutionContext<'schema, 'request>,
    node: &'request PlanNode,
    results: &'request RwLock<serde_json::Value>,
    path: &'request ResponsePath,
) -> BoxFuture<'request, ()> {
    async move {
        match node {
            PlanNode::Sequence { nodes } => {
                for node in nodes {
                    execute_node(context, &node, results, path).await;
                }
            }
            PlanNode::Parallel { nodes } => {
                let mut promises = Vec::new();

                for node in nodes {
                    promises.push(execute_node(context, &node, results, path));
                }
                futures::future::join_all(promises).await;
            }
            PlanNode::Fetch(fetch_node) => {
                let _fetch_result = execute_fetch(context, &fetch_node, results).await;
                //   if fetch_result.is_err() {
                //       context.errors.push(fetch_result.errors)
                //   }
            }
            PlanNode::Flatten(flatten_node) => {
                let mut flattend_path: Vec<String> = Vec::new();
                flattend_path.extend(path.to_owned());
                flattend_path.extend(flatten_node.path.to_owned());

                let inner_lock: RwLock<serde_json::Value> =
                    RwLock::new(serde_json::from_str(r#"{}"#).unwrap());

                /*

                    Flatten works by selecting a zip of the result tree from the
                    path on the node (i.e [topProducts, @]) and creating a temporary
                    RwLock JSON object for the data currently stored there. Then we proceed
                    with executing the result of the node tree in the plan. Once the nodes have
                    been executed, we restitch the temporary JSON back into the parent result tree
                    at the same point using the flatten path

                    results_to_flatten = {
                        topProducts: [
                            { __typename: "Book", isbn: "1234" }
                        ]
                    }

                    inner_to_merge = {
                        { __typename: "Book", isbn: "1234" }
                    }

                */
                {
                    let results_to_flatten = results.read().unwrap();
                    let mut inner_to_merge = inner_lock.write().unwrap();
                    *inner_to_merge = flatten_results_at_path(
                        &mut results_to_flatten.clone(),
                        &flatten_node.path,
                    )
                    .to_owned();
                }

                execute_node(context, &flatten_node.node, &inner_lock, &flattend_path).await;

                // once the node has been executed, we need to restitch it back to the parent
                // node on the tree of result data
                /*
                    results_to_flatten = {
                        topProducts: []
                    }

                    inner_to_merge = {
                        { __typename: "Book", isbn: "1234", name: "Best book ever" }
                    }

                    path = [topProducts, @]
                */
                {
                    let mut results_to_flatten = results.write().unwrap();
                    let inner = inner_lock.write().unwrap();
                    merge_flattend_results(&mut *results_to_flatten, &inner, &flatten_node.path);
                }
            }
        }
    }
    .boxed()
}

fn merge_flattend_results(
    parent_data: &mut serde_json::Value,
    child_data: &serde_json::Value,
    path: &ResponsePath,
) {
    if path.is_empty() || child_data.is_null() {
        merge(&mut *parent_data, &child_data);
        return;
    }

    if let Some((current, rest)) = path.split_first() {
        if current == "@" {
            if parent_data.is_array() && child_data.is_array() {
                let parent_array = parent_data.as_array_mut().unwrap();
                for index in 0..parent_array.len() {
                    if let Some(child_item) = child_data.get(index) {
                        let parent_item = parent_data.get_mut(index).unwrap();
                        merge_flattend_results(parent_item, child_item, &rest.to_owned());
                    }
                }
            }
        } else if parent_data.get(&current).is_some() {
            let inner: &mut serde_json::Value = parent_data.get_mut(&current).unwrap();
            merge_flattend_results(inner, child_data, &rest.to_owned());
        }
    }
}

async fn execute_fetch<'schema, 'request>(
    context: &ExecutionContext<'schema, 'request>,
    fetch: &FetchNode,
    results_lock: &'request RwLock<serde_json::Value>,
) -> std::result::Result<(), Box<dyn std::error::Error + Send + Sync + 'static>> {
    let service = &context.service_map[&fetch.service_name];

    let mut variables: HashMap<String, serde_json::Value> = HashMap::new();
    if !fetch.variable_usages.is_empty() {
        for variable_name in &fetch.variable_usages {
            if let Some(vars) = &context.request_context.graphql_request.variables {
                if let Some(variable) = vars.get(&variable_name) {
                    variables.insert(variable_name.to_string(), variable.clone());
                }
            }
        }
    }

    let mut representations: Vec<serde_json::Value> = Vec::new();
    let mut representations_to_entity: Vec<usize> = Vec::new();

    if let Some(requires) = &fetch.requires {
        if variables.get_key_value("representations").is_some() {
            unimplemented!(
                "Need to throw here because `Variables cannot contain key 'represenations'"
            );
        }

        let results = results_lock.read().unwrap();

        let representation_variables = match &*results {
            serde_json::Value::Array(entities) => {
                for (index, entity) in entities.iter().enumerate() {
                    let representation = execute_selection_set(&entity, &requires);
                    if representation.is_object() && representation.get("__typename").is_some() {
                        representations.push(representation);
                        representations_to_entity.push(index);
                    }
                }
                serde_json::Value::Array(representations)
            }
            serde_json::Value::Object(_entity) => {
                let representation = execute_selection_set(&results, &requires);
                if representation.is_object() && representation.get("__typename").is_some() {
                    representations.push(representation);
                    representations_to_entity.push(0);
                }
                serde_json::Value::Array(representations)
            }
            _ => {
                println!("In empty match line 199");
                serde_json::Value::Array(vec![])
            }
        };

        variables.insert("representations".to_string(), representation_variables);
    }

    let data_received = service
        .send_operation(context, fetch.operation.clone(), &variables)
        .await?;

    if let Some(_requires) = &fetch.requires {
        if let Some(recieved_entities) = data_received.get("_entities") {
            let mut entities_to_merge = results_lock.write().unwrap();
            match &*entities_to_merge {
                serde_json::Value::Array(_entities) => {
                    let entities = entities_to_merge.as_array_mut().unwrap();
                    for index in 0..entities.len() {
                        if let Some(rep_index) = representations_to_entity.get(index) {
                            let result = entities.get_mut(*rep_index).unwrap();
                            merge(result, &recieved_entities[index]);
                        }
                    }
                }
                serde_json::Value::Object(_entity) => {
                    merge(&mut *entities_to_merge, &recieved_entities[0]);
                }
                _ => {}
            }
        } else {
            unimplemented!("Expexected data._entities to contain elements");
        }
    } else {
        let mut results_to_merge = results_lock.write().unwrap();
        merge(&mut *results_to_merge, &data_received);
    }

    Ok(())
}

fn flatten_results_at_path<'request>(
    value: &'request mut serde_json::Value,
    path: &ResponsePath,
) -> &'request serde_json::Value {
    if path.is_empty() || value.is_null() {
        return value;
    }
    if let Some((current, rest)) = path.split_first() {
        if current == "@" {
            if value.is_array() {
                let array_value = value.as_array_mut().unwrap();

                *value = serde_json::Value::Array(
                    array_value
                        .iter_mut()
                        .map(|element| {
                            let result = flatten_results_at_path(element, &rest.to_owned());
                            result.to_owned()
                        })
                        .collect(),
                );

                return value;
            } else {
                return value;
            }
        } else {
            if value.get(&current).is_none() {
                return value;
            }
            let inner = value.get_mut(&current).unwrap();
            return flatten_results_at_path(inner, &rest.to_owned());
        }
    }

    value
}

pub fn execute_selection_set(
    source: &serde_json::Value,
    selections: &SelectionSet,
) -> serde_json::Value {
    if source.is_null() {
        return serde_json::Value::default();
    }

    let mut result: serde_json::Value = serde_json::from_str(r#"{}"#).unwrap();

    for selection in selections {
        match selection {
            Field(field) => {
                let response_name = match &field.alias {
                    Some(alias) => alias,
                    None => &field.name,
                };

                if let Some(response_value) = source.get(response_name) {
                    if response_value.is_array() {
                        let inner = response_value.as_array().unwrap();
                        result[response_name] = serde_json::Value::Array(
                            inner
                                .iter()
                                .map(|element| {
                                    if field.selections.is_some() {
                                        execute_selection_set(element, selections)
                                    } else {
                                        serde_json::to_value(element).unwrap()
                                    }
                                })
                                .collect(),
                        );
                    } else if field.selections.is_some() {
                        result[response_name] = execute_selection_set(
                            response_value,
                            &field.selections.as_ref().unwrap(),
                        );
                    } else {
                        result[response_name] = serde_json::to_value(response_value).unwrap();
                    }
                } else {
                    unimplemented!("Field was not found in response");
                }
            }
            InlineFragment(fragment) => {
                if fragment.type_condition.is_none() {
                    continue;
                }
                let typename = source.get("__typename");
                if typename.is_none() {
                    continue;
                }

                if typename.unwrap().as_str().unwrap() == fragment.type_condition.as_ref().unwrap()
                {
                    merge(
                        &mut result,
                        &execute_selection_set(source, &fragment.selections),
                    );
                }
            }
        }
    }

    result
}

