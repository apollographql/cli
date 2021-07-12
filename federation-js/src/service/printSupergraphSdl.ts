import {
  GraphQLSchema,
  isSpecifiedDirective,
  isIntrospectionType,
  isSpecifiedScalarType,
  GraphQLNamedType,
  GraphQLDirective,
  isScalarType,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isEnumType,
  isInputObjectType,
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLArgument,
  GraphQLInputField,
  astFromValue,
  print,
  GraphQLField,
  GraphQLEnumValue,
  GraphQLString,
  DEFAULT_DEPRECATION_REASON,
  SelectionNode,
  DirectiveNode,
} from 'graphql';
import { Maybe, FederationType, FederationField, ServiceDefinition } from '../composition';
import { assert } from '../utilities';
import { CoreDirective } from '../coreSpec';
import { getJoinDefinitions } from '../joinSpec';
import { printFieldSet } from '../composition/utils';
import { otherKnownDirectives } from '../directives';

type Options = {
  /**
   * Descriptions are defined as preceding string literals, however an older
   * experimental version of the SDL supported preceding comments as
   * descriptions. Set to true to enable this deprecated behavior.
   * This option is provided to ease adoption and will be removed in v16.
   *
   * Default: false
   */
  commentDescriptions?: boolean;
};

interface PrintingContext {
  // Core addition: we need access to a map from serviceName to its corresponding
  // sanitized / uniquified enum value `Name` from the `join__Graph` enum
  graphNameToEnumValueName?: Record<string, string>;
}

/**
 * Accepts options as an optional third argument:
 *
 *    - commentDescriptions:
 *        Provide true to use preceding comments as the description.
 *
 */
// Core change: we need service and url information for the join__Graph enum
export function printSupergraphSdl(
  schema: GraphQLSchema,
  serviceList: ServiceDefinition[],
  options?: Options,
): string {
  const config = schema.toConfig();

  const {
    FieldSetScalar,
    JoinFieldDirective,
    JoinTypeDirective,
    JoinOwnerDirective,
    JoinGraphEnum,
    JoinGraphDirective,
    graphNameToEnumValueName,
  } = getJoinDefinitions(serviceList);

  schema = new GraphQLSchema({
    ...config,
    directives: [
      CoreDirective,
      JoinFieldDirective,
      JoinTypeDirective,
      JoinOwnerDirective,
      JoinGraphDirective,
      ...config.directives,
    ],
    types: [FieldSetScalar, JoinGraphEnum, ...config.types],
  });

  const context: PrintingContext = {
    graphNameToEnumValueName,
  }

  return printFilteredSchema(
    schema,
    (n) => !isSpecifiedDirective(n),
    isDefinedType,
    context,
    options,
  );
}

export function printIntrospectionSchema(
  schema: GraphQLSchema,
  options?: Options,
): string {
  return printFilteredSchema(
    schema,
    isSpecifiedDirective,
    isIntrospectionType,
    {},
    options,
  );
}

function isDefinedType(type: GraphQLNamedType): boolean {
  return !isSpecifiedScalarType(type) && !isIntrospectionType(type);
}

function printFilteredSchema(
  schema: GraphQLSchema,
  directiveFilter: (type: GraphQLDirective) => boolean,
  typeFilter: (type: GraphQLNamedType) => boolean,
  // Core addition - see `PrintingContext` type for details
  context: PrintingContext,
  options?: Options,
): string {
  const directives = schema.getDirectives().filter(directiveFilter);
  const types = Object.values(schema.getTypeMap())
    .sort((type1, type2) => type1.name.localeCompare(type2.name))
    .filter(typeFilter);

  return (
    [printSchemaDefinition(schema)]
      .concat(
        directives.map((directive) => printDirective(directive, options)),
        types.map((type) => printType(type, context, options)),
      )
      .filter(Boolean)
      .join('\n\n') + '\n'
  );
}

function printSchemaDefinition(schema: GraphQLSchema): string {
  const operationTypes = [];

  const queryType = schema.getQueryType();
  if (queryType) {
    operationTypes.push(`  query: ${queryType.name}`);
  }

  const mutationType = schema.getMutationType();
  if (mutationType) {
    operationTypes.push(`  mutation: ${mutationType.name}`);
  }

  const subscriptionType = schema.getSubscriptionType();
  if (subscriptionType) {
    operationTypes.push(`  subscription: ${subscriptionType.name}`);
  }

  return (
    'schema' +
    // Core change: print @core directive usages on schema node
    printCoreDirectives(schema) +
    `\n{\n${operationTypes.join('\n')}\n}`
  );
}

