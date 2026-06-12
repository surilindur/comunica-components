import type { Bindings, BindingsStream } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { BindingsStreamRestart } from '../lib/BindingsStreamRestart';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('BindingsStreamRestart', () => {
  let source: () => Promise<BindingsStream>;
  let bindingsHashes: Bindings[];
  let bindingsStream: BindingsStreamRestart;

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
    source = jest.fn(() => Promise.resolve(new ArrayIterator<Bindings>(bindingsHashes, { autoStart: false })));
    bindingsStream = new BindingsStreamRestart(
      source,
      { autoStart: false, maxBufferSize: 0 },
      (bindings, _variables) => bindingsHashes.indexOf(bindings),
    );
  });

  it('produces the initial source results by default', async() => {
    expect(source).not.toHaveBeenCalled();
    await expect(bindingsStream.toArray()).resolves.toEqualBindingsArray(bindingsHashes);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('reports the number of bindings produced', async() => {
    expect(source).not.toHaveBeenCalled();
    await expect(bindingsStream.toArray()).resolves.toEqualBindingsArray(bindingsHashes);
    expect(bindingsStream.totalBindingsProduced).toBe(bindingsHashes.length);
    expect(source).toHaveBeenCalledTimes(1);
  });
});
