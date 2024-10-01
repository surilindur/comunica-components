import { ActorInitQuery } from '@comunica/actor-init-query';
import { Bus } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { storeStream } from 'rdf-store-stream';
import { ActorRdfMetadataExtractVoid } from '../lib/ActorRdfMetadataExtractVoid';

jest.mock('rdf-store-stream');
jest.mock('@comunica/actor-init-query');
jest.mock('@comunica/bus-rdf-metadata-extract');

const DF = new DataFactory();

describe('ActorRdfMetadataExtractVoid', () => {
  let bus: any;
  let actor: ActorRdfMetadataExtractVoid;
  let actorInitQuery: ActorInitQuery;

  beforeEach(() => {
    jest.resetAllMocks();
    bus = new Bus({ name: 'bus' });
    actorInitQuery = new ActorInitQuery(<any> {});
    actor = new ActorRdfMetadataExtractVoid({
      bus,
      name: 'actor',
      actorInitQuery,
      inferUriSpace: false,
    });
  });

  describe('test', () => {
    it('should test', async() => {
      await expect(actor.test(<any> {})).resolves.toBeTruthy();
    });
  });

  describe('run', () => {
    it('should run', async() => {
      jest.spyOn(actor, 'getDatasets').mockResolvedValue(<any>[ 'dataset' ]);
      expect(storeStream).not.toHaveBeenCalled();
      expect(actor.getDatasets).not.toHaveBeenCalled();
      await expect(actor.run(<any>{ metadata: 'metadata' })).resolves.toEqual({
        metadata: { voidDescriptions: [ 'dataset' ]},
      });
      expect(storeStream).toHaveBeenCalledTimes(1);
      expect(storeStream).toHaveBeenNthCalledWith(1, 'metadata');
      expect(actor.getDatasets).toHaveBeenCalledTimes(1);
      expect(actor.getDatasets).toHaveBeenNthCalledWith(1, undefined);
    });

    it('should run without datasets present', async() => {
      jest.spyOn(actor, 'getDatasets').mockResolvedValue({});
      expect(storeStream).not.toHaveBeenCalled();
      await expect(actor.run(<any>{ metadata: 'metadata' })).resolves.toEqual({
        metadata: {},
      });
      expect(storeStream).toHaveBeenCalledTimes(1);
      expect(storeStream).toHaveBeenNthCalledWith(1, 'metadata');
    });
  });

  describe('getDatasets', () => {
    it('should discover complete dataset descriptions', async() => {
      jest.spyOn((<any> actor).queryEngine, 'queryBindings').mockResolvedValue(<any> {
        toArray: () => Promise.resolve<RDF.Bindings[]>([
          <any> new Map<string, RDF.Term>([
            [ 'dataset', DF.namedNode('ex:dataset') ],
            [ 'triples', DF.literal('10') ],
            [ 'uriSpace', DF.literal('ex:urispace') ],
            [ 'sparqlEndpoint', DF.namedNode('ex:endpoint') ],
            [ 'distinctSubjects', DF.literal('20') ],
            [ 'distinctObjects', DF.literal('30') ],
          ]),
        ]),
      });
      jest.spyOn(actor, 'getPropertyPartitions').mockResolvedValue(<any>'pp');
      jest.spyOn(actor, 'getClassPartitions').mockResolvedValue(<any>'cp');
      expect(actor.getPropertyPartitions).not.toHaveBeenCalled();
      expect(actor.getClassPartitions).not.toHaveBeenCalled();
      await expect(actor.getDatasets(<any>'store')).resolves.toEqual([
        {
          iri: 'ex:dataset',
          triples: 10,
          uriSpace: 'ex:urispace',
          sparqlEndpoint: 'ex:endpoint',
          distinctSubjects: 20,
          distinctObjects: 30,
          classPartitions: 'cp',
          propertyPartitions: 'pp',
        },
      ]);
      expect(actor.getPropertyPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getClassPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getPropertyPartitions).toHaveBeenNthCalledWith(1, 'ex:dataset', 'store');
      expect(actor.getClassPartitions).toHaveBeenNthCalledWith(1, 'ex:dataset', 'store');
    });

    it('should discover partial dataset descriptions', async() => {
      jest.spyOn((<any> actor).queryEngine, 'queryBindings').mockResolvedValue(<any> {
        toArray: () => Promise.resolve<RDF.Bindings[]>([
          <any> new Map<string, RDF.Term>([
            [ 'dataset', DF.namedNode('ex:dataset') ],
          ]),
        ]),
      });
      jest.spyOn(actor, 'getPropertyPartitions').mockResolvedValue(<any>'pp');
      jest.spyOn(actor, 'getClassPartitions').mockResolvedValue(<any>'cp');
      expect(actor.getPropertyPartitions).not.toHaveBeenCalled();
      expect(actor.getClassPartitions).not.toHaveBeenCalled();
      await expect(actor.getDatasets(<any>'store')).resolves.toEqual([
        {
          iri: 'ex:dataset',
          triples: 0,
          uriSpace: undefined,
          sparqlEndpoint: undefined,
          distinctSubjects: 0,
          distinctObjects: 0,
          classPartitions: 'cp',
          propertyPartitions: 'pp',
        },
      ]);
      expect(actor.getPropertyPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getClassPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getPropertyPartitions).toHaveBeenNthCalledWith(1, 'ex:dataset', 'store');
      expect(actor.getClassPartitions).toHaveBeenNthCalledWith(1, 'ex:dataset', 'store');
    });

    it('should infer missing uriSpace based on dataset when instructed to', async() => {
      (<any>actor).inferUriSpace = true;
      jest.spyOn((<any> actor).queryEngine, 'queryBindings').mockResolvedValue(<any> {
        toArray: () => Promise.resolve<RDF.Bindings[]>([
          <any> new Map<string, RDF.Term>([
            [ 'dataset', DF.namedNode('ex:dataset/.well-known/ds') ],
          ]),
        ]),
      });
      jest.spyOn(actor, 'getPropertyPartitions').mockResolvedValue(<any>'pp');
      jest.spyOn(actor, 'getClassPartitions').mockResolvedValue(<any>'cp');
      expect(actor.getPropertyPartitions).not.toHaveBeenCalled();
      expect(actor.getClassPartitions).not.toHaveBeenCalled();
      await expect(actor.getDatasets(<any>'store')).resolves.toEqual([
        {
          iri: 'ex:dataset/.well-known/ds',
          triples: 0,
          uriSpace: 'ex:dataset/',
          sparqlEndpoint: undefined,
          distinctSubjects: 0,
          distinctObjects: 0,
          classPartitions: 'cp',
          propertyPartitions: 'pp',
        },
      ]);
      expect(actor.getPropertyPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getClassPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getPropertyPartitions).toHaveBeenNthCalledWith(1, 'ex:dataset/.well-known/ds', 'store');
      expect(actor.getClassPartitions).toHaveBeenNthCalledWith(1, 'ex:dataset/.well-known/ds', 'store');
    });
  });

  describe('getClassPartitions', () => {
    it('should discover complete class partitions', async() => {
      jest.spyOn((<any> actor).queryEngine, 'queryBindings').mockResolvedValue(<any> {
        toArray: () => Promise.resolve<RDF.Bindings[]>([
          <any> new Map<string, RDF.Term>([
            [ 'classPartition', DF.namedNode('ex:classPartition') ],
            [ 'class', DF.namedNode('ex:class') ],
            [ 'entities', DF.literal('15') ],
          ]),
        ]),
      });
      jest.spyOn(actor, 'getPropertyPartitions').mockResolvedValue(<any>'pp');
      expect(actor.getPropertyPartitions).not.toHaveBeenCalled();
      await expect(actor.getClassPartitions(<any>'ex:dataset', <any>'store')).resolves.toEqual({
        'ex:class': {
          entities: 15,
          propertyPartitions: 'pp',
        },
      });
      expect(actor.getPropertyPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getPropertyPartitions).toHaveBeenNthCalledWith(1, 'ex:classPartition', 'store');
    });

    it('should discover partial class partitions', async() => {
      jest.spyOn((<any> actor).queryEngine, 'queryBindings').mockResolvedValue(<any> {
        toArray: () => Promise.resolve<RDF.Bindings[]>([
          <any> new Map<string, RDF.Term>([
            [ 'classPartition', DF.namedNode('ex:classPartition') ],
            [ 'class', DF.namedNode('ex:class') ],
          ]),
        ]),
      });
      jest.spyOn(actor, 'getPropertyPartitions').mockResolvedValue(<any>'pp');
      expect(actor.getPropertyPartitions).not.toHaveBeenCalled();
      await expect(actor.getClassPartitions(<any>'ex:dataset', <any>'store')).resolves.toEqual({
        'ex:class': {
          entities: 0,
          propertyPartitions: 'pp',
        },
      });
      expect(actor.getPropertyPartitions).toHaveBeenCalledTimes(1);
      expect(actor.getPropertyPartitions).toHaveBeenNthCalledWith(1, 'ex:classPartition', 'store');
    });
  });

  describe('getPropertyPartitions', () => {
    it('should discover complete property partitions', async() => {
      jest.spyOn((<any> actor).queryEngine, 'queryBindings').mockResolvedValue(<any> {
        toArray: () => Promise.resolve<RDF.Bindings[]>([
          <any> new Map<string, RDF.Term>([
            [ 'propertyPartition', DF.namedNode('ex:propertyPartition') ],
            [ 'property', DF.namedNode('ex:property') ],
            [ 'triples', DF.literal('30') ],
            [ 'distinctSubjects', DF.literal('10') ],
            [ 'distinctObjects', DF.literal('20') ],
          ]),
        ]),
      });
      await expect(actor.getPropertyPartitions(<any>'ex:dataset', <any>'store')).resolves.toEqual({
        'ex:property': {
          triples: 30,
          distinctSubjects: 10,
          distinctObjects: 20,
        },
      });
    });

    it('should discover partial property partitions', async() => {
      jest.spyOn((<any> actor).queryEngine, 'queryBindings').mockResolvedValue(<any> {
        toArray: () => Promise.resolve<RDF.Bindings[]>([
          <any> new Map<string, RDF.Term>([
            [ 'propertyPartition', DF.namedNode('ex:propertyPartition') ],
            [ 'property', DF.namedNode('ex:property') ],
          ]),
        ]),
      });
      await expect(actor.getPropertyPartitions(<any>'ex:dataset', <any>'store')).resolves.toEqual({
        'ex:property': {
          triples: 0,
          distinctSubjects: 0,
          distinctObjects: 0,
        },
      });
    });
  });
});
