import { KeysInitQuery } from '@comunica/context-entries';
import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import { ActionContext } from '@comunica/core';
import type { Algebra } from '@comunica/utils-algebra';
import { AlgebraFactory } from '@comunica/utils-algebra';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfMetadataExtractLinkFilterBloom } from '../lib/ActorRdfMetadataExtractLinkFilterBloom';
import { mem } from '../lib/vocabularies';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);

// Helper to create a Bloom filter binary representation buffer
function createBloomBuffer(bitSize: number, hashSize: number, setBits: number[][]): Buffer {
  const totalBytes = Math.ceil(bitSize / 8);
  const buffer = Buffer.alloc(totalBytes, 0);
  for (const [ bitIndex ] of setBits) {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    if (byteIndex < totalBytes) {
      buffer[byteIndex] |= (1 << bitOffset);
    }
  }
  return buffer;
}

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
    const mockQueryOperation = { type: 'query', input: AF.createBgp([]) };

    it('should resolve with empty metadata when no metadata is provided', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, <any>mockQueryOperation);
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator<RDF.Quad>([]),
        requestTime: 0,
        context: actionContext,
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(0);
    });

    it('should add link filter when bloom filter metadata is incomplete', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, <any>mockQueryOperation);
      // Missing bitSize, hashSize, or binaryRepresentation - bloom filter can't be reconstructed
      const quads: RDF.Quad[] = [
        DF.quad(
          DF.namedNode('http://example.org/bloom1'),
          DF.namedNode(mem.memberCollection),
          DF.literal('http://example.org/collection1'),
        ),
        DF.quad(
          DF.namedNode('http://example.org/collection1'),
          DF.namedNode(mem.sourceCollection),
          DF.literal('http://example.org/dataset1'),
        ),
        // Missing bitSize, hashSize, binaryRepresentation
      ];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext,
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
    });

    it('should add link filter that ignores links matching bloom filter dataset URI', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, <any>mockQueryOperation);
      const datasetUri = 'http://example.org/dataset1';
      const bloomFilterUri = 'http://example.org/bloom1';
      const collectionUri = 'http://example.org/collection1';
      const bitSize = 64;
      const hashSize = 3;
      const buffer = createBloomBuffer(bitSize, hashSize, [[ 0 ], [ 10 ], [ 50 ]]);
      const base64Buffer = buffer.toString('base64');
      const quads: RDF.Quad[] = [
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.memberCollection),
          DF.literal(collectionUri),
        ),
        DF.quad(
          DF.namedNode(collectionUri),
          DF.namedNode(mem.sourceCollection),
          DF.literal(datasetUri),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.bitSize),
          DF.literal(String(bitSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.hashSize),
          DF.literal(String(hashSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.binaryRepresentation),
          DF.literal(base64Buffer),
        ),
      ];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext,
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
      expect(filters[0]({ url: datasetUri })).toBe(false);
      expect(filters[0]({ url: 'http://other.org/resource' })).toBe(true);
    });

    it('should add multiple link filters for multiple datasets', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, <any>mockQueryOperation);
      const datasetUri1 = 'http://example.org/dataset1';
      const datasetUri2 = 'http://example.org/dataset2';
      const bloomFilterUri1 = 'http://example.org/bloom1';
      const bloomFilterUri2 = 'http://example.org/bloom2';
      const collectionUri1 = 'http://example.org/collection1';
      const collectionUri2 = 'http://example.org/collection2';
      const bitSize = 64;
      const hashSize = 3;
      const buffer1 = createBloomBuffer(bitSize, hashSize, [[ 0 ]]);
      const buffer2 = createBloomBuffer(bitSize, hashSize, [[ 1 ]]);
      const quads: RDF.Quad[] = [
        DF.quad(
          DF.namedNode(bloomFilterUri1),
          DF.namedNode(mem.memberCollection),
          DF.literal(collectionUri1),
        ),
        DF.quad(
          DF.namedNode(collectionUri1),
          DF.namedNode(mem.sourceCollection),
          DF.literal(datasetUri1),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri1),
          DF.namedNode(mem.bitSize),
          DF.literal(String(bitSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri1),
          DF.namedNode(mem.hashSize),
          DF.literal(String(hashSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri1),
          DF.namedNode(mem.binaryRepresentation),
          DF.literal(buffer1.toString('base64')),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri2),
          DF.namedNode(mem.memberCollection),
          DF.literal(collectionUri2),
        ),
        DF.quad(
          DF.namedNode(collectionUri2),
          DF.namedNode(mem.sourceCollection),
          DF.literal(datasetUri2),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri2),
          DF.namedNode(mem.bitSize),
          DF.literal(String(bitSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri2),
          DF.namedNode(mem.hashSize),
          DF.literal(String(hashSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri2),
          DF.namedNode(mem.binaryRepresentation),
          DF.literal(buffer2.toString('base64')),
        ),
      ];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext,
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(2);
      expect(filters[0]({ url: datasetUri1 })).toBe(false);
      expect(filters[1]({ url: datasetUri2 })).toBe(false);
    });

    it('should not add link filter when projected property/resource is missing', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, <any>mockQueryOperation);
      const datasetUri = 'http://example.org/dataset1';
      const bloomFilterUri = 'http://example.org/bloom1';
      const collectionUri = 'http://example.org/collection1';
      // Missing bitSize, hashSize, or binaryRepresentation - bloom filter can't be reconstructed
      const quads: RDF.Quad[] = [
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.memberCollection),
          DF.literal(collectionUri),
        ),
        DF.quad(
          DF.namedNode(collectionUri),
          DF.namedNode(mem.sourceCollection),
          DF.literal(datasetUri),
        ),
        // Missing bitSize, hashSize, binaryRepresentation - so bloom filter can't be reconstructed
        // and dataset should be ignored
      ];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext,
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      // Bloom filter can't be reconstructed, so dataset is still ignored
      expect(filters).toHaveLength(1);
    });
  });

  describe('reconstructBloomFilters', () => {
    it('should reconstruct bloom filters from metadata', () => {
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const hashBits: Record<string, number> = {
        'http://example.org/collection1': 64,
      };
      const hashSize: Record<string, number> = {
        md5: 3,
      };
      const hashBuffer: Record<string, Buffer> = {
        'http://example.org/collection1': createBloomBuffer(64, 3, [[ 0 ], [ 10 ], [ 50 ]]),
      };
      const hashFunctions: Record<string, string> = {
        'http://example.org/collection1': 'md5',
      };
      const filters = ActorRdfMetadataExtractLinkFilterBloom.reconstructBloomFilters(
        memberCollections,
        hashBits,
        hashSize,
        hashBuffer,
        hashFunctions,
      );
      expect(Object.keys(filters)).toContain('http://example.org/collection1');
    });

    it('should return empty record when bloom filter metadata is incomplete', () => {
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const hashBits: Record<string, number> = {};
      const hashSize: Record<string, number> = {};
      const hashBuffer: Record<string, Buffer> = {};
      const hashFunctions: Record<string, string> = {};
      const filters = ActorRdfMetadataExtractLinkFilterBloom.reconstructBloomFilters(
        memberCollections,
        hashBits,
        hashSize,
        hashBuffer,
        hashFunctions,
      );
      expect(filters).toEqual({});
    });

    it('should reconstruct multiple bloom filters', () => {
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
        'http://example.org/bloom2': 'http://example.org/collection2',
      };
      const hashBits: Record<string, number> = {
        'http://example.org/collection1': 64,
        'http://example.org/collection2': 128,
      };
      const hashSize: Record<string, number> = {
        md5: 3,
        sha1: 5,
      };
      const hashBuffer: Record<string, Buffer> = {
        'http://example.org/collection1': createBloomBuffer(64, 3, [[ 0 ]]),
        'http://example.org/collection2': createBloomBuffer(128, 5, [[ 0 ], [ 60 ]]),
      };
      const hashFunctions: Record<string, string> = {
        'http://example.org/collection1': 'md5',
        'http://example.org/collection2': 'sha1',
      };
      const filters = ActorRdfMetadataExtractLinkFilterBloom.reconstructBloomFilters(
        memberCollections,
        hashBits,
        hashSize,
        hashBuffer,
        hashFunctions,
      );
      expect(Object.keys(filters)).toContain('http://example.org/collection1');
      expect(Object.keys(filters)).toContain('http://example.org/collection2');
    });
  });

  describe('determineUriPrefixesToIgnore', () => {
    it('should return all datasets as ignored when no query patterns', () => {
      const queryPatterns: Algebra.Pattern[] = [];
      const bloomFilters: Record<string, any> = {};
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
        'http://example.org/collection2': 'http://example.org/dataset2',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
        'http://example.org/bloom2': 'http://example.org/collection2',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([ 'http://example.org/dataset1', 'http://example.org/dataset2' ]);
    });

    it('should not ignore dataset when projected property matches query pattern subject in bloom filter', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.toString() === 'http://example.org/resource1',
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected property matches query pattern object in bloom filter', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/resource1'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.toString() === 'http://example.org/resource1',
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected property matches variable predicate', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.variable('pred'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected resource matches query pattern subject in bloom filter', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/predicate')) ||
          buffer.equals(Buffer.from('http://example.org/object')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when query has all variables', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.variable('s'),
          DF.variable('p'),
          DF.variable('o'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should return empty array when bloom filter is not in memberCollections', () => {
      const queryPatterns: Algebra.Pattern[] = [];
      const bloomFilters: Record<string, any> = {};
      const sourceCollections: Record<string, string> = {};
      const memberCollections: Record<string, string> = {};
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected resource matches with predicate bloom hit', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/predicate')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected resource matches with object bloom hit', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/predicate')) ||
          buffer.equals(Buffer.from('http://example.org/object')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when resource matches query pattern object with predicate bloom hit', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/resource1'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/predicate')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected property matches with both variables in pattern', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.variable('s'),
          DF.variable('p'),
          DF.variable('o'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected property matches with object in bloom filter', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/resource1'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/resource1')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected resource matches with object bloom hit via subject', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/object')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected property matches with subject in bloom filter', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/resource1')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected resource matches with subject bloom hit', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/resource1')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/object',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected property matches subject in bloom via subject #2', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/subject')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected resource matches object with subject bloom hit', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/resource1'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/subject')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected property matches subject in bloom via subject #3', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/subject')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected property matches subject in bloom via subject #4', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/subject')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore when projected property matches subject in bloom via subject', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/subject')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should ignore dataset when projected property matches but neither subject nor object in bloom', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([ 'http://example.org/dataset1' ]);
    });

    it('should ignore dataset when query predicate does not match bloom filter target property', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/otherPredicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([ 'http://example.org/dataset1' ]);
    });

    it('should ignore dataset when predicate matches but neither subject nor object in bloom', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([ 'http://example.org/dataset1' ]);
    });

    it('should ignore dataset when projected resource matches but predicate and subject not in bloom', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/resource1'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([ 'http://example.org/dataset1' ]);
    });

    it('should not ignore dataset when both projected property and resource are set and resource matches', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/resource1'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/resource1')) ||
          buffer.equals(Buffer.from('http://example.org/predicate')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/differentPredicate',
      };
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should ignore dataset when only projectedResource is set and bloom filter does not match', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {};
      const projectedResources: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/resource1',
      };
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([ 'http://example.org/dataset1' ]);
    });

    it('should not ignore dataset when projected property matches query pattern predicate in bloom filter', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/predicate')) ||
          buffer.equals(Buffer.from('http://example.org/subject')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should not ignore dataset when projected property matches with subject and object as variables', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.variable('s'),
          DF.namedNode('http://example.org/predicate'),
          DF.variable('o'),
        ),
      ];
      const mockBloomFilter = {
        has: (_buffer: Buffer) => false,
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([]);
    });

    it('should ignore dataset when property matches but subject and object are not in filter', () => {
      const queryPatterns: Algebra.Pattern[] = [
        AF.createPattern(
          DF.namedNode('http://example.org/subject'),
          DF.namedNode('http://example.org/predicate'),
          DF.namedNode('http://example.org/object'),
        ),
      ];
      const mockBloomFilter = {
        has: (buffer: Buffer) => buffer.equals(Buffer.from('http://example.org/predicate')),
      };
      const bloomFilters: Record<string, any> = {
        'http://example.org/bloom1': mockBloomFilter,
      };
      const sourceCollections: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/dataset1',
      };
      const memberCollections: Record<string, string> = {
        'http://example.org/bloom1': 'http://example.org/collection1',
      };
      const projectedProperties: Record<string, string> = {
        'http://example.org/collection1': 'http://example.org/predicate',
      };
      const projectedResources: Record<string, string> = {};
      const result = ActorRdfMetadataExtractLinkFilterBloom.determineUriPrefixesToIgnore(
        queryPatterns,
        bloomFilters,
        sourceCollections,
        memberCollections,
        projectedProperties,
        projectedResources,
      );
      expect(result).toEqual([ 'http://example.org/dataset1' ]);
    });
  });

  describe('run with projectedProperty quad', () => {
    const mockQueryOperation = { type: 'query', input: AF.createBgp([]) };

    it('should process projectedProperty quad correctly', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, <any>mockQueryOperation);
      const datasetUri = 'http://example.org/dataset1';
      const bloomFilterUri = 'http://example.org/bloom1';
      const collectionUri = 'http://example.org/collection1';
      const bitSize = 64;
      const hashSize = 3;
      const buffer = createBloomBuffer(bitSize, hashSize, [[ 0 ], [ 10 ], [ 50 ]]);
      const base64Buffer = buffer.toString('base64');
      const quads: RDF.Quad[] = [
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.memberCollection),
          DF.literal(collectionUri),
        ),
        DF.quad(
          DF.namedNode(collectionUri),
          DF.namedNode(mem.sourceCollection),
          DF.literal(datasetUri),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.bitSize),
          DF.literal(String(bitSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.hashSize),
          DF.literal(String(hashSize)),
        ),
        DF.quad(
          DF.namedNode(collectionUri),
          DF.namedNode(mem.projectedProperty),
          DF.literal('http://example.org/predicate'),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.binaryRepresentation),
          DF.literal(base64Buffer),
        ),
      ];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext,
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
    });
  });

  describe('run with hashFunction and projectedResource quads', () => {
    const mockQueryOperation = { type: 'query', input: AF.createBgp([]) };

    it('should process hashFunction and projectedResource quads correctly', async() => {
      const filters: ((link: any) => boolean)[] = [];
      const actionContext = context
        .set(KeysRdfResolveHypermediaLinks.linkFilters, filters)
        .set(KeysInitQuery.query, <any>mockQueryOperation);
      const datasetUri = 'http://example.org/dataset1';
      const bloomFilterUri = 'http://example.org/bloom1';
      const collectionUri = 'http://example.org/collection1';
      const bitSize = 64;
      const hashSize = 3;
      const hashFunction = 'md5';
      const buffer = createBloomBuffer(bitSize, hashSize, [[ 0 ], [ 10 ], [ 50 ]]);
      const base64Buffer = buffer.toString('base64');
      const quads: RDF.Quad[] = [
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.memberCollection),
          DF.literal(collectionUri),
        ),
        DF.quad(
          DF.namedNode(collectionUri),
          DF.namedNode(mem.sourceCollection),
          DF.literal(datasetUri),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.bitSize),
          DF.literal(String(bitSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.hashSize),
          DF.literal(String(hashSize)),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.hashFunction),
          DF.literal(hashFunction),
        ),
        DF.quad(
          DF.namedNode(collectionUri),
          DF.namedNode(mem.projectedResource),
          DF.literal('http://example.org/resource1'),
        ),
        DF.quad(
          DF.namedNode(bloomFilterUri),
          DF.namedNode(mem.binaryRepresentation),
          DF.literal(base64Buffer),
        ),
      ];
      const action = {
        url: 'http://example.org',
        metadata: new ArrayIterator(quads),
        requestTime: 0,
        context: actionContext,
      };
      const result = await actor.run(action);
      expect(result).toEqual({ metadata: {}});
      expect(filters).toHaveLength(1);
    });
  });

  describe('extractPatterns', () => {
    it('should extract patterns from a simple query', () => {
      const pattern = AF.createPattern(
        DF.namedNode('http://example.org/s'),
        DF.namedNode('http://example.org/p'),
        DF.namedNode('http://example.org/o'),
      );
      const bgp = AF.createBgp([ pattern ]);
      const operation = { type: 'query', input: bgp };
      const patterns = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(<any>operation);
      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toEqual(pattern);
    });

    it('should extract multiple patterns from a query with multiple triples', () => {
      const pattern1 = AF.createPattern(
        DF.namedNode('http://example.org/s1'),
        DF.namedNode('http://example.org/p1'),
        DF.namedNode('http://example.org/o1'),
      );
      const pattern2 = AF.createPattern(
        DF.namedNode('http://example.org/s2'),
        DF.namedNode('http://example.org/p2'),
        DF.namedNode('http://example.org/o2'),
      );
      const bgp = AF.createBgp([ pattern1, pattern2 ]);
      const operation = { type: 'query', input: bgp };
      const patterns = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(<any>operation);
      expect(patterns).toHaveLength(2);
    });

    it('should return empty array when no patterns exist', () => {
      const bgp = AF.createBgp([]);
      const operation = { type: 'query', input: bgp };
      const patterns = ActorRdfMetadataExtractLinkFilterBloom.extractPatterns(<any>operation);
      expect(patterns).toHaveLength(0);
    });
  });
});
