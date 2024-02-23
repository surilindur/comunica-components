import type {
  IActionRdfParseLinkFilter,
  IActorRdfParseLinkFilterArgs,
  IActorRdfParseLinkFilterOutput,
} from '@comunica/bus-rdf-parse-link-filter';
import { ActorRdfParseLinkFilter } from '@comunica/bus-rdf-parse-link-filter';
import type { IActorTest } from '@comunica/core';
import { LinkFilterBloom } from './LinkFilterBloom';

/**
 * A comunica Bloom RDF Link Filter Actor.
 */
export class ActorRdfParseLinkFilterBloom extends ActorRdfParseLinkFilter {
  public static readonly RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  public static readonly XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
  public static readonly XSD_BASE64 = 'http://www.w3.org/2001/XMLSchema#base64Binary';

  public static readonly MEM_PREFIX = 'http://semweb.mmlab.be/ns/membership#';
  public static readonly MEM_BLOOMFILTER = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}BloomFilter`;
  public static readonly MEM_HASHFUNCTIONFNV = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}FowlerNollVo`;

  public static readonly MEM_SOURCECOLLECTION = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}sourceCollection`;
  public static readonly MEM_BINARYREPRESENTATION = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}binaryRepresentation`;
  public static readonly MEM_BITSIZE = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}bitSize`;
  public static readonly MEM_HASHSIZE = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}hashSize`;
  public static readonly MEM_PROJECTEDPROPERTY = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}projectedProperty`;
  public static readonly MEM_PROJECTEDRESOURCE = `${ActorRdfParseLinkFilterBloom.MEM_PREFIX}projectedResource`;

  public constructor(args: IActorRdfParseLinkFilterArgs) {
    super(args);
  }

  public async test(action: IActionRdfParseLinkFilter): Promise<IActorTest> {
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.RDF_TYPE &&
      quad.object.value === ActorRdfParseLinkFilterBloom.MEM_BLOOMFILTER)) {
      throw new Error(`${this.name} can only parse membership filters with type ${ActorRdfParseLinkFilterBloom.MEM_BLOOMFILTER}`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.RDF_TYPE &&
      quad.object.value === ActorRdfParseLinkFilterBloom.MEM_HASHFUNCTIONFNV)) {
      throw new Error(`${this.name} can only parse membership filters using the FNV hash function`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_PROJECTEDPROPERTY ||
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_PROJECTEDRESOURCE)) {
      throw new Error(`${this.name} needs a projectedProperty or projectedResource`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_BITSIZE &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseLinkFilterBloom.XSD_INTEGER)) {
      throw new Error(`${this.name} needs a bitSize property as integer`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_HASHSIZE &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseLinkFilterBloom.XSD_INTEGER)) {
      throw new Error(`${this.name} needs a hashSize property as integer`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_SOURCECOLLECTION &&
      quad.object.termType === 'NamedNode')) {
      throw new Error(`${this.name} needs a sourceCollection`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_BINARYREPRESENTATION &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseLinkFilterBloom.XSD_BASE64)) {
      throw new Error(`${this.name} needs a binaryRepresentation`);
    }
    return true;
  }

  public async run(action: IActionRdfParseLinkFilter): Promise<IActorRdfParseLinkFilterOutput> {
    const hashBits = Number.parseInt(action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_BITSIZE)!.object.value, 10);
    const hashCount = Number.parseInt(action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_HASHSIZE)!.object.value, 10);
    const dataset = action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_SOURCECOLLECTION)!.object.value;
    const property = action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_PROJECTEDPROPERTY ||
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_PROJECTEDRESOURCE)!.object.value;
    const buffer = Buffer.from(action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.MEM_BINARYREPRESENTATION)!.object.value, 'base64');
    return { filter: new LinkFilterBloom({ dataset, hashBits, hashCount, buffer, property }) };
  }
}
