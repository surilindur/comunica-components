import type { IMembershipFilter } from '@comunica/bus-rdf-parse-membership-filter';
import type * as RDF from '@rdfjs/types';
import { Bloem } from 'bloem';
import { termToString } from 'rdf-string';

/**
 * An approximate membership filter that is backed by a Bloom filter.
 */
export class MembershipFilterBloom implements IMembershipFilter {
  private readonly bloomFilter: Bloem;
  public readonly members: string[];

  public constructor(bits: number, hashes: number, filter: Buffer, members: string[]) {
    this.bloomFilter = new Bloem(bits, hashes, filter);
    this.members = members;
  }

  public test(term: RDF.Term): boolean {
    const stringTerm = termToString(term);
    return Boolean(stringTerm) && this.bloomFilter.has(Buffer.from(stringTerm));
  }
}
