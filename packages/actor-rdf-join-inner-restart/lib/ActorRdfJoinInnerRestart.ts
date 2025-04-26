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
  LogicalJoinType,
} from '@comunica/types';
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

  public constructor(args: IActorRdfJoinInnerRestartArgs) {
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
      return failTest(`${this.name} cannot restart even once`);
    }
    return super.test(action);
  }

  public async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    const context = action.context.set(KeysRdfJoin.skipAdaptiveJoin, true);

    let currentJoinOrder: IJoinEntryWithMetadata[] = await this.getSortedJoinEntries(action.entries, context);
    let currentJoinOrderUpdated = false;
    let currentRestartCount = 0;

    // Execute the join with the metadata we have now
    const firstJoinOutput = await this.getJoinOutput(action.type, action.entries, context);

    // Acquire the function used to hash bindings
    const hashFunction = (await this.mediatorHashBindings.mediate({ context })).hashFunction;

    // Helper function to create a new source stream via join bus
    const createSource = async(): Promise<BindingsStream> => {
      currentRestartCount++;
      currentJoinOrderUpdated = false;
      const joinResult = await this.getJoinOutput(action.type, action.entries, context);
      return joinResult.bindingsStream;
    };

    const bindingsStream = new BindingsStreamRestart(
      firstJoinOutput.bindingsStream,
      { autoStart: false, maxBufferSize: 0 },
      createSource,
      hashFunction,
    );

    for (const entry of action.entries) {
      const invalidateListener = (): void => {
        entry.output.metadata().then((updatedMetadata) => {
          updatedMetadata.state.addInvalidateListener(invalidateListener);
          if (!currentJoinOrderUpdated) {
            this.getSortedJoinEntries(action.entries, context).then((updatedJoinOrder) => {
              if (updatedJoinOrder.some((e, i) => currentJoinOrder[i].operation !== e.operation)) {
                this.logDebug(context, 'Current join order is sub-optimal', () => ({
                  currentJoinOrder: currentJoinOrder.map(e => `${e.operation.type}:${e.metadata.cardinality.type === 'estimate' ? '~' : ''}${e.metadata.cardinality.value}`),
                  updatedJoinOrder: updatedJoinOrder.map(e => `${e.operation.type}:${e.metadata.cardinality.type === 'estimate' ? '~' : ''}${e.metadata.cardinality.value}`),
                }));
                currentJoinOrder = updatedJoinOrder;
                currentJoinOrderUpdated = true;
                if (this.evaluationAfterMetadataUpdate && currentRestartCount < this.restartLimit) {
                  this.logWarn(context, 'Swapping join order upon metadata cardinality update');
                  bindingsStream.swapSource();
                }
              }
            }).catch((error: Error) => entry.output.bindingsStream.destroy(error));
          }
        }).catch((error: Error) => entry.output.bindingsStream.destroy(error));
      };

      // Add the initial listener to the current metadata
      entry.output.metadata()
        .then(metadata => metadata.state.addInvalidateListener(invalidateListener))
        .catch((error: Error) => entry.output.bindingsStream.destroy(error));
    }

    let evaluationTimeout: NodeJS.Timeout | undefined;

    if (this.evaluationInterval) {
      const checkForRestart = (): void => {
        if (currentRestartCount < this.restartLimit) {
          if (currentJoinOrderUpdated) {
            this.logWarn(context, 'Swapping join order upon timeout');
            bindingsStream.swapSource();
          }
          evaluationTimeout = setTimeout(checkForRestart, this.evaluationInterval);
        }
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

    return { result: { type: 'bindings', bindingsStream, metadata: firstJoinOutput.metadata }};
  }

  /**
   * The wrapper should produce lowest possible estimates for all coefficients.
   */
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

  /**
   * Acquire a sorted array of join entries with metadata through the join entry sort bus.
   */
  public async getSortedJoinEntries(entries: IJoinEntry[], context: IActionContext): Promise<IJoinEntryWithMetadata[]> {
    const entriesWithMetadata: IJoinEntryWithMetadata[] = [];
    for (const entry of entries) {
      entriesWithMetadata.push({
        ...entry,
        metadata: await entry.output.metadata(),
      });
    }
    const sortResult = await this.mediatorJoinEntriesSort.mediate({
      context,
      entries: entriesWithMetadata,
    });
    return sortResult.entries;
  }

  public async getJoinOutput(
    type: LogicalJoinType,
    entries: IJoinEntry[],
    context: IActionContext,
  ): Promise<IQueryOperationResultBindings> {
    return this.mediatorJoin.mediate({
      type,
      entries: entries.map(entry => ({
        operation: entry.operation,
        output: {
          ...entry.output,
          bindingsStream: entry.output.bindingsStream.clone(),
        },
      })),
      context,
    });
  }
}

export interface IActorRdfJoinInnerRestartArgs extends IActorRdfJoinArgs {
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
