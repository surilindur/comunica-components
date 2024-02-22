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
  protected readonly ignorePatterns: RegExp[] | undefined;

  public constructor(args: IActorRdfResolveHypermediaLinksQueueWrapperLinkFilterArgs) {
    super(args);
    this.mediatorRdfResolveHypermediaLinksQueue = args.mediatorRdfResolveHypermediaLinksQueue;
    this.ignorePatterns = args.ignorePatterns?.map(pattern => new RegExp(pattern, 'u'));
  }

  public async test(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorTest> {
    if (!action.context.get(KeyLinkFilters)) {
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
    const operation = action.context.getSafe<Algebra.Operation>(KeysInitQuery.query);
    const patterns = this.extractAlgebraPatternsFromQuery(operation);
    const filters = action.context.getSafe<ILinkFilter[]>(KeyLinkFilters);
    const accept = (link: ILink): boolean => {
      if (!this.ignorePatterns?.some(pattern => pattern.test(link.url))) {
        const applicableFilters = filters.filter(filter => filter.test({ link, patterns }));
        if (applicableFilters.length > 0) {
          return applicableFilters.some(filter => filter.test({ link, patterns }));
        }
      }
      return true;
    };
    return { linkQueue: new LinkQueueWrapperFilter(linkQueue, accept) };
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

export interface IActorRdfResolveHypermediaLinksQueueWrapperLinkFilterArgs
  extends IActorArgs<IActionRdfResolveHypermediaLinksQueue, IActorTest, IActorRdfResolveHypermediaLinksQueueOutput> {
  /**
   * The hypermedia links queue mediator
   */
  mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  /**
   * Regular expression used to ignore links when filtering.
   */
  ignorePatterns?: string[];
}

const KEY_CONTEXT_WRAPPED = new ActionContextKey<boolean>(
  '@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-filter:wrapped',
);
