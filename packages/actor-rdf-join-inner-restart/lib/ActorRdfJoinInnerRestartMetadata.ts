import type { BindingsStream, IJoinEntryWithMetadata } from '@comunica/types';
import { ActorRdfJoinInnerRestartBase } from './ActorRdfJoinInnerRestartBase';

/**
 * Comunica inner join actor that evaluates the current join upon input metadata invalidation events.
 */
export class ActorRdfJoinInnerRestartMetadata extends ActorRdfJoinInnerRestartBase {
  public async registerRestartTriggers(
    entries: IJoinEntryWithMetadata[],
    _bindingsStream: BindingsStream,
    attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void> {
    for (const entry of entries) {
      let previousEntryCardinality = entry.metadata.cardinality.value;

      const metadataInvalidateListener = (): void => {
        entry.output.metadata().then((updatedMetadata) => {
          if (updatedMetadata.cardinality.value !== previousEntryCardinality) {
            previousEntryCardinality = updatedMetadata.cardinality.value;
            attemptJoinPlanRestart().then().catch((error: Error) => entry.output.bindingsStream.destroy(error));
          }
          updatedMetadata.state.addInvalidateListener(metadataInvalidateListener);
        }).catch((error: Error) => entry.output.bindingsStream.destroy(error));
      };

      // Register invalidation listeners on the initial metadata
      entry.metadata.state.addInvalidateListener(metadataInvalidateListener);
    }
  }
}
