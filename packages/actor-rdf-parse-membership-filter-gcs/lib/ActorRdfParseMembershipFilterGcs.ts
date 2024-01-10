import type { IActorRdfParseMembershipFilterArgs,
  IActionRdfParseMembershipFilter,
  IActorRdfParseMembershipFilterOutput } from '@comunica/bus-rdf-parse-membership-filter';
import { ActorRdfParseMembershipFilter } from '@comunica/bus-rdf-parse-membership-filter';
import type { IActorTest } from '@comunica/core';
import { MembershipFilterGcs } from './MembershipFilterGcs';

/**
 * A comunica GCS RDF Membership Filter Actor.
 */
export class ActorRdfMembershipFilterGcs extends ActorRdfParseMembershipFilter {
  public static readonly MEM: string = 'http://semweb.mmlab.be/ns/membership#';
  public static readonly MEM_FILTER: string = `${ActorRdfMembershipFilterGcs.MEM}filter`;

  public constructor(args: IActorRdfParseMembershipFilterArgs) {
    super(args);
  }

  public async test(action: IActionRdfParseMembershipFilter): Promise<IActorTest> {
    if (!action.data.some(quad => quad.predicate.value === ActorRdfMembershipFilterGcs.MEM_FILTER)) {
      throw new Error(`Missing membership filter filter param in a GCS filter action: ${JSON.stringify(action)}`);
    }
    return true;
  }

  public async run(action: IActionRdfParseMembershipFilter): Promise<IActorRdfParseMembershipFilterOutput> {
    const filter = Buffer.from(
      action.data.find(quad => quad.predicate.value === ActorRdfMembershipFilterGcs.MEM_FILTER)!.object.value,
      'base64',
    );
    return { filter: new MembershipFilterGcs(filter), uriPattern: /(.*)/u };
  }
}
