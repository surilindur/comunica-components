import { QueryEngineFactoryBase } from '@comunica/actor-init-query';
import { QueryEngine } from '../lib/QueryEngine';
import { QueryEngineFactory } from '../lib/QueryEngineFactory';

describe('QueryEngineFactory', () => {
  describe('constructor', () => {
    it('should extend QueryEngineFactoryBase', () => {
      const factory = new QueryEngineFactory();
      expect(factory).toBeInstanceOf(QueryEngineFactoryBase);
    });

    it('should create an instance', () => {
      const factory = new QueryEngineFactory();
      expect(factory).toBeDefined();
      expect(factory).toBeInstanceOf(QueryEngineFactory);
    });

    it('should have a create method', () => {
      const factory = new QueryEngineFactory();
      expect(typeof factory.create).toBe('function');
    });
  });

  describe('create', () => {
    it('should create a QueryEngine', async() => {
      const factory = new QueryEngineFactory();
      const engine = await factory.create();
      expect(engine).toBeInstanceOf(QueryEngine);
    });

    it('should return a QueryEngineBase', async() => {
      const factory = new QueryEngineFactory();
      const engine = await factory.create();
      expect(engine).toBeDefined();
    });
  });
});
