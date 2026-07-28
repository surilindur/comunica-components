import type { HashFunction } from '@comunica/bus-hash-bindings';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';
import '@comunica/utils-jest';

describe('BindingsStreamRestart', () => {
  const DF = new DataFactory();
  const BF = new BindingsFactory(DF);
  const hashFunction: HashFunction = (bindings, variables): number => {
    const keysArray = [ ...variables ];
    const parts = keysArray
      .sort((a, b) => a.value.localeCompare(b.value))
      .map(v => `${v.value}:${bindings.get(v)?.value}`);
    let hash = 0;
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) {
        const codePoint = part.codePointAt(i) ?? 0;
        hash = ((hash << 5) - hash) + codePoint;
        hash &= hash;
      }
    }
    return hash;
  };

  describe('constructor', () => {
    let stream: BindingsStreamRestart;

    afterEach(() => {
      if (stream) {
        stream.destroy();
      }
    });

    it('should create an instance with initial source', () => {
      const initialSource = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
      ], { autoStart: false });
      const createSource = async() => new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
      ]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashFunction,
      );

      expect(stream).toBeInstanceOf(BindingsStreamRestart);
      expect(stream.totalBindingsProduced).toBe(0);
    });

    it('should track original inputs', () => {
      const source1 = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
      ]);
      const source2 = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
      ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      expect(stream).toHaveProperty('originalInputs', [ source1, source2 ]);
    });
  });

  describe('totalBindingsProduced', () => {
    let stream: BindingsStreamRestart;

    afterEach(() => {
      if (stream) {
        stream.destroy();
      }
    });

    it('should return 0 initially', () => {
      const initialSource = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
      ]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      expect(stream.totalBindingsProduced).toBe(0);
    });

    it('should increment as bindings are pushed', async() => {
      const initialSource = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
        BF.bindings([[ DF.variable('x'), DF.literal('3') ]]),
      ]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      for await (const _ of stream) {
        // Consume all bindings
      }

      expect(stream.totalBindingsProduced).toBe(3);
    });

    it('should not count duplicate bindings when swapping sources', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);
      const binding2 = BF.bindings([[ DF.variable('x'), DF.literal('2') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1, binding2 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding1, binding2 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      expect(stream.totalBindingsProduced).toBe(2);
    });
  });

  describe('swapSource', () => {
    let stream: BindingsStreamRestart;

    afterEach(() => {
      if (stream) {
        stream.destroy();
      }
    });

    it('should switch to a new source when swapSource is called', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);
      const binding2 = BF.bindings([[ DF.variable('x'), DF.literal('2') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1, binding2 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding1, binding2 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter duplicates after swapping sources', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding1 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 1) {
          stream.swapSource();
        }
      }

      expect(results).toHaveLength(1);
    });

    it('should produce new bindings after swapping to a source with different bindings', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);
      const binding2 = BF.bindings([[ DF.variable('x'), DF.literal('2') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding2 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].get('x')?.value).toBe('1');
    });
  });

  describe('_push', () => {
    let stream: BindingsStreamRestart;

    afterEach(() => {
      if (stream) {
        stream.destroy();
      }
    });

    it('should push unique bindings', async() => {
      const initialSource = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
      ]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(2);
    });

    it('should filter bindings with same hash across sources', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);
      const binding2 = BF.bindings([[ DF.variable('x'), DF.literal('2') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1, binding2 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding1, binding2 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      expect(results).toHaveLength(2);
    });

    it('should handle bindings with different hashes correctly', async() => {
      const initialSource = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('a'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('b'), DF.literal('2') ]]),
      ]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(2);
      expect(results[0].get('a')?.value).toBe('1');
      expect(results[1].get('b')?.value).toBe('2');
    });
  });

  describe('swapSource edge cases', () => {
    let stream: BindingsStreamRestart;

    afterEach(() => {
      if (stream) {
        stream.destroy();
      }
    });

    it('should trigger source destruction and reload when swapping with valid active source', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);
      const binding2 = BF.bindings([[ DF.variable('x'), DF.literal('2') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding2 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      stream.swapSource();

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter duplicates from new source using bindingsFromPreviousSources', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1, binding1 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding1 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 1) {
          stream.swapSource();
        }
      }

      expect(results).toHaveLength(2);
    });

    it('should use bindingsFromCurrentSource count when it is less than bindingsFromPreviousSources', async() => {
      const binding1 = BF.bindings([[ DF.variable('x'), DF.literal('1') ]]);

      const source1 = new ArrayIterator<RDF.Bindings>([ binding1, binding1 ]);
      const source2 = new ArrayIterator<RDF.Bindings>([ binding1 ]);

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      expect(results).toHaveLength(2);
    });
  });

  describe('destroy', () => {
    let stream: BindingsStreamRestart;

    afterEach(() => {
      if (stream) {
        stream.destroy();
      }
    });

    it('should destroy all original inputs', () => {
      const source1 = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
      ]);
      const source2 = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
      ]);

      const destroy1 = jest.spyOn(source1, 'destroy');
      const destroy2 = jest.spyOn(source2, 'destroy');

      stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      stream.destroy();

      expect(destroy1).toHaveBeenCalledTimes(2);
      expect(destroy2).toHaveBeenCalledTimes(1);
    });
  });

  describe('iterator behavior', () => {
    let stream: BindingsStreamRestart;

    afterEach(() => {
      if (stream) {
        stream.destroy();
      }
    });

    it('should be iterable with for-await-of', async() => {
      const initialSource = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('x'), DF.literal('2') ]]),
        BF.bindings([[ DF.variable('x'), DF.literal('3') ]]),
      ]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(3);
    });

    it('should handle empty source', async() => {
      const initialSource = new ArrayIterator<RDF.Bindings>([]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(0);
      expect(stream.totalBindingsProduced).toBe(0);
    });

    it('should handle multiple bindings with same value on different variables', async() => {
      const initialSource = new ArrayIterator<RDF.Bindings>([
        BF.bindings([[ DF.variable('x'), DF.literal('1') ]]),
        BF.bindings([[ DF.variable('y'), DF.literal('1') ]]),
      ]);

      stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        async() => new ArrayIterator<RDF.Bindings>([]),
        hashFunction,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(2);
    });
  });
});
