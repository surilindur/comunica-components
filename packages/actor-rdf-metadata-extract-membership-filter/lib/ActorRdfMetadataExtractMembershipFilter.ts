import type { IActionRdfMetadataExtract, IActorRdfMetadataExtractArgs,
  IActorRdfMetadataExtractOutput } from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import type { MediatorRdfParseMembershipFilter, IMembershipFilter } from '@comunica/bus-rdf-parse-membership-filter';
import type { IActorTest } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

/**
 * A comunica Membership RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractMembershipFilter extends ActorRdfMetadataExtract {
  public static readonly RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  private readonly mediatorRdfParseMembershipFilter: MediatorRdfParseMembershipFilter;

  private readonly membershipFilterTypes: Set<string>;
  private readonly membershipFilterPredicates: Set<string>;

  public constructor(args: IActorRdfMetadataExtractMembershipFilterArgs) {
    super(args);
    this.mediatorRdfParseMembershipFilter = args.mediatorRdfParseMembershipFilter;
    this.membershipFilterTypes = new Set(args.membershipFilterTypes);
    this.membershipFilterPredicates = new Set(args.membershipFilterPredicates);
  }

  public async test(action: IActionRdfMetadataExtract): Promise<IActorTest> {
    return true;
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const filterData = await this.extractFilters(action.metadata);
    return { metadata: filterData ? { membershipFilters: await this.parseFilters(action.context, filterData) } : {}};
  }

  /**
   * Extract membership filter data from metadata stream.
   * @param stream The RDF metadata stream to process
   * @returns The collected membership filter data
   */
  private async extractFilters(stream: RDF.Stream): Promise<Record<string, RDF.Quad[]> | undefined> {
    return new Promise((resolve, reject) => {
      const filters: Record<string, RDF.Quad[]> = {};
      const quads: Record<string, RDF.Quad[]> = {};
      stream
        .on('data', (quad: RDF.Quad) => {
          const subject = quad.subject.value;
          if (filters[subject]) {
            filters[subject].push(quad);
          } else if (
            quad.predicate.value === ActorRdfMetadataExtractMembershipFilter.RDF_TYPE &&
            this.membershipFilterTypes.has(quad.object.value)
          ) {
            filters[subject] = quads[subject] ?? [];
            filters[subject].push(quad);
            delete quads[subject];
          } else if (this.membershipFilterPredicates.has(quad.predicate.value)) {
            const filterUri = quad.object.value;
            filters[filterUri] = quads[filterUri] ?? [];
            filters[filterUri].push(quad);
            delete quads[filterUri];
          } else if (quads[subject]) {
            quads[subject].push(quad);
          } else {
            quads[subject] = [ quad ];
          }
        })
        .on('end', () => resolve(Object.keys(filters).length > 0 ? filters : undefined))
        .on('error', reject);
    });
  }

  /**
   * Parse membership filters using the membership filter parsing bus.
   * @param context The action context.
   * @param filters Membership filter data.
   * @returns The parsed membership filters.
   */
  private async parseFilters(
    context: IActionContext,
    filters: Record<string, RDF.Quad[]>,
  ): Promise<Map<RegExp, IMembershipFilter>> {
    const parsedFilters: Map<RegExp, IMembershipFilter> = new Map();
    for (const [ uri, quads ] of Object.entries(filters)) {
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
   * Predicate IRIs that should point as membership filters
   */
  membershipFilterPredicates: string[];
  /**
   * Mediator on the membership filter parse bus
   */
  mediatorRdfParseMembershipFilter: MediatorRdfParseMembershipFilter;
}
