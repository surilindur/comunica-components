import { ActorRdfJoinInnerMultiAdaptiveDestroy } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { IActorRdfJoinInnerMultiAdaptiveDestroyArgs } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
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

    const cloneEntries = (): IJoinEntry[] => action.entries.map(entry => {
      if (!this.swapped) {
        const addInvalidationEventListener = (old: MetadataBindings): void => {
          const handleInvalidationEvent = async(): Promise<void> => {
            if (!this.swapped) {
              const updated: MetadataBindings = await entry.output.metadata();
              addInvalidationEventListener(updated);
              if (
                bindingsStreamAdaptive &&
                Math.abs(updated.cardinality.value - old.cardinality.value) > this.cardinalityThreshold &&
                Math.abs(updated.cardinality.value / (
                  old.cardinality.value > 0 ? old.cardinality.value : 1
                )) > this.cardinalityThresholdMultiplier
              ) {
                if (this.allowOnlyOnce && !this.swapped) {
                  this.swapped = true;
                }
                const success = bindingsStreamAdaptive.swapSource();
                // eslint-disable-next-line no-console
                console.log(`Swap: success ${success}, ${old.cardinality.value} -> ${updated.cardinality.value}`);
              }
            }
          };
          old.state.addInvalidateListener(() => setImmediate(handleInvalidationEvent));
        };
        entry.output.metadata()
          .then((metadata: MetadataBindings) => addInvalidationEventListener(metadata))
          .catch(error => new Error(error));
      }
      return {
        operation: entry.operation,
        output: {
          ...entry.output,
          // Clone stream, as we'll also need it later
          bindingsStream: entry.output.bindingsStream.clone(),
        },
      };
    });

    // Execute the join with the metadata we have now
    const firstOutput = await this.mediatorJoin.mediate({
      type: action.type,
      entries: cloneEntries(),
      context: subContext,
    });

    const createSource = async(): Promise<BindingsStream> => {
      const joinResult = await this.mediatorJoin.mediate({
        type: action.type,
        entries: cloneEntries(),
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
    throw new Error(`The cloneEntries method of ${this.name} should never be used`);
  }
}

export interface IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs extends IActorRdfJoinInnerMultiAdaptiveDestroyArgs {
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
