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
import type {
  IVoIDDescription,
  IVoIDDescriptionClassPartition,
  IVoIDDescriptionPropertyPartition,
} from './VoIDDescription';

/**
 * An RDF Metadata Extract Actor that extracts dataset metadata from their VOID descriptions
 */
export class ActorRdfMetadataExtractVoIDDescription extends ActorRdfMetadataExtract {
  protected readonly mediatorDereferenceRdf: MediatorDereferenceRdf;

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
  public static readonly XSD_PREFIX = 'http://www.w3.org/2001/XMLSchema#';
  public static readonly XSD_INTEGER = `${ActorRdfMetadataExtractVoIDDescription.XSD_PREFIX}integer`;
  public static readonly XSD_STRING = `${ActorRdfMetadataExtractVoIDDescription.XSD_PREFIX}string`;

  public constructor(args: IActorRdfMetadataExtractVoIDDescriptionArgs) {
    super(args);
    this.mediatorDereferenceRdf = args.mediatorDereferenceRdf;
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
    for (const description of await this.extractDescriptions(action.metadata)) {
      descriptions.push(description);
    }
    return { metadata: descriptions.length > 0 ? { voidDescriptions: descriptions } : {}};
  }

  /**
   * Extracts VoID descriptions from a stream of RDF quads.
   * This code assumes that the first quad of each description contains the rdf:type declaration.
   * @param stream Stream of RDF quads containing the VoID descriptions.
   * @returns EXtracted VoID descriptions.
   */
  private async extractDescriptions(stream: RDF.Stream): Promise<IVoIDDescription[]> {
    return new Promise((resolve, reject) => {
      const datasets: Record<string, IVoIDDescription &
      IVoIDDescriptionClassPartition & IVoIDDescriptionPropertyPartition> = {};

      const quadHasIntegerValue = (quad: RDF.Quad, predicate: string): boolean =>
        quad.predicate.value === predicate &&
        quad.object.termType === 'Literal' &&
        quad.object.datatype.value === ActorRdfMetadataExtractVoIDDescription.XSD_INTEGER;

      stream.on('data', (quad: RDF.Quad) => {
        if (quad.subject.termType === 'NamedNode' && quad.predicate.termType === 'NamedNode') {
          if (
            quad.predicate.value === ActorRdfMetadataExtractVoIDDescription.RDF_TYPE &&
            quad.object.termType === 'NamedNode' &&
            quad.object.value === ActorRdfMetadataExtractVoIDDescription.VOID_DATASET
          ) {
            datasets[quad.subject.value] = {
              dataset: quad.subject.value,
              classPartitions: new Map(),
              propertyPartitions: new Map(),
            };
          } else if (quadHasIntegerValue(quad, ActorRdfMetadataExtractVoIDDescription.VOID_ENTITIES)) {
            datasets[quad.subject.value].entities = Number.parseInt(quad.object.value, 10);
          } else if (quadHasIntegerValue(quad, ActorRdfMetadataExtractVoIDDescription.VOID_DSUBJECTS)) {
            datasets[quad.subject.value].distinctSubjects = Number.parseInt(quad.object.value, 10);
          } else if (quadHasIntegerValue(quad, ActorRdfMetadataExtractVoIDDescription.VOID_DOBJECTS)) {
            datasets[quad.subject.value].distinctObjects = Number.parseInt(quad.object.value, 10);
          } else if (quadHasIntegerValue(quad, ActorRdfMetadataExtractVoIDDescription.VOID_TRIPLES)) {
            datasets[quad.subject.value].triples = Number.parseInt(quad.object.value, 10);
          } else if (quadHasIntegerValue(quad, ActorRdfMetadataExtractVoIDDescription.VOID_CLASSES)) {
            datasets[quad.subject.value].classes = Number.parseInt(quad.object.value, 10);
          } else if (quadHasIntegerValue(quad, ActorRdfMetadataExtractVoIDDescription.VOID_PROPERTIES)) {
            datasets[quad.subject.value].properties = Number.parseInt(quad.object.value, 10);
          } else if (
            quad.predicate.value === ActorRdfMetadataExtractVoIDDescription.VOID_URISPACE &&
            quad.object.termType === 'Literal' &&
            quad.object.datatype.value === ActorRdfMetadataExtractVoIDDescription.XSD_STRING
          ) {
            datasets[quad.subject.value].uriSpace = quad.object.value;
          } else if (
            quad.predicate.value === ActorRdfMetadataExtractVoIDDescription.VOID_PPARTITION &&
            quad.object.termType === 'NamedNode'
          ) {
            datasets[quad.subject.value].propertyPartitions.set(quad.object.value, {});
          }
        }
      }).on('end', () => {
        const descriptions: IVoIDDescription[] = [];
        const datasetsToPartitions = (
          map: Map<string, IVoIDDescriptionClassPartition | IVoIDDescriptionPropertyPartition>,
        ): void => {
          for (const dataset of map.keys()) {
            if (dataset in datasets) {
              delete (<any>datasets[dataset]).propertyPartitions;
              delete (<any>datasets[dataset]).classPartitions;
              map.set(dataset, datasets[dataset]);
              delete datasets[dataset];
            } else {
              map.delete(dataset);
            }
          }
        };
        for (const description of <IVoIDDescription[]>Object.values(datasets).filter(desc => 'uriSpace' in desc)) {
          datasetsToPartitions(description.classPartitions);
          datasetsToPartitions(description.propertyPartitions);
          descriptions.push(description);
        }
        resolve(descriptions);
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
}
