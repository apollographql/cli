import gql from 'graphql-tag';
import { composeServices } from '../../../compose';
import { providesFieldsMissingExternal as validateProdivesFieldsMissingExternal } from '../';
import { graphqlErrorSerializer } from 'apollo-federation-integration-testsuite';
import { assertCompositionSuccess } from '../../../utils';
import { parse } from 'graphql';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('providesFieldsMissingExternal', () => {
  it('does not warn with proper @provides usage', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "sku") {
          sku: String!
          upc: String!
          id: ID!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          username: String
        }
      `,
      name: 'serviceB',
    };

    const serviceC = {
      typeDefs: gql`
        type Review @key(fields: "id") {
          id: ID!
          product: Product @provides(fields: "id")
          author: User @provides(fields: "username")
        }

        extend type Product @key(fields: "sku") {
          sku: String! @external
          id: ID! @external
          price: Int!
        }

        extend type User @key(fields: "id") {
          id: ID! @external
          username: String @external
        }
      `,
      name: 'serviceC',
    };

    const serviceList = [serviceA, serviceB, serviceC];
    const compositionResult = composeServices(serviceList);
    assertCompositionSuccess(compositionResult);
    const { schema } = compositionResult;
    const warnings = validateProdivesFieldsMissingExternal({
      schema,
      serviceList,
    });
    expect(warnings).toEqual([]);
  });

  it('warns when there is a @provides with no matching @external field', () => {
    const serviceA = {
      typeDefs: parse(`
        type Product @key(fields: "sku") {
          sku: String!
          upc: String!
          id: ID!
        }
      `),
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: parse(`
        type Review @key(fields: "id") {
          id: ID!
          product: Product @provides(fields: "id")
        }

        extend type Product @key(fields: "sku") {
          sku: String! @external
          price: Int!
        }
      `),
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const compositionResult = composeServices(serviceList);
    assertCompositionSuccess(compositionResult);
    const { schema } = compositionResult;
    const warnings = validateProdivesFieldsMissingExternal({
      schema,
      serviceList,
    });
    expect(warnings).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "PROVIDES_FIELDS_MISSING_EXTERNAL",
          "locations": Array [
            Object {
              "column": 11,
              "line": 4,
            },
          ],
          "message": "[serviceB] Review.product -> provides the field \`id\` and requires Product.id to be marked as @external.",
        },
      ]
    `);
  });
});
