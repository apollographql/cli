import {
  GraphQLService,
  Unsubscriber,
} from 'apollo-server-core';
import {
  GraphQLExecutionResult,
  Logger,
  GraphQLRequestContextExecutionDidStart,
} from 'apollo-server-types';
import { InMemoryLRUCache } from 'apollo-server-caching';
import {
  isObjectType,
  isIntrospectionType,
  GraphQLSchema,
  VariableDefinitionNode,
  DocumentNode,
  print,
  parse,
} from 'graphql';
import {
  composeAndValidate,
  compositionHasErrors,
  ServiceDefinition,
} from '@apollo/federation';
import loglevel from 'loglevel';

import { buildOperationContext, OperationContext } from './operationContext';
import {
  executeQueryPlan,
  ServiceMap,
  defaultFieldResolverWithAliasSupport,
} from './executeQueryPlan';

import { getServiceDefinitionsFromRemoteEndpoint } from './loadServicesFromRemoteEndpoint';
import { GraphQLDataSource } from './datasources/types';
import { RemoteGraphQLDataSource } from './datasources/RemoteGraphQLDataSource';
import { getVariableValues } from 'graphql/execution/values';
import fetcher from 'make-fetch-happen';
import { HttpRequestCache } from './cache';
import { fetch } from 'apollo-server-env';
import {
  QueryPlanner,
  QueryPlan,
  prettyFormatQueryPlan,
} from '@apollo/query-planner';
import {
  ServiceEndpointDefinition,
  Experimental_DidFailCompositionCallback,
  Experimental_DidResolveQueryPlanCallback,
  Experimental_DidUpdateCompositionCallback,
  Experimental_UpdateComposition,
  CompositionInfo,
  GatewayConfig,
  StaticGatewayConfig,
  RemoteGatewayConfig,
  ManagedGatewayConfig,
  isManuallyManagedConfig,
  isLocalConfig,
  isRemoteConfig,
  isManagedConfig,
  isDynamicConfig,
  isStaticConfig,
  CompositionMetadata,
  isSupergraphSdlUpdate,
  isServiceDefinitionUpdate,
  ServiceDefinitionUpdate,
  SupergraphSdlUpdate,
  CompositionUpdate,
  isPrecomposedManagedConfig,
} from './config';
import { loadSupergraphSdlFromStorage } from './loadSupergraphSdlFromStorage';
import { getServiceDefinitionsFromStorage } from './legacyLoadServicesFromStorage';
import { buildComposedSchema } from '@apollo/query-planner';
import { SpanStatusCode } from "@opentelemetry/api";
import { OpenTelemetrySpanNames, tracer } from "./utilities/opentelemetry";

type DataSourceMap = {
  [serviceName: string]: { url?: string; dataSource: GraphQLDataSource };
};

// Local state to track whether particular UX-improving warning messages have
// already been emitted.  This is particularly useful to prevent recurring
// warnings of the same type in, e.g. repeating timers, which don't provide
// additional value when they are repeated over and over during the life-time
// of a server.
type WarnedStates = {
  remoteWithLocalConfig?: boolean;
};

export function getDefaultFetcher() {
  const { name, version } = require('../package.json');
  return fetcher.defaults({
    cacheManager: new HttpRequestCache(),
    // All headers should be lower-cased here, as `make-fetch-happen`
    // treats differently cased headers as unique (unlike the `Headers` object).
    // @see: https://git.io/JvRUa
    headers: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
    retry: {
      retries: 5,
      // The default factor: expected attempts at 0, 1, 3, 7, 15, and 31 seconds elapsed
      factor: 2,
      // 1 second
      minTimeout: 1000,
      randomize: true,
    },
  });
}

/**
 * TODO(trevor:cloudconfig): Stop exporting this
 * @deprecated This will be removed in a future version of @apollo/gateway
 */
export const getDefaultGcsFetcher = getDefaultFetcher;
/**
 * TODO(trevor:cloudconfig): Stop exporting this
 * @deprecated This will be removed in a future version of @apollo/gateway
 */
export const GCS_RETRY_COUNT = 5;

export const HEALTH_CHECK_QUERY =
  'query __ApolloServiceHealthCheck__ { __typename }';
export const SERVICE_DEFINITION_QUERY =
  'query __ApolloGetServiceDefinition__ { _service { sdl } }';

type GatewayState =
  | { phase: 'initialized' }
  | { phase: 'failed to load' }
  | { phase: 'loaded' }
  | { phase: 'stopping'; stoppingDonePromise: Promise<void> }
  | { phase: 'stopped' }
  | {
      phase: 'waiting to poll';
      pollWaitTimer: NodeJS.Timer;
      doneWaiting: () => void;
    }
  | { phase: 'polling'; pollingDonePromise: Promise<void> };

// We want to be compatible with `load()` as called by both AS2 and AS3, so we
// define its argument types ourselves instead of relying on imports.

// This is what AS3's ApolloConfig looks like; it's what we'll save internally.
interface ApolloConfigFromAS3 {
  key?: string;
  keyHash?: string;
  graphRef?: string;
}

// This interface matches what we may receive from either version. We convert it
// to ApolloConfigFromAS3.
interface ApolloConfigFromAS2Or3 {
  key?: string;
  keyHash?: string;
  graphRef?: string;
  graphId?: string;
  graphVariant?: string;
}

// This interface was the only way this data was provided prior to AS 2.18; it
// is being removed in AS 3, so we define our own version.
interface GraphQLServiceEngineConfig {
  apiKeyHash: string;
  graphId: string;
  graphVariant?: string;
};


