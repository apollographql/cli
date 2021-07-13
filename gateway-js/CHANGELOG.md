# CHANGELOG for `@apollo/gateway`

## vNEXT

> The changes noted within this `vNEXT` section have not been released yet.  New PRs and commits which introduce changes should include an entry in this `vNEXT` section as part of their development.  When a release is being prepared, a new header will be (manually) created below and the appropriate changes within that release will be moved into the new section.

- Fixes bug where one `onSchemaChange` listener throwing would prevent other `onSchemaChange` listeners from being notified. [PR #738](https://github.com/apollographql/federation/pull/738)
- Adds `onSchemaLoadOrUpdate` method to register listeners for schema load and updates, and to receive both the API schema and the core supergraph SDL. `onSchemaChange` has been deprecated in favor of this method. Note that `onSchemaChange` listeners are not notified when loading schemas from static gateway configurations, while `onSchemaLoadOrUpdate` listeners are notified. [PR #738](https://github.com/apollographql/federation/pull/738)

## v0.33.0

- Only changes in the similarly versioned `@apollo/federation` (v0.26.0) package.

## v0.32.0

- This release updates dependencies so that it will support the final release of Apollo Server 3 when it is released. (Since 0.29, it has supported preview releases of Apollo Server 3.) There are no code changes.

## v0.31.1

- Move otel dependencies from `peerDependencies` to actual `dependencies`. Also rename otel trace labels to `@apollo/gateway/0.31.0` (or whatever the current version installed happens to be) [PR #848](https://github.com/apollographql/federation/pull/848)

## v0.31.0

- OpenTelemetry instrumentation. [PR #836](https://github.com/apollographql/federation/pull/836)

## v0.30.0

- Send error reports to a configurable endpoint when providing the `APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT` env variable. Using the Apollo URL `https://uplink.api.apollographql.com/monitoring` is recommended unless you have a custom configuration. Reports will only be sent if the env variable is set. [PR #777](https://github.com/apollographql/federation/pull/777)

## v0.29.1

- More work towards compatibility with Apollo Server 3 preview releases. [PR #822](https://github.com/apollographql/federation/pull/822)

## v0.29.0

- This release is intended to be compatible with preview releases of Apollo Server 3. The `apollo` option to `ApolloGateway.load` now can accept the signature sent by AS2 (which always includes `graphVariant`) or AS3 (which never does), and the dependencies on Apollo Server packages allow for preview releases as well as the AS2 versions. (However, it was not quite enough for AS3 compatibility; see 0.29.1 above.) [PR #819](https://github.com/apollographql/federation/pull/819) [PR #819](https://github.com/apollographql/federation/pull/819)

## v0.28.3

- Fix plan querying a subgraph with an interface it doesn't know due to directives [PR #805](https://github.com/apollographql/federation/pull/805) [Issue #801](https://github.com/apollographql/federation/issues/801)
- Take subtypes into account when matching type conditions to extract representations. [PR #804](https://github.com/apollographql/federation/pull/804)

## v0.28.0

- Expand the range of supported `node` versions in the package's `engines` specifier to include the now-tested Node.js `16`. [PR #713](https://github.com/apollographql/federation/pull/713)

## v0.27.1

- Update version of `@apollo/query-planner` which was uninstallable due to a missing dependency. Related PR: [PR #709](https://github.com/apollographql/federation/pull/709)

## v0.27.0

- Fix query plans missing fields in some situations involving nested type conditions. [PR #652](https://github.com/apollographql/federation/pull/652) [Issue #396](https://github.com/apollographql/federation/issues/396)
- Fix condition would could result in duplicate fetches within query plans. [PR #671](https://github.com/apollographql/federation/pull/671)

## v0.26.3

- Update `apollo-graphql` dependency which resolves a missing dependency (`sha.js`) within that package. [PR #699](https://github.com/apollographql/federation/pull/699)

## v0.26.2

- Avoid _small_ potential performance concern/observation introduced in v0.21.0 which unnecessarily `JSON.stringify`'d the same object twice during requests to upstream subgraphs. [PR #673](https://github.com/apollographql/federation/pull/673)
- Allow passing a function to the `introspectionHeaders` field when constructing an `ApolloGateway` instance. This allows for producing dynamic introspection headers per request. [PR #607](https://github.com/apollographql/federation/pull/607)
- Will no longer calculate the automated persisted query (APQ) hash when `apq` is not set to `true` on the `RemoteGraphQLDataSource`. [PR #672](https://github.com/apollographql/federation/pull/672)

## v0.26.1

- Allow passing a function to the `introspectionHeaders` field when constructing an `ApolloGateway` instance. This allows for producing dynamic introspection headers per request. [PR #607](https://github.com/apollographql/federation/pull/607)
- Updates `@apollo/query-planner` dependency to v0.1.1, which no longer depends on `@apollo/query-planner-wasm`. [PR #643](https://github.com/apollographql/federation/pull/643)

## v0.26.0

- Re-introduce TypeScript query planner to the gateway. This change should effectively be an implementation detail - it's undergone extensive testing to ensure compatibility with current query plans. [PR #622](https://github.com/apollographql/federation/pull/622)
- __BREAKING__ - All references to CSDL within the gateway have been updated to its latest iteration `Supergraph SDL` which is very similar in spirit, but implements the currently-being-introduced core and join specs. This includes changes to recent external API additions like the `csdl` and `experimental_updateCsdl` gateway constructor options. [PR #622](https://github.com/apollographql/federation/pull/622)
- Update query planner API. With the query planner back in TypeScript, we can modify the QP API in such a way that prevents double parsing and schema building. [PR #628](https://github.com/apollographql/federation/pull/628)

## v0.25.1

- Improved query plan execution by pruning entities which are `undefined` or didn't match specified type conditions after a prior `FetchNode` execution.  After pruning, only the remaining entities will be fetched in the dependent `FetchNode` execution.  If NO entities remain, the request will not be made.  [PR #612](https://github.com/apollographql/federation/pull/612)

## v0.25.0

- Add support for an upcoming mechanism for fetching a graph's schema and configuration when using managed federation. In this release, the new mechanism is opt-in, and users shouldn't use enable it unless instructed by Apollo to do so. [PR #458](https://github.com/apollographql/federation/pull/458) [PR #585](https://github.com/apollographql/federation/pull/585)
- Provide `context` as a fourth, optional argument to `RemoteGraphQLDataSource.didEncounterError`. This is a non-breaking change which allows implementors to read and modify the `context` object which is already similarly available in other hooks. [PR #600](https://github.com/apollographql/federation/pull/600)

## v0.24.4

- deps(@apollo/query-planner-wasm`): Adjust the packaging to ensure that `dist/` packages were published by the CI publishing pipeline. [PR #557](https://github.com/apollographql/federation/pull/557)

## v0.24.3

- deps(`@apollo/query-planner-wasm`): Fix an error caused by a lacking relatively prefix on the items in `exports`, following up [PR #270](https://github.com/apollographql/federation/pull/270)

## v0.24.2
## v0.24.1

- Re-publish with adjustment to `lerna.json` to ensure that the newly-introduced `@apollo/query-planner` package (which wraps `@apollo/query-planner-wasm`) is published by the release pipeline.  This is important because `@apollo/gateway` now depends on `@apollo/query-planner` as of [PR #453](https://github.com/apollographql/federation/pull/453)

## v0.24.0

- __BREAKING__: Make all `protected` gateway fields and methods `private` (except `loadServiceDefinitions`). If you currently depend on the ability to override any of these currently `protected` members of `ApolloGateway` _please let us know by opening or commenting on an existing an issue on this repository_. For additional context on why `loadServiceDefinitions` remains `protected` (for now) please read the associated PR description and linked issue. [PR #539](https://github.com/apollographql/federation/pull/539)
- deps(`@apollo/query-planner-wasm`): This dependency has been bumped to a version that emits an ECMAScript module (ESM) in addition to the current CommonJS (CJS) bundle.  This may help facilitate interoperability with bundlers thwarted by the presence of the WASM module (`.wasm`) within in this dependency since its inception and included in `@apollo/gateway` since [`v0.20.1`](#v0201).  [PR #270](https://github.com/apollographql/federation/pull/270)  [Issue #255](https://github.com/apollographql/federation/issues/255)

## v0.23.2

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.23.1

- Adjust quoting on "invalid state" error message introduced in [PR #452](https://github.com/apollographql/federation/pull/452) to properly reveal the unknown state. [PR #460](https://github.com/apollographql/federation/pull/460) 

## v0.23.0

- **If you are on v2.18 or v2.19 of Apollo Server, you should upgrade to Apollo Server v2.20 before upgrading to this version**, or your Node process may not shut down properly after stopping your Apollo Server.. Code that calls `ApolloGateway.load` is now expected to call `ApolloGateway.stop`. If you don't do that and you're using managed federation or `experimental_pollInterval`, the background polling interval will now keep a Node process alive rather than allowing it to exit if it's the only remaining event loop handler. Generally, `ApolloServer` is what calls `ApolloGateway.load`, and if you use at least v2.20.0 of Apollo Server, `ApolloServer.stop()` will invoke `ApolloGateway.stop()`. There's a bit of a hack where ApolloGateway does the old behavior if it believes that it is being called by a version of Apollo Server older than v2.18.0. So if you are manually calling `ApolloGateway.load` from your code, make sure to call `ApolloGateway.stop` when you're done, and don't use this version with Apollo Server v2.18 or v2.19. [PR #452](https://github.com/apollographql/federation/pull/452) [apollo-server Issue #4428](https://github.com/apollographql/apollo-server/issues/4428)
- Simplify startup code paths. This is technically only intended to be an internal restructure, but it's substantial enough to warrant a changelog entry for observability in case of any unexpected behavioral changes. [PR #440](https://github.com/apollographql/federation/pull/440)

## v0.22.0

- Include original error during creation of `GraphQLError` in `downstreamServiceError()`. [PR #309](https://github.com/apollographql/federation/pull/309)
- Gateway accepts `csdl` for startup configuration, uses CSDL internally for schema object creation. [PR #278](https://github.com/apollographql/federation/pull/278)
- Add `Promise<T>` generic type info to fix typescript errors [PR #324](https://github.com/apollographql/federation/pull/324)
- Update apollo-server-* deps [PR #325](https://github.com/apollographql/federation/pull/325)
## v0.21.4

- Update version of `@apollo/federation`

## v0.21.3

- No changes, but please note that `v0.21.2` was a botched release, with no update to the `@apollo/query-planner-wasm` package that was needed. If you're seeing an error similar to `This data graph is missing a valid configuration. unreachable`, please upgrade to at least this patch release.
## v0.21.2

- Whenever "AccessDenied" 403 error comes from Apollo, provide a useful error message indicating how to resolve the problem. [PR #245](https://github.com/apollographql/federation/pull/245)

## v0.21.1

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.21.0

- Fix `Cannot convert undefined or null to object` error which occurred when nullable variables were declared/used within an operation (i.e. `query`) document but `variables` was undefined on the request. [PR #167](https://github.com/apollographql/federation/pull/167) [Issue #196](https://github.com/apollographql/federation/issues/196)
- When using a custom `fetcher` on a `RemoteGraphQLDataSource`, use that fetcher's `Request` initialization in order to satisfy and of its own implementation details.  This is necessary, for example, when using `make-fetch-happen`. [PR #188](https://github.com/apollographql/federation/pull/188) [Issue #191](https://github.com/apollographql/federation/issues/191)

## v0.20.4

- Adjust a `preinstall` script which was only intended to be executed by the monorepo tool-chain, not merely by installing the `@apollo/gateway` package as a dependency in another project. [PR #185](https://github.com/apollographql/federation/pull/185) [Issue #184](https://github.com/apollographql/federation/issues/184)

## v0.20.3

- Read managed federation configuration from the `apollo` option to `ApolloGateway.load` rather than the deprecated `engine` option, when available (ie, when running Apollo Server v2.18+), and update error messages referring to the old Engine and Graph Manager product names. [PR #148](https://github.com/apollographql/federation/pull/148)
- __FIX__: Directives which are located on inline fragments should not be skipped and should be sent to the service [PR #178](https://github.com/apollographql/federation/pull/178)

## v0.20.2

- __FIX__: Minifying a String argument should escape quotes and slashes [PR #174](https://github.com/apollographql/federation/pull/174)

## v0.20.1

- Replace the query planner implementation with a new implementation written in rust and integrated into the gateway
  via wasm. [PR #4534](https://github.com/apollographql/apollo-server/pull/4534)

## v0.20.0

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.19.1

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.19.0

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.18.1

- __FIX__: Pass null required fields correctly within the parent object to resolvers. When a composite field was null, it would sometimes be expanded into an object with all null subfields and passed to the resolver. This fix prevents this expansion and sets the field to null, as originally intended. [PR #4157](https://github.com/apollographql/apollo-server/pull/4157)
- __FIX__: Prevent gateway from entering an inoperable state after an initial configuration load failure. [PR #4277](https://github.com/apollographql/apollo-server/pull/4277)

## v0.18.0

- The `RemoteGraphQLDataSource`'s `didEncounterError` method will now receive [`Response`](https://github.com/apollographql/apollo-server/blob/43470d6561bee31101f3afc56bdd154db3f92b30/packages/apollo-server-env/src/fetch.d.ts#L98-L111) as the third argument when it is available, making its signature `(error: Error, fetchRequest: Request, fetchResponse?: Response)`.  This compliments the existing [`Request`](https://github.com/apollographql/apollo-server/blob/43470d6561bee31101f3afc56bdd154db3f92b30/packages/apollo-server-env/src/fetch.d.ts#L37-L45) type it was already receiving.  Both of these types are [HTTP WHATWG Fetch API](https://fetch.spec.whatwg.org/) types, not `GraphQLRequest`, `GraphQLResponse` types.

## v0.17.0

- __BREAKING__: Move federation metadata from custom objects on schema nodes over to the `extensions` field on schema nodes which are intended for metadata. This is a breaking change because it narrows the `graphql` peer dependency from `^14.0.2` to `^14.5.0` which is when [`extensions` were introduced](https://github.com/graphql/graphql-js/pull/2097) for all Type System objects. [PR #4313](https://github.com/apollographql/apollo-server/pull/4313)

## v0.16.11

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.16.10

- The default branch of the repository has been changed to `main`.  As this changed a number of references in the repository's `package.json` and `README.md` files (e.g., for badges, links, etc.), this necessitates a release to publish those changes to npm. [PR #4302](https://github.com/apollographql/apollo-server/pull/4302)
- __FIX__: The cache implementation for the HTTP-fetcher which is used when communicating with the Apollo Registry when the gateway is configured to use [managed federation](https://www.apollographql.com/docs/graph-manager/managed-federation/overview/) will no longer write to its cache when it receives a 304 response.  This is necessary since such a response indicates that the cache used to conditionally make the request must already be present.  This does not affect GraphQL requests at runtime, only the polling and fetching mechanism for retrieving composed schemas under manged federation. [PR #4325](https://github.com/apollographql/apollo-server/pull/4325)
- __FIX__: The `mergeFieldNodeSelectionSets` method no longer mutates original FieldNode objects. Before, it was updating the selection set of the original object, corrupting the data accross requests.

## v0.16.9

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.16.7

- Bumped the version of `apollo-server-core`, but no other changes!

## v0.16.6

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.16.5

- Only changes in the similarly versioned `@apollo/federation` package.

## v0.16.4

- __NEW__: Provide the `requestContext` as an argument to the experimental callback function `experimental_didResolveQueryPlan`. [#4173](https://github.com/apollographql/apollo-server/pull/4173)

## v0.16.3

- This updates a dependency of `apollo-server-core` that is only used for its TypeScript typings, not for any runtime dependencies.  The reason for the upgrade is that the `apollo-server-core` package (again, used only for types!) was affected by a GitHub Security Advisory.  [See the related `CHANGELOG.md` for Apollo Server for more details, including a link to the advisory](https://github.com/apollographql/apollo-server/blob/354d9910e1c87af93c7d50263a28554b449e48db/CHANGELOG.md#v2142).

## v0.16.2

- __FIX__: Collapse nested required fields into a single body in the query plan. Before, some nested fields' selection sets were getting split, causing some of their subfields to be dropped when executing the query. This fix collapses the split selection sets into one. [#4064](https://github.com/apollographql/apollo-server/pull/4064)

## v0.16.1

- __NEW__: Provide the ability to pass a custom `fetcher` during `RemoteGraphQLDataSource` construction to be used when executing operations against downstream services.  Providing a custom `fetcher` may be necessary to accommodate more advanced needs, e.g., configuring custom TLS certificates for internal services.  [PR #4149](https://github.com/apollographql/apollo-server/pull/4149)

  The `fetcher` specified should be a compliant implementor of the [Fetch API standard](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).  This addition compliments, though is still orthognonal to, similar behavior originally introduced in [#3783](https://github.com/apollographql/apollo-server/pull/3783), which allowed customization of the implementation used to fetch _gateway configuration and federated SDL from services_ in managed and unmanaged modes, but didn't affect the communication that takes place during _operation execution_.

  For now, the default `fetcher` will remain the same ([`node-fetch`](https://npm.im/node-fetch)) implementation.  A future major-version bump will update it to be consistent with other feature-rich implementations of the Fetch API which are used elsewhere in the Apollo Server stack where we use [`make-fetch-happen`](https://npm.im/make-fetch-happen).  In all likelihood, `ApolloGateway` will pass its own `fetcher` to the `RemoteGraphQLDataSource` during service initialization.

## v0.16.0

- __BREAKING__: Use a content delivery network for managed configuration, fetch storage secrets and composition configuration from different domains: https://storage-secrets.api.apollographql.com and https://federation.api.apollographql.com. Please mind any firewall for outgoing traffic. [#4080](https://github.com/apollographql/apollo-server/pull/4080)

## v0.15.1

- __FIX__: Correctly handle unions with nested conditions that have no `possibleTypes` [#4071](https://github.com/apollographql/apollo-server/pull/4071)
- __FIX__: Normalize root operation types when reporting to Apollo Graph Manager. Federation always uses the default names `Query`, `Mutation`, and `Subscription` for root operation types even if downstream services choose different names; now we properly normalize traces received from downstream services in the same way. [#4100](https://github.com/apollographql/apollo-server/pull/4100)

## v0.15.0

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/e37384a49b2bf474eed0de3e9f4a1bebaeee64c7)

- __BREAKING__: Drop support for Node.js 8 and Node.js 10.  This is being done primarily for performance gains which stand to be seen by transpiling to a newer ECMAScript target.  For more details, see the related PR.  [#4031](https://github.com/apollographql/apollo-server/pull/4031)
- __Performance:__ Cache stringified representations of downstream query bodies within the query plan to address performance cost incurred by repeatedly `print`ing the same`DocumentNode`s with the `graphql` printer.  This improvement is more pronounced on larger documents.  [PR #4018](https://github.com/apollographql/apollo-server/pull/4018)
- __Deprecation:__ Deprecated the `ENGINE_API_KEY` environment variable in favor of its new name, `APOLLO_KEY`.  The new name mirrors the name used within Apollo Graph Manager.  Aside from the rename, the functionality remains otherwise identical.  Continued use of `ENGINE_API_KEY` will result in deprecation warnings being printed to the server console.  Support for `ENGINE_API_KEY` will be removed in a future, major update.  [#3923](https://github.com/apollographql/apollo-server/pull/3923)
- __Deprecation:__ Deprecated the `APOLLO_SCHEMA_TAG` environment variable in favor of its new name, `APOLLO_GRAPH_VARIANT`.  The new name mirrors the name used within Apollo Graph Manager.  Aside from the rename, the functionality remains otherwise identical.  Use of the now-deprecated name will result in a deprecation warning being printed to the server console.  Support will be removed entirely in a future, major update.  To avoid misconfiguration, runtime errors will be thrown if the new and deprecated versions are _both_ set. [#3855](https://github.com/apollographql/apollo-server/pull/3855)
- Add inadvertently excluded `apollo-server-errors` runtime dependency. [#3927](https://github.com/apollographql/apollo-server/pull/3927)

## v0.14.1

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/b898396e9fcd3b9092b168f9aac8466ca186fa6b)

- __FIX__: Resolve condition which surfaced in `0.14.0` which prevented loading the configuration using managed federation. [PR #3979](https://github.com/apollographql/apollo-server/pull/3979)

## v0.14.0

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/71a3863f59f4ab2c9052c316479d94c6708c4309)

- Several previously unhandled Promise rejection errors stemming from, e.g. connectivity, failures when communicating with Apollo Graph Manager within asynchronous code are now handled. [PR #3811](https://github.com/apollographql/apollo-server/pull/3811)
- Provide a more helpful error message when encountering expected errors. [PR #3811](https://github.com/apollographql/apollo-server/pull/3811)
- General improvements and clarity to error messages and logging. [PR #3811](https://github.com/apollographql/apollo-server/pull/3811)
- Warn of a possible misconfiguration when local service configuration is provided (via `serviceList` or `localServiceList`) and a remote Apollo Graph Manager configuration is subsequently found as well. [PR #3868](https://github.com/apollographql/apollo-server/pull/3868)
- During composition, the unavailability of a downstream service in unmanaged federation mode will no longer result in a partially composed schema which merely lacks the types provided by the downed service.  This prevents unexpected validation errors for clients querying a graph which lacks types which were merely unavailable during the initial composition but were intended to be part of the graph. [PR #3867](https://github.com/apollographql/apollo-server/pull/3867)
- Support providing a custom logger implementation (e.g. [`winston`](https://npm.im/winston), [`bunyan`](https://npm.im/bunyan), etc.) to capture gateway-sourced console output.  This allows the use of existing, production logging facilities or the possibiltiy to use advanced structure in logging, such as console output which is encapsulated in JSON.  The same PR that introduces this support also introduces a `logger` property to the `GraphQLRequestContext` that is exposed to `GraphQLDataSource`s and Apollo Server plugins, making it possible to attach additional properties (as supported by the logger implementation) to specific requests, if desired, by leveraging custom implementations in those components respectively.  When not provided, these will still output to `console`. [PR #3894](https://github.com/apollographql/apollo-server/pull/3894)
- Drop use of `loglevel-debug`.  This removes the very long date and time prefix in front of each log line and also the support for the `DEBUG=apollo-gateway:` environment variable.  Both of these were uncommonly necessary or seldom used (with the environment variable also being undocumented).  The existing behavior can be preserved by providing a `logger` that uses `loglevel-debug`, if desired, and more details can be found in the PR.  [PR #3896](https://github.com/apollographql/apollo-server/pull/3896)
- Fix Typescript generic typing for datasource contexts [#3865](https://github.com/apollographql/apollo-server/pull/3865) This is a fix for the `TContext` typings of the gateway's exposed `GraphQLDataSource` implementations. In their current form, they don't work as intended, or in any manner that's useful for typing the `context` property throughout the class methods. This introduces a type argument `TContext` to the class itself (which defaults to `Record<string, any>` for existing implementations) and removes the non-operational type arguments on the class methods themselves.
- Implement retry logic for requests to GCS [PR #3836](https://github.com/apollographql/apollo-server/pull/3836) Note: coupled with this change is a small alteration in how the gateway polls GCS for updates in managed mode. Previously, the tick was on a specific interval. Now, every tick starts after the round of fetches to GCS completes. For more details, see the linked PR.
- Gateway issues health checks to downstream services via `serviceHealthCheck` configuration option. Note: expected behavior differs between managed and unmanaged federation. See PR for new test cases and documentation. [#3930](https://github.com/apollographql/apollo-server/pull/3930)


## v0.13.2

- __BREAKING__: The behavior and signature of `RemoteGraphQLDataSource`'s `didReceiveResponse` method has been changed.  No changes are necessary _unless_ your implementation has overridden the default behavior of this method by either extending the class and overriding the method or by providing `didReceiveResponse` as a parameter to the `RemoteGraphQLDataSource`'s constructor options.  Implementations which have provided their own `didReceiveResponse` using either of these methods should view the PR linked here for details on what has changed.  [PR #3743](https://github.com/apollographql/apollo-server/pull/3743)
- __NEW__: Setting the `apq` option to `true` on the `RemoteGraphQLDataSource` will enable the use of [automated persisted queries (APQ)](https://www.apollographql.com/docs/apollo-server/performance/apq/) when sending queries to downstream services.  Depending on the complexity of queries sent to downstream services, this technique can greatly reduce the size of the payloads being transmitted over the network.  Downstream implementing services must also support APQ functionality to participate in this feature (Apollo Server does by default unless it has been explicitly disabled).  As with normal APQ behavior, a downstream server must have received and registered a query once before it will be able to serve an APQ request. [#3744](https://github.com/apollographql/apollo-server/pull/3744)
- __NEW__: Experimental feature: compress downstream requests via generated fragments [#3791](https://github.com/apollographql/apollo-server/pull/3791) This feature enables the gateway to generate fragments for queries to downstream services in order to minimize bytes over the wire and parse time. This can be enabled via the gateway config by setting `experimental_autoFragmentization: true`. It is currently disabled by default.
- Introduce `make-fetch-happen` package. Remove `cachedFetcher` in favor of the caching implementation provided by this package. [#3783](https://github.com/apollographql/apollo-server/pull/3783/files)

## v0.12.1

- Update to include [fixes from `@apollo/federation`](https://github.com/apollographql/apollo-server/blob/main/packages/apollo-federation/CHANGELOG.md).

## v0.12.0

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/9c0aa1e661ccc2c5a1471b781102637dd47e21b1)

- Reduce interface expansion for types contained to a single service [#3582](https://github.com/apollographql/apollo-server/pull/3582)
- Instantiate one `CachedFetcher` per gateway instance.  This resolves a condition where multiple federated gateways would utilize the same cache store could result in an `Expected undefined to be a GraphQLSchema` error. [#3704](https://github.com/apollographql/apollo-server/pull/3704)
- Gateway: minimize downstream request size [#3737](https://github.com/apollographql/apollo-server/pull/3737)
- experimental: Allow configuration of the query plan store by introducing an `experimental_approximateQueryPlanStoreMiB` property to the `ApolloGateway` constructor options which overrides the default cache size of 30MiB. [#3755](https://github.com/apollographql/apollo-server/pull/3755)

## v0.11.6

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/0743d6b2f1737758cf09e80d2086917772bc00c9)

- Fix onSchemaChange callbacks for unmanaged configs [#3605](https://github.com/apollographql/apollo-server/pull/3605)

## v0.11.4

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/a0a60e73e04e913d388de8324f7d17e4406deea2)

 * Gateway over-merging fields of unioned types [#3581](https://github.com/apollographql/apollo-server/pull/3581)

## v0.11.0

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/93002737d53dd9a50b473ab9cef14849b3e539aa)

- Begin supporting executable directives in federation [#3464](https://github.com/apollographql/apollo-server/pull/3464)

## v0.10.8

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/5d94e986f04457ec17114791ee6db3ece4213dd8)

- Fix Gateway / Playground Query Plan view [#3418](https://github.com/apollographql/apollo-server/pull/3418)
- Gateway schema change listener bug + refactor [#3411](https://github.com/apollographql/apollo-server/pull/3411) introduces a change to the `experimental_didUpdateComposition` hook and `experimental_pollInterval` configuration behavior.
  1. Previously, the `experimental_didUpdateComposition` hook wouldn't be reliably called unless the `experimental_pollInterval` was set. If it _was_ called, it was sporadic and didn't necessarily mark the timing of an actual composition update. After this change, the hook is called on a successful composition update.
  2. The `experimental_pollInterval` configuration option now affects both the GCS polling interval when gateway is configured for managed federation, as well as the polling interval of services. The former being newly introduced behavior.
- Gateway cached DataSource bug [#3412](https://github.com/apollographql/apollo-server/pull/3412) introduces a fix for managed federation users where `DataSource`s wouldn't update correctly if a service's url changed. This bug was introduced with heavier DataSource caching in [#3388](https://github.com/apollographql/apollo-server/pull/3388). By inspecting the `url` as well, `DataSource`s will now update correctly when a composition update occurs.
- Gateway - don't log updates on startup [#3421](https://github.com/apollographql/apollo-server/pull/3421) Fine tune gateway startup logging - on load, instead of logging an "update", log the service id, variant, and mode in which gateway is running.

## v0.10.7

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/fc7462ec5f8604bd6cba99aa9a377a9b8e045566)

- Add export for experimental observability functions types. [#3371](https://github.com/apollographql/apollo-server/pull/3371)
- Fix double instantiation of DataSources [#3388](https://github.com/apollographql/apollo-server/pull/3388)

## v0.10.6

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/aa200ce24b834320fc79d2605dac340b37d3e434)

- Fix debug query plan logging [#3376](https://github.com/apollographql/apollo-server/pull/3376)
- Add `context` object to `GraphQLDataSource.didReceiveResponse` arguments [#3360](https://github.com/apollographql/apollo-server/pull/3360)

## v0.10.1

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/029c8dca3af812ee70589cdb6de749df3d2843d8)

- Make service definition cache local to ApolloGateway object [#3191](https://github.com/apollographql/apollo-server/pull/3191)
- Fix value type behavior within composition and execution [#3182](https://github.com/apollographql/apollo-server/pull/3182)
- Validate variables at the gateway level [#3213](https://github.com/apollographql/apollo-server/pull/3213)

## v0.9.1

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/a1c41152a35c837af27d1dee081fc273de07a28e)

- Optimize buildQueryPlan when two FetchGroups are on the same service [#3135](https://github.com/apollographql/apollo-server/pull/3135)
- Construct and use RemoteGraphQLDataSource to issue introspection query to Federated Services [#3120](https://github.com/apollographql/apollo-server/pull/3120)

## v0.9.0

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/99f78c6782bce170186ba6ef311182a8c9f281b7)

- Add experimental observability functions [#3110](https://github.com/apollographql/apollo-server/pull/3110)

## v0.8.2

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/b0a9ce0615d19b7241e64883b5d5d7730cc13fcb)

- Handle `null` @requires selections correctly during execution [#3138](https://github.com/apollographql/apollo-server/pull/3138)

## v0.6.13

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/a06594117dbbf1e8abdb7b366b69a94ab808b065)

- Proxy errors from downstream services [#3019](https://github.com/apollographql/apollo-server/pull/3019)
- Handle schema defaultVariables correctly within downstream fetches [#2963](https://github.com/apollographql/apollo-server/pull/2963)

## v0.6.12

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/5974b2ce405a06bc331230400b9073f6381738d3)

- Fix `@requires` bug preventing array and null values. [PR #2928](https://github.com/apollographql/apollo-server/pull/2928)

## v0.6.5

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/9dcfe6f91fa7b4187a644efe1522cf444ffc1251)

- Relax constraints of root operation type names in validation [#2783](ttps://github.com/apollographql/apollo-server/pull/2783)

## v0.6.2

> [See complete versioning details.](https://github.com/apollographql/apollo-server/commit/e113127b1ff9802de3bc5574bcae55256f0ef656)

- Resolve an issue with \__proto__ pollution in deepMerge() [#2779](https://github.com/apollographql/apollo-server/pull/2779)
