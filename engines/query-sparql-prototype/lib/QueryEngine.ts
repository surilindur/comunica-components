import { QueryEngineBase } from '@comunica/actor-init-query';
import type { ActorInitQueryBase } from '@comunica/actor-init-query';
import type { IQueryContextCommon } from '@comunica/types';

// eslint-disable-next-line ts/no-unsafe-assignment
const engineDefault = require('../engine-default.js');

/**
 * A Comunica SPARQL query engine.
 */
export class QueryEngine<QueryContext extends IQueryContextCommon = IQueryContextCommon>
  extends QueryEngineBase<QueryContext> {
  // eslint-disable-next-line ts/no-unsafe-assignment
  public constructor(engine: ActorInitQueryBase = engineDefault()) {
    super(engine);
  }
}
