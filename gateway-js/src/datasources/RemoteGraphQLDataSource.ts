import {
  GraphQLRequestContext,
  GraphQLResponse,
  ValueOrPromise,
  GraphQLRequest,
} from 'apollo-server-types';
import {
  ApolloError,
  AuthenticationError,
  ForbiddenError,
} from 'apollo-server-errors';
import {
  fetch,
  Request,
  Headers,
  Response,
} from 'apollo-server-env';
import { isObject } from '../utilities/predicates';
import { GraphQLDataSource } from './types';
import createSHA from 'apollo-server-core/dist/utils/createSHA';
import { rewriteURIForGET } from '../utilities/http';

export class RemoteGraphQLDataSource<TContext extends Record<string, any> = Record<string, any>> implements GraphQLDataSource<TContext> {
  fetcher: typeof fetch = fetch;

  constructor(
    config?: Partial<RemoteGraphQLDataSource<TContext>> &
      object &
      ThisType<RemoteGraphQLDataSource<TContext>>,
  ) {
    if (config) {
      return Object.assign(this, config);
    }
  }

  url!: string;

  /**
   * Whether the downstream request should be made with automated persisted
   * query (APQ) behavior enabled.
   *
   * @remarks When enabled, the request to the downstream service will first be
   * attempted using a SHA-256 hash of the operation rather than including the
   * operation itself. If the downstream server supports APQ and has this
   * operation registered in its APQ storage, it will be able to complete the
   * request without the entirety of the operation document being transmitted.
   *
   * In the event that the downstream service is unaware of the operation, it
   * will respond with an `PersistedQueryNotFound` error and it will be resent
   * with the full operation body for fulfillment.
   *
   * Generally speaking, when the downstream server is processing similar
   * operations repeatedly, APQ can offer substantial network savings in terms
   * of bytes transmitted over the wire between gateways and downstream servers.
   */
  apq: boolean = false;

  /**
   * Whether the downstream request made with automated persisted
   * query should use HTTP GET method.
   *
   * @remarks This enables support for CDNs that do not cache respones for
   * POST requests.
   */
  useGETForHashedQueries: boolean = false;

  async process({
    request,
    context,
  }: Pick<GraphQLRequestContext<TContext>, 'request' | 'context'>): Promise<
    GraphQLResponse
  > {
    // Respect incoming http headers (eg, apollo-federation-include-trace).
    const headers = (request.http && request.http.headers) || new Headers();
    headers.set('Content-Type', 'application/json');

    request.http = {
      method: 'POST',
      url: this.url,
      headers,
    };

    if (this.willSendRequest) {
      await this.willSendRequest({ request, context });
    }

    if (!request.query) {
      throw new Error("Missing query");
    }

    const apqHash = createSHA('sha256')
       .update(request.query)
       .digest('hex');

    const { query, ...requestWithoutQuery } = request;

    const respond = (response: GraphQLResponse, request: GraphQLRequest) =>
      typeof this.didReceiveResponse === "function"
        ? this.didReceiveResponse({ response, request, context })
        : response;

    const httpRequest = request.http;

    if (!httpRequest) {
        throw new Error("Missing http on GraphQL request");
    }

    if (this.apq) {
      // Take the original extensions and extend them with
      // the necessary "extensions" for APQ handshaking.
      requestWithoutQuery.extensions = {
        ...request.extensions,
        persistedQuery: {
          version: 1,
          sha256Hash: apqHash,
        },
      };

      if (this.useGETForHashedQueries) {
        const {
          parseError,
          newURI: optimisticPersistedQueryUrl,
        } = rewriteURIForGET(this.url, requestWithoutQuery);

        if (parseError) {
          throw parseError;
        }

        if (!optimisticPersistedQueryUrl) {
          throw new Error(
              "Failed to generate persisted query URI from request."
          );
        }

        const optimisticApqHttpGet = { ...httpRequest };
        optimisticApqHttpGet.method = "GET";
        optimisticApqHttpGet.url = optimisticPersistedQueryUrl;

        requestWithoutQuery.http = optimisticApqHttpGet;
      } else {
        const optimisticApqHttpPost = { ...httpRequest };
        optimisticApqHttpPost.method = "GET";
        optimisticApqHttpPost.url = this.url;

        requestWithoutQuery.http = optimisticApqHttpPost;
      }

      const apqOptimisticResponse = await this.sendRequest(
        requestWithoutQuery,
        context
      );

      // If we didn't receive notice to retry with APQ, then let's
      // assume this is the best result we'll get and return it!
      if (
        !apqOptimisticResponse.errors ||
        !apqOptimisticResponse.errors.find(error =>
          error.message === 'PersistedQueryNotFound')
      ) {
        return respond(apqOptimisticResponse, requestWithoutQuery);
      }

      // We'll run the same request again, but add in the
      // previously omitted `query`.
      const requestWithQuery: GraphQLRequest = {
        query,
        ...requestWithoutQuery,
      };

      if (this.useGETForHashedQueries) {
        const {
          parseError,
          newURI: persistedQueryUrlWithQuery,
        } = rewriteURIForGET(this.url, requestWithQuery);

        if (parseError) {
          throw parseError;
        }

        if (!persistedQueryUrlWithQuery) {
          throw new Error(
            "Failed to generate persisted query URI from request."
          );
        }

        const apqWithQueryHttpGet = { ...httpRequest };
        apqWithQueryHttpGet.method = "GET";
        apqWithQueryHttpGet.url = persistedQueryUrlWithQuery;

        requestWithQuery.http = apqWithQueryHttpGet;
      } else {
        const queryHttpPost = { ...httpRequest };
        queryHttpPost.method = "POST";
        queryHttpPost.url = this.url;

        requestWithQuery.http = queryHttpPost;
      }

      const response = await this.sendRequest(requestWithQuery, context);
      return respond(response, requestWithQuery);
    }

    // APQ was NOT enabled, this is the first request (non-APQ, all the way).
    const requestWithQuery: GraphQLRequest = {
      query,
      ...requestWithoutQuery,
    };
    const response = await this.sendRequest(requestWithQuery, context);
    return respond(response, requestWithQuery);
  }

