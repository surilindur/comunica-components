import type { Cluster } from 'node:cluster';
import type { IncomingMessage } from 'node:http';
import { Writable } from 'node:stream';
import type { QueryStringContext, QueryType } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { HttpServiceSparqlEndpoint } from '../lib/HttpServiceSparqlEndpoint';

const cluster: Cluster = require('node:cluster');
const streamToString = require('stream-to-string');
const stringToStream = require('streamify-string');

const DF = new DataFactory();

const stdmock = new Writable();
stdmock._write = () => {};

const clusterMock = {
  isPrimary: true,
  fork: jest.fn(),
  on: jest.fn(),
};

const argsDefault = {
  moduleRootPath: 'moduleRootPath',
  defaultConfigPath: 'defaultConfigPath',
};

let httpServiceSparqlEndpoint: HttpServiceSparqlEndpoint;

describe('HttpServiceSparqlEndpoint', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(cluster, clusterMock);
    httpServiceSparqlEndpoint = new HttpServiceSparqlEndpoint(argsDefault);
  });

  describe('constructor', () => {
    it('should not error if no args are supplied', () => {
      expect(() => new HttpServiceSparqlEndpoint({ ...argsDefault })).not.toThrow('TODO');
    });

    it('should set fields with values from args if present', () => {
      const args = { context: { test: 'test' }, timeout: 4_321, port: 24_321, invalidateCacheBeforeQuery: true };
      const instance = new HttpServiceSparqlEndpoint({ ...argsDefault, ...args });

      expect((<any>instance).context).toEqual({ test: 'test' });
      expect((<any>instance).timeout).toBe(4_321);
      expect((<any>instance).port).toBe(24_321);
      expect((<any>instance).invalidateCacheBeforeQuery).toBeTruthy();
    });

    it('should set default field values for fields that are not in args', () => {
      const args = { ...argsDefault };
      const instance = new HttpServiceSparqlEndpoint(args);

      expect((<any>instance).context).toEqual({});
      expect((<any>instance).timeout).toBe(60_000);
      expect((<any>instance).port).toBe(3_000);
      expect((<any>instance).invalidateCacheBeforeQuery).toBeFalsy();
    });
  });

  describe('run', () => {
    it('should call runPrimary if primary', async() => {
      jest.spyOn(httpServiceSparqlEndpoint, 'runPrimary').mockResolvedValue();
      jest.spyOn(httpServiceSparqlEndpoint, 'runWorker').mockResolvedValue();
      await httpServiceSparqlEndpoint.run(stdmock, stdmock);
      expect(httpServiceSparqlEndpoint.runPrimary).toHaveBeenCalledTimes(1);
      expect(httpServiceSparqlEndpoint.runWorker).not.toHaveBeenCalled();
    });

    it('should call runWorker if worker', async() => {
      (<any>cluster).isPrimary = false;
      jest.spyOn(httpServiceSparqlEndpoint, 'runPrimary').mockResolvedValue();
      jest.spyOn(httpServiceSparqlEndpoint, 'runWorker').mockResolvedValue();
      await httpServiceSparqlEndpoint.run(stdmock, stdmock);
      expect(httpServiceSparqlEndpoint.runPrimary).not.toHaveBeenCalled();
      expect(httpServiceSparqlEndpoint.runWorker).toHaveBeenCalledTimes(1);
    });
  });

  describe('readRequestBody', () => {
    it('should successfully read request body', async() => {
      const content = 'abc';
      const contentEncoding = 'utf-8';
      const contentType = 'text/plain';
      const request: IncomingMessage = stringToStream(content);
      request.headers = { 'content-type': contentType, 'content-encoding': contentEncoding };
      const requestBody = await httpServiceSparqlEndpoint.readRequestBody(request);
      expect(requestBody.content).toBe(content);
      expect(requestBody.contentType).toBe(contentType);
      expect(requestBody.contentEncoding).toBe(contentEncoding);
    });

    it('should successfully read request body without content-encoding', async() => {
      const content = 'abc';
      const contentType = 'text/plain';
      const request: IncomingMessage = stringToStream(content);
      request.headers = { 'content-type': contentType };
      const requestBody = await httpServiceSparqlEndpoint.readRequestBody(request);
      expect(requestBody.content).toBe(content);
      expect(requestBody.contentType).toBe(contentType);
      expect(requestBody.contentEncoding).toBe('utf-8');
    });

    it('should reject request without content-type header', async() => {
      const content = 'abc';
      const request: IncomingMessage = stringToStream(content);
      request.headers = {};
      await expect(httpServiceSparqlEndpoint.readRequestBody(request)).rejects.toThrow('Bad Request');
    });

    it('should reject request with failing body stream', async() => {
      const content = 'abc';
      const request: IncomingMessage = stringToStream(content);
      const error = new Error('Body stream failing!');
      request._read = () => {
        throw error;
      };
      request.headers = { 'content-type': 'text/plain' };
      await expect(httpServiceSparqlEndpoint.readRequestBody(request)).rejects.toThrow(error);
    });
  });

  describe('parseOperationParams', () => {
    it('should successfully parse all parameters', () => {
      const params = new URLSearchParams({
        'default-graph-uri': 'ex:g1',
        'named-graph-uri': 'ex:g2',
        'using-graph-uri': 'ex:g3',
        'using-named-graph-uri': 'ex:g4',
      });
      const parsed = httpServiceSparqlEndpoint.parseOperationParams(params);
      expect(parsed).toEqual({
        defaultGraphUris: [ DF.namedNode('ex:g1') ],
        namedGraphUris: [ DF.namedNode('ex:g2') ],
        usingGraphUris: [ DF.namedNode('ex:g3') ],
        usingNamedGraphUris: [ DF.namedNode('ex:g4') ],
      });
    });

    it('should successfully parse no parameters', () => {
      const params = new URLSearchParams();
      const parsed = httpServiceSparqlEndpoint.parseOperationParams(params);
      expect(parsed).toEqual({});
    });

    it('should successfully ignore user context', () => {
      const params = new URLSearchParams();
      const userContext: QueryStringContext = { sources: [{ value: 'ex:s' }], userKey: 'abc' };
      const parsed = httpServiceSparqlEndpoint.parseOperationParams(params, userContext);
      expect(parsed).toEqual({});
    });

    it('should successfully include user context', () => {
      httpServiceSparqlEndpoint = new HttpServiceSparqlEndpoint({ ...argsDefault, allowContextOverride: true });
      const params = new URLSearchParams();
      const userContext: QueryStringContext = { sources: [{ value: 'ex:s' }], userKey: 'abc' };
      const parsed = httpServiceSparqlEndpoint.parseOperationParams(params, userContext);
      expect(parsed).toEqual(userContext);
    });
  });

  describe('getServiceDescription', () => {
    it('should successfully output service description', async() => {
      const request: IncomingMessage = stringToStream('abc');
      request.headers = { host: 'http://localhost:3000' };
      const mediaTypes = [{ type: 'text/plain', quality: 1 }];
      const sd = httpServiceSparqlEndpoint.getServiceDescription(request, mediaTypes);
      expect(sd.metadata).toBeUndefined();
      expect(sd.resultType).toBe('quads');
      const quadsStream = await sd.execute();
      const quads: RDF.Quad[] = [];
      await new Promise((resolve, reject) => quadsStream
        .on('data', quad => quads.push(quad))
        .on('error', reject)
        .on('end', resolve));
      expect(quads).toHaveLength(7);
    });
  });

  describe('negotiateResultType', () => {
    it('should successfully negotiate', () => {
      const request: IncomingMessage = stringToStream('abc');
      request.headers = { accept: 'text/turtle' };
      const result: QueryType = { resultType: 'quads', execute: <any> undefined, metadata: <any> undefined };
      const mediaTypes = [{ type: 'text/turtle', quality: 1 }, { type: 'application/ld+json', quality: 1.5 }];
      const negotiatedMediaType = httpServiceSparqlEndpoint.negotiateResultType(request, result, mediaTypes);
      expect(negotiatedMediaType).toBe('text/turtle');
    });

    it('should select application/trig for quads when no accept header is provided', () => {
      const request: IncomingMessage = stringToStream('abc');
      request.headers = {};
      const result: QueryType = { resultType: 'quads', execute: <any> undefined, metadata: <any> undefined };
      const mediaTypes = [{ type: 'text/turtle', quality: 1 }];
      const negotiatedMediaType = httpServiceSparqlEndpoint.negotiateResultType(request, result, mediaTypes);
      expect(negotiatedMediaType).toBe('application/trig');
    });

    it('should select simple for void when no accept header is provided', () => {
      const request: IncomingMessage = stringToStream('abc');
      request.headers = {};
      const result: QueryType = { resultType: 'void', execute: <any> undefined };
      const mediaTypes = [{ type: 'text/turtle', quality: 1 }];
      const negotiatedMediaType = httpServiceSparqlEndpoint.negotiateResultType(request, result, mediaTypes);
      expect(negotiatedMediaType).toBe('simple');
    });

    it('should select application/sparql-results+json for bindings when no accept header is provided', () => {
      const request: IncomingMessage = stringToStream('abc');
      request.headers = {};
      const result: QueryType = { resultType: 'bindings', execute: <any> undefined, metadata: <any> undefined };
      const mediaTypes = [{ type: 'text/turtle', quality: 1 }];
      const negotiatedMediaType = httpServiceSparqlEndpoint.negotiateResultType(request, result, mediaTypes);
      expect(negotiatedMediaType).toBe('application/sparql-results+json');
    });
  });
});
