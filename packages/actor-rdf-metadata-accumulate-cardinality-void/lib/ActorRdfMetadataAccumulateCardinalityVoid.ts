import type { ActorHttpInvalidateListenable } from '@comunica/bus-http-invalidate';
import { ActorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import type {
  IActionRdfMetadataAccumulate,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { KeysInitQuery, KeysQueryOperation, KeysQuerySourceIdentify } from '@comunica/context-entries';
import { failTest, passTestVoid } from '@comunica/core';
import type { IActorTest, TestResult } from '@comunica/core';
import type { ComunicaDataFactory, IDataset, QueryResultCardinality } from '@comunica/types';
import { Algebra } from '@comunica/utils-algebra';
import { estimateCardinality } from '@comunica/utils-query-operation';

/**
 * A comunica Predicate Count RDF Metadata Accumulate Actor.
 */
export class ActorRdfMetadataAccumulateCardinalityVoid extends ActorRdfMetadataAccumulate {
  private readonly predicateBasedEstimation: boolean;
  private readonly datasetCache: Map<string, IDataset>;

  public constructor(args: IActorRdfMetadataAccumulateCardinalityVoidArgs) {
    super(args);
    this.predicateBasedEstimation = args.predicateBasedEstimation;
    this.datasetCache = new Map<string, IDataset>();
    args.httpInvalidator.addInvalidateListener(() => this.datasetCache.clear());
  }

  public async test(action: IActionRdfMetadataAccumulate): Promise<TestResult<IActorTest>> {
    if (!action.context.has(KeysInitQuery.dataFactory)) {
      return failTest(`Actor ${this.name} requires a data factory in action context`);
    }
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataAccumulate): Promise<IActorRdfMetadataAccumulateOutput> {
    const metadata: Record<string, any> = {};
    if (action.mode === 'append') {
      // Accumulate the datasets if available
      if (action.accumulatedMetadata.datasets) {
        for (const dataset of (<IDataset[]> action.accumulatedMetadata.datasets)) {
          this.datasetCache.set(dataset.uri, dataset);
        }
      }
      if (action.appendingMetadata.datasets) {
        for (const dataset of (<IDataset[]> action.appendingMetadata.datasets)) {
          this.datasetCache.set(dataset.uri, dataset);
        }
      }

      // The following code to update the cardinality of the current operation is somewhat hacky,
      // because the previous approach is no longer functional in Comunica 5.x.
      // Originally, the operation and the VoID datasets were both available to the accumulator at the same time,
      // however in version 5.x, only one is available at a given time.
      // Thus, the datasets (VoID description metadata) are cached, so they are available when the operation appears.
      const operation = action.context.get(KeysQueryOperation.operation);
      const dataFactory = action.context.get(KeysInitQuery.dataFactory);
      const querySources = [ ...action.context.get(KeysQuerySourceIdentify.sourceIds)?.keys() ?? [] ];
      if (operation && dataFactory && querySources.length > 0) {
        const applicableDatasets: IDataset[] = [];
        for (const [ uri, dataset ] of this.datasetCache) {
          if (querySources.some(s => typeof s === 'string' && s.startsWith(uri))) {
            applicableDatasets.push(dataset);
          }
        }
        const cardinality = await this.estimateOperationCardinality(
          operation,
          dataFactory,
          applicableDatasets,
        );
        if (cardinality) {
          metadata.cardinality = cardinality;
        }
      }
    }

    return { metadata };
  }

  public async estimateOperationCardinality(
    operation: Algebra.Operation,
    dataFactory: ComunicaDataFactory,
    datasets: IDataset[],
  ): Promise<QueryResultCardinality | undefined> {
    const operationToEstimate = operation;

    if (this.predicateBasedEstimation) {
      if (operation.type === Algebra.Types.PATTERN) {
        (<Algebra.Pattern>operation).subject = dataFactory.variable('s');
        (<Algebra.Pattern>operation).object = dataFactory.variable('o');
      } else {
        return undefined;
      }
    }

    let cardinality: QueryResultCardinality | undefined;

    for (const dataset of datasets) {
      const datasetCardinality = await estimateCardinality(operationToEstimate, dataset);
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
  /* eslint-disable max-len */
  /**
   * An actor that listens to HTTP invalidation events
   * @default {<default_invalidator> a <npmd:@comunica/bus-http-invalidate/^5.0.0/components/ActorHttpInvalidateListenable.jsonld#ActorHttpInvalidateListenable>}
   */
  httpInvalidator: ActorHttpInvalidateListenable;
  /* eslint-enable max-len */
  /**
   * Whether the actor should estimate triple pattern cardinality as equal to the predicate cardinality,
   * regardless of the other triple pattern members. This also restricts the estimation to patterns only.
   * @range {boolean}
   * @default {false}
   */
  predicateBasedEstimation: boolean;
}
