import type { ILink } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { ActionContextKey } from '@comunica/core';
import type { Algebra } from 'sparqlalgebrajs';

export interface ILinkFilter {
  test: (action: ILinkFilterAction) => boolean;
  run: (action: ILinkFilterAction) => boolean;
}

export interface ILinkFilterAction {
  link: ILink;
  patterns: Algebra.Pattern[];
}

export const KeyLinkFilters = new ActionContextKey<ILinkFilter[]>(
  '@comunica/bus-rdf-parse:link-filters',
);
