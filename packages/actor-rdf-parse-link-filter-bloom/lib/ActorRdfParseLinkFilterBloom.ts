import type {
  IActionRdfParseMembershipFilter,
  IActorRdfParseMembershipFilterArgs,
  IActorRdfParseMembershipFilterOutput,
} from '@comunica/bus-rdf-parse-link-filter';
import { ActorRdfParseMembershipFilter } from '@comunica/bus-rdf-parse-link-filter';
import type { IActorTest } from '@comunica/core';
import { MembershipFilterBloom } from './MembershipFilterBloom';

/**
 * A comunica Bloom RDF Membership Filter Actor.
 */
export class ActorRdfParseMembershipFilterBloom extends ActorRdfParseMembershipFilter {
  public static readonly RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  public static readonly XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';
  public static readonly XSD_BASE64 = 'http://www.w3.org/2001/XMLSchema#base64Binary';

  public static readonly MEM_PREFIX = 'http://semweb.mmlab.be/ns/membership#';
  public static readonly MEM_BLOOMFILTER = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}BloomFilter`;
  public static readonly MEM_HASHFUNCTIONFNV = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}FowlerNollVo`;

  public static readonly MEM_SOURCECOLLECTION = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}sourceCollection`;
  public static readonly MEM_BINARYREPRESENTATION = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}binaryRepresentation`;
  public static readonly MEM_BITSIZE = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}bitSize`;
  public static readonly MEM_HASHSIZE = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}hashSize`;
  public static readonly MEM_PROJECTEDPROPERTY = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}projectedProperty`;
  public static readonly MEM_PROJECTEDRESOURCE = `${ActorRdfParseMembershipFilterBloom.MEM_PREFIX}projectedResource`;

  public constructor(args: IActorRdfParseMembershipFilterArgs) {
    super(args);
  }

  public async test(action: IActionRdfParseMembershipFilter): Promise<IActorTest> {
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.RDF_TYPE &&
      quad.object.value === ActorRdfParseMembershipFilterBloom.MEM_BLOOMFILTER)) {
      throw new Error(`${this.name} can only parse membership filters with type ${ActorRdfParseMembershipFilterBloom.MEM_BLOOMFILTER}`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.RDF_TYPE &&
      quad.object.value === ActorRdfParseMembershipFilterBloom.MEM_HASHFUNCTIONFNV)) {
      throw new Error(`${this.name} can only parse membership filters using the FNV hash function`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_PROJECTEDPROPERTY ||
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_PROJECTEDRESOURCE)) {
      throw new Error(`${this.name} needs a projectedProperty or projectedResource`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_BITSIZE &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseMembershipFilterBloom.XSD_INTEGER)) {
      throw new Error(`${this.name} needs a bitSize property as integer`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_HASHSIZE &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseMembershipFilterBloom.XSD_INTEGER)) {
      throw new Error(`${this.name} needs a hashSize property as integer`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_SOURCECOLLECTION &&
      quad.object.termType === 'NamedNode')) {
      throw new Error(`${this.name} needs a sourceCollection`);
    }
    if (!action.data.some(quad =>
      quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_BINARYREPRESENTATION &&
      quad.object.termType === 'Literal' &&
      quad.object.datatype.value === ActorRdfParseMembershipFilterBloom.XSD_BASE64)) {
      throw new Error(`${this.name} needs a binaryRepresentation`);
    }
    return true;
  }

  public async run(action: IActionRdfParseMembershipFilter): Promise<IActorRdfParseMembershipFilterOutput> {
    const hashBits = Number.parseInt(action.data.find(
      quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_BITSIZE,
    )!.object.value, 10);
    const hashCount = Number.parseInt(action.data.find(
      quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_HASHSIZE,
    )!.object.value, 10);
    const dataset = action.data.find(
      quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_SOURCECOLLECTION,
    )!.object.value;
    const property = action.data.find(
      quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_PROJECTEDPROPERTY,
    )!.object.value;
    const buffer = Buffer.from(action.data.find(
      quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_BINARYREPRESENTATION,
    )!.object.value, 'base64');
    return { filter: new MembershipFilterBloom({ dataset, hashBits, hashCount, buffer, property }) };
  }
}
