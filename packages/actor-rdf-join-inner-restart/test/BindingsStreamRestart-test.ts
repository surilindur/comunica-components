import type { Bindings, BindingsStream } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('BindingsStreamRestart', () => {
  let bindingsHashes: Bindings[];
  let bindingsStream: BindingsStreamRestart;

  let initialSource: BindingsStream;
  let createSource: () => Promise<BindingsStream>;

  beforeEach(async() => {
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
    createSource = jest.fn(() => Promise.resolve(new ArrayIterator<Bindings>(bindingsHashes, { autoStart: false })));
    bindingsStream = new BindingsStreamRestart(
      initialSource,
      { autoStart: false, maxBufferSize: 0 },
      createSource,
      (bindings, _variables) => bindingsHashes.indexOf(bindings),
    );
  });

  it('produces the initial source results by default', async() => {
    await expect(bindingsStream.toArray()).resolves.toEqualBindingsArray(bindingsHashes);
  });

  it('reports the number of bindings produced', async() => {
    await expect(bindingsStream.toArray()).resolves.toEqualBindingsArray(bindingsHashes);
    expect(bindingsStream.totalBindingsProduced).toBe(bindingsHashes.length);
  });
});
