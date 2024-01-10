import type {
  MediatorRdfResolveHypermediaLinksQueue,
  IActionRdfResolveHypermediaLinksQueue,
  IActorRdfResolveHypermediaLinksQueueOutput,
} from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { ActorRdfResolveHypermediaLinksQueue } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import type { IActorArgs, IActorTest } from '@comunica/core';
import { ActionContextKey } from '@comunica/core';
import { LinkQueueMembershipFilter } from './LinkQueueMembershipFilter';

/**
   * A comunica Wrapper Limit Count RDF Resolve Hypermedia Links Queue Actor.
   */
export class ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter extends ActorRdfResolveHypermediaLinksQueue {
  private readonly mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  private readonly ignorePatterns?: string[];
  private readonly members: string[];

  public constructor(args: IActorRdfResolveHypermediaLinksQueueWrapperMembershipFilterArgs) {
    super(args);
    this.mediatorRdfResolveHypermediaLinksQueue = args.mediatorRdfResolveHypermediaLinksQueue;
    this.ignorePatterns = args.ignorePatterns;
    this.members = args.members;
  }

  public async test(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorTest> {
    if (action.context.get(KEY_CONTEXT_WRAPPED)) {
      throw new Error('Unable to wrap one link queues multiple times');
    }
    return true;
  }

  public async run(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorRdfResolveHypermediaLinksQueueOutput> {
    const context = action.context.set(KEY_CONTEXT_WRAPPED, true);
    const { linkQueue } = await this.mediatorRdfResolveHypermediaLinksQueue.mediate({ ...action, context });
    return {
      linkQueue: new LinkQueueMembershipFilter(
        linkQueue,
        context,
        this.members,
        this.ignorePatterns,
      ),
    };
  }
}

export interface IActorRdfResolveHypermediaLinksQueueWrapperMembershipFilterArgs
  extends IActorArgs<IActionRdfResolveHypermediaLinksQueue, IActorTest, IActorRdfResolveHypermediaLinksQueueOutput> {
  /**
   * The hypermedia links queue mediator
   */
  mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  /**
   * The RegExp patterns that should be used to ignore filtering when the incoming or outgoing URI matches one of them
   */
  ignorePatterns?: string[];
  /**
   * Limit the targets of filters to consider, from quad members { s, p, o, g, spog }
   */
  members: string[];
}

export const KEY_CONTEXT_WRAPPED = new ActionContextKey<boolean>(
  '@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-membership-filter:wrapped',
);
