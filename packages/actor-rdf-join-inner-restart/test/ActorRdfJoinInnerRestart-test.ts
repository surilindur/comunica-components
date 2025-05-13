import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type { MediatorRdfJoin } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import type { Bindings, IActionContext, IJoinEntry, IJoinEntryWithMetadata, MetadataBindings } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { ArrayIterator, EmptyIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinInnerRestart } from '../lib/ActorRdfJoinInnerRestart';
import '@comunica/utils-jest';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';

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
      context = context.set(ActorRdfJoinInnerRestart.keyWrappedOperations, [ joinEntries[0].operation ]);
      await expect(actor.test({ context, entries: joinEntries, type })).resolves
        .toFailTest('actor can only wrap the topmost join');
    });

    it('should fail when called with a subset of previously wrapped join entries', async() => {
      (<any>actor).wrapAllJoins = true;
      context = context.set(ActorRdfJoinInnerRestart.keyWrappedOperations, [ joinEntries[0].operation ]);
      await expect(actor.test({ context, entries: joinEntries, type })).resolves
        .toFailTest('actor can only wrap a single set of join entries once');
    });
  });

  describe('getOutput', () => {
    it('should wrap bindings stream in restart iterator', async() => {
      await expect(actor.getOutput({ context, entries: joinEntries, type })).resolves.toEqual({
        result: {
          bindingsStream: expect.any(BindingsStreamRestart),
          metadata: undefined,
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
  });

  describe('getJoinOutput', () => {
    it('should produce a join output', async() => {
      expect(mediatorJoin.mediate).not.toHaveBeenCalled();
      await expect(actor.getJoinOutput(type, joinEntries, context)).resolves
        .toEqual({ bindingsStream: expect.any(ArrayIterator) });
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
});
