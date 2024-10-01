import { LinkFilter } from '@comunica/bus-rdf-parse-link-filter';
import type { ILinkFilterTestInput } from '@comunica/bus-rdf-parse-link-filter';
import type * as RDF from '@rdfjs/types';
import { Bloem } from 'bloem';
import type { Algebra } from 'sparqlalgebrajs';

/**
 * An approximate membership filter that is backed by a Bloom filter.
 */
export class LinkFilterBloom extends LinkFilter {
  private readonly uriRegex: RegExp;
  private readonly filter: Bloem;
  private readonly projectedProperty?: string;
  private readonly projectedResource?: string;

  public constructor(args: ILinkFilterBloomArgs) {
    super();
    this.uriRegex = args.uriRegex;
    this.filter = new Bloem(args.hashBits, args.hashCount, args.buffer);
    this.projectedProperty = args.projectedProperty;
    this.projectedResource = args.projectedResource;
    if (!this.projectedProperty && !this.projectedResource) {
      throw new Error('Bloom link filter requires a property or resource to filter by');
    }
  }

  public test(input: ILinkFilterTestInput): boolean | undefined {
    if (this.uriRegex.test(input.link.url)) {
      return true;
    }
  }

  public answers(patterns: Algebra.Pattern[]): boolean {
    for (const pattern of patterns) {
      if (this.projectedProperty &&
        pattern.predicate.termType === 'NamedNode' &&
        pattern.predicate.value === this.projectedProperty &&
        (this.filterHasTerm(pattern.subject) || this.filterHasTerm(pattern.object))
      ) {
        return true;
      }
      if (this.projectedResource) {
        if (pattern.subject.termType === 'NamedNode' &&
          pattern.subject.value === this.projectedResource &&
          (this.filterHasTerm(pattern.predicate) || this.filterHasTerm(pattern.object))
        ) {
          return true;
        }
        if (pattern.object.termType === 'NamedNode' &&
          pattern.object.value === this.projectedResource &&
          (this.filterHasTerm(pattern.predicate) || this.filterHasTerm(pattern.subject))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Test whether the filter includes the term or cannot include it at all.
   * @param term The RDF term to test for.
   * @returns Whether the term is contained in the filter OR the term is of type that cannot be in it.
   */
  protected filterHasTerm(term: RDF.Term): boolean {
    return term.termType !== 'NamedNode' || this.filter.has(Buffer.from(term.value));
  }
}

export interface ILinkFilterBloomArgs {
  uriRegex: RegExp;
  buffer: Buffer;
  hashBits: number;
  hashCount: number;
  projectedProperty?: string;
  projectedResource?: string;
}
