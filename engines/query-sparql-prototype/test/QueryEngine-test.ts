import '@comunica/utils-jest';
import { QueryEngineBase } from '@comunica/actor-init-query';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { QueryEngine } from '../lib/QueryEngine';

describe('QueryEngine', () => {
  describe('constructor', () => {
    it('should extend QueryEngineBase', () => {
      const engine = new QueryEngine();
      expect(engine).toBeInstanceOf(QueryEngineBase);
    });

    it('should create an instance with default engine', () => {
      const engine = new QueryEngine();
      expect(engine).toBeDefined();
      expect(engine).toBeInstanceOf(QueryEngine);
    });

    it('should accept a custom engine', () => {
      const customEngine = <any>{
        run: jest.fn(),
        stop: jest.fn(),
      };
      const engine = new QueryEngine(customEngine);
      expect(engine).toBeDefined();
    });
  });

  describe('query', () => {
    it('should execute SPARQL query with VALUES clause', async() => {
      const engine = new QueryEngine();
      // Using the exact query format from the task with ex: prefix URIs
      const query = `PREFIX ex: <http://example.com/>
SELECT DISTINCT ?o WHERE {
  VALUES ?o { <ex:o1> <ex:o2> }
}`;
      const result = await engine.queryBindings(query);
      expect(result).toBeDefined();
      // Collect all bindings from the stream
      const bindingsArray: RDF.Bindings[] = [];
      for await (const binding of result) {
        bindingsArray.push(binding);
      }
      const DF = new DataFactory();
      const BF = new BindingsFactory(DF);
      expect(bindingsArray).toEqualBindingsArray([
        BF.fromRecord({ o: DF.namedNode('ex:o1') }),
        BF.fromRecord({ o: DF.namedNode('ex:o2') }),
      ]);
    });
  });
});
