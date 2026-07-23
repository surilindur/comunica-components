import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext, Bus } from '@comunica/core';
import type { IQueryOperationResultBindings, MetadataBindings } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { ActorRdfJoinInnerRestartMetadata } from '../lib/ActorRdfJoinInnerRestartMetadata';
import '@comunica/utils-jest';

function createMockOutput(): IQueryOperationResultBindings {
  return <IQueryOperationResultBindings> <unknown> {
    type: 'bindings',
    bindingsStream: <any>{ destroy: jest.fn() },
    metadata: async() => ({
      state: <any>{ valid: true, addInvalidateListener: jest.fn() },
      cardinality: { value: 0, type: 'estimate' },
      variables: [],
    }),
  };
}

function createMockBindingsStream(): any {
  const listeners: Record<string, Function[]> = {};
  return {
    on: jest.fn((event: string, callback: Function) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    }),
    emitEvent: jest.fn((event: string) => {
      if (listeners[event]) {
        for (const cb of listeners[event]) {
          cb();
        }
      }
    }),
    destroy: jest.fn(),
  };
}

function createMockMetadata(
  cardinalityValue = 10,
): {
    metadata: MetadataBindings;
    triggerInvalidate: () => void;
  } {
  let invalidateListener: (() => void) | undefined;

  const metadata: MetadataBindings = {
    cardinality: { value: cardinalityValue, type: 'estimate' },
    state: {
      valid: true,
      invalidate: jest.fn(),
      addInvalidateListener: jest.fn((listener: () => void) => {
        invalidateListener = listener;
      }),
    },
    variables: [],
  };

  return {
    metadata,
    triggerInvalidate: () => {
      invalidateListener?.();
    },
  };
}

function createMockOutputWithMetadata(metadata: MetadataBindings): IQueryOperationResultBindings {
  return <IQueryOperationResultBindings> {
    type: 'bindings',
    bindingsStream: <any>{ destroy: jest.fn() },
    metadata: async() => metadata,
  };
}

function createActor(
  name: string,
  mediatorHashBindings_: MediatorHashBindings,
  mediatorJoin_: MediatorRdfJoin,
  mediatorJoinEntriesSort_: MediatorRdfJoinEntriesSort,
  restartLimit?: number,
) {
  return new ActorRdfJoinInnerRestartMetadata({
    bus: new Bus({ name }),
    mediatorHashBindings: mediatorHashBindings_,
    mediatorJoin: mediatorJoin_,
    mediatorJoinEntriesSort: mediatorJoinEntriesSort_,
    mediatorJoinSelectivity: <any> {
      name: 'mock-selectivity',
      bus: new Bus({ name: 'mock-selectivity' }),
      publish: jest.fn(),
      mediateActor: jest.fn(),
      mediate: jest.fn().mockResolvedValue({ selectivity: 0.5 }),
    },
    name,
    restartLimit,
  });
}

function createDefaultMocks() {
  const mediatorHashBindings = <MediatorHashBindings> <unknown> {
    mediate: jest.fn().mockResolvedValue({
      hashFunction: (bindings: RDF.Bindings, variables: Iterable<RDF.Variable>): number => {
        const keysArray = [ ...variables ];
        const parts = keysArray
          .sort((a, b) => a.value.localeCompare(b.value))
          .map(v => `${v.value}:${bindings.get(v)?.value}`);
        let hash = 0;
        for (const part of parts) {
          for (let i = 0; i < part.length; i++) {
            const codePoint = part.codePointAt(i) ?? 0;
            hash = ((hash << 5) - hash) + codePoint;
            hash &= hash;
          }
        }
        return hash;
      },
    }),
  };

  const mediatorJoin = <MediatorRdfJoin> <unknown> {
    mediate: jest.fn().mockResolvedValue(createMockOutput()),
  };

  const mediatorJoinEntriesSort = <MediatorRdfJoinEntriesSort> <unknown> {
    mediate: jest.fn().mockResolvedValue({ entries: []}),
  };

  return { mediatorHashBindings, mediatorJoin, mediatorJoinEntriesSort };
}

