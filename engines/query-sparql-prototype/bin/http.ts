#!/usr/bin/env node

import { join } from 'node:path';
import { HttpServiceSparqlEndpoint } from '@comunica/actor-init-query';

const moduleRootPath = join(__dirname, '..');
const defaultConfigPath = join(moduleRootPath, 'config', 'config-default.json');

HttpServiceSparqlEndpoint.runArgsInProcess(
  process.argv.slice(2),
  process.stdout,
  process.stderr,
  moduleRootPath,
  process.env,
  defaultConfigPath,
  code => process.exit(code),
).catch(error => process.stderr.write(`${error.message}/n`));
