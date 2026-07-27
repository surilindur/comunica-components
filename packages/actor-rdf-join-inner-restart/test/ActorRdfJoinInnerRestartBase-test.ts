import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import type {
  IActionRdfJoinEntriesSort,
  IActorRdfJoinEntriesSortOutput,
  MediatorRdfJoinEntriesSort,
} from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext, Bus } from '@comunica/core';
import type {
  BindingsStream,
  IActionContext,
  IJoinEntry,
  IJoinEntryWithMetadata,
  IQueryOperationResultBindings,
  MetadataBindings,
} from '@comunica/types';
import { BF, DF } from '@comunica/utils-jest';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { ActorRdfJoinInnerRestartBase } from '../lib/ActorRdfJoinInnerRestartBase';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';

/**
 * Concrete implementation of the abstract base class for testing.
 */
class TestActorRdfJoinInnerRestartBase extends ActorRdfJoinInnerRestartBase {
  public restartCallback: (() => Promise<void>) | null = null;

  public async registerRestartTriggers(
    _entries: IJoinEntryWithMetadata[],
    _bindingsStream: BindingsStream,
    attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void> {
    // Store the restart callback for manual triggering in tests
    this.restartCallback = attemptJoinPlanRestart;
  }

  /**
   * Helper function to force join restart attempts.
   */
  public async triggerRestart(): Promise<void> {
    if (this.restartCallback) {
      await this.restartCallback();
    }
  }

  /**
   * Force the data function to be called
   */
  protected logWarn(_context: IActionContext, _message: string, data?: (() => any)): void {
    if (data) {
      data();
    }
  }
}

describe('ActorRdfJoinInnerRestartBase', () => {
  let mediatorHashBindings: MediatorHashBindings;
  let mediatorJoin: MediatorRdfJoin;
  let mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;
  let mediatorJoinEntriesSortMock: jest.Mock;
  let actor: TestActorRdfJoinInnerRestartBase;

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
      mediate: jest.fn().mockResolvedValue(<IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      }),
    };

    mediatorJoinEntriesSortMock = jest.fn().mockResolvedValue({ entries: []});
    mediatorJoinEntriesSort = <MediatorRdfJoinEntriesSort> <unknown> {
      mediate: mediatorJoinEntriesSortMock,
    };

