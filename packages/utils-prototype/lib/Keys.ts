import { ActionContextKey } from '@comunica/core';
import type { LinkFilter } from './LinkFilter';

/**
 * When adding entries to this file, also add a shortcut for them in the contextKeyShortcuts TSDoc comment in
 * ActorIniQueryBase in @comunica/actor-init-query if it makes sense to use this entry externally.
 * Also, add this shortcut to IQueryContextCommon in @comunica/types.
 */

export const KeysPrototype = {
  /**
   * Context entry containing the link filters applied on link queues within the context scope.
   * Setting this entry too high in the context hierarchy could result in too much being filtered out.
   */
  linkFilters: new ActionContextKey<LinkFilter[]>(
    '@comunica/bus-rdf-resolve-hypermedia-links:linkFilters',
  ),
};
