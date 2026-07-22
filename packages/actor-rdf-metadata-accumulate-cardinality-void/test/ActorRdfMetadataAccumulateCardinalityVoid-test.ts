import { KeysInitQuery, KeysQueryOperation, KeysQuerySourceIdentify } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import type { Bus } from '@comunica/core';
import type { IDataset, MetadataBindings, QueryResultCardinality } from '@comunica/types';
import type { Algebra } from '@comunica/utils-algebra';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfMetadataAccumulateCardinalityVoid } from '../lib/ActorRdfMetadataAccumulateCardinalityVoid';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

const datasetUri = 'ex:ds1';
const datasetCardinality: QueryResultCardinality = { type: 'exact', value: 1, dataset: datasetUri };
const dataset: IDataset = {
  uri: datasetUri,
  source: datasetUri,
  getCardinality: (_operation: Algebra.Operation) => Promise.resolve({ ...datasetCardinality }),
};

const operation = AF.createJoin([
  AF.createPattern(DF.variable('s'), DF.namedNode('ex:p1'), DF.variable('o1')),
  AF.createPattern(DF.variable('s'), DF.namedNode('ex:p2'), DF.variable('o2')),
]);

function createMetadataBindings(overrides?: Partial<MetadataBindings>): MetadataBindings {
  return {
    state: {
      valid: true,
      invalidate: () => {},
      addInvalidateListener: () => {},
    },
    cardinality: { type: 'exact', value: 0 },
    variables: [],
    ...overrides,
  };
}

jest.mock('@comunica/utils-query-operation', () => ({
  estimateCardinality: (operation: Algebra.Operation, dataset: IDataset) =>
    Promise.resolve(dataset.getCardinality(operation)),
}));

