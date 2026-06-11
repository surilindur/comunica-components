import { KeysInitQuery } from '@comunica/context-entries';
import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import { AlgebraFactory } from '@comunica/utils-algebra';
import type { Algebra } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfMetadataExtractLinkFilterBloom } from '../lib/ActorRdfMetadataExtractLinkFilterBloom';
import { mem } from '../lib/vocabularies';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

const B64 = Buffer.from([ 0, 0, 0, 0 ]).toString('base64');

const filterUri = 'ex:filter1';
const memberCollectionUri = 'ex:memberCollection1';
const sourceCollectionUri = 'ex:sourceCollection1';
const datasetUri = 'ex:dataset1';

describe('ActorRdfMetadataExtractLinkFilterBloom', () => {
  let bus: any;
  let actor: ActorRdfMetadataExtractLinkFilterBloom;
  let context: ActionContext;

  beforeEach(() => {
    bus = { subscribe: jest.fn() };
    actor = new ActorRdfMetadataExtractLinkFilterBloom({
      bus,
      name: 'actor',
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
        context: context.set(KeysInitQuery.query, AF.createUnion([])).set(
          KeysRdfResolveHypermediaLinks.linkFilters,
          [],
        ),
      };
      await expect(actor.test(action)).resolves.toPassTestVoid();
    });

    it('should fail when linkFilters array is missing from context', async() => {
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([]),
        requestTime: 0,
        context: context.set(KeysInitQuery.query, AF.createUnion([])),
      };
      await expect(actor.test(action)).resolves.toFailTest(
        'Unable to extract filters without filter output array in context',
      );
    });
  });

  describe('run', () => {
    const bloomQuads = (extra: RDF.Quad[] = []): RDF.Quad[] => [
      DF.quad(
        DF.namedNode(sourceCollectionUri),
        DF.namedNode(mem.sourceCollection.toString()),
        DF.namedNode(datasetUri),
      ),
      DF.quad(
        DF.namedNode(memberCollectionUri),
        DF.namedNode(mem.memberCollection.toString()),
        DF.namedNode(filterUri),
      ),
      DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.bitSize.toString()), DF.literal('100')),
      DF.quad(
        DF.namedNode(filterUri),
        DF.namedNode(mem.hashFunction.toString()),
        DF.literal('http://example.org/hash'),
      ),
      DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.hashSize.toString()), DF.literal('4')),
      DF.quad(
        DF.namedNode(filterUri),
        DF.namedNode(mem.binaryRepresentation.toString()),
        DF.literal(B64),
      ),
      ...extra,
    ];

    it('should resolve with empty metadata when no metadata is provided', async() => {
      const actionContext = context.set(KeysRdfResolveHypermediaLinks.linkFilters, []);
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([]),
        requestTime: 0,
        context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
    });

    it('should add filter for irrelevant dataset when bloom filter data is complete', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context.set(
        KeysRdfResolveHypermediaLinks.linkFilters,
        filters,
      );
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(bloomQuads()),
        requestTime: 0,
        context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
      expect(filters[0]({ url: `${datasetUri}#resource` })).toBe(false);
      expect(filters[0]({ url: 'http://other.example.org/resource' })).toBe(true);
    });

    describe('should add filter when bloom filter data is incomplete', () => {
      it.each`
        missingField
        ${'bitSize'}
        ${'hashSize'}
        ${'binaryRepresentation'}
      `('missing $missingField', async({ missingField }: { missingField: string }) => {
        const completeBloom = [
          DF.quad(
            DF.namedNode(sourceCollectionUri),
            DF.namedNode(mem.sourceCollection.toString()),
            DF.namedNode(datasetUri),
          ),
          DF.quad(
            DF.namedNode(memberCollectionUri),
            DF.namedNode(mem.memberCollection.toString()),
            DF.namedNode(filterUri),
          ),
        ];
        const bloomParts = {
          bitSize: DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.bitSize.toString()), DF.literal('100')),
          hashFunction: DF.quad(
            DF.namedNode(filterUri),
            DF.namedNode(mem.hashFunction.toString()),
            DF.literal('http://example.org/hash'),
          ),
          hashSize: DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.hashSize.toString()), DF.literal('4')),
          binaryRepresentation: DF.quad(
            DF.namedNode(filterUri),
            DF.namedNode(mem.binaryRepresentation.toString()),
            DF.literal(B64),
          ),
        };
        const quads = [
          ...completeBloom,
          ...(missingField === 'bitSize' ? [] : [ bloomParts.bitSize ]),
          bloomParts.hashFunction,
          ...(missingField === 'hashSize' ? [] : [ bloomParts.hashSize ]),
          ...(missingField === 'binaryRepresentation' ? [] : [ bloomParts.binaryRepresentation ]),
        ];
        const filters: ((link: any) => boolean)[] = [];
        const actionContext = context.set(
          KeysRdfResolveHypermediaLinks.linkFilters,
          filters,
        );
        const action = {
          url: 'http://example.org',
          metadata: new ArrayIterator(quads),
          requestTime: 0,
          context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
        };
        await actor.run(action);
        expect(filters).toHaveLength(1);
        expect(filters[0]({ url: `${datasetUri}#resource` })).toBe(false);
      });
    });

    it('should not add filter when dataset is not in sourceCollections', async() => {
      const quads = [
        DF.quad(
          DF.namedNode(memberCollectionUri),
          DF.namedNode(mem.memberCollection.toString()),
          DF.namedNode(filterUri),
        ),
        DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.bitSize.toString()), DF.literal('100')),
        DF.quad(
          DF.namedNode(filterUri),
          DF.namedNode(mem.hashFunction.toString()),
          DF.literal('http://example.org/hash'),
        ),
        DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.hashSize.toString()), DF.literal('4')),
        DF.quad(
          DF.namedNode(filterUri),
          DF.namedNode(mem.binaryRepresentation.toString()),
          DF.literal(B64),
        ),
      ];
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context.set(
        KeysRdfResolveHypermediaLinks.linkFilters,
        filters,
      );
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
      };
      await actor.run(action);
      expect(filters).toHaveLength(0);
    });

    it('should handle bloom filter without hashFunction', async() => {
      const quads = [
        DF.quad(
          DF.namedNode(sourceCollectionUri),
          DF.namedNode(mem.sourceCollection.toString()),
          DF.namedNode(datasetUri),
        ),
        DF.quad(
          DF.namedNode(memberCollectionUri),
          DF.namedNode(mem.memberCollection.toString()),
          DF.namedNode(filterUri),
        ),
        DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.bitSize.toString()), DF.literal('100')),
        DF.quad(DF.namedNode(filterUri), DF.namedNode(mem.hashSize.toString()), DF.literal('4')),
        DF.quad(
          DF.namedNode(filterUri),
          DF.namedNode(mem.binaryRepresentation.toString()),
          DF.literal(B64),
        ),
      ];
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context.set(
        KeysRdfResolveHypermediaLinks.linkFilters,
        filters,
      );
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
    });

    it('should handle projectedProperty in bloom filter', async() => {
      const quads = [
        ...bloomQuads(),
        DF.quad(
          DF.namedNode('ex:projected1'),
          DF.namedNode(mem.memberCollection.toString()),
          DF.namedNode(filterUri),
        ),
        DF.quad(
          DF.namedNode('ex:projected1'),
          DF.namedNode(mem.projectedProperty.toString()),
          DF.literal('http://example.org/property'),
        ),
      ];
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context.set(
        KeysRdfResolveHypermediaLinks.linkFilters,
        filters,
      );
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
    });

    it('should handle projectedResource in bloom filter', async() => {
      const quads = [
        ...bloomQuads(),
        DF.quad(
          DF.namedNode('ex:projected2'),
          DF.namedNode(mem.memberCollection.toString()),
          DF.namedNode(filterUri),
        ),
        DF.quad(
          DF.namedNode('ex:projected2'),
          DF.namedNode(mem.projectedResource.toString()),
          DF.literal('ex:resource'),
        ),
      ];
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context.set(
        KeysRdfResolveHypermediaLinks.linkFilters,
        filters,
      );
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
      };
      await actor.run(action);
      expect(filters).toHaveLength(1);
    });

    it('should log warn when ignoring a link', async() => {
      const logWarnMock = jest.fn();
      const actorWithMockedLog: any = Object.assign(actor, { logWarn: logWarnMock });

      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context.set(KeysRdfResolveHypermediaLinks.linkFilters, filters);
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(bloomQuads()),
        requestTime: 0,
        context: actionContext.set(KeysInitQuery.query, AF.createUnion([])),
      };

      const result = await ActorRdfMetadataExtractLinkFilterBloom.prototype.run.call(actorWithMockedLog, action);

      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
      filters[0]({ url: datasetUri });
      expect(logWarnMock).toHaveBeenCalledTimes(1);
      expect(logWarnMock.mock.calls[0][1]).toBe(`Ignoring link: ${datasetUri}`);
    });
  });

  describe('extractPatterns', () => {
    const makePattern = (s: RDF.Term, p: string, o: RDF.Term) =>
      AF.createPattern(s, DF.namedNode(p), o);
    const makeOperation = (patterns: Algebra.Operation[]) => AF.createUnion(patterns);

    it('should extract single pattern', () => {
      const operation = makeOperation([ makePattern(DF.variable('s'), 'ex:p', DF.variable('o')) ]);
      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);
      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.variable('s'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:p'));
      expect(result[0].object).toEqual(DF.variable('o'));
    });

    it('should extract multiple patterns', () => {
      const patterns = [
        makePattern(DF.variable('s'), 'ex:p1', DF.variable('o1')),
        makePattern(DF.variable('s'), 'ex:p2', DF.variable('o2')),
      ];
      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(makeOperation(patterns));
      expect(result).toHaveLength(2);
      expect(result[0].subject).toEqual(DF.variable('s'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:p1'));
      expect(result[0].object).toEqual(DF.variable('o1'));
      expect(result[1].subject).toEqual(DF.variable('s'));
      expect(result[1].predicate).toEqual(DF.namedNode('ex:p2'));
      expect(result[1].object).toEqual(DF.variable('o2'));
    });

    it('should extract pattern from join operation', () => {
      const pattern = makePattern(DF.variable('s'), 'ex:p', DF.variable('o'));
      const operation = makeOperation([ AF.createJoin([ pattern ]) ]);
      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);
      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.variable('s'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:p'));
      expect(result[0].object).toEqual(DF.variable('o'));
    });

    it('should return empty array for non-pattern operation', () => {
      const pattern = makePattern(DF.variable('s'), 'ex:p', DF.variable('o'));
      const join = AF.createJoin([ pattern ]);
      const project = AF.createProject(join, [ DF.variable('s') ]);
      const operation = makeOperation([ project ]);
      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);
      expect(result).toHaveLength(1);
    });

    it('should handle pattern with constant subject', () => {
      const pattern = makePattern(DF.namedNode('ex:subject'), 'ex:predicate', DF.variable('object'));
      const operation = makeOperation([ pattern ]);
      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);
      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.namedNode('ex:subject'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:predicate'));
      expect(result[0].object).toEqual(DF.variable('object'));
    });

    it('should handle pattern with constant object', () => {
      const operation = makeOperation([ makePattern(DF.variable('subject'), 'ex:predicate', DF.literal('value')) ]);
      const result = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(operation);
      expect(result).toHaveLength(1);
      expect(result[0].subject).toEqual(DF.variable('subject'));
      expect(result[0].predicate).toEqual(DF.namedNode('ex:predicate'));
      expect(result[0].object).toEqual(DF.literal('value'));
    });
  });
});
