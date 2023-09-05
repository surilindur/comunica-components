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
import { type IActionContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { storeStream } from 'rdf-store-stream';

/**
 * An RDF Metadata Extract Actor that extracts dataset metadata from their VOID descriptions
 */
export class ActorRdfMetadataExtractVoIDCount extends ActorRdfMetadataExtract {
  public readonly mediatorDereferenceRdf: MediatorDereferenceRdf;

  private readonly queryEngine: QueryEngineBase;
  private readonly predicateCounts: Map<string, Map<string, number>>;
  private readonly processedUrls: Set<string>;

  public constructor(args: IActorRdfMetadataExtractVoIDCountArgs) {
    super(args);
    this.mediatorDereferenceRdf = args.mediatorDereferenceRdf;
    this.queryEngine = new QueryEngineBase(args.actorInitQuery);
    this.predicateCounts = new Map();
    this.processedUrls = new Set();
  }

  public async test(action: IActionRdfMetadataExtract): Promise<IActorTest> {
    if (!action.context.get(KeysInitQuery.query)) {
      throw new Error(`Actor ${this.name} can only work in the context of a query.`);
    }
    if (!action.context.get(KeysQueryOperation.operation)) {
      throw new Error(`Actor ${this.name} can only work in the context of a query operation.`);
    }
    if (!this.getCurrentQueryOperationPredicateValue(action.context)) {
      throw new Error(`Actor ${this.name} can only work when the query operation pattern predicate is an IRI.`);
    }
    return true;
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const predicate: string = this.getCurrentQueryOperationPredicateValue(action.context)!;

    let cardinality = this.getPredicateCardinalityValue(action.url, predicate);

    if (!cardinality && !this.processedUrls.has(action.url)) {
      const metadata = await storeStream(action.metadata);
      await this.extractPredicateCardinalities(metadata);

      const links = await this.extractVoIDDescriptionLinks(metadata);
      for (const url of links) {
        const response = await this.mediatorDereferenceRdf.mediate({ url, context: action.context });
        const store = await storeStream(response.data);
        await this.extractPredicateCardinalities(store);
      }

      this.processedUrls.add(action.url);

      cardinality = this.getPredicateCardinalityValue(action.url, predicate);
    }

    // eslint-disable-next-line no-console
    console.log(predicate, cardinality);

    return { metadata: { cardinality: { type: 'estimate', value: cardinality ?? Number.POSITIVE_INFINITY }}};
  }

  private getCurrentQueryOperationPredicateValue(context: IActionContext): string | undefined {
    // The operation is an algebra pattern, but treating it as Quad allows accessing the predicate neatly
    const operation: RDF.Quad = context.getSafe(KeysQueryOperation.operation);
    return operation.predicate.termType === 'NamedNode' ? operation.predicate.value : undefined;
  }

  private getPredicateCardinalityValue(url: string, predicate: string): number | undefined {
    let longestMatch = 0;
    let cardinality: number | undefined;
    const getMatchLength = (first: string, second: string): number => {
      let i;
      for (i = 0; i < Math.min(first.length, second.length); i++) {
        if (first[i] !== second[i]) {
          break;
        }
      }
      return i;
    };
    for (const [ datasetUri, predicateCountMap ] of this.predicateCounts) {
      const matchingLength = getMatchLength(datasetUri, url);
      if (matchingLength > longestMatch) {
        longestMatch = matchingLength;
        cardinality = predicateCountMap.get(predicate) ?? cardinality;
      }
    }
    return cardinality;
  }

  private async extractVoIDDescriptionLinks(store: RDF.Store): Promise<string[]> {
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

  private async extractPredicateCardinalities(store: RDF.Store): Promise<void> {
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
      bindingsStream.on('data', (bindings: RDF.Bindings) => {
        const dataset: string = bindings.get('dataset')!.value;
        const predicate: string = bindings.get('predicate')!.value;
        const count: number = Number.parseInt(bindings.get('count')!.value, 10);
        const counts = this.predicateCounts.get(dataset);
        if (counts) {
          counts.set(predicate, count);
        } else {
          this.predicateCounts.set(dataset, new Map([[ predicate, count ]]));
        }
      }).on('end', resolve).on('error', reject);
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
