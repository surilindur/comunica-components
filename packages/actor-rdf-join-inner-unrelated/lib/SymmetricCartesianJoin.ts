import type { Bindings, BindingsStream } from '@comunica/types';
import { AsyncIterator } from 'asynciterator';

type HashFunction = (bindings: Bindings) => number;
type JoinFunction = (first: Bindings, second: Bindings) => Bindings;

export class SymmetricHashJoin extends AsyncIterator<Bindings> implements BindingsStream {
  private readonly left: BindingsStream;
  private readonly leftMap: Map<number, Bindings>;

  private readonly right: BindingsStream;
  private readonly rightMap: Map<number, Bindings>;

  private usedLeft: boolean;

  private readonly hashFunction: HashFunction;
  private readonly joinFunction: JoinFunction;

  public constructor(
    left: BindingsStream,
    right: BindingsStream,
    hashFunction: HashFunction,
    joinFunction: JoinFunction,
  ) {
    super();

    this.left = left;
    this.right = right;

    this.hashFunction = hashFunction;
    this.joinFunction = joinFunction;

    this.usedLeft = false;
    this.leftMap = new Map();
    this.rightMap = new Map();

    this.on('end', () => this._cleanup());

    this.match = null;
    this.matches = [];
    this.matchIdx = 0;

    if (this.left.readable || this.right.readable) {
      this.readable = true;
    }

    this.left.on('error', (error: Error) => this.destroy(error));
    this.right.on('error', (error: Error) => this.destroy(error));

    this.left.on('readable', () => this.readable = true);
    this.right.on('readable', () => this.readable = true);

    // This needs to be here since it's possible the left/right streams
    // only get ended after there are no more results left
    this.left.on ('end', () => {
      if (!this.hasResults()) {
        this._end();
      }
    });

    this.right.on('end', () => {
      if (!this.hasResults()) {
        this._end();
      }
    });
  }

  public hasResults(): boolean {
    // The "!!this.match" condition was added as a workaround to race
    // conditions and/or duplicate "end" events that may lead to premature
    // cleanups of the "this.matches" array.
    // See https://github.com/joachimvh/asyncjoin/issues/7
    return !this.left.ended || !this.right.ended || (Boolean(this.matches) && this.matchIdx < this.matches.length);
  }

  public _cleanup(): void {
    // Motivate garbage collector to remove these
    this.leftMap.clear();
    this.rightMap.clear();
    this.matches = null;
  }

  protected _end(): void {
    super._end();
    this.left.destroy();
    this.right.destroy();
  }

  public read(): Bindings | null {
    while (true) {
      if (this.ended) {
        return null;
      }

      while (this.matchIdx < this.matches.length) {
        const item = this.matches[this.matchIdx++];
        const result = this.usedLeft ? this.joinFunction(this.match, item) : this.joinFunction(item, this.match);
        if (result !== null) {
          return result;
        }
      }

      if (!this.hasResults()) {
        this._end();
      }

      let item: Bindings | null = null;

      // Try both streams if the first one has no value
      for (let i = 0; i < 2; ++i) {
        item = this.usedLeft ? this.right.read() : this.left.read();
        this.usedLeft = !this.usedLeft; // Try other stream next time

        // found a result, no need to check the other stream this run
        if (item !== null) {
          break;
        }
      }

      if (this.done || item === null) {
        this.readable = false;
        return null;
      }

      const hash = this.hashFunction(item);

      if (this.usedLeft && this.right.done) {
        this.leftMap.clear();
      } else if (this.left.done) {
        this.rightMap.clear();
      } else {
        const map = this.usedLeft ? this.leftMap : this.rightMap;
        if (!map.has(hash)) {
          map.set(hash, []);
        }
        let arr = map.get(hash);
        if (!arr) {
          arr = [];
          map.set(hash, arr);
        }
        arr.push(item);
      }

      this.match = item;
      this.matches = (this.usedLeft ? this.rightMap : this.leftMap).get(hash) || [];
      this.matchIdx = 0;
    }
  }
}