function printCoreDirectives(schema: GraphQLSchema) {
  const otherKnownDirectiveNames = otherKnownDirectives.map(({ name }) => name);
  const schemaDirectiveNames = schema.getDirectives().map(({ name }) => name);
  const otherKnownDirectivesToInclude = schemaDirectiveNames.filter((name) =>
    otherKnownDirectiveNames.includes(name),
  );
  const otherKnownDirectivesSpecUrls = otherKnownDirectivesToInclude.map(
    (name) => `https://specs.apollo.dev/${name}/v0.1`,
  );

  return [
    'https://specs.apollo.dev/core/v0.1',
    'https://specs.apollo.dev/join/v0.1',
    ...otherKnownDirectivesSpecUrls,
  ].map((feature) => `\n  @core(feature: ${printStringLiteral(feature)})`);
}

export function printType(
  type: GraphQLNamedType,
  // Core addition - see `PrintingContext` type for details
  context: PrintingContext,
  options?: Options,
): string {
  if (isScalarType(type)) {
    return printScalar(type, options);
  } else if (isObjectType(type)) {
    return printObject(type, context, options);
  } else if (isInterfaceType(type)) {
    return printInterface(type, context, options);
  } else if (isUnionType(type)) {
    return printUnion(type, options);
  } else if (isEnumType(type)) {
    return printEnum(type, options);
  } else if (isInputObjectType(type)) {
    return printInputObject(type, options);
  }

  throw Error('Unexpected type: ' + (type as GraphQLNamedType).toString());
}

function printScalar(type: GraphQLScalarType, options?: Options): string {
  return printDescription(options, type) + `scalar ${type.name}`;
}

function printObject(
  type: GraphQLObjectType,
  // Core addition - see `PrintingContext` type for details
  context: PrintingContext,
  options?: Options,
): string {
  const interfaces = type.getInterfaces();
  const implementedInterfaces = interfaces.length
    ? ' implements ' + interfaces.map((i) => i.name).join(' & ')
    : '';

  return (
    printDescription(options, type) +
    `type ${type.name}` +
    implementedInterfaces +
    // Core addition for printing @join__owner and @join__type usages
    printTypeJoinDirectives(type, context) +
    printFields(options, type, context)
  );
}

// Core change: print @join__owner and @join__type usages
function printTypeJoinDirectives(
  type: GraphQLObjectType | GraphQLInterfaceType,
  // Core addition - see `PrintingContext` type for details
  context: PrintingContext,
): string {
  const metadata: FederationType = type.extensions?.federation;
  if (!metadata) return '';

  const { serviceName: ownerService, keys } = metadata;
  if (!ownerService || !keys) return '';

  // Separate owner @keys from the rest of the @keys so we can print them
  // adjacent to the @owner directive.
  const { [ownerService]: ownerKeys = [], ...restKeys } = keys;
  const ownerEntry: [string, (readonly SelectionNode[])[]] = [
    ownerService,
    ownerKeys,
  ];
  const restEntries = Object.entries(restKeys);

  // We don't want to print an owner for interface types
  const shouldPrintOwner = isObjectType(type);

  const ownerGraphEnumValue = context.graphNameToEnumValueName?.[ownerService];
  assert(
    ownerGraphEnumValue,
    `Unexpected enum value missing for subgraph ${ownerService}`,
  );
  const joinOwnerString = shouldPrintOwner
    ? `\n  @join__owner(graph: ${ownerGraphEnumValue})`
    : '';

  return (
    joinOwnerString +
    [ownerEntry, ...restEntries]
      .map(([service, keys = []]) =>
        keys
          .map((selections) => {
            const typeGraphEnumValue =
              context.graphNameToEnumValueName?.[service];
            assert(
              typeGraphEnumValue,
              `Unexpected enum value missing for subgraph ${service}`,
            );
            return `\n  @join__type(graph: ${typeGraphEnumValue}, key: ${printStringLiteral(
              printFieldSet(selections),
            )})`;
          })
          .join(''),
      )
      .join('')
  );
}

function printInterface(
  type: GraphQLInterfaceType,
  // Core addition - see `PrintingContext` type for details
  context: PrintingContext,
  options?: Options,
): string {
  return (
    printDescription(options, type) +
    `interface ${type.name}` +
    // Core addition for printing @join__owner and @join__type usages
    printTypeJoinDirectives(type, context) +
    printFields(options, type, context)
  );
}

