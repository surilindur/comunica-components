import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { ActionContext, Bus } from '@comunica/core';
import type { IQueryOperationResultBindings } from '@comunica/types';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinInnerRestartInterval } from '../lib/ActorRdfJoinInnerRestartInterval';
import '@comunica/utils-jest';

const DF = new DataFactory();

function createMockOutput(bindingsArray: RDF.Bindings[] = []): IQueryOperationResultBindings {
  const iterator = new ArrayIterator<RDF.Bindings>(bindingsArray, { autoStart: false });
  return <IQueryOperationResultBindings> <unknown> {
    type: 'bindings',
    bindingsStream: iterator,
    metadata: async() => ({
      state: new MetadataValidationState(),
      cardinality: { value: bindingsArray.length, type: 'inferred' },
      variables: [{ variable: DF.variable('x'), canBeUndef: false }],
    }),
  };
}

describe('ActorRdfJoinInnerRestartInterval', () => {
  let mediatorHashBindings: MediatorHashBindings;
  let mediatorJoin: MediatorRdfJoin;
  let mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();

    mediatorHashBindings = <MediatorHashBindings> <unknown> {
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

    mediatorJoin = <MediatorRdfJoin> <unknown> {
      mediate: jest.fn().mockResolvedValue(createMockOutput()),
    };

    mediatorJoinEntriesSort = <MediatorRdfJoinEntriesSort> <unknown> {
      mediate: jest.fn().mockResolvedValue({ entries: []}),
    };
  });

  function createTestActor(
    name: string,
    evaluationInterval: number,
  ) {
    return new ActorRdfJoinInnerRestartInterval({
      bus: new Bus({ name }),
      mediatorHashBindings,
      mediatorJoin,
      mediatorJoinEntriesSort,
      mediatorJoinSelectivity: <any> {
        name: 'mock-selectivity',
        bus: new Bus({ name: 'mock-selectivity' }),
        publish: jest.fn(),
        mediateActor: jest.fn(),
        mediate: jest.fn().mockResolvedValue({ selectivity: 0.5 }),
      },
      name,
      evaluationInterval,
    });
  }

  describe('test', () => {
    it.each([ -100, 0, 1, 99 ])('should fail when evaluationInterval is %d', async(intervals) => {
      const actor = createTestActor('test-actor', intervals);
      await expect(actor.test({
        context: new ActionContext(),
        type: 'inner',
        entries: [],
      })).resolves.toFailTest('Actor test-actor has invalid evaluation interval specified');
    });

    it.each([ 100, 500 ])('should pass when evaluationInterval is %d', async(interval) => {
      const actor = createTestActor('test-actor', interval);
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();
      await expect(actor.test({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: { type: 'source1' }, output: mockOutput1 },
          { operation: { type: 'source2' }, output: mockOutput2 },
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
    it('should create a concrete instance with all dependencies including evaluationInterval', () => {
      const actor = createTestActor('test-actor', 1000);

      expect(actor.name).toBe('test-actor');
      expect(actor).toBeInstanceOf(ActorRdfJoinInnerRestartInterval);
    });
  });

  describe('registerRestartTriggers', () => {
    function createMockBindingsStream(done = false): any {
      const listeners: Record<string, Function[]> = {};
      return {
        done,
        totalBindingsProduced: 0,
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

    it('should call attemptJoinPlanRestart at each evaluation interval while stream is not done', async() => {
      jest.useFakeTimers();
      const actor = createTestActor('test-actor', 100);
      const mockStream = createMockBindingsStream(false);
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      await actor.registerRestartTriggers([], mockStream, attemptRestart);

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it('should stop calling attemptJoinPlanRestart when bindingsStream.done becomes true', async() => {
      jest.useFakeTimers();
      const actor = createTestActor('test-actor', 100);
      const mockStream = createMockBindingsStream(false);
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      await actor.registerRestartTriggers([], mockStream, attemptRestart);

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(1);

      mockStream.done = true;

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('should clear timeout when bindingsStream emits end event', async() => {
      jest.useFakeTimers();
      const actor = createTestActor('test-actor', 100);
      const mockStream = createMockBindingsStream(false);
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      await actor.registerRestartTriggers([], mockStream, attemptRestart);

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(1);

      mockStream.emitEvent('end');

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('should handle async errors from attemptJoinPlanRestart by destroying the stream', async() => {
      jest.useFakeTimers();
      const actor = createTestActor('test-actor', 100);
      const mockStream = createMockBindingsStream(false);
      const error = new Error('Restart failed');
      const attemptRestart = jest.fn().mockRejectedValue(error);

      await actor.registerRestartTriggers([], mockStream, attemptRestart);

      await jest.advanceTimersByTimeAsync(100);
      expect(mockStream.destroy).toHaveBeenCalledWith(error);
      jest.useRealTimers();
    });

    it('should schedule first evaluation after exactly evaluationInterval milliseconds', async() => {
      jest.useFakeTimers();
      const actor = createTestActor('test-actor', 500);
      const mockStream = createMockBindingsStream(false);
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      await actor.registerRestartTriggers([], mockStream, attemptRestart);

      expect(attemptRestart).toHaveBeenCalledTimes(0);

      await jest.advanceTimersByTimeAsync(499);
      expect(attemptRestart).toHaveBeenCalledTimes(0);

      await jest.advanceTimersByTimeAsync(1);
      expect(attemptRestart).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('should not call attemptJoinPlanRestart if stream is already done at registration', async() => {
      jest.useFakeTimers();
      const actor = createTestActor('test-actor', 100);
      const mockStream = createMockBindingsStream(true);
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      await actor.registerRestartTriggers([], mockStream, attemptRestart);

      await jest.advanceTimersByTimeAsync(100);
      expect(attemptRestart).toHaveBeenCalledTimes(0);
      jest.useRealTimers();
    });
  });
});