export class ApolloGateway implements GraphQLService {
  public schema?: GraphQLSchema;
  private serviceMap: DataSourceMap = Object.create(null);
  private config: GatewayConfig;
  private logger: Logger;
  private queryPlanStore: InMemoryLRUCache<QueryPlan>;
  private apolloConfig?: ApolloConfigFromAS3;
  private onSchemaChangeListeners = new Set<(schema: GraphQLSchema) => void>();
  private onSchemaLoadOrUpdateListeners = new Set<
    (schemaContext: {
      apiSchema: GraphQLSchema;
      coreSupergraphSdl: string;
    }) => void
  >();
  private serviceDefinitions: ServiceDefinition[] = [];
  private compositionMetadata?: CompositionMetadata;
  private serviceSdlCache = new Map<string, string>();
  private warnedStates: WarnedStates = Object.create(null);
  private queryPlanner?: QueryPlanner;
  private parsedSupergraphSdl?: DocumentNode;
  private fetcher: typeof fetch;
  private compositionId?: string;
  private state: GatewayState;

  // Observe query plan, service info, and operation info prior to execution.
  // The information made available here will give insight into the resulting
  // query plan and the inputs that generated it.
  private experimental_didResolveQueryPlan?: Experimental_DidResolveQueryPlanCallback;
  // Observe composition failures and the ServiceList that caused them. This
  // enables reporting any issues that occur during composition. Implementors
  // will be interested in addressing these immediately.
  private experimental_didFailComposition?: Experimental_DidFailCompositionCallback;
  // Used to communicated composition changes, and what definitions caused
  // those updates
  private experimental_didUpdateComposition?: Experimental_DidUpdateCompositionCallback;
  // Used for overriding the default service list fetcher. This should return
  // an array of ServiceDefinition. *This function must be awaited.*
  private updateServiceDefinitions: Experimental_UpdateComposition;
  // how often service defs should be loaded/updated (in ms)
  private experimental_pollInterval?: number;
  // Configure the endpoint by which gateway will access its precomposed schema.
  // For now, `null` is default and means to continue using the legacy managed mode.
  // TODO(trevor:cloudconfig): `null` should be disallowed in the future.
  private experimental_schemaConfigDeliveryEndpoint: string | null;

  constructor(config?: GatewayConfig) {
    this.config = {
      // TODO: expose the query plan in a more flexible JSON format in the future
      // and remove this config option in favor of `exposeQueryPlan`. Playground
      // should cutover to use the new option when it's built.
      __exposeQueryPlanExperimental: process.env.NODE_ENV !== 'production',
      ...config,
    };

    this.logger = this.initLogger();
    this.queryPlanStore = this.initQueryPlanStore(
      config?.experimental_approximateQueryPlanStoreMiB,
    );
    this.fetcher = config?.fetcher || getDefaultFetcher();

    // set up experimental observability callbacks and config settings
    this.experimental_didResolveQueryPlan =
      config?.experimental_didResolveQueryPlan;
    this.experimental_didFailComposition =
      config?.experimental_didFailComposition;
    this.experimental_didUpdateComposition =
      config?.experimental_didUpdateComposition;

    this.experimental_pollInterval = config?.experimental_pollInterval;

    // Do not use this unless advised by Apollo staff to do so
    // 1. If config is explicitly set to a `string` or `null` in code, use it
    // 2. Else, if the env var is set, use that
    // 3. Else, default to `null`
    this.experimental_schemaConfigDeliveryEndpoint = isPrecomposedManagedConfig(
      this.config,
    )
      ? this.config.experimental_schemaConfigDeliveryEndpoint
      : this.config.experimental_schemaConfigDeliveryEndpoint === null
      ? null
      : process.env.APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT ?? null;

    if (isManuallyManagedConfig(this.config)) {
      // Use the provided updater function if provided by the user, else default
      if ('experimental_updateSupergraphSdl' in this.config) {
        this.updateServiceDefinitions =
          this.config.experimental_updateSupergraphSdl;
      } else if ('experimental_updateServiceDefinitions' in this.config) {
        this.updateServiceDefinitions =
          this.config.experimental_updateServiceDefinitions;
      } else {
        throw Error(
          'Programming error: unexpected manual configuration provided',
        );
      }
    } else {
      this.updateServiceDefinitions = this.loadServiceDefinitions;
    }

    if (isDynamicConfig(this.config)) {
      this.issueDynamicWarningsIfApplicable();
    }

    this.state = { phase: 'initialized' };
  }

  private initLogger() {
    // Setup logging facilities
    if (this.config.logger) {
      return this.config.logger;
    }

    // If the user didn't provide their own logger, we'll initialize one.
    const loglevelLogger = loglevel.getLogger(`apollo-gateway`);

    // And also support the `debug` option, if it's truthy.
    if (this.config.debug === true) {
      loglevelLogger.setLevel(loglevelLogger.levels.DEBUG);
    } else {
      loglevelLogger.setLevel(loglevelLogger.levels.WARN);
    }

    return loglevelLogger;
  }

  private initQueryPlanStore(approximateQueryPlanStoreMiB?: number) {
    return new InMemoryLRUCache<QueryPlan>({
      // Create ~about~ a 30MiB InMemoryLRUCache.  This is less than precise
      // since the technique to calculate the size of a DocumentNode is
      // only using JSON.stringify on the DocumentNode (and thus doesn't account
      // for unicode characters, etc.), but it should do a reasonable job at
      // providing a caching document store for most operations.
      maxSize: Math.pow(2, 20) * (approximateQueryPlanStoreMiB || 30),
      sizeCalculator: approximateObjectSize,
    });
  }

