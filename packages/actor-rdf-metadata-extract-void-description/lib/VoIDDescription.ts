export class VoIDDescription implements IVoIDDescription {
  public readonly dataset: string;
  public readonly classes: number | undefined;
  public readonly properties: number | undefined;
  public readonly uriSpace: string | undefined;
  public readonly distinctSubjects: number | undefined;
  public readonly distinctObjects: number | undefined;
  public readonly propertyPartitions: Map<string, number>;

  public constructor(args: IVoIDDescriptionArgs) {
    this.dataset = args.dataset;
    this.classes = args.classes;
    this.properties = args.properties;
    this.uriSpace = args.uriSpace;
    this.distinctObjects = args.distinctObjects;
    this.distinctSubjects = args.distinctSubjects;
    this.propertyPartitions = args.propertyPartitions;
  }
}

export interface IVoIDDescription {
  dataset: string;
  classes: number | undefined;
  properties: number | undefined;
  uriSpace: string | undefined;
  distinctSubjects: number | undefined;
  distinctObjects: number | undefined;
  propertyPartitions: Map<string, number>;
}

export interface IVoIDDescriptionArgs {
  dataset: string;
  classes?: number;
  properties?: number;
  uriSpace?: string;
  distinctSubjects?: number;
  distinctObjects?: number;
  propertyPartitions: Map<string, number>;
}
