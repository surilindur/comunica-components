import type { IActionRdfMetadataExtract, IActorRdfMetadataExtractArgs,
  IActorRdfMetadataExtractOutput } from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import { KeyMembershipFilterStorage } from '@comunica/bus-rdf-parse-membership-filter';
import type { MediatorRdfParseMembershipFilter, IMembershipFilter,
  IMembershipFilterStorage } from '@comunica/bus-rdf-parse-membership-filter';
import type { IActorTest } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

/**
 * A comunica Membership RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractMembershipFilter extends ActorRdfMetadataExtract {
  protected readonly mediatorRdfParseMembershipFilter: MediatorRdfParseMembershipFilter;
  protected readonly membershipFilterTypes: Set<string>;

  public static readonly RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  public constructor(args: IActorRdfMetadataExtractMembershipFilterArgs) {
    super(args);
    this.mediatorRdfParseMembershipFilter = args.mediatorRdfParseMembershipFilter;
    this.membershipFilterTypes = new Set(args.membershipFilterTypes);
  }

  public async test(action: IActionRdfMetadataExtract): Promise<IActorTest> {
    if (!action.context.has(KeyMembershipFilterStorage)) {
      throw new Error(`${this.name} can only extract membership filters into a context storage`);
    }
    return true;
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const filterData = await this.extractFilters(action.metadata);
    if (filterData.size > 0) {
      const storage = action.context.getSafe<IMembershipFilterStorage>(KeyMembershipFilterStorage);
      const filters = await this.parseFilters(action.context, filterData);
      for (const [ regex, filter ] of filters) {
        storage.add(regex, filter);
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
      stream
        .on('data', (quad: RDF.Quad) => {
          if (filters.has(quad.subject.value)) {
            filters.get(quad.subject.value)!.push(quad);
          } else if (
            quad.predicate.value === ActorRdfMetadataExtractMembershipFilter.RDF_TYPE &&
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
        .on('end', () => resolve(filters))
        .on('error', reject);
    });
  }

  /**
   * Parse membership filters using the membership filter parsing bus.
   * @param context The action context.
   * @param filters Membership filter data.
   * @returns The parsed membership filters.
   */
  protected async parseFilters(
    context: IActionContext,
    filters: Map<string, RDF.Quad[]>,
  ): Promise<Map<RegExp, IMembershipFilter>> {
    const parsedFilters: Map<RegExp, IMembershipFilter> = new Map();
    for (const [ uri, quads ] of filters) {
      const types = quads
        .filter(quad => quad.predicate.value === ActorRdfMetadataExtractMembershipFilter.RDF_TYPE)
        .map(quad => quad.object.value);
      if (types.length > 0) {
        const parseResult = await this.mediatorRdfParseMembershipFilter.mediate({
          types,
          data: quads,
          context,
        });
        parsedFilters.set(parseResult.uriPattern, parseResult.filter);
      }
    }
    return parsedFilters;
  }
}

export interface IActorRdfMetadataExtractMembershipFilterArgs extends IActorRdfMetadataExtractArgs {
  /**
   * RDF type IRIs of membership filters for detection from metadata stream
   */
  membershipFilterTypes: string[];
  /**
   * Mediator on the membership filter parse bus
   */
  mediatorRdfParseMembershipFilter: MediatorRdfParseMembershipFilter;
}
