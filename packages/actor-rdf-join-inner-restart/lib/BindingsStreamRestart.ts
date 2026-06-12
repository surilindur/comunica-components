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

  // Tracks the total number of bindings produced by the binding hash.
  // This matches the 'output bindings bag' contents.
  private readonly bindingsProduced: Map<number, number>;

  // Tracks the number of bindings that must be skipped from the current source.
  // When swapping sources, the contents of bindingsProduces must be copied here.
  // This map acts as a countdown, and forces the skipping of output.
  private readonly bindingsToSkip: Map<number, number>;

  public get totalBindingsProduced(): number {
    let total = 0;
    for (const count of this.bindingsProduced.values()) {
      total += count;
    }
    return total;
  }

  public constructor(
    initialSource: BindingsStream,
    options: TransformIteratorOptions<Bindings>,
    createSource: () => Promise<BindingsStream>,
    hashBindings: HashFunction,
  ) {
    super(initialSource, options);
    this.bindingsProduced = new Map();
    this.bindingsToSkip = new Map();
    this.hashBindings = hashBindings;
    this.createSource = () => {
      // Copy currently produced bindings into skip map, so they are dropped
      // from the next source, and produce no unintended duplicates.
      this.bindingsToSkip.clear();
      for (const [ key, value ] of this.bindingsProduced) {
        this.bindingsToSkip.set(key, value);
      }
      return createSource();
    };
  }

  public swapSource(): void {
    if (this._source && !this._source.done) {
      this._source.destroy();
      this._source = undefined;
      this._createSource = this.createSource;
      this._loadSourceAsync();
    }
  }

  protected override _push(item: Bindings): void {
    const bindingsHash = this.hashBindings(item, [ ...item.keys() ]);
    const bindingsToSkip = this.bindingsToSkip.get(bindingsHash);
    if (bindingsToSkip === undefined) {
      const bindingsProduced = this.bindingsProduced.get(bindingsHash) ?? 0;
      this.bindingsProduced.set(bindingsHash, bindingsProduced + 1);
      super._push(item);
    } else if (bindingsToSkip > 1) {
      this.bindingsToSkip.set(bindingsHash, bindingsToSkip - 1);
    } else {
      this.bindingsToSkip.delete(bindingsHash);
    }
  }
}
