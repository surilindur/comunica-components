import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractArgs,
  IActorRdfMetadataExtractOutput,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { rdf_void } from './vocabularies';

export class ActorRdfMetadataExtractLinkFilterVoid extends ActorRdfMetadataExtract {
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
      const uriSpaces: Record<string, string> = {};
      const uriRegexPatterns: Record<string, RegExp> = {};
      const datasetsWithEndpoints = new Set<string>();

      action.metadata
        .on('error', reject)
        .on('data', (quad: RDF.Quad) => {
          switch (quad.predicate.value) {
            case rdf_void.sparqlEndpoint:
              datasetsWithEndpoints.add(quad.subject.value);
              break;
            case rdf_void.uriRegexPattern:
              uriRegexPatterns[quad.subject.value] = new RegExp(quad.object.value, 'u');
              break;
            case rdf_void.uriSpace:
              uriSpaces[quad.subject.value] = quad.object.value;
              break;
          }
        })
        .on('end', () => {
          const filters = action.context.getSafe(KeysRdfResolveHypermediaLinks.linkFilters);

          for (const dataset of datasetsWithEndpoints) {
            if (uriSpaces[dataset]) {
              filters.push(link => !link.url.startsWith(uriSpaces[dataset]));
            } else if (uriRegexPatterns[dataset]) {
              filters.push(link => !uriRegexPatterns[dataset].test(link.url));
            }
          }

          resolve({ metadata: {}});
        });
    });
  }
}
