import { ActorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import type {
  IActionRdfMetadataAccumulate,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { KeysQueryOperation } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import type { MetadataQuads } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

type MetadataQuadsWithPredicates = MetadataQuads & { predicates?: Map<string, Map<string, number>> };

/**
  * A comunica Predicate Count RDF Metadata Accumulate Actor.
  */
export class ActorRdfMetadataAccumulatePredicateCount extends ActorRdfMetadataAccumulate {
  public constructor(args: IActorRdfMetadataAccumulateArgs) {
    super(args);
  }

  public async test(action: IActionRdfMetadataAccumulate): Promise<IActorTest> {
    return true;
  }

  public async run(action: IActionRdfMetadataAccumulate): Promise<IActorRdfMetadataAccumulateOutput> {
    // Return default value on initialize
    if (action.mode === 'initialize') {
      return { metadata: { cardinality: { type: 'exact', value: 0 }}};
    }

    const accumulatedMetadata: MetadataQuadsWithPredicates = action.accumulatedMetadata;
    const appendingMetadata: MetadataQuadsWithPredicates = action.appendingMetadata;

    // Otherwise, attempt to update existing value if the metadata has predicate counts available
    if (accumulatedMetadata.predicates || appendingMetadata.predicates) {
      // Transfer the predicate count map data from the appending one to the accumulating one if any
      if (appendingMetadata.predicates) {
        if (accumulatedMetadata.predicates) {
          for (const [ dataset, counts ] of appendingMetadata.predicates) {
            accumulatedMetadata.predicates.set(dataset, counts);
          }
        } else {
          accumulatedMetadata.predicates = appendingMetadata.predicates;
        }
      }

      // This is actually an algebra pattern, but seems to contain the same members as quad
      const pattern: RDF.Quad = action.context.getSafe(KeysQueryOperation.operation);

      // If the predicate for current pattern is an IRI, we can try estimating the pattern cardinality
      // by assuming that the number of triples with the same predicate roughly indicates the cardinality
      if (pattern.predicate.termType === 'NamedNode') {
        // The predicate counts are grouped by dataset, so first try to figure out the dataset to use
        let dataset: string | undefined = accumulatedMetadata.cardinality.dataset;

        // If the cardinality is for a dataset, find the matching dataset from the predicate count map
        if (dataset) {
          dataset = this.getLongestMatchingKeyFromMap(dataset, accumulatedMetadata.predicates!);
        }

        // If there is still no dataset, try to find one by the subject IRI if subject is a named node
        if (!dataset && pattern.subject.termType === 'NamedNode') {
          dataset = this.getLongestMatchingKeyFromMap(pattern.subject.value, accumulatedMetadata.predicates!);
        }

        // If a dataset was found, update the accumulate value to be that of the dataset
        if (dataset) {
          const predicateCountsInDataset = accumulatedMetadata.predicates!.get(dataset);
          const count = predicateCountsInDataset?.get(pattern.predicate.value);
          if (count && count !== accumulatedMetadata.cardinality.value) {
            // eslint-disable-next-line max-len
            // Console.log('Estimate:', dataset, pattern.predicate.value, accumulatedMetadata.cardinality.value, '->', count);
            accumulatedMetadata.cardinality.type = 'estimate';
            accumulatedMetadata.cardinality.value = count;
            if (accumulatedMetadata.cardinality.dataset !== dataset) {
              accumulatedMetadata.cardinality.dataset = dataset;
            }
          }
        }
      }
    }

    return { metadata: action.accumulatedMetadata };
  }

  private getLongestMatchingKeyFromMap(value: string, map: Map<string, any>): string | undefined {
    let bestMatch: string | undefined;
    let bestMatchLength = 0;
    for (const [ key, entry ] of map) {
      const matchLength = this.getMatchingLength(value, key);
      if (matchLength > bestMatchLength) {
        bestMatch = key;
        bestMatchLength = matchLength;
      }
    }
    return bestMatch;
  }

  private getMatchingLength(sa: string, sb: string): number {
    let matchingChars = 0;
    const iterMax = Math.max(sa.length, sb.length);
    for (let i = 0; i < Math.max(iterMax); i++) {
      matchingChars = i;
      if (sa[i] !== sb[i]) {
        break;
      }
    }
    return matchingChars;
  }
}
