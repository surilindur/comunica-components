import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type { MediatorRdfJoin } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import type { MediatorRdfJoinSelectivity } from '@comunica/bus-rdf-join-selectivity';
import { ActorRdfJoinInnerRestart } from '../lib/ActorRdfJoinInnerRestart';
import '@comunica/utils-jest';

describe('ActorRdfJoinInnerRestart', () => {
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
});
