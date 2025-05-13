import type { Bindings, BindingsStream } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

/**
 * Helper function to only read a specific number of bindings from a stream.
 */
async function takeBindings(stream: BindingsStream, count: number): Promise<Bindings[]> {
  return new Promise((resolve, reject) => {
    const output: Bindings[] = [];
    stream.on('data', (bindings) => {
      if (output.length < count) {
        output.push(bindings);
      }
      if (output.length >= count) {
        resolve(output);
      }
    }).on('error', reject).on('end', () => reject(new Error('Stream ended!')));
  });
}

describe('BindingsStreamRestart', () => {
  let source: BindingsStream;
  let bindingsHashes: Bindings[];
  let bindingsStream: BindingsStreamRestart;
  let createSource: () => Promise<BindingsStream>;

  beforeEach(async() => {
    bindingsHashes = [
      BF.fromRecord({ var: DF.literal('value 1') }),
      BF.fromRecord({ var: DF.literal('value 2') }),
      BF.fromRecord({ var: DF.literal('value 3') }),
      BF.fromRecord({ var: DF.literal('value 4') }),
      BF.fromRecord({ var: DF.literal('value 5') }),
      BF.fromRecord({ var: DF.literal('value 6') }),
      BF.fromRecord({ var: DF.literal('value 7') }),
      BF.fromRecord({ var: DF.literal('value 8') }),
      BF.fromRecord({ var: DF.literal('value 9') }),
    ];
    createSource = jest.fn(async() => {
      return new ArrayIterator<Bindings>(bindingsHashes, { autoStart: false });
    });
    source = await createSource();
    jest.spyOn(source, 'destroy');
    bindingsStream = new BindingsStreamRestart(
      source,
      { autoStart: false, maxBufferSize: 0 },
      createSource,
      (bindings: Bindings, _variables: RDF.Variable[]) => bindingsHashes.indexOf(bindings),
    );
  });

  it('produces the initial source results by default', async() => {
    expect(createSource).toHaveBeenCalledTimes(1);
    await expect(bindingsStream.toArray()).resolves.toEqualBindingsArray(bindingsHashes);
  });

  it('reports the number of bindings produced', async() => {
    expect(createSource).toHaveBeenCalledTimes(1);
    await expect(bindingsStream.toArray()).resolves.toEqualBindingsArray(bindingsHashes);
    expect(bindingsStream.totalBindingsProduced).toBe(bindingsHashes.length);
  });

  it('changes the source when swapSource is called', async() => {
    expect(createSource).toHaveBeenCalledTimes(1);
    await expect(takeBindings(bindingsStream, 2)).resolves.toEqualBindingsArray(bindingsHashes.slice(0, 2));
    expect(() => bindingsStream.swapSource()).not.toThrow();
    expect(createSource).toHaveBeenCalledTimes(2);
    await expect(takeBindings(bindingsStream, 2)).resolves.toEqualBindingsArray(bindingsHashes.slice(3, 5));
    expect(() => bindingsStream.swapSource()).not.toThrow();
    expect(createSource).toHaveBeenCalledTimes(3);
    await expect(takeBindings(bindingsStream, 2)).resolves.toEqualBindingsArray(bindingsHashes.slice(6, 8));
  });
});
