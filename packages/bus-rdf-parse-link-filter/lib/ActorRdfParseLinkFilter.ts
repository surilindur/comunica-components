import { Actor } from '@comunica/core';
import type { IActorTest, IAction, IActorOutput, IActorArgs, Mediator } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import type { ILinkFilter } from './LinkFilter';

export abstract class ActorRdfParseLinkFilter extends Actor<
  IActionRdfParseLinkFilter,
  IActorTest,
  IActorRdfParseLinkFilterOutput
> {
  /**
   * @param args - @defaultNested {<default_bus> a <cc:components/Bus.jsonld#Bus>} bus
   */
  public constructor(args: IActorRdfParseLinkFilterArgs) {
    super(args);
  }
}

export interface IActionRdfParseLinkFilter extends IAction {
  /**
   * The data associated with the filter.
   */
  data: RDF.Quad[];
}

export interface IActorRdfParseLinkFilterOutput extends IActorOutput {
  filters: ILinkFilter[];
}

export type IActorRdfParseLinkFilterArgs = IActorArgs<
  IActionRdfParseLinkFilter,
  IActorTest,
  IActorRdfParseLinkFilterOutput
>;

export type MediatorRdfParseLinkFilter = Mediator<
  ActorRdfParseLinkFilter,
  IActionRdfParseLinkFilter,
  IActorTest,
  IActorRdfParseLinkFilterOutput
>;
