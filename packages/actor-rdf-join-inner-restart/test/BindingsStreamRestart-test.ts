import { createHash } from 'node:crypto';
import type { HashFunction } from '@comunica/bus-hash-bindings';
import type { Bindings, BindingsStream } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('BindingsStreamRestart', () => {
  let bindingsHashes: Bindings[];
  let initialSource: BindingsStream;
  let createSourceMock: jest.Mock<Promise<BindingsStream>, []>;

  const hashFunction: HashFunction = (bindings: Bindings, variables: Iterable<RDF.Variable>) => {
    const data: Record<string, RDF.Term | undefined> = Object.fromEntries([
      ...variables,
    ].map(v => v.value).sort().map(v => ([ v, bindings.get(v) ])));
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('binary');
    return Number.parseInt(hash, 2);
  };

  beforeEach(() => {
    bindingsHashes = [
      BF.fromRecord({ var: DF.literal('value 0') }),
      BF.fromRecord({ var: DF.literal('value 1') }),
      BF.fromRecord({ var: DF.literal('value 2') }),
      BF.fromRecord({ var: DF.literal('value 3') }),
      BF.fromRecord({ var: DF.literal('value 4') }),
      BF.fromRecord({ var: DF.literal('value 5') }),
      BF.fromRecord({ var: DF.literal('value 6') }),
      BF.fromRecord({ var: DF.literal('value 7') }),
      BF.fromRecord({ var: DF.literal('value 8') }),
    ];
    initialSource = new ArrayIterator<Bindings>(bindingsHashes, { autoStart: false });
    createSourceMock = jest.fn(() => Promise.resolve(
      new ArrayIterator<Bindings>(bindingsHashes, { autoStart: false }),
    ));
  });

  describe('constructor', () => {
    it('initializes with the provided source and options', async() => {
      const bindingsStream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        createSourceMock,
        hashFunction,
      );
      await expect(bindingsStream.toArray()).resolves.toEqualBindingsArray(bindingsHashes);
    });

    it('initializes totalBindingsProduced to 0', async() => {
      const bindingsStream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        createSourceMock,
        hashFunction,
      );
      expect(bindingsStream.totalBindingsProduced).toBe(0);
    });

    it('reports the total number of bindings produced after iteration', async() => {
      const bindingsStream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        createSourceMock,
        hashFunction,
      );
      await bindingsStream.toArray();
      expect(bindingsStream.totalBindingsProduced).toBe(bindingsHashes.length);
    });
  });

  describe('swapSource', () => {
    const createStream = (source: BindingsStream): BindingsStreamRestart => {
      return new BindingsStreamRestart(
        source,
        { autoStart: false },
        createSourceMock,
        hashFunction,
      );
    };

    it('triggers a source swap and produces results from the new source', async() => {
      const bindingsStream = createStream(new ArrayIterator<Bindings>([], { autoStart: false }));
      bindingsStream.swapSource();
      const result = await bindingsStream.toArray();
      expect(result).toEqualBindingsArray(bindingsHashes);
    });

    it('calls createSource when swapSource is called', async() => {
      const bindingsStream = createStream(new ArrayIterator<Bindings>([], { autoStart: false }));
      bindingsStream.swapSource();
      await bindingsStream.toArray();
      expect(createSourceMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when source is already done', async() => {
      const bindingsStream = createStream(initialSource);
      await bindingsStream.toArray();
      bindingsStream.swapSource();
      const result = await bindingsStream.toArray();
      expect(result).toEqualBindingsArray([]);
    });

    it('does nothing when source is destroyed', async() => {
      const bindingsStream = createStream(initialSource);
      bindingsStream.destroy();
      bindingsStream.swapSource();
    });

    it('does not produce duplicates after a call to swapSource', async() => {
      // Consume some bindings from the initial source
      const bindingsStream = createStream(initialSource);
      await bindingsStream.toArray();
      // Expected produced: all 9 bindings from initial source
      expect(bindingsStream.totalBindingsProduced).toBe(9);

      // Swap to a new source that produces the same bindings
      bindingsStream.swapSource();
      const result = await bindingsStream.toArray();
      // All bindings from the new source should be skipped as duplicates
      expect(result).toEqualBindingsArray([]);
      // Total should remain the same (no new bindings produced)
      expect(bindingsStream.totalBindingsProduced).toBe(9);
    });

    it('skips only the number of previously produced duplicates after swapSource', async() => {
      // Create a source with duplicate bindings
      const duplicateBindings = [
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 1') }),
      ];
      const duplicateSource = new ArrayIterator<Bindings>(duplicateBindings, { autoStart: false });
      const bindingsStream = createStream(duplicateSource);

      // Consume the initial source
      await bindingsStream.toArray();
      // Produced: 3 bindings (2x value 0, 1x value 1)
      expect(bindingsStream.totalBindingsProduced).toBe(3);

      // Swap to a new source with the same duplicates
      bindingsStream.swapSource();
      const result = await bindingsStream.toArray();
      // Value 0 appears 2 times in initial source, so 2 should be skipped
      // value 1 appears 1 time in initial source, so 1 should be skipped
      // Result should be empty
      expect(result).toEqualBindingsArray([]);
    });
  });

  describe('_push', () => {
    it('does not skip duplicates within the same source', async() => {
      const sameHashFn = jest.fn(() => 1);
      const duplicateBindings = [
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 1') }),
      ];
      const duplicateSource = new ArrayIterator<Bindings>(duplicateBindings, { autoStart: false });
      const duplicateStream = new BindingsStreamRestart(
        duplicateSource,
        { autoStart: false },
        createSourceMock,
        sameHashFn,
      );
      const result = await duplicateStream.toArray();
      expect(result).toEqualBindingsArray([
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 1') }),
      ]);
    });

    it('produces all bindings when hashes are the same within a source', async() => {
      const sameHashFn = jest.fn(() => 1);
      const duplicateBindings = [
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
      ];
      const duplicateSource = new ArrayIterator<Bindings>(duplicateBindings, { autoStart: false });
      const duplicateStream = new BindingsStreamRestart(
        duplicateSource,
        { autoStart: false },
        createSourceMock,
        sameHashFn,
      );
      const result = await duplicateStream.toArray();
      expect(result).toEqualBindingsArray([
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
      ]);
      expect(duplicateStream.totalBindingsProduced).toBe(3);
    });

    it('handles bindingsToSkip decrement and delete paths during _push', async() => {
      const duplicateBindings = [
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 1') }),
      ];
      const duplicateSource = new ArrayIterator<Bindings>(duplicateBindings, { autoStart: false });
      const bindingsStream = new BindingsStreamRestart(
        duplicateSource,
        { autoStart: false },
        createSourceMock,
        hashFunction,
      );
      // Start the source and consume items one by one
      const consumed: RDF.Bindings[] = [];
      for await (const binding of bindingsStream) {
        consumed.push(binding);
        if (consumed.length === 2) {
          // Swap after consuming 2 items while source still has more
          bindingsStream.swapSource();
          break;
        }
      }
      // BindingsProduced now has 2 entries for value 0
      expect(bindingsStream.totalBindingsProduced).toBeGreaterThanOrEqual(2);
    });

    it('deletes bindingsToSkip entry when count reaches 1', async() => {
      // Use same hash for all bindings to test the delete path
      const sameHashFn = jest.fn(() => 1);
      const duplicateBindings = [
        BF.fromRecord({ var: DF.literal('value 0') }),
        BF.fromRecord({ var: DF.literal('value 0') }),
      ];
      const duplicateSource = new ArrayIterator<Bindings>(duplicateBindings, { autoStart: false });
      const createSourceLocalMock = jest.fn(() => Promise.resolve(
        new ArrayIterator<Bindings>(duplicateBindings, { autoStart: false }),
      ));
      const bindingsStream = new BindingsStreamRestart(
        duplicateSource,
        { autoStart: false },
        createSourceLocalMock,
        sameHashFn,
      );
      // Consume 1 binding so bindingsProduced has { 1: 1 }
      const consumed: RDF.Bindings[] = [];
      for await (const binding of bindingsStream) {
        consumed.push(binding);
        if (consumed.length === 1) {
          // Swap after consuming 1 item while source still has more
          bindingsStream.swapSource();
          break;
        }
      }
      expect(bindingsStream.totalBindingsProduced).toBeGreaterThanOrEqual(1);

      // Consume the rest - first item will decrement bindingsToSkip from 1 to "delete"
      const result = await bindingsStream.toArray();
      // First binding from new source is skipped (delete path), rest are produced
      expect(result).toEqualBindingsArray([
        BF.fromRecord({ var: DF.literal('value 0') }),
      ]);
    });
  });
});
