import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractArgs,
  IActorRdfMetadataExtractOutput,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import { KeyLinkFilters } from '@comunica/bus-rdf-parse-link-filter';
import type { MediatorRdfParseLinkFilter, ILinkFilter } from '@comunica/bus-rdf-parse-link-filter';
import type { IActorTest } from '@comunica/core';
import type * as RDF from '@rdfjs/types';

/**
 * A comunica Membership RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractLinkFilter extends ActorRdfMetadataExtract {
  protected readonly mediatorRdfParseLinkFilter: MediatorRdfParseLinkFilter;
  protected readonly membershipFilterTypes: Set<string>;

  public static readonly RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  public constructor(args: IActorRdfMetadataExtractLinkFilterArgs) {
    super(args);
    this.mediatorRdfParseLinkFilter = args.mediatorRdfParseLinkFilter;
    this.membershipFilterTypes = new Set(args.membershipFilterTypes);
  }

  public async test(action: IActionRdfMetadataExtract): Promise<IActorTest> {
    if (!action.context.has(KeyLinkFilters)) {
      throw new Error(`${this.name} can only extract link filters into a context storage`);
    }
    return true;
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const filterData = await this.extractFilters(action.metadata);
    if (filterData.size > 0) {
      const filters = action.context.getSafe<ILinkFilter[]>(KeyLinkFilters);
      for (const data of filterData.values()) {
        const parseResult = await this.mediatorRdfParseLinkFilter.mediate({ data, context: action.context });
        filters.push(parseResult.filter);
      }
    }
    return { metadata: {}};
  }

  /**
   * Extract membership filter data from metadata stream.
   * @param stream The RDF metadata stream to process
   * @returns The collected membership filter data
   */
  protected async extractFilters(stream: RDF.Stream): Promise<Map<string, RDF.Quad[]>> {
    return new Promise((resolve, reject) => {
      const filters = new Map<string, RDF.Quad[]>();
      const quads = new Map<string, RDF.Quad[]>();
      const quadAssociations = new Map<string, string[]>();
      stream
        .on('data', (quad: RDF.Quad) => {
          if (quad.object.termType === 'NamedNode' || quad.object.termType === 'BlankNode') {
            const associations = quadAssociations.get(quad.subject.value);
            if (associations) {
              associations.push(quad.object.value);
            } else {
              quadAssociations.set(quad.subject.value, [ quad.object.value ]);
            }
          }
          if (filters.has(quad.subject.value)) {
            filters.get(quad.subject.value)!.push(quad);
          } else if (
            quad.predicate.value === ActorRdfMetadataExtractLinkFilter.RDF_TYPE &&
            quad.object.termType === 'NamedNode' &&
            this.membershipFilterTypes.has(quad.object.value)
          ) {
            const data = quads.get(quad.subject.value) ?? [];
            data.push(quad);
            filters.set(quad.subject.value, data);
            quads.delete(quad.subject.value);
          } else {
            const data = quads.get(quad.subject.value);
            if (data) {
              data.push(quad);
            } else {
              quads.set(quad.subject.value, [ quad ]);
            }
          }
        })
        .on('end', () => {
          for (const [ filterIri, filterQuads ] of filters) {
            const associatedSubjects = quadAssociations.get(filterIri);
            if (associatedSubjects) {
              for (const associatedSubject of associatedSubjects) {
                const subjectQuads = quads.get(associatedSubject);
                if (subjectQuads) {
                  filterQuads.push(...subjectQuads);
                }
              }
            }
          }
          resolve(filters);
        })
        .on('error', reject);
    });
  }
}

export interface IActorRdfMetadataExtractLinkFilterArgs extends IActorRdfMetadataExtractArgs {
  /**
   * RDF type IRIs of link filters for detection from metadata stream
   */
  membershipFilterTypes: string[];
  /**
   * Mediator on the link filter parse bus
   */
  mediatorRdfParseLinkFilter: MediatorRdfParseLinkFilter;
}
