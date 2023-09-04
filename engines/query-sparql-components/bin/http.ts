#!/usr/bin/env node

// eslint-disable-next-line import/no-nodejs-modules
import { join } from 'node:path';
import { HttpServiceSparqlEndpoint } from '@comunica/actor-init-query';

const defaultConfigPath = `${__dirname}/../config/config-default.json`;

HttpServiceSparqlEndpoint.runArgsInProcess(
  process.argv.slice(2),
  process.stdout,
  process.stderr,
  join(__dirname, '..'),
  process.env,
  defaultConfigPath,
  code => process.exit(code),
).catch(error => process.stderr.write(`${error.message}/n`));
