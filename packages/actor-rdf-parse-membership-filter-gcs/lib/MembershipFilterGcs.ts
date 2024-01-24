import type { IMembershipFilter } from '@comunica/bus-rdf-parse-membership-filter';
import type * as RDF from '@rdfjs/types';
import { v3 as hash } from 'murmurhash';
import { termToString } from 'rdf-string';

const GCS = require('golombcodedsets');

/**
 * An approximate membership filter that is backed by a GCS filter.
 */
export class MembershipFilterGcs implements IMembershipFilter {
  private readonly gcsFilter: any;
  public readonly members: string[];

  public static readonly RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly RDF_SUBJECT = `${MembershipFilterGcs.RDF_PREFIX}subject`;
  public static readonly RDF_PREDICATE = `${MembershipFilterGcs.RDF_PREFIX}predicate`;
  public static readonly RDF_OBJECT = `${MembershipFilterGcs.RDF_PREFIX}object`;

  public constructor(buffer: Buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (const [ i, element ] of buffer.entries()) {
      view[i] = element;
    }
    this.gcsFilter = new GCS.GCSQuery(arrayBuffer, hash);
    this.members = [
      MembershipFilterGcs.RDF_SUBJECT,
      MembershipFilterGcs.RDF_PREDICATE,
      MembershipFilterGcs.RDF_OBJECT,
    ];
  }

  public test(term: RDF.Term): boolean {
    const stringTerm = termToString(term);
    return stringTerm && this.gcsFilter.query(stringTerm);
  }
}
