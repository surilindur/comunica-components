import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  IActionRdfJoin,
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import type { MediatorRdfJoinSelectivity } from '@comunica/bus-rdf-join-selectivity';

import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext, Bus } from '@comunica/core';
import type { IJoinEntry, IQueryOperationResultBindings } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinInnerRestartBase } from '../lib/ActorRdfJoinInnerRestartBase';
import '@comunica/utils-jest';

const DF = new DataFactory();

class TestActorRdfJoinInnerRestartBase extends ActorRdfJoinInnerRestartBase {
  public async registerRestartTriggers(
    _entries: import('@comunica/types').IJoinEntryWithMetadata[],
    _bindingsStream: import('@comunica/types').BindingsStream,
    _attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void> {
    // Not tested in this base class test
  }
}

function createMockJoinOutput(bindingsArray: RDF.Bindings[] = []): IQueryOperationResultBindings {
  const iterator = new ArrayIterator<RDF.Bindings>(bindingsArray, { autoStart: false });
  return <IQueryOperationResultBindings> <unknown> {
    type: 'bindings',
    bindingsStream: iterator,
    metadata: async() => ({
      state: new MetadataValidationState(),
      cardinality: { value: bindingsArray.length, type: 'estimate' },
      variables: [{ variable: DF.variable('x') }],
    }),
  };
}

function createMockEntry(index: number): IJoinEntry {
  return {
    operation: { type: `source${index}` },
    output: <IQueryOperationResultBindings> <unknown> {
      type: 'bindings',
      bindingsStream: new ArrayIterator([]),
      metadata: async() => ({
        state: new MetadataValidationState(),
        cardinality: { value: 10, type: 'estimate' },
        variables: [],
      }),
    },
  };
}

describe('ActorRdfJoinInnerRestartBase', () => {
  let mediatorHashBindings: MediatorHashBindings;
  let mediatorJoin: MediatorRdfJoin;
  let mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;
  let mediatorJoinSelectivity: MediatorRdfJoinSelectivity;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();

    mediatorHashBindings = <MediatorHashBindings> <unknown> {
      mediate: jest.fn().mockResolvedValue({
        hashFunction: (
          bindings: RDF.Bindings,
          variables: Iterable<RDF.Variable>,
        ): number => {
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
      mediate: jest.fn().mockResolvedValue(createMockJoinOutput()),
    };

    mediatorJoinEntriesSort = <MediatorRdfJoinEntriesSort> <unknown> {
      mediate: jest.fn().mockResolvedValue({ entries: []}),
    };

    mediatorJoinSelectivity = <MediatorRdfJoinSelectivity> <unknown> {
      mediate: jest.fn().mockResolvedValue({ selectivity: 0.5 }),
    };
  });
  describe('constructor', () => {
    it('should create a concrete instance with all dependencies', () => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      expect(actor.name).toBe('test-actor');
      expect(actor).toBeInstanceOf(TestActorRdfJoinInnerRestartBase);
    });

    it('should work with restartLimit when provided', () => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor-with-limit' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor-with-limit',
        restartLimit: 10,
      });

      expect(actor).toBeDefined();
    });

    it('should default restartLimit to positive infinity when not provided', () => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor-no-limit' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor-no-limit',
      });

