import type { IVoIDDescription } from '@comunica/actor-rdf-metadata-extract-void-description';
import { ActorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import type {
  IActionRdfMetadataAccumulate,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { KeysQueryOperation, KeysRdfResolveQuadPattern } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import type { QueryResultCardinality } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

/**
  * A comunica Predicate Count RDF Metadata Accumulate Actor.
  */
export class ActorRdfMetadataAccumulateVoIDDescription extends ActorRdfMetadataAccumulate {
  public constructor(args: IActorRdfMetadataAccumulateVoIDDescriptionArgs) {
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

    const descriptions: IVoIDDescription[] = [
      ...action.accumulatedMetadata.voidDescriptions || [],
      ...action.appendingMetadata.voidDescriptions || [],
    ];

    let cardinality: QueryResultCardinality | undefined;

    if (descriptions.length > 0) {
      // This is an algebra pattern, but has some common members with Quad
      const pattern: RDF.Quad = action.context.getSafe(KeysQueryOperation.operation);

      if (pattern.predicate.termType === 'NamedNode') {
        const sourceIds: Map<string, string> | undefined = action.context.get(KeysRdfResolveQuadPattern.sourceIds);
        if (sourceIds && sourceIds.size > 0) {
          let count = 0;
          const datasets: string[] = [];

          for (const source of sourceIds.keys()) {
            const matchingDescription = this.getDescriptionWithLongestMatch(source, descriptions);
            if (matchingDescription) {
              const predicateCount = matchingDescription.propertyPartitions.get(pattern.predicate.value);
              if (predicateCount) {
                count += predicateCount;
                datasets.push(matchingDescription.dataset);
              }
            }
          }

          if (count > 0) {
            cardinality = {
              type: 'estimate',
              value: count,
              ...datasets.length === 1 ? { dataset: datasets[0] } : {},
            };
          }
        }
      }
    }

    return { metadata: {
      ...descriptions.length > 0 ? { voidDescriptions: descriptions } : {},
      ...cardinality ? { cardinality } : {},
    }};
  }

  private getDescriptionWithLongestMatch(uri: string, descriptions: IVoIDDescription[]): IVoIDDescription | undefined {
    let matchLength = 0;
    let match: IVoIDDescription | undefined;
    for (const description of descriptions) {
      const matchTarget = description.uriSpace ?? description.dataset;
      if (matchTarget === uri) {
        match = description;
        matchLength = matchTarget.length;
        break;
      } else {
        const targetMatchLength = this.getMatchingLength(uri, matchTarget);
        if (targetMatchLength >= matchLength) {
          matchLength = targetMatchLength;
          match = description;
        }
      }
    }
    return match;
  }

  private getMatchingLength(sa: string, sb: string): number {
    let matchingChars = 0;
    const iterMax = Math.max(sa.length, sb.length);
    for (let i = 0; i < iterMax; i++) {
      matchingChars = i;
      if (sa[i] !== sb[i]) {
        break;
      }
    }
    return matchingChars;
  }
}

export type IActorRdfMetadataAccumulateVoIDDescriptionArgs = IActorRdfMetadataAccumulateArgs;
