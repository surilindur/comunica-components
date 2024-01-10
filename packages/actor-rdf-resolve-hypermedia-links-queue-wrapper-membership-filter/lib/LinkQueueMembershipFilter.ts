import type { IMembershipFilter, IMembershipFilterStorage } from '@comunica/bus-rdf-parse-membership-filter';
import { KeyMembershipFilterStorage } from '@comunica/bus-rdf-parse-membership-filter';
import type { ILinkQueue, ILink } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { LinkQueueWrapper } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActionContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import type { Algebra } from 'sparqlalgebrajs';
import { Util } from 'sparqlalgebrajs';

/**
 * A link queue that filters out links based on known membership filters.
 */
export class LinkQueueMembershipFilter extends LinkQueueWrapper {
  private readonly queryTerms: Map<string, RDF.Term[]>;
  private readonly filterStorage: IMembershipFilterStorage;
  private readonly ignorePatterns: RegExp[] | undefined;
  private readonly members: string[];

  public constructor(
    linkQueue: ILinkQueue,
    context: IActionContext,
    members: string[],
    ignorePatterns?: string[],
  ) {
    super(linkQueue);
    this.ignorePatterns = ignorePatterns?.map(pattern => new RegExp(pattern, 'u'));
    this.filterStorage = context.getSafe<IMembershipFilterStorage>(KeyMembershipFilterStorage);
    this.queryTerms = this.extractQueryTermsFromContext(context);
    this.members = members;
  }

  private extractQueryTermsFromContext(context: IActionContext): Map<string, RDF.Term[]> {
    const operation: Algebra.Operation = context.getSafe(KeysInitQuery.query);
    const patterns: Algebra.Pattern[] = [];

    Util.recurseOperation(operation, {
      pattern(pattern) {
        patterns.push(pattern);
        return true;
      },
    });

    const subjectTerms: Set<RDF.Term> = new Set();
    const predicateTerms: Set<RDF.Term> = new Set();
    const objectTerms: Set<RDF.Term> = new Set();
    const graphTerms: Set<RDF.Term> = new Set();
    const allTerms: Set<RDF.Term> = new Set();

    for (const pattern of patterns) {
      if (pattern.subject.termType === 'NamedNode') {
        subjectTerms.add(pattern.subject);
        allTerms.add(pattern.subject);
      }
      if (pattern.predicate.termType === 'NamedNode') {
        predicateTerms.add(pattern.predicate);
        allTerms.add(pattern.predicate);
      }
      if (pattern.object.termType === 'NamedNode') {
        objectTerms.add(pattern.object);
        allTerms.add(pattern.object);
      }
      if (pattern.graph.termType === 'NamedNode') {
        graphTerms.add(pattern.graph);
        allTerms.add(pattern.graph);
      }
    }

    return new Map<string, RDF.Term[]>([
      [ 's', [ ...subjectTerms.values() ]],
      [ 'p', [ ...predicateTerms.values() ]],
      [ 'o', [ ...objectTerms.values() ]],
      [ 'g', [ ...graphTerms.values() ]],
      [ 'spog', [ ...allTerms.values() ]],
    ]);
  }

  /**
   * Determine whether a link should be accepted by the queue, using membership filters.
   * @param link The link entering or leaving the queue
   * @returns Whether the link should be accepted
   */
  private acceptable(link: ILink): boolean {
    if (this.members.length > 0 && !this.ignorePatterns?.some(pattern => pattern.test(link.url))) {
      const filtersMatchingLink: IMembershipFilter[] = this.filterStorage.findForMembers(
        link.url,
        this.members,
      );
      if (filtersMatchingLink.length > 0) {
        let accepted = false;
        for (const [ members, terms ] of this.queryTerms) {
          if (
            this.members.includes(members) &&
            terms.some(term => filtersMatchingLink.some(filter => filter.test(term)))
          ) {
            accepted = true;
            break;
          }
        }
        return accepted;
      }
    }
    return true;
  }

  public pop(): ILink | undefined {
    let link: ILink | undefined = super.pop();
    while (link && !this.acceptable(link)) {
      link = super.pop();
    }
    return link;
  }

  public push(link: ILink, parent: ILink): boolean {
    return this.acceptable(link) ? super.push(link, parent) : false;
  }
}
