import { join } from 'node:path';
import { QueryEngineFactoryBase } from '@comunica/actor-init-query';
import { QueryEngine } from './QueryEngine';

/**
 * A factory that can create query engines dynamically based on a given config.
 */
export class QueryEngineFactory extends QueryEngineFactoryBase<QueryEngine> {
  public constructor() {
    super(
      join(__dirname, '..'),
      join(__dirname, '..', 'config', 'config-default.json'),
      actorInitQuery => new QueryEngine(actorInitQuery),
    );
  }
}
