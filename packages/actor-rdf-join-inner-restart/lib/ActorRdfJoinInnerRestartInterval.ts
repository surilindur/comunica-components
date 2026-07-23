import type { IActionRdfJoin, IActorRdfJoinTestSideData } from '@comunica/bus-rdf-join';
import type { TestResult } from '@comunica/core';
import { failTest } from '@comunica/core';
import type { IMediatorTypeJoinCoefficients } from '@comunica/mediatortype-join-coefficients';
import type { BindingsStream, IJoinEntryWithMetadata } from '@comunica/types';
import type { IActorRdfJoinInnerRestartArgs } from './ActorRdfJoinInnerRestartBase';
import { ActorRdfJoinInnerRestartBase } from './ActorRdfJoinInnerRestartBase';

/**
 * Comunica inner join actor that evaluates the current join upon input metadata invalidation events.
 */
export class ActorRdfJoinInnerRestartInterval extends ActorRdfJoinInnerRestartBase {
  private readonly evaluationInterval: number;

  public constructor(args: IActorRdfJoinInnerRestartIntervalArgs) {
    super(args);
    this.evaluationInterval = args.evaluationInterval;
  }

  public async test(
    action: IActionRdfJoin,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, IActorRdfJoinTestSideData>> {
    if (this.evaluationInterval < 100) {
      return failTest(`Actor ${this.name} has invalid evaluation interval specified`);
    }
    return super.test(action);
  }

  public async registerRestartTriggers(
    _entries: IJoinEntryWithMetadata[],
    bindingsStream: BindingsStream,
    attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void> {
    let evaluationTimeout: NodeJS.Timeout | undefined;

    const evaluationCallback = (): void => {
      if (!bindingsStream.done) {
        attemptJoinPlanRestart().then().catch((error: Error) => bindingsStream.destroy(error));
        evaluationTimeout = setTimeout(() => evaluationCallback(), this.evaluationInterval);
      }
    };

    setTimeout(() => evaluationCallback(), this.evaluationInterval);

    // Clear the timeout when the final output ends
    bindingsStream.on('end', () => {
      clearTimeout(evaluationTimeout);
    });
  }
}

export interface IActorRdfJoinInnerRestartIntervalArgs extends IActorRdfJoinInnerRestartArgs {
  /**
   * The interval in milliseconds, at which join restarts should be attempted.
   */
  evaluationInterval: number;
}
