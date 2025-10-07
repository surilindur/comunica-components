import type { MediatorHttp } from '@comunica/bus-http';
import { ActionContext } from '@comunica/core';
import { ActorHttpIgnore } from '../lib/ActorhttpIgnore';
import '@comunica/utils-jest';

describe('ActorHttpIgnore', () => {
  let actor: ActorHttpIgnore;
  let ignorePatterns: string[] | undefined;
  let mediatorHttp: MediatorHttp;
  let ignoreFailed: boolean;
  let bus: any;
  let context: ActionContext;

  beforeEach(() => {
    jest.resetAllMocks();
    bus = { subscribe: jest.fn().mockImplementation() };
    mediatorHttp = <any>{ mediate: jest.fn().mockRejectedValue(new Error('mediatorHttp.mediate')) };
    ignoreFailed = true;
    ignorePatterns = undefined;
    context = new ActionContext();
    actor = new ActorHttpIgnore({ bus, ignoreFailed, mediatorHttp, name: 'actor', ignorePatterns });
    jest.spyOn(<any>actor, 'logWarn').mockImplementation();
  });

  describe('test', () => {
    it('should wrap request', async() => {
      await expect(actor.test({ context, input: 'url' })).resolves.toPassTest({ time: 0 });
    });

    it('should not wrap requests multiple times', async() => {
      await expect(actor.test({
        context: context.set((<any>ActorHttpIgnore).keyWrapped, true),
        input: 'url',
      })).resolves.toFailTest('can only wrap a request once');
    });
  });

  describe('run', () => {
    it('should execute normally for non-ignored successful requests', async() => {
      const mockedResponse = { ok: true };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>mockedResponse);
      await expect(actor.run({ context, input: 'http://localhost/test' })).resolves.toEqual(mockedResponse);
      expect((<any>actor).ignoreUris.size).toBe(0);
    });

    it('should skip requests for ignored URIs', async() => {
      actor = new ActorHttpIgnore({ bus, ignoreFailed, mediatorHttp, name: 'actor', ignorePatterns: [ '^mailto:' ]});
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      await expect(actor.run({ context, input: 'mailto:example@localhost' })).resolves.toBeInstanceOf(Response);
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
    });

    it('should add non-ok URIs to ignore list when configured to', async() => {
      const mockedResponse = { ok: false };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>mockedResponse);
      expect((<any>actor).ignoreUris.size).toBe(0);
      await expect(actor.run({ context, input: 'http://localhost/test' })).resolves.toEqual(mockedResponse);
      expect((<any>actor).ignoreUris.size).toBe(1);
    });

    it('should not add non-ok URIs to ignore list when not configured to', async() => {
      (<any>actor).ignoreFailed = false;
      const mockedResponse = { ok: false };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>mockedResponse);
      expect((<any>actor).ignoreUris.size).toBe(0);
      await expect(actor.run({ context, input: 'http://localhost/test' })).resolves.toEqual(mockedResponse);
      expect((<any>actor).ignoreUris.size).toBe(0);
    });
  });
});
