export interface IVoIDDescription {
  dataset: string;
  triples?: number;
  classes?: number;
  properties?: number;
  uriSpace?: string;
  distinctSubjects?: number;
  distinctObjects?: number;
  propertyPartitions: Map<string, IVoIDDescriptionPropertyPartition>;
  classPartitions: Map<string, IVoIDDescriptionClassPartition>;
}

export interface IVoIDDescriptionClassPartition {
  entities?: number;
}

export interface IVoIDDescriptionPropertyPartition {
  triples?: number;
  distinctSubjects?: number;
  distinctObjects?: number;
}
