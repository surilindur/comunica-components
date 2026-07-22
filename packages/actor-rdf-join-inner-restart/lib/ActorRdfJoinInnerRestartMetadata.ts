import type { IJoinEntryWithMetadata } from '@comunica/types';
import { ActorRdfJoinInnerRestartBase } from './ActorRdfJoinInnerRestartBase';
import type { BindingsStreamRestart } from './BindingsStreamRestart';

/**
 * Comunica inner join actor that evaluates the current join upon input metadata invalidation events.
 */
export class ActorRdfJoinInnerRestartMetadata extends ActorRdfJoinInnerRestartBase {
  public async registerRestartTriggers(
    entries: IJoinEntryWithMetadata[],
    _bindingsStreamRestart: BindingsStreamRestart,
    attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void> {
    for (const entry of entries) {
      // Metadata invalidation listener that attempts a join restart
      const attemptJoinPlanRestartOnMetadataInvalidation = (): void => {
        attemptJoinPlanRestart().then().catch((error: Error) => entry.output.bindingsStream.destroy(error));
      };

      // Metadata invalidation listener that registers the listeners on the new metadata
      const registerInvalidationListenersOnNewMetadata = (): void => {
        entry.output.metadata().then((updatedMetadata) => {
          updatedMetadata.state.addInvalidateListener(registerInvalidationListenersOnNewMetadata);
          updatedMetadata.state.addInvalidateListener(attemptJoinPlanRestartOnMetadataInvalidation);
        }).catch((error: Error) => entry.output.bindingsStream.destroy(error));
      };

      // Register invalidation listeners on the initial metadata
      entry.metadata.state.addInvalidateListener(registerInvalidationListenersOnNewMetadata);
      entry.metadata.state.addInvalidateListener(attemptJoinPlanRestartOnMetadataInvalidation);
    }
  }
}
