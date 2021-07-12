---
title: Federation error codes
sidebar_title: Error codes
---

When Apollo Gateway attempts to **compose** the schemas provided by your [subgraphs](./subgraphs/) into a **supergraph schema**, it confirms that:

* The resulting supergraph schema is valid
* The gateway has all of the information it needs to execute operations against the resulting schema

If Apollo Gateway encounters an error, composition fails. This document lists composition error codes and their root causes.

## `extend`

| Code | Description |
|---|---|
| `EXTENSION_OF_WRONG_KIND`  | A subgraph is attempting to `extend` another subgraph's type, but there is a declaration mismatch. For example, `extend interface MyType` is invalid if `MyType` is not defined as an `interface` in its originating subgraph. |
| `EXTENSION_WITH_NO_BASE` | A subgraph is attempting to `extend` a type that is not originally defined in any known subgraph. |

## `@key`

| Code | Description |
|---|---|
| `KEY_FIELDS_SELECT_INVALID_TYPE`  | The `fields` argument of an entity's `@key` includes at least one root field that results in a list, interface, or union type. Root fields of these types cannot be part of a `@key`. |
| `KEY_FIELDS_MISSING_ON_BASE` | The `fields` argument of an entity's `@key` includes at least one field that's also defined in another subgraph. Each field of an entity should be defined in exactly one subgraph. |
| `KEY_FIELDS_MISSING_EXTERNAL` | A subgraph is attempting to `extend` another subgraph's entity, but its `@key` includes at least one field that is not marked as `@external`. |
| `KEY_MISSING_ON_BASE` | A subgraph is attempting to `extend` another subgraph's entity, but the originating subgraph hasn't defined a `@key` for the entity. |
| `MULTIPLE_KEYS_ON_EXTENSION` | A subgraph is attempting to `extend` another subgraph's entity, but it's specified multiple `@key` directives. Extending subgraphs can only use one of the `@key`s specified by the originating subgraph. |
| `KEY_NOT_SPECIFIED` | A subgraph is attempting to `extend` another subgraph's entity, but it is using a `@key` that is not specified in the originating subgraph. Valid `@key`s are specified by the owning subgraph. |

## `@external`

| Code | Description |
|---|---|
| `EXTERNAL_UNUSED` | An `@external` entity field is not being used by any instance of `@key`, `@requires`, or `@provides`. |
| `EXTERNAL_TYPE_MISMATCH` | An `@external` entity field does not match the type of the declaration in the entity's originating subgraph. |
| `EXTERNAL_MISSING_ON_BASE` | An entity field marked as `@external` is not defined in the entity's originating subgraph. |
| `EXTERNAL_USED_ON_BASE` | An entity field is marked as `@external` in the entity's originating subgraph, which is invalid. |

## `@provides`

| Code | Description |
|---|---|
| `PROVIDES_FIELDS_MISSING_EXTERNAL` | The `fields` argument of an entity field's `@provides` directive includes a field that is not marked as `@external`. |
| `PROVIDES_NOT_ON_ENTITY` | The `@provides` directive is being applied to a type that is not an entity. |
| `PROVIDES_FIELDS_SELECT_INVALID_TYPE` | The `fields` argument of an entity field's `@provides` directive includes at least one root field that results in a list or interface. Root fields of these types cannot be included in `@provides`. |

## `@requires`

