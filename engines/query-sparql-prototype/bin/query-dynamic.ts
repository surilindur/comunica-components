#!/usr/bin/env node

import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { runArgsInProcess } from '@comunica/runner-cli';

EventEmitter.defaultMaxListeners = 20;

const moduleRootPath = join(__dirname, '..');
const defaultConfigPath = join(moduleRootPath, 'config', 'config-default.json');

runArgsInProcess(moduleRootPath, defaultConfigPath);
