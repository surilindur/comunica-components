import type { IVoIDDescription } from '@comunica/actor-rdf-metadata-extract-void-description';
import type { Algebra } from 'sparqlalgebrajs';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

export interface ITriplePatternCardinalityEstimator {
  estimate: (description: IVoIDDescription, pattern: Algebra.Pattern) => number | undefined;
}

export abstract class TriplePatternCardinalityEstimator implements ITriplePatternCardinalityEstimator {
  public abstract estimate(description: IVoIDDescription, pattern: Algebra.Pattern): number | undefined;
}

/**
 * Naïve triple pattern cardinality estimator that only checkes the predicate and used the total
 * number of triples with that predicate from the property partitions
 */
export class TriplePatternCardinalityEstimatorVoIDDescriptionPredicateCount extends TriplePatternCardinalityEstimator {
  public estimate(description: IVoIDDescription, pattern: Algebra.Pattern): number | undefined {
    if (pattern.predicate.termType === 'NamedNode') {
      return description.propertyPartitions.get(pattern.predicate.value)?.triples;
    }
  }
}

/**
 * Triple pattern cardinality estimator that makes use of the formulae from the paper
 * Resource Planning for SPARQL Query Execution on Data Sharing Platforms by Hagedorn, Hose, Sattler and Umbrich
 * https://ceur-ws.org/Vol-1264/cold2014_HagedornHSU.pdf (Table 1 in Section 4)
 * The separately listed special cases from the table for when predicate is rdf:type are mostly covered
 * by the same code as the other cases. The corresponding cases are commented in the statements.
 */
export class TriplePatternCardinalityEstimatorVoIDDescription extends TriplePatternCardinalityEstimator {
  public estimate(description: IVoIDDescription, pattern: Algebra.Pattern): number | undefined {
    if (pattern.predicate.termType === 'NamedNode') {
      const pp = description.propertyPartitions.get(pattern.predicate.value);
      if (pp !== undefined) {
        if (pattern.subject.termType === 'Variable') {
          if (pattern.object.termType === 'Variable') {
            // ?s <p> ?o
            // ?s rdf:type ?o
            return pp.triples;
          }
          if (pattern.object.termType === 'NamedNode') {
            if (pattern.predicate.value === RDF_TYPE) {
              // ?s rdf:type <o>
              const cp = description.classPartitions.get(pattern.object.value);
              return cp?.entities;
            }
            // ?s <p> <o>
            return pp.triples !== undefined && pp.distinctObjects ?
              pp.triples / pp.distinctObjects :
              undefined;
          }
        } else if (pattern.subject.termType === 'NamedNode') {
          if (pattern.object.termType === 'Variable') {
            // <s> <p> ?o
            // <s> rdf:type ?o
            return pp.triples !== undefined && pp.distinctSubjects ?
              pp.triples / pp.distinctSubjects :
              undefined;
          }
          if (pattern.object.termType === 'NamedNode') {
            // <s> rdf:type <o>
            if (pattern.predicate.value === RDF_TYPE && !description.classPartitions.get(pattern.object.value)) {
              // The paper says that for rdf:type here,
              // if there is no class partition for <o> then 0 should be returned
              return 0;
            }
            // <s> <p> <o>
            return pp.triples !== undefined && pp.distinctSubjects && pp.distinctObjects ?
              pp.triples / (pp.distinctSubjects * pp.distinctObjects) :
              undefined;
          }
        }
      }
    } else if (pattern.predicate.termType === 'Variable') {
      if (pattern.subject.termType === 'Variable') {
        if (pattern.object.termType === 'Variable') {
          // ?s ?p ?o
          return description.triples;
        }
        if (pattern.object.termType === 'NamedNode') {
          // ?s ?p <o>
          return description.triples !== undefined && description.distinctObjects ?
            description.triples / description.distinctObjects :
            undefined;
        }
      } else if (pattern.subject.termType === 'NamedNode') {
        if (pattern.object.termType === 'Variable') {
          // <s> ?p ?o
          return description.triples !== undefined && description.distinctSubjects ?
            description.triples / description.distinctSubjects :
            undefined;
        }
        if (pattern.object.termType === 'NamedNode') {
          // <s> ?p <o>
          return description.triples !== undefined && description.distinctSubjects && description.distinctObjects ?
            description.triples / (description.distinctSubjects * description.distinctObjects) :
            undefined;
        }
      }
    }
  }
}
