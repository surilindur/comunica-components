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

describe('BindingsStreamRestart', () => {
  const hashBindings: HashFunction = (bindings, variables) => {
    let hash = 0;
    for (const variable of variables) {
      const term = bindings.get(variable);
      if (term) {
        hash += term.value.codePointAt(0) ?? 0;
      }
    }
    return hash;
  };

  const createSourceFrom = (bindingsArray: RDF.Bindings[]): BindingsStream =>
    <BindingsStream> <unknown> new ArrayIterator<RDF.Bindings>(bindingsArray);

  const bindingsA = BF.fromRecord({ var1: DF.literal('a') });
  const bindingsB = BF.fromRecord({ var1: DF.literal('b') });
  const bindingsC = BF.fromRecord({ var1: DF.literal('c') });

  describe('constructor', () => {
    it('should create an instance with initial source', async() => {
      const source = createSourceFrom([ bindingsA, bindingsB ]);
      const instance = new BindingsStreamRestart(
        source,
        { autoStart: false, maxBufferSize: 0 },
        () => Promise.resolve(source),
        hashBindings,
      );
      expect(instance).toBeInstanceOf(BindingsStreamRestart);
    });

    it('should store the createSource function', async() => {
      const source = createSourceFrom([ bindingsA ]);
      const mockCreateSource = jest.fn().mockResolvedValue(source);
      const instance = new BindingsStreamRestart(
        source,
        { autoStart: false, maxBufferSize: 0 },
        mockCreateSource,
        hashBindings,
      );
      expect(instance).toBeDefined();
      expect(mockCreateSource).not.toHaveBeenCalled();
    });

    it('should store the hashBindings function', async() => {
      const source = createSourceFrom([ bindingsA ]);
      const instance = new BindingsStreamRestart(
        source,
        { autoStart: false, maxBufferSize: 0 },
        () => Promise.resolve(source),
        hashBindings,
      );
      expect(instance).toBeDefined();
    });
  });

  describe('swapSource', () => {
    it('should trigger a new source creation when source is active', async() => {
      const source1 = createSourceFrom([ bindingsA, bindingsB ]);
      const source2 = createSourceFrom([ bindingsC ]);
      let sourceToReturn = source1;
      const factory = async(): Promise<BindingsStream> => {
        const result = sourceToReturn;
        sourceToReturn = source2;
        return result;
      };
      const instance = new BindingsStreamRestart(
        source1,
        { autoStart: true, maxBufferSize: 0 },
        factory,
        hashBindings,
      );

      // Collect produced bindings
      const produced: RDF.Bindings[] = [];
      for await (const binding of instance) {
        produced.push(binding);
      }

      // Initial source should be consumed
      expect(produced).toHaveLength(2);
      expect(produced[0].get('var1')?.value).toBe('a');
      expect(produced[1].get('var1')?.value).toBe('b');
    });

    it('should not swap when source is already done', async() => {
      const source = createSourceFrom([ bindingsA ]);
      const factory = async(): Promise<BindingsStream> => createSourceFrom([ bindingsB ]);
      const instance = new BindingsStreamRestart(
        source,
        { autoStart: true, maxBufferSize: 0 },
        factory,
        hashBindings,
      );

      // Consume all bindings
      for await (const _ of instance) {
        // Empty
      }

      // Try to swap after source is done
      instance.swapSource();

      // The swap should not trigger because source is done
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should clear bindingsFromCurrentSource on swap and start new source', async() => {
      const source1 = createSourceFrom([ bindingsA, bindingsB ]);
      const source2 = createSourceFrom([ bindingsA, bindingsC ]);

      const instance = new BindingsStreamRestart(
        source1,
        { autoStart: true, maxBufferSize: 0 },
        () => Promise.resolve(source2),
        hashBindings,
      );

      const readpromise = new Promise<RDF.Bindings[]>((resolve, reject) => {
        const output: RDF.Bindings[] = [];
        let swapped = false;
        instance
          .on('data', (bindings: RDF.Bindings) => {
            output.push(bindings);
            if (!swapped) {
              instance.swapSource();
              swapped = true;
            }
          })
          .on('end', () => resolve(output))
          .on('error', reject);
      });

      await expect(readpromise).resolves.toEqual([ bindingsA, bindingsC ]);
    });
  });

  describe('_push', () => {
    it('should produce bindings from the source', async() => {
      const source = createSourceFrom([ bindingsA, bindingsB, bindingsC ]);
      const instance = new BindingsStreamRestart(
        source,
        { autoStart: true, maxBufferSize: 0 },
        () => Promise.resolve(createSourceFrom([])),
        hashBindings,
      );

      const produced: RDF.Bindings[] = [];
      for await (const binding of instance) {
        produced.push(binding);
      }

      expect(produced).toHaveLength(3);
    });

    it('should produce bindings with different variables even with same hash value', async() => {
      const bindingsA1 = BF.fromRecord({ var1: DF.literal('a') });
      const bindingsA2 = BF.fromRecord({ var2: DF.literal('a') });
      const source = createSourceFrom([ bindingsA1, bindingsA2 ]);
      const instance = new BindingsStreamRestart(source, {
        autoStart: true,
        maxBufferSize: 0,
      }, () => Promise.resolve(createSourceFrom([])), hashBindings);

      const produced: RDF.Bindings[] = [];
      for await (const binding of instance) {
        produced.push(binding);
      }

      // Both should be produced as they have different keys
      expect(produced).toHaveLength(2);
    });

    it('should skip bindings that appeared fewer times in current source than in previous', async() => {
      const source1 = createSourceFrom([ bindingsA, bindingsB ]);
      const source2 = createSourceFrom([ bindingsA, bindingsC ]);
      let callCount = 0;
      const factory = async(): Promise<BindingsStream> => {
        callCount++;
        return callCount === 1 ? source2 : source1;
      };

      const instance = new BindingsStreamRestart(source1, {
        autoStart: true,
        maxBufferSize: 0,
      }, factory, hashBindings);

      // Consume first binding from source1, then swap
      const iterator = instance[Symbol.asyncIterator]();
      await iterator.next(); // BindingsA from source1

      // Swap while source still has bindingsB (B may already be buffered)
      instance.swapSource();

      const produced: RDF.Bindings[] = [];
      let result = await iterator.next();
      while (!result.done) {
        produced.push(result.value);
        result = await iterator.next();
      }

      // A from source1: previous=0, current=0, 0 >= 0, push
      //   → previous={A:1}, current={A:1}
      // B from source1 (buffered before swap): previous=0, current=0, 0 >= 0, push
      //   → previous={A:1,B:1}, current={A:1,B:1}
      // swapSource clears bindingsFromCurrentSource, new source2 loaded
      // A from source2: previous=1, current=0, 0 < 1, don't push
      //   → current={A:1}
      // C from source2: previous=0, current=0, 0 >= 0, push
      //   → previous={A:1,B:1,C:1}
      expect(produced).toHaveLength(2);
      expect(produced[0].get('var1')?.value).toBe('b');
      expect(produced[1].get('var1')?.value).toBe('c');
    });

    it('should handle empty source', async() => {
      const source = createSourceFrom([]);
      const instance = new BindingsStreamRestart(
        source,
        { autoStart: true, maxBufferSize: 0 },
        () => Promise.resolve(createSourceFrom([])),
        hashBindings,
      );

      const produced: RDF.Bindings[] = [];
      for await (const binding of instance) {
        produced.push(binding);
      }

      expect(produced).toHaveLength(0);
    });

    it('should push when current count meets or exceeds previous count', async() => {
      const source1 = createSourceFrom([ bindingsA ]);
      const source2 = createSourceFrom([ bindingsA, bindingsA, bindingsB ]);
      let callCount = 0;
      const factory = async(): Promise<BindingsStream> => {
        callCount++;
        return callCount === 1 ? source2 : source1;
      };

      const instance = new BindingsStreamRestart(source1, {
        autoStart: true,
        maxBufferSize: 0,
      }, factory, hashBindings);

      // Swap immediately before consuming anything from source1
      instance.swapSource();

      const produced: RDF.Bindings[] = [];
      for await (const binding of instance) {
        produced.push(binding);
      }

      // BindingsA: previous=0 (nothing from source1 was consumed), current=0 initially
      //   First A: current=0, previous=0, 0 >= 0, push, current=1, previous=1
      //   Second A: current=1, previous=1, 1 >= 1, push, current=2, previous=2
      // BindingsB: current=0, previous=0, 0 >= 0, push
      expect(produced).toHaveLength(3);
      expect(produced[0].get('var1')?.value).toBe('a');
      expect(produced[1].get('var1')?.value).toBe('a');
      expect(produced[2].get('var1')?.value).toBe('b');
    });
  });

  describe('hash with different variable values', () => {
    it('should work with the same hash for different binding values', async() => {
      // Create bindings with same key but different values
      const bindingsX = BF.fromRecord({ key: DF.literal('valueX') });
      const bindingsY = BF.fromRecord({ key: DF.literal('valueY') });

      const source = createSourceFrom([ bindingsX, bindingsY ]);
      const instance = new BindingsStreamRestart(
        source,
        { autoStart: true, maxBufferSize: 0 },
        () => Promise.resolve(createSourceFrom([])),
        hashBindings,
      );

      const produced: RDF.Bindings[] = [];
      for await (const binding of instance) {
        produced.push(binding);
      }

      // Both should be produced as they have different values
      expect(produced).toHaveLength(2);
    });
  });
});
