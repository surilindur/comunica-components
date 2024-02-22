import type { ILinkFilter } from '@comunica/bus-rdf-parse-link-filter';
import type { ILink } from '@comunica/bus-rdf-resolve-hypermedia-links';
import { Bloem } from 'bloem';
import type { Algebra } from 'sparqlalgebrajs';

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

  public test(link: ILink, patterns: Algebra.Pattern[]): boolean {
    let acceptLink = false;
    if (link.url.startsWith(this.dataset)) {
      for (const pattern of patterns) {
        if (this.property) {
          acceptLink = pattern.predicate.termType === 'NamedNode' && pattern.predicate.value === this.property && (
            (pattern.subject.termType === 'NamedNode' && this.filter.has(Buffer.from(pattern.subject.value))) ||
            (pattern.object.termType === 'NamedNode' && this.filter.has(Buffer.from(pattern.object.value)))
          );
        }
        if (this.resource) {
          acceptLink = (
            pattern.subject.termType === 'NamedNode' && pattern.subject.value === this.resource && (
              (pattern.predicate.termType === 'NamedNode' && this.filter.has(Buffer.from(pattern.predicate.value))) ||
              (pattern.object.termType === 'NamedNode' && this.filter.has(Buffer.from(pattern.object.value)))
            )
          ) || (
            pattern.object.termType === 'NamedNode' && pattern.object.value === this.resource && (
              (pattern.predicate.termType === 'NamedNode' && this.filter.has(Buffer.from(pattern.predicate.value))) ||
              (pattern.subject.termType === 'NamedNode' && this.filter.has(Buffer.from(pattern.subject.value)))
            )
          );
        }
        if (acceptLink) {
          break;
        }
      }
    }
    return acceptLink;
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
