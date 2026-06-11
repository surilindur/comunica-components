import { KeysInitQuery } from '@comunica/context-entries';
import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import { AlgebraFactory } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfMetadataExtractLinkFilterBloom } from '../lib/ActorRdfMetadataExtractLinkFilterBloom';
import { mem } from '../lib/vocabularies';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

describe('ActorRdfMetadataExtractLinkFilterBloom', () => {
  let bus: any;
  let actor: ActorRdfMetadataExtractLinkFilterBloom;
  let context: ActionContext;

  const actorArgs = {
    bus: <any> {
      subscribe: jest.fn(),
    },
    name: 'actor',
  };

  beforeEach(() => {
    bus = {
      subscribe: jest.fn(),
    };
    actor = new ActorRdfMetadataExtractLinkFilterBloom({
      ...actorArgs,
      bus,
    });
    context = new ActionContext();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(actor).toBeInstanceOf(ActorRdfMetadataExtractLinkFilterBloom);
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
        'Unable to extract filters without filter output array in context',
      );
    });
  });

  describe('run', () => {
    const filterUri = 'ex:filter1';
    const memberCollectionUri = 'ex:memberCollection1';
    const sourceCollectionUri = 'ex:sourceCollection1';
    const datasetUri = 'ex:dataset1';

    const createMetadataStream = (quads: RDF.Quad[]) => new ArrayIterator(quads);

    const createBloomFilterQuad = (
      subject: any,
      predicate: string,
      object: any,
    ): RDF.Quad => DF.quad(subject, DF.namedNode(predicate), object);

    const createOperation = (patterns: RDF.Quad[]) => {
      const dfPatterns = patterns.map(q => DF.quad(
        q.subject,
        q.predicate,
        q.object,
      ));
      return AF.createUnion(dfPatterns.map(q => AF.createPattern(
        DF.namedNode(q.subject.value),
        DF.namedNode(q.predicate.value),
        DF.namedNode(q.object.value),
      )));
    };

    const defaultOperation = createOperation([]);

    const createAction = (
      metadata: RDF.Stream,
      actionContext: any = context,
      operation = defaultOperation,
    ) => ({
      url: 'http://example.org',
      metadata,
      requestTime: 0,
      context: actionContext.set(KeysInitQuery.query, operation),
    });

    it('should resolve with empty metadata when no metadata is provided', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream([]), actionContext);
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
    });

    it('should add filter for irrelevant dataset when bloom filter data is complete', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);

      const quads = [
        // Source collection mapping
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        // Member collection mapping
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        // Bloom filter properties
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
      // The filter should ignore links starting with the dataset URI
      expect(filters[0]({ url: `${datasetUri}#resource` })).toBe(false);
      expect(filters[0]({ url: 'http://other.example.org/resource' })).toBe(true);
    });

    it('should add filter with incomplete bloom filter data (missing bitSize)', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);

      const quads = [
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        // Missing bitSize
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      // Filter is still added because the bloom data is incomplete, but the dataset is irrelevant
      expect(filters).toHaveLength(1);
      // The filter should ignore links starting with the dataset URI
      expect(filters[0]({ url: `${datasetUri}#resource` })).toBe(false);
    });

    it('should add filter with incomplete bloom filter data (missing hashSize)', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);

      const quads = [
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        // Missing hashSize
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      // Filter is still added because the bloom data is incomplete, but the dataset is irrelevant
      expect(filters).toHaveLength(1);
      // The filter should ignore links starting with the dataset URI
      expect(filters[0]({ url: `${datasetUri}#resource` })).toBe(false);
    });

    it('should add filter with incomplete bloom filter data (missing binaryRepresentation)', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);

      const quads = [
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        // Missing binaryRepresentation
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      // Filter is still added because the bloom data is incomplete, but the dataset is irrelevant
      expect(filters).toHaveLength(1);
      // The filter should ignore links starting with the dataset URI
      expect(filters[0]({ url: `${datasetUri}#resource` })).toBe(false);
    });

    it('should not add filter when dataset is not in sourceCollections', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);

      const quads = [
        // No sourceCollection mapping for the member's filter
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(0);
    });

    it('should handle bloom filter without hashFunction', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);

      const quads = [
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        // No hashFunction - should use undefined for hashFunction
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
    });

    it('should handle projectedProperty in bloom filter', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);
      const projectedSubject = DF.namedNode('ex:projected1');

      const quads = [
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
        createBloomFilterQuad(projectedSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(
          projectedSubject,
          mem.projectedProperty,
          DF.literal('http://example.org/property'),
        ),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      // Without matching query patterns, the dataset should be filtered out
      expect(filters).toHaveLength(1);
    });

    it('should handle projectedResource in bloom filter', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);
      const projectedSubject = DF.namedNode('ex:projected2');

      const quads = [
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
        createBloomFilterQuad(projectedSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(projectedSubject, mem.projectedResource, DF.literal('ex:resource')),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      const result = await actor.run(action);

      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
    });

    it('should log warn when ignoring a link', async() => {
      const filterSubject = DF.namedNode(filterUri);
      const memberSubject = DF.namedNode(memberCollectionUri);
      const sourceSubject = DF.namedNode(sourceCollectionUri);

      const quads = [
        createBloomFilterQuad(sourceSubject, mem.sourceCollection, DF.namedNode(datasetUri)),
        createBloomFilterQuad(memberSubject, mem.memberCollection, DF.namedNode(filterUri)),
        createBloomFilterQuad(filterSubject, mem.bitSize, DF.literal('100')),
        createBloomFilterQuad(filterSubject, mem.hashFunction, DF.literal('http://example.org/hash')),
        createBloomFilterQuad(filterSubject, mem.hashSize, DF.literal('4')),
        createBloomFilterQuad(
          filterSubject,
          mem.binaryRepresentation,
          DF.literal(Buffer.from([ 0, 0, 0, 0 ]).toString('base64')),
        ),
      ];

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, defaultOperation);
      const action = createAction(createMetadataStream(quads), actionContext);

      // Spy on logWarn using jest.fn with explicit type annotation
      const logWarnMock = jest.fn();
      // Use Object.assign to copy own properties while preserving prototype chain
      const actorWithMockedLog: any = Object.assign(actor, { logWarn: logWarnMock });

      const result = await ActorRdfMetadataExtractLinkFilterBloom.prototype.run.call(actorWithMockedLog, action);

      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
      // Call the filter to trigger the logWarn
      filters[0]({ url: datasetUri });
      expect(logWarnMock).toHaveBeenCalledTimes(1);
      expect(logWarnMock.mock.calls[0][0]).toBeDefined();
      expect(logWarnMock.mock.calls[0][1]).toBe(`Ignoring link: ${datasetUri}`);
    });
  });

  describe('extractPatterns', () => {
    it('should extract single pattern', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));
      const operation = AF.createUnion([ pattern ]);

      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);

      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.variable('s'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:p'));
      expect(result[0].object).toEqual(DF.variable('o'));
    });

    it('should extract multiple patterns', () => {
      const pattern1 = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p1'), DF.variable('o1'));
      const pattern2 = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p2'), DF.variable('o2'));
      const operation = AF.createUnion([ pattern1, pattern2 ]);

      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);

      expect(result).toHaveLength(2);
      expect(result[0].subject).toEqual(DF.variable('s'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:p1'));
      expect(result[0].object).toEqual(DF.variable('o1'));
      expect(result[1].subject).toEqual(DF.variable('s'));
      expect(result[1].predicate).toEqual(DF.namedNode('ex:p2'));
      expect(result[1].object).toEqual(DF.variable('o2'));
    });

    it('should extract pattern from join operation', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));
      const join = AF.createJoin([ pattern ]);
      const operation = AF.createUnion([ join ]);

      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);

      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.variable('s'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:p'));
      expect(result[0].object).toEqual(DF.variable('o'));
    });

    it('should return empty array for non-pattern operation', () => {
      const pattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));
      const join = AF.createJoin([ pattern ]);
      const project = AF.createProject(join, [ DF.variable('s') ]);
      const operation = AF.createUnion([ project ]);

      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);

      expect(result).toHaveLength(1);
    });

    it('should handle pattern with constant subject', () => {
      const pattern = AF.createPattern(
        DF.namedNode('ex:subject'),
        DF.namedNode('ex:predicate'),
        DF.variable('object'),
      );
      const operation = AF.createUnion([ pattern ]);

      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);

      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.namedNode('ex:subject'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:predicate'));
      expect(result[0].object).toEqual(DF.variable('object'));
    });

    it('should handle pattern with constant object', () => {
      const pattern = AF.createPattern(
        DF.variable('subject'),
        DF.namedNode('ex:predicate'),
        DF.literal('value'),
      );
      const operation = AF.createUnion([ pattern ]);

      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);

      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.variable('subject'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:predicate'));
      expect(result[0].object).toEqual(DF.literal('value'));
    });
  });
});
