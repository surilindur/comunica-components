import type { ILinkFilter, ILinkFilterAction } from '@comunica/bus-rdf-parse-link-filter';
import type * as RDF from '@rdfjs/types';
import { Bloem } from 'bloem';

/**
 * An approximate membership filter that is backed by a Bloom filter.
 */
export class LinkFilterBloom implements ILinkFilter {
  private readonly filter: Bloem;
  private readonly dataset: string;
  private readonly property?: string;
  private readonly resource?: string;

  public constructor(args: ILinkFilterBloomArgs) {
    this.filter = new Bloem(args.hashBits, args.hashCount, args.buffer);
    this.dataset = args.dataset;
    if (!args.property && !args.resource) {
      throw new Error('Bloom link filter requires a property or resource to filter by');
    }
    this.property = args.property;
    this.resource = args.resource;
  }

  public test(action: ILinkFilterAction): boolean {
    return action.link.url.startsWith(this.dataset) && action.patterns.some(pattern =>
      (this.property && pattern.predicate.termType === 'NamedNode' && pattern.predicate.value === this.property) ||
      (this.resource && (
        (pattern.subject.termType === 'NamedNode' && pattern.subject.value === this.resource) ||
        (pattern.object.termType === 'NamedNode' && pattern.object.value === this.resource)
      )));
  }

  public run(action: ILinkFilterAction): boolean {
    for (const pattern of action.patterns) {
      if (this.property &&
        pattern.predicate.termType === 'NamedNode' &&
        pattern.predicate.value === this.property &&
        (this.filterHasTerm(pattern.subject) || this.filterHasTerm(pattern.object))
      ) {
        /*
        console.log(`Accept <${action.link.url}>`);
        console.log(`\tFilter for <${this.dataset}>`);
        console.log(`\tContains one of: ${pattern.subject.value}, ${pattern.object.value}`);
        */
        return true;
      }
      if (this.resource) {
        if (pattern.subject.termType === 'NamedNode' &&
          pattern.subject.value === this.resource &&
          (this.filterHasTerm(pattern.predicate) || this.filterHasTerm(pattern.object))
        ) {
          /*
          console.log(`Accept <${action.link.url}>`);
          console.log(`\tFilter for <${this.dataset}>`);
          console.log(`\tContains one of: ${pattern.predicate.value}, ${pattern.object.value}`);
          */
          return true;
        }
        if (pattern.object.termType === 'NamedNode' &&
          pattern.object.value === this.resource &&
          (this.filterHasTerm(pattern.predicate) || this.filterHasTerm(pattern.subject))
        ) {
          /*
          console.log(`Accept <${action.link.url}>`);
          console.log(`\tFilter for <${this.dataset}>`);
          console.log(`\tContains one of: ${pattern.predicate.value}, ${pattern.subject.value}`);
          */
          return true;
        }
      }
    }
    /*
    console.log(`Reject <${action.link.url}>`);
    */
    return false;
  }

  /**
   * Test whether the filter includes the term or cannot include it at all.
   * @param term The RDF term to test for.
   * @returns Whether the term is contained in the filter OR the term is of type that cannot be in it.
   */
  protected filterHasTerm(term: RDF.Term): boolean {
    return term.termType === 'Variable' || (term.termType === 'NamedNode' && this.filter.has(Buffer.from(term.value)));
  }
}

export interface ILinkFilterBloomArgs {
  dataset: string;
  property?: string;
  resource?: string;
  hashBits: number;
  hashCount: number;
  buffer: Buffer;
}
