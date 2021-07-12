import {
  fixtures,
  fixturesWithoutTagOrInaccessible,
} from 'apollo-federation-integration-testsuite';
import { parse, GraphQLError, visit, StringValueNode } from 'graphql';
import { composeAndValidate, compositionHasErrors } from '../../composition';

describe('printSupergraphSdl', () => {
  let supergraphSdl: string, errors: GraphQLError[];

  beforeAll(() => {
    // composeAndValidate calls `printSupergraphSdl` to return `supergraphSdl`
    const compositionResult = composeAndValidate(fixtures);
    if (compositionHasErrors(compositionResult)) {
      errors = compositionResult.errors;
    } else {
      supergraphSdl = compositionResult.supergraphSdl;
    }
  });

  it('composes without errors', () => {
    expect(errors).toBeUndefined();
  });

  it('produces a parseable output', () => {
    expect(() => parse(supergraphSdl!)).not.toThrow();
  });

  it('prints a fully composed schema correctly', () => {
    expect(supergraphSdl).toMatchInlineSnapshot(`
      "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.1\\"),
        @core(feature: \\"https://specs.apollo.dev/join/v0.1\\"),
        @core(feature: \\"https://specs.apollo.dev/inaccessible/v0.1\\"),
        @core(feature: \\"https://specs.apollo.dev/tag/v0.1\\")
      {
        query: Query
        mutation: Mutation
      }

      directive @core(feature: String!) repeatable on SCHEMA

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet) on FIELD_DEFINITION

      directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @inaccessible on FIELD_DEFINITION

      directive @stream on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION

      directive @transform(from: String!) on FIELD

      union AccountType = PasswordAccount | SMSAccount

      type Amazon {
        referrer: String
      }

      union Body = Image | Text

      type Book implements Product
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"isbn\\")
        @join__type(graph: INVENTORY, key: \\"isbn\\")
        @join__type(graph: PRODUCT, key: \\"isbn\\")
        @join__type(graph: REVIEWS, key: \\"isbn\\")
      {
        details: ProductDetailsBook @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isCheckedOut: Boolean @join__field(graph: INVENTORY)
        isbn: String! @join__field(graph: BOOKS)
        metadata: [MetadataOrError] @join__field(graph: BOOKS)
        name(delimeter: String = \\" \\"): String @join__field(graph: PRODUCT, requires: \\"title year\\")
        price: String @join__field(graph: PRODUCT)
        relatedReviews: [Review!]! @join__field(graph: REVIEWS, requires: \\"similarBooks{isbn}\\")
        reviews: [Review] @join__field(graph: REVIEWS)
        similarBooks: [Book]! @join__field(graph: BOOKS)
        sku: String! @join__field(graph: PRODUCT)
        title: String @join__field(graph: BOOKS)
        upc: String! @join__field(graph: PRODUCT)
        year: Int @join__field(graph: BOOKS)
      }

      union Brand = Amazon | Ikea

      type Car implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        description: String @join__field(graph: PRODUCT)
        id: String! @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      type Error {
        code: Int
        message: String
      }

      type Furniture implements Product
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"upc\\")
        @join__type(graph: PRODUCT, key: \\"sku\\")
        @join__type(graph: INVENTORY, key: \\"sku\\")
        @join__type(graph: REVIEWS, key: \\"upc\\")
      {
        brand: Brand @join__field(graph: PRODUCT)
        details: ProductDetailsFurniture @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isHeavy: Boolean @join__field(graph: INVENTORY)
        metadata: [MetadataOrError] @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        sku: String! @join__field(graph: PRODUCT)
        upc: String! @join__field(graph: PRODUCT)
      }

      type Ikea {
        asile: Int
      }

      type Image implements NamedObject {
        attributes: ImageAttributes!
        name: String!
      }

      type ImageAttributes {
        url: String!
      }

      scalar join__FieldSet

      enum join__Graph {
        ACCOUNTS @join__graph(name: \\"accounts\\" url: \\"https://accounts.api.com\\")
        BOOKS @join__graph(name: \\"books\\" url: \\"https://books.api.com\\")
        DOCUMENTS @join__graph(name: \\"documents\\" url: \\"https://documents.api.com\\")
        INVENTORY @join__graph(name: \\"inventory\\" url: \\"https://inventory.api.com\\")
        PRODUCT @join__graph(name: \\"product\\" url: \\"https://product.api.com\\")
        REVIEWS @join__graph(name: \\"reviews\\" url: \\"https://reviews.api.com\\")
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Library
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"id\\")
      {
        id: ID! @join__field(graph: BOOKS)
        name: String @join__field(graph: BOOKS)
        userAccount(id: ID! = 1): User @join__field(graph: ACCOUNTS, requires: \\"name\\")
      }

      union MetadataOrError = Error | KeyValue

      type Mutation {
        deleteReview(id: ID!): Boolean @join__field(graph: REVIEWS)
        login(password: String!, username: String!): User @join__field(graph: ACCOUNTS)
        reviewProduct(body: String!, upc: String!): Product @join__field(graph: REVIEWS)
        updateReview(review: UpdateReviewInput!): Review @join__field(graph: REVIEWS)
      }

      type Name {
        first: String
        last: String
      }

      interface NamedObject {
        name: String!
      }

      type PasswordAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"email\\")
      {
        email: String! @join__field(graph: ACCOUNTS)
      }

      interface Product {
        details: ProductDetails
        inStock: Boolean
        name: String
        price: String
        reviews: [Review]
        sku: String!
        upc: String!
      }

      interface ProductDetails {
        country: String
      }

      type ProductDetailsBook implements ProductDetails {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails {
        color: String
        country: String
      }

      type Query {
        body: Body! @join__field(graph: DOCUMENTS)
        book(isbn: String!): Book @join__field(graph: BOOKS)
        books: [Book] @join__field(graph: BOOKS)
        library(id: ID!): Library @join__field(graph: BOOKS)
        me: User @join__field(graph: ACCOUNTS)
        product(upc: String!): Product @join__field(graph: PRODUCT)
        topCars(first: Int = 5): [Car] @join__field(graph: PRODUCT)
        topProducts(first: Int = 5): [Product] @join__field(graph: PRODUCT)
        topReviews(first: Int = 5): [Review] @join__field(graph: REVIEWS)
        user(id: ID!): User @join__field(graph: ACCOUNTS)
        vehicle(id: String!): Vehicle @join__field(graph: PRODUCT)
      }

      type Review
        @join__owner(graph: REVIEWS)
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        author: User @join__field(graph: REVIEWS, provides: \\"username\\")
        body(format: Boolean = false): String @join__field(graph: REVIEWS)
        id: ID! @join__field(graph: REVIEWS)
        metadata: [MetadataOrError] @join__field(graph: REVIEWS)
        product: Product @join__field(graph: REVIEWS)
      }

      type SMSAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"number\\")
      {
        number: String @join__field(graph: ACCOUNTS)
      }

      type Text implements NamedObject {
        attributes: TextAttributes!
        name: String!
      }

      type TextAttributes {
        bold: Boolean
        text: String
      }

      union Thing = Car | Ikea

      input UpdateReviewInput {
        body: String
        id: ID!
      }

      type User
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"username name{first last}\\")
        @join__type(graph: INVENTORY, key: \\"id\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        account: AccountType @join__field(graph: ACCOUNTS)
        birthDate(locale: String): String @join__field(graph: ACCOUNTS) @tag(name: \\"admin\\") @tag(name: \\"dev\\")
        goodAddress: Boolean @join__field(graph: REVIEWS, requires: \\"metadata{address}\\")
        goodDescription: Boolean @join__field(graph: INVENTORY, requires: \\"metadata{description}\\")
        id: ID! @join__field(graph: ACCOUNTS) @inaccessible @tag(name: \\"accounts\\")
        metadata: [UserMetadata] @join__field(graph: ACCOUNTS)
        name: Name @join__field(graph: ACCOUNTS)
        numberOfReviews: Int! @join__field(graph: REVIEWS)
        reviews: [Review] @join__field(graph: REVIEWS)
        ssn: String @join__field(graph: ACCOUNTS) @inaccessible
        thing: Thing @join__field(graph: PRODUCT)
        username: String @join__field(graph: ACCOUNTS)
        vehicle: Vehicle @join__field(graph: PRODUCT)
      }

      type UserMetadata {
        address: String
        description: String
        name: String
      }

      type Van implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        description: String @join__field(graph: PRODUCT)
        id: String! @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      interface Vehicle {
        description: String
        id: String!
        price: String
        retailPrice: String
      }
      "
    `);
  });

  it('prints a fully composed schema without @tag or @inaccessible correctly', () => {
    // composeAndValidate calls `printSupergraphSdl` to return `supergraphSdl`
    const compositionResult = composeAndValidate(
      fixturesWithoutTagOrInaccessible,
    );
    if (compositionHasErrors(compositionResult)) {
      errors = compositionResult.errors;
    } else {
      supergraphSdl = compositionResult.supergraphSdl;
    }

    expect(supergraphSdl).toMatchInlineSnapshot(`
      "schema
        @core(feature: \\"https://specs.apollo.dev/core/v0.1\\"),
        @core(feature: \\"https://specs.apollo.dev/join/v0.1\\")
      {
        query: Query
        mutation: Mutation
      }

      directive @core(feature: String!) repeatable on SCHEMA

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet) on FIELD_DEFINITION

      directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      union AccountType = PasswordAccount | SMSAccount

      type Amazon {
        referrer: String
      }

      union Body = Image | Text

      type Book implements Product
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"isbn\\")
        @join__type(graph: INVENTORY, key: \\"isbn\\")
        @join__type(graph: PRODUCT, key: \\"isbn\\")
        @join__type(graph: REVIEWS, key: \\"isbn\\")
      {
        details: ProductDetailsBook @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isCheckedOut: Boolean @join__field(graph: INVENTORY)
        isbn: String! @join__field(graph: BOOKS)
        metadata: [MetadataOrError] @join__field(graph: BOOKS)
        name(delimeter: String = \\" \\"): String @join__field(graph: PRODUCT, requires: \\"title year\\")
        price: String @join__field(graph: PRODUCT)
        relatedReviews: [Review!]! @join__field(graph: REVIEWS, requires: \\"similarBooks{isbn}\\")
        reviews: [Review] @join__field(graph: REVIEWS)
        similarBooks: [Book]! @join__field(graph: BOOKS)
        sku: String! @join__field(graph: PRODUCT)
        title: String @join__field(graph: BOOKS)
        upc: String! @join__field(graph: PRODUCT)
        year: Int @join__field(graph: BOOKS)
      }

      union Brand = Amazon | Ikea

      type Car implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        description: String @join__field(graph: PRODUCT)
        id: String! @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      type Error {
        code: Int
        message: String
      }

      type Furniture implements Product
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"upc\\")
        @join__type(graph: PRODUCT, key: \\"sku\\")
        @join__type(graph: INVENTORY, key: \\"sku\\")
        @join__type(graph: REVIEWS, key: \\"upc\\")
      {
        brand: Brand @join__field(graph: PRODUCT)
        details: ProductDetailsFurniture @join__field(graph: PRODUCT)
        inStock: Boolean @join__field(graph: INVENTORY)
        isHeavy: Boolean @join__field(graph: INVENTORY)
        metadata: [MetadataOrError] @join__field(graph: PRODUCT)
        name: String @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        reviews: [Review] @join__field(graph: REVIEWS)
        sku: String! @join__field(graph: PRODUCT)
        upc: String! @join__field(graph: PRODUCT)
      }

      type Ikea {
        asile: Int
      }

      type Image implements NamedObject {
        attributes: ImageAttributes!
        name: String!
      }

      type ImageAttributes {
        url: String!
      }

      scalar join__FieldSet

      enum join__Graph {
        ACCOUNTS @join__graph(name: \\"accounts\\" url: \\"https://accounts.api.com\\")
        BOOKS @join__graph(name: \\"books\\" url: \\"https://books.api.com\\")
        DOCUMENTS @join__graph(name: \\"documents\\" url: \\"https://documents.api.com\\")
        INVENTORY @join__graph(name: \\"inventory\\" url: \\"https://inventory.api.com\\")
        PRODUCT @join__graph(name: \\"product\\" url: \\"https://product.api.com\\")
        REVIEWS @join__graph(name: \\"reviews\\" url: \\"https://reviews.api.com\\")
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Library
        @join__owner(graph: BOOKS)
        @join__type(graph: BOOKS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"id\\")
      {
        id: ID! @join__field(graph: BOOKS)
        name: String @join__field(graph: BOOKS)
        userAccount(id: ID! = 1): User @join__field(graph: ACCOUNTS, requires: \\"name\\")
      }

      union MetadataOrError = Error | KeyValue

      type Mutation {
        deleteReview(id: ID!): Boolean @join__field(graph: REVIEWS)
        login(password: String!, username: String!): User @join__field(graph: ACCOUNTS)
        reviewProduct(body: String!, upc: String!): Product @join__field(graph: REVIEWS)
        updateReview(review: UpdateReviewInput!): Review @join__field(graph: REVIEWS)
      }

      type Name {
        first: String
        last: String
      }

      interface NamedObject {
        name: String!
      }

      type PasswordAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"email\\")
      {
        email: String! @join__field(graph: ACCOUNTS)
      }

      interface Product {
        details: ProductDetails
        inStock: Boolean
        name: String
        price: String
        reviews: [Review]
        sku: String!
        upc: String!
      }

      interface ProductDetails {
        country: String
      }

      type ProductDetailsBook implements ProductDetails {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails {
        color: String
        country: String
      }

      type Query {
        body: Body! @join__field(graph: DOCUMENTS)
        book(isbn: String!): Book @join__field(graph: BOOKS)
        books: [Book] @join__field(graph: BOOKS)
        library(id: ID!): Library @join__field(graph: BOOKS)
        me: User @join__field(graph: ACCOUNTS)
        product(upc: String!): Product @join__field(graph: PRODUCT)
        topCars(first: Int = 5): [Car] @join__field(graph: PRODUCT)
        topProducts(first: Int = 5): [Product] @join__field(graph: PRODUCT)
        topReviews(first: Int = 5): [Review] @join__field(graph: REVIEWS)
        user(id: ID!): User @join__field(graph: ACCOUNTS)
        vehicle(id: String!): Vehicle @join__field(graph: PRODUCT)
      }

      type Review
        @join__owner(graph: REVIEWS)
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        author: User @join__field(graph: REVIEWS, provides: \\"username\\")
        body(format: Boolean = false): String @join__field(graph: REVIEWS)
        id: ID! @join__field(graph: REVIEWS)
        metadata: [MetadataOrError] @join__field(graph: REVIEWS)
        product: Product @join__field(graph: REVIEWS)
      }

      type SMSAccount
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"number\\")
      {
        number: String @join__field(graph: ACCOUNTS)
      }

      type Text implements NamedObject {
        attributes: TextAttributes!
        name: String!
      }

      type TextAttributes {
        bold: Boolean
        text: String
      }

      union Thing = Car | Ikea

      input UpdateReviewInput {
        body: String
        id: ID!
      }

      type User
        @join__owner(graph: ACCOUNTS)
        @join__type(graph: ACCOUNTS, key: \\"id\\")
        @join__type(graph: ACCOUNTS, key: \\"username name{first last}\\")
        @join__type(graph: INVENTORY, key: \\"id\\")
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        account: AccountType @join__field(graph: ACCOUNTS)
        birthDate(locale: String): String @join__field(graph: ACCOUNTS)
        goodAddress: Boolean @join__field(graph: REVIEWS, requires: \\"metadata{address}\\")
        goodDescription: Boolean @join__field(graph: INVENTORY, requires: \\"metadata{description}\\")
        id: ID! @join__field(graph: ACCOUNTS)
        metadata: [UserMetadata] @join__field(graph: ACCOUNTS)
        name: Name @join__field(graph: ACCOUNTS)
        numberOfReviews: Int! @join__field(graph: REVIEWS)
        reviews: [Review] @join__field(graph: REVIEWS)
        ssn: String @join__field(graph: ACCOUNTS)
        thing: Thing @join__field(graph: PRODUCT)
        username: String @join__field(graph: ACCOUNTS)
        vehicle: Vehicle @join__field(graph: PRODUCT)
      }

      type UserMetadata {
        address: String
        description: String
        name: String
      }

      type Van implements Vehicle
        @join__owner(graph: PRODUCT)
        @join__type(graph: PRODUCT, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
      {
        description: String @join__field(graph: PRODUCT)
        id: String! @join__field(graph: PRODUCT)
        price: String @join__field(graph: PRODUCT)
        retailPrice: String @join__field(graph: REVIEWS, requires: \\"price\\")
      }

      interface Vehicle {
        description: String
        id: String!
        price: String
        retailPrice: String
      }
      "
    `);
  });

  it('fieldsets are parseable', () => {
    const parsedSupergraphSdl = parse(supergraphSdl!);
    const fieldSets: string[] = [];

    // Collect all args with the `key`, `provides`, and `requires` fields
    // Note: if our testing schema ever begins to include a directive with args
    // that use any of these names, this test will likely fail and will need to
    // be a bit less heavy-handed by searching for the specific directives
    // instead of by argument name.
    const argNames = ['key', 'requires', 'provides'];
    visit(parsedSupergraphSdl, {
      Argument(node) {
        if (argNames.includes(node.name.value)) {
          fieldSets.push((node.value as StringValueNode).value);
        }
      },
    });

    // Ensure we're actually finding fieldSets, else this will fail quietly
    expect(fieldSets).not.toHaveLength(0);
    // Ensure each fieldSet arg is graphql parseable (when wrapped in curlies, as we do elsewhere)
    fieldSets.forEach((unparsed) => {
      expect(() => parse('{' + unparsed + '}')).not.toThrow();
    });
  });
});
