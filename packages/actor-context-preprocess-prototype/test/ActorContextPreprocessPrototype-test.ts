import type { IActionContextPreprocess } from '@comunica/bus-context-preprocess';
import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import type { IActorContextPreprocessPrototypeArgs } from '../lib/ActorContextPreprocessPrototype';
import { ActorContextPreprocessPrototype } from '../lib/ActorContextPreprocessPrototype';
import '@comunica/utils-jest';

describe('ActorContextPreprocessPrototype', () => {
  const args: IActorContextPreprocessPrototypeArgs = {
    bus: <any> {
      subscribe: jest.fn(),
    },
    name: 'actor',
    filters: true,
  };

  describe('constructor', () => {
    it.each([
      true,
      false,
    ])('should create instance with filters set to %s', (filters) => {
      const actor = new ActorContextPreprocessPrototype({ ...args, filters });
      expect(actor.filters).toBe(filters);
    });
  });

  describe('test', () => {
    it.each([
      true,
      false,
    ])('should pass with initialize set to %s', async(initialize) => {
      const actor = new ActorContextPreprocessPrototype(args);
      const context = new ActionContext();
      const action: IActionContextPreprocess = { context, initialize };
      await expect(actor.test(action)).resolves.toPassTestVoid();
    });
  });

  describe('run', () => {
    it.each([
      [ 'should', true, true ],
      [ 'should not', false, true ],
      [ 'should not', true, false ],
      [ 'should not', false, false ],
    ])('%s set linkFilters array in context when filters is %s and initialize is %s', async(_, filters, initialize) => {
      const actor = new ActorContextPreprocessPrototype({ ...args, filters });
      const context = new ActionContext();
      const action: IActionContextPreprocess = { context, initialize };
      const result = await actor.run(action);
      expect(result.context).toBeDefined();
      expect(result.context.get(KeysRdfResolveHypermediaLinks.linkFilters)).toEqual(
        filters && initialize ? [] : undefined,
      );
    });
  });
});
