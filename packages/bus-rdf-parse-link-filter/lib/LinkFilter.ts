import { ActionContextKey } from '@comunica/core';
import type { Algebra } from 'sparqlalgebrajs';

export interface ILinkFilter {
  uri: string;
  dataset: string;
  answers: (patterns: Algebra.Pattern[]) => boolean;
}

export abstract class LinkFilter implements ILinkFilter {
  public uri: string;
  public dataset: string;

  public constructor(args: ILinkFilterArgs) {
    this.uri = args.uri;
    this.dataset = args.dataset;
  }

  public abstract answers(patterns: Algebra.Pattern[]): boolean;
}

export interface ILinkFilterArgs {
  uri: string;
  dataset: string;
}

export const KeyLinkFilters = new ActionContextKey<Map<string, ILinkFilter>>(
  '@comunica/bus-rdf-parse:link-filters',
);
