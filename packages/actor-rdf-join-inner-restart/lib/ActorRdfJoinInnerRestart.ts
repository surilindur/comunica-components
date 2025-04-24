import type { MediatorHashBindings } from '@comunica/bus-hash-bindings';
import type {
  IActionRdfJoin,
  IActorRdfJoinArgs,
  IActorRdfJoinOutputInner,
  IActorRdfJoinTestSideData,
  MediatorRdfJoin,
} from '@comunica/bus-rdf-join';
import { ActorRdfJoin } from '@comunica/bus-rdf-join';
import type { MediatorRdfJoinEntriesSort } from '@comunica/bus-rdf-join-entries-sort';
import { KeysRdfJoin } from '@comunica/context-entries-link-traversal';
import { failTest, passTestWithSideData } from '@comunica/core';
import type { TestResult } from '@comunica/core';
import type { IMediatorTypeJoinCoefficients } from '@comunica/mediatortype-join-coefficients';
import type {
  BindingsStream,
  IActionContext,
  IQueryOperationResultBindings,
  IJoinEntry,
  IJoinEntryWithMetadata,
  MetadataBindings,
} from '@comunica/types';
import { TransformIterator } from 'asynciterator';
import { BindingsStreamRestart } from './BindingsStreamRestart';

/**
 * A comunica Inner Multi Adaptive Heuristics RDF Join Actor.
 */
export class ActorRdfJoinInnerRestart extends ActorRdfJoin {
  protected readonly evaluationAfterMetadataUpdate: boolean;
  protected readonly evaluationInterval: number | undefined;
  protected readonly restartLimit: number;

  protected readonly mediatorHashBindings: MediatorHashBindings;
  protected readonly mediatorJoin: MediatorRdfJoin;
  protected readonly mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  public constructor(args: IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs) {
    super(args, { logicalType: 'inner', physicalName: 'restart', canHandleUndefs: true });
    this.mediatorHashBindings = args.mediatorHashBindings;
    this.mediatorJoin = args.mediatorJoin;
    this.mediatorJoinEntriesSort = args.mediatorJoinEntriesSort;
    this.evaluationAfterMetadataUpdate = args.evaluationAfterMetadataUpdate;
    this.evaluationInterval = args.evaluationInterval;
    this.restartLimit = args.restartLimit ?? Number.POSITIVE_INFINITY;
  }

