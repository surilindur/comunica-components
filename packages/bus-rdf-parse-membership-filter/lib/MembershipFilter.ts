import type * as RDF from '@rdfjs/types';

export interface IMembershipFilter {
  members: string[];
  test: (term: RDF.Term) => boolean;
}