  private issueDynamicWarningsIfApplicable() {
    // Warn against a pollInterval of < 10s in managed mode and reset it to 10s
    if (
      isManagedConfig(this.config) &&
      this.config.experimental_pollInterval &&
      this.config.experimental_pollInterval < 10000
    ) {
      this.experimental_pollInterval = 10000;
      this.logger.warn(
        'Polling Apollo services at a frequency of less than once per 10 ' +
          'seconds (10000) is disallowed. Instead, the minimum allowed ' +
          'pollInterval of 10000 will be used. Please reconfigure your ' +
          'experimental_pollInterval accordingly. If this is problematic for ' +
          'your team, please contact support.',
      );
    }

    // Warn against using the pollInterval and a serviceList simultaneously
    if (this.config.experimental_pollInterval && isRemoteConfig(this.config)) {
      this.logger.warn(
        'Polling running services is dangerous and not recommended in production. ' +
          'Polling should only be used against a registry. ' +
          'If you are polling running services, use with caution.',
      );
    }

    if (
      isManuallyManagedConfig(this.config) &&
      'experimental_updateSupergraphSdl' in this.config &&
      'experimental_updateServiceDefinitions' in this.config
    ) {
      this.logger.warn(
        'Gateway found two manual update configurations when only one should be ' +
          'provided. Gateway will default to using the provided `experimental_updateSupergraphSdl` ' +
          'function when both `experimental_updateSupergraphSdl` and experimental_updateServiceDefinitions` ' +
          'are provided.',
      );
    }
  }

  public async load(options?: {
    apollo?: ApolloConfigFromAS2Or3;
    engine?: GraphQLServiceEngineConfig;
  }) {
    if (this.state.phase !== 'initialized') {
      throw Error(
        `ApolloGateway.load called in surprising state ${this.state.phase}`,
      );
    }
    if (options?.apollo) {
      const { key, keyHash, graphRef, graphId, graphVariant } = options.apollo;
      this.apolloConfig = {
        key,
        keyHash,
        graphRef:
          graphRef ??
          (graphId ? `${graphId}@${graphVariant ?? 'current'}` : undefined),
      };
    } else if (options?.engine) {
      // Older version of apollo-server-core that isn't passing 'apollo' yet.
      const { apiKeyHash, graphId, graphVariant } = options.engine;
      this.apolloConfig = {
        keyHash: apiKeyHash,
        graphRef: graphId
          ? `${graphId}@${graphVariant ?? 'current'}`
          : undefined,
      };
    }

    // Before @apollo/gateway v0.23, ApolloGateway didn't expect stop() to be
    // called after it started. The only thing that stop() did at that point was
    // cancel the poll timer, and so to prevent that timer from keeping an
    // otherwise-finished Node process alive, ApolloGateway unconditionally
    // called unref() on that timeout. As part of making the ApolloGateway
    // lifecycle more predictable and concrete (and to allow for a future where
    // there are other reasons to make sure to explicitly stop your gateway),
    // v0.23 tries to avoid calling unref().
    //
    // Apollo Server v2.20 and newer calls gateway.stop() from its stop()
    // method, so as long as you're using v2.20, ApolloGateway won't keep
    // running after you stop your server, and your Node process can shut down.
    // To make this change a bit less backwards-incompatible, we detect if it
    // looks like you're using an older version of Apollo Server; if so, we
    // still call unref(). Specifically: Apollo Server has always passed an
    // options object to load(), and before v2.18 it did not pass the `apollo`
    // key on it. So if we detect that particular pattern, we assume we're with
    // pre-v2.18 Apollo Server and we still call unref(). So this will be a
    // behavior change only for:
    // - non-Apollo-Server uses of ApolloGateway (where you can add your own
    //   call to gateway.stop())
    // - Apollo Server v2.18 and v2.19 (where you can either do the small
    //   compatible upgrade or add your own call to gateway.stop())
    // - if you don't call stop() on your ApolloServer (but in that case other
    //   things like usage reporting will also stop shutdown, so you should fix
    //   that)
    const unrefTimer = !!options && !options.apollo;

    this.maybeWarnOnConflictingConfig();

    // Handles initial assignment of `this.schema`, `this.queryPlanner`
    isStaticConfig(this.config)
      ? this.loadStatic(this.config)
      : await this.loadDynamic(unrefTimer);

    const mode = isManagedConfig(this.config) ? 'managed' : 'unmanaged';
    this.logger.info(
      `Gateway successfully loaded schema.\n\t* Mode: ${mode}${
        this.apolloConfig && this.apolloConfig.graphRef
          ? `\n\t* Service: ${this.apolloConfig.graphRef}`
          : ''
      }`,
    );

    return {
      schema: this.schema!,
      executor: this.executor,
    };
  }

  // Synchronously load a statically configured schema, update class instance's
  // schema and query planner.
  private loadStatic(config: StaticGatewayConfig) {
    let schema: GraphQLSchema;
    let supergraphSdl: string;
    try {
      ({ schema, supergraphSdl } = isLocalConfig(config)
        ? this.createSchemaFromServiceList(config.localServiceList)
        : this.createSchemaFromSupergraphSdl(config.supergraphSdl));
    } catch (e) {
      this.state = { phase: 'failed to load' };
      throw e;
    }

    // TODO(trevor): #580 redundant parse
    this.parsedSupergraphSdl = parse(supergraphSdl);
    this.updateWithSchemaAndNotify(schema, supergraphSdl, true);
    this.state = { phase: 'loaded' };
  }

