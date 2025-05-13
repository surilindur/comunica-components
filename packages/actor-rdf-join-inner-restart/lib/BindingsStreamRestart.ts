import type { HashFunction } from '@comunica/bus-hash-bindings';
import type { Bindings, BindingsStream } from '@comunica/types';
import type { TransformIteratorOptions } from 'asynciterator';
import { TransformIterator } from 'asynciterator';

/**
 * An iterator that can be instructed to pull a new source at will,
 * and automatically skips would-be-produced duplicates.
 */
export class BindingsStreamRestart extends TransformIterator<Bindings> {
  private readonly createSource: () => Promise<BindingsStream>;
  private readonly hashBindings: HashFunction;

  private readonly bindingsProduced: Map<number, number>;
  private readonly bindingsSkipped: Map<number, number>;

  public get totalBindingsProduced(): number {
    let total = 0;
    for (const count of this.bindingsProduced.values()) {
      total += count;
    }
    return total;
  }

  public constructor(
    source: BindingsStream,
    options: TransformIteratorOptions<Bindings>,
    createSource: () => Promise<BindingsStream>,
    hashBindings: HashFunction,
  ) {
    super(source, options);
    this.createSource = createSource;
    this.hashBindings = hashBindings;
    this.bindingsProduced = new Map();
    this.bindingsSkipped = new Map();
  }

  public swapSource(): void {
    if (this._source && !this._source.done) {
      this._source.destroy();
      this.bindingsSkipped.clear();
      this._source = undefined;
      this._createSource = this.createSource;
      this._loadSourceAsync();
    }
  }

  protected override _push(item: Bindings): void {
    const bindingsKey = this.hashBindings(item, [ ...item.keys() ]);
    const currentSkipped = this.bindingsSkipped.get(bindingsKey) ?? 0;
    const currentProduced = this.bindingsProduced.get(bindingsKey) ?? 0;
    if (currentSkipped < currentProduced) {
      this.bindingsSkipped.set(bindingsKey, currentSkipped + 1);
    } else {
      this.bindingsProduced.set(bindingsKey, currentProduced + 1);
      super._push(item);
    }
  }
}
