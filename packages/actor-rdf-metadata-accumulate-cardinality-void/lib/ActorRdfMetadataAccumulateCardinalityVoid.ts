import { ActorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import type {
  IActionRdfMetadataAccumulate,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { KeysQueryOperation } from '@comunica/context-entries';
import { passTestVoid } from '@comunica/core';
import type { IActorTest, TestResult } from '@comunica/core';
import type { IDataset, QueryResultCardinality } from '@comunica/types';
import { estimateCardinality } from '@comunica/utils-query-operation';

/**
 * A comunica Predicate Count RDF Metadata Accumulate Actor.
 */
export class ActorRdfMetadataAccumulateCardinalityVoid extends ActorRdfMetadataAccumulate {
  public constructor(args: IActorRdfMetadataAccumulateArgs) {
    super(args);
  }

  public async test(_action: IActionRdfMetadataAccumulate): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataAccumulate): Promise<IActorRdfMetadataAccumulateOutput> {
    const metadata: Record<string, any> = {};

    if (action.mode === 'append') {
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

      if (Object.keys(datasets).length > 0) {
        const operation = action.context.get(KeysQueryOperation.operation);
        let cardinality: QueryResultCardinality | undefined;

        if (operation && datasets) {
          for (const dataset of Object.values(datasets)) {
            const datasetCardinality = estimateCardinality(operation, dataset);
            if (cardinality) {
              cardinality.value += datasetCardinality.value;
              cardinality.type = 'estimate';
              delete cardinality.dataset;
            } else {
              cardinality = datasetCardinality;
              cardinality.dataset = dataset.uri;
            }
          }
        }

        metadata.datasets = Object.values(datasets);

        if (cardinality) {
          metadata.cardinality = cardinality;
        }
      }
    }

    return { metadata };
  }
}
