import { isNotNullOrUndefined } from './utilities/predicates';
import {
  DocumentNode,
  FragmentDefinitionNode,
  getNamedType,
  getOperationRootType,
  GraphQLCompositeType,
  GraphQLError,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLType,
  isAbstractType,
  isCompositeType,
  isIntrospectionType,
  isListType,
  isNamedType,
  isObjectType,
  Kind,
  OperationDefinitionNode,
  SelectionSetNode,
  TypeNameMetaFieldDef,
  VariableDefinitionNode,
  OperationTypeNode,
  print,
  stripIgnoredCharacters,
} from 'graphql';
import {
  Field,
  FieldSet,
  groupByResponseName,
  matchesField,
  selectionSetFromFieldSet,
  debugPrintField,
  debugPrintFields,
  groupByScope,
} from './FieldSet';
import {
  FetchNode,
  ParallelNode,
  PlanNode,
  SequenceNode,
  QueryPlan,
  ResponsePath,
  trimSelectionNodes,
} from './QueryPlan';
import { getResponseName } from './utilities/graphql';
import { MultiMap } from './utilities/MultiMap';
import {
  getFederationMetadataForType,
  getFederationMetadataForField,
} from './composedSchema';
import { DebugLogger } from './utilities/debug';
import { QueryPlanningContext } from './QueryPlanningContext';
import { Scope } from './Scope';

import deepEqual from 'deep-equal';

function stringIsTrue(str?: string) : boolean {
  if (!str) {
    return false;
  }
  switch (str.toLocaleLowerCase()) {
    case "true":
    case "yes":
    case "1":
      return true;
    default:
      return false;
  }
}

const debug = new DebugLogger(stringIsTrue(process.env.APOLLO_QP_DEBUG));

const typenameField = {
  kind: Kind.FIELD,
  name: {
    kind: Kind.NAME,
    value: TypeNameMetaFieldDef.name,
  },
};

export type OperationContext = {
  schema: GraphQLSchema;
  operation: OperationDefinitionNode;
  fragments: FragmentMap;
};

export type FragmentMap = { [fragmentName: string]: FragmentDefinitionNode };

export interface BuildQueryPlanOptions {
  autoFragmentization: boolean;
}

export function buildQueryPlan(
  operationContext: OperationContext,
  options: BuildQueryPlanOptions = { autoFragmentization: false },
): QueryPlan {
  const context = buildQueryPlanningContext(operationContext, options);

  if (context.operation.operation === 'subscription') {
    throw new GraphQLError(
      'Query planning does not support subscriptions for now.',
      [context.operation],
    );
  }

  const rootType = getOperationRootType(context.schema, context.operation);

  const isMutation = context.operation.operation === 'mutation';

  debug.log(() => `Building plan for ${isMutation ? "mutation" : "query"} "${rootType}" (fragments: [${Object.keys(context.fragments)}], autoFragmentization: ${context.autoFragmentization})`);

  debug.group(`Collecting root fields:`);
  const fields = context.collectFields(
    Scope.create(context, rootType),
    context.operation.selectionSet,
  );
  debug.groupEnd(`Collected root fields:`);
  debug.groupedValues(fields, debugPrintField);

  debug.group('Splitting root fields:');
  // Mutations are a bit more specific in how FetchGroups can be built, as some
  // calls to the same service may need to be executed serially.
  const groups = isMutation
    ? splitRootFieldsSerially(context, fields)
    : splitRootFields(context, fields);
  debug.groupEnd('Computed groups:');
  debug.groupedValues(groups, debugPrintGroup);

  const nodes = groups.map(group =>
    executionNodeForGroup(context, group, rootType),
  );

  return {
    kind: 'QueryPlan',
    node: nodes.length
      // if an operation is a mutation, we run the root fields in sequence,
      // otherwise we run them in parallel
      ? flatWrap(isMutation ? 'Sequence' : 'Parallel', nodes)
      : undefined,
  };
}

