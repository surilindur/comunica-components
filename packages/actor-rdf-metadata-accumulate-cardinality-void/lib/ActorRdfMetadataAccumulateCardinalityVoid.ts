import { ActorRdfMetadataAccumulateCardinality } from '@comunica/actor-rdf-metadata-accumulate-cardinality';
import type { IDataset } from '@comunica/actor-rdf-metadata-extract-void';
import type {
  IActionRdfMetadataAccumulate,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { KeysQueryOperation } from '@comunica/context-entries';
import { passTestVoid } from '@comunica/core';
import type { IActorTest, TestResult } from '@comunica/core';
import type { QueryResultCardinality } from '@comunica/types';

/**
 * A comunica Predicate Count RDF Metadata Accumulate Actor.
 */
export class ActorRdfMetadataAccumulateCardinalityVoid extends ActorRdfMetadataAccumulateCardinality {
  public constructor(args: IActorRdfMetadataAccumulateArgs) {
    super(args);
  }

  public async test(_action: IActionRdfMetadataAccumulate): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataAccumulate): Promise<IActorRdfMetadataAccumulateOutput> {
    const output: IActorRdfMetadataAccumulateOutput = await super.run(action);

    if (action.mode === 'append') {
      const datasets: Record<string, IDataset> = {};

      if (action.accumulatedMetadata.datasets) {
        for (const dataset of <IDataset[]>action.accumulatedMetadata.datasets) {
          datasets[dataset.uri] = dataset;
        }
      }

      if (action.appendingMetadata.datasets) {
        for (const dataset of <IDataset[]>action.appendingMetadata.datasets) {
          datasets[dataset.uri] = dataset;
        }
      }

      if (Object.keys(datasets).length > 0) {
        const operation = action.context.get(KeysQueryOperation.operation);
        let cardinality: QueryResultCardinality | undefined;

        if (operation && datasets) {
          for (const dataset of Object.values(datasets)) {
            const datasetCardinality = await dataset.getCardinality(operation);
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

        output.metadata.datasets = Object.values(datasets);

        if (cardinality) {
          output.metadata.cardinality = cardinality;
        }
      }
    }

    return output;
  }
}
