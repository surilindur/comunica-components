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
import { NamedNode } from 'rdf-data-factory';
import { storeStream } from 'rdf-store-stream';

/**
 * An RDF Metadata Extract Actor that extracts dataset metadata from their VOID descriptions
 */
export class ActorRdfMetadataExtractVoIDCount extends ActorRdfMetadataExtract {
  public readonly mediatorDereferenceRdf: MediatorDereferenceRdf;

  private readonly predicateCountsByUriPrefix: Map<string, Map<string, number>>;
  private readonly processedUrls: Set<string>;

  public static readonly RDF_PREFIX = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  public static readonly XSD_PREFIX = 'http://www.w3.org/2001/XMLSchema#';
  public static readonly VOID_PREFIX = 'http://rdfs.org/ns/void#';

  public static readonly IRI_A = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.RDF_PREFIX}type`);
  public static readonly IRI_VOID_DATASET = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}Dataset`);
  public static readonly IRI_VOID_IN_DATASET = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}inDataset`);
  public static readonly IRI_VOID_URI_SPACE = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}uriSpace`);
  public static readonly IRI_VOID_TRIPLES = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}triples`);
  public static readonly IRI_VOID_CLASSES = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}classes`);
  public static readonly IRI_VOID_PROPERTIES = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}properties`);
  public static readonly IRI_VOID_PROPERTY = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}property`);
  public static readonly IRI_VOID_PROPERTY_PARTITION = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}propertyPartition`);
  public static readonly IRI_VOID_DISTINCT_SUBJECTS = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}distinctSubjects`);
  public static readonly IRI_VOID_DISTINCT_OBJECTS = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}distinctObjects`);
  public static readonly IRI_VOID_DOCUMENTS = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.VOID_PREFIX}documents`);
  public static readonly IRI_XSD_INTEGER = new NamedNode(`${ActorRdfMetadataExtractVoIDCount.XSD_PREFIX}integer`);

  public constructor(args: IActorRdfMetadataExtractVoIDCountArgs) {
    super(args);
    this.mediatorDereferenceRdf = args.mediatorDereferenceRdf;
    this.predicateCountsByUriPrefix = new Map();
    this.processedUrls = new Set();
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
    let predicateCountMap = this.getPredicateCountMap(action.url);

    if (!predicateCountMap && !this.processedUrls.has(action.url)) {
      const links: string[] = await this.extractVoIDDescriptionLinks(action.metadata);
      if (links.length > 0) {
        for (const link of links) {
          await this.parseVoIDDescription(link, action.context);
        }
        //
        // // New predicate index file discovered
        // // Switching to phase two
        // const callback: any = action.context.get(KeysRdfJoin.adaptiveJoinCallback);
        // if (callback) {
        // callback();
        // }
        //
        predicateCountMap = this.getPredicateCountMap(action.url);
      }
      this.processedUrls.add(action.url);
    }

    // eslint-disable-next-line no-console
    console.log(action.context);

    return {
      metadata: {
        cardinality: {
          type: 'estimate',
          value: predicateCountMap?.get('aaaaaa') ?? Number.POSITIVE_INFINITY,
        },
      },
    };
  }

  private getPredicateCountMap(uri: string): Map<string, number> | undefined {
    for (const [ uriPrefix, predicateCountMap ] of this.predicateCountsByUriPrefix) {
      if (uri.startsWith(uriPrefix)) {
        return predicateCountMap;
      }
    }
  }

  private extractVoIDDescriptionLinks(metadata: RDF.Stream): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const links: Set<string> = new Set<string>();
      metadata
        .on('data', (quad: RDF.Quad) => {
          if (quad.predicate.value === ActorRdfMetadataExtractVoIDCount.IRI_VOID_IN_DATASET.value) {
            links.add(quad.object.value);
          }
        })
        .on('error', reject)
        .on('end', () => resolve([ ...links.values() ]));
    });
  }

  private async parseVoIDDescription(url: string, context: IActionContext): Promise<void> {
    const response = await this.mediatorDereferenceRdf.mediate({ url, context });
    const store = await storeStream(response.data);
    const datasetQuads: RDF.Quad[] = await this.getMatchingQuads(
      store,
      undefined,
      ActorRdfMetadataExtractVoIDCount.IRI_A,
      ActorRdfMetadataExtractVoIDCount.IRI_VOID_DATASET,
    );
    for (const datasetQuad of datasetQuads) {
      const uriSpaceQuads = await this.getMatchingQuads(
        store,
        datasetQuad.subject,
        ActorRdfMetadataExtractVoIDCount.IRI_VOID_URI_SPACE,
      );
      const uriSpace = uriSpaceQuads.at(0)?.object.value ?? datasetQuad.subject.value;
      const predicateCounts: Map<string, number> = new Map();
      const propertyPartitions = await this.getMatchingQuads(
        store,
        datasetQuad.subject,
        ActorRdfMetadataExtractVoIDCount.IRI_VOID_PROPERTY_PARTITION,
      );
      const properties: RDF.NamedNode[] = [];
      for (const propertyPartition of propertyPartitions) {
        let property: string | undefined;
        let count: number | undefined;
        const quads = await this.getMatchingQuads(
          store,
          propertyPartition.subject,
        );
        for (const quad of quads) {
          if (
            quad.predicate.value === ActorRdfMetadataExtractVoIDCount.IRI_VOID_PROPERTY.value &&
            quad.object.termType === 'NamedNode'
          ) {
            property = quad.object.value;
          }
          if (
            quad.predicate.value === ActorRdfMetadataExtractVoIDCount.IRI_VOID_TRIPLES.value &&
            quad.object.termType === 'Literal' &&
            quad.object.datatype.value === ActorRdfMetadataExtractVoIDCount.IRI_XSD_INTEGER.value
          ) {
            count = Number.parseInt(quad.object.value, 10);
          }
          if (property && count) {
            predicateCounts.set(property, count);
            break;
          }
        }
      }
      this.predicateCountsByUriPrefix.set(uriSpace, predicateCounts);
    }
  }

  private getMatchingQuads(
    store: RDF.Store,
    subject?: RDF.Quad_Subject,
    predicate?: RDF.Quad_Predicate,
    object?: RDF.Quad_Object,
  ): Promise<RDF.Quad[]> {
    return new Promise((resolve, reject) => {
      const matchingQuads: RDF.Quad[] = [];
      store.match(subject, predicate, object)
        .on('data', (quad: RDF.Quad) => matchingQuads.push(quad))
        .on('error', reject)
        .on('end', () => resolve(matchingQuads));
    });
  }
}

export interface IActorRdfMetadataExtractVoIDCountArgs extends IActorRdfMetadataExtractArgs {
  /**
   * The Dereference RDF mediator.
   * @default {<urn:comunica:default:dereference-rdf/mediators#main>}
   */
  mediatorDereferenceRdf: MediatorDereferenceRdf;
}
