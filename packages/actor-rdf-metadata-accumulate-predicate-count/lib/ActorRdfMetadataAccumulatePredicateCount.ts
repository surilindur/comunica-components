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

    const accumulatedPredicates: Map<string, Map<string, number>> | undefined = action.accumulatedMetadata.predicates;
    const appendingPredicates: Map<string, Map<string, number>> | undefined = action.appendingMetadata.predicates;

    let predicates: Map<string, Map<string, number>> | undefined;
    let cardinality: QueryResultCardinality | undefined;

    if (accumulatedPredicates && appendingPredicates) {
      predicates = new Map([ ...accumulatedPredicates, ...appendingPredicates ]);
    } else if (accumulatedPredicates) {
      predicates = new Map(accumulatedPredicates);
    } else if (appendingPredicates) {
      predicates = new Map(appendingPredicates);
    }

    if (predicates) {
      // This is an algebra pattern, but has some common members with Quad
      const pattern: RDF.Quad = action.context.getSafe(KeysQueryOperation.operation);

      if (pattern.predicate.termType === 'NamedNode') {
        const sourceIds: Map<string, string> | undefined = action.context.get(KeysRdfResolveQuadPattern.sourceIds);
        if (sourceIds && sourceIds.size > 0) {
          let count = 0;
          const datasets: string[] = [];

          for (const source of sourceIds.keys()) {
            const entry = this.getLongestMatchingEntry(source, predicates);

            if (entry) {
              const entryCount = entry[1].get(pattern.predicate.value);
              if (entryCount) {
                count += entryCount;
                datasets.push(entry[0]);
              }
            }
          }

          if (count > 0) {
            cardinality = { type: 'estimate', value: count, ...datasets.length === 1 ? { dataset: datasets[0] } : {}};
          }
        }
      }
    }

    return { metadata: { ...predicates ? { predicates } : {}, ...cardinality ? { cardinality } : {}}};
  }

  private getLongestMatchingEntry<T>(key: string, map: Map<string, T>): [string, T] | undefined {
    if (map.has(key)) {
      return [ key, map.get(key)! ];
    }
    let bestMatch: string | undefined;
    let bestMatchEntry: T | undefined;
    let bestMatchLength = 0;
    for (const [ mapKey, entry ] of map) {
      const matchLength = this.getMatchingLength(mapKey, key);
      if (matchLength > bestMatchLength) {
        bestMatch = mapKey;
        bestMatchEntry = entry;
        bestMatchLength = matchLength;
      }
    }
    return bestMatch && bestMatchEntry ? [ bestMatch, bestMatchEntry ] : undefined;
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
