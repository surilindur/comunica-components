import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type { MediatorRdfJoin } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import type { Bindings, IActionContext, IJoinEntry, IJoinEntryWithMetadata, MetadataBindings } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { ArrayIterator, EmptyIterator, TransformIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinInnerRestart } from '../lib/ActorRdfJoinInnerRestart';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('ActorRdfJoinInnerRestart', () => {
  let bus: any;
  let mediatorHashBindings: MediatorHashBindings;
  let mediatorJoin: MediatorRdfJoin;
  let mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;
  let mediatorJoinSelectivity: any;
  let actor: ActorRdfJoinInnerRestart;
  let context: IActionContext;
  let joinEntries: IJoinEntry[];
  let joinEntry1: IJoinEntry;
  let joinEntry2: IJoinEntry;
  let bindings: Bindings[];
  let metadata1: MetadataBindings;
  let metadata2: MetadataBindings;

  const type = 'inner';

  beforeEach(() => {
    bindings = [
      BF.fromRecord({ var: DF.literal('value 1') }),
      BF.fromRecord({ var: DF.literal('value 2') }),
      BF.fromRecord({ var: DF.literal('value 3') }),
      BF.fromRecord({ var: DF.literal('value 4') }),
    ];
    bus = {
      subscribe: jest.fn().mockResolvedValue({}),
    };
    mediatorHashBindings = <any> {
      mediate: jest.fn().mockResolvedValue({
        hashFunction: jest.fn().mockResolvedValue(0),
      }),
    };
    mediatorJoin = <any> {
      mediate: jest.fn(async() => ({
        bindingsStream: new ArrayIterator([ ...bindings ]),
        metadata: () => Promise.resolve({ cardinality: { type: 'estimate', value: 100 }, variables: []}),
      })),
    };
    mediatorJoinEntriesSort = <any> {
      mediate: jest.fn().mockImplementation(async({ _, entries }) => {
        const sortedEntries = (<IJoinEntryWithMetadata[]>entries)
          .sort((a, b) => a.metadata.cardinality.value - b.metadata.cardinality.value);
        return { entries: sortedEntries };
      }),
    };
    mediatorJoinSelectivity = {
      mediate: jest.fn().mockResolvedValue({}),
    };
    context = new ActionContext();
    metadata1 = {
      cardinality: { type: 'estimate', value: 1 },
      state: new MetadataValidationState(),
      variables: [],
    };
    metadata2 = {
      cardinality: { type: 'estimate', value: 10 },
      state: new MetadataValidationState(),
      variables: [],
    };
    joinEntry1 = {
      operation: <any>{},
      output: {
        type: 'bindings',
        bindingsStream: new EmptyIterator(),
        metadata: () => Promise.resolve(metadata1),
      },
    };
    joinEntry2 = {
      operation: <any>{},
      output: {
        type: 'bindings',
        bindingsStream: new EmptyIterator(),
        metadata: () => Promise.resolve(metadata2),
      },
    };
    joinEntries = [ joinEntry1, joinEntry2 ];
    actor = new ActorRdfJoinInnerRestart({
      bus,
      mediatorHashBindings,
      mediatorJoin,
      mediatorJoinEntriesSort,
      mediatorJoinSelectivity,
      name: 'actor',
      evaluationAfterMetadataUpdate: false,
      evaluationInterval: undefined,
      restartLimit: 1,
      restartThreshold: 0.5,
      wrapAllJoins: false,
    });
    // These make sure the log extra data functions are called
    (<any>actor).logDebug = (_context: any, _message: string, _extra: Function) => _extra();
    (<any>actor).logWarn = (_context: any, _message: string, _extra: Function) => _extra();
  });

  describe('test', () => {
    it('should pass with evaluation on metadata updates enabled', async() => {
      (<any>actor).evaluationAfterMetadataUpdate = true;
      await expect(actor.test({ context, entries: joinEntries, type })).resolves.toPassTest({
        blockingItems: 0,
        iterations: 0,
        persistedItems: 0,
        requestTime: 0,
      });
    });

    it('should pass with evaluation on interval assigned', async() => {
      (<any>actor).evaluationInterval = 100;
      await expect(actor.test({ context, entries: joinEntries, type })).resolves.toPassTest({
        blockingItems: 0,
        iterations: 0,
        persistedItems: 0,
        requestTime: 0,
      });
    });

    it('should fail with neither interval nor metadata update enabled', async() => {
      await expect(actor.test({ context, entries: joinEntries, type })).resolves
        .toFailTest('actor has no evaluation conditions enabled');
    });

    it('should fail with evaluation limit set to 0', async() => {
      (<any>actor).evaluationInterval = 100;
      (<any>actor).restartLimit = 0;
      await expect(actor.test({ context, entries: joinEntries, type })).resolves
        .toFailTest('actor cannot restart even once');
    });

    it('should fail with adaptive join disabled', async() => {
      context = context.set(KeysRdfJoin.skipAdaptiveJoin, true);
      await expect(actor.test({ context, entries: joinEntries, type })).resolves
        .toFailTest('actor cannot run due to adaptive join being disabled');
    });

    it('should fail when attempting to wrap lower-level joins without flag enabled', async() => {
      context = context.set(ActorRdfJoinInnerRestart.keyWrapped, [ joinEntries[0].operation ]);
      await expect(actor.test({ context, entries: joinEntries, type })).resolves
        .toFailTest('actor can only wrap the topmost join');
    });

    it('should fail when called with a subset of previously wrapped join entries', async() => {
      (<any>actor).wrapAllJoins = true;
      context = context.set(ActorRdfJoinInnerRestart.keyWrapped, [ joinEntries[0].operation ]);
      await expect(actor.test({ context, entries: joinEntries, type })).resolves
        .toFailTest('actor can only wrap a single set of join entries once');
    });
  });

  describe('getOutput', () => {
    it('should wrap bindings stream in restart iterator', async() => {
      await expect(actor.getOutput({ context, entries: joinEntries, type })).resolves.toEqual({
        result: {
          bindingsStream: expect.any(TransformIterator),
          metadata: expect.any(Function),
          type: 'bindings',
        },
      });
    });

    it('should produce bindings', async() => {
      const output = await actor.getOutput({ context, entries: joinEntries, type });
      await expect(output.result.bindingsStream).toEqualBindingsStream(bindings);
    });

    it('should produce bindings with metadata invalidation listeners', async() => {
      (<any>actor).evaluationAfterMetadataUpdate = true;
      const output = await actor.getOutput({ context, entries: joinEntries, type });
      await expect(output.result.bindingsStream).toEqualBindingsStream(bindings);
    });

    it('should produce bindings with metadata invalidation listeners and metadata invalidations', async() => {
      (<any>actor).evaluationAfterMetadataUpdate = true;
      const output = await actor.getOutput({ context, entries: joinEntries, type });
      metadata1.cardinality.value = 2 * metadata2.cardinality.value;
      metadata1.state.invalidate();
      await expect(output.result.bindingsStream).toEqualBindingsStream(bindings);
    });

    it('should produce bindings with evaluation interval', async() => {
      (<any>actor).evaluationInterval = 100;
      const output = await actor.getOutput({ context, entries: joinEntries, type });
      await expect(output.result.bindingsStream).toEqualBindingsStream(bindings);
    });

    it('should produce bindings with evaluation interval and metadata invalidations', async() => {
      jest.useFakeTimers();
      (<any>actor).evaluationInterval = 100;
      const output = await actor.getOutput({ context, entries: joinEntries, type });
      metadata1.cardinality.value = 2 * metadata2.cardinality.value;
      metadata1.state.invalidate();
      jest.advanceTimersByTime(150);
      jest.useRealTimers();
      await expect(output.result.bindingsStream).toEqualBindingsStream(bindings);
    });
  });

  describe('getSortedJoinEntries', () => {
    it('should produce sorted entries with metadata', async() => {
      expect(mediatorJoinEntriesSort.mediate).not.toHaveBeenCalled();
      await expect(actor.getSortedJoinEntries(joinEntries, context)).resolves.toEqual([
        { ...joinEntry1, metadata: metadata1 },
        { ...joinEntry2, metadata: metadata2 },
      ]);
      expect(mediatorJoinEntriesSort.mediate).toHaveBeenCalledTimes(1);
    });

    it('should swap the return order when the metadata is inverted between entries 1 and 2', async() => {
      // Invert metadata: entry2 has lower cardinality (5) than entry1 (20)
      // This should cause the sorted order to be [entry2, entry1] instead of [entry1, entry2]
      const invertedMetadata1: MetadataBindings = {
        cardinality: { type: 'estimate', value: 20 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const invertedMetadata2: MetadataBindings = {
        cardinality: { type: 'estimate', value: 5 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const invertedJoinEntry1: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: new EmptyIterator(),
          metadata: () => Promise.resolve(invertedMetadata1),
        },
      };
      const invertedJoinEntry2: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: new EmptyIterator(),
          metadata: () => Promise.resolve(invertedMetadata2),
        },
      };
      const invertedJoinEntries = [ invertedJoinEntry1, invertedJoinEntry2 ];

      const result = await actor.getSortedJoinEntries(invertedJoinEntries, context);

      // Since entry2 has lower cardinality (5) than entry1 (20),
      // the sorted order should be [entry2, entry1] (swapped from input order)
      expect(result).toEqual([
        { ...invertedJoinEntry2, metadata: invertedMetadata2 },
        { ...invertedJoinEntry1, metadata: invertedMetadata1 },
      ]);
    });
  });

  describe('getJoinOutput', () => {
    it('should produce a join output', async() => {
      expect(mediatorJoin.mediate).not.toHaveBeenCalled();
      await expect(actor.getJoinOutput(type, joinEntries, context)).resolves
        .toEqual({ bindingsStream: expect.any(ArrayIterator), metadata: expect.any(Function) });
      expect(mediatorJoin.mediate).toHaveBeenCalledTimes(1);
    });

    it('should produce distinct bindings streams', async() => {
      expect(mediatorJoin.mediate).not.toHaveBeenCalled();
      const output1 = await actor.getJoinOutput(type, joinEntries, context);
      const output2 = await actor.getJoinOutput(type, joinEntries, context);
      expect(mediatorJoin.mediate).toHaveBeenCalledTimes(2);
      expect(output1).not.toBe(output2);
    });
  });

  describe('run', () => {
    it('should return a result with bindings stream and metadata function', async() => {
      const result = await actor.run({ context, entries: joinEntries, type }, { metadatas: [ metadata1, metadata2 ]});
      expect(result.type).toBe('bindings');
      expect(result.metadata).toBeDefined();
      expect(typeof result.metadata).toBe('function');
    });

    it('should return bindings with cached metadata', async() => {
      const result = await actor.run({ context, entries: joinEntries, type }, { metadatas: [ metadata1, metadata2 ]});
      // Call metadata twice and verify it returns the same promise (caching behavior)
      const metadataCall1 = result.metadata();
      const metadataCall2 = result.metadata();
      expect(metadataCall1).toBe(metadataCall2);
    });

    it('should produce bindings through run', async() => {
      const result = await actor.run({ context, entries: joinEntries, type }, { metadatas: [ metadata1, metadata2 ]});
      await expect(result.bindingsStream).toEqualBindingsStream(bindings);
    });

    it('should propagate errors from getSortedJoinEntries to entry.output.bindingsStream.destroy()', async() => {
      const testError = new Error('getSortedJoinEntries failed');
      let mediateCallCount = 0;
      const errorMediatorJoinEntriesSort = <any> {
        mediate: jest.fn().mockImplementation(async({ _, entries }) => {
          mediateCallCount++;
          if (mediateCallCount === 1) {
            // First call (initial getSortedJoinEntries) succeeds
            const sortedEntries = (<IJoinEntryWithMetadata[]>entries)
              .sort((a, b) => a.metadata.cardinality.value - b.metadata.cardinality.value);
            return { entries: sortedEntries };
          }
          // Subsequent calls (from invalidateListener) fail
          throw testError;
        }),
      };
      const errorJoinEntry1: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: <any> new EmptyIterator(),
          metadata: () => Promise.resolve(metadata1),
        },
      };
      jest.spyOn(errorJoinEntry1.output.bindingsStream, 'destroy').mockImplementation();
      const errorJoinEntry2: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: <any> new EmptyIterator(),
          metadata: () => Promise.resolve(metadata2),
        },
      };
      jest.spyOn(errorJoinEntry2.output.bindingsStream, 'destroy').mockImplementation();
      const errorJoinEntries = [ errorJoinEntry1, errorJoinEntry2 ];
      const errorActor = new ActorRdfJoinInnerRestart({
        bus,
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort: errorMediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'actor',
        evaluationAfterMetadataUpdate: true,
        evaluationInterval: undefined,
        restartLimit: 1,
        restartThreshold: 0.5,
        wrapAllJoins: false,
      });
      (<any>errorActor).logDebug = (_context: any, _message: string, _extra: Function) => _extra();
      (<any>errorActor).logWarn = (_context: any, _message: string, _extra: Function) => _extra();
      await errorActor.run({ context, entries: errorJoinEntries, type }, { metadatas: [ metadata1, metadata2 ]});
      // Trigger invalidation to cause getSortedJoinEntries to be called again inside invalidateListener
      metadata1.state.invalidate();
      // Flush microtasks to process the async metadata().then().getSortedJoinEntries().catch() chain
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      expect(errorJoinEntry1.output.bindingsStream.destroy).toHaveBeenCalledWith(testError);
      expect(errorJoinEntry2.output.bindingsStream.destroy).not.toHaveBeenCalled();
    });

    it('should propagate errors from metadata() by calling destroy on bindingsStream', async() => {
      const bindingsStream = new ArrayIterator(bindings);
      jest.spyOn(bindingsStream, 'destroy').mockImplementation();
      const expectedError = new Error('metadata function failed');
      const metadata: MetadataBindings = {
        cardinality: { type: 'estimate', value: 1 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const joinEntry: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream,
          metadata: (): Promise<MetadataBindings> => Promise.resolve(metadata),
        },
      };
      const errorMediatorJoin = <any> {
        mediate: jest.fn().mockResolvedValue({
          bindingsStream: new ArrayIterator(bindings),
          metadata: () => Promise.resolve(metadata),
        }),
      };
      const errorActor = new ActorRdfJoinInnerRestart({
        bus,
        mediatorHashBindings,
        mediatorJoin: errorMediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        name: 'actor',
        evaluationAfterMetadataUpdate: true,
        evaluationInterval: undefined,
        restartLimit: 1,
        restartThreshold: 0.5,
        wrapAllJoins: false,
      });
      // Run() resolves immediately; the invalidation listener is set up asynchronously
      await errorActor.run({ context, entries: [ joinEntry ], type }, { metadatas: [ metadata ]});
      // Flush microtasks to let the initial metadata().then() resolve and set up invalidation listener
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      // Trigger invalidation to cause the invalidation listener to call metadata() which will fail
      jest.spyOn(joinEntry.output, 'metadata').mockRejectedValue(expectedError);
      metadata.state.invalidate();
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(bindingsStream.destroy).toHaveBeenCalledWith(expectedError);
    });

    it('should propagate errors from initial join entry output.metadata() call', async() => {
      // This test verifies that line 181's catch handler is called when output.metadata() rejects
      const expectedError = new Error('metadata function failed');
      const bindingsStream = <any> new EmptyIterator();
      jest.spyOn(bindingsStream, 'destroy').mockImplementation();
      const testMetadata: MetadataBindings = {
        cardinality: { type: 'estimate', value: 1 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const joinEntry: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream,
          metadata: (): Promise<MetadataBindings> => Promise.reject(expectedError),
        },
      };
      const freshMediatorJoin = <MediatorRdfJoin> <any> {
        mediate: jest.fn(async() => ({
          bindingsStream: new ArrayIterator(bindings),
          metadata: () => Promise.resolve({ cardinality: { type: 'estimate', value: 100 }, variables: []}),
        })),
      };
      const freshMediatorJoinEntriesSort = <MediatorRdfJoinEntriesSort> <any> {
        mediate: jest.fn().mockResolvedValue({ entries: [{ ...joinEntry, metadata: testMetadata }]}),
      };
      const freshActor = new ActorRdfJoinInnerRestart({
        bus,
        mediatorHashBindings,
        mediatorJoin: freshMediatorJoin,
        mediatorJoinEntriesSort: freshMediatorJoinEntriesSort,
        mediatorJoinSelectivity: <any> {
          mediate: jest.fn().mockResolvedValue({ selectivity: 1 }),
        },
        name: 'actor',
        evaluationAfterMetadataUpdate: true,
        evaluationInterval: undefined,
        restartLimit: 1,
        restartThreshold: 0.5,
        wrapAllJoins: false,
      });
      (<any>freshActor).logDebug = (_context: any, _message: string, _extra: Function) => _extra();
      (<any>freshActor).logWarn = (_context: any, _message: string, _extra: Function) => _extra();
      // Stub getSortedJoinEntries to bypass its internal entry.output.metadata() call
      // so we can test the run/getOutput's own metadata().catch() handler on line 181
      jest.spyOn(freshActor, 'getSortedJoinEntries').mockResolvedValue([{ ...joinEntry, metadata: testMetadata }]);
      // Run internally calls getOutput which sets up the initial metadata().catch() handler
      await freshActor.run({ context, entries: [ joinEntry ], type }, { metadatas: [ testMetadata ]});
      // Flush microtasks to process the async initial metadata().then().catch() chain
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
      expect(bindingsStream.destroy).toHaveBeenCalledWith(expectedError);
    });

    it('should call attemptJoinPlanRestart when evaluation interval triggers with currentJoinOrderUpdated', async() => {
      jest.useFakeTimers();

      // Create a fresh mediatorJoin mock to track calls
      const mockMediatorJoin = <MediatorRdfJoin> <any> {
        mediate: jest.fn(async() => ({
          bindingsStream: new ArrayIterator(bindings),
          metadata: () => Promise.resolve({ cardinality: { type: 'estimate', value: 100 }, variables: []}),
        })),
      };

      // Create a fresh actor instance with evaluationInterval set
      const freshActor = new ActorRdfJoinInnerRestart({
        bus,
        mediatorHashBindings,
        mediatorJoin: mockMediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity: <any> {
          mediate: jest.fn().mockResolvedValue({ selectivity: 1 }),
        },
        name: 'actor',
        evaluationAfterMetadataUpdate: false,
        evaluationInterval: 100,
        restartLimit: 5,
        restartThreshold: 0.5,
        wrapAllJoins: false,
      });
      (<any>freshActor).logDebug = (_context: any, _message: string, _extra: Function) => _extra();
      (<any>freshActor).logWarn = (_context: any, _message: string, _extra: Function) => _extra();

      // Create fresh metadata and join entries
      const freshMetadata1: MetadataBindings = {
        cardinality: { type: 'estimate', value: 1 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const freshMetadata2: MetadataBindings = {
        cardinality: { type: 'estimate', value: 10 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const freshJoinEntry1: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: <any> new EmptyIterator(),
          metadata: () => Promise.resolve(freshMetadata1),
        },
      };
      const freshJoinEntry2: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: <any> new EmptyIterator(),
          metadata: () => Promise.resolve(freshMetadata2),
        },
      };
      const freshJoinEntries = [ freshJoinEntry1, freshJoinEntry2 ];

      // Call getOutput to set up the evaluation interval timer
      await freshActor.getOutput({ context, entries: freshJoinEntries, type });

      // Capture initial call count
      const initialCallCount = (<jest.Mock>mockMediatorJoin.mediate).mock.calls.length;

      // Trigger invalidation to set currentJoinOrderUpdated = true
      // This simulates the metadata update that would change the join order
      freshMetadata1.cardinality.value = 100;
      freshMetadata1.state.invalidate();

      // Flush microtasks to process the async metadata update and set currentJoinOrderUpdated
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      // Advance timers by 100ms to trigger the evaluation interval
      jest.advanceTimersByTime(100);

      // Advance more to ensure the checkForRestart callback executes
      jest.advanceTimersByTime(1);

      jest.useRealTimers();

      // Verify that getJoinOutput was called again (mediatorJoin.mediate called additional times)
      expect((<jest.Mock>mockMediatorJoin.mediate).mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should call getJoinOutput again when restartThreshold is exceeded after cardinality modification', async() => {
      // Create a fresh mediatorJoin mock to track calls for this test
      const mockMediatorJoin = <MediatorRdfJoin> <any> {
        mediate: jest.fn(async() => ({
          bindingsStream: new ArrayIterator(bindings),
          metadata: () => Promise.resolve({ cardinality: { type: 'estimate', value: 100 }, variables: []}),
        })),
      };

      // Create a fresh actor instance to avoid state pollution from previous tests
      const freshActor = new ActorRdfJoinInnerRestart({
        bus,
        mediatorHashBindings,
        mediatorJoin: mockMediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity: <any> {
          mediate: jest.fn().mockResolvedValue({ selectivity: 1 }),
        },
        name: 'actor',
        evaluationAfterMetadataUpdate: true,
        evaluationInterval: undefined,
        restartLimit: 5,
        restartThreshold: 0.5,
        wrapAllJoins: false,
      });
      (<any>freshActor).logDebug = (_context: any, _message: string, _extra: Function) => _extra();
      (<any>freshActor).logWarn = (_context: any, _message: string, _extra: Function) => _extra();

      // Create fresh metadata and join entries to avoid conflicts with shared beforeEach objects
      const freshMetadata1: MetadataBindings = {
        cardinality: { type: 'estimate', value: 1 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const freshMetadata2: MetadataBindings = {
        cardinality: { type: 'estimate', value: 10 },
        state: new MetadataValidationState(),
        variables: [],
      };
      const freshJoinEntry1: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: <any> new EmptyIterator(),
          metadata: () => Promise.resolve(freshMetadata1),
        },
      };
      const freshJoinEntry2: IJoinEntry = {
        operation: <any>{},
        output: {
          type: 'bindings',
          bindingsStream: <any> new EmptyIterator(),
          metadata: () => Promise.resolve(freshMetadata2),
        },
      };
      const freshJoinEntries = [ freshJoinEntry1, freshJoinEntry2 ];

      // Get the join output to set up the restart stream and invalidation listeners
      await freshActor.getOutput({ context, entries: freshJoinEntries, type });

      // Capture the call count after setup
      const setupCallCount = (<jest.Mock>mockMediatorJoin.mediate).mock.calls.length;
      expect(setupCallCount).toBeGreaterThanOrEqual(1);

      // Modify cardinalities to swap the join order:
      // Initially entry1 (1) < entry2 (10), so sorted order is [entry1, entry2]
      // After change: entry1 (100) > entry2 (10), so sorted order becomes [entry2, entry1]
      // This triggers currentJoinOrderUpdated = true, which enables restart checks
      freshMetadata1.cardinality.value = 100;

      // Trigger the invalidation listener to simulate metadata update
      freshMetadata1.state.invalidate();

      // Flush microtasks to process the async invalidation listener chain:
      // 1. metadata().then() resolves, updates currentOperationCardinalities
      // 2. getSortedJoinEntries() resolves and detects order change
      // 3. attemptJoinPlanRestart() calls getJoinOutput() if threshold condition met
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      // Verify that getJoinOutput was called again (mediatorJoin.mediate called additional times)
      expect((<jest.Mock>mockMediatorJoin.mediate).mock.calls.length).toBeGreaterThan(setupCallCount);
    });
  });
});