  // Asynchronously load a dynamically configured schema. `this.updateSchema`
  // is responsible for updating the class instance's schema and query planner.
  private async loadDynamic(unrefTimer: boolean) {
    try {
      await this.updateSchema();
    } catch (e) {
      this.state = { phase: 'failed to load' };
      throw e;
    }

    this.state = { phase: 'loaded' };
    if (this.shouldBeginPolling()) {
      this.pollServices(unrefTimer);
    }
  }

  private shouldBeginPolling() {
    return isManagedConfig(this.config) || this.experimental_pollInterval;
  }

  private async updateSchema(): Promise<void> {
    this.logger.debug('Checking for composition updates...');

    // This may throw, but an error here is caught and logged upstream
    const result = await this.updateServiceDefinitions(this.config);

    if (isSupergraphSdlUpdate(result)) {
      await this.updateWithSupergraphSdl(result);
    } else if (isServiceDefinitionUpdate(result)) {
      await this.updateByComposition(result);
    } else {
      throw new Error(
        'Programming error: unexpected result type from `updateServiceDefinitions`',
      );
    }
  }

  private async updateByComposition(
    result: ServiceDefinitionUpdate,
  ): Promise<void> {
    if (
      !result.serviceDefinitions ||
      JSON.stringify(this.serviceDefinitions) ===
        JSON.stringify(result.serviceDefinitions)
    ) {
      this.logger.debug('No change in service definitions since last check.');
      return;
    }

    const previousSchema = this.schema;
    const previousServiceDefinitions = this.serviceDefinitions;
    const previousCompositionMetadata = this.compositionMetadata;

    if (previousSchema) {
      this.logger.info('New service definitions were found.');
    }

    await this.maybePerformServiceHealthCheck(result);

    this.compositionMetadata = result.compositionMetadata;
    this.serviceDefinitions = result.serviceDefinitions;

    const { schema, supergraphSdl } = this.createSchemaFromServiceList(
      result.serviceDefinitions,
    );

    if (!supergraphSdl) {
      this.logger.error(
        "A valid schema couldn't be composed. Falling back to previous schema.",
      );
    } else {
      this.updateWithSchemaAndNotify(schema, supergraphSdl);

      if (this.experimental_didUpdateComposition) {
        this.experimental_didUpdateComposition(
          {
            serviceDefinitions: result.serviceDefinitions,
            schema,
            ...(this.compositionMetadata && {
              compositionMetadata: this.compositionMetadata,
            }),
          },
          previousServiceDefinitions &&
            previousSchema && {
              serviceDefinitions: previousServiceDefinitions,
              schema: previousSchema,
              ...(previousCompositionMetadata && {
                compositionMetadata: previousCompositionMetadata,
              }),
            },
        );
      }
    }
  }

  private async updateWithSupergraphSdl(
    result: SupergraphSdlUpdate,
  ): Promise<void> {
    if (result.id === this.compositionId) {
      this.logger.debug('No change in composition since last check.');
      return;
    }

    // TODO(trevor): #580 redundant parse
    // This may throw, so we'll calculate early (specifically before making any updates)
    // In the case that it throws, the gateway will:
    //   * on initial load, throw the error
    //   * on update, log the error and don't update
    const parsedSupergraphSdl = parse(result.supergraphSdl);

    const previousSchema = this.schema;
    const previousSupergraphSdl = this.parsedSupergraphSdl;
    const previousCompositionId = this.compositionId;

    if (previousSchema) {
      this.logger.info('Updated Supergraph SDL was found.');
    }

    await this.maybePerformServiceHealthCheck(result);

    this.compositionId = result.id;
    this.parsedSupergraphSdl = parsedSupergraphSdl;

    const { schema, supergraphSdl } = this.createSchemaFromSupergraphSdl(
      result.supergraphSdl,
    );

    if (!supergraphSdl) {
      this.logger.error(
        "A valid schema couldn't be composed. Falling back to previous schema.",
      );
    } else {
      this.updateWithSchemaAndNotify(schema, supergraphSdl);

      if (this.experimental_didUpdateComposition) {
        this.experimental_didUpdateComposition(
          {
            compositionId: result.id,
            supergraphSdl: result.supergraphSdl,
            schema,
          },
          previousCompositionId && previousSupergraphSdl && previousSchema
            ? {
                compositionId: previousCompositionId,
                supergraphSdl: print(previousSupergraphSdl),
                schema: previousSchema,
              }
            : undefined,
        );
      }
    }
  }

  // TODO: We should consolidate "schema derived data" state as we've done in Apollo Server to
  //       ensure we do not forget to update some of that state, and to avoid scenarios where
  //       concurrently executing code sees partially-updated state.
  private updateWithSchemaAndNotify(
    schema: GraphQLSchema,
    supergraphSdl: string,
    // Once we remove the deprecated onSchemaChange() method, we can remove this.
    legacyDontNotifyOnSchemaChangeListeners: boolean = false,
  ): void {
    if (this.queryPlanStore) this.queryPlanStore.flush();
    this.schema = schema;
    this.queryPlanner = new QueryPlanner(schema);

    // Notify onSchemaChange listeners of the updated schema
    if (!legacyDontNotifyOnSchemaChangeListeners) {
      this.onSchemaChangeListeners.forEach((listener) => {
        try {
          listener(schema);
        } catch (e) {
          this.logger.error(
            "An error was thrown from an 'onSchemaChange' listener. " +
              'The schema will still update: ' +
              ((e && e.message) || e),
          );
        }
      });
    }

    // Notify onSchemaLoadOrUpdate listeners of the updated schema
    this.onSchemaLoadOrUpdateListeners.forEach((listener) => {
      try {
        listener({
          apiSchema: schema,
          coreSupergraphSdl: supergraphSdl,
        });
      } catch (e) {
        this.logger.error(
          "An error was thrown from an 'onSchemaLoadOrUpdate' listener. " +
            'The schema will still update: ' +
            ((e && e.message) || e),
        );
      }
    });
  }

