import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfMetadataExtractLinkFilterVoid } from '../lib/ActorRdfMetadataExtractLinkFilterVoid';
import { rdf_void } from '../lib/vocabularies';
import '@comunica/utils-jest';

describe('ActorRdfMetadataExtractLinkFilterVoid', () => {
  const DF = new DataFactory();
  const bus = <any>{ subscribe: jest.fn() };
  const actor = new ActorRdfMetadataExtractLinkFilterVoid({ bus, name: 'actor' });
  const context = new ActionContext();

  describe('constructor', () => {
    it('should create instance', () => {
      expect(actor).toBeInstanceOf(ActorRdfMetadataExtractLinkFilterVoid);
    });
  });

  describe('test', () => {
    it('should pass when linkFilters array is present in context', async() => {
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, []),
      };
      await expect(actor.test(action)).resolves.toPassTestVoid();
    });

    it('should fail when linkFilters array is missing from context', async() => {
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([]),
        requestTime: 0,
        context,
      };
      await expect(actor.test(action)).resolves.toFailTest(
        'Actor actor requires link filter array in context to extract into',
      );
    });
  });

  describe('run', () => {
    it('should resolve with empty metadata when no metadata is provided', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(0);
    });

    it('should add filter for uriSpace when sparqlEndpoint and uriSpace share same subject', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql')),
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.uriSpace), DF.literal('http://example.org/data/')),
        ]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
      expect(filters[0]({ url: 'http://example.org/data/resource' })).toBe(false);
      expect(filters[0]({ url: 'http://example.org/other/resource' })).toBe(true);
    });

    it('should add filter for uriRegexPattern when sparqlEndpoint and uriRegexPattern share same subject', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql')),
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.uriRegexPattern), DF.literal('http://example.org/api/.*')),
        ]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
      expect(filters[0]({ url: 'http://example.org/api/v1/data' })).toBe(false);
      expect(filters[0]({ url: 'http://example.org/other/path' })).toBe(true);
    });

    it('should prefer uriSpace over uriRegexPattern when both share same subject as sparqlEndpoint', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql')),
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.uriSpace), DF.literal('http://example.org/data/')),
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.uriRegexPattern), DF.literal('http://example.org/api/.*')),
        ]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
      expect(filters[0]({ url: 'http://example.org/data/resource' })).toBe(false);
      expect(filters[0]({ url: 'http://example.org/other/resource' })).toBe(true);
      expect(filters[0]({ url: 'http://example.org/api/v1/data' })).toBe(true);
    });

    it('should not add filter when sparqlEndpoint is missing', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([
          DF.quad(DF.namedNode('http://example.org/otherDataset'), DF.namedNode(rdf_void.uriSpace), DF.literal('http://example.org/data/')),
        ]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      await actor.run(action);
      expect(filters).toHaveLength(0);
    });

    it('should handle multiple datasets with different uriSpaces', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql1')),
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.uriSpace), DF.literal('http://example.org/data1/')),
          DF.quad(DF.namedNode('http://example.org/dataset2'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql2')),
          DF.quad(DF.namedNode('http://example.org/dataset2'), DF.namedNode(rdf_void.uriSpace), DF.literal('http://example.org/data2/')),
        ]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      await actor.run(action);
      expect(filters).toHaveLength(2);
      expect(filters[0]({ url: 'http://example.org/data1/resource' })).toBe(false);
      expect(filters[1]({ url: 'http://example.org/data2/resource' })).toBe(false);
    });

    it('should handle dataset with only sparqlEndpoint (no uriSpace or uriRegexPattern)', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql')),
        ]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      await actor.run(action);
      expect(filters).toHaveLength(0);
    });

    it('should handle multiple sparqlEndpoints with one having uriSpace', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql1')),
          DF.quad(DF.namedNode('http://example.org/dataset1'), DF.namedNode(rdf_void.uriSpace), DF.literal('http://example.org/data1/')),
          DF.quad(DF.namedNode('http://example.org/dataset2'), DF.namedNode(rdf_void.sparqlEndpoint), DF.literal('http://example.org/sparql2')),
        ]),
        requestTime: 0,
        context: context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
      expect(filters[0]({ url: 'http://example.org/data1/resource' })).toBe(false);
    });
  });
});
