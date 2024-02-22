import type { ILinkFilter, ILinkFilterAction } from '@comunica/bus-rdf-parse-link-filter';
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
    return action.link.url.startsWith(this.dataset);
  }

  public run(action: ILinkFilterAction): boolean {
    let acceptLink = false;
    if (action.link.url.startsWith(this.dataset)) {
      for (const pattern of action.patterns) {
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