  private async maybePerformServiceHealthCheck(update: CompositionUpdate) {
    // Run service health checks before we commit and update the new schema.
    // This is the last chance to bail out of a schema update.
    if (this.config.serviceHealthCheck) {
      const serviceList = isSupergraphSdlUpdate(update)
        ? // TODO(trevor): #580 redundant parse
          // Parsing could technically fail and throw here, but parseability has
          // already been confirmed slightly earlier in the code path
          this.serviceListFromSupergraphSdl(parse(update.supergraphSdl))
        : // Existence of this is determined in advance with an early return otherwise
          update.serviceDefinitions!;
      // Here we need to construct new datasources based on the new schema info
      // so we can check the health of the services we're _updating to_.
      const serviceMap = serviceList.reduce((serviceMap, serviceDef) => {
        serviceMap[serviceDef.name] = {
          url: serviceDef.url,
          dataSource: this.createDataSource(serviceDef),
        };
        return serviceMap;
      }, Object.create(null) as DataSourceMap);

      try {
        await this.serviceHealthCheck(serviceMap);
      } catch (e) {
        throw new Error(
          'The gateway did not update its schema due to failed service health checks. ' +
            'The gateway will continue to operate with the previous schema and reattempt updates. ' +
            'The following error occurred during the health check:\n' +
            e.message,
        );
      }
    }
  }

  /**
   * This can be used without an argument in order to perform an ad-hoc health check
   * of the downstream services like so:
   *
   * @example
   * ```
   * try {
   *   await gateway.serviceHealthCheck();
   * } catch(e) {
   *   /* your error handling here *\/
   * }
   * ```
   * @throws
   * @param serviceMap {DataSourceMap}
   */
  public serviceHealthCheck(serviceMap: DataSourceMap = this.serviceMap) {
    return Promise.all(
      Object.entries(serviceMap).map(([name, { dataSource }]) =>
        dataSource
          .process({ request: { query: HEALTH_CHECK_QUERY }, context: {} })
          .then((response) => ({ name, response }))
          .catch((e) => {
            throw new Error(`[${name}]: ${e.message}`);
          }),
      ),
    );
  }

  private createSchemaFromServiceList(serviceList: ServiceDefinition[]) {
    this.logger.debug(
      `Composing schema from service list: \n${serviceList
        .map(({ name, url }) => `  ${url || 'local'}: ${name}`)
        .join('\n')}`,
    );

    const compositionResult = composeAndValidate(serviceList);

    if (compositionHasErrors(compositionResult)) {
      const { errors } = compositionResult;
      if (this.experimental_didFailComposition) {
        this.experimental_didFailComposition({
          errors,
          serviceList,
          ...(this.compositionMetadata && {
            compositionMetadata: this.compositionMetadata,
          }),
        });
      }
      throw Error(
        "A valid schema couldn't be composed. The following composition errors were found:\n" +
          errors.map((e) => '\t' + e.message).join('\n'),
      );
    } else {
      const { supergraphSdl } = compositionResult;
      this.createServices(serviceList);

      const schema = buildComposedSchema(parse(supergraphSdl));

      this.logger.debug('Schema loaded and ready for execution');

      // This is a workaround for automatic wrapping of all fields, which Apollo
      // Server does in the case of implementing resolver wrapping for plugins.
      // Here we wrap all fields with support for resolving aliases as part of the
      // root value which happens because aliases are resolved by sub services and
      // the shape of the root value already contains the aliased fields as
      // responseNames
      return {
        schema: wrapSchemaWithAliasResolver(schema),
        supergraphSdl,
      };
    }
  }

  private serviceListFromSupergraphSdl(
    supergraphSdl: DocumentNode,
  ): Omit<ServiceDefinition, 'typeDefs'>[] {
    const schema = buildComposedSchema(supergraphSdl);
    return this.serviceListFromComposedSchema(schema);
  }

  private serviceListFromComposedSchema(schema: GraphQLSchema) {
    const graphMap = schema.extensions?.federation?.graphs;
    if (!graphMap) {
      throw Error(`Couldn't find graph map in composed schema`);
    }

    return Array.from(graphMap.values());
  }

  private createSchemaFromSupergraphSdl(supergraphSdl: string) {
    // TODO(trevor): #580 redundant parse
    this.parsedSupergraphSdl = parse(supergraphSdl);

    const schema = buildComposedSchema(this.parsedSupergraphSdl);

    const serviceList = this.serviceListFromComposedSchema(schema);

    this.createServices(serviceList);

    return {
      schema: wrapSchemaWithAliasResolver(schema),
      supergraphSdl,
    };
  }

  /**
   * @deprecated Please use `onSchemaLoadOrUpdate` instead.
   */
  public onSchemaChange(
    callback: (schema: GraphQLSchema) => void,
  ): Unsubscriber {
    this.onSchemaChangeListeners.add(callback);

    return () => {
      this.onSchemaChangeListeners.delete(callback);
    };
  }