| Code | Description |
|---|---|
| `REQUIRES_FIELDS_MISSING_EXTERNAL` | The `fields` argument of an entity field's `@requires` directive includes a field that is not marked as `@external`. |
| `REQUIRES_FIELDS_MISSING_ON_BASE` | The `fields` argument of an entity field's `@requires` directive includes a field that is not defined in the entity's originating subgraph.`|
| `REQUIRES_USED_ON_BASE` | An entity field is marked with `@requires` in the entity's originating subgraph, which is invalid. |

## `@tag`

| Code | Description |
|---|---|
| `TAG_USED_WITH_EXTERNAL` | Fields marked as `@external` cannot also have `@tag` usages.  |
## Custom directives

| Code | Description |
|---|---|
| `EXECUTABLE_DIRECTIVES_IN_ALL_SERVICES` | A custom directive is not defined in a subgraph. All custom directives must be defined across all subgraphs, even if some of those definitions are a no-op. |
| `EXECUTABLE_DIRECTIVES_IDENTICAL` | <p>A custom directive is defined inconsistently across subgraphs. A directive's arguments and argument types, along with its supported schema locations, must match across all subgraphs.</p> Only [`ExecutableDirectiveLocation`](https://graphql.github.io/graphql-spec/June2018/#ExecutableDirectiveLocation)s are compared. [`TypeSystemDirectiveLocation`](https://graphql.github.io/graphql-spec/June2018/#TypeSystemDirectiveLocation)s are ignored during composition. |

## Enums and scalars

| Code | Description |
|---|---|
| `DUPLICATE_SCALAR_DEFINITION` | A scalar type is defined multiple times in a single subgraph.|
| `DUPLICATE_ENUM_DEFINITION` | An enum type is defined multiple times in a single subgraph.|
| `DUPLICATE_ENUM_VALUE` | One of an enum type's values is defined multiple times. Duplicate values can be in either the enum's originating subgraph or another subgraph that extends the enum. |
| `ENUM_MISMATCH` | <p>An enum's values do not match across all subgraphs. Even if a subgraph does not use all enum values, they still must be provided if another subgraph uses them.</p>This error lists which subgraphs have matching definitions. For example, `[serviceA, serviceB], [serviceC]` indicates that `serviceA` and `serviceB` have matching enum definitions, but `serviceC` does not match the other definitions. |
| `ENUM_MISMATCH_TYPE` | An enum is defined with the same name as a non-enum type in another subgraph. |

## Root fields

| Code | Description |
|---|---|
| `RESERVED_FIELD_USED` | A subgraph defines a field name that is reserved by Apollo Federation, such as `Query._service` or `Query._entities`. |
| `ROOT_QUERY_USED` | A subgraph's schema defines a type with the name `Query`, while also specifying a _different_ type name as the root query object. This is not allowed. |
| `ROOT_MUTATION_USED` | A subgraph's schema defines a type with the name `Mutation`, while also specifying a _different_ type name as the root mutation object. This is not allowed. |
| `ROOT_SUBSCRIPTION_USED` | A subgraph's schema defines a type with the name `Subscription`, while also specifying a _different_ type name as the root subscription object. This is not allowed. |

## Value types

| Code | Description |
|---|---|
| `VALUE_TYPE_FIELD_TYPE_MISMATCH` | Multiple subgraphs define the same value type, but with mismatched fields. Value types must match across all subgraphs that define them. |
| `VALUE_TYPE_INPUT_VALUE_MISMATCH` | Multiple subgraphs define the same value type, but with mismatched input values for fields. Value types and input values for fields must match across all subgraphs that define them. |
| `VALUE_TYPE_NO_ENTITY` | Multiple subgraphs define the same value type, but at least one subgraph assigns it a `@key`. Either remove the `@key` or convert the type to an entity and `extend` it.|
| `VALUE_TYPE_UNION_TYPES_MISMATCH` | Multiple subgraphs define the same union type, but with mismatched sets of types. Union types must match across all subgraphs that define them. |
| `VALUE_TYPE_KIND_MISMATCH` | A subgraph defines a type with the same name and fields as a type in another subgraph, but there is a declaration mismatch. For example, `type MyType` is invalid if another subgraph defines `interface MyType`. |

## Modified SDL validations

| Code | Description |
|---|---|
| Unique type names | Type definitions cannot be duplicated across subgraphs, with the exception of enums, scalars, and [value types](/value-types/). This is a modified version of the `graphql-js` validation with exclusions for enums and scalars, because those are required to be duplicated across subgraphs. |
