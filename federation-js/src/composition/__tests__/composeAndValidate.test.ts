import { composeAndValidate } from '../composeAndValidate';
import {
  GraphQLObjectType,
  DocumentNode,
  GraphQLScalarType,
  specifiedDirectives,
  printSchema,
} from 'graphql';
import {
  astSerializer,
  typeSerializer,
  graphqlErrorSerializer,
  gql,
} from 'apollo-federation-integration-testsuite';
import {
  assertCompositionFailure,
  assertCompositionSuccess,
  compositionHasErrors,
  CompositionResult,
} from '../utils';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(typeSerializer);
expect.addSnapshotSerializer(graphqlErrorSerializer);

const productsService = {
  name: 'Products',
  typeDefs: gql`
    extend type Query {
      topProducts(first: Int): [Product]
    }
    type Product @key(fields: "upc") {
      upc: String!
      sku: String!
      name: String
      price: String
    }
  `,
};

const reviewsService = {
  name: 'Reviews',
  typeDefs: gql`
    type Review @key(fields: "id") {
      id: ID!
      body: String
      author: User
      product: Product
    }

    extend type User @key(fields: "id") {
      id: ID! @external
      reviews: [Review]
    }
    extend type Product @key(fields: "upc") {
      upc: String! @external
      reviews: [Review]
    }
  `,
};

const accountsService = {
  name: 'Accounts',
  typeDefs: gql`
    extend type Query {
      me: User
    }
    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
      birthDate: String
    }
  `,
};

const inventoryService = {
  name: 'Inventory',
  typeDefs: gql`
    extend type Product @key(fields: "upc") {
      upc: String! @external
      inStock: Boolean
      # quantity: Int
    }
  `,
};

function permutateList<T>(inputArr: T[]) {
  let result: T[][] = [];

  function permute(arr: T[], m: T[] = []) {
    if (arr.length === 0) {
      result.push(m);
    } else {
      for (let i = 0; i < arr.length; i++) {
        let curr = arr.slice();
        let next = curr.splice(i, 1);
        permute(curr.slice(), m.concat(next));
      }
    }
  }

  permute(inputArr);

  return result;
}

it('composes and validates all (24) permutations without error', () => {
  permutateList([
    inventoryService,
    reviewsService,
    accountsService,
    productsService,
  ]).map((config) => {
    const compositionResult = composeAndValidate(config);
    expect(!compositionHasErrors(compositionResult));
  });
});

describe('unknown types', () => {
  it("doesn't throw errors when a type is unknown, but captures them instead", () => {
    const serviceA = {
      typeDefs: gql`
        type Query {
          foo: Bar!
        }

        extend type Bar @key(fields: "id") {
          id: ID! @external
          thing: String
        }
      `,
      name: 'serviceA',
    };

    let compositionResult: CompositionResult;
    expect(
      () => (compositionResult = composeAndValidate([serviceA])),
    ).not.toThrow();

    assertCompositionFailure(compositionResult!);
    const { errors } = compositionResult;
    expect(errors).toMatchInlineSnapshot(`
          Array [
            Object {
              "code": "MISSING_ERROR",
              "locations": Array [
                Object {
                  "column": 8,
                  "line": 3,
                },
              ],
              "message": "Unknown type \\"Bar\\".",
            },
            Object {
              "code": "EXTENSION_WITH_NO_BASE",
              "locations": Array [
                Object {
                  "column": 1,
                  "line": 6,
                },
              ],
              "message": "[serviceA] Bar -> \`Bar\` is an extension type, but \`Bar\` is not defined in any service",
            },
            Object {
              "code": "MISSING_ERROR",
              "locations": Array [],
              "message": "Type Query must define one or more fields.",
            },
          ]
      `);
  });

  it("doesn't throw errors when a type is unknown, and the type has directive usages which we've captured", () => {
    const inventory = {
      name: 'inventory',
      typeDefs: gql`
        extend type Product @key(fields: "id") {
          id: ID! @external @tag(name: "hi from inventory")
        }
      `,
    };

    expect(() => composeAndValidate([inventory])).not.toThrow();
  });
});

