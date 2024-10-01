import type { ILinkQueue, ILink } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { LinkQueueWrapper } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';

type Acceptable = (link: ILink) => boolean;

/**
 * Minimalistic link queue that uses an acceptable function to filter out link when popped.
 * The queue will only do the acceptance check once per link, at the time of pop.
 */
export class LinkQueueWrapperFilter extends LinkQueueWrapper {
  protected readonly acceptable: Acceptable;

  public constructor(linkQueue: ILinkQueue, acceptable: Acceptable) {
    super(linkQueue);
    this.acceptable = acceptable;
  }

  public pop(): ILink | undefined {
    let link = super.pop();
    while (link && !this.acceptable(link)) {
      link = super.pop();
    }
    return link;
  }
}