  public async test(
    action: IActionRdfJoin,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, IActorRdfJoinTestSideData>> {
    if (action.context.has(KeysRdfJoin.skipAdaptiveJoin)) {
      return failTest(`${this.name} can only wrap a join once`);
    }
    if (!this.evaluationAfterMetadataUpdate && !this.evaluationInterval) {
      return failTest(`${this.name} has no evaluation conditions enabled`);
    }
    if (this.restartLimit < 1) {
      return failTest(`${this.name} cannot evaluate even once`);
    }
    return super.test(action);
  }

  protected async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    // Disable adaptive joins in recursive calls to this bus, to avoid infinite recursion on this actor.
    const subContext: IActionContext = action.context.set(KeysRdfJoin.skipAdaptiveJoin, true);

    let bindingsStream: BindingsStreamRestart | undefined;

    const mediatorHashBindingsResult = await this.mediatorHashBindings.mediate({ context: action.context });

    let currentJoinOrder: IJoinEntryWithMetadata[] = await this.getSortedJoinEntries(action);
    let currentJoinOrderUpdated = false;

    let currentRestartCount = 0;

    const entries = action.entries.map((entry) => {
      const addMetadataInvalidationListener = (metadata: MetadataBindings): void => {
        const handleInvalidationEvent = (): void => {
          if (currentRestartCount < this.restartLimit) {
            entry.output.metadata().then((updatedMetadata) => {
              addMetadataInvalidationListener(updatedMetadata);
              if (bindingsStream && metadata.cardinality.value !== updatedMetadata.cardinality.value) {
                this.getSortedJoinEntries(action).then((updatedJoinOrder) => {
                  if (updatedJoinOrder.some((je, index) => currentJoinOrder[index].operation !== je.operation)) {
                    this.logDebug(action.context, 'Current join order is sub-optimal', () => ({
                      currentJoinOrder: currentJoinOrder.map(e => `${e.operation.type}:${e.metadata.cardinality.type === 'estimate' ? '~' : ''}${e.metadata.cardinality.value}`),
                      updatedJoinOrder: updatedJoinOrder.map(e => `${e.operation.type}:${e.metadata.cardinality.type === 'estimate' ? '~' : ''}${e.metadata.cardinality.value}`),
                    }));
                    currentJoinOrder = updatedJoinOrder;
                    currentJoinOrderUpdated = true;
                    if (this.evaluationAfterMetadataUpdate) {
                      this.logWarn(action.context, 'Swapping join order upon metadata cardinality update');
                      bindingsStream!.swapSource();
                    }
                  }
                }).catch((error: Error) => bindingsStream?.destroy(error));
              }
            }).catch((error: Error) => bindingsStream?.destroy(error));
          }
        };
        metadata.state.addInvalidateListener(() => setTimeout(handleInvalidationEvent));
      };
      entry.output.metadata().then(addMetadataInvalidationListener).catch((error: Error) => {
        throw error;
      });
      return entry;
    });

    const mediateJoin = (): Promise<IQueryOperationResultBindings> => this.mediatorJoin.mediate({
      type: action.type,
      entries: this.cloneEntries(entries),
      context: subContext,
    });

    const createSource = async(): Promise<BindingsStream> => {
      currentRestartCount++;
      currentJoinOrderUpdated = false;
      const joinResult = await mediateJoin();
      return joinResult.bindingsStream;
    };

    // Execute the join with the metadata we have now
    const firstOutput = await mediateJoin();

    bindingsStream = new BindingsStreamRestart(
      firstOutput.bindingsStream,
      { autoStart: false },
      createSource,
      mediatorHashBindingsResult.hashFunction,
    );

    let evaluationTimeout: NodeJS.Timeout | undefined;

    if (this.evaluationInterval) {
      const checkForRestart = (): void => {
        if (currentJoinOrderUpdated) {
          this.logWarn(action.context, 'Swapping join order upon timeout');
          bindingsStream.swapSource();
        }
        evaluationTimeout = setTimeout(checkForRestart, this.evaluationInterval);
      };
      checkForRestart();
    }

    // This will hopefully make sure that the original streams are destroyed
    bindingsStream.on('end', () => {
      clearTimeout(evaluationTimeout);
      for (const entry of action.entries) {
        entry.output.bindingsStream.destroy();
      }
    });

    return { result: { type: 'bindings', bindingsStream, metadata: firstOutput.metadata }};
  }

  protected async getJoinCoefficients(
    _action: IActionRdfJoin,
    sideData: IActorRdfJoinTestSideData,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, IActorRdfJoinTestSideData>> {
    return passTestWithSideData({
      blockingItems: 0,
      iterations: 0,
      persistedItems: 0,
      requestTime: 0,
    }, { ...sideData });
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
    return entries.map((entry) => {
      const clonedBindingsStream = entry.output.bindingsStream.clone();
      const bindingsStream = new TransformIterator(clonedBindingsStream, { destroySource: true, autoStart: false });
      return {
        operation: entry.operation,
        output: {
          ...entry.output,
          bindingsStream,
        },
      };
    });
  }
}

export interface IActorRdfJoinInnerMultiAdaptiveHeuristicsArgs extends IActorRdfJoinArgs {
  /**
   * A mediator over the RDF Bindings Hash bus.
   */
  mediatorHashBindings: MediatorHashBindings;
  /**
   * A mediator over the RDF Join bus.
   */
  mediatorJoin: MediatorRdfJoin;
  /**
   * A mediator over the RDF Join Entries Sort bus.
   */
  mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;
  /**
   * Whether the join should be evaluated when join entry metadata is updated.
   * @default {false}
   */
  evaluationAfterMetadataUpdate: boolean;
  /**
   * Optional interval in milliseconds to perform evaluations at, starting from the beginning of join.
   * @range {integer}
   */
  evaluationInterval?: number;
  /**
   * Optional limit on the number of restarts caused by evaluations. When undefined, defaults to unlimited.
   * @range {integer}
   */
  restartLimit?: number;
}
