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
import { ActionContextKey, failTest, passTestWithSideData } from '@comunica/core';
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
import type { Algebra } from 'sparqlalgebrajs';
import { BindingsStreamRestart } from './BindingsStreamRestart';

/**
 * Comunica inner join actor for restarting join subtrees in a query plan.
 */
export class ActorRdfJoinInnerRestart extends ActorRdfJoin {
  protected readonly evaluationAfterMetadataUpdate: boolean;
  protected readonly evaluationInterval: number | undefined;
  protected readonly restartLimit: number;
  protected readonly restartThreshold: number;
  protected readonly wrapAllJoins: boolean;

  protected readonly mediatorHashBindings: MediatorHashBindings;
  protected readonly mediatorJoin: MediatorRdfJoin;
  protected readonly mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  public static readonly keyWrappedOperations = new ActionContextKey<Algebra.Operation[]>(
    'urn:comunica:actor-rdf-join-inner-restart#operations',
  );

  public constructor(args: IActorRdfJoinInnerRestartArgs) {
    super(args, { logicalType: 'inner', physicalName: 'restart', canHandleUndefs: true });
    this.mediatorHashBindings = args.mediatorHashBindings;
    this.mediatorJoin = args.mediatorJoin;
    this.mediatorJoinEntriesSort = args.mediatorJoinEntriesSort;
    this.evaluationAfterMetadataUpdate = args.evaluationAfterMetadataUpdate;
    this.evaluationInterval = args.evaluationInterval;
    this.restartLimit = args.restartLimit ?? Number.POSITIVE_INFINITY;
    this.restartThreshold = args.restartThreshold;
    this.wrapAllJoins = args.wrapAllJoins;
  }

  public async test(
    action: IActionRdfJoin,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, IActorRdfJoinTestSideData>> {
    if (action.context.has(KeysRdfJoin.skipAdaptiveJoin)) {
      return failTest(`${this.name} cannot run due to adaptive join being disabled`);
    }
    const previouslyWrappedOperations = action.context.get(ActorRdfJoinInnerRestart.keyWrappedOperations);
    if (previouslyWrappedOperations) {
      if (!this.wrapAllJoins) {
        return failTest(`${this.name} can only wrap the topmost join`);
      }
      if (action.entries.some(e => previouslyWrappedOperations.includes(e.operation))) {
        return failTest(`${this.name} can only wrap a single set of join entries once`);
      }
    }
    if (!this.evaluationAfterMetadataUpdate && !this.evaluationInterval) {
      return failTest(`${this.name} has no evaluation conditions enabled`);
    }
    if (this.restartLimit < 1 || this.restartThreshold <= 0) {
      return failTest(`${this.name} cannot restart even once`);
    }
    return super.test(action);
  }

  public async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    // Update the list of previously wrapped entries to include the current operations
    const context = action.context.set(
      ActorRdfJoinInnerRestart.keyWrappedOperations,
      [
        ...action.entries.map(e => e.operation),
        ...action.context.get(ActorRdfJoinInnerRestart.keyWrappedOperations) ?? [],
      ],
    );

    let currentJoinOrder: IJoinEntryWithMetadata[] = await this.getSortedJoinEntries(action.entries, context);
    let currentJoinOrderUpdated = false;
    let currentRestartCount = 0;

    // The total join output side needs to be estimated for using the restart threshold
    const joinSelectivity = await this.mediatorJoinSelectivity.mediate({ context, entries: action.entries });
    const currentOperationCardinalities = new Map<Algebra.Operation, number>();

    // Execute the join with the metadata we have now
    const firstJoinOutput = await this.getJoinOutput(action.type, action.entries, context);

    // Acquire the function used to hash bindings
    const hashFunction = (await this.mediatorHashBindings.mediate({ context })).hashFunction;

    // Helper function to create a new source stream via join bus
    const createJoinOutputBindingsStream = async(): Promise<BindingsStream> => {
      const joinResult = await this.getJoinOutput(action.type, action.entries, context);
      return joinResult.bindingsStream;
    };

    const bindingsStream = new BindingsStreamRestart(
      firstJoinOutput.bindingsStream,
      { autoStart: false, maxBufferSize: 0 },
      createJoinOutputBindingsStream,
      hashFunction,
    );

    const estimateJoinOutputCardinality = (): number => {
      let total = 0;
      for (const value of currentOperationCardinalities.values()) {
        total += value;
      }
      // Return the ceiling to avoid issues when estimate is over 0 but close to it
      return Math.ceil(total * joinSelectivity.selectivity);
    };

    const attemptJoinPlanRestart = (): void => {
      if (currentRestartCount < this.restartLimit) {
        const expectedBindings = estimateJoinOutputCardinality();
        const restartThreshold = Math.ceil(this.restartThreshold * expectedBindings);
        if (bindingsStream.totalBindingsProduced < restartThreshold) {
          this.logWarn(context, 'Swapping join order', () => ({
            expectedBindings,
            producedBindings: bindingsStream.totalBindingsProduced,
            restartThreshold,
          }));
          bindingsStream.swapSource();
          currentRestartCount++;
          currentJoinOrderUpdated = false;
        } else {
          this.logWarn(context, 'Skipping join order swap', () => ({
            expectedBindings,
            producedBindings: bindingsStream.totalBindingsProduced,
            restartThreshold,
          }));
        }
      }
    };

    for (const entry of action.entries) {
      const invalidateListener = (): void => {
        entry.output.metadata().then((updatedMetadata) => {
          currentOperationCardinalities.set(entry.operation, updatedMetadata.cardinality.value);
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
                if (this.evaluationAfterMetadataUpdate) {
                  attemptJoinPlanRestart();
                }
              }
            }).catch((error: Error) => entry.output.bindingsStream.destroy(error));
          }
        }).catch((error: Error) => entry.output.bindingsStream.destroy(error));
      };

      // Add the initial listener to the current metadata entries, and also record the total
      // cardinality sum of all join inputs for use in join restart threshold calculations.
      entry.output.metadata()
        .then((metadata) => {
          metadata.state.addInvalidateListener(invalidateListener);
          currentOperationCardinalities.set(entry.operation, metadata.cardinality.value);
        })
        .catch((error: Error) => entry.output.bindingsStream.destroy(error));
    }

    let evaluationTimeout: NodeJS.Timeout | undefined;

    if (this.evaluationInterval) {
      const checkForRestart = (): void => {
        if (currentRestartCount < this.restartLimit) {
          if (currentJoinOrderUpdated) {
            attemptJoinPlanRestart();
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
   * @range {boolean}
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
  /**
   * The threshold for restarting the joins, presented as decimal in [0, 1] relative to the total estimated
   * bindings count produced by a join. When the join plan appears sub-optimal and the work already done is below
   * the threshold, then the join plan will be restarted.
   * @range {float}
   * @default {0.5}
   */
  restartThreshold: number;
  /**
   * Whether all joins should be wrapped, or only the topmost one. Wrapping all joins will impact performance.
   * @range {boolean}
   * @default {false}
   */
  wrapAllJoins: boolean;
}
