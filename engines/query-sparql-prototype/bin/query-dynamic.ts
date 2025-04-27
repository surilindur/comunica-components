#!/usr/bin/env node

import { join } from 'node:path';
import { runArgsInProcess } from '@comunica/runner-cli';

const moduleRootPath = join(__dirname, '..');
const defaultConfigPath = join(moduleRootPath, 'config', 'config-default.json');

runArgsInProcess(moduleRootPath, defaultConfigPath);
