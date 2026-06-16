import type { HashFunction } from '@comunica/bus-hash-bindings';
import type { Bindings, BindingsStream } from '@comunica/types';
import type { TransformIteratorOptions } from 'asynciterator';
import { TransformIterator } from 'asynciterator';

/**
 * An iterator that can be instructed to pull a new source at will,
 * and automatically skips would-be-produced duplicates.
 */
export class BindingsStreamRestart extends TransformIterator<Bindings> implements BindingsStream {
  private readonly hashBindings: HashFunction;
  private readonly createSource: () => Promise<BindingsStream>;

  private readonly bindingsFromCurrentSource: Map<number, number>;
  private readonly bindingsFromPreviousSources: Map<number, number>;

  public constructor(
    initialSource: BindingsStream,
    options: TransformIteratorOptions<Bindings>,
    createSource: () => Promise<BindingsStream>,
    hashBindings: HashFunction,
  ) {
    super(initialSource, options);
    this.bindingsFromCurrentSource = new Map();
    this.bindingsFromPreviousSources = new Map();
    this.createSource = createSource;
    this.hashBindings = hashBindings;
  }

  public swapSource(): void {
    if (this._source && !this._source.done) {
      this._source.destroy();
      this._source = undefined;
      this.bindingsFromCurrentSource.clear();
      this._createSource = this.createSource;
      this._loadSourceAsync();
    }
  }

  protected override _push(item: Bindings): void {
    const bindingsHash = this.hashBindings(item, [ ...item.keys() ]);
    const identicalFromPreviousSources = this.bindingsFromPreviousSources.get(bindingsHash) ?? 0;
    const identicalFromCurrentSource = this.bindingsFromCurrentSource.get(bindingsHash) ?? 0;
    if (identicalFromCurrentSource < identicalFromPreviousSources) {
      this.bindingsFromCurrentSource.set(bindingsHash, identicalFromCurrentSource + 1);
    } else {
      this.bindingsFromCurrentSource.set(bindingsHash, identicalFromCurrentSource + 1);
      this.bindingsFromPreviousSources.set(bindingsHash, identicalFromPreviousSources + 1);
      super._push(item);
    }
  }
}
