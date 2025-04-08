import type { QueryResultCardinality } from '@comunica/types';
import type { Algebra } from 'sparqlalgebrajs';

export interface IVoidPropertyPartition {
  triples: number | undefined;
  distinctSubjects: number | undefined;
  distinctObjects: number | undefined;
}

export interface IVoidClassPartition {
  entities: number | undefined;
  propertyPartitions: Record<string, IVoidPropertyPartition> | undefined;
}

export interface IVoidDataset {
  classes: number | undefined;
  classPartitions: Record<string, IVoidClassPartition> | undefined;
  distinctObjects: number | undefined;
  distinctSubjects: number | undefined;
  entities: number | undefined;
  identifier: string;
  propertyPartitions: Record<string, IVoidPropertyPartition> | undefined;
  triples: number;
  uriRegexPattern: RegExp | undefined;
  vocabularies: string[] | undefined;
}

/**
 * Abstraction to allow grouping of metadata by dataset, in case multiple datasets
 * expose their metadata through the same source URI and thus the same stream.
 */
export interface IDataset {
  /**
   * The unique URI of this dataset.
   */
  uri: string;
  /**
   * The URI from which this dataset was discovered.
   */
  source: string;
  /**
   * Calculate the cardinality of the given operation within this dataset.
   * @param {Algebra.Operation} operation SPARQL algebra operation.
   * @returns {QueryResultCardinality} Upper bound for the cardinality.
   */
  getCardinality: (operation: Algebra.Operation) => Promise<QueryResultCardinality>;
}
