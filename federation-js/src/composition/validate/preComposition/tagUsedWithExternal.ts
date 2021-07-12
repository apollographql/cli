import {
  visit,
  GraphQLError,
  ObjectTypeExtensionNode,
  InterfaceTypeExtensionNode,
} from 'graphql';
import { ServiceDefinition } from '../../types';

import {
  logServiceAndType,
  errorWithCode,
  findDirectivesOnNode,
} from '../../utils';

/**
 * There are no fields with both @tag and @external. We're only concerned with
 * the xTypeExtension nodes because @external is not allowed on base types.
 */
export const tagUsedWithExternal = ({
  name: serviceName,
  typeDefs,
}: ServiceDefinition) => {
  const errors: GraphQLError[] = [];

  visit(typeDefs, {
    ObjectTypeExtension: fieldsVisitor,
    InterfaceTypeExtension: fieldsVisitor,
  });

  function fieldsVisitor(
    typeDefinition:
      | ObjectTypeExtensionNode
      | InterfaceTypeExtensionNode,
  ) {
    if (!typeDefinition.fields) return;
    for (const fieldDefinition of typeDefinition.fields) {
      const tagDirectives = findDirectivesOnNode(fieldDefinition, 'tag');
      const hasTagDirective = tagDirectives.length > 0;
      const hasExternalDirective =
        findDirectivesOnNode(fieldDefinition, 'external').length > 0;
      if (hasTagDirective && hasExternalDirective) {
        errors.push(
          errorWithCode(
            'TAG_USED_WITH_EXTERNAL',
            logServiceAndType(
              serviceName,
              typeDefinition.name.value,
              fieldDefinition.name.value,
            ) +
              `Found illegal use of @tag directive. @tag directives cannot currently be used in tandem with an @external directive.`,
            tagDirectives,
          ),
        );
      }
    }
  }

  return errors;
};
