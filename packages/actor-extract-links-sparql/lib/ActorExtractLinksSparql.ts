import type {
  IActionExtractLinks,
  IActorExtractLinksOutput,
  IActorExtractLinksArgs,
} from '@comunica/bus-extract-links';
import { ActorExtractLinks } from '@comunica/bus-extract-links';
import { KeysHttp, KeysInitQuery, KeysQueryOperation } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoidWithSideData } from '@comunica/core';
import type { ILink, IActionContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { Algebra, Factory, Util, toSparql } from 'sparqlalgebrajs';

type ExtractLinksSparqlSideData = { patterns: Algebra.Pattern[]; endpoints: string[] };

/**
 * A comunica Traverse Quad Pattern RDF Metadata Extract Actor.
 */
export class ActorExtractLinksSparql extends ActorExtractLinks<ExtractLinksSparqlSideData> {
  public constructor(args: IActorExtractLinksArgs<ExtractLinksSparqlSideData>) {
    super(args);
  }

  public async test(action: IActionExtractLinks): Promise<TestResult<IActorTest, ExtractLinksSparqlSideData>> {
    if (!action.context.has(KeysInitQuery.dataFactory)) {
      console.log('NO DATA FACTORY', action.url);
      return failTest(`Actor ${this.name} requires a data factory context entry.`);
    }
    const patterns = ActorExtractLinksSparql.getCurrentQuadPatterns(action.context);
    if (patterns.length === 0) {
      console.log('NO PATTERNS', action.url);
      return failTest(`Actor ${this.name} can only work with quad patterns in the query.`);
    }
    const endpoints = await ActorExtractLinksSparql.getEndpointUris(action);
    if (endpoints.length === 0) {
      console.log('NO ENDPOINTS', action.url);
      return failTest(`Actor ${this.name} can only work with SPARQL endpoints`);
    }
    return passTestVoidWithSideData({ endpoints, patterns });
  }

  public async run(
    action: IActionExtractLinks,
    sideData: ExtractLinksSparqlSideData,
  ): Promise<IActorExtractLinksOutput> {
    const dataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new Factory(dataFactory);
    const linkPatterns: Algebra.Pattern[] = [];
    const linkVariable = dataFactory.variable('link');

    for (const [ index, pattern ] of sideData.patterns.entries()) {
      if (pattern.subject.termType === 'Variable' || pattern.subject.termType === 'BlankNode') {
        linkPatterns.push(algebraFactory.createPattern(
          linkVariable,
          pattern.predicate,
          pattern.object.termType === 'BlankNode' || pattern.object.termType === 'Variable' ?
            dataFactory.variable(`o${index}`) :
            pattern.object,
        ));
      }
      if (pattern.object.termType === 'Variable' || pattern.object.termType === 'BlankNode') {
        linkPatterns.push(algebraFactory.createPattern(
          pattern.subject.termType === 'BlankNode' || pattern.subject.termType === 'Variable' ?
            dataFactory.variable(`o${index}`) :
            pattern.subject,
          pattern.predicate,
          linkVariable,
        ));
      }
    }

    const operation = algebraFactory.createProject(algebraFactory.createUnion(linkPatterns), [ linkVariable ]);

    const endpointFetcher = new SparqlEndpointFetcher({
      dataFactory,
      fetch: action.context.get(KeysHttp.fetch),
      method: 'POST',
      timeout: action.context.get(KeysHttp.httpTimeout),
    });

    const queryString = toSparql(operation);
    const links: ILink[] = [];

    for (const endpoint of sideData.endpoints) {
      console.log('Query', endpoint, 'with', queryString);
      const bindingsStream = await endpointFetcher.fetchBindings(endpoint, queryString);
      const endpointLinks = await new Promise<ILink[]>((resolve, reject) => {
        const values = new Set<string>();
        bindingsStream
          .on('data', (bindings: Record<string, RDF.Term>) => {
            if (bindings.link?.termType === 'NamedNode') {
              values.add(bindings.link.value);
            }
          })
          .on('end', () => resolve([ ...values.values() ].map(url => ({ url }))))
          .on('error', reject);
      });
      console.log('Extracted', endpointLinks.length, 'links from', endpoint);
      links.push(...endpointLinks);
    }

    return { links };
  }

  public static async getEndpointUris(action: IActionExtractLinks): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      const endpoints = new Set<string>();

      action.metadata
        .on('data', (quad: RDF.Quad) => {
          if (quad.predicate.termType === 'NamedNode' && quad.predicate.value === 'http://rdfs.org/ns/void#sparqlEndpoint') {
            endpoints.add(quad.object.value);
          }
        })
        .on('end', () => resolve([ ...endpoints.values() ]))
        .on('error', reject);
    });
  }

  public static getCurrentQuadPatterns(context: IActionContext): Algebra.Pattern[] {
    const operation = context.get(KeysQueryOperation.operation);
    const quadPatterns: Algebra.Pattern[] = [];
    if (operation) {
      Util.recurseOperation(operation, {
        [Algebra.types.PATTERN]: (op: Algebra.Pattern) => {
          quadPatterns.push(op);
          return false;
        },
      });
    }
    return quadPatterns;
  }
}