it('treats types with @extends as type extensions', () => {
  const serviceA = {
    typeDefs: gql`
      type Query {
        products: [Product]!
      }

      type Product @key(fields: "sku") {
        sku: String!
        upc: String!
      }
    `,
    name: 'serviceA',
  };

  const serviceB = {
    typeDefs: gql`
      type Product @extends @key(fields: "sku") {
        sku: String! @external
        price: Int! @requires(fields: "sku")
      }
    `,
    name: 'serviceB',
  };

  const compositionResult = composeAndValidate([serviceA, serviceB]);
  assertCompositionSuccess(compositionResult);

  const product = compositionResult.schema.getType(
    'Product',
  ) as GraphQLObjectType;
  expect(product).toMatchInlineSnapshot(`
    type Product {
      price: Int!
      sku: String!
      upc: String!
    }
  `);
});

it('treats interfaces with @extends as interface extensions', () => {
  const serviceA = {
    typeDefs: gql`
      type Query {
        products: [Product]!
      }

      interface Product @key(fields: "sku") {
        sku: String!
        upc: String!
      }
    `,
    name: 'serviceA',
  };

  const serviceB = {
    typeDefs: gql`
      interface Product @extends @key(fields: "sku") {
        sku: String! @external
        price: Int! @requires(fields: "sku")
      }
    `,
    name: 'serviceB',
  };

  const compositionResult = composeAndValidate([serviceA, serviceB]);
  assertCompositionSuccess(compositionResult);

  const product = compositionResult.schema.getType(
    'Product',
  ) as GraphQLObjectType;
  expect(product).toMatchInlineSnapshot(`
    interface Product {
      price: Int!
      sku: String!
      upc: String!
    }
  `);
});