    actor = new TestActorRdfJoinInnerRestartBase({
      bus: new Bus({ name: 'test-actor' }),
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
      name: 'test-actor',
      restartLimit: 1,
    });
  });

  describe('constructor', () => {
    it('should use provided restartLimit value', () => {
      expect(actor).toBeInstanceOf(TestActorRdfJoinInnerRestartBase);
      expect(actor).toHaveProperty('restartLimit', 1);
    });

    it('should default to unlimited restarts without a limit', () => {
      actor = new TestActorRdfJoinInnerRestartBase({
        bus: new Bus({ name: 'test-actor' }),
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
        name: 'test-actor',
        restartLimit: undefined,
      });
      expect(actor).toBeInstanceOf(TestActorRdfJoinInnerRestartBase);
      expect(actor).toHaveProperty('restartLimit', Number.POSITIVE_INFINITY);
    });
  });

  describe('test', () => {
    it('should pass when adaptive join is enabled and not wrapped', async() => {
      const mockOutput1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };
      const mockOutput2 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };

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

    it('should fail when adaptive join is disabled via skipAdaptiveJoin context', async() => {
      const context = new ActionContext().set(KeysRdfJoin.skipAdaptiveJoin, true);

      await expect(actor.test({
        context,
        type: 'inner',
        entries: [],
      })).resolves.toFailTest('Actor test-actor cannot run due to adaptive join being disabled');
    });

    it('should fail when trying to wrap a non-topmost operation via keyWrapped context', async() => {
      const context = new ActionContext().set(ActorRdfJoinInnerRestartBase.keyWrapped, true);

      await expect(actor.test({
        context,
        type: 'inner',
        entries: [],
      })).resolves.toFailTest('Actor test-actor can only wrap the topmost join operation');
    });
  });

  describe('getJoinCoefficients', () => {
    it('should return passTest with lowest possible coefficients', async() => {
      const sideData = {
        blockingItems: 1,
        iterations: 2,
        persistedItems: 3,
        requestTime: 4,
        metadatas: [],
      };

      const result = await (<any>actor).getJoinCoefficients(
        { context: new ActionContext(), type: 'inner', entries: []},
        sideData,
      );

      expect(result).toBeDefined();
    });
  });

  describe('sortJoinEntries', () => {
    it('should sort join entries and attach metadata', async() => {
      const source1Op = { type: 'source1' };
      const source2Op = { type: 'source2' };
      const mockOutput1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };
      const mockOutput2 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };

      const entries: IJoinEntry[] = [
        { operation: source1Op, output: mockOutput1 },
        { operation: source2Op, output: mockOutput2 },
      ];

      mediatorJoinEntriesSortMock.mockResolvedValueOnce({
        entries: [
          { operation: source1Op, output: mockOutput1, metadata: await mockOutput1.metadata() },
          { operation: source2Op, output: mockOutput2, metadata: await mockOutput2.metadata() },
        ],
      });

      const sortedEntries = await actor.sortJoinEntries(entries, new ActionContext());

      expect(sortedEntries).toHaveLength(2);
      expect(sortedEntries[0]).toEqual(expect.objectContaining({
        operation: source1Op,
        metadata: expect.objectContaining({
          cardinality: expect.any(Object),
          state: expect.any(Object),
          variables: expect.any(Array),
        }),
      }));
      expect(sortedEntries[1]).toEqual(expect.objectContaining({
        operation: source2Op,
        metadata: expect.objectContaining({
          cardinality: expect.any(Object),
          state: expect.any(Object),
          variables: expect.any(Array),
        }),
      }));
    });

    it('should return empty array for empty entries', async() => {
      const sortedEntries = await actor.sortJoinEntries([], new ActionContext());

      expect(sortedEntries).toEqual([]);
    });

    it('should call mediatorJoinEntriesSort with sorted entries', async() => {
      const sourceOp = { type: 'source' };
      const mockOutput = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };

      mediatorJoinEntriesSortMock.mockResolvedValueOnce({
        entries: [{ operation: sourceOp, output: mockOutput, metadata: await mockOutput.metadata() }],
      });

      await actor.sortJoinEntries([
        { operation: sourceOp, output: mockOutput },
      ], new ActionContext());

      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledWith(expect.objectContaining({
        context: expect.any(ActionContext),
        entries: expect.arrayContaining([
          expect.objectContaining({
            operation: sourceOp,
          }),
        ]),
      }));
    });
  });

  describe('executeJoin', () => {
    it('should call mediatorJoin with cloned streams', async() => {
      const sourceOp = { type: 'source' };
      const mockOutput = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };
      const cloneMock = jest.fn();
      (<any> mockOutput.bindingsStream).clone = cloneMock;

      await actor.executeJoin({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: sourceOp, output: mockOutput },
        ],
      }, new ActionContext());

      expect(mediatorJoin.mediate).toHaveBeenCalledTimes(1);
      expect(cloneMock).toHaveBeenCalledTimes(1);
    });

    it('should clone all entry output streams', async() => {
      const sourceOp1 = { type: 'source1' };
      const sourceOp2 = { type: 'source2' };
      const cloneMock1 = jest.fn();
      const cloneMock2 = jest.fn();
      const mockOutput1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };
      const mockOutput2 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };
      (<any> mockOutput1.bindingsStream).clone = cloneMock1;
      (<any> mockOutput2.bindingsStream).clone = cloneMock2;

      await actor.executeJoin({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: sourceOp1, output: mockOutput1 },
          { operation: sourceOp2, output: mockOutput2 },
        ],
      }, new ActionContext());

      expect(cloneMock1).toHaveBeenCalledTimes(1);
      expect(cloneMock2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOutput', () => {
    it('should execute successfully', async() => {
      const sourceOp1 = { type: 'source1' };
      const sourceOp2 = { type: 'source2' };
      const mockOutput1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };
      const mockOutput2 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => ({
          state: new MetadataValidationState(),
          cardinality: { value: 0, type: 'inferred' },
          variables: [],
        }),
      };

      const result = await actor.getOutput({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: sourceOp1, output: mockOutput1 },
          { operation: sourceOp2, output: mockOutput2 },
        ],
      });

      expect(result).toBeDefined();
      expect(result.result.type).toBe('bindings');
      expect(result.result.bindingsStream).toBeDefined();
      expect(result.result.metadata).toBeDefined();
      expect(mediatorHashBindings.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorJoin.mediate).toHaveBeenCalledTimes(1);
    });

    it('should return correct metadata from the output', async() => {
      const expectedMetadata = <MetadataBindings>{
        state: new MetadataValidationState(),
        cardinality: { value: 100, type: 'exact' },
        variables: [],
      };

      const mockOutput = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
        metadata: async() => expectedMetadata,
      };

      const result = await actor.getOutput({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: { type: 'source' }, output: mockOutput },
        ],
      });

      expect(result.result.metadata).toBeDefined();
    });

    it('should restart bindings stream as many times as allowed whenever join order changes', async() => {
      const metadataState = new MetadataValidationState();
      const variable = DF.variable('var1');
      const joinOutputLength = 20;

      const joinOutputValues1: RDF.Bindings[] = [];
      const joinOutputValues2: RDF.Bindings[] = [];

      for (let i = 0; i < joinOutputLength; i++) {
        joinOutputValues1.push(BF.fromRecord({ [variable.value]: DF.literal(`bindings 1 entry ${i}`) }));
        joinOutputValues2.push(BF.fromRecord({ [variable.value]: DF.literal(`bindings 2 entry ${i}`) }));
      }

      const mockJoinInputBindings1Metadata = jest.fn().mockResolvedValue({
        state: metadataState,
        cardinality: { value: Math.round(100 * Math.random()), type: 'exact' },
        variables: [],
      });

      const mockJoinInputBindings1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: mockJoinInputBindings1Metadata,
      };

      const mockJoinInputBindings2Metadata = jest.fn().mockResolvedValue({
        state: new MetadataValidationState(),
        cardinality: { value: Math.round(100 * Math.random()), type: 'estimate' },
        variables: [],
      });

      const mockJoinInputBindings2 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: mockJoinInputBindings2Metadata,
      };

      // Mock the join output, which will be cycled through the restart stream
      jest.spyOn(actor, 'executeJoin')
        .mockResolvedValueOnce({
          type: 'bindings',
          bindingsStream: new ArrayIterator(joinOutputValues1),
          metadata: <any>'metadata',
        })
        .mockResolvedValueOnce({
          type: 'bindings',
          bindingsStream: new ArrayIterator(joinOutputValues2),
          metadata: <any>'metadata',
        });

      // Mock the join entry sort output, with every second call being reversed
      let useOriginalJoinOrder = true;
      jest.spyOn(mediatorJoinEntriesSort, 'mediate').mockImplementation(
        async(action: IActionRdfJoinEntriesSort): Promise<IActorRdfJoinEntriesSortOutput> => {
          useOriginalJoinOrder = !useOriginalJoinOrder;
          return {
            entries: useOriginalJoinOrder ? action.entries : action.entries.reverse(),
          };
        },
      );

      expect(actor.executeJoin).not.toHaveBeenCalled();
      expect(mediatorJoinEntriesSort.mediate).not.toHaveBeenCalled();

      const result = await actor.getOutput({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: { type: 'mock1' }, output: mockJoinInputBindings1 },
          { operation: { type: 'mock2' }, output: mockJoinInputBindings2 },
        ],
      });

      expect(result.result.bindingsStream).toBeInstanceOf(BindingsStreamRestart);

      // Read one set of bindings, then check function call counts
      await expect(new Promise<RDF.Bindings>((resolve, reject) => {
        result.result.bindingsStream
          .once('data', bindings => resolve(bindings))
          .on('error', reject);
      })).resolves.toEqual(joinOutputValues1[0]);
      expect(actor.executeJoin).toHaveBeenCalledTimes(1);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(1);

      // Trigger the first restart, but keep the join order, so the restart should be skipped
      useOriginalJoinOrder = true;
      await expect(actor.triggerRestart()).resolves.not.toThrow();

      // Read one set of bindings, then check function call counts
      await expect(new Promise<RDF.Bindings>((resolve, reject) => {
        result.result.bindingsStream
          .once('data', bindings => resolve(bindings))
          .on('error', reject);
      })).resolves.toEqual(joinOutputValues1[1]);
      expect(actor.executeJoin).toHaveBeenCalledTimes(1);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(2);

      // Trigger the second restart, which should go through because the join order changes
      await expect(actor.triggerRestart()).resolves.not.toThrow();

      // Trigger some activity again, then check function call counts
      await expect(new Promise<RDF.Bindings>((resolve, reject) => {
        result.result.bindingsStream
          .once('data', bindings => resolve(bindings))
          .on('error', reject);
      })).resolves.toEqual(joinOutputValues1[2]);

      expect(actor.executeJoin).toHaveBeenCalledTimes(2);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(3);

      // Trigger the second restart, which should not happen
      await expect(actor.triggerRestart()).resolves.not.toThrow();
      expect(actor.executeJoin).toHaveBeenCalledTimes(2);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(3);

      // Read the remainder of the output stream. The stream buffers one entry,
      // and thus far, two entries have been read. Therefore, the next entry comes from values 2.
      await expect(result.result.bindingsStream.toArray()).resolves.toEqual(joinOutputValues2);
    });
  });
});