function executionNodeForGroup(
  context: QueryPlanningContext,
  {
    serviceName,
    fields,
    requiredFields,
    internalFragments,
    mergeAt,
    dependentGroups,
  }: FetchGroup,
  parentType?: GraphQLCompositeType,
): PlanNode {
  const selectionSet = selectionSetFromFieldSet(fields, parentType);
  const requires =
    requiredFields.length > 0
      ? selectionSetFromFieldSet(requiredFields)
      : undefined;
  const variableUsages = context.getVariableUsages(
    selectionSet,
    internalFragments,
  );

  const operation = requires
    ? operationForEntitiesFetch({
        selectionSet,
        variableUsages,
        internalFragments,
      })
    : operationForRootFetch({
        selectionSet,
        variableUsages,
        internalFragments,
        operation: context.operation.operation,
      });

  const fetchNode: FetchNode = {
    kind: 'Fetch',
    serviceName,
    requires: requires ? trimSelectionNodes(requires?.selections) : undefined,
    variableUsages: Object.keys(variableUsages),
    operation: stripIgnoredCharacters(print(operation)),
  };

  const node: PlanNode =
    mergeAt && mergeAt.length > 0
      ? {
          kind: 'Flatten',
          path: mergeAt,
          node: fetchNode,
        }
      : fetchNode;

  if (dependentGroups.length > 0) {
    const dependentNodes = dependentGroups.map(dependentGroup =>
      executionNodeForGroup(context, dependentGroup),
    );

    return flatWrap('Sequence', [node, flatWrap('Parallel', dependentNodes)]);
  } else {
    return node;
  }
}

interface VariableUsages {
  [name: string]: VariableDefinitionNode
}

function mapFetchNodeToVariableDefinitions(
  variableUsages: VariableUsages,
): VariableDefinitionNode[] {
  return variableUsages ? Object.values(variableUsages) : [];
}

function operationForRootFetch({
  selectionSet,
  variableUsages,
  internalFragments,
  operation = 'query',
}: {
  selectionSet: SelectionSetNode;
  variableUsages: VariableUsages;
  internalFragments: Set<FragmentDefinitionNode>;
  operation?: OperationTypeNode;
}): DocumentNode {
  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation,
        selectionSet,
        variableDefinitions: mapFetchNodeToVariableDefinitions(variableUsages),
      },
      ...internalFragments,
    ],
  };
}

function operationForEntitiesFetch({
  selectionSet,
  variableUsages,
  internalFragments,
}: {
  selectionSet: SelectionSetNode;
  variableUsages: VariableUsages;
  internalFragments: Set<FragmentDefinitionNode>;
}): DocumentNode {
  const representationsVariable = {
    kind: Kind.VARIABLE,
    name: { kind: Kind.NAME, value: 'representations' },
  };

  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: 'query',
        variableDefinitions: ([
          {
            kind: Kind.VARIABLE_DEFINITION,
            variable: representationsVariable,
            type: {
              kind: Kind.NON_NULL_TYPE,
              type: {
                kind: Kind.LIST_TYPE,
                type: {
                  kind: Kind.NON_NULL_TYPE,
                  type: {
                    kind: Kind.NAMED_TYPE,
                    name: { kind: Kind.NAME, value: '_Any' },
                  },
                },
              },
            },
          },
        ] as VariableDefinitionNode[]).concat(
          mapFetchNodeToVariableDefinitions(variableUsages),
        ),
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: '_entities' },
              arguments: [
                {
                  kind: Kind.ARGUMENT,
                  name: {
                    kind: Kind.NAME,
                    value: representationsVariable.name.value,
                  },
                  value: representationsVariable,
                },
              ],
              selectionSet,
            },
          ],
        },
      },
      ...internalFragments,
    ],
  };
}

// Wraps the given nodes in a ParallelNode or SequenceNode, unless there's only
// one node, in which case it is returned directly. Any nodes of the same kind
// in the given list have their sub-nodes flattened into the list: ie,
// flatWrap('Sequence', [a, flatWrap('Sequence', b, c), d]) returns a SequenceNode
// with four children.
function flatWrap(
  kind: ParallelNode['kind'] | SequenceNode['kind'],
  nodes: PlanNode[],
): PlanNode {
  if (nodes.length === 0) {
    throw Error('programming error: should always be called with nodes');
  }
  if (nodes.length === 1) {
    return nodes[0];
  }
  return {
    kind,
    nodes: nodes.flatMap(n => (n.kind === kind ? n.nodes : [n])),
  } as PlanNode;
}

