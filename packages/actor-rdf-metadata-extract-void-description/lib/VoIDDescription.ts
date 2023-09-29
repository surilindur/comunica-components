export interface IVoIDDescription {
  dataset: string;
  classes?: number;
  properties?: number;
  uriSpace?: string;
  distinctSubjects?: number;
  distinctObjects?: number;
  propertyPartitions: Map<string, number>;
}