function printUnion(type: GraphQLUnionType, options?: Options): string {
  const types = type.getTypes();
  const possibleTypes = types.length ? ' = ' + types.join(' | ') : '';
  return printDescription(options, type) + 'union ' + type.name + possibleTypes;
}

function printEnum(type: GraphQLEnumType, options?: Options): string {
  const values = type
    .getValues()
    .map(
      (value, i) =>
        printDescription(options, value, '  ', !i) +
        '  ' +
        value.name +
        printDeprecated(value) +
        printDirectivesOnEnumValue(type, value),
    );

  return (
    printDescription(options, type) + `enum ${type.name}` + printBlock(values)
  );
}

function printDirectivesOnEnumValue(type: GraphQLEnumType, value: GraphQLEnumValue) {
  if (type.name === "join__Graph") {
    return ` @join__graph(name: ${printStringLiteral((value.value.name))} url: ${printStringLiteral(value.value.url ?? '')})`
  }
  return '';
}

function printInputObject(
  type: GraphQLInputObjectType,
  options?: Options,
): string {
  const fields = Object.values(type.getFields()).map(
    (f, i) =>
      printDescription(options, f, '  ', !i) + '  ' + printInputValue(f),
  );
  return (
    printDescription(options, type) + `input ${type.name}` + printBlock(fields)
  );
}

function printFields(
  options: Options | undefined,
  type: GraphQLObjectType | GraphQLInterfaceType,
  // Core addition - see `PrintingContext` type for details
  context: PrintingContext,
) {
  const fields = Object.values(type.getFields()).map(
    (f, i) =>
      printDescription(options, f, '  ', !i) +
      '  ' +
      f.name +
      printArgs(options, f.args, '  ') +
      ': ' +
      String(f.type) +
      printDeprecated(f) +
      // We don't want to print field owner directives on fields belonging to an interface type
      (isObjectType(type)
        ? printJoinFieldDirectives(f, type, context) +
          printOtherKnownDirectives(f)
        : ''),
  );

  // Core change: for entities, we want to print the block on a new line.
  // This is just a formatting nice-to-have.
  const isEntity = Boolean(type.extensions?.federation?.keys);

  return printBlock(fields, isEntity);
}

/**
 * Core change: print @join__field directives
 *
 * @param field
 * @param parentType
 */
function printJoinFieldDirectives(
  field: GraphQLField<any, any>,
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  // Core addition - see `PrintingContext` type for details
  context: PrintingContext,
): string {
  const directiveArgs: string[] = [];

  const fieldMetadata: FederationField | undefined =
    field.extensions?.federation;

  let serviceName = fieldMetadata?.serviceName;

  // For entities (which we detect through the existence of `keys`),
  // although the join spec doesn't currently require `@join__field(graph:)` when
  // a field can be resolved from the owning service, the code we used
  // previously did include it in those cases. And especially since we want to
  // remove type ownership, I think it makes to keep the same behavior.
  if (!serviceName && parentType.extensions?.federation.keys) {
    serviceName = parentType.extensions?.federation.serviceName;
  }

  if (serviceName) {
    const enumValue = context.graphNameToEnumValueName?.[serviceName];
    assert(
      enumValue,
      `Unexpected enum value missing for subgraph ${serviceName}`,
    );

    directiveArgs.push(`graph: ${enumValue}`);
  }

  const requires = fieldMetadata?.requires;

  if (requires && requires.length > 0) {
    directiveArgs.push(
      `requires: ${printStringLiteral(printFieldSet(requires))}`,
    );
  }

  const provides = fieldMetadata?.provides;

  if (provides && provides.length > 0) {
    directiveArgs.push(
      `provides: ${printStringLiteral(printFieldSet(provides))}`,
    );
  }

  // A directive without arguments isn't valid (nor useful).
  if (directiveArgs.length < 1) return '';

  return ` @join__field(${directiveArgs.join(', ')})`;
}

// Core addition: print `@tag` and `@inaccessible` directives found in subgraph
// SDL into the supergraph SDL
function printOtherKnownDirectives(field: GraphQLField<any, any>) {
  const otherKnownDirectives = (
    field.extensions?.federation?.otherKnownDirectives ?? []
  ) as DirectiveNode[];

  if (otherKnownDirectives.length < 1) return '';
  return ` ${otherKnownDirectives
    .slice()
    .sort((a, b) => a.name.value.localeCompare(b.name.value))
    .map(print)
    .join(' ')}`;
};

