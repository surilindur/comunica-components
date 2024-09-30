import type { ActorInitQueryBase } from '@comunica/actor-init-query';
import { QueryEngineBase } from '@comunica/actor-init-query';
import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractOutput,
  IActorRdfMetadataExtractArgs,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import type { IActorTest } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { storeStream } from 'rdf-store-stream';
import { termToString } from 'rdf-string-ttl';
import { VoidCardinalityProvider } from './VoidCardinalityProvider';

/**
 * A comunica Void RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractVoid extends ActorRdfMetadataExtract {
  public readonly queryEngine: QueryEngineBase;
  public readonly inferUriSpace: boolean;

  public constructor(args: IActorRdfMetadataExtractVoidArgs) {
    super(args);
    this.queryEngine = new QueryEngineBase(args.actorInitQuery);
    this.inferUriSpace = args.inferUriSpace;
  }

  public async test(_action: IActionRdfMetadataExtract): Promise<IActorTest> {
    return true;
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const metadataStore = await storeStream(action.metadata);
    const voidDescriptions = await this.getDatasets(metadataStore);
    const metadata = voidDescriptions ?
        { voidDescriptions, voidCardinalityProvider: new VoidCardinalityProvider(voidDescriptions) } :
        {};

    return { metadata };
  }

  public async getDatasets(store: RDF.Store): Promise<Record<string, IVoidDataset>> {
    const datasets: Record<string, IVoidDataset> = {};

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT * WHERE {
        ?dataset rdf:type ?type.

        OPTIONAL { ?dataset void:triples ?triples }
        OPTIONAL { ?dataset void:uriSpace ?uriSpace }
        OPTIONAL { ?dataset void:sparqlEndpoint ?sparqlEndpoint }
        OPTIONAL { ?dataset void:distinctSubjects ?distinctSubjects }
        OPTIONAL { ?dataset void:distinctObjects ?distinctObjects }

        FILTER(?type IN (sd:Graph,sd:Dataset,void:Dataset))
      }`;

    const datasetBindings = await (await this.queryEngine.queryBindings(query, { sources: [ store ]})).toArray();

    for (const bindings of datasetBindings) {
      const dataset = bindings.get('dataset')!;
      if (dataset.termType === 'NamedNode') {
        datasets[dataset.value] = {
          triples: Number.parseInt(bindings.get('triples')?.value ?? '0', 10),
          uriSpace: bindings.get('uriSpace')?.value ?? (
            this.inferUriSpace ? dataset.value.split('.well-known')[0] : undefined
          ),
          sparqlEndpoint: bindings.get('sparqlEndpoint')?.value,
          distinctObjects: Number.parseInt(bindings.get('distinctObjects')?.value ?? '0', 10),
          distinctSubjects: Number.parseInt(bindings.get('distinctSubjects')?.value ?? '0', 10),
          classPartitions: await this.getClassPartitions(dataset, store),
          propertyPartitions: await this.getPropertyPartitions(dataset, store),
        };
      }
    }

    return datasets;
  }

  public async getClassPartitions(
    dataset: RDF.NamedNode | RDF.BlankNode,
    store: RDF.Store,
  ): Promise<Record<string, IVoidClassPartition>> {
    const partitions: Record<string, IVoidClassPartition> = {};

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT * WHERE {
        ${termToString(dataset)} void:classPartition ?classPartition.
        ?classPartition void:class ?class.

        OPTIONAL { ?classPartition void:entities ?entities }
      }`;

    const classPartitionBindings = await (await this.queryEngine.queryBindings(query, {
      sources: [ store ],
    })).toArray();

    for (const bindings of classPartitionBindings) {
      const classIri = bindings.get('class')!;
      const classPartition = bindings.get('classPartition')!;
      if (classPartition.termType === 'NamedNode' || classPartition.termType === 'BlankNode') {
        partitions[classIri.value] = {
          entities: Number.parseInt(bindings.get('entities')?.value ?? '0', 10),
          propertyPartitions: await this.getPropertyPartitions(classPartition, store),
        };
      }
    }

    return partitions;
  };

  public async getPropertyPartitions(
    dataset: RDF.NamedNode | RDF.BlankNode,
    store: RDF.Store,
  ): Promise<Record<string, IVoidPropertyPartition>> {
    const partitions: Record<string, IVoidPropertyPartition> = {};

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT * WHERE {
        ${termToString(dataset)} void:propertyPartition ?propertyPartition.
        ?propertyPartition void:property ?property.

        OPTIONAL { ?propertyPartition void:triples ?triples }
        OPTIONAL { ?propertyPartition void:distinctSubjects ?distinctSubjects }
        OPTIONAL { ?propertyPartition void:distinctObjects ?distinctObjects }
      }`;

    const propertyPartitionBindings = await (await this.queryEngine.queryBindings(query, {
      sources: [ store ],
    })).toArray();

    for (const bindings of propertyPartitionBindings) {
      const propertyIri = bindings.get('property')!;
      partitions[propertyIri.value] = {
        triples: Number.parseInt(bindings.get('triples')?.value ?? '0', 10),
        distinctObjects: Number.parseInt(bindings.get('distinctObjects')?.value ?? '0', 10),
        distinctSubjects: Number.parseInt(bindings.get('distinctSubjects')?.value ?? '0', 10),
      };
    }

    return partitions;
  };
}

export interface IActorRdfMetadataExtractVoidArgs extends IActorRdfMetadataExtractArgs {
  /**
   * An init query actor that is used to query shapes.
   * @default {<urn:comunica:default:init/actors#query>}
   */
  actorInitQuery: ActorInitQueryBase;
  /**
   * Whether URI prefixes should be inferred based on dataset URI if not present in the VoID description.
   * @default {true}
   */
  inferUriSpace: boolean;
}

export interface IVoidDataset {
  triples: number;
  uriSpace?: string;
  sparqlEndpoint?: string;
  distinctSubjects: number;
  distinctObjects: number;
  propertyPartitions: Record<string, IVoidPropertyPartition>;
  classPartitions: Record<string, IVoidClassPartition>;
}

export interface IVoidPropertyPartition {
  triples: number;
  distinctSubjects: number;
  distinctObjects: number;
}

export interface IVoidClassPartition {
  entities: number;
  propertyPartitions: Record<string, IVoidPropertyPartition>;
}

export interface IVoidCardinalityProvider {
  getCardinality: (
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    graph: RDF.Term,
  ) => RDF.QueryResultCardinality;
}
