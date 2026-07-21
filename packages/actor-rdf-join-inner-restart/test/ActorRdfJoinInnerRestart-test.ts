import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type { MediatorRdfJoin } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import type { MediatorRdfJoinSelectivity } from '@comunica/bus-rdf-join-selectivity';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import type { IJoinEntry } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { EmptyIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinInnerRestart } from '../lib/ActorRdfJoinInnerRestart';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

describe('ActorRdfJoinInnerRestart', () => {
  let actor: ActorRdfJoinInnerRestart;

  const bus = <any> {
    subscribe: jest.fn(),
  };

  const mediatorJoinSelectivity: MediatorRdfJoinSelectivity = <any> {
    mediate: jest.fn().mockRejectedValue(new Error('MediatorRdfJoinSelectivity.mediate')),
  };

  const mediatorHashBindings: MediatorHashBindings = <any>{
    mediate: jest.fn().mockRejectedValue(new Error('MediatorHashBindings.mediate')),
  };

  const mediatorJoin: MediatorRdfJoin = <any>{
    mediate: jest.fn().mockRejectedValue(new Error('MediatorRdfJoin.mediate')),
  };

  const mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort = <any>{
    mediate: jest.fn().mockRejectedValue(new Error('MediatorRdfJoinEntriesSort.mediate')),
  };

  const entries: IJoinEntry[] = [
    {
      operation: AF.createNop(),
      output: { bindingsStream: new EmptyIterator(), metadata: jest.fn(), type: 'bindings' },
    },
    {
      operation: AF.createNop(),
      output: { bindingsStream: new EmptyIterator(), metadata: jest.fn(), type: 'bindings' },
    },
  ];

  beforeEach(() => {
    actor = new ActorRdfJoinInnerRestart({
      bus,
      name: 'actor',
      mediatorHashBindings,
      mediatorJoin,
      mediatorJoinEntriesSort,
      mediatorJoinSelectivity,
      // Actor-specific arguments
      evaluationAfterMetadataUpdate: true,
      restartThreshold: 0.5,
      wrapAllJoins: false,
      evaluationInterval: 100,
      restartLimit: undefined,
    });
  });

  describe('constructor', () => {
    it('should create an actor instance', () => {
      expect(new ActorRdfJoinInnerRestart({
        bus,
        name: 'actor',
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        // Actor-specific arguments
        evaluationAfterMetadataUpdate: true,
        restartThreshold: 0.5,
        wrapAllJoins: false,
        evaluationInterval: 100,
        restartLimit: 1,
      })).toBeInstanceOf(ActorRdfJoinInnerRestart);
    });

    it('should assume infinite restart limit when none is provided', () => {
      expect(new ActorRdfJoinInnerRestart({
        bus,
        name: 'actor',
        mediatorHashBindings,
        mediatorJoin,
        mediatorJoinEntriesSort,
        mediatorJoinSelectivity,
        // Actor-specific arguments
        evaluationAfterMetadataUpdate: true,
        restartThreshold: 0.5,
        wrapAllJoins: false,
        evaluationInterval: 100,
        restartLimit: undefined,
      })).toHaveProperty('restartLimit', Number.POSITIVE_INFINITY);
    });
  });

  describe('test', () => {
    it('should pass by default', async() => {
      await expect(actor.test({
        context: new ActionContext(),
        entries,
        type: 'inner',
      })).resolves.toPassTest({
        blockingItems: 0,
        iterations: 0,
        persistedItems: 0,
        requestTime: 0,
      });
    });

    it('should reject when restart is disabled', async() => {
      await expect(actor.test({
        context: new ActionContext({ [KeysRdfJoin.skipAdaptiveJoin.name]: true }),
        entries,
        type: 'inner',
      })).resolves.toFailTest('cannot run due to adaptive join being disabled');
    });

    it('should reject when only topmost operation can be wrapped', async() => {
      await expect(actor.test({
        context: new ActionContext({ [ActorRdfJoinInnerRestart.keyWrapped.name]: [ AF.createNop() ]}),
        entries,
        type: 'inner',
      })).resolves.toFailTest('can only wrap the topmost join');
    });

    it('should reject when trying to wrap the same operation multiple times', async() => {
      (<any>actor).wrapAllJoins = true;
      await expect(actor.test({
        context: new ActionContext({ [ActorRdfJoinInnerRestart.keyWrapped.name]: entries.map(e => e.operation) }),
        entries,
        type: 'inner',
      })).resolves.toFailTest('can only wrap a single set of join entries once');
    });

    it('should reject when no evaluation conditions are enabled', async() => {
      (<any>actor).evaluationAfterMetadataUpdate = false;
      (<any>actor).evaluationInterval = 0;
      await expect(actor.test({
        context: new ActionContext(),
        entries,
        type: 'inner',
      })).resolves.toFailTest('has no evaluation conditions enabled');
    });

    it('should reject when restart limit is zero', async() => {
      (<any>actor).restartLimit = 0;
      await expect(actor.test({
        context: new ActionContext(),
        entries,
        type: 'inner',
      })).resolves.toFailTest('cannot restart even once');
    });

    it('should reject when restart threshold is zero', async() => {
      (<any>actor).restartThreshold = 0;
      await expect(actor.test({
        context: new ActionContext(),
        entries,
        type: 'inner',
      })).resolves.toFailTest('cannot restart even once');
    });
  });

  describe('getJoinOutput', () => {
    it('should invoke join bus mediator', async() => {
      jest.spyOn(mediatorJoin, 'mediate').mockResolvedValue(<any>'output');
      await expect(actor.getJoinOutput('inner', entries, new ActionContext())).resolves.toBe('output');
    });
  });
});
