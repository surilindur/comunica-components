import { type IMembershipFilterStorage, KeyMembershipFilterStorage } from '@comunica/bus-rdf-parse-membership-filter';
import {
  ActorRdfResolveHypermediaLinksQueue,
  type MediatorRdfResolveHypermediaLinksQueue,
  type IActionRdfResolveHypermediaLinksQueue,
  type IActorRdfResolveHypermediaLinksQueueOutput,
} from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContextKey, type IActorArgs, type IActorTest } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { Util } from 'sparqlalgebrajs';
import { LinkQueueMembershipFilter } from './LinkQueueMembershipFilter';

/**
   * A comunica Wrapper Limit Count RDF Resolve Hypermedia Links Queue Actor.
   */
export class ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter extends ActorRdfResolveHypermediaLinksQueue {
  protected readonly mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  protected readonly ignorePatterns: RegExp[] | undefined;
  protected readonly members: Set<string>;

  public static readonly RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly RDF_SUBJECT = `${ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_PREFIX}subject`;
  public static readonly RDF_PREDICATE = `${ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_PREFIX}predicate`;
  public static readonly RDF_OBJECT = `${ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_PREFIX}object`;

  public constructor(args: IActorRdfResolveHypermediaLinksQueueWrapperMembershipFilterArgs) {
    super(args);
    this.mediatorRdfResolveHypermediaLinksQueue = args.mediatorRdfResolveHypermediaLinksQueue;
    this.ignorePatterns = args.ignorePatterns?.map(exp => new RegExp(exp, 'u'));
    this.members = new Set([
      ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_SUBJECT,
      ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_PREDICATE,
      ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_OBJECT,
    ].filter(mem => args.members.includes(mem)));
  }

  public async test(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorTest> {
    if (action.context.get(KEY_CONTEXT_WRAPPED)) {
      throw new Error(`${this.name} can only wrap a link queue once`);
    }
    if (!action.context.has(KeyMembershipFilterStorage)) {
      throw new Error(`${this.name} requires ${KeyMembershipFilterStorage.name} in context`);
    }
    if (this.members.size === 0) {
      throw new Error(`${this.name} has not been configured for any triple members`);
    }
    return true;
  }

  public async run(action: IActionRdfResolveHypermediaLinksQueue): Promise<IActorRdfResolveHypermediaLinksQueueOutput> {
    const subContext = action.context.set(KEY_CONTEXT_WRAPPED, true);
    const { linkQueue } = await this.mediatorRdfResolveHypermediaLinksQueue.mediate({ ...action, context: subContext });
    const queryTerms = this.extractQueryTermsFromContext(action);
    const membershipFilterStorage = action.context.getSafe<IMembershipFilterStorage>(KeyMembershipFilterStorage);
    return {
      linkQueue: new LinkQueueMembershipFilter({
        linkQueue,
        queryTerms,
        filterStorage: membershipFilterStorage,
        ignorePatterns: this.ignorePatterns,
      }),
    };
  }

  protected extractQueryTermsFromContext(action: IActionRdfResolveHypermediaLinksQueue): Map<string, RDF.Term[]> {
    const terms: Map<string, RDF.Term[]> = new Map();

    const registerNode = (member: string, term: RDF.Term): void => {
      if (this.members.has(member)) {
        let members = terms.get(member);
        if (!members) {
          members = [];
          terms.set(member, members);
        }
        if (!members.some(mem => mem.equals(term))) {
          members.push(term);
        }
      }
    };

    // TODO: Check if there are any other elements in the parsed query that should be extracted
    Util.recurseOperation(action.context.getSafe(KeysInitQuery.query), {
      pattern(pattern) {
        if (pattern.subject.termType === 'NamedNode') {
          registerNode(ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_SUBJECT, pattern.subject);
        }
        if (pattern.predicate.termType === 'NamedNode') {
          registerNode(ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_PREDICATE, pattern.predicate);
        }
        if (pattern.object.termType === 'NamedNode') {
          registerNode(ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_OBJECT, pattern.object);
        }
        return false;
      },
      link(link) {
        registerNode(ActorRdfResolveHypermediaLinksQueueWrapperMembershipFilter.RDF_PREDICATE, link.iri);
        return false;
      },
    });

    return terms;
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
   * The link queue filter will only consider filters for these triple members.
   */
  members: string[];
}

export const KEY_CONTEXT_WRAPPED = new ActionContextKey<boolean>(
  '@comunica/actor-rdf-resolve-hypermedia-links-queue-wrapper-membership-filter:wrapped',
);
