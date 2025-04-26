import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractArgs,
  IActorRdfMetadataExtractOutput,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import { KeysPrototype } from '@comunica/utils-prototype';
import type * as RDF from '@rdfjs/types';
import { Bloem } from 'bloem';
import { Algebra, Util } from 'sparqlalgebrajs';
import {
  mem_binaryRepresentation,
  mem_bitSize,
  mem_hashFunction,
  mem_hashSize,
  mem_memberCollection,
  mem_projectedProperty,
  mem_projectedResource,
  mem_sourceCollection,
} from './Vocabulary';

export class ActorRdfMetadataExtractLinkFilterBloom extends ActorRdfMetadataExtract {
  public constructor(args: IActorRdfMetadataExtractArgs) {
    super(args);
  }

  public async test(action: IActionRdfMetadataExtract): Promise<TestResult<IActorTest>> {
    if (!action.context.has(KeysPrototype.linkFilters)) {
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
            case mem_sourceCollection:
              sourceCollections[quad.subject.value] = quad.object.value;
              break;
            case mem_memberCollection:
              memberCollections[quad.subject.value] = quad.object.value;
              break;
            case mem_bitSize:
              hashBits[quad.subject.value] = Number.parseInt(quad.object.value, 10);
              break;
            case mem_hashSize:
              hashSize[quad.subject.value] = Number.parseInt(quad.object.value, 10);
              break;
            case mem_hashFunction:
              hashFunctions[quad.subject.value] = quad.object.value;
              break;
            case mem_projectedProperty:
              projectedProperties[quad.subject.value] = quad.object.value;
              break;
            case mem_projectedResource:
              projectedResources[quad.subject.value] = quad.object.value;
              break;
            case mem_binaryRepresentation:
              hashBuffer[quad.subject.value] = Buffer.from(quad.object.value, 'base64');
              break;
          }
        })
        .on('end', () => {
          const filters = action.context.getSafe(KeysPrototype.linkFilters);
          const query = action.context.getSafe(KeysInitQuery.query);
          const patterns = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(query);

          // The datasets that will not contain results for the current query.
          const queryIrrelevantDatasets = new Set<string>(Object.values(sourceCollections));

          for (const [ filterUri, memberCollectionUri ] of Object.entries(memberCollections)) {
            const datasetUri = sourceCollections[memberCollectionUri];
            if (datasetUri && queryIrrelevantDatasets.has(datasetUri)) {
              const hashFunction = hashFunctions[filterUri];
              const size = hashBits[filterUri];
              const buffer = hashBuffer[filterUri];
              const slices = hashFunction ? hashSize[hashFunction] : undefined;
              if (size && slices && buffer) {
                const bloem = new Bloem(size, slices, buffer);
                const bloemProperty = projectedProperties[memberCollectionUri];
                const bloemResource = projectedResources[memberCollectionUri];
                for (const pattern of patterns) {
                  // If the filter has been created for a specific property value
                  if (bloemProperty) {
                    // If the query has a variable predicate, there may be matching data in the dataset.
                    if (pattern.predicate.termType === 'Variable') {
                      queryIrrelevantDatasets.delete(datasetUri);
                      break;
                    } else if (pattern.predicate.value === bloemProperty &&
                      (
                        // If the predicate occurs with only variables, there may be matching data.
                        (pattern.subject.termType === 'Variable' && pattern.object.termType === 'Variable') ||
                        // If one of the values with the predicate are in the filter, there are matches.
                        (pattern.subject.termType !== 'Variable' && bloem.has(Buffer.from(pattern.subject.value))) ||
                        (pattern.object.termType !== 'Variable' && bloem.has(Buffer.from(pattern.object.value)))
                      )
                    ) {
                      queryIrrelevantDatasets.delete(datasetUri);
                      break;
                    }
                  }
                  if (bloemResource) {
                    // If the query has a pattern with all variables, there may be matches.
                    if (
                      pattern.subject.termType === 'Variable' &&
                      pattern.predicate.termType === 'Variable' &&
                      pattern.object.termType === 'Variable'
                    ) {
                      queryIrrelevantDatasets.delete(datasetUri);
                      break;
                    } else if (pattern.subject.termType !== 'Variable' && pattern.subject.value === bloemResource &&
                      (
                        (
                          pattern.predicate.termType !== 'Variable' &&
                          bloem.has(Buffer.from(pattern.predicate.value))
                        ) ||
                        (
                          pattern.object.termType !== 'Variable' &&
                          bloem.has(Buffer.from(pattern.object.value))
                        )
                      )
                    ) {
                      queryIrrelevantDatasets.delete(datasetUri);
                      break;
                    } else if (pattern.object.termType !== 'Variable' && pattern.object.value === bloemResource &&
                      (
                        (
                          pattern.predicate.termType !== 'Variable' &&
                          bloem.has(Buffer.from(pattern.predicate.value))
                        ) ||
                        (
                          pattern.subject.termType !== 'Variable' &&
                          bloem.has(Buffer.from(pattern.subject.value))
                        )
                      )
                    ) {
                      queryIrrelevantDatasets.delete(datasetUri);
                      break;
                    }
                  }
                }
              }
            }
          }

          for (const dataset of queryIrrelevantDatasets) {
            filters.push((link) => {
              const ignore = link.url.startsWith(dataset);
              if (ignore) {
                this.logWarn(action.context, `Ignoring link: ${link.url}`);
              }
              return !ignore;
            });
          }

          resolve({ metadata: {}});
        });
    });
  }

  public static extractPatterns(operation: Algebra.Operation): Algebra.Pattern[] {
    const patterns: Algebra.Pattern[] = [];
    Util.recurseOperation(operation, {
      [Algebra.types.PATTERN]: (pattern) => {
        patterns.push(pattern);
        return false;
      },
    });
    return patterns;
  }
}
