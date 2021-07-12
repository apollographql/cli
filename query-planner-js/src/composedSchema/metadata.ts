import { FieldNode, InlineFragmentNode, GraphQLField, GraphQLObjectType, DirectiveNode } from 'graphql';
import { MultiMap } from '../utilities/MultiMap';

declare module 'graphql' {
  interface GraphQLSchemaExtensions {
    federation?: FederationSchemaMetadata;
  }

  interface GraphQLObjectTypeExtensions {
    federation?: FederationTypeMetadata;
  }

  interface GraphQLFieldExtensions<
    _TSource,
    _TContext,
    _TArgs = { [argName: string]: any }
  > {
    federation?: FederationFieldMetadata;
  }
}

export function getFederationMetadataForType(
  type: GraphQLObjectType,
): FederationTypeMetadata | undefined {
  return type.extensions?.federation;
}

export function getFederationMetadataForField(
  field: GraphQLField<any, any>,
): FederationFieldMetadata | undefined {
  return field.extensions?.federation;
}

export type GraphName = string;

// Without rewriting a number of AST types from graphql-js, this typing is
// technically too relaxed. Recursive selections are not excluded from containing
// FragmentSpreads, which is what this type is aiming to achieve (and accomplishes
// at the root level, but not recursively)
export type FieldSet = readonly (FieldNode | InlineFragmentNode)[];

export interface Graph {
  name: string;
  url: string;
}

export type GraphMap = Map<string, Graph>;
export interface FederationSchemaMetadata {
  graphs: GraphMap;
}

export type FederationTypeMetadata =
  | FederationEntityTypeMetadata
  | FederationValueTypeMetadata;

export interface FederationEntityTypeMetadata {
  graphName: GraphName;
  keys: MultiMap<GraphName, FieldSet>,
  isValueType: false;
}

interface FederationValueTypeMetadata {
  isValueType: true;
}

export function isEntityTypeMetadata(
  metadata: FederationTypeMetadata,
): metadata is FederationEntityTypeMetadata {
  return !metadata.isValueType;
}

export interface FederationFieldMetadata {
  graphName?: GraphName;
  requires?: FieldSet;
  provides?: FieldSet;
  otherKnownDirectives?: DirectiveNode[];
}