describe('ActorRdfMetadataAccumulateCardinalityVoid', () => {
  let bus: Bus<any, any, any, any, any>;
  let httpInvalidator: any;
  let actor: ActorRdfMetadataAccumulateCardinalityVoid;
  let context: ActionContext;

  beforeEach(() => {
    bus = <any>{
      subscribe: jest.fn(),
    };
    httpInvalidator = {
      addInvalidateListener: jest.fn(),
    };
    actor = new ActorRdfMetadataAccumulateCardinalityVoid({
      bus,
      httpInvalidator,
      name: 'actor',
      predicateBasedEstimation: false,
    });
    context = new ActionContext();
  });

  describe('test', () => {
    it('fails without data factory', async() => {
      await expect(actor.test(<any>{
        context: new ActionContext(),
      })).resolves.toFailTest('Actor actor requires a data factory in action context');
    });

    it('passes with data factory', async() => {
      await expect(actor.test(<any>{
        context: new ActionContext().set(KeysInitQuery.dataFactory, DF),
      })).resolves.toPassTestVoid();
    });
  });

  describe('run', () => {
    it('does nothing when mode is not append', async() => {
      const actionContext = context.set(KeysInitQuery.dataFactory, DF)
        .set(KeysQueryOperation.operation, operation);
      const result = await actor.run(<any>{
        context: actionContext,
        mode: 'initialize',
      });
      expect(result).toEqual({ metadata: {}});
    });

    it('caches datasets from accumulatedMetadata', async() => {
      const sourceId = datasetUri;
      const actionContext = context.set(KeysInitQuery.dataFactory, DF)
        .set(KeysQueryOperation.operation, operation)
        .set(KeysQuerySourceIdentify.sourceIds, new Map([[ sourceId, datasetUri ]]));
      const result = await actor.run({
        context: actionContext,
        mode: 'append',
        accumulatedMetadata: createMetadataBindings({ datasets: [ dataset ]}),
        appendingMetadata: createMetadataBindings(),
      });
      expect(result.metadata.cardinality).toEqual({
        value: datasetCardinality.value,
        type: datasetCardinality.type,
        dataset: datasetUri,
      });
    });

    it('caches datasets from appendingMetadata', async() => {
      const sourceId = datasetUri;
      const actionContext = context.set(KeysInitQuery.dataFactory, DF)
        .set(KeysQueryOperation.operation, operation)
        .set(KeysQuerySourceIdentify.sourceIds, new Map([[ sourceId, datasetUri ]]));
      const result = await actor.run({
        context: actionContext,
        mode: 'append',
        accumulatedMetadata: createMetadataBindings(),
        appendingMetadata: createMetadataBindings({ datasets: [ dataset ]}),
      });
      expect(result.metadata.cardinality).toEqual({
        value: datasetCardinality.value,
        type: datasetCardinality.type,
        dataset: datasetUri,
      });
    });

    it('returns empty metadata without operation', async() => {
      const result = await actor.run({
        context: context.set(KeysInitQuery.dataFactory, DF),
        mode: 'append',
        accumulatedMetadata: createMetadataBindings(),
        appendingMetadata: createMetadataBindings(),
      });
      expect(result).toEqual({ metadata: {}});
    });

    it('returns empty metadata without data factory', async() => {
      const result = await actor.run({
        context: context.set(KeysQueryOperation.operation, operation),
        mode: 'append',
        accumulatedMetadata: createMetadataBindings(),
        appendingMetadata: createMetadataBindings(),
      });
      expect(result).toEqual({ metadata: {}});
    });

    it('returns empty metadata when cardinality estimate is undefined', async() => {
      const actionContext = context.set(KeysInitQuery.dataFactory, DF)
        .set(KeysQueryOperation.operation, operation)
        .set(KeysQuerySourceIdentify.sourceIds, new Map([[ datasetUri, datasetUri ]]));
      const result = await actor.run({
        context: actionContext,
        mode: 'append',
        accumulatedMetadata: createMetadataBindings(),
        appendingMetadata: createMetadataBindings(),
      });
      expect(result).toEqual({ metadata: {}});
    });

    it('returns empty metadata without query sources', async() => {
      const actionContext = context.set(KeysInitQuery.dataFactory, DF)
        .set(KeysQueryOperation.operation, operation);
      const result = await actor.run({
        context: actionContext,
        mode: 'append',
        accumulatedMetadata: createMetadataBindings({ datasets: [ dataset ]}),
        appendingMetadata: createMetadataBindings(),
      });
      expect(result).toEqual({ metadata: {}});
    });

    it('does not match dataset when query source does not start with dataset URI', async() => {
      const otherDatasetUri = 'ex:other';
      const otherDataset: IDataset = {
        uri: otherDatasetUri,
        source: otherDatasetUri,
        getCardinality: () => Promise.resolve({ type: 'exact', value: 5, dataset: otherDatasetUri }),
      };
      const sourceId = 'ex:othersource';
      const actionContext = context.set(KeysInitQuery.dataFactory, DF)
        .set(KeysQueryOperation.operation, operation)
        .set(KeysQuerySourceIdentify.sourceIds, new Map([[ otherDatasetUri, sourceId ]]));
      const result = await actor.run({
        context: actionContext,
        mode: 'append',
        accumulatedMetadata: createMetadataBindings({ datasets: [ dataset, otherDataset ]}),
        appendingMetadata: createMetadataBindings(),
      });
      expect(result.metadata.cardinality).toEqual({
        value: 5,
        type: 'exact',
        dataset: otherDatasetUri,
      });
    });

    it('clears cache when HTTP invalidation event occurs', () => {
      const invalidateListeners: (() => void)[] = [];
      httpInvalidator.addInvalidateListener.mockImplementation((listener: () => void) => {
        invalidateListeners.push(listener);
      });

      // Recreate actor to register the listener
      actor = new ActorRdfMetadataAccumulateCardinalityVoid({
        bus,
        httpInvalidator,
        name: 'actor',
        predicateBasedEstimation: false,
      });

      // Populate cache
      (<any>actor).datasetCache.set('ex:ds1', dataset);
      expect((<any>actor).datasetCache.size).toBe(1);

      // Trigger invalidation
      for (const listener of invalidateListeners) {
        listener();
      }

      // Cache should be cleared
      expect((<any>actor).datasetCache.size).toBe(0);
    });
  });

  describe('estimateOperationCardinality', () => {
    it('returns undefined without datasets', async() => {
      await expect(actor.estimateOperationCardinality(operation, DF, [])).resolves.toBeUndefined();
    });

    it('returns estimate with one dataset', async() => {
      await expect(actor.estimateOperationCardinality(operation, DF, [ dataset ])).resolves.toEqual({
        value: datasetCardinality.value,
        type: datasetCardinality.type,
        dataset: datasetUri,
      });
    });

    it('accumulates cardinality with multiple datasets', async() => {
      const dataset2: IDataset = {
        uri: 'ex:ds2',
        source: 'ex:ds2',
        getCardinality: () => Promise.resolve({ type: 'exact', value: 3, dataset: 'ex:ds2' }),
      };
      await expect(actor.estimateOperationCardinality(operation, DF, [ dataset, dataset2 ])).resolves.toEqual({
        value: 4,
        type: 'estimate',
      });
    });

    it('returns undefined for non-pattern with predicate-based estimation', async() => {
      (<any>actor).predicateBasedEstimation = true;
      await expect(actor.estimateOperationCardinality(operation, DF, [ dataset ])).resolves.toBeUndefined();
    });

    it('estimates pattern cardinality with predicate-based estimation', async() => {
      (<any>actor).predicateBasedEstimation = true;
      const modifiedPattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p1'), DF.variable('o'));
      await expect(actor.estimateOperationCardinality(modifiedPattern, DF, [ dataset ])).resolves.toEqual({
        value: datasetCardinality.value,
        type: datasetCardinality.type,
        dataset: datasetUri,
      });
    });

    it('modifies pattern in place with predicate-based estimation', async() => {
      (<any>actor).predicateBasedEstimation = true;
      const testPattern = AF.createPattern(
        DF.namedNode('ex:subject'),
        DF.namedNode('ex:predicate'),
        DF.namedNode('ex:object'),
      );
      await actor.estimateOperationCardinality(testPattern, DF, [ dataset ]);
      expect(testPattern.subject).toEqual(DF.variable('s'));
      expect(testPattern.object).toEqual(DF.variable('o'));
    });
  });
});