// Core change: `onNewLine` is a formatting nice-to-have for printing
// types that have a list of directives attached, i.e. an entity.
function printBlock(items: string[], onNewLine?: boolean) {
  return items.length !== 0
    ? onNewLine
      ? '\n{\n' + items.join('\n') + '\n}'
      : ' {\n' + items.join('\n') + '\n}'
    : '';
}

function printArgs(
  options: Options | undefined,
  args: GraphQLArgument[],
  indentation = '',
) {
  if (args.length === 0) {
    return '';
  }

  // If every arg does not have a description, print them on one line.
  if (args.every((arg) => !arg.description)) {
    return '(' + args.map(printInputValue).join(', ') + ')';
  }

  return (
    '(\n' +
    args
      .map(
        (arg, i) =>
          printDescription(options, arg, '  ' + indentation, !i) +
          '  ' +
          indentation +
          printInputValue(arg),
      )
      .join('\n') +
    '\n' +
    indentation +
    ')'
  );
}

function printInputValue(arg: GraphQLInputField) {
  const defaultAST = astFromValue(arg.defaultValue, arg.type);
  let argDecl = arg.name + ': ' + String(arg.type);
  if (defaultAST) {
    argDecl += ` = ${print(defaultAST)}`;
  }
  return argDecl;
}

function printDirective(directive: GraphQLDirective, options?: Options) {
  return (
    printDescription(options, directive) +
    'directive @' +
    directive.name +
    printArgs(options, directive.args) +
    (directive.isRepeatable ? ' repeatable' : '') +
    ' on ' +
    directive.locations.join(' | ')
  );
}

function printDeprecated(
  fieldOrEnumVal: GraphQLField<any, any> | GraphQLEnumValue,
) {
  if (!fieldOrEnumVal.isDeprecated) {
    return '';
  }
  const reason = fieldOrEnumVal.deprecationReason;
  const reasonAST = astFromValue(reason, GraphQLString);
  if (reasonAST && reason !== DEFAULT_DEPRECATION_REASON) {
    return ' @deprecated(reason: ' + print(reasonAST) + ')';
  }
  return ' @deprecated';
}

function printDescription<T extends { description?: Maybe<string> }>(
  options: Options | undefined,
  def: T,
  indentation = '',
  firstInBlock = true,
): string {
  const { description } = def;
  if (description == null) {
    return '';
  }

  if (options?.commentDescriptions === true) {
    return printDescriptionWithComments(description, indentation, firstInBlock);
  }

  const preferMultipleLines = description.length > 70;
  const blockString = printBlockString(description, '', preferMultipleLines);
  const prefix =
    indentation && !firstInBlock ? '\n' + indentation : indentation;

  return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
}

function printDescriptionWithComments(
  description: string,
  indentation: string,
  firstInBlock: boolean,
) {
  const prefix = indentation && !firstInBlock ? '\n' : '';
  const comment = description
    .split('\n')
    .map((line) => indentation + (line !== '' ? '# ' + line : '#'))
    .join('\n');

  return prefix + comment + '\n';
}

// Using JSON.stringify ensures that we will generate a valid string literal,
// escaping quote marks, backslashes, etc. when needed.
// The `graphql-js` printer also does this when printing out a `StringValue`:
// https://github.com/graphql/graphql-js/blob/d4bcde8d3e7a7cb8462044ff21122a3996af8655/src/language/printer.js#L109-L112
function printStringLiteral(value: string) {
  return JSON.stringify(value);
}

/**
 * Print a block string in the indented block form by adding a leading and
 * trailing blank line. However, if a block string starts with whitespace and is
 * a single-line, adding a leading blank line would strip that whitespace.
 *
 * @internal
 */
export function printBlockString(
  value: string,
  indentation: string = '',
  preferMultipleLines: boolean = false,
): string {
  const isSingleLine = value.indexOf('\n') === -1;
  const hasLeadingSpace = value[0] === ' ' || value[0] === '\t';
  const hasTrailingQuote = value[value.length - 1] === '"';
  const hasTrailingSlash = value[value.length - 1] === '\\';
  const printAsMultipleLines =
    !isSingleLine ||
    hasTrailingQuote ||
    hasTrailingSlash ||
    preferMultipleLines;

  let result = '';
  // Format a multi-line block quote to account for leading space.
  if (printAsMultipleLines && !(isSingleLine && hasLeadingSpace)) {
    result += '\n' + indentation;
  }
  result += indentation ? value.replace(/\n/g, '\n' + indentation) : value;
  if (printAsMultipleLines) {
    result += '\n';
  }

  return '"""' + result.replace(/"""/g, '\\"""') + '"""';
}
