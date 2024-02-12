import type { IMembershipFilterStorage } from '@comunica/bus-rdf-parse-membership-filter';
import type { ILinkQueue, ILink } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { LinkQueueWrapper } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import type * as RDF from '@rdfjs/types';

/**
 * A link queue that filters out links based on known membership filters.
 */
export class LinkQueueMembershipFilter extends LinkQueueWrapper {
  private readonly queryTerms: Map<string, RDF.Term[]>;
  private readonly filterStorage: IMembershipFilterStorage;
  private readonly ignorePatterns: RegExp[] | undefined;

  public constructor(args: ILinkQueueMembershipFilterArgs) {
    super(args.linkQueue);
    this.filterStorage = args.filterStorage;
    this.ignorePatterns = args.ignorePatterns;
    this.queryTerms = args.queryTerms;
    // Console.log(this.queryTerms);
  }

  /**
   * Determine whether a link should be accepted by the queue, using membership filters.
   * @param link The link entering or leaving the queue
   * @returns Whether the link should be accepted
   */
  private acceptable(link: ILink): boolean {
    if (this.ignorePatterns?.some(pattern => pattern.test(link.url))) {
      return true;
    }
    for (const [ member, terms ] of this.queryTerms) {
      const filter = this.filterStorage.get(link.url, member);
      if (!filter) {
        // Console.log(`ACCEPT: <${link.url}> has no filter for <${member}`);
        return true;
      }
      for (const term of terms) {
        if (filter.test(term)) {
          // Console.log(`ACCEPT: <${link.url}> includes <${term.value}>`);
          return true;
        }
      }
    }
    // Console.log(`REJECT: <${link.url}>`);
    return false;
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

export interface ILinkQueueMembershipFilterArgs {
  linkQueue: ILinkQueue;
  queryTerms: Map<string, RDF.Term[]>;
  filterStorage: IMembershipFilterStorage;
  ignorePatterns?: RegExp[];
}
