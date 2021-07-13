import { HEALTH_CHECK_QUERY, HEALTH_CHECK_QUERY_OPERATION_NAME, SERVICE_DEFINITION_QUERY } from '@apollo/gateway';
import nock from 'nock';
import { MockService } from './legacyNetworkRequests.test';

export const graphId = 'federated-service';
export const apiKeyHash = 'dd55a79d467976346d229a7b12b673ce';
const storageSecret = 'my-storage-secret';
const accountsService = 'accounts';

// Service mocks
function mockSdlQuery({ url }: MockService) {
  return nock(url).post('/', {
    query: SERVICE_DEFINITION_QUERY,
  });
}

export function mockSdlQuerySuccess(service: MockService) {
  mockSdlQuery(service).reply(200, {
    data: { _service: { sdl: service.sdl } },
  });
}

export function mockServiceHealthCheck({ url }: MockService) {
  return nock(url).post('/', {
    query: HEALTH_CHECK_QUERY,
    operationName: HEALTH_CHECK_QUERY_OPERATION_NAME,
  });
}

export function mockServiceHealthCheckSuccess(service: MockService) {
  return mockServiceHealthCheck(service).reply(200, {
    data: { __typename: 'Query' },
  });
}

// GCS mocks
function gcsNock(url: Parameters<typeof nock>[0]): nock.Scope {
  const { name, version } = require('../../../package.json');
  return nock(url, {
    reqheaders: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
  });
}

export function mockStorageSecret() {
  return gcsNock('https://storage-secrets.api.apollographql.com:443').get(
    `/${graphId}/storage-secret/${apiKeyHash}.json`,
  );
}

export function mockStorageSecretSuccess() {
  return gcsNock('https://storage-secrets.api.apollographql.com:443')
    .get(`/${graphId}/storage-secret/${apiKeyHash}.json`)
    .reply(200, `"${storageSecret}"`);
}

// get composition config link, using received storage secret
export function mockCompositionConfigLink() {
  return gcsNock('https://federation.api.apollographql.com:443').get(
    `/${storageSecret}/current/v1/composition-config-link`,
  );
}

export function mockCompositionConfigLinkSuccess() {
  return mockCompositionConfigLink().reply(200, {
    configPath: `${storageSecret}/current/v1/composition-configs/composition-config-path.json`,
  });
}

// get composition configs, using received composition config link
export function mockCompositionConfigs() {
  return gcsNock('https://federation.api.apollographql.com:443').get(
    `/${storageSecret}/current/v1/composition-configs/composition-config-path.json`,
  );
}

export function mockCompositionConfigsSuccess(services: MockService[]) {
  return mockCompositionConfigs().reply(200, {
    implementingServiceLocations: services.map((service) => ({
      name: accountsService,
      path: `${storageSecret}/current/v1/implementing-services/${accountsService}/${service.gcsDefinitionPath}`,
    })),
  });
}

// get implementing service reference, using received composition-config
export function mockImplementingServices({ gcsDefinitionPath }: MockService) {
  return gcsNock('https://federation.api.apollographql.com:443').get(
    `/${storageSecret}/current/v1/implementing-services/${accountsService}/${gcsDefinitionPath}`,
  );
}

export function mockImplementingServicesSuccess(service: MockService) {
  return mockImplementingServices(service).reply(200, {
    name: accountsService,
    partialSchemaPath: `${storageSecret}/current/raw-partial-schemas/${service.partialSchemaPath}`,
    url: service.url,
  });
}

// get raw-partial-schema, using received composition-config
export function mockRawPartialSchema({ partialSchemaPath }: MockService) {
  return gcsNock('https://federation.api.apollographql.com:443').get(
    `/${storageSecret}/current/raw-partial-schemas/${partialSchemaPath}`,
  );
}

export function mockRawPartialSchemaSuccess(service: MockService) {
  return mockRawPartialSchema(service).reply(200, service.sdl);
}