function splitRootFields(
  context: QueryPlanningContext,
  fields: FieldSet,
): FetchGroup[] {
  const groupsByService: {
    [serviceName: string]: FetchGroup;
  } = Object.create(null);

  function groupForService(serviceName: string) {
    let group = groupsByService[serviceName];

    if (!group) {
      group = new FetchGroup(serviceName);
      groupsByService[serviceName] = group;
    }

    return group;
  }

  splitFields(context, [], fields, field => {
    const { scope, fieldNode, fieldDef } = field;
    const { parentType } = scope;

    // The root type is necessarily an object type.
    const owningService = context.getOwningService(parentType as GraphQLObjectType, fieldDef);

    if (!owningService) {
      throw new GraphQLError(
        `Couldn't find owning service for field "${parentType.name}.${fieldDef.name}"`,
        fieldNode,
      );
    }

    return groupForService(owningService);
  });

  return Object.values(groupsByService);
}

// For mutations, we need to respect the order of the fields, in order to
// determine which fields can be batched together in the same request. If
// they're "split" by fields belonging to other services, then we need to manage
// the proper sequencing at the gateway level. In this example, we need 3
// FetchGroups (requests) in sequence:
//
//    mutation abc {
//      createReview() # reviews service (1)
//      updateReview() # reviews service (1)
//      login() # account service (2)
//      deleteReview() # reviews service (3)
//    }
function splitRootFieldsSerially(
  context: QueryPlanningContext,
  fields: FieldSet,
): FetchGroup[] {
  const fetchGroups: FetchGroup[] = [];

  function groupForField(serviceName: string) {
    let group: FetchGroup;

    // If the most recent FetchGroup in the array belongs to the same service,
    // the field in question can be batched within that group.
    const previousGroup = fetchGroups[fetchGroups.length - 1];
    if (previousGroup && previousGroup.serviceName === serviceName) {
      return previousGroup;
    }

    // If there's no previous group, or the previous group is from a different
    // service, then we need to add a new FetchGroup.
    group = new FetchGroup(serviceName);
    fetchGroups.push(group);

    return group;
  }

  splitFields(context, [], fields, field => {
    const { scope, fieldNode, fieldDef } = field;
    const { parentType } = scope;

    // The root type is necessarily an object type.
    const owningService = context.getOwningService(parentType as GraphQLObjectType, fieldDef);

    if (!owningService) {
      throw new GraphQLError(
        `Couldn't find owning service for field "${parentType.name}.${fieldDef.name}"`,
        fieldNode,
      );
    }

    return groupForField(owningService);
  });

  return fetchGroups;
}

