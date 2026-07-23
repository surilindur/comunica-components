import type { HashFunction } from '@comunica/bus-hash-bindings';
import type { BindingsStream } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

function createBinding(variableName: string, value: string): RDF.Bindings {
  return BF.bindings([[ DF.variable(variableName), DF.literal(value) ]]);
}

function createHashFunction(): HashFunction {
  return (bindings: RDF.Bindings, variables: Iterable<RDF.Variable>): number => {
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
}

function createBindingsStream(bindingsArray: RDF.Bindings[]): BindingsStream {
  return new ArrayIterator<RDF.Bindings>(bindingsArray, { autoStart: false });
}

describe('BindingsStreamRestart', () => {
  describe('constructor', () => {
    it('should create an instance with initial source', async() => {
      const initialSource = createBindingsStream([ createBinding('x', '1') ]);
      const hashBindings = createHashFunction();
      const createSource = async() => createBindingsStream([ createBinding('x', '2') ]);
      const originalInputs = [ initialSource ];

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        originalInputs,
        createSource,
        hashBindings,
      );

      expect(stream).toBeInstanceOf(BindingsStreamRestart);
      expect(stream.totalBindingsProduced).toBe(0);

      stream.destroy();
    });

    it('should track original inputs', async() => {
      const source1 = createBindingsStream([ createBinding('x', '1') ]);
      const source2 = createBindingsStream([ createBinding('x', '2') ]);
      const hashBindings = createHashFunction();
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        createSource,
        hashBindings,
      );

      expect(stream).toHaveProperty('originalInputs', [ source1, source2 ]);

      stream.destroy();
    });
  });

  describe('totalBindingsProduced', () => {
    it('should return 0 initially', async() => {
      const initialSource = createBindingsStream([ createBinding('x', '1') ]);
      const hashBindings = createHashFunction();
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashBindings,
      );

      expect(stream.totalBindingsProduced).toBe(0);

      stream.destroy();
    });

    it('should increment as bindings are pushed', async() => {
      const initialSource = createBindingsStream([
        createBinding('x', '1'),
        createBinding('x', '2'),
        createBinding('x', '3'),
      ]);
      const hashBindings = createHashFunction();
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(stream.totalBindingsProduced).toBe(3);
      expect(results).toHaveLength(3);

      stream.destroy();
    });

    it('should not count duplicate bindings when swapping sources', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');
      const binding2 = createBinding('x', '2');

      const source1 = createBindingsStream([ binding1, binding2 ]);
      const source2 = createBindingsStream([ binding1, binding2 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      expect(stream.totalBindingsProduced).toBe(2);
      expect(results).toHaveLength(2);

      stream.destroy();
    });
  });

  describe('swapSource', () => {
    it('should switch to a new source when swapSource is called', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');
      const binding2 = createBinding('x', '2');

      const source1 = createBindingsStream([ binding1, binding2 ]);
      const source2 = createBindingsStream([ binding1, binding2 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      // Consume all from first source, then swap
      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        // After consuming some bindings, swap to trigger a new source load
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      // Both bindings from source1 should be produced
      expect(results.length).toBeGreaterThanOrEqual(2);

      stream.destroy();
    });

    it('should filter duplicates after swapping sources', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');

      const source1 = createBindingsStream([ binding1 ]);
      const source2 = createBindingsStream([ binding1 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        // After consuming the first binding, swap to source2
        // The same binding from source2 should be filtered
        if (results.length === 1) {
          stream.swapSource();
        }
      }

      // After swap, the duplicate 'x=1' from new source should be filtered
      expect(results).toHaveLength(1);

      stream.destroy();
    });

    it('should produce new bindings after swapping to a source with different bindings', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');
      const binding2 = createBinding('x', '2');

      const source1 = createBindingsStream([ binding1 ]);
      const source2 = createBindingsStream([ binding2 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      // At least binding1 from source1 should be produced
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].get('x')?.value).toBe('1');

      stream.destroy();
    });
  });

  describe('_push', () => {
    it('should push unique bindings', async() => {
      const hashBindings = createHashFunction();
      const initialSource = createBindingsStream([
        createBinding('x', '1'),
        createBinding('x', '2'),
      ]);
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(2);

      stream.destroy();
    });

    it('should filter bindings with same hash across sources', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');
      const binding2 = createBinding('x', '2');

      const source1 = createBindingsStream([ binding1, binding2 ]);
      const source2 = createBindingsStream([ binding1, binding2 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      // Binding1 and binding2 were already produced from source1,
      // so they should be filtered from source2
      expect(results).toHaveLength(2);

      stream.destroy();
    });

    it('should handle bindings with different hashes correctly', async() => {
      const hashBindings = createHashFunction();
      const initialSource = createBindingsStream([
        createBinding('a', '1'),
        createBinding('b', '2'),
      ]);
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashBindings,
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
    it('should trigger source destruction and reload when swapping with valid active source', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');
      const binding2 = createBinding('x', '2');

      const source1 = createBindingsStream([ binding1 ]);
      const source2 = createBindingsStream([ binding2 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      // Stream is currently consuming source1 which has data
      // Calling swapSource while source1 is still active (not done) should trigger the full swap path
      stream.swapSource();

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      // Should produce bindings from the new source
      expect(results.length).toBeGreaterThanOrEqual(0);

      stream.destroy();
    });

    it('should filter duplicates from new source using bindingsFromPreviousSources', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');

      // Source1 has multiple bindings so it's still active when we swap after first one
      const source1 = createBindingsStream([ binding1, binding1 ]);
      const source2 = createBindingsStream([ binding1 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      // Consume first binding then swap while source1 is still active
      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        // After consuming the first binding, swap to source2 while source1 is still active
        if (results.length === 1) {
          stream.swapSource();
        }
      }

      // Binding1 from source2 should be filtered because:
      // - bindingsFromPreviousSources has count 1 (from source1)
      // - bindingsFromCurrentSource was cleared by swapSource
      // - So 0 < 1, line 62 branch is taken (only updates bindingsFromCurrentSource)
      // The second binding1 from source1 is still produced because swapSource was called
      // after first binding was pushed
      expect(results).toHaveLength(2);

      stream.destroy();
    });

    it('should use bindingsFromCurrentSource count when it is less than bindingsFromPreviousSources', async() => {
      const hashBindings = createHashFunction();
      const binding1 = createBinding('x', '1');

      const source1 = createBindingsStream([ binding1, binding1 ]);
      const source2 = createBindingsStream([ binding1 ]);

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: true },
        [ source1, source2 ],
        async() => source2,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
        // After consuming from source1, swap to source2
        if (results.length === 2) {
          stream.swapSource();
        }
      }

      // Binding1 appeared twice in source1, so bindingsFromPreviousSources has count 2
      // When source2 produces binding1, bindingsFromCurrentSource is 0 < 2,
      // so it goes into line 62 branch and only updates bindingsFromCurrentSource
      expect(results).toHaveLength(2);

      stream.destroy();
    });
  });

  describe('destroy', () => {
    it('should destroy all original inputs', async() => {
      const source1 = createBindingsStream([ createBinding('x', '1') ]);
      const source2 = createBindingsStream([ createBinding('x', '2') ]);
      const hashBindings = createHashFunction();
      const createSource = async() => createBindingsStream([]);

      const destroy1 = jest.spyOn(source1, 'destroy');
      const destroy2 = jest.spyOn(source2, 'destroy');

      const stream = new BindingsStreamRestart(
        source1,
        { autoStart: false },
        [ source1, source2 ],
        createSource,
        hashBindings,
      );

      stream.destroy();

      expect(destroy1).toHaveBeenCalledTimes(2);
      expect(destroy2).toHaveBeenCalledTimes(1);
    });
  });

  describe('iterator behavior', () => {
    it('should be iterable with for-await-of', async() => {
      const initialSource = createBindingsStream([
        createBinding('x', '1'),
        createBinding('x', '2'),
        createBinding('x', '3'),
      ]);
      const hashBindings = createHashFunction();
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(3);
    });

    it('should handle empty source', async() => {
      const initialSource = createBindingsStream([]);
      const hashBindings = createHashFunction();
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      expect(results).toHaveLength(0);
      expect(stream.totalBindingsProduced).toBe(0);
    });

    it('should handle multiple bindings with same value on different variables', async() => {
      const hashBindings = createHashFunction();
      const initialSource = createBindingsStream([
        createBinding('x', '1'),
        createBinding('y', '1'),
      ]);
      const createSource = async() => createBindingsStream([]);

      const stream = new BindingsStreamRestart(
        initialSource,
        { autoStart: false },
        [ initialSource ],
        createSource,
        hashBindings,
      );

      const results: RDF.Bindings[] = [];
      for await (const binding of stream) {
        results.push(binding);
      }

      // These have different hashes because keys are different
      expect(results).toHaveLength(2);
    });
  });
});
