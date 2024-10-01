import type { IActionHttp, IActorHttpOutput, IActorHttpArgs } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

// eslint-disable-next-line import/extensions
import { version as actorVersion } from '../package.json';

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ActorHttpFetch extends ActorHttp {
  private static readonly userAgent = ActorHttpFetch.createUserAgent('ActorHttpFetch', actorVersion);

  public constructor(args: IActorHttpFetchArgs) {
    super(args);
  }

  public async test(action: IActionHttp): Promise<IMediatorTypeTime> {
    if (!ActorHttpFetch.getInputUrl(action.input).protocol.startsWith('http')) {
      throw new Error(`${this.name} can only handle HTTP protocol`);
    }
    return { time: Number.POSITIVE_INFINITY };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const headers = this.prepareRequestHeaders(action);

    const init: RequestInit = { method: 'GET', ...action.init, headers };

    this.logInfo(action.context, `Requesting ${ActorHttpFetch.getInputUrl(action.input).href}`, () => ({
      headers: ActorHttp.headersToHash(headers),
      method: init.method,
    }));

    // TODO: remove this workaround once this has a fix: https://github.com/inrupt/solid-client-authn-js/issues/1708
    if (action.context.has(KeysHttp.fetch)) {
      init.headers = ActorHttp.headersToHash(headers);
    }

    if (action.context.get(KeysHttp.includeCredentials)) {
      init.credentials = 'include';
    }

    // Browsers don't yet support passing ReadableStream as body to requests, see
    // https://bugs.chromium.org/p/chromium/issues/detail?id=688906
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1387483
    // As such, we convert those bodies to a plain string
    // TODO: remove this once browser support ReadableStream in requests
    if (ActorHttpFetch.isBrowser() && init.body && typeof init.body === 'object' && 'getReader' in init.body) {
      const reader = init.body.getReader();
      const chunks = [];

      while (true) {
        const readResult = await reader.read();
        if (readResult.done) {
          break;
        }
        chunks.push(readResult.value);
      }

      init.body = chunks.join('');
    }

    // Only enable keepalive functionality if we are not sending a body (some browsers seem to trip over this).
    // The same applies to Node.js runtime, hence this common logic here.
    init.keepalive = !init.body;

    if (!ActorHttpFetch.isBrowser() && init.body) {
      // The Fetch API requires specific options to be set when sending body streams:
      // - 'keepalive' can not be true (handled above)
      // - 'duplex' must be set to 'half'
      (<any>init).duplex = 'half';
    }

    const httpTimeout = action.context.get<number>(KeysHttp.httpTimeout);
    const httpBodyTimeout = action.context.get<boolean>(KeysHttp.httpBodyTimeout);
    const fetchFunction = action.context.get<Fetch>(KeysHttp.fetch) ?? fetch;

    let timeoutCallback: () => void;
    let timeoutHandle: NodeJS.Timeout | undefined;

    if (httpTimeout) {
      const abortController = new AbortController();
      init.signal = abortController.signal;
      timeoutCallback = () => abortController.abort(new Error(`Fetch timed out for ${ActorHttpFetch.getInputUrl(action.input).href} after ${httpTimeout} ms`));
      timeoutHandle = setTimeout(() => timeoutCallback(), httpTimeout);
    }

    const response = await fetchFunction(action.input, init);

    if (httpTimeout && (!httpBodyTimeout || !response.body)) {
      clearTimeout(timeoutHandle);
    }

    return response;
  }

  /**
   * Prepares the request headers, taking into account the environment.
   * @param {IActionHttp} action The HTTP action
   * @returns {Headers} Headers
   */
  public prepareRequestHeaders(action: IActionHttp): Headers {
    const headers = new Headers(action.init?.headers);

    if (ActorHttpFetch.isBrowser()) {
      // When running in a browser, the User-Agent header should never be set
      headers.delete('user-agent');
    } else if (!headers.has('user-agent')) {
      // Otherwise, if no header value is provided, use the actor one
      headers.set('user-agent', ActorHttpFetch.userAgent!);
    }

    const authString = action.context.get<string>(KeysHttp.auth);
    if (authString) {
      headers.set('Authorization', `Basic ${Buffer.from(authString).toString('base64')}`);
    }

    return headers;
  }

  /**
   * Extract the requested URL from the action input.
   * @param {RequestInfo | URL} input The request input.
   * @returns {URL} The extracted URL.
   */
  public static getInputUrl(input: RequestInfo | URL): URL {
    return new URL(input instanceof Request ? input.url : input);
  }

  /**
   * Creates an appropriate User-Agent header string for Node.js or other environments.
   * Within browsers, returns undefined, because the value should not be overridden due to potential CORS issues.
   */
  public static createUserAgent(actorName: string, actorVersion: string): string | undefined {
    if (!ActorHttpFetch.isBrowser()) {
      const versions = [
        `Comunica/${actorVersion.split('.')[0]}.0`,
        `${actorName}/${actorVersion}`,
      ];

      if (typeof globalThis.navigator === 'object' && typeof globalThis.navigator.userAgent === 'string') {
        // Most runtimes like Node.js 21+, Deno and Bun implement navigator.userAgent
        versions.push(globalThis.navigator.userAgent);
      } else if (
        typeof globalThis.process === 'object' &&
        typeof globalThis.process.versions === 'object' &&
        typeof globalThis.process.versions.node === 'string'
      ) {
        // TODO: remove this entire 'else if' when support for Node.js 20 is dropped, this only exists for that one
        versions.push(`Node.js/${globalThis.process.versions.node.split('.')[0]}`);
      }

      if (
        typeof globalThis.process === 'object' &&
        typeof globalThis.process.platform === 'string' &&
        typeof globalThis.process.arch === 'string'
      ) {
        versions.splice(1, 0, `(${globalThis.process.platform}; ${globalThis.process.arch})`);
      }

      return versions.join(' ');
    }
  }

  /**
   * Attempts to determine whether the current environment is a browser or not.
   * @returns {boolean} True for browsers and web workers, false for other runtimes.
   */
  public static isBrowser(): boolean {
    return (
      // The window global and the document are available in browsers, but not in web workers
      // https://developer.mozilla.org/en-US/docs/Glossary/Global_object
      (typeof globalThis.window === 'object' && typeof globalThis.window.document === 'object') ||
      // The importScripts function is only available in Web Workers
      // https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/importScripts
      (typeof (<any>globalThis).importScripts === 'function')
    );
  }
}

export interface IActorHttpFetchArgs extends IActorHttpArgs {}
