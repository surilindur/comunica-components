import { ActorRdfJoinInnerMultiAdaptiveDestroy } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { IActorRdfJoinInnerMultiAdaptiveDestroyArgs } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import { ClosableTransformIterator } from '@comunica/bus-query-operation';
import type { IActionRdfJoin, IActorRdfJoinOutputInner } from '@comunica/bus-rdf-join';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import type { BindingsStream, IJoinEntry, MetadataBindings } from '@comunica/types';
import { BindingsStreamAdaptiveHeuristics } from './BindingsStreamAdaptiveHeuristics';

/**
 * A comunica Inner Multi Adaptive Heuristics RDF Join Actor.
 */
export class ActorRdfJoinInnerMultiAdaptiveHeuristics extends ActorRdfJoinInnerMultiAdaptiveDestroy {
  protected cardinalityThreshold: number;
  protected cardinalityThresholdMultiplier: number;
  protected allowOnlyOnce: boolean;

  protected swapped: boolean;

  public constructor(args: IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs) {
    super(args);
    this.allowOnlyOnce = args.allowOnlyOnce;
    this.cardinalityThreshold = args.cardinalityThreshold;
    this.cardinalityThresholdMultiplier = args.cardinalityThresholdMultiplier;
    this.swapped = false;
  }

  protected async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    // Disable adaptive joins in recursive calls to this bus, to avoid infinite recursion on this actor.
    const subContext = action.context.set(KeysRdfJoin.skipAdaptiveJoin, true);

    let bindingsStreamAdaptive: BindingsStreamAdaptiveHeuristics | undefined;

    const handleMetadataInvalidation = (entries: IJoinEntry[]): IJoinEntry[] => entries.map((entry: IJoinEntry) => {
      const handleInvalidationEvent = (old: MetadataBindings): void => {
        old.state.addInvalidateListener(async() => {
          const updated: MetadataBindings = await entry.output.metadata();
          handleInvalidationEvent(updated);
          if (
            bindingsStreamAdaptive &&
            (!this.allowOnlyOnce || !this.swapped) &&
            (
              updated.cardinality.value >= this.cardinalityThresholdMultiplier * old.cardinality.value ||
              updated.cardinality.value >= this.cardinalityThreshold + old.cardinality.value
            )
          ) {
            if (!this.swapped) {
              this.swapped = true;
            }
            const success = bindingsStreamAdaptive.swapSource();
            // eslint-disable-next-line no-console
            console.log(`Restart join (success ${success}), cardinality ${old.cardinality.value} -> ${updated.cardinality.value}`);
          }
        });
      };
      entry.output.metadata()
        .then((metadata: MetadataBindings) => handleInvalidationEvent(metadata))
        .catch(error => new Error(error));
      return entry;
    });

    // Execute the join with the metadata we have now
    const firstOutput = await this.mediatorJoin.mediate({
      type: action.type,
      entries: handleMetadataInvalidation(this.cloneEntries(action.entries, false)),
      context: subContext,
    });

    const createSource = async(): Promise<BindingsStream> => {
      // eslint-disable-next-line no-console
      console.log('Create new source');
      const joinResult = await this.mediatorJoin.mediate({
        type: action.type,
        entries: handleMetadataInvalidation(this.cloneEntries(action.entries, false)),
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

  protected cloneEntries(entries: IJoinEntry[], allowClosingOriginals: boolean): IJoinEntry[] {
    return entries.map(entry => {
      // Clone stream, as we'll also need it later
      const cloneStream = new ClosableTransformIterator(entry.output.bindingsStream.clone(), {
        autoStart: false,
        onClose() {
          if (allowClosingOriginals && !entry.output.bindingsStream.destroyed) {
            entry.output.bindingsStream.destroy();
          }
        },
      });
      return {
        operation: entry.operation,
        output: {
          ...entry.output,
          bindingsStream: cloneStream,
        },
      };
    });
  }
}

export interface IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs extends IActorRdfJoinInnerMultiAdaptiveDestroyArgs {
  /**
   * @default {100}
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
