import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type { MediatorRdfJoin } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { Bus } from '@comunica/core';
import type { IQueryOperationResultBindings, MetadataBindings } from '@comunica/types';
import { ActorRdfJoinInnerRestartMetadata } from '../lib/ActorRdfJoinInnerRestartMetadata';
import '@comunica/utils-jest';

describe('ActorRdfJoinInnerRestartMetadata', () => {
  let actor: ActorRdfJoinInnerRestartMetadata;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();

    actor = new ActorRdfJoinInnerRestartMetadata({
      bus: new Bus({ name: 'test-actor' }),
      mediatorHashBindings: <MediatorHashBindings> <unknown> {
        mediate: jest.fn().mockResolvedValue({ hashFunction: jest.fn() }),
      },
      mediatorJoin: <MediatorRdfJoin> <unknown> {
        mediate: jest.fn().mockResolvedValue({
          type: 'bindings',
          bindingsStream: { destroy: jest.fn() },
          metadata: async() => ({
            state: { valid: true, addInvalidateListener: jest.fn() },
            cardinality: { value: 0, type: 'estimate' },
            variables: [],
          }),
        }),
      },
      mediatorJoinEntriesSort: <MediatorRdfJoinEntriesSort> <unknown> {
        mediate: jest.fn().mockResolvedValue({ entries: []}),
      },
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
      expect(actor).toBeInstanceOf(ActorRdfJoinInnerRestartMetadata);
    });

    it('should work with restartLimit when provided', () => {
      const testActor = new ActorRdfJoinInnerRestartMetadata({
        bus: new Bus({ name: 'test-actor-with-limit' }),
        mediatorHashBindings: <MediatorHashBindings> <unknown> {
          mediate: jest.fn().mockResolvedValue({ hashFunction: jest.fn() }),
        },
        mediatorJoin: <MediatorRdfJoin> <unknown> {
          mediate: jest.fn(),
        },
        mediatorJoinEntriesSort: <MediatorRdfJoinEntriesSort> <unknown> {
          mediate: jest.fn().mockResolvedValue({ entries: []}),
        },
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
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const metadata2: MetadataBindings = {
        cardinality: { value: 20, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata1,
      };
      const output2 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata2,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
        { operation: { type: 'source2' }, output: output2, metadata: metadata2 },
      ], <any>undefined, jest.fn());

      expect(metadata1.state.addInvalidateListener).toHaveBeenCalledTimes(1);
      expect(metadata2.state.addInvalidateListener).toHaveBeenCalledTimes(1);
    });

    it('should call attemptJoinPlanRestart when cardinality changes', async() => {
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata1,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
      ], <any>undefined, attemptRestart);

      (<jest.Mock> metadata1.state.addInvalidateListener).mock.calls[0][0]();
      metadata1.cardinality = { value: 50, type: 'estimate' };

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);
    });

    it('should NOT call attemptJoinPlanRestart when cardinality does not change', async() => {
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const metadata2: MetadataBindings = {
        cardinality: { value: 20, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata1,
      };
      const output2 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata2,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
        { operation: { type: 'source2' }, output: output2, metadata: metadata2 },
      ], <any>undefined, attemptRestart);

      (<jest.Mock> metadata1.state.addInvalidateListener).mock.calls[0][0]();
      (<jest.Mock> metadata2.state.addInvalidateListener).mock.calls[0][0]();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).not.toHaveBeenCalled();
    });

    it('should update previousEntryCardinality and trigger restart on successive changes', async() => {
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata1,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
      ], <any>undefined, attemptRestart);

      const listener = (<jest.Mock> metadata1.state.addInvalidateListener).mock.calls[0][0];

      metadata1.cardinality = { value: 50, type: 'estimate' };
      listener();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(attemptRestart).toHaveBeenCalledTimes(1);

      metadata1.cardinality = { value: 100, type: 'estimate' };
      listener();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(attemptRestart).toHaveBeenCalledTimes(2);
    });

    it('should handle errors from attemptJoinPlanRestart by destroying the stream', async() => {
      const error = new Error('Restart failed');
      const attemptRestart = jest.fn().mockRejectedValue(error);
      const destroyMock = jest.fn();
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: destroyMock },
        metadata: async() => metadata1,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
      ], <any>undefined, attemptRestart);

      const listener = (<jest.Mock> metadata1.state.addInvalidateListener).mock.calls[0][0];
      metadata1.cardinality = { value: 50, type: 'estimate' };
      listener();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);
      expect(destroyMock).toHaveBeenCalledWith(error);
    });

    it('should not call attemptJoinPlanRestart if cardinality stays the same after multiple invalidations', async() => {
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata1,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
      ], <any>undefined, attemptRestart);

      const listener = (<jest.Mock> metadata1.state.addInvalidateListener).mock.calls[0][0];
      for (let i = 0; i < 5; i++) {
        listener();
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      expect(attemptRestart).not.toHaveBeenCalled();
    });

    it('should not throw when registerRestartTriggers executes successfully with empty entries', async() => {
      await expect(actor.registerRestartTriggers([], <any>undefined, jest.fn()))
        .resolves.toBeUndefined();
    });

    it('should properly handle errors from entry.output.metadata() by destroying the stream', async() => {
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const destroyMock = jest.fn();
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: destroyMock },
        metadata: async() => metadata1,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
      ], <any>undefined, attemptRestart);

      output1.metadata = async() => {
        throw new Error('Metadata fetch failed');
      };

      (<jest.Mock> metadata1.state.addInvalidateListener).mock.calls[0][0]();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(destroyMock).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should properly handle multiple entries with independent cardinality changes', async() => {
      const attemptRestart = jest.fn().mockResolvedValue(undefined);
      const metadata1: MetadataBindings = {
        cardinality: { value: 10, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const metadata2: MetadataBindings = {
        cardinality: { value: 20, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const metadata3: MetadataBindings = {
        cardinality: { value: 30, type: 'estimate' },
        state: { valid: true, invalidate: jest.fn(), addInvalidateListener: jest.fn() },
        variables: [],
      };
      const output1 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata1,
      };
      const output2 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata2,
      };
      const output3 = <IQueryOperationResultBindings> <unknown> {
        type: 'bindings',
        bindingsStream: { destroy: jest.fn() },
        metadata: async() => metadata3,
      };

      await actor.registerRestartTriggers([
        { operation: { type: 'source1' }, output: output1, metadata: metadata1 },
        { operation: { type: 'source2' }, output: output2, metadata: metadata2 },
        { operation: { type: 'source3' }, output: output3, metadata: metadata3 },
      ], <any>undefined, attemptRestart);

      const listener1 = (<jest.Mock> metadata1.state.addInvalidateListener).mock.calls[0][0];
      const listener2 = (<jest.Mock> metadata2.state.addInvalidateListener).mock.calls[0][0];
      const listener3 = (<jest.Mock> metadata3.state.addInvalidateListener).mock.calls[0][0];

      metadata2.cardinality = { value: 100, type: 'estimate' };
      listener2();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(1);

      metadata1.cardinality = { value: 5, type: 'estimate' };
      metadata3.cardinality = { value: 50, type: 'estimate' };
      listener1();
      listener3();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(attemptRestart).toHaveBeenCalledTimes(3);
    });
  });
});
