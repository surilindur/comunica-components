import { QueryEngineBase } from '@comunica/actor-init-query';
import type * as RDF from '@rdfjs/types';
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
      expect(bindingsArray).toHaveLength(2);
      // Each binding is a Bindings object with an 'entries' map containing the variable bindings
      expect(bindingsArray[0]).toMatchObject({ type: 'bindings' });
      expect(bindingsArray[1]).toMatchObject({ type: 'bindings' });
      // Check that the bindings contain the expected named nodes (values are prefixed as ex:o1, ex:o2)
      const o1Binding = bindingsArray.find((b: any) => {
        return b.entries?.get?.('o')?.value === 'ex:o1';
      });
      const o2Binding = bindingsArray.find((b: any) => {
        return b.entries?.get?.('o')?.value === 'ex:o2';
      });
      expect(o1Binding).toBeDefined();
      expect(o2Binding).toBeDefined();
    });
  });
});