describe('composition of value types', () => {
  function getSchemaWithValueType(valueType: DocumentNode) {
    const serviceA = {
      typeDefs: gql`
        ${valueType}

        type Query {
          filler: String
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: valueType,
      name: 'serviceB',
    };

    return composeAndValidate([serviceA, serviceB]);
  }

  describe('success', () => {
    it('scalars', () => {
      const compositionResult = getSchemaWithValueType(
        gql`
          scalar Date
        `,
      );

      assertCompositionSuccess(compositionResult);
      expect(compositionResult.schema.getType('Date')).toMatchInlineSnapshot(
        `scalar Date`,
      );
    });

    it('unions and object types', () => {
      const compositionResult = getSchemaWithValueType(
        gql`
          union CatalogItem = Couch | Mattress

          type Couch {
            sku: ID!
            material: String!
          }

          type Mattress {
            sku: ID!
            size: String!
          }
        `,
      );

      assertCompositionSuccess(compositionResult);
      const { schema } = compositionResult;
      expect(schema.getType('CatalogItem')).toMatchInlineSnapshot(
        `union CatalogItem = Couch | Mattress`,
      );
      expect(schema.getType('Couch')).toMatchInlineSnapshot(`
        type Couch {
          material: String!
          sku: ID!
        }
      `);
    });

    it('input types', () => {
      const compositionResult = getSchemaWithValueType(gql`
        input NewProductInput {
          sku: ID!
          type: String
        }
      `);
      assertCompositionSuccess(compositionResult);
      expect(compositionResult.schema.getType('NewProductInput'))
        .toMatchInlineSnapshot(`
              input NewProductInput {
                sku: ID!
                type: String
              }
          `);
    });

    it('interfaces', () => {
      const compositionResult = getSchemaWithValueType(gql`
        interface Product {
          sku: ID!
        }
      `);

      assertCompositionSuccess(compositionResult);
      expect(compositionResult.schema.getType('Product'))
        .toMatchInlineSnapshot(`
              interface Product {
                sku: ID!
              }
          `);
    });

    it('enums', () => {
      const compositionResult = getSchemaWithValueType(gql`
        enum CatalogItemEnum {
          COUCH
          MATTRESS
        }
      `);
      assertCompositionSuccess(compositionResult);
      expect(compositionResult.schema.getType('CatalogItemEnum'))
        .toMatchInlineSnapshot(`
              enum CatalogItemEnum {
                COUCH
                MATTRESS
              }
          `);
    });
  });

  describe('errors', () => {
    it('on invalid usages of default operation names', () => {
      const serviceA = {
        typeDefs: gql`
          schema {
            query: RootQuery
          }

          type RootQuery {
            product: Product
          }

          type Product @key(fields: "id") {
            id: ID!
            query: Query
          }

          type Query {
            invalidUseOfQuery: Boolean
          }
        `,
        name: 'serviceA',
      };

      const serviceB = {
        typeDefs: gql`
          type Query {
            validUseOfQuery: Boolean
          }

          extend type Product @key(fields: "id") {
            id: ID! @external
            sku: String
          }
        `,
        name: 'serviceB',
      };

      const compositionResult = composeAndValidate([serviceA, serviceB]);

      assertCompositionFailure(compositionResult);
      expect(compositionResult.errors).toMatchInlineSnapshot(`
        Array [
          Object {
            "code": "ROOT_QUERY_USED",
            "locations": Array [
              Object {
                "column": 1,
                "line": 15,
              },
            ],
            "message": "[serviceA] Query -> Found invalid use of default root operation name \`Query\`. \`Query\` is disallowed when \`Schema.query\` is set to a type other than \`Query\`.",
          },
        ]
      `);
    });

    it('when a type extension has no base', () => {
      const serviceA = {
        typeDefs: gql`
          schema {
            query: MyRoot
          }

          type MyRoot {
            products: [Product]!
          }

          type Product @key(fields: "sku") {
            sku: String!
            upc: String!
          }
        `,
        name: 'serviceA',
      };

      const serviceB = {
        typeDefs: gql`
          extend type Location {
            id: ID
          }
        `,
        name: 'serviceB',
      };

      const compositionResult = composeAndValidate([serviceA, serviceB]);

      assertCompositionFailure(compositionResult);

      expect(compositionResult.errors).toHaveLength(1);
      expect(compositionResult.errors).toMatchInlineSnapshot(`
        Array [
          Object {
            "code": "EXTENSION_WITH_NO_BASE",
            "locations": Array [
              Object {
                "column": 1,
                "line": 2,
              },
            ],
            "message": "[serviceB] Location -> \`Location\` is an extension type, but \`Location\` is not defined in any service",
          },
        ]
      `);
    });

    it('when used as an entity', () => {
      const serviceA = {
        typeDefs: gql`
          type Query {
            product: Product
          }

          type Product {
            sku: ID!
            color: String!
          }
        `,
        name: 'serviceA',
      };

      const serviceB = {
        typeDefs: gql`
          type Query {
            topProducts: [Product]
          }

          type Product @key(fields: "sku") {
            sku: ID!
            color: String!
          }
        `,
        name: 'serviceB',
      };

      const compositionResult = composeAndValidate([serviceA, serviceB]);

      assertCompositionFailure(compositionResult);
      expect(compositionResult.errors).toHaveLength(1);
      expect(compositionResult.errors[0]).toMatchInlineSnapshot(`
        Object {
          "code": "VALUE_TYPE_NO_ENTITY",
          "locations": Array [
            Object {
              "column": 1,
              "line": 6,
            },
            Object {
              "column": 1,
              "line": 6,
            },
          ],
          "message": "[serviceB] Product -> Value types cannot be entities (using the \`@key\` directive). Please ensure that the \`Product\` type is extended properly or remove the \`@key\` directive if this is not an entity.",
        }
      `);
    });

    it('on field type mismatch', () => {
      const serviceA = {
        typeDefs: gql`
          type Query {
            product: Product
          }

          type Product {
            sku: ID!
            color: String!
          }
        `,
        name: 'serviceA',
      };

      const serviceB = {
        typeDefs: gql`
          type Query {
            topProducts: [Product]
          }

          type Product {
            sku: ID!
            color: String
          }
        `,
        name: 'serviceB',
      };

      const compositionResult = composeAndValidate([serviceA, serviceB]);

      assertCompositionFailure(compositionResult);
      expect(compositionResult.errors).toHaveLength(1);
      expect(compositionResult.errors[0]).toMatchInlineSnapshot(`
        Object {
          "code": "VALUE_TYPE_FIELD_TYPE_MISMATCH",
          "locations": Array [
            Object {
              "column": 10,
              "line": 8,
            },
            Object {
              "column": 10,
              "line": 8,
            },
          ],
          "message": "[serviceA] Product.color -> A field was defined differently in different services. \`serviceA\` and \`serviceB\` define \`Product.color\` as a String! and String respectively. In order to define \`Product\` in multiple places, the fields and their types must be identical.",
        }
      `);
    });

    it('on kind mismatch', () => {
      const serviceA = {
        typeDefs: gql`
          type Query {
            product: Product
          }

          interface Product {
            sku: ID!
            color: String!
          }
        `,
        name: 'serviceA',
      };

      const serviceB = {
        typeDefs: gql`
          type Query {
            topProducts: [Product]
          }

          type Product {
            sku: ID!
            color: String!
          }
        `,
        name: 'serviceB',
      };

      const compositionResult = composeAndValidate([serviceA, serviceB]);
      assertCompositionFailure(compositionResult);
      expect(compositionResult.errors).toHaveLength(1);
      expect(compositionResult.errors[0]).toMatchInlineSnapshot(`
        Object {
          "code": "VALUE_TYPE_KIND_MISMATCH",
          "locations": Array [
            Object {
              "column": 1,
              "line": 6,
            },
            Object {
              "column": 1,
              "line": 6,
            },
          ],
          "message": "[serviceA] Product -> Found kind mismatch on expected value type belonging to services \`serviceA\` and \`serviceB\`. \`Product\` is defined as both a \`ObjectTypeDefinition\` and a \`InterfaceTypeDefinition\`. In order to define \`Product\` in multiple places, the kinds must be identical.",
        }
      `);
    });

    it('on union types mismatch', () => {
      const serviceA = {
        typeDefs: gql`
          type Query {
            product: Product
          }

          type Couch {
            sku: ID!
          }

          type Mattress {
            sku: ID!
          }

          union Product = Couch | Mattress
        `,
        name: 'serviceA',
      };

      const serviceB = {
        typeDefs: gql`
          type Query {
            topProducts: [Product]
          }

          type Couch {
            sku: ID!
          }

          type Cabinet {
            sku: ID!
          }

          union Product = Couch | Cabinet
        `,
        name: 'serviceB',
      };

      const compositionResult = composeAndValidate([serviceA, serviceB]);
      assertCompositionFailure(compositionResult);
      expect(compositionResult.errors).toHaveLength(1);
      expect(compositionResult.errors[0]).toMatchInlineSnapshot(`
        Object {
          "code": "VALUE_TYPE_UNION_TYPES_MISMATCH",
          "locations": Array [
            Object {
              "column": 1,
              "line": 14,
            },
            Object {
              "column": 1,
              "line": 14,
            },
          ],
          "message": "[serviceA] Product -> The union \`Product\` is defined in services \`serviceA\` and \`serviceB\`, however their types do not match. Union types with the same name must also consist of identical types. The types Cabinet, Mattress are mismatched.",
        }
      `);
    });
  });

  it('composed type implements ALL interfaces that value types implement', () => {
    const serviceA = {
      typeDefs: gql`
        interface Node {
          id: ID!
        }

        interface Named {
          name: String
        }

        type Product implements Named & Node {
          id: ID!
          name: String
        }

        type Query {
          node(id: ID!): Node
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        interface Node {
          id: ID!
        }

        type Product implements Node {
          id: ID!
          name: String
        }
      `,
      name: 'serviceB',
    };

    const serviceC = {
      typeDefs: gql`
        interface Named {
          name: String
        }

        type Product implements Named {
          id: ID!
          name: String
        }
      `,
      name: 'serviceC',
    };

    const serviceD = {
      typeDefs: gql`
        type Product {
          id: ID!
          name: String
        }
      `,
      name: 'serviceD',
    };

    const compositionResult = composeAndValidate([
      serviceA,
      serviceB,
      serviceC,
      serviceD,
    ]);

    assertCompositionSuccess(compositionResult);
    const { schema, supergraphSdl } = compositionResult;
    expect(
      (schema.getType('Product') as GraphQLObjectType).getInterfaces(),
    ).toHaveLength(2);

    expect(printSchema(schema)).toContain(
      'type Product implements Named & Node',
    );
    expect(supergraphSdl).toContain('type Product implements Named & Node');
  });
});

describe('composition of schemas with directives', () => {
  /**
   * To see which usage sites indicate whether a directive is "executable" or
   * merely for use by the type-system ("type-system"), see the GraphQL spec:
   * https://graphql.github.io/graphql-spec/June2018/#sec-Type-System.Directives
   */
  it('preserves executable and purges type-system directives', () => {
    const serviceA = {
      typeDefs: gql`
        "directives at FIELDs are executable"
        directive @audit(risk: Int!) on FIELD

        "directives at FIELD_DEFINITIONs are for the type-system"
        directive @transparency(concealment: Int!) on FIELD_DEFINITION

        type EarthConcern {
          environmental: String! @transparency(concealment: 5)
        }

        extend type Query {
          importantDirectives: [EarthConcern!]!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        "directives at FIELDs are executable"
        directive @audit(risk: Int!) on FIELD

        "directives at FIELD_DEFINITIONs are for the type-system"
        directive @transparency(concealment: Int!) on FIELD_DEFINITION

        "directives at OBJECTs are for the type-system"
        directive @experimental on OBJECT

        extend type EarthConcern @experimental {
          societal: String! @transparency(concealment: 6)
        }
      `,
      name: 'serviceB',
    };

    const compositionResult = composeAndValidate([serviceA, serviceB]);
    const { schema } = compositionResult;

    expect(!compositionHasErrors(compositionResult));

    const audit = schema.getDirective('audit');
    expect(audit).toMatchInlineSnapshot(`"@audit"`);

    const transparency = schema.getDirective('transparency');
    expect(transparency).toBeUndefined();

    const type = schema.getType('EarthConcern') as GraphQLObjectType;

    expect(type.astNode).toMatchInlineSnapshot(`
      type EarthConcern {
        environmental: String!
      }
    `);

    const fields = type.getFields();

    expect(fields['environmental'].astNode).toMatchInlineSnapshot(
      `environmental: String!`,
    );

    expect(fields['societal'].astNode).toMatchInlineSnapshot(
      `societal: String!`,
    );
  });

  it(`doesn't strip the special case @deprecated and @specifiedBy type-system directives`, () => {
    const specUrl = 'http://my-spec-url.com';
    const deprecationReason = "Don't remove me please";

    // Detecting >15.1.0 by the new addition of the `specifiedBy` directive
    const isAtLeastGraphqlVersionFifteenPointOne =
      specifiedDirectives.length >= 4;

    const serviceA = {
      typeDefs: gql`
        # This directive needs to be conditionally added depending on the testing
        # environment's version of graphql (>= 15.1.0 includes this new directive)
        ${
          isAtLeastGraphqlVersionFifteenPointOne
            ? `scalar MyScalar @specifiedBy(url: "${specUrl}")`
            : ''
        }

        type EarthConcern {
          environmental: String!
        }

        extend type Query {
          importantDirectives: [EarthConcern!]!
            @deprecated(reason: "${deprecationReason}")
        }
      `,
      name: 'serviceA',
    };

    const compositionResult = composeAndValidate([serviceA]);
    const { schema } = compositionResult;
    expect(!compositionHasErrors(compositionResult));

    const deprecated = schema.getDirective('deprecated');
    expect(deprecated).toMatchInlineSnapshot(`"@deprecated"`);

    const queryType = schema.getType('Query') as GraphQLObjectType;
    const field = queryType.getFields()['importantDirectives'];

    expect(field.isDeprecated).toBe(true);
    expect(field.deprecationReason).toEqual(deprecationReason);

    if (isAtLeastGraphqlVersionFifteenPointOne) {
      const specifiedBy = schema.getDirective('specifiedBy');
      expect(specifiedBy).toMatchInlineSnapshot(`"@specifiedBy"`);
      const customScalar = schema.getType('MyScalar');
      expect((customScalar as GraphQLScalarType).specifiedByUrl).toEqual(
        specUrl,
      );
    }
  });
});

it('composition of full-SDL schemas without any errors', () => {
  const serviceA = {
    typeDefs: gql`
      # Default directives
      directive @deprecated(
        reason: String = "No longer supported"
      ) on FIELD_DEFINITION | ENUM_VALUE
      directive @specifiedBy(url: String!) on SCALAR
      directive @include(
        if: String = "Included when true."
      ) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
      directive @skip(
        if: String = "Skipped when true."
      ) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT

      # Federation directives
      directive @key(fields: _FieldSet!) repeatable on OBJECT | INTERFACE
      directive @external on FIELD_DEFINITION
      directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
      directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
      directive @extends on OBJECT | INTERFACE

      # Custom type system directive (disregarded by gateway, unconcerned with serviceB's implementation)
      directive @myTypeSystemDirective on FIELD_DEFINITION
      # Custom executable directive (must be implemented in all services, definition must be identical)
      directive @myExecutableDirective on FIELD

      scalar _Any
      scalar _FieldSet

      union _Entity

      type _Service {
        sdl: String
      }

      schema {
        query: RootQuery
        mutation: RootMutation
      }

      type RootQuery {
        _service: _Service!
        _entities(representations: [_Any!]!): [_Entity]!
        product: Product
      }

      type Product @key(fields: "sku") {
        sku: String!
        price: Float
      }

      type RootMutation {
        updateProduct: Product
      }
    `,
    name: 'serviceA',
  };

  const serviceB = {
    typeDefs: gql`
      # Default directives
      directive @deprecated(
        reason: String = "No longer supported"
      ) on FIELD_DEFINITION | ENUM_VALUE
      directive @specifiedBy(url: String!) on SCALAR
      directive @include(
        if: String = "Included when true."
      ) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT
      directive @skip(
        if: String = "Skipped when true."
      ) on FIELD | FRAGMENT_SPREAD | INLINE_FRAGMENT

      # Federation directives
      directive @key(fields: _FieldSet!) repeatable on OBJECT | INTERFACE
      directive @external on FIELD_DEFINITION
      directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
      directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
      directive @extends on OBJECT | INTERFACE

      # Custom type system directive (disregarded by gateway, unconcerned with serviceA's implementation)
      directive @myDirective on FIELD_DEFINITION

      # Custom executable directive (must be implemented in all services, definition must be identical)
      directive @myExecutableDirective on FIELD

      scalar _Any
      scalar _FieldSet

      union _Entity

      type _Service {
        sdl: String
      }

      type Query {
        _service: _Service!
        _entities(representations: [_Any!]!): [_Entity]!
        review: Review
      }

      type Review @key(fields: "id") {
        id: String!
        content: String
      }

      type Mutation {
        createReview: Review
      }
    `,
    name: 'serviceB',
  };

  const compositionResult = composeAndValidate([serviceA, serviceB]);
  expect(!compositionHasErrors(compositionResult));
});