  public onSchemaLoadOrUpdate(
    callback: (schemaContext: {
      apiSchema: GraphQLSchema;
      coreSupergraphSdl: string;
    }) => void,
  ): Unsubscriber {
    this.onSchemaLoadOrUpdateListeners.add(callback);

    return () => {
      this.onSchemaLoadOrUpdateListeners.delete(callback);
    };
  }

  // This function waits an appropriate amount, updates composition, and calls itself
  // again. Note that it is an async function whose Promise is not actually awaited;
  // it should never throw itself other than due to a bug in its state machine.
  private async pollServices(unrefTimer: boolean) {
    switch (this.state.phase) {
      case 'stopping':
      case 'stopped':
      case 'failed to load':
        return;
      case 'initialized':
        throw Error('pollServices should not be called before load!');
      case 'polling':
        throw Error(
          'pollServices should not be called while in the middle of polling!',
        );
      case 'waiting to poll':
        throw Error(
          'pollServices should not be called while already waiting to poll!',
        );
      case 'loaded':
        // This is the normal case.
        break;
      default:
        throw new UnreachableCaseError(this.state);
    }

    // Transition into 'waiting to poll' and set a timer. The timer resolves the
    // Promise we're awaiting here; note that calling stop() also can resolve
    // that Promise.
    await new Promise<void>((doneWaiting) => {
      this.state = {
        phase: 'waiting to poll',
        doneWaiting,
        pollWaitTimer: setTimeout(() => {
          // Note that we might be in 'stopped', in which case we just do
          // nothing.
          if (this.state.phase == 'waiting to poll') {
            this.state.doneWaiting();
          }
        }, this.experimental_pollInterval || 10000),
      };
      if (unrefTimer) {
        this.state.pollWaitTimer.unref();
      }
    });

    // If we've been stopped, then we're done. The cast here is because TS
    // doesn't understand that this.state can change during the await
    // (https://github.com/microsoft/TypeScript/issues/9998).
    if ((this.state as GatewayState).phase !== 'waiting to poll') {
      return;
    }

    let pollingDone: () => void;
    this.state = {
      phase: 'polling',
      pollingDonePromise: new Promise<void>((res) => {
        pollingDone = res;
      }),
    };

    try {
      await this.updateSchema();
    } catch (err) {
      this.logger.error((err && err.message) || err);
    }

    if (this.state.phase === 'polling') {
      // If we weren't stopped, we should transition back to the initial 'loading' state and trigger
      // another call to itself. (Do that in a setImmediate to avoid unbounded stack sizes.)
      this.state = { phase: 'loaded' };
      setImmediate(() => this.pollServices(unrefTimer));
    }

    // Whether we were stopped or not, let any concurrent stop() call finish.
    pollingDone!();
  }

  private createAndCacheDataSource(
    serviceDef: ServiceEndpointDefinition,
  ): GraphQLDataSource {
    // If the DataSource has already been created, early return
    if (
      this.serviceMap[serviceDef.name] &&
      serviceDef.url === this.serviceMap[serviceDef.name].url
    )
      return this.serviceMap[serviceDef.name].dataSource;

    const dataSource = this.createDataSource(serviceDef);

    // Cache the created DataSource
    this.serviceMap[serviceDef.name] = { url: serviceDef.url, dataSource };

    return dataSource;
  }

  private createDataSource(
    serviceDef: ServiceEndpointDefinition,
  ): GraphQLDataSource {
    if (!serviceDef.url && !isLocalConfig(this.config)) {
      this.logger.error(
        `Service definition for service ${serviceDef.name} is missing a url`,
      );
    }

    return this.config.buildService
      ? this.config.buildService(serviceDef)
      : new RemoteGraphQLDataSource({
          url: serviceDef.url,
        });
  }

  private createServices(services: ServiceEndpointDefinition[]) {
    for (const serviceDef of services) {
      this.createAndCacheDataSource(serviceDef);
    }
  }

  protected async loadServiceDefinitions(
    config: RemoteGatewayConfig | ManagedGatewayConfig,
  ): Promise<CompositionUpdate> {
    if (isRemoteConfig(config)) {
      const serviceList = config.serviceList.map((serviceDefinition) => ({
        ...serviceDefinition,
        dataSource: this.createAndCacheDataSource(serviceDefinition),
      }));

      return getServiceDefinitionsFromRemoteEndpoint({
        serviceList,
        async getServiceIntrospectionHeaders(service) {
          return typeof config.introspectionHeaders === 'function'
            ? await config.introspectionHeaders(service)
            : config.introspectionHeaders;
        },
        serviceSdlCache: this.serviceSdlCache,
      });
    }

    const canUseManagedConfig =
      this.apolloConfig?.graphRef && this.apolloConfig?.keyHash;
    if (!canUseManagedConfig) {
      throw new Error(
        'When a manual configuration is not provided, gateway requires an Apollo ' +
          'configuration. See https://www.apollographql.com/docs/apollo-server/federation/managed-federation/ ' +
          'for more information. Manual configuration options include: ' +
          '`serviceList`, `supergraphSdl`, and `experimental_updateServiceDefinitions`.',
      );
    }

    // TODO(trevor:cloudconfig): This condition goes away completely
    if (
      !this.experimental_schemaConfigDeliveryEndpoint &&
      !isPrecomposedManagedConfig(config)
    ) {
      return getServiceDefinitionsFromStorage({
        graphRef: this.apolloConfig!.graphRef!,
        apiKeyHash: this.apolloConfig!.keyHash!,
        federationVersion: config.federationVersion || 1,
        fetcher: this.fetcher,
      });
    }

    return loadSupergraphSdlFromStorage({
      graphRef: this.apolloConfig!.graphRef!,
      apiKey: this.apolloConfig!.key!,
      endpoint: this.experimental_schemaConfigDeliveryEndpoint!,
      fetcher: this.fetcher,
    });
  }

