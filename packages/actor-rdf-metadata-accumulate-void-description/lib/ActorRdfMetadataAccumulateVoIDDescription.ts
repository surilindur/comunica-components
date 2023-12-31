import type { IVoIDDescription } from '@comunica/actor-rdf-metadata-extract-void-description';
import { ActorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import type {
  IActionRdfMetadataAccumulate,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { getContextSources, getContextSourceUrl } from '@comunica/bus-rdf-resolve-quad-pattern';
import { KeysQueryOperation } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import type { QueryResultCardinality, IActionContext } from '@comunica/types';
import type { Algebra } from 'sparqlalgebrajs';
import type { TriplePatternCardinalityEstimator } from './TriplePatternCardinalityEstimator';

/**
  * A comunica Predicate Count RDF Metadata Accumulate Actor.
  */
export class ActorRdfMetadataAccumulateVoIDDescription extends ActorRdfMetadataAccumulate {
  protected readonly triplePatternCardinalityEstimator: TriplePatternCardinalityEstimator;

  public constructor(args: IActorRdfMetadataAccumulateVoIDDescriptionArgs) {
    super(args);
    this.triplePatternCardinalityEstimator = args.triplePatternCardinalityEstimator;
  }

  public async test(action: IActionRdfMetadataAccumulate): Promise<IActorTest> {
    return true;
  }

  public async run(action: IActionRdfMetadataAccumulate): Promise<IActorRdfMetadataAccumulateOutput> {
    // Return default value on initialize
    if (action.mode === 'initialize') {
      return { metadata: { cardinality: { type: 'exact', value: 0 }}};
    }

    if (action.accumulatedMetadata.voidDescriptions || action.appendingMetadata.voidDescriptions) {
      let cardinality: QueryResultCardinality | undefined;

      const descriptions: IVoIDDescription[] = [
        ...action.accumulatedMetadata.voidDescriptions ? action.accumulatedMetadata.voidDescriptions : [],
        ...action.appendingMetadata.voidDescriptions ? action.appendingMetadata.voidDescriptions : [],
      ];

      const sources = this.getContextSourceUrls(action.context);

      if (sources) {
        let bestEstimate = 0;
        let bestDataset: string | undefined;
        const pattern: Algebra.Pattern = action.context.getSafe(KeysQueryOperation.operation);

        for (const source of sources) {
          const matchingDescription = this.getDescriptionWithLongestMatch(source, descriptions);
          if (matchingDescription) {
            const estimatedCardinality = this.triplePatternCardinalityEstimator
              .estimate(matchingDescription, pattern);
            if (estimatedCardinality && (!bestDataset || matchingDescription.dataset.length > bestDataset.length)) {
              bestEstimate = estimatedCardinality;
              bestDataset = matchingDescription.dataset;
            }
          }
        }

        if (bestDataset) {
          cardinality = { type: 'estimate', value: bestEstimate, dataset: bestDataset };
        }
      }

      return { metadata: {
        voidDescriptions: descriptions,
        ...cardinality ? { cardinality } : {},
      }};
    }

    return { metadata: {}};
  }

  private getContextSourceUrls(context: IActionContext): Set<string> | undefined {
    const contextSources = getContextSources(context);
    const sources: Set<string> = new Set();

    if (contextSources) {
      for (const source of contextSources) {
        const url = getContextSourceUrl(source);
        if (url) {
          sources.add(url);
        }
      }
    }

    return sources.size > 0 ? sources : undefined;
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

export interface IActorRdfMetadataAccumulateVoIDDescriptionArgs extends IActorRdfMetadataAccumulateArgs {
  /**
   * Instance of a triple pattern cardinality estimator for VoID descriptions.
   */
  triplePatternCardinalityEstimator: TriplePatternCardinalityEstimator;
}
