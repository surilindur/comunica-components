import { KeysInitQuery, KeysQueryOperation } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import type { IDataset, QueryResultCardinality } from '@comunica/types';
import { DataFactory } from 'rdf-data-factory';
import type { Algebra } from 'sparqlalgebrajs';
import { Factory } from 'sparqlalgebrajs';
import { ActorRdfMetadataAccumulateCardinalityVoid } from '../lib/ActorRdfMetadataAccumulateCardinalityVoid';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new Factory(DF);

jest.mock('@comunica/utils-query-operation', () => ({
  estimateCardinality: (operation: Algebra.Operation, dataset: IDataset) => dataset.getCardinality(operation),
}));

describe('ActorRdfMetadataAccumulateCardinalityVoid', () => {
  let bus: any;
  let actor: ActorRdfMetadataAccumulateCardinalityVoid;

  const datasetUri = 'ex:ds1';
  const datasetCardinality: QueryResultCardinality = { type: 'exact', value: 1, dataset: datasetUri };
  const dataset: IDataset = {
    uri: datasetUri,
    source: datasetUri,
    getCardinality: (_operation: Algebra.Operation) => ({ ...datasetCardinality }),
  };

  const operation = AF.createJoin([
    AF.createPattern(DF.variable('s'), DF.namedNode('ex:p1'), DF.variable('o1')),
    AF.createPattern(DF.variable('s'), DF.namedNode('ex:p2'), DF.variable('o2')),
  ]);

  beforeEach(() => {
    bus = {
      subscribe: jest.fn(),
    };
    actor = new ActorRdfMetadataAccumulateCardinalityVoid({
      bus,
      name: 'actor',
      predicateBasedEstimation: false,
    });
  });

  describe('test', () => {
    it('passes', async() => {
      await expect(actor.test(<any>{})).resolves.toPassTestVoid();
    });
  });

  describe('run', () => {
    it('does nothing when initializing', async() => {
      await expect(actor.run({ context: <any>{}, mode: 'initialize' })).resolves.toEqual({ metadata: {}});
    });

    it('accumulates datasets', async() => {
      jest.spyOn(actor, 'accumulateDatasets').mockReturnValue(<any>'datasets');
      jest.spyOn(actor, 'estimateOperationCardinality').mockReturnValue(<any>'cardinality');
      const accumulatedMetadata = <any>{ datasets: [ dataset ]};
      const appendingMetadata = <any>{ datasets: [ dataset ]};
      const context = new ActionContext({
        [KeysInitQuery.dataFactory.name]: DF,
        [KeysQueryOperation.operation.name]: operation,
      });
      await expect(actor.run({ accumulatedMetadata, appendingMetadata, context, mode: 'append' })).resolves.toEqual({
        metadata: {
          cardinality: 'cardinality',
          datasets: 'datasets',
        },
      });
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
    it('returns undefined without datasets', () => {
      expect(actor.estimateOperationCardinality(operation, DF, [])).toBeUndefined();
    });

    it('returns estimate with a dataset', () => {
      expect(actor.estimateOperationCardinality(operation, DF, [ dataset ])).toEqual(datasetCardinality);
    });

    it('returns estimate with multiple datasets', () => {
      expect(actor.estimateOperationCardinality(operation, DF, [ dataset, dataset ])).toEqual({
        value: datasetCardinality.value * 2,
        type: 'estimate',
      });
    });

    it('returns estimate for pattern using predicate-based estimation', () => {
      (<any>actor).predicateBasedEstimation = true;
      expect(actor.estimateOperationCardinality(operation.input[0], DF, [ dataset ])).toEqual(datasetCardinality);
    });

    it('returns undefined for non-pattern using predicate-based estimation', () => {
      (<any>actor).predicateBasedEstimation = true;
      expect(actor.estimateOperationCardinality(operation, DF, [ dataset ])).toBeUndefined();
    });
  });
});