  private maybeWarnOnConflictingConfig() {
    const canUseManagedConfig =
      this.apolloConfig?.graphRef && this.apolloConfig?.keyHash;

    // This might be a bit confusing just by reading, but `!isManagedConfig` just
    // means it's any of the other types of config. If it's any other config _and_
    // we have a studio config available (`canUseManagedConfig`) then we have a
    // conflict.
    if (
      !isManagedConfig(this.config) &&
      canUseManagedConfig &&
      !this.warnedStates.remoteWithLocalConfig
    ) {
      // Only display this warning once per start-up.
      this.warnedStates.remoteWithLocalConfig = true;
      // This error helps avoid common misconfiguration.
      // We don't await this because a local configuration should assume
      // remote is unavailable for one reason or another.
      this.logger.warn(
        'A local gateway configuration is overriding a managed federation ' +
          'configuration.  To use the managed ' +
          'configuration, do not specify a service list or supergraphSdl locally.',
      );
    }
  }

  // XXX Nothing guarantees that the only errors thrown or returned in
  // result.errors are GraphQLErrors, even though other code (eg
  // ApolloServerPluginUsageReporting) assumes that. In fact, errors talking to backends
  // are unlikely to show up as GraphQLErrors. Do we need to use
  // formatApolloErrors or something?
  public executor = async <TContext>(
    requestContext: GraphQLRequestContextExecutionDidStart<TContext>,
  ): Promise<GraphQLExecutionResult> => {
    return tracer.startActiveSpan(OpenTelemetrySpanNames.REQUEST, async span => {
      try {
        const {request, document, queryHash} = requestContext;
        const queryPlanStoreKey = queryHash + (request.operationName || '');
        const operationContext = buildOperationContext({
          schema: this.schema!,
          operationDocument: document,
          operationName: request.operationName,
        });


        // No need to build a query plan if we know the request is invalid beforehand
        // In the future, this should be controlled by the requestPipeline
        const validationErrors = this.validateIncomingRequest(
            requestContext,
            operationContext,
        );

        if (validationErrors.length > 0) {
          span.setStatus({ code:SpanStatusCode.ERROR });
          return {errors: validationErrors};
        }

        let queryPlan: QueryPlan | undefined;
        if (this.queryPlanStore) {
          queryPlan = await this.queryPlanStore.get(queryPlanStoreKey);
        }

        if (!queryPlan) {
          queryPlan = tracer.startActiveSpan(OpenTelemetrySpanNames.PLAN, span => {
            try {
              // TODO(#631): Can we be sure the query planner has been initialized here?
              return this.queryPlanner!.buildQueryPlan(operationContext, {
                autoFragmentization: Boolean(
                    this.config.experimental_autoFragmentization,
                ),
              });
            }
            catch (err) {
              span.setStatus({ code:SpanStatusCode.ERROR });
              throw err;
            }
            finally {
              span.end();
            }
          });

          if (this.queryPlanStore) {
            // The underlying cache store behind the `documentStore` returns a
            // `Promise` which is resolved (or rejected), eventually, based on the
            // success or failure (respectively) of the cache save attempt.  While
            // it's certainly possible to `await` this `Promise`, we don't care about
            // whether or not it's successful at this point.  We'll instead proceed
            // to serve the rest of the request and just hope that this works out.
            // If it doesn't work, the next request will have another opportunity to
            // try again.  Errors will surface as warnings, as appropriate.
            //
            // While it shouldn't normally be necessary to wrap this `Promise` in a
            // `Promise.resolve` invocation, it seems that the underlying cache store
            // is returning a non-native `Promise` (e.g. Bluebird, etc.).
            Promise.resolve(
                this.queryPlanStore.set(queryPlanStoreKey, queryPlan),
            ).catch((err) =>
                this.logger.warn(
                    'Could not store queryPlan' + ((err && err.message) || err),
                ),
            );
          }
        }

        const serviceMap: ServiceMap = Object.entries(this.serviceMap).reduce(
            (serviceDataSources, [serviceName, {dataSource}]) => {
              serviceDataSources[serviceName] = dataSource;
              return serviceDataSources;
            },
            Object.create(null) as ServiceMap,
        );

        if (this.experimental_didResolveQueryPlan) {
          this.experimental_didResolveQueryPlan({
            queryPlan,
            serviceMap,
            requestContext,
            operationContext,
          });
        }

        const response = await executeQueryPlan<TContext>(
            queryPlan,
            serviceMap,
            requestContext,
            operationContext,
        );

        const shouldShowQueryPlan =
            this.config.__exposeQueryPlanExperimental &&
            request.http &&
            request.http.headers &&
            request.http.headers.get('Apollo-Query-Plan-Experimental');

        // We only want to serialize the query plan if we're going to use it, which is
        // in two cases:
        // 1) non-empty query plan and config.debug === true
        // 2) non-empty query plan and shouldShowQueryPlan === true
        const serializedQueryPlan =
            queryPlan.node && (this.config.debug || shouldShowQueryPlan)
                ? // FIXME: I disabled printing the query plan because this lead to a
                  // circular dependency between the `@apollo/gateway` and
                  // `apollo-federation-integration-testsuite` packages.
                  // We should either solve that or switch Playground to
                  // the JSON serialization format.
                prettyFormatQueryPlan(queryPlan)
                : null;

        if (this.config.debug && serializedQueryPlan) {
          this.logger.debug(serializedQueryPlan);
        }

        if (shouldShowQueryPlan) {
          // TODO: expose the query plan in a more flexible JSON format in the future
          // and rename this to `queryPlan`. Playground should cutover to use the new
          // option once we've built a way to print that representation.

          // In the case that `serializedQueryPlan` is null (on introspection), we
          // still want to respond to Playground with something truthy since it depends
          // on this to decide that query plans are supported by this gateway.
          response.extensions = {
            __queryPlanExperimental: serializedQueryPlan || true,
          };
        }
        if(response.errors) {
          span.setStatus({ code:SpanStatusCode.ERROR });
        }
        return response;
      }
      catch (err) {
        span.setStatus({ code:SpanStatusCode.ERROR });
        throw err;
      }
      finally {
        span.end();
      }
    });
  };

