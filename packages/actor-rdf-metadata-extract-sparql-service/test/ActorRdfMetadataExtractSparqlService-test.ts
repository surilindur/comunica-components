import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfMetadataExtractSparqlService } from '../lib/ActorRdfMetadataExtractSparqlService';

const streamifyArray = require('streamify-array');

const DF = new DataFactory();

describe('ActorRdfMetadataExtractSparqlService', () => {
  let bus: any;
  let context: IActionContext;
  let actor: ActorRdfMetadataExtractSparqlService;

  const requestTime = 0;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    context = new ActionContext();
  });

  describe('test', () => {
    beforeEach(() => {
      actor = new ActorRdfMetadataExtractSparqlService({ name: 'actor', bus, inferHttpsEndpoint: false });
    });

    it('should test successfully', async() => {
      await expect(actor.test({ url: 'http://example.org/', metadata: <any> undefined, requestTime, context })).resolves.toBeTruthy();
    });
  });

  describe('run', () => {
    const sparqlIri = DF.namedNode('http://example.org/sparql');
    const sparqlService = DF.namedNode('http://example.org/endpoint');

    const serviceDescriptionFeature = DF.namedNode('http://www.w3.org/ns/sparql-service-description#feature');
    const serviceDescriptionEndpoint = DF.namedNode('http://www.w3.org/ns/sparql-service-description#endpoint');
    const serviceDescriptionUnionDefaultGraph = DF.namedNode('http://www.w3.org/ns/sparql-service-description#UnionDefaultGraph');

    beforeEach(() => {
      actor = new ActorRdfMetadataExtractSparqlService({ name: 'actor', bus, inferHttpsEndpoint: false });
    });

    it('should parse endpoint when available', async() => {
      const input = streamifyArray([ DF.quad(sparqlIri, serviceDescriptionEndpoint, sparqlService) ]);
      await expect(actor.run({ url: sparqlIri.value, metadata: input, context, requestTime })).resolves.toEqual({
        metadata: { sparqlService: sparqlService.value },
      });
    });

    it('should parse endpoint when available with blank node service', async() => {
      const input = streamifyArray([ DF.quad(DF.blankNode(), serviceDescriptionEndpoint, sparqlService) ]);
      await expect(actor.run({ url: sparqlIri.value, metadata: input, context, requestTime })).resolves.toEqual({
        metadata: { sparqlService: sparqlService.value },
      });
    });

    it('should parse relative endpoint when available', async() => {
      const input = streamifyArray([ DF.quad(sparqlIri, serviceDescriptionEndpoint, DF.namedNode('/endpoint')) ]);
      await expect(actor.run({ url: sparqlIri.value, metadata: input, context, requestTime })).resolves.toEqual({
        metadata: { sparqlService: sparqlService.value },
      });
    });

    it('should infer HTTPS endpoint when instructed to', async() => {
      actor = new ActorRdfMetadataExtractSparqlService({ name: 'actor', bus, inferHttpsEndpoint: true });
      const httpsIri = sparqlIri.value.replace(/^http:/u, 'https:');
      const input = streamifyArray([ DF.quad(DF.namedNode(httpsIri), serviceDescriptionEndpoint, sparqlService) ]);
      await expect(actor.run({
        url: httpsIri,
        metadata: input,
        context,
        requestTime,
      })).resolves.toEqual({
        metadata: { sparqlService: sparqlService.value.replace(/^http:/u, 'https:') },
      });
    });

    it('should parse endpoint and UnionDefaultGraph when available', async() => {
      const input = streamifyArray([
        DF.quad(sparqlIri, serviceDescriptionEndpoint, sparqlService),
        DF.quad(sparqlIri, serviceDescriptionFeature, serviceDescriptionUnionDefaultGraph),
      ]);
      await expect(actor.run({ url: sparqlIri.value, metadata: input, context, requestTime })).resolves.toEqual({
        metadata: { sparqlService: sparqlService.value, unionDefaultGraph: true },
      });
    });

    it('should return empty result without endpoint defined', async() => {
      const input = streamifyArray([
        DF.quad(sparqlIri, serviceDescriptionFeature, serviceDescriptionUnionDefaultGraph),
      ]);
      await expect(actor.run({ url: sparqlIri.value, metadata: input, context, requestTime })).resolves.toEqual({
        metadata: {},
      });
    });

    it('should ignore literal endpoint values', async() => {
      const input = streamifyArray([
        DF.quad(sparqlIri, serviceDescriptionEndpoint, DF.literal('/endpoint')),
        DF.quad(sparqlIri, serviceDescriptionFeature, serviceDescriptionUnionDefaultGraph),
      ]);
      await expect(actor.run({ url: sparqlIri.value, metadata: input, context, requestTime })).resolves.toEqual({
        metadata: {},
      });
    });
  });
});