  private async sendRequest(
    request: GraphQLRequest,
    context: TContext,
  ): Promise<GraphQLResponse> {

    // This would represent an internal programming error since this shouldn't
    // be possible in the way that this method is invoked right now.
    if (!request.http) {
      throw new Error("Internal error: Only 'http' requests are supported.")
    }

    // We don't want to serialize the `http` properties into the body that is
    // being transmitted.  Instead, we want those to be used to indicate what
    // we're accessing (e.g. url) and what we access it with (e.g. headers).
    const { http, ...requestWithoutHttp } = request;
    const requestBody =
      request.http.method === "POST"
        ? JSON.stringify(requestWithoutHttp)
        : undefined;
    const fetchRequest = new Request(http.url, {
      ...http,
      body: requestBody,
    });

    let fetchResponse: Response | undefined;

    try {
      // Use our local `fetcher` to allow for fetch injection
      // Use the fetcher's `Request` implementation for compatibility
      fetchResponse = await this.fetcher(http.url, {
        ...http,
        body: requestBody
      });

      if (!fetchResponse.ok) {
        throw await this.errorFromResponse(fetchResponse);
      }

      const responseBody = await this.parseBody(fetchResponse, fetchRequest, context);

      if (!isObject(responseBody)) {
        throw new Error(`Expected JSON response body, but received: ${responseBody}`);
      }

      return {
        ...responseBody,
        http: fetchResponse,
      };
    } catch (error) {
      this.didEncounterError(error, fetchRequest, fetchResponse, context);
      throw error;
    }
  }

  public willSendRequest?(
    requestContext: Pick<
      GraphQLRequestContext<TContext>,
      'request' | 'context'
    >,
  ): ValueOrPromise<void>;

  public didReceiveResponse?(
    requestContext: Required<Pick<
      GraphQLRequestContext<TContext>,
      'request' | 'response' | 'context'>
    >,
  ): ValueOrPromise<GraphQLResponse>;

  public didEncounterError(
    error: Error,
    _fetchRequest: Request,
    _fetchResponse?: Response,
    _context?: TContext,
  ) {
    throw error;
  }

  public parseBody(
    fetchResponse: Response,
    _fetchRequest?: Request,
    _context?: TContext,
  ): Promise<object | string> {
    const contentType = fetchResponse.headers.get('Content-Type');
    if (contentType && contentType.startsWith('application/json')) {
      return fetchResponse.json();
    } else {
      return fetchResponse.text();
    }
  }

  public async errorFromResponse(response: Response) {
    const message = `${response.status}: ${response.statusText}`;

    let error: ApolloError;
    if (response.status === 401) {
      error = new AuthenticationError(message);
    } else if (response.status === 403) {
      error = new ForbiddenError(message);
    } else {
      error = new ApolloError(message);
    }

    const body = await this.parseBody(response);

    Object.assign(error.extensions, {
      response: {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        body,
      },
    });

    return error;
  }
}
