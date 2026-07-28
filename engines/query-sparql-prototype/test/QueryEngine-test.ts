import '@comunica/utils-jest';
import { QueryEngineBase } from '@comunica/actor-init-query';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { DataFactory } from 'rdf-data-factory';
import { QueryEngine } from '../lib/QueryEngine';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('QueryEngine', () => {
  describe('constructor', () => {
    it('should be an instance of QueryEngine and QueryEngineBase', () => {
      const engine = new QueryEngine();
      expect(engine).toBeInstanceOf(QueryEngine);
      expect(engine).toBeInstanceOf(QueryEngineBase);
    });

    it('should accept a custom engine', () => {
      const engine = new QueryEngine(<any>{});
      expect(engine).toBeDefined();
    });
  });

  describe('queryBindings', () => {
    it('should execute SPARQL query with VALUES clause', async() => {
      const engine = new QueryEngine();
      const query = `PREFIX ex: <http://example.com/>
SELECT DISTINCT ?o WHERE {
  VALUES ?o { <ex:o1> <ex:o2> }
}`;
      const result = await engine.queryBindings(query);
      const bindingsArray = [];
      for await (const binding of result) {
        bindingsArray.push(binding);
      }
      expect(bindingsArray).toEqualBindingsArray([
        BF.fromRecord({ o: DF.namedNode('ex:o1') }),
        BF.fromRecord({ o: DF.namedNode('ex:o2') }),
      ]);
    });
  });
});
