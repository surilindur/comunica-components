import type { IActionRdfParseMembershipFilter,
  IActorRdfParseMembershipFilterArgs,
  IActorRdfParseMembershipFilterOutput } from '@comunica/bus-rdf-parse-membership-filter';
import { ActorRdfParseMembershipFilter } from '@comunica/bus-rdf-parse-membership-filter';
import type { IActorTest } from '@comunica/core';
import { MembershipFilterBloom } from './MembershipFilterBloom';

/**
 * A comunica Bloom RDF Membership Filter Actor.
 */
export class ActorRdfParseMembershipFilterBloom extends ActorRdfParseMembershipFilter {
  public static readonly MEM: string = 'http://semweb.mmlab.be/ns/membership#';
  public static readonly MEM_BLOOMFILTER: string = `${ActorRdfParseMembershipFilterBloom.MEM}BloomFilter`;
  public static readonly MEM_COLLECTION: string = `${ActorRdfParseMembershipFilterBloom.MEM}sourceCollection`;
  public static readonly MEM_REPRESENTATION: string = `${ActorRdfParseMembershipFilterBloom.MEM}binaryRepresentation`;
  public static readonly MEM_BITSIZE: string = `${ActorRdfParseMembershipFilterBloom.MEM}bitSize`;
  public static readonly MEM_HASHSIZE: string = `${ActorRdfParseMembershipFilterBloom.MEM}hashSize`;
  public static readonly MEM_PROJECTED_PROPERTY: string = `${ActorRdfParseMembershipFilterBloom.MEM}projectedProperty`;

  public constructor(args: IActorRdfParseMembershipFilterArgs) {
    super(args);
  }

  public async test(action: IActionRdfParseMembershipFilter): Promise<IActorTest> {
    if (!action.types.includes(ActorRdfParseMembershipFilterBloom.MEM_BLOOMFILTER)) {
      throw new Error(`${this.name} can only parse membership filters with type ${ActorRdfParseMembershipFilterBloom.MEM_BLOOMFILTER}: ${JSON.stringify(action)}`);
    }
    if (!action.data.some(quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_COLLECTION)) {
      throw new Error(`Missing membership filter collection param in a bloom filter action: ${JSON.stringify(action)}`);
    }
    if (!action.data.some(quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_REPRESENTATION)) {
      throw new Error(`Missing membership filter value param in a bloom filter action: ${JSON.stringify(action)}`);
    }
    if (!action.data.some(quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_BITSIZE)) {
      throw new Error(`Missing membership filter bit size param in a bloom filter action: ${JSON.stringify(action)}`);
    }
    if (!action.data.some(quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_HASHSIZE)) {
      throw new Error(`Missing membership filter hash count param in a bloom filter action: ${JSON.stringify(action)}`);
    }
    if (!action.data.some(quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_PROJECTED_PROPERTY)) {
      throw new Error(`Missing membership filter projectedProperty param in a bloom filter action: ${JSON.stringify(action)}`);
    }
    return true;
  }

  public async run(action: IActionRdfParseMembershipFilter): Promise<IActorRdfParseMembershipFilterOutput> {
    // TODO: include source collections in the filter itself!
    const sourceCollection = action.data.find(
      quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_COLLECTION,
    )!.object.value;
    const bits = Number.parseInt(
      action.data.find(
        quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_BITSIZE,
      )!.object.value,
      10,
    );
    const hashes = Number.parseInt(
      action.data.find(
        quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_HASHSIZE,
      )!.object.value,
      10,
    );
    const filter = Buffer.from(
      action.data.find(
        quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_REPRESENTATION,
      )!.object.value,
      'base64',
    );
    const members = action.data.filter(
      quad => quad.predicate.value === ActorRdfParseMembershipFilterBloom.MEM_PROJECTED_PROPERTY,
    ).map(quad => quad.object.value);
    return {
      filter: new MembershipFilterBloom(bits, hashes, filter, members),
      uriPattern: new RegExp(`^(${sourceCollection}.*)$`, 'u'),
    };
  }
}
