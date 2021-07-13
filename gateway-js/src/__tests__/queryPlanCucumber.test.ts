import gql from 'graphql-tag';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { DocumentNode, Kind } from 'graphql';

import { QueryPlan, BuildQueryPlanOptions } from '@apollo/query-planner';
import { buildOperationContext } from '../operationContext';
import { getFederatedTestingSchema } from './execution-utils';

const testDir = './gateway-js/src/__tests__/';

const features = [
  testDir + 'build-query-plan.feature',
  testDir + 'integration/fragments.feature',
  testDir + 'integration/requires.feature',
  testDir + 'integration/variables.feature',
  testDir + 'integration/mutations.feature',
  testDir + 'integration/boolean.feature',
  testDir + 'integration/provides.feature',
  testDir + 'integration/value-types.feature',
  testDir + 'integration/abstract-types.feature',
  testDir + 'integration/aliases.feature',
  testDir + 'integration/custom-directives.feature',
  testDir + 'integration/execution-style.feature',
  testDir + 'integration/single-service.feature',
].map(path => loadFeature(path));

features.forEach((feature) => {
  defineFeature(feature, (test) => {
    feature.scenarios.forEach((scenario) => {
      test(scenario.title, async ({ given, when, then }) => {
        let operationDocument: DocumentNode;
        let queryPlan: QueryPlan;
        let options: BuildQueryPlanOptions = { autoFragmentization: false };

        // throws on composition errors
        const { schema, queryPlanner } = getFederatedTestingSchema();

        const givenQuery = () => {
          given(/^query$/im, (operation: string) => {
            operationDocument = gql(operation);
          })
        }

        const whenUsingAutoFragmentization = () => {
          when(/using autofragmentization/i, () => {
            options = { autoFragmentization: true };
          })
        }

        const thenQueryPlanShouldBe = () => {
          then(/^query plan$/i, (expectedQueryPlan: string) => {
            queryPlan = queryPlanner.buildQueryPlan(
              buildOperationContext({
                schema,
                operationDocument,
              }),
              options
            );

            const parsedExpectedPlan = JSON.parse(expectedQueryPlan);

            expect(queryPlan).toEqual(parsedExpectedPlan);
          })
        }

        // step over each defined step in the .feature and execute the correct
        // matching step fn defined above
        scenario.steps.forEach(({ stepText }) => {
          const title = stepText.toLocaleLowerCase();
          if (title === "query") givenQuery();
          else if (title === "using autofragmentization") whenUsingAutoFragmentization();
          else if (title === "query plan") thenQueryPlanShouldBe();
          else throw new Error(`Unrecognized steps used in "build-query-plan.feature"`);
        });
      });
    });
  });
});
