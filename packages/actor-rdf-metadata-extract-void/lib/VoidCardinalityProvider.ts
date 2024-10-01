import type * as RDF from '@rdfjs/types';
import type { IVoidDataset, IVoidCardinalityProvider } from './ActorRdfMetadataExtractVoid';

export class VoidCardinalityProvider implements IVoidCardinalityProvider {
  public constructor(public datasets: Record<string, IVoidDataset>, public unionDefaultGraph = false) {}

  public getCardinality(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    graph: RDF.Term,
  ): RDF.QueryResultCardinality {
    const value = this.getCardinalityRaw(subject, predicate, object, graph);
    if (Number.isNaN(value)) {
      // eslint-disable-next-line no-console
      console.log([
        'CARDINALITY:',
        `\tquad: ( ${subject.value}, ${predicate.value}, ${object.value}, ${graph.value} )`,
        `\tcardinality: ${value}`,
      ].join('\n'));
    }
    return { type: 'estimate', value };
  }

  // Based on:
  // Hagedorn, Stefan, et al. "Resource Planning for SPARQL Query Execution on Data Sharing Platforms." COLD 1264 (2014)
  public getCardinalityRaw(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    graph: RDF.Term,
  ): number {
    // ?s rdf:type <o>
    if (predicate.termType !== 'Variable' && predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      subject.termType === 'Variable' && object.termType !== 'Variable') {
      return this.getClassPartitionEntities(object, graph);
    }

    // ?s ?p ?o
    if (subject.termType === 'Variable' && predicate.termType === 'Variable' && object.termType === 'Variable') {
      return this.getTriples(graph);
    }

    // <s> ?p ?o
    if (subject.termType !== 'Variable' && predicate.termType === 'Variable' && object.termType === 'Variable') {
      const graphTriples = this.getTriples(graph);
      return graphTriples === 0 ? 0 : graphTriples / this.getDistinctSubjects(graph);
    }

    // ?s <p> ?o
    if (subject.termType === 'Variable' && predicate.termType !== 'Variable' && object.termType === 'Variable') {
      return this.getPredicateTriples(predicate, graph);
    }

    // ?s ?p <o>
    if (subject.termType === 'Variable' && predicate.termType === 'Variable' && object.termType !== 'Variable') {
      return this.getTriples(graph) / this.getDistinctObjects(graph);
    }

    // <s> <p> ?o
    if (subject.termType !== 'Variable' && predicate.termType !== 'Variable' && object.termType === 'Variable') {
      const predicateTriples = this.getPredicateTriples(predicate, graph);
      return predicateTriples === 0 ? 0 : predicateTriples / this.getPredicateSubjects(predicate, graph);
    }

    // <s> ?p <o>
    if (subject.termType !== 'Variable' && predicate.termType === 'Variable' && object.termType !== 'Variable') {
      const graphTriples = this.getTriples(graph);
      return graphTriples === 0 ? 0 : graphTriples / (this.getDistinctSubjects(graph) * this.getDistinctObjects(graph));
    }

    // ?s <p> <o>
    if (subject.termType === 'Variable' && predicate.termType !== 'Variable' && object.termType !== 'Variable') {
      const predicateTriples = this.getPredicateTriples(predicate, graph);
      return predicateTriples === 0 ? 0 : predicateTriples / this.getPredicateObjects(predicate, graph);
    }

    // <s> <p> <o>
    if (subject.termType !== 'Variable' && predicate.termType !== 'Variable' && object.termType !== 'Variable') {
      const predicateTriples = this.getPredicateTriples(predicate, graph);
      return predicateTriples === 0 ?
        0 :
        predicateTriples / (this.getPredicateSubjects(predicate, graph) * this.getPredicateObjects(predicate, graph));
    }

    // In all other cases, return infinity
    return Number.POSITIVE_INFINITY;
  }

  public getTriples(graph: RDF.Term): number {
    if ((graph.termType === 'Variable' || graph.termType === 'DefaultGraph') && (this.unionDefaultGraph)) {
      let sum = 0;
      for (const dataset of Object.values(this.datasets)) {
        sum += dataset.triples;
      }
      return sum;
    }
    return this.datasets[graph.value]?.triples || 0;
  }

  public getDistinctSubjects(graph: RDF.Term): number {
    return this.getGraphValue(graph, g => g.distinctSubjects);
  }

  public getDistinctObjects(graph: RDF.Term): number {
    return this.getGraphValue(graph, g => g.distinctObjects);
  }

  public getPredicateTriples(predicate: RDF.Term, graph: RDF.Term): number {
    return this.getGraphValue(graph, g => g.propertyPartitions[predicate.value]?.triples);
  }

  public getPredicateSubjects(predicate: RDF.Term, graph: RDF.Term): number {
    return this.getGraphValue(graph, g => g.propertyPartitions[predicate.value]?.distinctSubjects);
  }

  public getPredicateObjects(predicate: RDF.Term, graph: RDF.Term): number {
    return this.getGraphValue(graph, g => g.propertyPartitions[predicate.value]?.distinctObjects);
  }

  public getClassPartitionEntities(object: RDF.Term, graph: RDF.Term): number {
    return this.getGraphValue(graph, g => g.classPartitions[object.value]?.entities);
  }

  protected getGraphValue(
    graph: RDF.Term,
    graphValueSelector: (dataset: IVoidDataset) => number | undefined,
  ): number {
    let voidDataset: IVoidDataset | undefined;
    if (graph.termType === 'Variable' || graph.termType === 'DefaultGraph') {
      if (this.unionDefaultGraph) {
        let sum = 0;
        for (const dataset of Object.values(this.datasets)) {
          sum += graphValueSelector(dataset) ?? 0;
        }
        return sum;
      }
    } else {
      voidDataset = this.datasets[graph.value];
    }
    return voidDataset ? graphValueSelector(voidDataset) ?? 0 : 0;
  }
}
