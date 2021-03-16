import { GraphQLError, GraphQLSchema } from "graphql";
import { HeadersInit } from "node-fetch";
import { fetch } from 'apollo-server-env';
import { GraphQLRequestContextExecutionDidStart, Logger } from "apollo-server-types";
import { ServiceDefinition } from "@apollo/federation";
import { GraphQLDataSource } from './datasources/types';
import { QueryPlan } from '@apollo/query-planner';
import { OperationContext } from './';
import { ServiceMap } from './executeQueryPlan';

export type ServiceEndpointDefinition = Pick<ServiceDefinition, 'name' | 'url'>;

export type Experimental_DidResolveQueryPlanCallback = ({
  queryPlan,
  serviceMap,
  operationContext,
  requestContext,
}: {
  readonly queryPlan: QueryPlan;
  readonly serviceMap: ServiceMap;
  readonly operationContext: OperationContext;
  readonly requestContext: GraphQLRequestContextExecutionDidStart<
    Record<string, any>
  >;
}) => void;

interface ImplementingServiceLocation {
  name: string;
  path: string;
}

export interface CompositionMetadata {
  formatVersion: number;
  id: string;
  implementingServiceLocations: ImplementingServiceLocation[];
  schemaHash: string;
}

export type Experimental_DidFailCompositionCallback = ({
  errors,
  serviceList,
  compositionMetadata,
}: {
  readonly errors: GraphQLError[];
  readonly serviceList: ServiceDefinition[];
  readonly compositionMetadata?: CompositionMetadata;
}) => void;

export interface ServiceDefinitionCompositionInfo {
  serviceDefinitions: ServiceDefinition[];
  schema: GraphQLSchema;
  compositionMetadata?: CompositionMetadata;
}

export interface CsdlCompositionInfo {
  schema: GraphQLSchema;
  compositionId: string;
  csdl: string;
}

export type CompositionInfo =
  | ServiceDefinitionCompositionInfo
  | CsdlCompositionInfo;

export type Experimental_DidUpdateCompositionCallback = (
  currentConfig: CompositionInfo,
  previousConfig?: CompositionInfo,
) => void;

export type CompositionUpdate = ServiceDefinitionUpdate | CsdlUpdate;

export interface ServiceDefinitionUpdate {
  serviceDefinitions?: ServiceDefinition[];
  compositionMetadata?: CompositionMetadata;
  isNewSchema: boolean;
}

export interface CsdlUpdate {
  id: string;
  csdl: string;
}

export function isCsdlUpdate(update: CompositionUpdate): update is CsdlUpdate {
  return 'csdl' in update;
}

export function isServiceDefinitionUpdate(
  update: CompositionUpdate,
): update is ServiceDefinitionUpdate {
  return 'isNewSchema' in update;
}

/**
 * **Note:** It's possible for a schema to be the same (`isNewSchema: false`) when
 * `serviceDefinitions` have changed. For example, during type migration, the
 * composed schema may be identical but the `serviceDefinitions` would differ
 * since a type has moved from one service to another.
 */
export type Experimental_UpdateServiceDefinitions = (
  config: DynamicGatewayConfig,
) => Promise<ServiceDefinitionUpdate>;

export type Experimental_UpdateCsdl = (
  config: DynamicGatewayConfig,
) => Promise<CsdlUpdate>;

export type Experimental_UpdateComposition = (
  config: DynamicGatewayConfig,
) => Promise<CompositionUpdate>;

interface GatewayConfigBase {
  debug?: boolean;
  logger?: Logger;
  // TODO: expose the query plan in a more flexible JSON format in the future
  // and remove this config option in favor of `exposeQueryPlan`. Playground
  // should cutover to use the new option when it's built.
  __exposeQueryPlanExperimental?: boolean;
  buildService?: (definition: ServiceEndpointDefinition) => GraphQLDataSource;

  // experimental observability callbacks
  experimental_didResolveQueryPlan?: Experimental_DidResolveQueryPlanCallback;
  experimental_didFailComposition?: Experimental_DidFailCompositionCallback;
  experimental_didUpdateComposition?: Experimental_DidUpdateCompositionCallback;
  experimental_pollInterval?: number;
  experimental_approximateQueryPlanStoreMiB?: number;
  experimental_autoFragmentization?: boolean;
  fetcher?: typeof fetch;
  serviceHealthCheck?: boolean;
  /**
   * @deprecated This configuration option shouldn't be used unless by
   *             recommendation from Apollo staff. This behavior will be
   *             defaulted in a future release and this option will strictly be
   *             used as an override.
   */
  experimental_schemaConfigDeliveryEndpoint?: null | string;
}

