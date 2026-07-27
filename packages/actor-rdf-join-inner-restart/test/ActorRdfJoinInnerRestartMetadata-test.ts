import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { Bus } from '@comunica/core';
import type { IQueryOperationResultBindings, MetadataBindings } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { ActorRdfJoinInnerRestartMetadata } from '../lib/ActorRdfJoinInnerRestartMetadata';
import '@comunica/utils-jest';

describe('ActorRdfJoinInnerRestartMetadata', () => {
  let actor: ActorRdfJoinInnerRestartMetadata;
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
      mediate: jest.fn().mockResolvedValue(<IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => ({
          state: <any>{ valid: true, addInvalidateListener: jest.fn() },
          cardinality: { value: 0, type: 'estimate' },
          variables: [],
        }),
      }),
    };

    mediatorJoinEntriesSort = <MediatorRdfJoinEntriesSort> <unknown> {
      mediate: jest.fn().mockResolvedValue({ entries: []}),
    };

    actor = new ActorRdfJoinInnerRestartMetadata({
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
      const testActor = new ActorRdfJoinInnerRestartMetadata({
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

      expect(testActor.name).toBe('test-actor');
      expect(testActor).toBeInstanceOf(ActorRdfJoinInnerRestartMetadata);
    });

    it('should work with restartLimit when provided', () => {
      const testActor = new ActorRdfJoinInnerRestartMetadata({
        bus: new Bus({ name: 'test-actor-with-limit' }),
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
        name: 'test-actor-with-limit',
        restartLimit: 10,
      });

      expect(testActor).toBeDefined();
    });
  });

  describe('registerRestartTriggers', () => {
    it('should register invalidate listeners on each entry metadata', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      let _invalidateListener1: (() => void) | undefined;
      let _invalidateListener2: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };
      const entry2Metadata: MetadataBindings = {
        cardinality: { value: 20, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener2 = listener;
          }),
        },
        variables: [],
      };

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry1Metadata,
      };
      const output2 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry2Metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2Metadata },
      ], mockStream, attemptRestart);

      expect(entry1Metadata.state.addInvalidateListener).toHaveBeenCalledTimes(1);
      expect(entry2Metadata.state.addInvalidateListener).toHaveBeenCalledTimes(1);
    });

    it('should call attemptJoinPlanRestart when cardinality changes', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      let _invalidateListener1: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };
      const entry2Metadata: MetadataBindings = {
        cardinality: { value: 20, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn(),
        },
        variables: [],
      };

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry1Metadata,
      };
      const output2 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry2Metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2Metadata },
      ], mockStream, attemptRestart);

      (<any>entry1Metadata).cardinality = { value: 50, type: 'estimate' };
      _invalidateListener1?.();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);
    });

    it('should NOT call attemptJoinPlanRestart when cardinality does not change', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      let _invalidateListener1: (() => void) | undefined;
      let _invalidateListener2: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };
      const entry2Metadata: MetadataBindings = {
        cardinality: { value: 20, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener2 = listener;
          }),
        },
        variables: [],
      };

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry1Metadata,
      };
      const output2 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry2Metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2Metadata },
      ], mockStream, attemptRestart);

      _invalidateListener1?.();
      _invalidateListener2?.();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).not.toHaveBeenCalled();
    });

    it('should update previousEntryCardinality and trigger restart on successive changes', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      let _invalidateListener1: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry1Metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
      ], mockStream, attemptRestart);

      (<any>entry1Metadata).cardinality = { value: 50, type: 'estimate' };
      _invalidateListener1?.();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(attemptRestart).toHaveBeenCalledTimes(1);

      (<any>entry1Metadata).cardinality = { value: 100, type: 'estimate' };
      _invalidateListener1?.();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(attemptRestart).toHaveBeenCalledTimes(2);
    });

    it('should handle errors from attemptJoinPlanRestart by destroying the stream', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const error = new Error('Restart failed');
      const attemptRestart = jest.fn().mockRejectedValue(error);

      let _invalidateListener1: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };

      const destroyMock1 = jest.fn();
      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: destroyMock1 },
        metadata: async() => entry1Metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
      ], mockStream, attemptRestart);

      (<any>entry1Metadata).cardinality = { value: 50, type: 'estimate' };
      _invalidateListener1?.();

      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);
      expect(destroyMock1).toHaveBeenCalledWith(error);
    });

    it('should not call attemptJoinPlanRestart if cardinality stays the same after multiple invalidations', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      let _invalidateListener1: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry1Metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
      ], mockStream, attemptRestart);

      for (let i = 0; i < 5; i++) {
        _invalidateListener1?.();
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      expect(attemptRestart).not.toHaveBeenCalled();
    });

    it('should not throw when registerRestartTriggers executes successfully with empty entries', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      await expect(actor.registerRestartTriggers([], mockStream, attemptRestart))
        .resolves.toBeUndefined();
    });

    it('should handle errors from entry.output.metadata() by destroying the stream', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const metadataError = new Error('Metadata fetch failed');

      let _invalidateListener1: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };

      const destroyMock1 = jest.fn();
      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: destroyMock1 },
        metadata: async() => {
          throw metadataError;
        },
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
      ], mockStream, attemptRestart);

      _invalidateListener1?.();

      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(destroyMock1).toHaveBeenCalledWith(metadataError);
    });

    it('should properly handle multiple entries with independent cardinality changes', async() => {
      const listeners: Record<string, Function[]> = {};
      const mockStream = <any>{
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
      const attemptRestart = jest.fn().mockResolvedValue(undefined);

      let _invalidateListener1: (() => void) | undefined;
      let _invalidateListener2: (() => void) | undefined;
      let _invalidateListener3: (() => void) | undefined;
      const entry1Metadata: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener1 = listener;
          }),
        },
        variables: [],
      };
      const entry2Metadata: MetadataBindings = {
        cardinality: { value: 20, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener2 = listener;
          }),
        },
        variables: [],
      };
      const entry3Metadata: MetadataBindings = {
        cardinality: { value: 30, type: 'estimate' },
        state: {
          valid: true,
          invalidate: jest.fn(),
          addInvalidateListener: jest.fn((listener: () => void) => {
            _invalidateListener3 = listener;
          }),
        },
        variables: [],
      };

      const output1 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry1Metadata,
      };
      const output2 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry2Metadata,
      };
      const output3 = <IQueryOperationResultBindings> {
        type: 'bindings',
        bindingsStream: <any>{ destroy: jest.fn() },
        metadata: async() => entry3Metadata,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: entry1Metadata },
        { operation: { type: 'source2' }, output: output2, metadata: entry2Metadata },
        { operation: { type: 'source3' }, output: output3, metadata: entry3Metadata },
      ], mockStream, attemptRestart);

      (<any>entry2Metadata).cardinality = { value: 100, type: 'estimate' };
      _invalidateListener2?.();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);

      (<any>entry1Metadata).cardinality = { value: 5, type: 'estimate' };
      (<any>entry3Metadata).cardinality = { value: 50, type: 'estimate' };
      _invalidateListener1?.();
      _invalidateListener3?.();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(3);
    });
  });
});