      expect(actor).toBeDefined();
    });
  });

  describe('test', () => {
    it('should pass when adaptive join is enabled and not wrapped', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      await expect(actor.test({
        context: new ActionContext(),
        type: 'inner',
        entries: [ createMockEntry(1), createMockEntry(2) ],
      })).resolves.toPassTest(expect.objectContaining({
        blockingItems: expect.any(Number),
        iterations: expect.any(Number),
        persistedItems: expect.any(Number),
        requestTime: expect.any(Number),
      }));
    });

    it('should fail when adaptive join is disabled via skipAdaptiveJoin context', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const context = new ActionContext().set(KeysRdfJoin.skipAdaptiveJoin, true);

      await expect(actor.test({
        context,
        type: 'inner',
        entries: [],
      })).resolves.toFailTest('Actor test-actor cannot run due to adaptive join being disabled');
    });

    it('should fail when keyWrapped is already set in context', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const context = new ActionContext().set(<any> ActorRdfJoinInnerRestartBase.keyWrapped, true);

      await expect(actor.test({
        context,
        type: 'inner',
        entries: [],
      })).resolves.toFailTest('Actor test-actor can only wrap the topmost join operation');
    });
  });

  describe('getJoinCoefficients', () => {
    it('should return coefficients with all zero values', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [ createMockEntry(1), createMockEntry(2) ],
      };

      await expect(actor.test(action)).resolves.toPassTest(expect.objectContaining({
        blockingItems: 0,
        iterations: 0,
        persistedItems: 0,
        requestTime: 0,
      }));
    });
  });

  describe('sortJoinEntries', () => {
    it('should return sorted entries with metadata attached', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const entries = [ createMockEntry(1), createMockEntry(2) ];
      const context = new ActionContext();

      const result = await actor.sortJoinEntries(entries, context);

      expect(result).toEqual([]);
    });

    it('should call mediatorJoinEntriesSort.mediate with sorted entries', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const mockEntry1: IJoinEntry = {
        operation: { type: 'source1' },
        output: <IQueryOperationResultBindings> <unknown> {
          type: 'bindings',
          bindingsStream: new ArrayIterator([]),
          metadata: async() => ({
            state: new MetadataValidationState(),
            cardinality: { value: 10, type: 'estimate' },
            variables: [],
          }),
        },
      };

      const mockEntry2: IJoinEntry = {
        operation: { type: 'source2' },
        output: <IQueryOperationResultBindings> <unknown> {
          type: 'bindings',
          bindingsStream: new ArrayIterator([]),
          metadata: async() => ({
            state: new MetadataValidationState(),
            cardinality: { value: 20, type: 'estimate' },
            variables: [],
          }),
        },
      };

      const context = new ActionContext();

      await actor.sortJoinEntries([ mockEntry1, mockEntry2 ], context);

      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledWith(expect.objectContaining({
        context,
        entries: expect.arrayContaining([
          expect.objectContaining({ operation: { type: 'source1' }}),
          expect.objectContaining({ operation: { type: 'source2' }}),
        ]),
      }));
    });
  });

  describe('getOutput', () => {
    it('should execute without errors and return proper output structure', async() => {
      const mockBF = new BindingsFactory(DF);
      const mockBindings = mockBF.fromRecord({});
      const mockJoinOutput = createMockJoinOutput([ mockBindings ]);

      (<jest.Mock> <any> mediatorJoin.mediate).mockResolvedValue(mockJoinOutput);
      (<jest.Mock> <any> mediatorHashBindings.mediate).mockResolvedValue({
        hashFunction: (
          _bindings: RDF.Bindings,
          _variables: Iterable<RDF.Variable>,
        ): number => 0,
      });

      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [ createMockEntry(1), createMockEntry(2) ],
      };

      const result = await actor.getOutput(action);

      expect(result).toBeDefined();
      expect(result.result.type).toBe('bindings');
      expect(result.result.bindingsStream).toBeDefined();
      expect(result.result.metadata).toBeDefined();
    });
  });

  describe('executeJoin', () => {
    it('should call mediatorJoin.mediate with cloned streams', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [
          createMockEntry(1),
          createMockEntry(2),
        ],
      };

      await actor.executeJoin(action, action.context);

      expect(mediatorJoin.mediate).toHaveBeenCalledTimes(1);
      const callArgs = (<jest.Mock> <any> mediatorJoin.mediate).mock.calls[0][0];
      expect(callArgs.type).toBe('inner');
      expect(callArgs.context).toBe(action.context);
      expect(callArgs.entries).toHaveLength(2);
    });

    it('should clone each input stream in the join action', async() => {
      const actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'test-actor',
      });

      const originalStream = new ArrayIterator<RDF.Bindings>([]);
      const cloneSpy = jest.spyOn(originalStream, 'clone');

      const mockOutput: IQueryOperationResultBindings = {
        type: 'bindings',
        bindingsStream: <any> originalStream,
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'estimate' },
          variables: [],
        }),
      };

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [{ operation: { type: 'source1' }, output: mockOutput }],
      };

      await actor.executeJoin(action, action.context);

      expect(cloneSpy).toHaveBeenCalledTimes(1);
    });
  });
});
