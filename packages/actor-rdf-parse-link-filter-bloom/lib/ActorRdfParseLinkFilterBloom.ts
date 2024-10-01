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
  public static readonly rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  public static readonly xsdInteger = 'http://www.w3.org/2001/XMLSchema#integer';
  public static readonly xsdBase64 = 'http://www.w3.org/2001/XMLSchema#base64Binary';

  public static readonly mem = 'http://semweb.mmlab.be/ns/membership#';
  public static readonly memBloomFilter = `${ActorRdfParseLinkFilterBloom.mem}BloomFilter`;
  public static readonly memFowlerNollVo = `${ActorRdfParseLinkFilterBloom.mem}FowlerNollVo`;

  public static readonly memSourceCollection = `${ActorRdfParseLinkFilterBloom.mem}sourceCollection`;
  public static readonly memBinaryRepresentation = `${ActorRdfParseLinkFilterBloom.mem}binaryRepresentation`;
  public static readonly memBitSize = `${ActorRdfParseLinkFilterBloom.mem}bitSize`;
  public static readonly memHashSize = `${ActorRdfParseLinkFilterBloom.mem}hashSize`;
  public static readonly memProjectedProperty = `${ActorRdfParseLinkFilterBloom.mem}projectedProperty`;
  public static readonly memProjectedResource = `${ActorRdfParseLinkFilterBloom.mem}projectedResource`;

  public constructor(args: IActorRdfParseLinkFilterArgs) {
    super(args);
  }

  public async test(action: IActionRdfParseLinkFilter): Promise<IActorTest> {
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.rdfType &&
      quad.object.value === ActorRdfParseLinkFilterBloom.memBloomFilter)) {
      throw new Error(`${this.name} can only parse membership filters with type ${ActorRdfParseLinkFilterBloom.memBloomFilter}`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.rdfType &&
      quad.object.value === ActorRdfParseLinkFilterBloom.memFowlerNollVo)) {
      throw new Error(`${this.name} can only parse membership filters using the FNV hash function`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memProjectedProperty ||
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memProjectedResource)) {
      throw new Error(`${this.name} needs a projectedProperty or projectedResource`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memBitSize &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseLinkFilterBloom.xsdInteger)) {
      throw new Error(`${this.name} needs a bitSize property as integer`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memHashSize &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseLinkFilterBloom.xsdInteger)) {
      throw new Error(`${this.name} needs a hashSize property as integer`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memSourceCollection &&
      quad.object.termType === 'NamedNode')) {
      throw new Error(`${this.name} needs a sourceCollection`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memBinaryRepresentation &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseLinkFilterBloom.xsdBase64)) {
      throw new Error(`${this.name} needs a binaryRepresentation`);
    }
    return true;
  }

  public async run(action: IActionRdfParseLinkFilter): Promise<IActorRdfParseLinkFilterOutput> {
    const hashBits = Number.parseInt(action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memBitSize)!.object.value, 10);
    const hashCount = Number.parseInt(action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memHashSize)!.object.value, 10);
    const uriPrefix = action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memSourceCollection)!.object.value;
    const projectedProperty = action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memProjectedProperty)?.object.value;
    const projectedResource = action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memProjectedResource)?.object.value;
    const buffer = Buffer.from(action.data.find(quad =>
      quad.predicate.value === ActorRdfParseLinkFilterBloom.memBinaryRepresentation)!.object.value, 'base64');
    return { filters: [ new LinkFilterBloom({
      uriRegex: new RegExp(`^${uriPrefix}`, 'u'),
      hashBits,
      hashCount,
      buffer,
      projectedProperty,
      projectedResource,
    }) ]};
  }
}