export interface RemoteGatewayConfig extends GatewayConfigBase {
  serviceList: ServiceEndpointDefinition[];
  introspectionHeaders?: HeadersInit;
}

// TODO(trevor:cloudconfig): This type goes away
export interface LegacyManagedGatewayConfig extends GatewayConfigBase {
  federationVersion?: number;
}

// TODO(trevor:cloudconfig): This type becomes the only managed config
export interface PrecomposedManagedGatewayConfig extends GatewayConfigBase {
  /**
   * @deprecated This configuration option shouldn't be used unless by
   *             recommendation from Apollo staff. This behavior will be
   *             defaulted in a future release and this option will strictly be
   *             used as an override.
   */
  experimental_schemaConfigDeliveryEndpoint: string;
}

// TODO(trevor:cloudconfig): This union is no longer needed
export type ManagedGatewayConfig =
  | LegacyManagedGatewayConfig
  | PrecomposedManagedGatewayConfig;

interface ManuallyManagedServiceDefsGatewayConfig extends GatewayConfigBase {
  experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions;
}

interface ManuallyManagedCsdlGatewayConfig extends GatewayConfigBase {
  experimental_updateCsdl: Experimental_UpdateCsdl
}

type ManuallyManagedGatewayConfig =
  | ManuallyManagedServiceDefsGatewayConfig
  | ManuallyManagedCsdlGatewayConfig;

interface LocalGatewayConfig extends GatewayConfigBase {
  localServiceList: ServiceDefinition[];
}

interface CsdlGatewayConfig extends GatewayConfigBase {
  csdl: string;
}

export type StaticGatewayConfig = LocalGatewayConfig | CsdlGatewayConfig;

type DynamicGatewayConfig =
| ManagedGatewayConfig
| RemoteGatewayConfig
| ManuallyManagedGatewayConfig;

export type GatewayConfig = StaticGatewayConfig | DynamicGatewayConfig;

export function isLocalConfig(config: GatewayConfig): config is LocalGatewayConfig {
  return 'localServiceList' in config;
}

export function isRemoteConfig(config: GatewayConfig): config is RemoteGatewayConfig {
  return 'serviceList' in config;
}

export function isCsdlConfig(config: GatewayConfig): config is CsdlGatewayConfig {
  return 'csdl' in config;
}

// A manually managed config means the user has provided a function which
// handles providing service definitions to the gateway.
export function isManuallyManagedConfig(
  config: GatewayConfig,
): config is ManuallyManagedGatewayConfig {
  return (
    'experimental_updateServiceDefinitions' in config ||
    'experimental_updateCsdl' in config
  );
}

// Managed config strictly means managed by Studio
export function isManagedConfig(
  config: GatewayConfig,
): config is ManagedGatewayConfig {
  return (
    isPrecomposedManagedConfig(config) ||
    (!isRemoteConfig(config) &&
      !isLocalConfig(config) &&
      !isCsdlConfig(config) &&
      !isManuallyManagedConfig(config))
  );
}

// TODO(trevor:cloudconfig): This merges with `isManagedConfig`
export function isPrecomposedManagedConfig(
  config: GatewayConfig,
): config is PrecomposedManagedGatewayConfig {
  return (
    'experimental_schemaConfigDeliveryEndpoint' in config &&
    config.experimental_schemaConfigDeliveryEndpoint !== null
  );
}

// A static config is one which loads synchronously on start and never updates
export function isStaticConfig(config: GatewayConfig): config is StaticGatewayConfig {
  return isLocalConfig(config) || isCsdlConfig(config);
}

// A dynamic config is one which loads asynchronously and (can) update via polling
export function isDynamicConfig(
  config: GatewayConfig,
): config is DynamicGatewayConfig {
  return (
    isRemoteConfig(config) ||
    isManagedConfig(config) ||
    isManuallyManagedConfig(config)
  );
}
