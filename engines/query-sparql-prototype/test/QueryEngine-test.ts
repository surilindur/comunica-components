import '@comunica/utils-jest';
import { QueryEngineBase } from '@comunica/actor-init-query';
import { QueryEngine } from '../lib/QueryEngine';

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
});
