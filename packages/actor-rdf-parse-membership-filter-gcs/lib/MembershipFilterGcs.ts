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
  public readonly member: string;

  public constructor(buffer: Buffer) {
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (const [ i, element ] of buffer.entries()) {
      view[i] = element;
    }
    this.gcsFilter = new GCS.GCSQuery(arrayBuffer, hash);
    this.member = 'spog';
  }

  public test(term: RDF.Term): boolean {
    const stringTerm = termToString(term);
    return stringTerm && this.gcsFilter.query(stringTerm);
  }
}
