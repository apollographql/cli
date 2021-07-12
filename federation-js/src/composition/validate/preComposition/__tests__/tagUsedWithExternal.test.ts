import { tagUsedWithExternal } from '..';
import {
  gql,
  graphqlErrorSerializer,
} from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('tagUsedWithExternal', () => {
  it('has no errors @external and @tag are used separately', () => {
    const serviceA = {
      typeDefs: gql`
        type Query {
          product: Product @tag(name: "prod")
        }

        extend type Product @key(fields: "sku") {
          sku: String @external
        }
      `,
      name: 'serviceA',
    };

    const errors = tagUsedWithExternal(serviceA);
    expect(errors).toHaveLength(0);
  });

  it('errors when `@external` and `@tag` are used on the same field of an object extension', () => {
    const serviceA = {
      typeDefs: gql`
        type Query {
          product: Product @tag(name: "prod")
        }

        extend type Product @key(fields: "sku") {
          sku: String @external @tag(name: "prod")
        }
      `,
      name: 'serviceA',
    };

    const errors = tagUsedWithExternal(serviceA);
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "TAG_USED_WITH_EXTERNAL",
          "locations": Array [
            Object {
              "column": 25,
              "line": 7,
            },
          ],
          "message": "[serviceA] Product.sku -> Found illegal use of @tag directive. @tag directives cannot currently be used in tandem with an @external directive.",
        },
      ]
    `);
  });

  it('errors when `@external` and `@tag` are used on the same field of an interface extension', () => {
    const serviceA = {
      typeDefs: gql`
        type Query {
          product: Product @tag(name: "prod")
        }

        extend interface Product @key(fields: "sku") {
          sku: String @external @tag(name: "prod")
        }
      `,
      name: 'serviceA',
    };

    const errors = tagUsedWithExternal(serviceA);
    expect(errors).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "TAG_USED_WITH_EXTERNAL",
          "locations": Array [
            Object {
              "column": 25,
              "line": 7,
            },
          ],
          "message": "[serviceA] Product.sku -> Found illegal use of @tag directive. @tag directives cannot currently be used in tandem with an @external directive.",
        },
      ]
    `);
  });
});
