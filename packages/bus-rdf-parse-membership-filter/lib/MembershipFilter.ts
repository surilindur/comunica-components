import type * as RDF from '@rdfjs/types';

export interface IMembershipFilter {
  test: (term: RDF.Term) => boolean;
  member: string;
}
