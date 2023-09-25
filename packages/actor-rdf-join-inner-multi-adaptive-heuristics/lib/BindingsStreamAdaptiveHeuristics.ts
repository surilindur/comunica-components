import type { Bindings, BindingsStream } from '@comunica/types';
import type { TransformIteratorOptions } from 'asynciterator';
import { TransformIterator } from 'asynciterator';

/**
 * An iterator that starts by iterating over the first iterator,
 * and switches to a second iterator after a timeout.
 *
 * If the first iterator ends before the timout, the second iterator will not be started.
 *
 * This will ensure that results are not duplicated after switching.
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
    this.timeout = options.timeout * 1_000_000;
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
    // Switch to the second stream after a timeout
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
        this.pushedBindings.set(bindingsKey, pushedBefore - 1);
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
