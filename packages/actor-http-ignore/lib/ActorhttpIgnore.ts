import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import type { TestResult } from '@comunica/core';
import { ActionContextKey, failTest, passTest } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpIgnore extends ActorHttp {
  private readonly ignoreUris: Set<string>;
  private readonly ignoreFailed: boolean;
  private readonly ignorePatterns: RegExp[] | undefined;
  private readonly mediatorHttp: MediatorHttp;

  // Context key to indicate that the actor has already wrapped the given request
  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-delay#wrapped');

  public constructor(args: IActorHttpIgnoreArgs) {
    super(args);
    this.ignoreUris = new Set();
    this.mediatorHttp = args.mediatorHttp;
    this.ignoreFailed = args.ignoreFailed;
    this.ignorePatterns = args.ignorePatterns ? args.ignorePatterns.map(p => new RegExp(p, 'u')) : undefined;
  }

  public async test(action: IActionHttp): Promise<TestResult<IMediatorTypeTime>> {
    if (action.context.has(ActorHttpIgnore.keyWrapped)) {
      return failTest(`${this.name} can only wrap a request once`);
    }
    return passTest({ time: 0 });
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const requestUrl = ActorHttp.getInputUrl(action.input);

    if (this.ignoreUris.has(requestUrl.href) || this.ignorePatterns?.some(p => p.test(requestUrl.href))) {
      this.logWarn(action.context, `Skipping request to ${requestUrl.href}`);
      const body = new ReadableStream();
      const init: ResponseInit = {
        headers: new Headers(),
        status: 499,
        statusText: 'Client Closed Request',
      };
      return new Response(body, init);
    }

    const response = await this.mediatorHttp.mediate({
      ...action,
      context: action.context.set(ActorHttpIgnore.keyWrapped, true),
    });

    if (!response.ok && this.ignoreFailed) {
      this.ignoreUris.add(response.url);
      this.logWarn(action.context, `Adding ${response.url} to ignore list`);
    }

    return response;
  }
}

export interface IActorHttpIgnoreArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
  /**
   * Whether URIs with failed requests should be henceforth ignored.
   * @default {false}
   */
  ignoreFailed: boolean;
  /**
   * Optional patterns for ignoring URIs prior to submitting any requests.
   */
  ignorePatterns?: string[];
}
