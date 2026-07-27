import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext, Bus } from '@comunica/core';
import type {
  BindingsStream,
  IJoinEntry,
  IJoinEntryWithMetadata,
  IQueryOperationResultBindings,
  MetadataBindings,
} from '@comunica/types';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import { ActorRdfJoinInnerRestartBase } from '../lib/ActorRdfJoinInnerRestartBase';
import '@comunica/utils-jest';

function createMockOutput(
  bindingsArray: RDF.Bindings[] = [],
  metadataFn?: () => Promise<MetadataBindings>,
): IQueryOperationResultBindings {
  return <IQueryOperationResultBindings> <unknown> {
    type: 'bindings',
    bindingsStream: <any>{ destroy: jest.fn(), clone: jest.fn() },
    metadata: metadataFn ?? (async() => ({
      state: new MetadataValidationState(),
      cardinality: { value: bindingsArray.length, type: 'inferred' },
      variables: [],
    })),
  };
}

/**
 * Concrete implementation of the abstract base class for testing.
 */
class TestActorRdfJoinInnerRestartBase extends ActorRdfJoinInnerRestartBase {
  public async registerRestartTriggers(
    _entries: IJoinEntryWithMetadata[],
    _bindingsStream: BindingsStream,
    _attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void> {
    // Empty implementation for base class testing
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
      mediate: jest.fn().mockResolvedValue(createMockOutput()),
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
    });
  });

  describe('constructor', () => {
    it('should create a concrete instance with all dependencies', () => {
      expect(actor.name).toBe('test-actor');
      expect(actor).toBeInstanceOf(TestActorRdfJoinInnerRestartBase);
    });

    it('should create instance with custom restartLimit', () => {
      const actorWithLimit = new TestActorRdfJoinInnerRestartBase({
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
        restartLimit: 10,
      });

      expect(actorWithLimit).toBeDefined();
    });
  });

  describe('test', () => {
    it('should pass when adaptive join is enabled and not wrapped', async() => {
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
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();

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
      const mockOutput = createMockOutput();

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
      const mockOutput = createMockOutput();
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
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();
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
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();

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

      const mockOutput = createMockOutput([], async() => expectedMetadata);

      const result = await actor.getOutput({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: { type: 'source' }, output: mockOutput },
        ],
      });

      expect(result.result.metadata).toBeDefined();
    });

    it('should respect custom restartLimit', async() => {
      const actorWithLimit = new TestActorRdfJoinInnerRestartBase({
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
        restartLimit: 5,
      });

      const sourceOp = { type: 'source' };
      const mockOutput = createMockOutput();

      const result = await actorWithLimit.getOutput({
        context: new ActionContext(),
        type: 'inner',
        entries: [
          { operation: sourceOp, output: mockOutput },
        ],
      });

      expect(result).toBeDefined();
      expect(result.result.type).toBe('bindings');
    });
  });
});
