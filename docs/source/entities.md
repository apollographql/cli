---
title: Entities
description: Reference and extend types across subgraphs
---

> **Implementing services** are now known as **subgraphs**.
>
> If you find an outdated use of "implementing service," please submit article feedback or a pull request using the links on the right.

In Apollo Federation, an **entity** is an object type that you define canonically in _one_ subgraph and can then reference and extend in _other_ subgraphs. Entities are the core building block of a federated graph.

> Types _besides_ object types (unions, interfaces, etc.) _cannot_ be entities.

## Defining

In a GraphQL schema, you can designate any object type as an entity by adding a `@key` directive to its definition, like so:

```graphql{1}:title=products
type Product @key(fields: "upc") {
  upc: String!
  name: String!
  price: Int
}
```

The `@key` directive defines the entity's **primary key**, which consists of one or more of the type's `fields`. In the example above, the `Product` entity's primary key is its `upc` field. The gateway's query planner uses an entity's primary key to identify a given instance of the type.

> An entity's `@key` cannot include fields that return a union or interface.

### Defining multiple primary keys

If an entity can be uniquely identified by more than one combination of fields, you can define more than one primary key for that entity.

In the following example, a `Product` entity can be uniquely identified by either its `upc` _or_ its `sku`:

```graphql{1}:title=products
type Product @key(fields: "upc") @key(fields: "sku") {
  upc: String!
  sku: String!
  price: String
}
```

This pattern is helpful when different subgraphs interact with different fields of an entity. For example, a `reviews` subgraph might refer to products by their UPC, whereas an `inventory` subgraph might use SKUs.

### Defining a compound primary key

A single primary key can consist of multiple fields, and even nested fields.

The following example shows a primary key that consists of both a user's `id` _and_ the `id` of that user's associated organization:

```graphql{1}:title=directory
type User @key(fields: "id organization { id }") {
  id: ID!
  organization: Organization!
}

type Organization {
  id: ID!
}
```

## Referencing

After you define an entity in one subgraph, other subgraphs can then reference that entity. If a `products` subgraph defines the `Product` entity above, a `reviews` subgraph can then add a field of type `Product` to its `Review` type, like so:

```graphql:title=reviews
type Review {
  product: Product
}

# This is a "stub" of the Product entity (see below)
extend type Product @key(fields: "upc") {
  upc: String! @external
}
```

Because the `Product` entity is defined in another subgraph, the `reviews` subgraph needs to define a **stub** of it to make its own schema valid. The stub includes just enough information for the subgraph to know how to interact with a `Product`:

* The `extend` keyword indicates that `Product` is an entity that is defined in another subgraph (in this case, the `products` subgraph).
* The `@key` directive indicates that `Product` uses the `upc` field as its primary key. This value must match the value of exactly one `@key` defined in the entity's originating subgraph, even if the entity defines [multiple primary keys](#defining-multiple-primary-keys).
* The `upc` field must be included in the stub because it is part of the specified `@key`. It also must be annotated with the `@external` directive to indicate that the field originates in another subgraph.

This explicit syntax has several benefits:
* It is standard GraphQL grammar.
* It enables you to run the `reviews` subgraph standalone with a valid schema, including a `Product` type with a single `upc` field.
* It provides strong typing information that lets you catch mistakes at schema composition time.

## Resolving

In our example, the `reviews` subgraph needs to define its own resolver for the `Product` entity. The `reviews` subgraph doesn't know much about `Product`s, but fortunately, it doesn't need to. All it needs to do is return enough information to uniquely identify a given `Product`, like so:

```js
{
  Review: {
    product(review) {
      return { __typename: "Product", upc: review.upc };
    }
  }
}
```

This return value is a **representation** of a `Product` entity. Subgraphs use representations to reference entities from other subgraphs. A representation requires only an explicit `__typename` definition and values for the entity's primary key fields.

The gateway provides this representation to the entity's originating subgraph to fetch the full object. For this to work, the originating subgraph (in this case, `products`) must define a **reference resolver** for the `Product` entity:

```js{3-5}
{
  Product: {
    __resolveReference(reference) {
      return fetchProductByUPC(reference.upc);
    }
  }
}
```

> Reference resolvers are a special addition to Apollo Server that enable entities to be referenced by other subgraphs. They are called whenever a query references an `entity` across subgraph boundaries. To learn more about `__resolveReference`, see the [API docs](/api/apollo-federation/).

