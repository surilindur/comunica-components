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
import { DataFactory } from 'rdf-data-factory';
import { type Algebra, Util, Factory } from 'sparqlalgebrajs';
import { LinkQueueWrapperFilter } from './LinkQueueWrapperLinkFilter';

const AF = new Factory();
const DF = new DataFactory();
const VAR = DF.variable('__comunica:pp_var');

/**
  * A comunica Wrapper Limit Count RDF Resolve Hypermedia Links Queue Actor.
  */
export class ActorRdfResolveHypermediaLinksQueueWrapperLinkFilter extends ActorRdfResolveHypermediaLinksQueue {
  protected readonly mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  protected readonly ignorePattern: RegExp | undefined;
  protected readonly alwaysReject: RegExp | undefined;

  public constructor(args: IActorRdfResolveHypermediaLinksQueueWrapperLinkFilterArgs) {
    super(args);
    this.mediatorRdfResolveHypermediaLinksQueue = args.mediatorRdfResolveHypermediaLinksQueue;
    this.ignorePattern = args.ignorePattern ? new RegExp(args.ignorePattern, 'u') : undefined;
    this.alwaysReject = args.alwaysReject ? new RegExp(args.alwaysReject, 'u') : undefined;
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
    const patterns = ActorRdfResolveHypermediaLinksQueueWrapperLinkFilter.extractOperationPatterns(operation);
    const filters = action.context.getSafe<Map<string, ILinkFilter>>(KeyLinkFilters);
    const accept = (link: ILink): boolean => {
      let acceptLink = true;
      let acceptingFilter: ILinkFilter | undefined;
      if (!this.ignorePattern?.test(link.url)) {
        if (this.alwaysReject?.test(link.url)) {
          acceptLink = false;
        } else {
          let foundApplicableFilters = false;
          for (const filter of filters.values()) {
            if (link.url.startsWith(filter.dataset)) {
              foundApplicableFilters = true;
              if (filter.answers(patterns)) {
                acceptingFilter = filter;
                break;
              }
            }
          }
          acceptLink = !foundApplicableFilters || acceptingFilter !== undefined;
        }
      }
      // Debug: console.log(`${acceptLink ? 'Accept' : 'Reject'} <${link.url}> filter ${acceptingFilter?.uri}`);
      return acceptLink;
    };
    return { linkQueue: new LinkQueueWrapperFilter(linkQueue, accept) };
  }

  /**
   * Extracts patterns from the parsed SPARQL query.
   * Adapted from a similar method in @comunica/actor-extract-links-quad-pattern-query
   * @param operation The parsed SPARQL query
   * @returns The list of triple patterns contained within the query
   */
  public static extractOperationPatterns(operation: Algebra.Operation): Algebra.Pattern[] {
    const patterns: Algebra.Pattern[] = [];
    Util.recurseOperation(operation, {
      pattern(pattern: Algebra.Pattern) {
        patterns.push(pattern);
        return false;
      },
      path(path: Algebra.Path) {
        Util.recurseOperation(path, {
          link(link: Algebra.Link) {
            patterns.push(AF.createPattern(VAR, link.iri, VAR, path.graph));
            return false;
          },
          nps(nps: Algebra.Nps) {
            for (const iri of nps.iris) {
              patterns.push(AF.createPattern(VAR, iri, VAR, path.graph));
            }
            return false;
          },
        });
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
   * Regular expressions used to ignore links when filtering.
   */
  ignorePattern?: string;
  /**
   * Regular expressions used to always reject links.
   */
  alwaysReject?: string;
}

const KEY_CONTEXT_WRAPPED = new ActionContextKey<boolean>(
  '@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-filter:wrapped',
);