describe('ActorRdfJoinInnerRestartMetadata', () => {
  let actor: ActorRdfJoinInnerRestartMetadata;
  let mediatorHashBindings: MediatorHashBindings;
  let mediatorJoin: MediatorRdfJoin;
  let mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();

    const mocks = createDefaultMocks();
    mediatorHashBindings = mocks.mediatorHashBindings;
    mediatorJoin = mocks.mediatorJoin;
    mediatorJoinEntriesSort = mocks.mediatorJoinEntriesSort;

    actor = createActor('test-actor', mediatorHashBindings, mediatorJoin, mediatorJoinEntriesSort);
  });

  describe('test', () => {
    it('should fail when adaptive join is disabled via skipAdaptiveJoin context', async() => {
      const context = new ActionContext().set(KeysRdfJoin.skipAdaptiveJoin, true);
      await expect(actor.test({
        context,
        type: 'inner',
        entries: [],
      })).resolves.toFailTest('Actor test-actor cannot run due to adaptive join being disabled');
    });

    it('should fail when keyWrapped is already set in context', async() => {
      const context = new ActionContext().set(<any> ActorRdfJoinInnerRestartMetadata.keyWrapped, true);
      await expect(actor.test({
        context,
        type: 'inner',
        entries: [],
      })).resolves.toFailTest('Actor test-actor can only wrap the topmost join operation');
    });

    it('should pass when adaptive join is enabled and not wrapped', async() => {
      await expect(actor.test({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: { type: 'source1' }, output: createMockOutput() },
          { operation: { type: 'source2' }, output: createMockOutput() },
        ],
      })).resolves.toPassTest(expect.objectContaining({
        blockingItems: expect.any(Number),
        iterations: expect.any(Number),
        persistedItems: expect.any(Number),
        requestTime: expect.any(Number),
      }));
    });
  });

  describe('constructor', () => {
    it('should create a concrete instance with all dependencies', () => {
      const testActor = createActor(
        'test-actor',
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
      );

      expect(testActor.name).toBe('test-actor');
      expect(testActor).toBeInstanceOf(ActorRdfJoinInnerRestartMetadata);
    });

    it('should work with restartLimit when provided', () => {
      const testActor = createActor(
        'test-actor-with-limit',
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        10,
      );

      expect(testActor).toBeDefined();
    });
  });

  describe('registerRestartTriggers', () => {
    it('should register invalidate listeners on each entry metadata', async() => {
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      const entry1 = createMockMetadata(10);
      const entry2 = createMockMetadata(20);

      const output1 = createMockOutputWithMetadata(entry1.metadata);
      const output2 = createMockOutputWithMetadata(entry2.metadata);

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2.metadata },
      ], mockStream, attemptRestart);

      expect(entry1.metadata.state.addInvalidateListener).toHaveBeenCalledTimes(1);
      expect(entry2.metadata.state.addInvalidateListener).toHaveBeenCalledTimes(1);
    });

    it('should call attemptJoinPlanRestart when cardinality changes', async() => {
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      const entry1 = createMockMetadata(10);
      const entry2 = createMockMetadata(20);

      const output1 = createMockOutputWithMetadata(entry1.metadata);
      const output2 = createMockOutputWithMetadata(entry2.metadata);

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2.metadata },
      ], mockStream, attemptRestart);

      (<any> entry1.metadata).cardinality = { value: 50, type: 'estimate' };
      entry1.triggerInvalidate();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);
    });

    it('should NOT call attemptJoinPlanRestart when cardinality does not change', async() => {
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      const entry1 = createMockMetadata(10);
      const entry2 = createMockMetadata(20);

      const output1 = createMockOutputWithMetadata(entry1.metadata);
      const output2 = createMockOutputWithMetadata(entry2.metadata);

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2.metadata },
      ], mockStream, attemptRestart);

      entry1.triggerInvalidate();
      entry2.triggerInvalidate();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).not.toHaveBeenCalled();
    });

    it('should update previousEntryCardinality and trigger restart on successive changes', async() => {
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      const entry1 = createMockMetadata(10);
      const output1 = createMockOutputWithMetadata(entry1.metadata);

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
      ], mockStream, attemptRestart);

      (<any> entry1.metadata).cardinality = { value: 50, type: 'estimate' };
      entry1.triggerInvalidate();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(attemptRestart).toHaveBeenCalledTimes(1);

      (<any> entry1.metadata).cardinality = { value: 100, type: 'estimate' };
      entry1.triggerInvalidate();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(attemptRestart).toHaveBeenCalledTimes(2);
    });

    it('should handle errors from attemptJoinPlanRestart by destroying the stream', async() => {
      const destroyMock1 = jest.fn();
      const mockStream = createMockBindingsStream();
      const error = new Error('Restart failed');
      const attemptRestart = jest.fn().mockRejectedValue(error);

      const entry1 = createMockMetadata(10);

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: destroyMock1 },
        metadata: async() => entry1.metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
      ], mockStream, attemptRestart);

      (<any> entry1.metadata).cardinality = { value: 50, type: 'estimate' };
      entry1.triggerInvalidate();

      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);
      expect(destroyMock1).toHaveBeenCalledWith(error);
    });

    it('should not call attemptJoinPlanRestart if cardinality stays the same after multiple invalidations', async() => {
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      const entry1 = createMockMetadata(10);
      const output1 = createMockOutputWithMetadata(entry1.metadata);

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
      ], mockStream, attemptRestart);

      for (let i = 0; i < 5; i++) {
        entry1.triggerInvalidate();
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      expect(attemptRestart).not.toHaveBeenCalled();
    });

    it('should not throw when registerRestartTriggers executes successfully with empty entries', async() => {
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      await expect(actor.registerRestartTriggers([], mockStream, attemptRestart))
        .resolves.toBeUndefined();
    });

    it('should handle errors from entry.output.metadata() by destroying the stream', async() => {
      const destroyMock1 = jest.fn();
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const metadataError = new Error('Metadata fetch failed');

      const entry1 = createMockMetadata(10);

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: destroyMock1 },
        metadata: async() => {
          throw metadataError;
        },
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
      ], mockStream, attemptRestart);

      entry1.triggerInvalidate();

      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(destroyMock1).toHaveBeenCalledWith(metadataError);
    });

    it('should properly handle multiple entries with independent cardinality changes', async() => {
      const mockStream = createMockBindingsStream();
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      const entry1 = createMockMetadata(10);
      const entry2 = createMockMetadata(20);
      const entry3 = createMockMetadata(30);

      const output1 = createMockOutputWithMetadata(entry1.metadata);
      const output2 = createMockOutputWithMetadata(entry2.metadata);
      const output3 = createMockOutputWithMetadata(entry3.metadata);

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1.metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2.metadata },
        { operation: { type: 'source3' }, output: output3, metadata: entry3.metadata },
      ], mockStream, attemptRestart);

      (<any> entry2.metadata).cardinality = { value: 100, type: 'estimate' };
      entry2.triggerInvalidate();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);

      (<any> entry1.metadata).cardinality = { value: 5, type: 'estimate' };
      (<any> entry3.metadata).cardinality = { value: 50, type: 'estimate' };
      entry1.triggerInvalidate();
      entry3.triggerInvalidate();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(3);
    });
  });
});