function splitSubfields(
  context: QueryPlanningContext,
  path: ResponsePath,
  fields: FieldSet,
  parentGroup: FetchGroup,
) {
  splitFields(context, path, fields, field => {
    const { scope, fieldNode, fieldDef } = field;
    const { parentType } = scope;

    let baseService, owningService;

    // Committed by @trevor-scheer but authored by @martijnwalraven
    // Treat abstract types as value types to replicate type explosion fix
    // XXX: this replicates the behavior of the Rust query planner implementation,
    // in order to get the tests passing before making further changes. But the
    // type explosion fix this depends on is fundamentally flawed and needs to
    // be replaced.
    if (!isObjectType(parentType) || getFederationMetadataForType(parentType)?.isValueType) {
      baseService = parentGroup.serviceName;
      owningService = parentGroup.serviceName;
    } else {
      baseService = context.getBaseService(parentType);
      owningService = context.getOwningService(parentType, fieldDef);
    }

    if (!baseService) {
      throw new GraphQLError(
        `Couldn't find base service for type "${parentType.name}"`,
        fieldNode,
      );
    }

    if (!owningService) {
      throw new GraphQLError(
        `Couldn't find owning service for field "${parentType.name}.${fieldDef.name}"`,
        fieldNode,
      );
    }
    // Is the field defined on the base service?
    if (owningService === baseService) {
      // Can we fetch the field from the parent group?
      if (
        owningService === parentGroup.serviceName ||
        parentGroup.providedFields.some(matchesField(field))
      ) {
        return parentGroup;
      } else {
        // We need to fetch the key fields from the parent group first, and then
        // use a dependent fetch from the owning service.
        let keyFields = context.getKeyFields(scope, parentGroup.serviceName);
        if (
          keyFields.length === 0 ||
          (keyFields.length === 1 &&
            keyFields[0].fieldDef.name === '__typename')
        ) {
          // Only __typename key found.
          // In some cases, the parent group does not have any @key directives.
          // Fall back to owning group's keys
          keyFields = context.getKeyFields(scope, owningService);
        }
        return parentGroup.dependentGroupForService(owningService, keyFields);
      }
    } else {
      // It's an extension field, so we need to fetch the required fields first.
      const requiredFields = context.getRequiredFields(
        scope,
        fieldDef,
        owningService,
      );

      // Can we fetch the required fields from the parent group?
      if (
        requiredFields.every(requiredField =>
          parentGroup.providedFields.some(matchesField(requiredField)),
        )
      ) {
        if (owningService === parentGroup.serviceName) {
          return parentGroup;
        } else {
          return parentGroup.dependentGroupForService(
            owningService,
            requiredFields,
          );
        }
      } else {
        // We need to go through the base group first.

        const keyFields = context.getKeyFields(scope, parentGroup.serviceName);

        if (!keyFields) {
          throw new GraphQLError(
            `Couldn't find keys for type "${parentType.name}}" in service "${baseService}"`,
            fieldNode,
          );
        }

        if (baseService === parentGroup.serviceName) {
          return parentGroup.dependentGroupForService(
            owningService,
            requiredFields,
          );
        }

        const baseGroup = parentGroup.dependentGroupForService(
          baseService,
          keyFields,
        );

        return baseGroup.dependentGroupForService(
          owningService,
          requiredFields,
        );
      }
    }
  });
}

