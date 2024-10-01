import type { ILink } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { ActionContextKey } from '@comunica/core';
import type { IActionContext } from '@comunica/types';

export abstract class LinkFilter implements ILinkFilter {
  public abstract test(input: ILinkFilterTestInput): boolean | undefined;
}

export interface ILinkFilter {
  test: (input: ILinkFilterTestInput) => boolean | undefined;
}

export interface ILinkFilterTestInput {
  context: IActionContext;
  link: ILink;
}

export const keyLinkFilters = new ActionContextKey<ILinkFilter[]>('@comunica/bus-rdf-parse:link-filters');
