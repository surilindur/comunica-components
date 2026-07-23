import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  IActionRdfJoin,
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext, Bus } from '@comunica/core';
import type { IJoinEntry, IQueryOperationResultBindings } from '@comunica/types';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinInnerRestartBase } from '../lib/ActorRdfJoinInnerRestartBase';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';
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

class TestActor extends ActorRdfJoinInnerRestartBase {
  public async registerRestartTriggers(
    _entries: IJoinEntry[],
    _bindingsStreamRestart: any,
    _attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void> {}
}

describe('ActorRdfJoinInnerRestartBase', () => {
  let mediatorHashBindings: MediatorHashBindings;
  let mediatorJoin: MediatorRdfJoin;
  let mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();

    mediatorHashBindings = <MediatorHashBindings> <unknown> {
      mediate: jest.fn().mockResolvedValue({
        hashFunction: (_bindings: RDF.Bindings, _variables: Iterable<RDF.Variable>): number => 0,
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
    restartLimit?: number,
  ) {
    return new TestActor({
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
      restartLimit,
    });
  }

  describe('keyWrapped', () => {
    it('should have a keyWrapped property with the correct namespace', () => {
      expect(ActorRdfJoinInnerRestartBase.keyWrapped).toBeDefined();
      expect((<any> ActorRdfJoinInnerRestartBase.keyWrapped).name).toBe(
        '@comunica/actor-rdf-join-inner-restart:wrapped',
      );
    });
  });

  describe('constructor', () => {
    it('should create a concrete instance with all dependencies', () => {
      const actor = createTestActor('test-actor');

      expect(actor.name).toBe('test-actor');
      expect(actor).toBeInstanceOf(TestActor);
    });

    it.each([
      [ 10 ],
      [ 1 ],
      [ 100 ],
    ])('should accept restartLimit of %p', (restartLimit) => {
      const actor = createTestActor('test-actor-with-limit', restartLimit);

      expect(actor).toBeDefined();
    });
  });

  describe('test', () => {
    it('should fail when adaptive join is disabled', async() => {
      const actor = createTestActor('test-actor');

      await expect(actor.test({
        context: new ActionContext({ [KeysRdfJoin.skipAdaptiveJoin.name]: true }),
        type: 'inner',
        entries: [],
      })).resolves.toFailTest(
        'Actor test-actor cannot run due to adaptive join being disabled',
      );
    });

    it('should fail when already wrapped in parent scope', async() => {
      const actor = createTestActor('test-actor');

      const wrappedContext = new ActionContext().set(ActorRdfJoinInnerRestartBase.keyWrapped, true);
      await expect(actor.test({
        context: wrappedContext,
        type: 'inner',
        entries: [],
      })).resolves.toFailTest(
        'Actor test-actor can only wrap the topmost join operation',
      );
    });

    it('should pass when adaptive join is enabled, not wrapped, and at least two entries are provided', async() => {
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();

      (<any> mediatorJoinEntriesSort).mediate.mockResolvedValue({ entries: []});

      const actor = createTestActor('test-actor');

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

  describe('sortJoinEntries', () => {
    it('should return entries with metadata attached', async() => {
      const mockOutput = createMockOutput();
      const mockEntries = [{
        operation: { type: 'source' },
        output: mockOutput,
        metadata: {
          state: new MetadataValidationState(),
          cardinality: { value: 10, type: 'inferred' },
          variables: [{ variable: DF.variable('x'), canBeUndef: false }],
        },
      }];
      (<any> mediatorJoinEntriesSort).mediate.mockResolvedValue({ entries: mockEntries });

      const actor = createTestActor('test-actor');

      const entry: IJoinEntry = {
        operation: { type: 'source' },
        output: mockOutput,
      };

      const result = await actor.sortJoinEntries([ entry ], new ActionContext());

      expect(result).toHaveLength(1);
      expect(result[0].operation).toStrictEqual(entry.operation);
      expect(result[0].metadata).toBeDefined();
      expect((<any> result[0]).metadata.variables).toHaveLength(1);
    });

    it('should sort entries by cardinality and pass context to the sort mediator', async() => {
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();
      const mockEntries = [
        <any> {
          operation: { type: 'source1' },
          output: mockOutput1,
          metadata: {
            state: new MetadataValidationState(),
            cardinality: { value: 5, type: 'inferred' },
            variables: [{ variable: DF.variable('x'), canBeUndef: false }],
          },
        },
        <any> {
          operation: { type: 'source2' },
          output: mockOutput2,
          metadata: {
            state: new MetadataValidationState(),
            cardinality: { value: 10, type: 'inferred' },
            variables: [{ variable: DF.variable('y'), canBeUndef: false }],
          },
        },
      ];

      (<any> mediatorJoinEntriesSort).mediate.mockResolvedValue({ entries: mockEntries });

      const actor = createTestActor('test-actor');

      const customContext = new ActionContext({ customKey: 'customValue' });
      const entries = mockEntries.map(e => ({ operation: e.operation, output: e.output }));

      const result = await actor.sortJoinEntries(entries, customContext);

      expect(result).toHaveLength(2);
      expect((<any> result[0]).metadata.cardinality.value).toBe(5);
      expect((<any> result[1]).metadata.cardinality.value).toBe(10);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledWith(
        expect.objectContaining({ context: customContext }),
      );
    });

    it('should handle empty entries list', async() => {
      const actor = createTestActor('test-actor');

      const result = await actor.sortJoinEntries([], new ActionContext());

      expect(result).toHaveLength(0);
    });
  });

  describe('executeJoin', () => {
    it('should call the join mediator with cloned streams and return the result', async() => {
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();
      const clone1Spy = jest.spyOn(mockOutput1.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));
      const clone2Spy = jest.spyOn(mockOutput2.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));

      const expectedMetadata = {
        state: new MetadataValidationState(),
        cardinality: { value: 5, type: 'inferred' },
        variables: [{ variable: DF.variable('x'), canBeUndef: false }],
      };
      const joinResult: IQueryOperationResultBindings = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: new ArrayIterator<RDF.Bindings>([], { autoStart: false }),
        metadata: async() => expectedMetadata,
      };
      (<any> mediatorJoin).mediate.mockResolvedValue(joinResult);

      const actor = createTestActor('test-actor');

      const entry1: IJoinEntry = {
        operation: { type: 'source1' },
        output: mockOutput1,
      };
      const entry2: IJoinEntry = {
        operation: { type: 'source2' },
        output: mockOutput2,
      };

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [ entry1, entry2 ],
      };

      const result = await actor.executeJoin(action, action.context);

      expect(clone1Spy).toHaveBeenCalledTimes(1);
      expect(clone2Spy).toHaveBeenCalledTimes(1);
      expect(result).toBe(joinResult);
      expect((await result.metadata()).cardinality.value).toBe(5);

      clone1Spy.mockRestore();
      clone2Spy.mockRestore();
    });

    it('should pass the context to the join mediator', async() => {
      const mockOutput = createMockOutput();
      const cloneSpy = jest.spyOn(mockOutput.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));

      (<any> mediatorJoin).mediate.mockResolvedValue(createMockOutput());

      const actor = createTestActor('test-actor');

      const customContext = new ActionContext({ customKey: 'customValue' });
      const entry: IJoinEntry = {
        operation: { type: 'source' },
        output: mockOutput,
      };

      const action: IActionRdfJoin = {
        context: customContext,
        type: 'inner',
        entries: [ entry ],
      };

      await actor.executeJoin(action, customContext);

      expect(mediatorJoin.mediate).toHaveBeenCalledWith(
        expect.objectContaining({ context: customContext }),
      );

      cloneSpy.mockRestore();
    });
  });

  describe('logical and physical join properties', () => {
    it('should have logicalType set to inner, physicalName set to restart, and canHandleUndefs set to true', () => {
      const actor = createTestActor('test-actor');
      expect((<any> actor).logicalType).toBe('inner');
      expect((<any> actor).physicalName).toBe('restart');
      expect((<any> actor).canHandleUndefs).toBe(true);
    });
  });

  describe('getOutput', () => {
    it('should return output with BindingsStreamRestart wrapping the join result', async() => {
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();
      const clone1Spy = jest.spyOn(mockOutput1.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));
      const clone2Spy = jest.spyOn(mockOutput2.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));

      const joinResult = createMockOutput();
      (<any> mediatorJoin).mediate.mockResolvedValue(joinResult);

      const actor = createTestActor('test-actor');

      const entry1: IJoinEntry = {
        operation: { type: 'source1' },
        output: mockOutput1,
      };
      const entry2: IJoinEntry = {
        operation: { type: 'source2' },
        output: mockOutput2,
      };

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [ entry1, entry2 ],
      };

      const result = await actor.getOutput(action);

      expect(result.result.type).toBe('bindings');
      expect(result.result.bindingsStream).toBeInstanceOf(BindingsStreamRestart);
      expect(result.result.metadata).toBeDefined();

      clone1Spy.mockRestore();
      clone2Spy.mockRestore();
    });

    it('should mark context as wrapped by setting the keyWrapped context entry', async() => {
      const mockOutput = createMockOutput();
      const cloneSpy = jest.spyOn(mockOutput.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));

      (<any> mediatorJoin).mediate.mockResolvedValue(createMockOutput());

      const actor = createTestActor('test-actor');

      const entry: IJoinEntry = {
        operation: { type: 'source' },
        output: mockOutput,
      };

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [ entry ],
      };

      await actor.getOutput(action);

      const hashMediateContext = (<any> mediatorHashBindings.mediate).mock.calls[0][0].context;
      expect(hashMediateContext.get(ActorRdfJoinInnerRestartBase.keyWrapped)).toBe(true);

      cloneSpy.mockRestore();
    });