function splitFields(
  context: QueryPlanningContext,
  path: ResponsePath,
  fields: FieldSet,
  groupForField: (field: Field) => FetchGroup,
) {
  for (const fieldsForResponseName of groupByResponseName(fields).values()) {
    for (const fieldsForScope of groupByScope(fieldsForResponseName).values()) {
      // Field nodes that share the same response name and scope are guaranteed to have the same field name and
      // arguments. We only need the other nodes when merging selection sets, to take node-specific subfields and
      // directives into account.

      debug.group(() => debugPrintFields(fieldsForScope));

      // All the fields in fieldsForScope have the same scope, so that means the same parent type and possible runtime
      // types, so we effectively can just use the first one and ignore the rest.
      const field = fieldsForScope[0];
      const { scope, fieldDef } = field;
      const parentType = scope.parentType;

      // We skip `__typename` for root types.
      if (fieldDef.name === TypeNameMetaFieldDef.name) {
        const { schema } = context;
        const roots = [
          schema.getQueryType(),
          schema.getMutationType(),
          schema.getSubscriptionType(),
        ]
          .filter(isNotNullOrUndefined)
          .map(type => type.name);
        if (roots.indexOf(parentType.name) > -1) {
          debug.groupEnd("Skipping __typename for root types");
          continue;
        }
      }

      // We skip introspection fields like `__schema` and `__type`.
      if (isIntrospectionType(getNamedType(fieldDef.type))) {
        debug.groupEnd(`Skipping introspection type ${fieldDef.type}`);
        continue;
      }

      if (isObjectType(parentType) && scope.possibleRuntimeTypes().includes(parentType)) {
        // If parent type is an object type, we can directly look for the right
        // group.
        debug.log(() => `${parentType} = object and ${parentType} ∈ [${scope.possibleRuntimeTypes()}]`);
        const group = groupForField(field);
        debug.log(() => `Initial fetch group for fields: ${debugPrintGroup(group)}`);
        group.fields.push(completeField(context, scope, group, path, fieldsForScope));
        debug.groupEnd(() => `Updated fetch group: ${debugPrintGroup(group)}`);
      } else {
        debug.log(() => `${parentType} ≠ object or ${parentType} ∉ [${scope.possibleRuntimeTypes()}]`);
        // For interfaces however, we need to look at all possible runtime types.

        /**
         * The following is an optimization to prevent an explosion of type
         * conditions to services when it isn't needed. If all possible runtime
         * types can be fufilled by only one service then we don't need to
         * expand the fields into unique type conditions.
         */

        // Collect all of the field defs on the possible runtime types
        const possibleFieldDefs = scope.possibleRuntimeTypes().map(
          runtimeType => context.getFieldDef(runtimeType, field.fieldNode),
        );

        // If none of the field defs have a federation property, this interface's
        // implementors can all be resolved within the same service.
        const hasNoExtendingFieldDefs = !possibleFieldDefs.some(
          (field) => getFederationMetadataForField(field)?.graphName,
        );

        // With no extending field definitions, we can engage the optimization
        if (hasNoExtendingFieldDefs) {
          debug.group(() => `No field of ${scope.possibleRuntimeTypes()} have federation directives, avoid type explosion.`);
          const group = groupForField(field);
          debug.groupEnd(() => `Initial fetch group for fields: ${debugPrintGroup(group)}`);
          group.fields.push(completeField(context, scope, group, path, fieldsForScope));
          debug.groupEnd(() => `Updated fetch group: ${debugPrintGroup(group)}`);
          continue;
        }

        // We keep track of which possible runtime parent types can be fetched
        // from which group,
        const groupsByRuntimeParentTypes = new MultiMap<
          FetchGroup,
          GraphQLObjectType
        >();

        debug.group('Computing fetch groups by runtime parent types');
        for (const runtimeParentType of scope.possibleRuntimeTypes()) {
          const fieldDef = context.getFieldDef(
            runtimeParentType,
            field.fieldNode,
          );
          groupsByRuntimeParentTypes.add(
            groupForField({
              scope: scope.refine(runtimeParentType),
              fieldNode: field.fieldNode,
              fieldDef,
            }),
            runtimeParentType,
          );
        }
        debug.groupEnd(`Fetch groups to resolvable runtime types:`);
        debug.groupedEntries(groupsByRuntimeParentTypes, debugPrintGroup, (v) => v.toString());

        debug.group('Iterating on fetch groups');
        // We add the field separately for each runtime parent type.
        for (const [group, runtimeParentTypes] of groupsByRuntimeParentTypes) {
          debug.group(() => `For initial fetch group ${debugPrintGroup(group)}:`);
          for (const runtimeParentType of runtimeParentTypes) {
            // We need to adjust the fields to contain the right fieldDef for
            // their runtime parent type.
            debug.group(`For runtime parent type ${runtimeParentType}:`);

            const fieldDef = context.getFieldDef(
              runtimeParentType,
              field.fieldNode,
            );

            const fieldsWithRuntimeParentType = fieldsForScope.map(field => ({
              ...field,
              fieldDef,
            }));

            if (shouldIncludeToFetchGroup(group, fieldsWithRuntimeParentType, context, runtimeParentType)) {
              group.fields.push(
                completeField(
                  context,
                  scope.refine(runtimeParentType),
                  group,
                  path,
                  fieldsWithRuntimeParentType,
                ),
              );
              debug.groupEnd(() => `Updated fetch group: ${debugPrintGroup(group)}`);
            }
          }
          debug.groupEnd();
        }
        debug.groupEnd(); // Group started before the immediate for loop

        debug.groupEnd(); // Group started at the beginning of this 'top-level' iteration.
      }
    }
  }
}

function shouldIncludeToFetchGroup(
  group: FetchGroup,
  fields: FieldSet,
  context: QueryPlanningContext,
  runtimeParentType: GraphQLObjectType
  ): Boolean {
  const { fieldDef } = fields[0];
  const returnType = getNamedType(fieldDef.type);

  if (isCompositeType(returnType)) {
    return true;
  }

  const owningService = context.getOwningService(runtimeParentType, fieldDef);

  return owningService === group.serviceName || group.providedFields.some(f => f.fieldDef === fields[0].fieldDef)
}

