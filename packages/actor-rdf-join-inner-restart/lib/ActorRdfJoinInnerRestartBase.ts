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
  IActionContext,
  IQueryOperationResultBindings,
  IJoinEntry,
  IJoinEntryWithMetadata,
} from '@comunica/types';
import { BindingsStreamRestart } from './BindingsStreamRestart';

/**
 * Comunica inner join actor for restarting a join operation, and thus all operations under it in the algebra tree.
 * This is the base class that is extenced by different trigger mechanism implementations.
 * The goal of this actor is to facilitate join plan restart-based experiments.
 */
export abstract class ActorRdfJoinInnerRestartBase extends ActorRdfJoin {
  protected readonly restartLimit: number;

  protected readonly mediatorHashBindings: MediatorHashBindings;
  protected readonly mediatorJoin: MediatorRdfJoin;
  protected readonly mediatorJoinEntriesSort: MediatorRdfJoinEntriesSort;

  public static readonly keyWrapped = new ActionContextKey<boolean>(
    '@comunica/actor-rdf-join-inner-restart:wrapped',
  );

  public constructor(args: IActorRdfJoinInnerRestartArgs) {
    super(args, { logicalType: 'inner', physicalName: 'restart', canHandleUndefs: true });
    this.mediatorHashBindings = args.mediatorHashBindings;
    this.mediatorJoin = args.mediatorJoin;
    this.mediatorJoinEntriesSort = args.mediatorJoinEntriesSort;
    this.restartLimit = args.restartLimit ?? Number.POSITIVE_INFINITY;
  }

  /**
   * The restart actor should only wrap a join if no parent join has been wrapped yet,
   * and when there is restart limit available, and adaptive joins are not disabled.
   */
  public async test(
    action: IActionRdfJoin,
  ): Promise<TestResult<IMediatorTypeJoinCoefficients, IActorRdfJoinTestSideData>> {
    if (action.context.has(KeysRdfJoin.skipAdaptiveJoin)) {
      return failTest(`Actor ${this.name} cannot run due to adaptive join being disabled`);
    }
    if (action.context.has(ActorRdfJoinInnerRestartBase.keyWrapped)) {
      return failTest(`Actor ${this.name} can only wrap the topmost join operation`);
    }
    return super.test(action);
  }

  /**
   * The wrapper should produce lowest possible coefficients to be selected over all other join implementations.
   * This method is called by the super class test method, and the coefficients are returned in passing test output.
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

  public async getOutput(action: IActionRdfJoin): Promise<IActorRdfJoinOutputInner> {
    // Mark the current context as having been wrapped, so all lower operations in the algebra tree are skipped
    const context = action.context.set(ActorRdfJoinInnerRestartBase.keyWrapped, true);

    // Acquire the function used to hash bindings
    const hashFunction = (await this.mediatorHashBindings.mediate({ context })).hashFunction;

    // Take note of the current join order for comparison purposes
    let joinOrder: IJoinEntryWithMetadata[] = await this.sortJoinEntries(action.entries, context);

    // How many times the current join has been restarted already
    let joinRestartCount = 0;

    // Acquire the initial join output for this operation
    const initialJoinOutput = await this.executeJoin(action, context);

    // Wrap the output using the restart stream, so that it can be restarted when necessary
    const bindingsStreamRestart = new BindingsStreamRestart(
      initialJoinOutput.bindingsStream,
      { autoStart: false, maxBufferSize: 0 },
      // The restart stream will destroy the original inputs when it gets destroyed
      action.entries.map(e => e.output.bindingsStream),
      // Helper function to get the next output stream after restart
      async() => (await this.executeJoin(action, context)).bindingsStream,
      hashFunction,
    );

    // Helper function to attempt a join restart, by checking the would-be order against the currently executing one.
    // The joinRestartPending flag exists to avoid race conditions if multiple restart checks are made too fast.
    const attemptJoinPlanRestart = async(): Promise<void> => {
      if (joinRestartCount < this.restartLimit && !bindingsStreamRestart.done) {
        const updatedJoinOrder = await this.sortJoinEntries(action.entries, context);
        if (updatedJoinOrder.some((e, i) => joinOrder[i].operation !== e.operation)) {
          joinRestartCount++;
          this.logWarn(context, 'Swapping join order', () => ({
            producedBindings: bindingsStreamRestart.totalBindingsProduced,
            currentOrder: joinOrder.map(e => `${e.operation.type}:${e.metadata.cardinality.type === 'estimate' ? '~' : ''}${e.metadata.cardinality.value}`),
            updatedOrder: updatedJoinOrder.map(e => `${e.operation.type}:${e.metadata.cardinality.type === 'estimate' ? '~' : ''}${e.metadata.cardinality.value}`),
            joinRestartCount,
            joinRestartLimit: this.restartLimit,
          }));
          joinOrder = updatedJoinOrder;
          bindingsStreamRestart.swapSource();
        }
      }
    };

    // Register triggers for restart attempts
    await this.registerRestartTriggers(joinOrder, bindingsStreamRestart, attemptJoinPlanRestart);

    return { result: { type: 'bindings', bindingsStream: bindingsStreamRestart, metadata: initialJoinOutput.metadata }};
  }

  /**
   * Register triggers that attempt to restart the currently executing join upon specific conditions.
   * @param entries The original join input entries.
   * @param bindingsStreamRestart The output stream.
   * @param attemptJoinPlanRestart Helper function to attempt a join restart.
   */
  public abstract registerRestartTriggers(
    entries: IJoinEntryWithMetadata[],
    bindingsStreamRestart: BindingsStreamRestart,
    attemptJoinPlanRestart: () => Promise<void>,
  ): Promise<void>;

  /**
   * Sort the list of join entries using the join entries sort bus.
   * @param entries The join entries to sort.
   * @param context The current operation context.
   * @returns Sorted version of entries list, with metadata attached.
   */
  public async sortJoinEntries(entries: IJoinEntry[], context: IActionContext): Promise<IJoinEntryWithMetadata[]> {
    const entriesWithMetadata: IJoinEntryWithMetadata[] = [];
    for (const entry of entries) {
      entriesWithMetadata.push({ ...entry, metadata: await entry.output.metadata() });
    }
    const sortResult = await this.mediatorJoinEntriesSort.mediate({
      context,
      entries: entriesWithMetadata,
    });
    return sortResult.entries;
  }

  /**
   * Execute a join operation through the join bus, but with cloned streams instead of original ones.
   * @param action The join action.
   * @param context The join context.
   * @returns The join output, using cloned input streams to enable input stream re-use.
   */
  public async executeJoin(action: IActionRdfJoin, context: IActionContext): Promise<IQueryOperationResultBindings> {
    return this.mediatorJoin.mediate({
      type: action.type,
      entries: action.entries.map(entry => ({
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
   * Optional limit on the number of restarts caused by evaluations. When undefined, defaults to unlimited.
   * @range {integer}
   */
  restartLimit?: number;
}
