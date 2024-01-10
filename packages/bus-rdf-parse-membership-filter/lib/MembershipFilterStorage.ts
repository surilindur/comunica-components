import type { IMembershipFilter } from './MembershipFilter';

export interface IMembershipFilterStorage {
  find: (uri: string) => IMembershipFilter[];
  findForMembers: (uri: string, elements: string[]) => IMembershipFilter[];
  add: (uriPattern: RegExp, filter: IMembershipFilter) => void;
  count: (uri: string | undefined) => number;
  remove: (uri: string) => number;
  clear: () => number;
}

export class MembershipFilterStorage implements IMembershipFilterStorage {
  private readonly filters: Map<RegExp, IMembershipFilter>;

  public constructor(args: IMembershipFilterStorageArgs) {
    this.filters = new Map();
  }

  public count(uri?: string): number {
    if (uri) {
      return [ ...this.filters.keys() ].filter(exp => exp.test(uri)).length;
    }
    return this.filters.size;
  }

  public remove(uri: string): number {
    let count = 0;
    for (const exp of this.filters.keys()) {
      if (exp.test(uri)) {
        this.filters.delete(exp);
        count++;
      }
    }
    return count;
  }

  public clear(): number {
    const cleared = this.filters.size;
    this.filters.clear();
    return cleared;
  }

  public find(uri: string): IMembershipFilter[] {
    const matchingFilters: IMembershipFilter[] = [];
    for (const [ exp, filter ] of this.filters) {
      if (exp.test(uri)) {
        matchingFilters.push(filter);
      }
    }
    return matchingFilters;
  }

  public findForMembers(uri: string, elements: string[]): IMembershipFilter[] {
    return this.find(uri).filter(filter => elements.includes(filter.member));
  }

  public add(uriPattern: RegExp, filter: IMembershipFilter): void {
    this.filters.set(uriPattern, filter);
  }
}

export interface IMembershipFilterStorageArgs {}