function completeField(
  context: QueryPlanningContext,
  scope: Scope,
  parentGroup: FetchGroup,
  path: ResponsePath,
  fields: FieldSet,
): Field {
  const { fieldNode, fieldDef } = fields[0];
  const returnType = getNamedType(fieldDef.type);

  if (!isCompositeType(returnType)) {
    // FIXME: We should look at all field nodes to make sure we take directives
    // into account (or remove directives for the time being).
    return { scope, fieldNode, fieldDef };
  } else {
    // For composite types, we need to recurse.

    const fieldPath = addPath(path, getResponseName(fieldNode), fieldDef.type);

    const subGroup = new FetchGroup(parentGroup.serviceName);
    subGroup.mergeAt = fieldPath;

    subGroup.providedFields = context.getProvidedFields(
      fieldDef,
      parentGroup.serviceName,
    );

    // For abstract types, we always need to request `__typename`
    if (isAbstractType(returnType)) {
      subGroup.fields.push({
        scope: Scope.create(context, returnType),
        fieldNode: typenameField,
        fieldDef: TypeNameMetaFieldDef,
      });
    }

    const subfields = collectSubfields(context, returnType, fields);
    debug.group(() => `Splitting collected sub-fields (${debugPrintFields(subfields)})`);
    splitSubfields(context, fieldPath, subfields, subGroup);
    debug.groupEnd();

    // Because of the way we split fields, we may have created multiple
    // dependent groups to the same subgraph for the same path. We therefore
    // attempt to merge dependent groups of the subgroup and of the parent group
    // to avoid duplicate fetches.
    parentGroup.mergeDependentGroups(subGroup);

    let definition: FragmentDefinitionNode;
    let selectionSet = selectionSetFromFieldSet(subGroup.fields, returnType);

    if (context.autoFragmentization && subGroup.fields.length > 2) {
      ({ definition, selectionSet } = getInternalFragment(
        selectionSet,
        returnType,
        context,
      ));
      parentGroup.internalFragments.add(definition);
    }

    // "Hoist" internalFragments of the subGroup into the parentGroup so all
    // fragments can be included in the final request for the root FetchGroup
    subGroup.internalFragments.forEach(fragment => {
      parentGroup.internalFragments.add(fragment);
    });

    return {
      scope,
      fieldNode: {
        ...fieldNode,
        selectionSet,
      },
      fieldDef,
    };
  }
}

function getInternalFragment(
  selectionSet: SelectionSetNode,
  returnType: GraphQLCompositeType,
  context: QueryPlanningContext
) {
  const key = JSON.stringify(selectionSet);
  if (!context.internalFragments.has(key)) {
    const name = `__QueryPlanFragment_${context.internalFragmentCount++}__`;

    const definition: FragmentDefinitionNode = {
      kind: Kind.FRAGMENT_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: name,
      },
      typeCondition: {
        kind: Kind.NAMED_TYPE,
        name: {
          kind: Kind.NAME,
          value: returnType.name,
        },
      },
      selectionSet,
    };

    const fragmentSelection: SelectionSetNode = {
      kind: Kind.SELECTION_SET,
      selections: [
        {
          kind: Kind.FRAGMENT_SPREAD,
          name: {
            kind: Kind.NAME,
            value: name,
          },
        },
      ],
    };

    context.internalFragments.set(key, {
      name,
      definition,
      selectionSet: fragmentSelection,
    });
  }

  return context.internalFragments.get(key)!;
}

// Collecting subfields collapses parent types, because it merges
// selection sets without taking the runtime parent type of the field
// into account. If we want to keep track of multiple levels of possible
// types, this is where that would need to happen.
export function collectSubfields(
  context: QueryPlanningContext,
  returnType: GraphQLCompositeType,
  fields: FieldSet,
): FieldSet {
  let subfields: FieldSet = [];

  for (const field of fields) {
    const selectionSet = field.fieldNode.selectionSet;

    if (selectionSet) {
      subfields = context.collectFields(
        Scope.create(context, returnType),
        selectionSet,
        subfields,
      );
    }
  }

  return subfields;
}

