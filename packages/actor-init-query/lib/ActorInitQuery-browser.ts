import { ActorInitQueryBase } from './ActorInitQueryBase';

/* istanbul ignore next */
if (typeof process === 'undefined') {
  // Polyfills process.nextTick for readable-stream
  globalThis.process = <NodeJS.Process><unknown>require('process/');
}

export class ActorInitQuery extends ActorInitQueryBase {}
