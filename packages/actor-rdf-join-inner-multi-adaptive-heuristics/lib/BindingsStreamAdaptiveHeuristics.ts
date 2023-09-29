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
  private readonly timeout: number;
  private readonly createSource: () => Promise<BindingsStream>;
  private readonly pushedBindings: Map<string, number>;

  private timeoutHandle: NodeJS.Timeout | undefined;

  public constructor(
    source: BindingsStream,
    options: TransformIteratorOptions<Bindings> & { timeout: number },
    createSource: () => Promise<BindingsStream>,
  ) {
    super(source, options);
    this.timeout = options.timeout;
    this.createSource = createSource;
    this.pushedBindings = new Map();
  }

  public swapSource(): boolean {
    if (this.source && !this.source.done) {
      // TODO: try without destroy first
      // When the source provided does not actually allow closing then
      // this workaround is not needed
      // (<Record<any, any>>globalThis).blah = true;

      // Stop current iterator
      this.source.destroy();

      // Start a new iterator
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = undefined;
      }
      this._source = undefined;
      this._createSource = this.createSource;
      this._loadSourceAsync();
      return true;
    }
    return false;
  }

  protected _init(autoStart: boolean): void {
    super._init(autoStart);
    // Switch to a new stream after a timeout
    this.timeoutHandle = setTimeout(() => this.swapSource(), this.timeout);
  }

  protected _push(item: Bindings): void {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const bindingsKey = JSON.stringify(JSON.parse(item.toString()));
    if (this.timeoutHandle) {
      // If we're in the first stream, store the pushed bindings
      this.pushedBindings.set(bindingsKey, (this.pushedBindings.get(bindingsKey) || 0) + 1);
      super._push(item);
    } else {
      // If we're in the second stream, only push the bindings that were not yet pushed in the first stream
      const pushedBefore = this.pushedBindings.size > 0 ? this.pushedBindings.get(bindingsKey) : undefined;
      if (pushedBefore) {
        if (pushedBefore > 1) {
          this.pushedBindings.set(bindingsKey, pushedBefore - 1);
        } else {
          this.pushedBindings.delete(bindingsKey);
        }
      } else {
        super._push(item);
      }
    }
  }

  protected _end(destroy: boolean): void {
    super._end(destroy);
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
  }
}
