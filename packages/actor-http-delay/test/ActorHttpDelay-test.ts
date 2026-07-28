import { ActionContext, Bus } from '@comunica/core';
import { ActorHttpDelay } from '../lib/ActorHttpDelay';
import '@comunica/utils-jest';

describe('ActorHttpDelay', () => {
  const average = 40;
  const delta = 0;
  const url = 'http://localhost:3000/some/url';

  let bus: any;
  let actor: ActorHttpDelay;

  beforeEach(() => {
    jest.restoreAllMocks();
    bus = new Bus({ name: 'bus' });
    actor = new ActorHttpDelay({
      bus,
      mediatorHttp: <any>{
        mediate: jest.fn().mockRejectedValue(new Error('mediatorHttp.mediate')),
      },
      name: 'actor',
      average,
      delta,
    });
  });

  describe('test', () => {
    it('should pass test', async() => {
      await expect(actor.test({
        context: new ActionContext({}),
        input: url,
      })).resolves.toPassTest({ time: 0 });
    });

    it('should fail if already wrapped', async() => {
      await expect(actor.test({
        context: new ActionContext({ [(<any>ActorHttpDelay).keyWrapped.name]: true }),
        input: url,
      })).resolves.toFailTest(`${actor.name} can only wrap a request once`);
    });

    it('should fail without latency range', async() => {
      (<any>actor).minimum = 0;
      (<any>actor).range = 0;
      await expect(actor.test({
        context: new ActionContext({}),
        input: url,
      })).resolves.toFailTest(`${actor.name} has no latency range available`);
    });
  });

  describe('run', () => {
    it('should delay requests', async() => {
      jest.spyOn((<any>actor).mediatorHttp, 'mediate').mockResolvedValue(<any>{ ok: true });
      jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback: Function) => <NodeJS.Timeout>callback());
      const logDebugSpy = jest.spyOn(<any>actor, 'logDebug');
      const result = await actor.run({ context: new ActionContext({}), input: url });
      expect(result).toEqual({ ok: true });
      expect(logDebugSpy).toHaveBeenCalledWith(expect.anything(), 'Delaying request', expect.any(Function));
      // Cover the logDebug callback by invoking it
      const callArgs = <any[]>logDebugSpy.mock.calls[0];
      expect(callArgs[2]()).toEqual({ url, delay: average });
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), average);
    });

    it('should forward mediator errors', async() => {
      jest.spyOn((<any>actor).mediatorHttp, 'mediate').mockRejectedValue(new Error('HTTP error'));
      jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback: Function) => <NodeJS.Timeout>callback());
      await expect(actor.run({ context: new ActionContext({}), input: url }))
        .rejects.toThrow('HTTP error');
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), average);
    });
  });
});
