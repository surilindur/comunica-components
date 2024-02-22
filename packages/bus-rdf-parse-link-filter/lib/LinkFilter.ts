import type { ILink } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { ActionContextKey } from '@comunica/core';
import type { Algebra } from 'sparqlalgebrajs';

export interface ILinkFilter {
  test: (link: ILink, patterns: Algebra.Pattern[]) => boolean;
}

export const KeyLinkFilters = new ActionContextKey<ILinkFilter[]>(
  '@comunica/bus-rdf-parse:link-filters',
);