With this model, each implementing subgraph's schema represents a true subset of the complete data graph. This prevents the need for defining foreign-key fields in individual schemas, and enables clients to transparently execute a query like the following, which hits both the `products` and `reviews` subgraphs:

```graphql
{
  reviews {
    product {
      name
      price
    }
  }
}
```

## Extending

A subgraph can add fields to an entity that's defined in another subgraph. This is called **extending** the entity.

When a subgraph extends an entity, the entity's _originating_ subgraph is not aware of the added fields. Only the _extending_ subgraph (along with the gateway) knows about these fields.

> Each field of an entity should be defined in exactly one subgraph. Otherwise, a schema composition error will occur.

### Example #1

Let's say we want to add a `reviews` field to the `Product` entity. This field will hold a list of reviews for the product. The `Product` entity originates in the `products` subgraph, but it makes much more sense for the `reviews` subgraph to resolve this particular field.

To handle this case, we can extend the `Product` entity in the `reviews` subgraph, like so:

```graphql{3}:title=reviews
extend type Product @key(fields: "upc") {
  upc: String! @external
  reviews: [Review]
}
```

This definition is nearly identical to the stub we defined for the `Product` type in [Referencing](#referencing). All we've added is the `reviews` field. We _don't_ include an `@external` directive, because this field _does_ originate in the `reviews` subgraph.

Whenever a subgraph extends an entity with a new field, it is also responsible for _resolving_ the field. The gateway is automatically aware of this responsibility. In our example, the generated query plan will fetch the `upc` field for each `Product` from the `products` subgraph and pass those to the `reviews` subgraph, where you can then access these fields on the object passed into your `reviews` resolver:

```js
{
  Product: {
    reviews(product) {
      return fetchReviewsForProduct(product.upc);
    }
  }
}
```

### Example #2

Let's say we want to be able to query for the `inStock` status of a product. That information lives in an `inventory` subgraph, so we'll add the type extension there:

```graphql{3}:title=inventory
extend type Product @key(fields: "upc") {
  upc: ID! @external
  inStock: Boolean
}
```

```js
{
  Product: {
    inStock(product): {
      return fetchInStockStatusForProduct(product.upc);
    }
  }
}
```

Similar to the `reviews` relationship example above, the gateway fetches the required `upc` field from the `products` subgraph and passes it to the `inventory` subgraph, even if the query didn't ask for the `upc`:

```graphql
query GetTopProductAvailability {
  topProducts {
    inStock
  }
}
```

## The `Query` and `Mutation` types

In Apollo Federation, the `Query` and `Mutation` base types originate in the graph composition itself and _all_ of your subgraphs are automatically treated as [extending](#extending) these types to add the operations they support without explicitly adding the `extends` keyword.

For example, the `products` subgraph might extend the root `Query` type to add a `topProducts` query, like so:

```graphql:title=products
type Query {
  topProducts(first: Int = 5): [Product]
}
```

## Migrating entities and fields (advanced)

As your federated graph grows, you might decide that you want an entity (or a particular field of an entity) to originate in a different subgraph. This is _only_ possible _if_ you're using managed federation and a schema registry. If you're _not_ using managed federation, Apollo can't help you rename fields.

### Entity migration

Let's say our `payments` subgraph defines a `Bill` entity. Then, we add a dedicated `billing` subgraph to our federated graph. It now makes sense for the `Bill` entity to originate in the `billing` subgraph instead.

We can perform this migration safely with the following steps:

1. In the `billing` subgraph's schema, define the `Bill` entity just as it's defined in the `payments` subgraph (do _not_ extend it). If you're using managed federation, register this schema change with Studio.

    _Note that this is technically a composition error, because the `Bill` entity can't originate in more than one subgraph. However, this error is handled gracefully, as described below._

2. In the `billing` subgraph, define resolvers for every field of `Bill` that currently originates in the `payments` subgraph. This subgraph should resolve those fields with the exact same outcome as the resolvers in the `payments` subgraph.

3. Deploy the updated `billing` subgraph to your environment.

    _Again, this technically deploys a composition error. **However**, this error is handled gracefully in one of two ways, depending on whether you are using [managed federation](./managed-federation/overview/):_

    * _If you **are** using managed federation, Apollo Studio does **not** publish an updated configuration, and the gateway continues to resolve the `Bill` entity in the `payments` subgraph._

    * _If you are **not** using managed federation, your gateway will fail to come up with a composition error, and none of your fields will load. Do not attempt a field migration unless you're using managed federation!_

4. In the `payments` subgraph's schema, remove the `Bill` entity. If you're using managed federation, register this schema change with Studio.

    _This takes care of the composition error. The gateway will begin resolving the `Bill` entity in the `billing` subgraph._

5. Remove the resolvers for `Bill` fields from the `payments` subgraph and deploy the updated subgraph to your environment.

    _By removing the `Bill` entity from the `payments` schema **before** removing its associated resolvers, you guarantee that the gateway never attempts to resolve the entity in a subgraph that lacks resolvers for it._

### Field migration

The steps for migrating an individual field are nearly identical in form to the steps for [migrating an entire entity](#entity-migration).

Like entity migration, these steps _only_ work if you're using managed federation with a schema registry.

Let's say our `products` subgraph defines a `Product` entity, which includes the boolean field `inStock`. Then, we add an `inventory` subgraph to our federated graph. It now makes sense for the `inStock` field to originate in the `inventory` subgraph instead.

We can perform this migration safely with the following steps (_additional commentary on each step is provided in [Entity migration](#entity-migration)_):

1. In the `inventory` subgraph's schema, [extend](#extending) the `Product` entity to add the `inStock` field. If you're using managed federation, register this schema change with Studio.

2. In the `inventory` subgraph, add a resolver for the `inStock` field. This subgraph should resolve the field with the exact same outcome as the resolver in the `products` subgraph.

3. Deploy the updated `inventory` subgraph to your environment.

4. In the `products` subgraph's schema, remove the `inStock` field. If you're using managed federation, register this schema change with Studio.

5. Remove the resolver for `inStock` from the `products` subgraph and deploy the updated subgraph to your environment.

## Extending an entity with computed fields (advanced)

When you [extend an entity](#extending), you can define fields that depend on fields in the entity's originating subgraph. For example, a `shipping` subgraph might extend the `Product` entity with a `shippingEstimate` field, which is calculated based on the product's `size` and `weight`:

```graphql{5}:title=shipping
extend type Product @key(fields: "sku") {
  sku: ID! @external
  size: Int @external
  weight: Int @external
  shippingEstimate: String @requires(fields: "size weight")
}
```

As shown, you use the `@requires` directive to indicate which fields (and subfields) from the entity's originating subgraph are required.

>You **cannot** require fields that are defined in a subgraph besides the entity's originating subgraph.

In the above example, if a client requests a product's `shippingEstimate`, the gateway will first obtain the product's `size` and `weight` from the `products` subgraph, then pass those values to the `shipping` subgraph. This enables you to access those values directly from your resolver:

```js{4}
{
  Product: {
    shippingEstimate(product) {
      return computeShippingEstimate(product.sku, product.size, product.weight);
    }
  }
}
```

### Using `@requires` with object subfields

If a computed field `@requires` a field that returns an object type, you also specify which _subfields_ of that object are required. You list those subfields with the following syntax:

```graphql{4}:title=shipping
extend type Product @key(fields: "sku") {
  sku: ID! @external
  dimensions: ProductDimensions @external
  shippingEstimate: String @requires(fields: "dimensions { size weight }")
}
```

In this modification of the previous example, `size` and `weight` are now subfields of a `ProductDimensions` object. Note that the `ProductDimensions` object must be defined in both the entity's extending subgraph _and_ its originating subgraph, either as an entity or as a [value type](./value-types/).

## Resolving another subgraph's field (advanced)

Sometimes, multiple subgraphs are capable of resolving a particular field for an entity, because all of those subgraphs have access to a particular data store. For example, an `inventory` subgraph and a `products` subgraph might both have access to the database that stores all product-related data.

When you [extend an entity](#extending) in this case, you can specify that the extending subgraph `@provides` the field, like so:

```graphql{2,8-9}:title=inventory
type InStockCount {
  product: Product! @provides(fields: "name price")
  quantity: Int!
}

extend type Product @key(fields: "sku") {
  sku: String! @external
  name: String @external
  price: Int @external
}
```

**This is a completely optional optimization.** When the gateway plans a query's execution, it looks at which fields are available from each subgraph. It can then attempt to optimize performance by executing the query across the fewest subgraphs needed to access all required fields.

Keep the following in mind when using the `@provides` directive:

* Each subgraph that `@provides` a field must also define a resolver for that field. **That resolver's behavior must match the behavior of the resolver in the field's originating subgraph.**
* When an entity's field can be fetched from multiple subgraphs, there is no guarantee as to _which_ subgraph will resolve that field for a particular query.
* If a subgraph `@provides` a field, it must still list that field as `@external`, because the field originates in another subgraph.
