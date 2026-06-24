import { KeysInitQuery, KeysQueryOperation } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import type { IDataset, QueryResultCardinality } from '@comunica/types';
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

jest.mock('@comunica/utils-query-operation', () => ({
  estimateCardinality: (operation: Algebra.Operation, dataset: IDataset) =>
    Promise.resolve(dataset.getCardinality(operation)),
}));

describe('ActorRdfMetadataAccumulateCardinalityVoid', () => {
  let bus: any;
  let actor: ActorRdfMetadataAccumulateCardinalityVoid;
  let context: ActionContext;

  beforeEach(() => {
    bus = {
      subscribe: jest.fn(),
    };
    actor = new ActorRdfMetadataAccumulateCardinalityVoid({
      bus,
      name: 'actor',
      predicateBasedEstimation: false,
    });
    context = new ActionContext();
  });

  describe('test', () => {
    it('rejects without data factory', async() => {
      await expect(actor.test(<any>{
        context: context.set(KeysQueryOperation.operation, operation),
      })).resolves.toFailTest('requires a data factory');
    });

    it('rejects without operation', async() => {
      await expect(actor.test(<any>{
        context: context.set(KeysInitQuery.dataFactory, DF),
      })).resolves.toFailTest('requires a query operation');
    });

    it('passes with data factory and query operation', async() => {
      await expect(actor.test(<any>{
        context: context.set(KeysInitQuery.dataFactory, DF).set(KeysQueryOperation.operation, operation),
      })).resolves.toPassTestVoid();
    });
  });

  describe('run', () => {
    it('does nothing when initializing', async() => {
      await expect(actor.run({ context: <any>{}, mode: 'initialize' })).resolves.toEqual({ metadata: {}});
    });

    it('accumulates datasets', async() => {
      jest.spyOn(actor, 'accumulateDatasets').mockReturnValue(<any>'datasets');
      jest.spyOn(actor, 'estimateOperationCardinality').mockResolvedValue(<any>'cardinality');
      expect(actor.accumulateDatasets).not.toHaveBeenCalled();
      expect(actor.estimateOperationCardinality).not.toHaveBeenCalled();
      await expect(actor.run(<any>{
        context: context.set(KeysInitQuery.dataFactory, DF).set(KeysQueryOperation.operation, operation),
        mode: 'append',
      })).resolves.toEqual({
        metadata: {
          cardinality: 'cardinality',
          datasets: 'datasets',
        },
      });
      expect(actor.accumulateDatasets).toHaveBeenCalledTimes(1);
      expect(actor.estimateOperationCardinality).toHaveBeenCalledTimes(1);
    });

    it('avoids accumulation without datasets', async() => {
      jest.spyOn(actor, 'accumulateDatasets').mockReturnValue([]);
      jest.spyOn(actor, 'estimateOperationCardinality').mockResolvedValue(<any>'cardinality');
      expect(actor.accumulateDatasets).not.toHaveBeenCalled();
      expect(actor.estimateOperationCardinality).not.toHaveBeenCalled();
      await expect(actor.run(<any>{ context, mode: 'append' })).resolves.toEqual({
        metadata: {},
      });
      expect(actor.accumulateDatasets).toHaveBeenCalledTimes(1);
      expect(actor.estimateOperationCardinality).not.toHaveBeenCalled();
    });

    it('forwards datasets even without cardinality', async() => {
      jest.spyOn(actor, 'accumulateDatasets').mockReturnValue(<any>'datasets');
      jest.spyOn(actor, 'estimateOperationCardinality').mockResolvedValue(undefined);
      expect(actor.accumulateDatasets).not.toHaveBeenCalled();
      expect(actor.estimateOperationCardinality).not.toHaveBeenCalled();
      await expect(actor.run(<any>{
        context: context.set(KeysInitQuery.dataFactory, DF).set(KeysQueryOperation.operation, operation),
        mode: 'append',
      })).resolves.toEqual({
        metadata: {
          datasets: 'datasets',
        },
      });
      expect(actor.accumulateDatasets).toHaveBeenCalledTimes(1);
      expect(actor.estimateOperationCardinality).toHaveBeenCalledTimes(1);
    });
  });

  describe('accumulateDatasets', () => {
    it('avoids duplicate datasets', () => {
      const accumulatedMetadata = { datasets: [ dataset ]};
      const appendingMetadata = { datasets: [ dataset ]};
      expect(actor.accumulateDatasets(<any>{ accumulatedMetadata, appendingMetadata })).toEqual([ dataset ]);
    });

    it('produces empty result without datasets', () => {
      expect(actor.accumulateDatasets(<any>{ accumulatedMetadata: {}, appendingMetadata: {}})).toEqual([]);
    });
  });

  describe('estimateOperationCardinality', () => {
    it('returns undefined without datasets', async() => {
      await expect(actor.estimateOperationCardinality(operation, DF, [])).resolves.toBeUndefined();
    });

    it('returns estimate with a dataset', async() => {
      await expect(actor.estimateOperationCardinality(operation, DF, [ dataset ])).resolves.toEqual(datasetCardinality);
    });

    it('returns estimate with multiple datasets', async() => {
      await expect(actor.estimateOperationCardinality(operation, DF, [ dataset, dataset ])).resolves.toEqual({
        value: datasetCardinality.value * 2,
        type: 'estimate',
      });
    });

    it('returns estimate for pattern using predicate-based estimation', async() => {
      (<any>actor).predicateBasedEstimation = true;
      await expect(actor.estimateOperationCardinality(operation.input[0], DF, [ dataset ])).resolves
        .toEqual(datasetCardinality);
    });

    it('returns undefined for non-pattern using predicate-based estimation', async() => {
      (<any>actor).predicateBasedEstimation = true;
      await expect(actor.estimateOperationCardinality(operation, DF, [ dataset ])).resolves.toBeUndefined();
    });
  });
});
