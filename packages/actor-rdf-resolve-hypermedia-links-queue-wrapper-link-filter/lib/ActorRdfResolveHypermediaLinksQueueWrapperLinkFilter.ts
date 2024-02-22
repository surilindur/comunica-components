import { KeyLinkFilters, type ILinkFilter } from '@comunica/bus-rdf-parse-link-filter';
import {
  type ILink,
  ActorRdfResolveHypermediaLinksQueue,
  type MediatorRdfResolveHypermediaLinksQueue,
  type IActionRdfResolveHypermediaLinksQueue,
  type IActorRdfResolveHypermediaLinksQueueOutput,
} from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContextKey, type IActorArgs, type IActorTest } from '@comunica/core';
import { type Algebra, Util } from 'sparqlalgebrajs';
import { LinkQueueWrapperFilter } from './LinkQueueWrapperLinkFilter';

/**
   * A comunica Wrapper Limit Count RDF Resolve Hypermedia Links Queue Actor.
   */
export class ActorRdfResolveHypermediaLinksQueueWrapperLinkFilter extends ActorRdfResolveHypermediaLinksQueue {
  protected readonly mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;

  public constructor(args: IActorRdfResolveHypermediaLinksQueueWrapperMembershipFilterArgs) {
    super(args);
    this.mediatorRdfResolveHypermediaLinksQueue = args.mediatorRdfResolveHypermediaLinksQueue;
  }

  public async test(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorTest> {
    if (action.context.get(KeyLinkFilters)) {
      throw new Error(`${this.name} requires link filters to be stored in the context`);
    }
    if (action.context.get(KEY_CONTEXT_WRAPPED)) {
      throw new Error(`${this.name} can only wrap a link queue once`);
    }
    return true;
  }

  public async run(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorRdfResolveHypermediaLinksQueueOutput> {
    const subContext = action.context.set(KEY_CONTEXT_WRAPPED, true);
    const { linkQueue } = await this.mediatorRdfResolveHypermediaLinksQueue.mediate({ ...action, context: subContext });
    const queryOperation = action.context.getSafe<Algebra.Operation>(KeysInitQuery.query);
    const queryPatterns = this.extractAlgebraPatternsFromQuery(queryOperation);
    const linkFilters = action.context.getSafe<ILinkFilter[]>(KeyLinkFilters);
    return {
      linkQueue: new LinkQueueWrapperFilter(
        linkQueue,
        (link: ILink): boolean => linkFilters.some(filter => filter.test(link, queryPatterns)),
      ),
    };
  }

  protected extractAlgebraPatternsFromQuery(operation: Algebra.Operation): Algebra.Pattern[] {
    const patterns: Algebra.Pattern[] = [];
    Util.recurseOperation(operation, {
      pattern(pattern) {
        patterns.push(pattern);
        return false;
      },
    });
    return patterns;
  }
}

export interface IActorRdfResolveHypermediaLinksQueueWrapperMembershipFilterArgs
  extends IActorArgs<IActionRdfResolveHypermediaLinksQueue, IActorTest, IActorRdfResolveHypermediaLinksQueueOutput> {
  /**
   * The hypermedia links queue mediator
   */
  mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
}

const KEY_CONTEXT_WRAPPED = new ActionContextKey<boolean>(
  '@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-filter:wrapped',
);
