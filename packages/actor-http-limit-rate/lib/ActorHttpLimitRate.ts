import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { ActionContextKey } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly mediatorHttp: MediatorHttp;
  private readonly concurrentRequestLimit: number;
  private readonly requestDelayLimit: number;
  private readonly requests: Record<string, IHostRequestData>;

  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpQueueArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.concurrentRequestLimit = args.concurrentRequestLimit ?? 1_000;
    this.requestDelayLimit = args.requestDelayLimit ?? 60_000;
    this.requests = {};
  }

  public async test(action: IActionHttp): Promise<IMediatorTypeTime> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      throw new Error(`${this.name} can only wrap a request once`);
    }
    return { time: 0 };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const host = ActorHttpLimitRate.getInputUrl(action.input).host;

    if (typeof this.requests[host] === 'undefined') {
      this.requests[host] = { queue: [], open: 0, limit: 1, delay: 1_000, previousSuccess: true };
    }

    // The enqueue function resolves the 'wait' promise, which triggers the actual request.
    // The 'queue' is essentially an array of these enqueue functions.
    let enqueue = (): void => {};

    const output = new Promise<IActorHttpOutput>((resolve, reject) => {
      let success = false;
      new Promise<void>((stopWaiting) => {
        enqueue = stopWaiting;
      }).then(() => {
        this.sleep(this.requests[host].delay).then(() => {
          this.requests[host].open++;
          this.mediatorHttp.mediate({
            ...action,
            context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
          }).then((response) => {
            success = response.ok;
            resolve(response);
          }).catch(reject).finally(() => {
            this.updateRateLimits(action, host, this.requests[host], success);
            this.requests[host].open--;
            this.advanceRequestQueue(this.requests[host]);
          });
        }).catch(reject);
      }).catch(reject);
    });

    if (this.requests[host].open < this.requests[host].limit) {
      enqueue();
    } else {
      this.requests[host].queue.push(enqueue);
    }

    return output;
  }

  /**
   * Register a request at a host as finished. This function will despatch the next requests from the queue,
   * as well as update the request limit and delay accordingly.
   * @param {IActionHttp} action The original action from run method.
   * @param {string} host The host for which the data is.
   * @param {IHostRequestData} data The host request data in need of updating.
   * @param {boolean} success Whether the request was successful or not.
   */
  private updateRateLimits(action: IActionHttp, host: string, data: IHostRequestData, success: boolean): void {
    if (!success) {
      data.delay = Math.min(this.requestDelayLimit, data.delay * 2);
      data.limit = Math.round(Math.sqrt(data.limit));
    } else if (data.previousSuccess) {
      data.delay = Math.ceil(data.delay * 0.9);
      if (data.open >= data.limit && data.limit < this.concurrentRequestLimit) {
        data.limit++;
      }
    }

    this.logDebug(action.context, `Updated rate limits for ${host}`, () => ({
      success,
      previousSuccess: data.previousSuccess,
      openRequests: data.open,
      concurrentRequestLimit: data.limit,
      requestQueueLength: data.queue.length,
      requestDelayMilliseconds: data.delay,
    }));

    data.previousSuccess = success;
  }

  /**
   * Advances the request queue for the specified host to fill the allowed open requests.
   * @param {IHostRequestData} data The host request data to advance the queue for.
   */
  private advanceRequestQueue(data: IHostRequestData): void {
    for (let i = Math.min(data.queue.length, data.limit - data.open); i > 0; i--) {
      data.queue.shift()!();
    }
  }

  /**
   * Waits for the specified number of milliseconds.
   * @param {number} ms The amount of time to wait
   */
  private async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract the requested URL from the action input.
   * @param {RequestInfo | URL} input The request input.
   * @returns {URL} The extracted URL.
   */
  public static getInputUrl(input: RequestInfo | URL): URL {
    return new URL(input instanceof Request ? input.url : input);
  }
}

interface IHostRequestData {
  queue: (() => void)[];
  open: number;
  delay: number;
  limit: number;
  previousSuccess: boolean;
};

export interface IActorHttpQueueArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
  /**
   * The maximum number of concurrent requests to send to a server.
   */
  concurrentRequestLimit?: number;
  /**
   * The maximum delay between subsequent requests.
   */
  requestDelayLimit?: number;
}
