import type { IActorContextPreprocessOutput, IActorContextPreprocessArgs } from '@comunica/bus-context-preprocess';
import { ActorContextPreprocess } from '@comunica/bus-context-preprocess';
import { KeyLinkFilters } from '@comunica/bus-rdf-parse-link-filter';
import type { IActorTest, IAction } from '@comunica/core';

/**
 * A comunica Source To Destination Context Preprocess Actor.
 */
export class ActorContextPreprocessMembershipFilter extends ActorContextPreprocess {
  public constructor(args: IActorContextPreprocessArgs) {
    super(args);
  }

  public async test(action: IAction): Promise<IActorTest> {
    if (action.context.has(KeyLinkFilters)) {
      throw new Error(`${this.name} should only add filter storage to context once`);
    }
    return true;
  }

  public async run(action: IAction): Promise<IActorContextPreprocessOutput> {
    return { ...action, context: action.context.set(KeyLinkFilters, []) };
  }
}