class FetchGroup {
  constructor(
    public readonly serviceName: string,
    public readonly fields: FieldSet = [],
    public readonly internalFragments: Set<FragmentDefinitionNode> = new Set()
  ) {}

  requiredFields: FieldSet = [];
  providedFields: FieldSet = [];

  mergeAt?: ResponsePath;

  private dependentGroupsByService: {
    [serviceName: string]: FetchGroup;
  } = Object.create(null);
  public otherDependentGroups: FetchGroup[] = [];

  dependentGroupForService(serviceName: string, requiredFields: FieldSet) {
    let group = this.dependentGroupsByService[serviceName];

    if (!group) {
      group = new FetchGroup(serviceName);
      group.mergeAt = this.mergeAt;
      this.dependentGroupsByService[serviceName] = group;
    }

    if (requiredFields) {
      if (group.requiredFields) {
        group.requiredFields.push(...requiredFields);
      } else {
        group.requiredFields = requiredFields;
      }
      this.fields.push(...requiredFields);
    }

    return group;
  }

  get dependentGroups(): FetchGroup[] {
    return [
      ...Object.values(this.dependentGroupsByService),
      ...this.otherDependentGroups,
    ];
  }

  mergeDependentGroups(that: FetchGroup) {
    for (const dependentGroup of that.dependentGroups) {
      // In order to avoid duplicate fetches, we try to find existing dependent
      // groups with the same service and merge path first.
      const existingDependentGroup = this.dependentGroups.find(
        (group) =>
          group.serviceName === dependentGroup.serviceName &&
          deepEqual(group.mergeAt, dependentGroup.mergeAt),
      );
      if (existingDependentGroup) {
        existingDependentGroup.merge(dependentGroup);
      } else {
        this.otherDependentGroups.push(dependentGroup);
      }
    }
  }

  merge(otherGroup: FetchGroup) {
    this.fields.push(...otherGroup.fields);
    this.requiredFields.push(...otherGroup.requiredFields);
    this.providedFields.push(...otherGroup.providedFields);
    this.mergeDependentGroups(otherGroup);
  }
}

// Provides a string representation of a `FetchGroup` suitable for debugging.
function debugPrintGroup(group: FetchGroup): string {
  let str = `Fetch(${group.serviceName}, ${debugPrintFields(group.fields)}`;
  if (group.dependentGroups.length !== 0) {
    str += `, deps: ${debugPrintGroups(group.dependentGroups)}`
  }
  return str + ')';
}

// Provides a string representation of an array of `FetchGroup` suitable for debugging.
function debugPrintGroups(groups: FetchGroup[]): string {
  return '[' +  groups.map(debugPrintGroup).join(', ') + ']'
}

// Adapted from buildExecutionContext in graphql-js
export function buildOperationContext(
  schema: GraphQLSchema,
  document: DocumentNode,
  operationName?: string,
): OperationContext {
  let operation: OperationDefinitionNode | undefined;
  const fragments: {
    [fragmentName: string]: FragmentDefinitionNode;
  } = Object.create(null);
  document.definitions.forEach(definition => {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        if (!operationName && operation) {
          throw new GraphQLError(
            'Must provide operation name if query contains ' +
              'multiple operations.',
          );
        }
        if (
          !operationName ||
          (definition.name && definition.name.value === operationName)
        ) {
          operation = definition;
        }
        break;
      case Kind.FRAGMENT_DEFINITION:
        fragments[definition.name.value] = definition;
        break;
    }
  });
  if (!operation) {
    if (operationName) {
      throw new GraphQLError(`Unknown operation named "${operationName}".`);
    } else {
      throw new GraphQLError('Must provide an operation.');
    }
  }

  return { schema, operation, fragments };
}

export function buildQueryPlanningContext(
  { operation, schema, fragments }: OperationContext,
  options: BuildQueryPlanOptions,
): QueryPlanningContext {
  return new QueryPlanningContext(
    schema,
    operation,
    fragments,
    options.autoFragmentization,
  );
}

function addPath(path: ResponsePath, responseName: string, type: GraphQLType) {
  path = [...path, responseName];

  while (!isNamedType(type)) {
    if (isListType(type)) {
      path.push('@');
    }

    type = type.ofType;
  }

  return path;
}
