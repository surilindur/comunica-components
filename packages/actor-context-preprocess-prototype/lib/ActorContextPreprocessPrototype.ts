import type {
  IActorContextPreprocessOutput,
  IActorContextPreprocessArgs,
  IActionContextPreprocess,
} from '@comunica/bus-context-preprocess';
import { ActorContextPreprocess } from '@comunica/bus-context-preprocess';
import { KeysRdfResolveHypermediaLinks } from '@comunica/context-entries-link-traversal';
import type { IAction, IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';

/**
 * A comunica Set Defaults Context Preprocess Actor.
 */
export class ActorContextPreprocessPrototype extends ActorContextPreprocess {
  private readonly filters: boolean;

  public constructor(args: IActorContextPreprocessPrototypeArgs) {
    super(args);
    this.filters = args.filters;
  }

  public async test(_action: IAction): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionContextPreprocess): Promise<IActorContextPreprocessOutput> {
    let context = action.context;

    if (action.initialize) {
      context = context.setDefault(KeysRdfResolveHypermediaLinks.linkFilters, []);
    }

    return { context };
  }
}

export interface IActorContextPreprocessPrototypeArgs extends IActorContextPreprocessArgs {
  /**
   * Whether to add link filter list to the context by default.
   * @range {boolean}
   * @default {true}
   */
  filters: boolean;
}
