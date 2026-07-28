import { QueryEngineFactoryBase } from '@comunica/actor-init-query';
import { QueryEngine } from '../lib/QueryEngine';
import { QueryEngineFactory } from '../lib/QueryEngineFactory';

describe('QueryEngineFactory', () => {
  describe('constructor', () => {
    it('should extend QueryEngineFactoryBase', () => {
      const factory = new QueryEngineFactory();
      expect(factory).toBeInstanceOf(QueryEngineFactoryBase);
    });
  });

  describe('create', () => {
    it('should create a QueryEngine', async() => {
      const factory = new QueryEngineFactory();
      const engine = await factory.create();
      expect(engine).toBeInstanceOf(QueryEngine);
    });
  });
});
