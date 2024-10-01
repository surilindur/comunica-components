import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractOutput,
  IActorRdfMetadataExtractArgs,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import type { IActorTest } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { resolve as resolveIri } from 'relative-to-absolute-iri';

/**
 * A comunica RDF Metadata Extract Actor for SPARQL service descriptions.
 */
export class ActorRdfMetadataExtractSparqlService extends ActorRdfMetadataExtract {
  private readonly inferHttpsEndpoint: boolean;

  public constructor(args: IActorRdfMetadataExtractSparqlServiceArgs) {
    super(args);
    this.inferHttpsEndpoint = args.inferHttpsEndpoint;
  }

  // eslint-disable-next-line ts/naming-convention
  public async test(_action: IActionRdfMetadataExtract): Promise<IActorTest> {
    return true;
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    return new Promise((resolve, reject) => {
      // Forward errors
      action.metadata.on('error', reject);

      const metadata: Record<string, any> = {};

      action.metadata.on('data', (quad: RDF.Quad) => {
        switch (quad.predicate.value) {
          case 'http://www.w3.org/ns/sparql-service-description#endpoint':
            if (
              quad.subject.termType === 'BlankNode' ||
                (quad.subject.termType === 'NamedNode' && quad.subject.value === action.url)
            ) {
              // The specification says the endpoint is an IRI, but does not specify whether or not it can be a literal.
              metadata.sparqlService = resolveIri(quad.object.value, action.url);
              // Also fix a common mistake in SPARQL endpoint setups where HTTPS SD's refer to a non-existing HTTP API.
              if (this.inferHttpsEndpoint && action.url.startsWith('https') && !quad.object.value.startsWith('https')) {
                metadata.sparqlService = <string>metadata.sparqlService.replace(/^http:/u, 'https:');
              }
            }
            break;
          case 'http://www.w3.org/ns/sparql-service-description#defaultDataset':
            metadata.defaultDataset = quad.object;
            break;
          case 'http://www.w3.org/ns/sparql-service-description#defaultGraph':
            if (quad.subject.value === metadata.defaultDataset?.value) {
              metadata.defaultGraph = quad.object;
            }
            break;
          case 'http://www.w3.org/ns/sparql-service-description#feature':
            if (quad.object.termType === 'NamedNode' && quad.object.value === 'http://www.w3.org/ns/sparql-service-description#UnionDefaultGraph') {
              metadata.unionDefaultGraph = true;
            }
            break;
        }
      });

      if (metadata.sparqlService) {
        // eslint-disable-next-line no-console
        console.log('SPARQL SERVICE', metadata);
      }

      // Only return the metadata if an endpoint IRI was discovered
      action.metadata.on('end', () => {
        resolve({ metadata: metadata.sparqlService ? metadata : {}});
      });
    });
  }
}

export interface IActorRdfMetadataExtractSparqlServiceArgs extends IActorRdfMetadataExtractArgs {
  /**
   * If HTTPS endpoints should be forcefully used if the original URL was HTTPS-based
   * @default {true}
   */
  inferHttpsEndpoint: boolean;
}
