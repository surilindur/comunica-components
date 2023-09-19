import {
  type ActorInitQueryBase,
  QueryEngineBase,
} from '@comunica/actor-init-query';
import { type MediatorDereferenceRdf } from '@comunica/bus-dereference-rdf';
import {
  type IActionRdfMetadataExtract,
  type IActorRdfMetadataExtractOutput,
  type IActorRdfMetadataExtractArgs,
  ActorRdfMetadataExtract,
} from '@comunica/bus-rdf-metadata-extract';
import { KeysQueryOperation, KeysInitQuery } from '@comunica/context-entries';
import { type IActorTest } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { storeStream } from 'rdf-store-stream';

/**
 * An RDF Metadata Extract Actor that extracts dataset metadata from their VOID descriptions
 */
export class ActorRdfMetadataExtractVoIDCount extends ActorRdfMetadataExtract {
  public readonly mediatorDereferenceRdf: MediatorDereferenceRdf;
  private readonly queryEngine: QueryEngineBase;

  public constructor(args: IActorRdfMetadataExtractVoIDCountArgs) {
    super(args);
    this.mediatorDereferenceRdf = args.mediatorDereferenceRdf;
    this.queryEngine = new QueryEngineBase(args.actorInitQuery);
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
    let countByDataset: Map<string, Map<string, number>> | undefined;

    if (operation.predicate.termType === 'NamedNode') {
      const metadata = await storeStream(action.metadata);
      countByDataset = await this.extractPredicateCounts(metadata);

      const links = await this.extractDatasetDescriptionLinks(metadata);
      for (const url of links) {
        const response = await this.mediatorDereferenceRdf.mediate({ url, context: action.context });
        const store = await storeStream(response.data);
        const incomingCounts = await this.extractPredicateCounts(store);
        for (const [ dataset, data ] of incomingCounts) {
          let existingData = countByDataset.get(dataset);
          if (!existingData) {
            existingData = new Map();
            countByDataset.set(dataset, existingData);
          }
          for (const [ key, value ] of data) {
            existingData.set(key, (existingData.get(key) ?? 0) + value);
          }
        }
      }
    }

    const cardinality = { cardinality: { type: 'estimate', value: 1 }};
    const predicates = countByDataset?.size ? { predicates: countByDataset } : {};

    return { metadata: { ...cardinality, ...predicates }};
  }

  private async extractDatasetDescriptionLinks(store: RDF.Store): Promise<string[]> {
    const bindingsStream = await this.queryEngine.queryBindings(`
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT DISTINCT ?dataset WHERE {
        ?s void:inDataset ?dataset .
      }
    `, { sources: [ store ]});

    return new Promise((resolve, reject) => {
      const links: string[] = [];
      bindingsStream.on('data', (bindings: RDF.Bindings) => {
        const dataset: string = bindings.get('dataset')!.value;
        links.push(dataset);
      }).on('end', () => resolve(links)).on('error', reject);
    });
  }

  private async extractPredicateCounts(store: RDF.Store): Promise<Map<string, Map<string, number>>> {
    const bindingsStream = await this.queryEngine.queryBindings(`
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?dataset ?predicate ?count WHERE {
        ?dataset a void:Dataset ;
          void:propertyPartition [
            void:property ?predicate ;
            void:triples ?count
          ] .
      }
    `, { sources: [ store ]});

    return new Promise((resolve, reject) => {
      const counts: Map<string, Map<string, number>> = new Map();
      bindingsStream.on('data', (bindings: RDF.Bindings) => {
        const dataset: string = bindings.get('dataset')!.value;
        const predicate: string = bindings.get('predicate')!.value;
        const count: number = Number.parseInt(bindings.get('count')!.value, 10);
        let data = counts.get(dataset);
        if (!data) {
          data = new Map();
          counts.set(dataset, data);
        }
        data.set(predicate, (data.get(predicate) ?? 0) + count);
      }).on('end', () => resolve(counts)).on('error', reject);
    });
  }
}

export interface IActorRdfMetadataExtractVoIDCountArgs extends IActorRdfMetadataExtractArgs {
  /**
   * An init query actor that is used to query shapes.
   * @default {<urn:comunica:default:init/actors#query>}
   */
  actorInitQuery: ActorInitQueryBase;
  /**
   * The Dereference RDF mediator.
   * @default {<urn:comunica:default:dereference-rdf/mediators#main>}
   */
  mediatorDereferenceRdf: MediatorDereferenceRdf;
}
