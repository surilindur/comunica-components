import { ActorRdfJoinInnerMultiAdaptiveDestroy } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { IActorRdfJoinInnerMultiAdaptiveDestroyArgs } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { IActionRdfJoin, IActorRdfJoinOutputInner } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import type { BindingsStream, IJoinEntryWithMetadata, MetadataBindings } from '@comunica/types';
import { BindingsStreamAdaptiveHeuristics } from './BindingsStreamAdaptiveHeuristics';

/**
 * A comunica Inner Multi Adaptive Heuristics RDF Join Actor.
 */
export class ActorRdfJoinInnerMultiAdaptiveHeuristics extends ActorRdfJoinInnerMultiAdaptiveDestroy {
  protected readonly cardinalityThreshold: number;
  protected readonly cardinalityThresholdMultiplier: number;
  protected readonly allowOnlyOnce: boolean;

  protected readonly mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  protected disableJoinRestart: boolean;

  public constructor(args: IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs) {
    super(args);
    this.allowOnlyOnce = args.allowOnlyOnce;
    this.cardinalityThreshold = args.cardinalityThreshold;
    this.cardinalityThresholdMultiplier = args.cardinalityThresholdMultiplier;
    this.mediatorJoinEntriesSort = args.mediatorJoinEntriesSort;
    this.disableJoinRestart = false;
  }

  protected async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    // Disable adaptive joins in recursive calls to this bus, to avoid infinite recursion on this actor.
    const subContext = action.context.set(KeysRdfJoin.skipAdaptiveJoin, true);

    let bindingsStreamAdaptive: BindingsStreamAdaptiveHeuristics | undefined;

    const getUpdatedJoinOrder = async(): Promise<IJoinEntryWithMetadata[]> => {
      const entriesWithMetadata: IJoinEntryWithMetadata[] = [];

      for (const entry of action.entries) {
        entriesWithMetadata.push({
          ...entry,
          metadata: await entry.output.metadata(),
        });
      }

      return (await this.mediatorJoinEntriesSort.mediate({
        context: action.context,
        entries: entriesWithMetadata,
      })).entries;
    };

    const currentJoinOrder: IJoinEntryWithMetadata[] = await getUpdatedJoinOrder();

    const entriesWithInvalidationListener = action.entries.map(entry => {
      const addMetadataInvalidationListener = (metadata: MetadataBindings): void => {
        if (!this.disableJoinRestart) {
          const handleInvalidationEvent = async(): Promise<void> => {
            if (!this.disableJoinRestart) {
              const updatedMetadata: MetadataBindings = await entry.output.metadata();
              addMetadataInvalidationListener(updatedMetadata);
              if (bindingsStreamAdaptive && this.cardinalityChangeMeetsThreshold(metadata, updatedMetadata)) {
                if (this.allowOnlyOnce && !this.disableJoinRestart) {
                  this.disableJoinRestart = true;
                }
                const updatedJoinOrder = await getUpdatedJoinOrder();
                if (updatedJoinOrder.some((ent, index) => currentJoinOrder[index].operation !== ent.operation)) {
                  const success = bindingsStreamAdaptive.swapSource();
                  if (success) {
                    // eslint-disable-next-line no-console
                    console.log(`Swapped source order due to cardinality estimate change ${metadata.cardinality.value} -> ${updatedMetadata.cardinality.value}`);
                  }
                }
              }
            }
          };
          metadata.state.addInvalidateListener(() => setImmediate(handleInvalidationEvent));
        }
      };
      entry.output.metadata().then(addMetadataInvalidationListener).catch(error => {
        throw new Error(error);
      });
      return entry;
    });

    // Execute the join with the metadata we have now
    const firstOutput = await this.mediatorJoin.mediate({
      type: action.type,
      entries: this.cloneEntries(entriesWithInvalidationListener, false),
      context: subContext,
    });

    const createSource = async(): Promise<BindingsStream> => {
      const joinResult = await this.mediatorJoin.mediate({
        type: action.type,
        entries: this.cloneEntries(entriesWithInvalidationListener, false),
        context: subContext,
      });
      return joinResult.bindingsStream;
    };

    bindingsStreamAdaptive = new BindingsStreamAdaptiveHeuristics(
      firstOutput.bindingsStream,
      { timeout: this.timeout, autoStart: false },
      createSource,
    );

    return {
      result: {
        type: 'bindings',
        bindingsStream: bindingsStreamAdaptive,
        metadata: firstOutput.metadata,
      },
    };
  }

  protected cardinalityChangeMeetsThreshold(old: MetadataBindings, updated: MetadataBindings): boolean {
    if (
      old.cardinality.value !== updated.cardinality.value &&
      Math.abs(old.cardinality.value - updated.cardinality.value) > this.cardinalityThreshold
    ) {
      const smallerValue = Math.min(old.cardinality.value, updated.cardinality.value);
      const largerValue = Math.max(old.cardinality.value, updated.cardinality.value);
      return Math.abs(largerValue / (smallerValue === 0 ? 1 : smallerValue)) > this.cardinalityThresholdMultiplier;
    }
    return false;
  }
}

export interface IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs extends IActorRdfJoinInnerMultiAdaptiveDestroyArgs {
  /**
   * A mediator over the RDF Join Entries Sort bus
   */
  mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;
  /**
   * @default {10}
   */
  cardinalityThreshold: number;
  /**
   * @default {10}
   */
  cardinalityThresholdMultiplier: number;
  /**
   * @default {false}
   */
  allowOnlyOnce: boolean;
}
