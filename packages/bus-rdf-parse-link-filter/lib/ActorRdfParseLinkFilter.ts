import { Actor } from '@comunica/core';
import type { IActorTest, IAction, IActorOutput, IActorArgs, Mediator } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import type { ILinkFilter } from './LinkFilter';

/**
   * A base actor for listening to RDF parse events.
   *
   * Actor types:
   * * Input:  IActionRdfParseOrMediaType:      A parse input or a media type input.
   * * Test:   <none>
   * * Output: IActorOutputRdfParseOrMediaType: The parsed quads.
   *
   * @see IActionInit
   */
export abstract class ActorRdfParseLinkFilter extends Actor<IActionRdfParseLinkFilter,
IActorTest, IActorRdfParseLinkFilterOutput> {
  /**
   * @param args - @defaultNested {<default_bus> a <cc:components/Bus.jsonld#Bus>} bus
   */
  public constructor(args: IActorRdfParseLinkFilterArgs) {
    super(args);
  }
}

/**
   * The RDF parse input, which contains the input stream in the given media type.
   * One of the fields MUST be truthy.
   */
export interface IActionRdfParseLinkFilter extends IAction {
  /**
   * The data associated with the filter.
   */
  data: RDF.Quad[];
}

export interface IActorRdfParseLinkFilterOutput extends IActorOutput {
  filter: ILinkFilter;
}

export type IActorRdfParseLinkFilterArgs = IActorArgs<IActionRdfParseLinkFilter,
IActorTest, IActorRdfParseLinkFilterOutput>;

export type MediatorRdfParseLinkFilter = Mediator<ActorRdfParseLinkFilter,
IActionRdfParseLinkFilter, IActorTest, IActorRdfParseLinkFilterOutput>;
