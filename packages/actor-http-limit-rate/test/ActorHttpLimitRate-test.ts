import type { IActionHttp, IActorHttpOutput, ActorHttp, MediatorHttp } from '@comunica/bus-http';
import type { IActorTest } from '@comunica/core';
import { Bus, ActionContext } from '@comunica/core';
import { ActorHttpLimitRate } from '../lib/ActorHttpLimitRate';

describe('ActorHttpLimitRate', () => {
  let bus: Bus<ActorHttp, IActionHttp, IActorTest, IActorHttpOutput>;
  let actor: ActorHttpLimitRate;
  let context: ActionContext;
  let mediatorHttp: MediatorHttp;
  let input: URL;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorHttp = <any> {
      mediate: jest.fn().mockRejectedValue(new Error('mediatorHttp.mediate called without mocking')),
    };
    context = new ActionContext();
    input = new URL('http://example.org/abc');
    actor = new ActorHttpLimitRate({ bus, mediatorHttp, name: 'actor' });
    jest.spyOn(<any>actor, 'logDebug').mockImplementation();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should assign default limits when none are provided', () => {
      expect((<any>actor).concurrentRequestLimit).toBe(1_000);
      expect((<any>actor).requestDelayLimit).toBe(60_000);
    });

    it('should assign non-default limits when provided', () => {
      const concurrentRequestLimit = 1;
      const requestDelayLimit = 100;
      actor = new ActorHttpLimitRate({ bus, mediatorHttp, name: 'actor', concurrentRequestLimit, requestDelayLimit });
      expect((<any>actor).concurrentRequestLimit).toBe(concurrentRequestLimit);
      expect((<any>actor).requestDelayLimit).toBe(requestDelayLimit);
    });
  });

  describe('test', () => {
    it('should accept by default', async() => {
      await expect(actor.test({ input: input.href, context })).resolves.toEqual({ time: 0 });
    });

    it('should reject when the action has already been wrapped once', async() => {
      await expect(actor.test({
        input: input.href,
        context: context.set((<any>ActorHttpLimitRate).keyWrapped, true),
      })).rejects.toThrow(`${actor.name} can only wrap a request once`);
    });
  });

  describe('run', () => {
    beforeEach(() => {
      jest.spyOn(<any>actor, 'updateRateLimits').mockImplementation();
      jest.spyOn(<any>actor, 'advanceRequestQueue').mockImplementation();
    });

    it('should handle a request to previously unregistered host', async() => {
      const response: Response = <any> { ok: true };
      const errorHandler = jest.fn();
      const successHandler = jest.fn();
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      expect((<any>actor).updateRateLimits).not.toHaveBeenCalled();
      expect((<any>actor).advanceRequestQueue).not.toHaveBeenCalled();
      actor.run({ input: input.href, context }).then(successHandler).catch(errorHandler);
      await jest.runAllTimersAsync();
      expect(errorHandler).not.toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenNthCalledWith(1, response);
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
      expect((<any>actor).updateRateLimits).toHaveBeenCalledTimes(1);
      expect((<any>actor).advanceRequestQueue).toHaveBeenCalledTimes(1);
    });

    it('should add requests to queue when concurrent request limit is reached', async() => {
      const hostData = { queue: [], limit: 1, open: 1 };
      jest.spyOn(hostData.queue, 'push');
      (<any>actor).requests[input.host] = hostData;
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      expect((<any>actor).updateRateLimits).not.toHaveBeenCalled();
      expect((<any>actor).advanceRequestQueue).not.toHaveBeenCalled();
      const promise = actor.run({ input: input.href, context });
      expect(promise).toBeInstanceOf(Promise);
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      expect((<any>actor).updateRateLimits).not.toHaveBeenCalled();
      expect((<any>actor).advanceRequestQueue).not.toHaveBeenCalled();
      expect(hostData.queue.push).toHaveBeenCalledTimes(1);
      expect(hostData.queue).toHaveLength(1);
    });

    it('should propagate errors from the mediator', async() => {
      const error = new Error('mediator error');
      const errorHandler = jest.fn();
      const successHandler = jest.fn();
      jest.spyOn(mediatorHttp, 'mediate').mockRejectedValue(error);
      actor.run({ input: input.href, context }).then(successHandler).catch(errorHandler);
      await jest.runAllTimersAsync();
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenNthCalledWith(1, error);
    });
  });

  describe('updateRateLimits', () => {
    it('should lower the limits on failed request', async() => {
      const data = { delay: 10, limit: 9, previousSuccess: true };
      await (<any>actor).updateRateLimits('action', 'host', data, false);
      expect(data.delay).toBe(20);
      expect(data.limit).toBe(3);
      expect(data.previousSuccess).toBeFalsy();
    });

    it('should not modify the limits on single successful request', async() => {
      const data = { delay: 10, limit: 9, previousSuccess: false };
      await (<any>actor).updateRateLimits('action', 'host', data, true);
      expect(data.delay).toBe(10);
      expect(data.limit).toBe(9);
      expect(data.previousSuccess).toBeTruthy();
    });

    it('should lower the request delay on consecutive successful requests', async() => {
      const data = { delay: 10, limit: 9, open: 8, previousSuccess: true };
      await (<any>actor).updateRateLimits('action', 'host', data, true);
      expect(data.delay).toBe(9);
      expect(data.limit).toBe(9);
      expect(data.previousSuccess).toBeTruthy();
    });

    it('should increase the concurrent request limit on consecutive successful requests when capped', async() => {
      const data = { delay: 10, limit: 9, open: 9, previousSuccess: true };
      await (<any>actor).updateRateLimits('action', 'host', data, true);
      expect(data.delay).toBe(9);
      expect(data.limit).toBe(10);
      expect(data.previousSuccess).toBeTruthy();
    });
  });

  describe('advanceRequestQueue', () => {
    it('should advance the queue when the limit allows it', () => {
      const enqueueFirst = jest.fn();
      const enqueueSecond = jest.fn();
      const data = { queue: [ enqueueFirst, enqueueSecond ], open: 0, limit: 1 };
      jest.spyOn(data.queue, 'shift');
      (<any>actor).advanceRequestQueue(data);
      expect(data.queue.shift).toHaveBeenCalledTimes(1);
      expect(enqueueFirst).toHaveBeenCalledTimes(1);
      expect(enqueueSecond).not.toHaveBeenCalled();
    });

    it('should not advance the queue when the limit does not allow it', () => {
      const enqueueFirst = jest.fn();
      const data = { queue: [ enqueueFirst ], open: 1, limit: 1 };
      jest.spyOn(data.queue, 'shift');
      (<any>actor).advanceRequestQueue(data);
      expect(data.queue.shift).not.toHaveBeenCalled();
      expect(enqueueFirst).not.toHaveBeenCalled();
    });

    it('should not advance the queue when the limit allows it but the queue is empty', () => {
      const data = { queue: [], open: 0, limit: 1 };
      jest.spyOn(data.queue, 'shift');
      (<any>actor).advanceRequestQueue(data);
      expect(data.queue.shift).not.toHaveBeenCalled();
    });
  });

  describe('sleep', () => {
    it('should sleep for the specified time', async() => {
      const callback = jest.fn();
      const errorCallback = jest.fn();
      (<any>actor).sleep(100).then(callback).catch(errorCallback);
      expect(callback).not.toHaveBeenCalled();
      expect(errorCallback).not.toHaveBeenCalled();
      await jest.runAllTimersAsync();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(errorCallback).not.toHaveBeenCalled();
    });
  });
});
