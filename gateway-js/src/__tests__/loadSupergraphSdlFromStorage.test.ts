import { loadSupergraphSdlFromStorage } from '../loadSupergraphSdlFromStorage';
import { getDefaultFetcher } from '../..';
import {
  graphRef,
  apiKey,
  mockCloudConfigUrl,
  mockSupergraphSdlRequest,
  mockOutOfBandReporterUrl,
  mockOutOfBandReportRequestSuccess,
  mockSupergraphSdlRequestSuccess,
} from './integration/nockMocks';
import mockedEnv from 'mocked-env';

describe('loadSupergraphSdlFromStorage', () => {
  let cleanUp: (() => void) | null = null;

  afterAll(async () => {
    if (cleanUp) {
      cleanUp();
      cleanUp = null;
    }
  });

  it('fetches Supergraph SDL as expected', async () => {
    mockSupergraphSdlRequestSuccess();

    const fetcher = getDefaultFetcher();
    const result = await loadSupergraphSdlFromStorage({
      graphRef,
      apiKey,
      endpoint: mockCloudConfigUrl,
      fetcher,
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "id": "originalId-1234",
        "supergraphSdl": "schema
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
      ",
      }
    `);
  });

  describe('errors', () => {
    it('throws on a malformed response', async () => {
      mockSupergraphSdlRequest().reply(200, 'Invalid JSON');

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 200 invalid json response body at https://example.cloud-config-url.com/cloudconfig/ reason: Unexpected token I in JSON at position 0"`,
      );
    });

    it('throws errors from JSON on 400', async () => {
      const message = 'Query syntax error';
      mockSupergraphSdlRequest().reply(
        400,
        JSON.stringify({
          errors: [{ message }],
        }),
      );

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowError(message);
    });

    it("throws on non-OK status codes when `errors` isn't present in a JSON response", async () => {
      mockSupergraphSdlRequest().reply(500);

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 500 Internal Server Error"`,
      );
    });

    // if an additional request were made by the out of band reporter, nock would throw since it's unmocked
    // and this test would fail
    it("Out of band reporting doesn't submit reports when endpoint is not configured", async () => {
      mockSupergraphSdlRequest().reply(400);

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 400 invalid json response body at https://example.cloud-config-url.com/cloudconfig/ reason: Unexpected end of JSON input"`,
      );
    });

    it('throws on 400 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(400);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 400 invalid json response body at https://example.cloud-config-url.com/cloudconfig/ reason: Unexpected end of JSON input"`,
      );
    });

    it('throws on 413 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(413);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 413 Payload Too Large"`,
      );
    });

    it('throws on 422 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(422);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 422 Unprocessable Entity"`,
      );
    });

    it('throws on 408 status response and successfully submits an out of band error', async () => {
      cleanUp = mockedEnv({
        APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
      });

      mockSupergraphSdlRequest().reply(408);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl,
          fetcher,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"An error occurred while fetching your schema from Apollo: 408 Request Timeout"`,
      );
    });
  });

  it('throws on 504 status response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().reply(504);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: 504 Gateway Timeout"`,
    );
  });

  it('throws when there is no response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().replyWithError('no response');
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: request to https://example.cloud-config-url.com/cloudconfig/ failed, reason: no response"`,
    );
  });

  it('throws on 502 status response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().reply(502);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: 502 Bad Gateway"`,
    );
  });

  it('throws on 503 status response and successfully submits an out of band error', async () => {
    cleanUp = mockedEnv({
      APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT: mockOutOfBandReporterUrl,
    });

    mockSupergraphSdlRequest().reply(503);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl,
        fetcher,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: 503 Service Unavailable"`,
    );
  });
});
