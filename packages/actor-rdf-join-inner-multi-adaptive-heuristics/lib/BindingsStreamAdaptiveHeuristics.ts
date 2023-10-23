import type { Bindings, BindingsStream } from '@comunica/types';
import type { TransformIteratorOptions } from 'asynciterator';
import { TransformIterator } from 'asynciterator';

/**
 * An iterator that starts by iterating over the first iterator, and switches to a second iterator
 * either after a timeout or when the swapSource function is called.
 *
 * If the currently running iterator ends before a swap, the swap will not happen.
 * The iterator tracks bindings that are output to avoid producing duplicates.
 */
export class BindingsStreamAdaptiveHeuristics extends TransformIterator<Bindings> {
  private readonly createSource: () => Promise<BindingsStream>;
  private readonly hashBindings: (item: Bindings) => string;
  private readonly timeout: number | undefined;

  private timeoutHandle: NodeJS.Timeout | undefined;

  private currentSourceBindings: Map<string, number>;
  private previousSourceBindings: Map<string, number> | undefined;

  public constructor(
    source: BindingsStream,
    options: TransformIteratorOptions<Bindings> & { timeout: number | undefined },
    createSource: () => Promise<BindingsStream>,
    hashBindings: (item: Bindings) => string,
  ) {
    super(source, options);
    this.timeout = options.timeout;
    this.createSource = createSource;
    this.hashBindings = hashBindings;
    this.currentSourceBindings = new Map();
  }

  public swapSource(): void {
    const timeoutHandle = this.timeoutHandle;
    if (timeoutHandle) {
      this.timeoutHandle = undefined;
    }
    if (this.source && !this.source.done) {
      // TODO: try without destroy first
      // When the source provided does not actually allow closing then
      // this workaround is not needed
      // (<Record<any, any>>globalThis).blah = true;

      // Stop current iterator
      this.source.destroy();

      // When swapping the source, make sure not to lose any pushed binding information from
      // the already previous bindings by migrating them to the current one before assigning
      // the current bindings as previous ones.
      if (this.previousSourceBindings) {
        for (const [ key, value ] of this.previousSourceBindings) {
          if (value > 0) {
            this.currentSourceBindings.set(key, (this.currentSourceBindings.get(key) ?? 0) + value);
          }
        }
      }

      this.previousSourceBindings = this.currentSourceBindings;
      this.currentSourceBindings = new Map();

      this._source = undefined;
      this._createSource = this.createSource;
      this._loadSourceAsync();

      // eslint-disable-next-line no-console
      console.log(`Swapped source`);
    }
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  protected _begin(done: () => void): void {
    super._begin(done);
    if (this.timeout) {
      // Switch to a new stream after a timeout
      this.timeoutHandle = setTimeout(() => this.swapSource(), this.timeout);
    }
  }

  protected _push(item: Bindings): void {
    const bindingsKey = this.hashBindings(item);
    let shouldPushBinding = true;
    if (this.previousSourceBindings) {
      // If this binding has been pushed previously, do not push it again
      const previouslyPushed = this.previousSourceBindings.get(bindingsKey);
      if (previouslyPushed !== undefined) {
        if (previouslyPushed > 1) {
          this.previousSourceBindings.set(bindingsKey, previouslyPushed - 1);
        } else {
          this.previousSourceBindings.delete(bindingsKey);
        }
        shouldPushBinding = false;
      }
    }
    if (shouldPushBinding) {
      this.currentSourceBindings.set(bindingsKey, (this.currentSourceBindings.get(bindingsKey) ?? 0) + 1);
      super._push(item);
    }
  }

  protected _end(destroy: boolean): void {
    super._end(destroy);
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
  }
}
