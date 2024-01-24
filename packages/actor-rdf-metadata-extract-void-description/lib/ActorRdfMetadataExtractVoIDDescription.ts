import { type MediatorDereferenceRdf } from '@comunica/bus-dereference-rdf';
import {
  type IActionRdfMetadataExtract,
  type IActorRdfMetadataExtractOutput,
  type IActorRdfMetadataExtractArgs,
  ActorRdfMetadataExtract,
} from '@comunica/bus-rdf-metadata-extract';
import { KeysQueryOperation, KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import type { IVoIDDescription } from './VoIDDescription';

/**
 * An RDF Metadata Extract Actor that extracts dataset metadata from their VOID descriptions
 */
export class ActorRdfMetadataExtractVoIDDescription extends ActorRdfMetadataExtract {
  protected readonly mediatorDereferenceRdf: MediatorDereferenceRdf;
  protected readonly datasetSubjectRegex: RegExp;
  protected readonly shouldCompletePartialDescriptions: boolean;

  public static readonly VOID_PREFIX = 'http://rdfs.org/ns/void#';
  public static readonly VOID_TRIPLES = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}triples`;
  public static readonly VOID_ENTITIES = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}entities`;
  public static readonly VOID_CLASS = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}class`;
  public static readonly VOID_CLASSES = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}classes`;
  public static readonly VOID_PROPERTY = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}property`;
  public static readonly VOID_PROPERTIES = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}properties`;
  public static readonly VOID_INDATASET = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}inDataset`;
  public static readonly VOID_URISPACE = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}uriSpace`;
  public static readonly VOID_DATASET = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}Dataset`;
  public static readonly VOID_DSUBJECTS = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}distinctSubjects`;
  public static readonly VOID_DOBJECTS = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}distinctObjects`;
  public static readonly VOID_PPARTITION = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}propertyPartition`;
  public static readonly VOID_CPARTITION = `${ActorRdfMetadataExtractVoIDDescription.VOID_PREFIX}classPartition`;
  public static readonly RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  public static readonly XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

  public constructor(args: IActorRdfMetadataExtractVoIDDescriptionArgs) {
    super(args);
    this.shouldCompletePartialDescriptions = args.shouldCompletePartialDescriptions;
    this.mediatorDereferenceRdf = args.mediatorDereferenceRdf;
    this.datasetSubjectRegex = new RegExp(args.datasetSubjectRegex, 'u');
  }

  public async test(action: IActionRdfMetadataExtract): Promise<IActorTest> {
    if (!action.context.get(KeysInitQuery.query)) {
      throw new Error(`Actor ${this.name} can only work in the context of a query.`);
    }
    if (!action.context.get(KeysQueryOperation.operation)) {
      throw new Error(`Actor ${this.name} can only work in the context of a query operation.`);
    }
    return true;
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const descriptions: IVoIDDescription[] = [];
    const preliminaryDescriptions = await this.extractDescriptions(action.metadata);
    for (const description of preliminaryDescriptions) {
      if (this.descriptionIsComplete(description)) {
        descriptions.push(description);
      } else if (this.shouldCompletePartialDescriptions) {
        const data = await this.mediatorDereferenceRdf.mediate({ url: description.dataset, context: action.context });
        const newDescriptions = await this.extractDescriptions(data.data);
        const filledDescription = newDescriptions.find(vd => vd.dataset === description.dataset);
        if (filledDescription && filledDescription.propertyPartitions.size > 0) {
          descriptions.push(filledDescription);
        }
      }
    }
    return { metadata: descriptions.length > 0 ? { voidDescriptions: descriptions } : {}};
  }

  private descriptionIsComplete(description: IVoIDDescription): boolean {
    return description.classPartitions.size > 0 &&
      description.propertyPartitions.size > 0 &&
      description.uriSpace !== undefined &&
      description.classes !== undefined &&
      description.distinctObjects !== undefined &&
      description.distinctSubjects !== undefined &&
      description.properties !== undefined &&
      description.triples !== undefined &&
      description.uriSpace !== undefined;
  }

  private async extractDescriptions(stream: RDF.Stream): Promise<IVoIDDescription[]> {
    return new Promise((resolve, reject) => {
      const data: Record<string, RDF.Quad[]> = {};
      const descriptions: Record<string, RDF.Quad[]> = {};
      const links: string[] = [];
      stream.on('data', (quad: RDF.Quad) => {
        if (quad.subject.value in descriptions) {
          descriptions[quad.subject.value].push(quad);
        } else if (
          quad.predicate.value === ActorRdfMetadataExtractVoIDDescription.RDF_TYPE &&
          quad.object.value === ActorRdfMetadataExtractVoIDDescription.VOID_DATASET &&
          this.datasetSubjectRegex.test(quad.subject.value)
        ) {
          if (quad.subject.value in data) {
            descriptions[quad.subject.value] = [ ...data[quad.subject.value], quad ];
            delete data[quad.subject.value];
          } else {
            descriptions[quad.subject.value] = [ quad ];
          }
        } else if (quad.predicate.value === ActorRdfMetadataExtractVoIDDescription.VOID_INDATASET) {
          links.push(quad.object.value);
        } else if (quad.subject.value in data) {
          data[quad.subject.value].push(quad);
        } else {
          data[quad.subject.value] = [ quad ];
        }
      }).on('end', () => {
        const descriptionObjects: IVoIDDescription[] = links.map(url => ({
          dataset: url,
          propertyPartitions: new Map(),
          classPartitions: new Map(),
        }));
        for (const [ dataset, quads ] of Object.entries(descriptions)) {
          const voidDescription: IVoIDDescription = {
            dataset,
            propertyPartitions: new Map(),
            classPartitions: new Map(),
          };
          for (const quad of quads) {
            switch (quad.predicate.value) {
              case ActorRdfMetadataExtractVoIDDescription.VOID_DSUBJECTS:
                voidDescription.distinctSubjects = Number.parseInt(quad.object.value, 10);
                break;
              case ActorRdfMetadataExtractVoIDDescription.VOID_DOBJECTS:
                voidDescription.distinctObjects = Number.parseInt(quad.object.value, 10);
                break;
              case ActorRdfMetadataExtractVoIDDescription.VOID_TRIPLES:
                voidDescription.triples = Number.parseInt(quad.object.value, 10);
                break;
              case ActorRdfMetadataExtractVoIDDescription.VOID_URISPACE:
                voidDescription.uriSpace = quad.object.value;
                break;
              case ActorRdfMetadataExtractVoIDDescription.VOID_PROPERTIES:
                voidDescription.properties = Number.parseInt(quad.object.value, 10);
                break;
              case ActorRdfMetadataExtractVoIDDescription.VOID_CLASSES:
                voidDescription.classes = Number.parseInt(quad.object.value, 10);
                break;
              case ActorRdfMetadataExtractVoIDDescription.VOID_CPARTITION:
                if (quad.object.value in data) {
                  let partitionClass: string | undefined;
                  let partitionEntities: number | undefined;
                  for (const pq of data[quad.object.value]) {
                    if (
                      pq.predicate.value === ActorRdfMetadataExtractVoIDDescription.VOID_CLASS &&
                      pq.object.termType === 'NamedNode'
                    ) {
                      partitionClass = pq.object.value;
                    } else if (
                      pq.predicate.value === ActorRdfMetadataExtractVoIDDescription.VOID_ENTITIES &&
                      pq.object.termType === 'Literal' &&
                      pq.object.datatype.value === ActorRdfMetadataExtractVoIDDescription.XSD_INTEGER
                    ) {
                      partitionEntities = Number.parseInt(pq.object.value, 10);
                    }
                  }
                  if (partitionClass) {
                    voidDescription.classPartitions.set(partitionClass, { entities: partitionEntities });
                  }
                }
                break;
              case ActorRdfMetadataExtractVoIDDescription.VOID_PPARTITION:
                if (quad.object.value in data) {
                  let partitionProperty: string | undefined;
                  let partitionTriples: number | undefined;
                  let partitionDistinctSubjects: number | undefined;
                  let partitionDistinctObjects: number | undefined;
                  for (const pq of data[quad.object.value]) {
                    if (
                      pq.object.termType === 'NamedNode' &&
                      pq.predicate.value === ActorRdfMetadataExtractVoIDDescription.VOID_PROPERTY
                    ) {
                      partitionProperty = pq.object.value;
                    } else if (
                      pq.object.termType === 'Literal' &&
                      pq.object.datatype.value === ActorRdfMetadataExtractVoIDDescription.XSD_INTEGER
                    ) {
                      switch (pq.predicate.value) {
                        case ActorRdfMetadataExtractVoIDDescription.VOID_TRIPLES:
                          partitionTriples = Number.parseInt(pq.object.value, 10);
                          break;
                        case ActorRdfMetadataExtractVoIDDescription.VOID_DSUBJECTS:
                          partitionDistinctSubjects = Number.parseInt(pq.object.value, 10);
                          break;
                        case ActorRdfMetadataExtractVoIDDescription.VOID_DOBJECTS:
                          partitionDistinctObjects = Number.parseInt(pq.object.value, 10);
                          break;
                      }
                    }
                  }
                  if (partitionProperty) {
                    voidDescription.propertyPartitions.set(partitionProperty, {
                      triples: partitionTriples,
                      distinctSubjects: partitionDistinctSubjects,
                      distinctObjects: partitionDistinctObjects,
                    });
                  }
                }
                break;
            }
          }
          descriptionObjects.push(voidDescription);
        }
        resolve(descriptionObjects);
      }).on('error', reject);
    });
  }
}

export interface IActorRdfMetadataExtractVoIDDescriptionArgs extends IActorRdfMetadataExtractArgs {
  /**
   * The Dereference RDF mediator.
   * @default {<urn:comunica:default:dereference-rdf/mediators#main>}
   */
  mediatorDereferenceRdf: MediatorDereferenceRdf;
  /**
   * The regex used to identify datasets as opposed to predicate and class partitions
   * that are also marked as datasets following the VoID specification.
   */
  datasetSubjectRegex: string;
  /**
   * Whether incomplete descriptions should be completed by dereferencing their URIs.
   * @default {false}
   */
  shouldCompletePartialDescriptions: boolean;
}
