import { ActorRdfJoinInnerMultiAdaptiveDestroy } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { IActorRdfJoinInnerMultiAdaptiveDestroyArgs } from '@comunica/actor-rdf-join-inner-multi-adaptive-destroy';
import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import { ClosableTransformIterator } from '@comunica/bus-query-operation';
import type { IActionRdfJoin, IActorRdfJoinOutputInner } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import type { IMediatorTypeJoinCoefficients } from '@comunica/mediatortype-join-coefficients';
import type {
  BindingsStream,
  IActionContext,
  IQueryOperationResultBindings,
  IJoinEntry,
  IJoinEntryWithMetadata,
  MetadataBindings,
} from '@comunica/types';
import { BindingsStreamAdaptiveHeuristics } from './BindingsStreamAdaptiveHeuristics';

/**
 * A comunica Inner Multi Adaptive Heuristics RDF Join Actor.
 */
export class ActorRdfJoinInnerMultiAdaptiveHeuristics extends ActorRdfJoinInnerMultiAdaptiveDestroy {
  protected readonly useCardinality: boolean;
  protected readonly useTimeout: boolean;
  protected readonly allowUnlimitedRestarts: boolean;
  protected readonly restartMessage?: string;

  protected readonly mediatorHashBindings: MediatorHashBindings;
  protected readonly mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  public constructor(args: IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs) {
    super(args);
    this.useCardinality = args.useCardinality;
    this.useTimeout = args.useTimeout;
    this.allowUnlimitedRestarts = args.allowUnlimitedRestarts;
    this.restartMessage = args.restartMessage;
    this.mediatorHashBindings = args.mediatorHashBindings;
    this.mediatorJoinEntriesSort = args.mediatorJoinEntriesSort;
  }

  public async test(action: IActionRdfJoin): Promise<IMediatorTypeJoinCoefficients> {
    if (!this.useCardinality && !this.useTimeout) {
      throw new Error(`${this.name} has been disabled via configuration`);
    }
    return super.test(action);
  }

  protected async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    // Disable adaptive joins in recursive calls to this bus, to avoid infinite recursion on this actor.
    const subContext: IActionContext = action.context.set(KeysRdfJoin.skipAdaptiveJoin, true);

    let bindingsStreamAdaptive: BindingsStreamAdaptiveHeuristics | undefined;

    const mediatorHashBindingsResult = await this.mediatorHashBindings.mediate({
      context: action.context,
      // Hash collisions should not happen at all, but there is no actor like that available
      allowHashCollisions: true,
    });

    let currentJoinOrder: IJoinEntryWithMetadata[] = await this.getSortedJoinEntries(action);
    let allowRestarts = true;

    const entries = !this.useCardinality ?
      action.entries :
      action.entries.map(entry => {
        const addMetadataInvalidationListener = (metadata: MetadataBindings): void => {
          const handleInvalidationEvent = async(): Promise<void> => {
            if (allowRestarts) {
              const updatedMetadata: MetadataBindings = await entry.output.metadata();
              addMetadataInvalidationListener(updatedMetadata);
              if (bindingsStreamAdaptive && metadata.cardinality.value !== updatedMetadata.cardinality.value) {
                const updatedJoinOrder = await this.getSortedJoinEntries(action);
                if (updatedJoinOrder.some((je, index) => currentJoinOrder[index].operation !== je.operation)) {
                  currentJoinOrder = updatedJoinOrder;
                  bindingsStreamAdaptive.swapSource();
                }
              }
            }
          };
          if (allowRestarts) {
            metadata.state.addInvalidateListener(() => setTimeout(handleInvalidationEvent));
          }
        };
        entry.output.metadata().then(addMetadataInvalidationListener).catch(error => {
          throw new Error(error);
        });
        return entry;
      });

    const mediateJoin = (): Promise<IQueryOperationResultBindings> => this.mediatorJoin.mediate({
      type: action.type,
      entries: this.cloneEntries(entries),
      context: subContext,
    });

    const createSource = async(): Promise<BindingsStream> => {
      if (allowRestarts && !this.allowUnlimitedRestarts) {
        allowRestarts = false;
      }
      if (this.restartMessage) {
        // eslint-disable-next-line no-console
        console.log(this.restartMessage);
      }
      const joinResult = await mediateJoin();
      return joinResult.bindingsStream;
    };

    // Execute the join with the metadata we have now
    const firstOutput = await mediateJoin();

    bindingsStreamAdaptive = new BindingsStreamAdaptiveHeuristics(
      firstOutput.bindingsStream,
      { timeout: this.useTimeout ? this.timeout : undefined, autoStart: false },
      createSource,
      mediatorHashBindingsResult.hashFunction,
    );

    // This will hopefully make sure that the original streams are destroyed
    bindingsStreamAdaptive.on('end', () => action.entries.forEach(je => je.output.bindingsStream.destroy()));

    return {
      result: {
        type: 'bindings',
        bindingsStream: bindingsStreamAdaptive,
        metadata: firstOutput.metadata,
      },
    };
  }

  protected async getSortedJoinEntries(action: IActionRdfJoin): Promise<IJoinEntryWithMetadata[]> {
    const entriesWithMetadata: IJoinEntryWithMetadata[] = [];

    for (const entry of action.entries) {
      entriesWithMetadata.push({
        ...entry,
        metadata: await entry.output.metadata(),
      });
    }

    const sortResult = await this.mediatorJoinEntriesSort.mediate({
      context: action.context,
      entries: entriesWithMetadata,
    });

    return sortResult.entries;
  }

  protected cloneEntries(entries: IJoinEntry[]): IJoinEntry[] {
    return entries.map(entry => {
      const clonedBindingsStream = entry.output.bindingsStream.clone();
      return {
        operation: entry.operation,
        output: {
          ...entry.output,
          bindingsStream: new ClosableTransformIterator(clonedBindingsStream, {
            autoStart: false,
            onClose() {
              clonedBindingsStream.destroy();
            },
          }),
        },
      };
    });
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
   * Whether the join should be restarted after metadata cardinality value changes.
   * @default {false}
   */
  useCardinality: boolean;
  /**
   * Whether the timeout value should be used to restart a join operation at a specific moment.
   * @default {false}
   */
  useTimeout: boolean;
  /**
   * Whether the actor should swap join order an unlimited number of times.
   * @default {false}
   */
  allowUnlimitedRestarts: boolean;
  /**
   * Message to print to console when restarting the join.
   */
  restartMessage?: string;
}
