import { ActionContextKey } from '@comunica/core';
import type { IMembershipFilter } from './MembershipFilter';

export interface IMembershipFilterStorage {
  get: (uri: string, member: string) => IMembershipFilter | undefined;
  add: (uriPattern: RegExp, filter: IMembershipFilter) => void;
}

export class MembershipFilterStorage implements IMembershipFilterStorage {
  private readonly filters: Map<RegExp, IMembershipFilter>;

  public constructor() {
    this.filters = new Map();
  }

  public get(uri: string, member?: string): IMembershipFilter | undefined {
    for (const [ exp, filter ] of this.filters) {
      if (exp.test(uri) && (!member || filter.members.every(mem => member === mem))) {
        return filter;
      }
    }
  }

  public add(uriPattern: RegExp, filter: IMembershipFilter): void {
    this.filters.set(uriPattern, filter);
  }
}

export const KeyMembershipFilterStorage = new ActionContextKey<IMembershipFilterStorage>(
  '@comunica/bus-rdf-parse:membership-filter-storage',
);
