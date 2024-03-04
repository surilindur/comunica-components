import type { ILinkQueue, ILink } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { LinkQueueWrapper } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';

type AcceptanceCheck = (link: ILink) => boolean;

/**
 * A link queue that uses the link filter bus.
 */
export class LinkQueueWrapperFilter extends LinkQueueWrapper {
  protected readonly acceptable: AcceptanceCheck;

  public constructor(linkQueue: ILinkQueue, acceptanceCheck: AcceptanceCheck) {
    super(linkQueue);
    this.acceptable = acceptanceCheck;
  }

  public pop(): ILink | undefined {
    let link = super.pop();
    while (link && !this.acceptable(link)) {
      link = super.pop();
    }
    return link;
  }
}