    it('should destroy input streams when BindingsStreamRestart is destroyed', async() => {
      const mockOutput1 = createMockOutput();
      const mockOutput2 = createMockOutput();
      const destroy1Spy = jest.spyOn(mockOutput1.bindingsStream, 'destroy').mockImplementation(jest.fn());
      const destroy2Spy = jest.spyOn(mockOutput2.bindingsStream, 'destroy').mockImplementation(jest.fn());
      const clone1Spy = jest.spyOn(mockOutput1.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));
      const clone2Spy = jest.spyOn(mockOutput2.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));

      (<any> mediatorJoin).mediate.mockResolvedValue(createMockOutput());

      const actor = createTestActor('test-actor');

      const entry1: IJoinEntry = {
        operation: { type: 'source1' },
        output: mockOutput1,
      };
      const entry2: IJoinEntry = {
        operation: { type: 'source2' },
        output: mockOutput2,
      };

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [ entry1, entry2 ],
      };

      const result = await actor.getOutput(action);

      result.result.bindingsStream.destroy();

      expect(destroy1Spy).toHaveBeenCalledTimes(1);
      expect(destroy2Spy).toHaveBeenCalledTimes(1);

      clone1Spy.mockRestore();
      clone2Spy.mockRestore();
      destroy1Spy.mockRestore();
      destroy2Spy.mockRestore();
    });

    it('should return metadata from the initial join output and respect restartLimit', async() => {
      const mockOutput = createMockOutput();
      const cloneSpy = jest.spyOn(mockOutput.bindingsStream, 'clone').mockReturnValue(<any> new ArrayIterator([]));

      const expectedMetadata = {
        state: new MetadataValidationState(),
        cardinality: { value: 42, type: 'inferred' },
        variables: [{ variable: DF.variable('x'), canBeUndef: false }],
      };
      const joinResult: IQueryOperationResultBindings = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: new ArrayIterator<RDF.Bindings>([], { autoStart: false }),
        metadata: async() => expectedMetadata,
      };
      (<any> mediatorJoin).mediate.mockResolvedValue(joinResult);

      const actor = createTestActor('test-actor-with-limit', 5);

      const entry: IJoinEntry = {
        operation: { type: 'source' },
        output: mockOutput,
      };

      const action: IActionRdfJoin = {
        context: new ActionContext(),
        type: 'inner',
        entries: [ entry ],
      };

      const result = await actor.getOutput(action);

      const resultMetadata = await result.result.metadata();
      expect(resultMetadata.cardinality.value).toBe(42);
      expect(resultMetadata.variables).toHaveLength(1);

      cloneSpy.mockRestore();
    });
  });
});