  private validateIncomingRequest<TContext>(
    requestContext: GraphQLRequestContextExecutionDidStart<TContext>,
    operationContext: OperationContext,
  ) {
    return tracer.startActiveSpan(OpenTelemetrySpanNames.VALIDATE, span => {
      try {
        // casting out of `readonly`
        const variableDefinitions = operationContext.operation
            .variableDefinitions as VariableDefinitionNode[] | undefined;

        if (!variableDefinitions) return [];

        const {errors} = getVariableValues(
            operationContext.schema,
            variableDefinitions,
            requestContext.request.variables || {},
        );

        if(errors) {
          span.setStatus({ code:SpanStatusCode.ERROR });
        }
        return errors || [];
      }
      catch (err) {
        span.setStatus({ code:SpanStatusCode.ERROR });
        throw err;
      }
      finally {
        span.end();
      }
    });
  }


  // Stops all processes involved with the gateway (for now, just background
  // schema polling). Can be called multiple times safely. Once it (async)
  // returns, all gateway background activity will be finished.
  public async stop() {
    switch (this.state.phase) {
      case 'initialized':
      case 'failed to load':
        throw Error(
          'ApolloGateway.stop does not need to be called before ApolloGateway.load is called successfully',
        );
      case 'stopped':
        // Calls to stop() are idempotent.
        return;
      case 'stopping':
        await this.state.stoppingDonePromise;
        // The cast here is because TS doesn't understand that this.state can
        // change during the await
        // (https://github.com/microsoft/TypeScript/issues/9998).
        if ((this.state as GatewayState).phase !== 'stopped') {
          throw Error(
            `Expected to be stopped when done stopping, but instead ${this.state.phase}`,
          );
        }
        return;
      case 'loaded':
        this.state = { phase: 'stopped' }; // nothing to do (we're not polling)
        return;
      case 'waiting to poll': {
        // If we're waiting to poll, we can synchronously transition to fully stopped.
        // We will terminate the current pollServices call and it will succeed quickly.
        const doneWaiting = this.state.doneWaiting;
        clearTimeout(this.state.pollWaitTimer);
        this.state = { phase: 'stopped' };
        doneWaiting();
        return;
      }
      case 'polling': {
        // We're in the middle of running updateSchema. We need to go into 'stopping'
        // mode and let this run complete. First we set things up so that any concurrent
        // calls to stop() will wait until we let them finish. (Those concurrent calls shouldn't
        // just wait on pollingDonePromise themselves because we want to make sure we fully
        // transition to state='stopped' before the other call returns.)
        const pollingDonePromise = this.state.pollingDonePromise;
        let stoppingDone: () => void;
        this.state = {
          phase: 'stopping',
          stoppingDonePromise: new Promise<void>((res) => {
            stoppingDone = res;
          }),
        };
        await pollingDonePromise;
        this.state = { phase: 'stopped' };
        stoppingDone!();
        return;
      }
      default:
        throw new UnreachableCaseError(this.state);
    }
  }
}

function approximateObjectSize<T>(obj: T): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

// We can't use transformSchema here because the extension data for query
// planning would be lost. Instead we set a resolver for each field
// in order to counteract GraphQLExtensions preventing a defaultFieldResolver
// from doing the same job
function wrapSchemaWithAliasResolver(schema: GraphQLSchema): GraphQLSchema {
  const typeMap = schema.getTypeMap();
  Object.keys(typeMap).forEach((typeName) => {
    const type = typeMap[typeName];

    if (isObjectType(type) && !isIntrospectionType(type)) {
      const fields = type.getFields();
      Object.keys(fields).forEach((fieldName) => {
        const field = fields[fieldName];
        field.resolve = defaultFieldResolverWithAliasSupport;
      });
    }
  });
  return schema;
}

// Throw this in places that should be unreachable (because all other cases have
// been handled, reducing the type of the argument to `never`). TypeScript will
// complain if in fact there is a valid type for the argument.
class UnreachableCaseError extends Error {
  constructor(val: never) {
    super(`Unreachable case: ${val}`);
  }
}

export {
  executeQueryPlan,
  buildOperationContext,
  ServiceMap,
  Experimental_DidFailCompositionCallback,
  Experimental_DidResolveQueryPlanCallback,
  Experimental_DidUpdateCompositionCallback,
  Experimental_UpdateComposition,
  GatewayConfig,
  ServiceEndpointDefinition,
  CompositionInfo,
};

export * from './datasources';
