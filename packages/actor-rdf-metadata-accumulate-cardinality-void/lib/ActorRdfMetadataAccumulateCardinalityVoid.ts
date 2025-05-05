import { ActorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import type {
  IActionRdfMetadataAccumulate,
  IActionRdfMetadataAccumulateAppend,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { KeysInitQuery, KeysQueryOperation } from '@comunica/context-entries';
import { passTestVoid } from '@comunica/core';
import type { IActorTest, TestResult } from '@comunica/core';
import type { ComunicaDataFactory, IDataset, QueryResultCardinality } from '@comunica/types';
import { estimateCardinality } from '@comunica/utils-query-operation';
import { Algebra, Factory } from 'sparqlalgebrajs';

/**
 * A comunica Predicate Count RDF Metadata Accumulate Actor.
 */
export class ActorRdfMetadataAccumulateCardinalityVoid extends ActorRdfMetadataAccumulate {
  private readonly predicateBasedEstimation: boolean;

  public constructor(args: IActorRdfMetadataAccumulateCardinalityVoidArgs) {
    super(args);
    this.predicateBasedEstimation = args.predicateBasedEstimation;
  }

  public async test(_action: IActionRdfMetadataAccumulate): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataAccumulate): Promise<IActorRdfMetadataAccumulateOutput> {
    const metadata: Record<string, any> = {};

    if (action.mode === 'append') {
      const operation = action.context.getSafe(KeysQueryOperation.operation);
      const dataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
      const algebraFactory = new Factory(dataFactory);
      const datasets = this.accumulateDatasets(action);
      const cardinality = this.estimateOperationCardinality(operation, dataFactory, algebraFactory, datasets);
      if (datasets.length > 0) {
        metadata.datasets = datasets;
      }
      if (cardinality) {
        metadata.cardinality = cardinality;
      }
    }

    return { metadata };
  }

  /**
   * Collects the unique dataset metadata from both entries, and produces the combined array.
   */
  public accumulateDatasets(action: IActionRdfMetadataAccumulateAppend): IDataset[] {
    const datasets: Record<string, IDataset> = {};

    if (action.accumulatedMetadata.datasets) {
      for (const dataset of (<IDataset[]> action.accumulatedMetadata.datasets)) {
        datasets[dataset.uri] = dataset;
      }
    }

    if (action.appendingMetadata.datasets) {
      for (const dataset of (<IDataset[]> action.appendingMetadata.datasets)) {
        datasets[dataset.uri] = dataset;
      }
    }

    return Object.values(datasets);
  }

  public estimateOperationCardinality(
    operation: Algebra.Operation,
    dataFactory: ComunicaDataFactory,
    algebraFactory: Factory,
    datasets: IDataset[],
  ): QueryResultCardinality | undefined {
    let operationToEstimate = operation;

    if (this.predicateBasedEstimation) {
      if (operation.type === Algebra.types.PATTERN) {
        operationToEstimate = algebraFactory.createPattern(
          dataFactory.variable('s'),
          operation.predicate,
          dataFactory.variable('o'),
        );
      } else {
        return undefined;
      }
    }

    let cardinality: QueryResultCardinality | undefined;

    for (const dataset of datasets) {
      const datasetCardinality = estimateCardinality(operationToEstimate, dataset);
      if (cardinality) {
        cardinality.value += datasetCardinality.value;
        cardinality.type = 'estimate';
        delete cardinality.dataset;
      } else {
        cardinality = datasetCardinality;
        cardinality.dataset = dataset.uri;
      }
    }

    return cardinality;
  }
}

export interface IActorRdfMetadataAccumulateCardinalityVoidArgs extends IActorRdfMetadataAccumulateArgs {
  /**
   * Whether the actor should estimate triple pattern cardinality as equal to the predicate cardinality,
   * regardless of the other triple pattern members. This also restricts the estimation to patterns only.
   * @range {boolean}
   * @default {false}
   */
  predicateBasedEstimation: boolean;
}
