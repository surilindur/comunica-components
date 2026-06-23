import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractArgs,
  IActorRdfMetadataExtractOutput,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import { KeysInitQuery } from '@comunica/context-entries';
import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { LinkFilter } from '@comunica/types-link-traversal';
import type { Algebra } from '@comunica/utils-algebra';
import { algebraUtils } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { Bloem } from 'bloem';
import { mem } from './vocabularies';

export class ActorRdfMetadataExtractLinkFilterBloom extends ActorRdfMetadataExtract {
  public constructor(args: IActorRdfMetadataExtractArgs) {
    super(args);
  }

  public async test(action: IActionRdfMetadataExtract): Promise<TestResult<IActorTest>> {
    if (!action.context.has(KeysRdfResolveHypermediaLinks.linkFilters)) {
      return failTest('Unable to extract filters without filter output array in context');
    }
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    return new Promise((resolve, reject) => {
      const hashBits: Record<string, number> = {};
      const hashSize: Record<string, number> = {};
      const hashBuffer: Record<string, Buffer> = {};
      const hashFunctions: Record<string, string> = {};
      const sourceCollections: Record<string, string> = {};
      const memberCollections: Record<string, string> = {};
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {};

      action.metadata
        .on('error', reject)
        .on('data', (quad: RDF.Quad) => {
          switch (quad.predicate.value) {
            case mem.sourceCollection:
              sourceCollections[quad.subject.value] = quad.object.value;
              break;
            case mem.memberCollection:
              memberCollections[quad.subject.value] = quad.object.value;
              break;
            case mem.bitSize:
              hashBits[quad.subject.value] = Number.parseInt(quad.object.value, 10);
              break;
            case mem.hashSize:
              hashSize[quad.subject.value] = Number.parseInt(quad.object.value, 10);
              break;
            case mem.hashFunction:
              hashFunctions[quad.subject.value] = quad.object.value;
              break;
            case mem.projectedProperty:
              projectedProperties[quad.subject.value] = quad.object.value;
              break;
            case mem.projectedResource:
              projectedResources[quad.subject.value] = quad.object.value;
              break;
            case mem.binaryRepresentation:
              hashBuffer[quad.subject.value] = Buffer.from(quad.object.value, 'base64');
              break;
          }
        })
        .on('end', () => {
          const linkFilters = action.context.getSafe(KeysRdfResolveHypermediaLinks.linkFilters);
          const query = action.context.getSafe(KeysInitQuery.query);
          const queryPatterns = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(query);
          const bloomFilters = ActorRdfMetadataExtractLinkFilterBloom.reconstructBloomFilters(
            memberCollections,
            hashBits,
            hashSize,
            hashBuffer,
            hashFunctions,
          );
          const ignoredUriPrefixes = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
            queryPatterns,
            bloomFilters,
            sourceCollections,
            memberCollections,
            projectedProperties,
            projectedResources,
          );
          const additionalLinkFilters = ignoredUriPrefixes.map((uriPrefix): LinkFilter => (link) => {
            const ignore = link.url.startsWith(uriPrefix);
            if (ignore) {
              this.logWarn(action.context, `Ignoring link: ${link.url}`);
            }
            return !ignore;
          });
          linkFilters.push(...additionalLinkFilters);

          resolve({ metadata: {}});
        });
    });
  }

  /**
   * Reconstruct bloom filter instances from RDF serializations.
   */
  public static reconstructBloomFilters(
    memberCollections: Record<string, string>,
    hashBits: Record<string, number>,
    hashSize: Record<string, number>,
    hashBuffer: Record<string, Buffer>,
    hashFunctions: Record<string, string>,
  ): Record<string, Bloem> {
    const filters: Record<string, Bloem> = {};
    for (const filterUri of Object.values(memberCollections)) {
      const hashFunction = hashFunctions[filterUri];
      const size = hashBits[filterUri];
      const buffer = hashBuffer[filterUri];
      const slices = hashFunction ? hashSize[hashFunction] : undefined;
      if (size && slices && buffer) {
        const bloem = new Bloem(size, slices, buffer);
        filters[filterUri] = bloem;
      }
    }
    return filters;
  }

  /**
   * Create link filters from Bloom filters and collection metadata.
   */
  public static determineUriPrefixesToIgnore(
    queryPatterns: Iterable<Algebra.Pattern>,
    bloomFilters: Record<string, Bloem>,
    sourceCollections: Record<string, string>,
    memberCollections: Record<string, string>,
    projectedProperties: Record<string, string>,
    projectedResources: Record<string, string>,
  ): string[] {
    // By default, all datasets for which Bloom metadata has been found, are assumed
    // to not contain query-relevant data, unless their Bloom filters prove otherwise.
    const datasetsToIgnore = new Set<string>(Object.values(sourceCollections));

    for (const [ filterUri, memberCollectionUri ] of Object.entries(memberCollections)) {
      const datasetUri = sourceCollections[memberCollectionUri];
      const bloomFilter = bloomFilters[filterUri];
      const bloomFilterTargetProperty = projectedProperties[memberCollectionUri];
      const bloomFilterTargetResource = projectedResources[memberCollectionUri];
      if (
        datasetUri &&
        bloomFilter &&
        datasetsToIgnore.has(datasetUri) &&
        (bloomFilterTargetProperty || bloomFilterTargetResource)
      ) {
        for (const pattern of queryPatterns) {
          if (bloomFilterTargetProperty) {
            // If the query has a variable predicate, there may be matching data in the dataset.
            if (pattern.predicate.termType === 'Variable') {
              datasetsToIgnore.delete(datasetUri);
              break;
            } else if (
              pattern.predicate.value === bloomFilterTargetProperty &&
              (
                // If the predicate occurs with only variables, there may be matching data.
                (pattern.subject.termType === 'Variable' && pattern.object.termType === 'Variable') ||
                // If one of the values with the predicate are in the filter, there are matches.
                (pattern.subject.termType !== 'Variable' && bloomFilter.has(Buffer.from(pattern.subject.value))) ||
                (pattern.object.termType !== 'Variable' && bloomFilter.has(Buffer.from(pattern.object.value)))
              )
            ) {
              datasetsToIgnore.delete(datasetUri);
              break;
            }
          }
          if (bloomFilterTargetResource) {
            // If the query has a pattern with all variables, there may be matches.
            if (
              pattern.subject.termType === 'Variable' &&
              pattern.predicate.termType === 'Variable' &&
              pattern.object.termType === 'Variable'
            ) {
              datasetsToIgnore.delete(datasetUri);
              break;
            } else if (
              pattern.subject.termType !== 'Variable' && pattern.subject.value === bloomFilterTargetResource &&
              (
                (pattern.predicate.termType !== 'Variable' && bloomFilter.has(Buffer.from(pattern.predicate.value))) ||
                (pattern.object.termType !== 'Variable' && bloomFilter.has(Buffer.from(pattern.object.value)))
              )
            ) {
              datasetsToIgnore.delete(datasetUri);
              break;
            } else if (
              pattern.object.termType !== 'Variable' && pattern.object.value === bloomFilterTargetResource &&
              (
                (pattern.predicate.termType !== 'Variable' && bloomFilter.has(Buffer.from(pattern.predicate.value))) ||
                (pattern.subject.termType !== 'Variable' && bloomFilter.has(Buffer.from(pattern.subject.value)))
              )
            ) {
              datasetsToIgnore.delete(datasetUri);
              break;
            }
          }
        }
      }
    }

    return [ ...datasetsToIgnore.values() ];
  }

  public static extractPatterns(operation: Algebra.Operation): Algebra.Pattern[] {
    const patterns: Algebra.Pattern[] = [];
    algebraUtils.visitOperation(operation, {
      pattern: {
        preVisitor: () => ({ continue: false }),
        visitor: op => patterns.push(op),
      },
    });
    return patterns;
  }
}
