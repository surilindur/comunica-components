import { ActorRdfJoinInnerMultiAdaptiveDestroy } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { IActorRdfJoinInnerMultiAdaptiveDestroyArgs } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
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
  protected readonly swapOnlyOnce: boolean;
  protected readonly swapOnTimeout: boolean;
  protected readonly swapOnCardinalityChange: boolean;

  protected readonly mediatorHashBindings: MediatorHashBindings;
  protected readonly mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  protected disableJoinRestart: boolean;

  public constructor(args: IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs) {
    super(args);
    this.swapOnlyOnce = args.swapOnlyOnce;
    this.swapOnTimeout = args.swapOnTimeout;
    this.swapOnCardinalityChange = args.swapOnCardinalityChange;
    this.cardinalityThreshold = args.cardinalityThreshold;
    this.cardinalityThresholdMultiplier = args.cardinalityThresholdMultiplier;
    this.mediatorHashBindings = args.mediatorHashBindings;
    this.mediatorJoinEntriesSort = args.mediatorJoinEntriesSort;
    this.disableJoinRestart = !args.swapOnTimeout && !args.swapOnCardinalityChange;
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

    const mediatorHashBindingsResult = await this.mediatorHashBindings.mediate({
      context: action.context,
      // Hash collisions should not happen at all, but there is no actor like that available
      allowHashCollisions: true,
    });

    const currentJoinOrder: IJoinEntryWithMetadata[] = await getUpdatedJoinOrder();

    const entries = this.swapOnCardinalityChange ?
      action.entries.map(entry => {
        const addMetadataInvalidationListener = (metadata: MetadataBindings): void => {
          if (!this.disableJoinRestart) {
            const handleInvalidationEvent = async(): Promise<void> => {
              if (!this.disableJoinRestart) {
                const updatedMetadata: MetadataBindings = await entry.output.metadata();
                addMetadataInvalidationListener(updatedMetadata);
                if (bindingsStreamAdaptive && this.cardinalityChangeMeetsThreshold(metadata, updatedMetadata)) {
                  if (this.swapOnlyOnce && !this.disableJoinRestart) {
                    this.disableJoinRestart = true;
                  }
                  const updatedJoinOrder = await getUpdatedJoinOrder();
                  if (updatedJoinOrder.some((ent, index) => currentJoinOrder[index].operation !== ent.operation)) {
                    bindingsStreamAdaptive.swapSource();
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
      }) :
      action.entries;

    // Execute the join with the metadata we have now
    const firstOutput = await this.mediatorJoin.mediate({
      type: action.type,
      entries: this.cloneEntries(entries, false),
      context: subContext,
    });

    const createSource = async(): Promise<BindingsStream> => {
      const joinResult = await this.mediatorJoin.mediate({
        type: action.type,
        entries: this.cloneEntries(entries, false),
        context: subContext,
      });
      return joinResult.bindingsStream;
    };

    bindingsStreamAdaptive = new BindingsStreamAdaptiveHeuristics(
      firstOutput.bindingsStream,
      { timeout: this.swapOnTimeout ? this.timeout : undefined, autoStart: false },
      createSource,
      mediatorHashBindingsResult.hashFunction,
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
   * A mediator over the RDF Bindings Hash bus
   */
  mediatorHashBindings: MediatorHashBindings;
  /**
   * A mediator over the RDF Join Entries Sort bus
   */
  mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;
  /**
   * The absolute change in cardinality required for the actor to consider changing join order.
   * @default {10}
   */
  cardinalityThreshold: number;
  /**
   * The relative change in cardinality required for the actor to consider changing join order.
   * This is compared against the result of dividing the higher value by the lower one between the old and new
   * metadata cardinality values.
   * @default {10}
   */
  cardinalityThresholdMultiplier: number;
  /**
   * Whether the actor should swap join order only once. When set to false, the actor will change the join
   * order every time the change makes sense after metadata update, an unlimited number of times.
   * @default {false}
   */
  swapOnlyOnce: boolean;
  /**
   * Whether to swap after the timeout is reached.
   * @default {false}
   */
  swapOnTimeout: boolean;
  /**
   * Whether to swap when the cardinality change is significant enough.
   * @default {true}
   */
  swapOnCardinalityChange: boolean;
  /**
   * The timeout, in milliseconds, to use for swapping join order.
   * @default {1000}
   */
  timeout: number;
}
