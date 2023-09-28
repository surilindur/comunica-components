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
import type { IVoIDDescriptionArgs, IVoIDDescription } from './VoIDDescription';
import { VoIDDescription } from './VoIDDescription';

const VOID = 'http://rdfs.org/ns/void#';
const VOID_TRIPLES = `${VOID}triples`;
const VOID_CLASSES = `${VOID}classes`;
const VOID_PROPERTY = `${VOID}property`;
const VOID_PROPERTIES = `${VOID}properties`;
const VOID_INDATASET = `${VOID}inDataset`;
const VOID_URISPACE = `${VOID}uriSpace`;
const VOID_DATASET = `${VOID}Dataset`;
const VOID_DSUBJECTS = `${VOID}distinctSubjects`;
const VOID_DOBJECTS = `${VOID}distinctObjects`;
const VOID_PPARTITION = `${VOID}propertyPartition`;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * An RDF Metadata Extract Actor that extracts dataset metadata from their VOID descriptions
 */
export class ActorRdfMetadataExtractVoIDDescription extends ActorRdfMetadataExtract {
  public readonly mediatorDereferenceRdf: MediatorDereferenceRdf;

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
    const operation: RDF.Quad = action.context.getSafe(KeysQueryOperation.operation);
    const descriptions: IVoIDDescription[] = [];

    if (operation.predicate.termType === 'NamedNode') {
      const preliminaryDescriptions = await this.extractDescriptions(action.metadata);

      for (const description of preliminaryDescriptions) {
        if (description.propertyPartitions.size > 0) {
          descriptions.push(description);
        } else {
          const data = await this.mediatorDereferenceRdf.mediate({ url: description.dataset, context: action.context });
          const newDescriptions = await this.extractDescriptions(data.data);
          const filledDescription = newDescriptions.find(vd => vd.dataset === description.dataset);
          if (filledDescription && filledDescription.propertyPartitions.size > 0) {
            descriptions.push(filledDescription);
          }
        }
      }
    }

    return { metadata: descriptions.length > 0 ? { voidDescriptions: descriptions } : {}};
  }

  private async extractDescriptions(stream: RDF.Stream): Promise<IVoIDDescription[]> {
    return new Promise((resolve, reject) => {
      const data: Record<string, RDF.Quad[]> = {};
      const descriptions: Record<string, RDF.Quad[]> = {};
      const links: string[] = [];
      stream.on('data', (quad: RDF.Quad) => {
        if (quad.subject.value in descriptions) {
          descriptions[quad.subject.value].push(quad);
        } else if (quad.predicate.value === RDF_TYPE && quad.object.value === VOID_DATASET) {
          if (quad.subject.value in data) {
            descriptions[quad.subject.value] = [ ...data[quad.subject.value], quad ];
            delete data[quad.subject.value];
          } else {
            descriptions[quad.subject.value] = [ quad ];
          }
        } else if (quad.predicate.value === VOID_INDATASET) {
          links.push(quad.object.value);
        } else if (quad.subject.value in data) {
          data[quad.subject.value].push(quad);
        } else {
          data[quad.subject.value] = [ quad ];
        }
      }).on('end', () => {
        const descriptionObjects: IVoIDDescription[] = links.map(url => new VoIDDescription({
          dataset: url,
          propertyPartitions: new Map(),
        }));
        for (const [ dataset, quads ] of Object.entries(descriptions)) {
          const voidArgs: IVoIDDescriptionArgs = {
            dataset,
            propertyPartitions: new Map(),
          };
          for (const quad of quads) {
            if (quad.predicate.value === VOID_DSUBJECTS) {
              voidArgs.distinctSubjects = Number.parseInt(quad.object.value, 10);
            } else if (quad.predicate.value === VOID_DOBJECTS) {
              voidArgs.distinctObjects = Number.parseInt(quad.object.value, 10);
            } else if (quad.predicate.value === VOID_URISPACE) {
              voidArgs.uriSpace = quad.object.value;
            } else if (quad.predicate.value === VOID_PROPERTIES) {
              voidArgs.properties = Number.parseInt(quad.object.value, 10);
            } else if (quad.predicate.value === VOID_CLASSES) {
              voidArgs.classes = Number.parseInt(quad.object.value, 10);
            } else if (quad.predicate.value === VOID_PPARTITION && quad.object.value in data) {
              const propertyPartitionQuads = data[quad.object.value];
              const propertyValue = propertyPartitionQuads.find(pq => pq.predicate.value === VOID_PROPERTY);
              const propertyCount = propertyPartitionQuads.find(pq => pq.predicate.value === VOID_TRIPLES);
              if (propertyValue && propertyCount) {
                voidArgs.propertyPartitions.set(
                  propertyValue.object.value,
                  Number.parseInt(propertyCount.object.value, 10),
                );
              }
            }
          }
          descriptionObjects.push(new VoIDDescription(voidArgs));
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
}
