import { keyLinkFilters, type ILinkFilter } from '@comunica/bus-rdf-parse-link-filter';
import {
  type ILink,
  ActorRdfResolveHypermediaLinksQueue,
  type MediatorRdfResolveHypermediaLinksQueue,
  type IActionRdfResolveHypermediaLinksQueue,
  type IActorRdfResolveHypermediaLinksQueueOutput,
} from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { ActionContextKey, type IActorArgs, type IActorTest } from '@comunica/core';
import { LinkQueueWrapperFilter } from './LinkQueueWrapperLinkFilter';

export class ActorRdfResolveHypermediaLinksQueueWrapperLinkFilter extends ActorRdfResolveHypermediaLinksQueue {
  protected readonly mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  protected readonly acceptPatterns: RegExp[] | undefined;
  protected readonly rejectPatterns: RegExp[] | undefined;
  protected readonly defaultAccept: boolean;

  public constructor(args: IActorRdfResolveHypermediaLinksQueueWrapperLinkFilterArgs) {
    super(args);
    this.mediatorRdfResolveHypermediaLinksQueue = args.mediatorRdfResolveHypermediaLinksQueue;
    this.acceptPatterns = args.acceptPatterns ? args.acceptPatterns.map(exp => new RegExp(exp, 'u')) : undefined;
    this.rejectPatterns = args.rejectPatterns ? args.rejectPatterns.map(exp => new RegExp(exp, 'u')) : undefined;
    this.defaultAccept = args.defaultAccept ?? false;
  }

  public async test(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorTest> {
    if (!action.context.get(keyLinkFilters)) {
      throw new Error(`${this.name} requires link filters to be stored in the context`);
    }
    if (action.context.has(keyLinkQueueWrapped)) {
      throw new Error(`${this.name} can only wrap a link queue once`);
    }
    return true;
  }

  public async run(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorRdfResolveHypermediaLinksQueueOutput> {
    // Ensure the queue is not wrapped twice
    const subContext = action.context.set(keyLinkQueueWrapped, true);

    // Create the to-be-wrapped queue via the mediator
    const { linkQueue } = await this.mediatorRdfResolveHypermediaLinksQueue.mediate({ ...action, context: subContext });

    // The filters list is acquired only once for performance reasons
    const filters = action.context.getSafe<ILinkFilter[]>(keyLinkFilters);

    // The function used to check whether a link is acceptable
    const accept = (link: ILink): boolean => {
      if (this.acceptPatterns?.some(regex => regex.test(link.url))) {
        return true;
      }
      if (this.rejectPatterns?.some(regex => regex.test(link.url))) {
        return false;
      }
      const filterResults = new Set(filters.map(filter => filter.test({ context: action.context, link })));
      if (filterResults.has(true)) {
        return true;
      }
      if (filterResults.has(false)) {
        return false;
      }
      return this.defaultAccept;
    };

    return { linkQueue: new LinkQueueWrapperFilter(linkQueue, accept) };
  }
}

export interface IActorRdfResolveHypermediaLinksQueueWrapperLinkFilterArgs extends IActorArgs<
  IActionRdfResolveHypermediaLinksQueue,
  IActorTest,
  IActorRdfResolveHypermediaLinksQueueOutput
> {
  /**
   * The hypermedia links queue mediator.
   */
  mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  /**
   * Link patterns that should always be accepted, regardless of the filter decisions.
   */
  acceptPatterns?: string[];
  /**
   * Link patterns that should always be rejected, regardless of the filter decisions.
   */
  rejectPatterns?: string[];
  /**
   * Whether a link should be accepted when none of the filters make a decision.
   * Setting this to false will result in no links being followed until a pattern is added.
   */
  defaultAccept?: boolean;
}

const keyLinkQueueWrapped = new ActionContextKey<boolean>(
  '@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-filter:wrapped',
);
