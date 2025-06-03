#!/usr/bin/env node

import { EventEmitter } from 'node:events';
import { runArgsInProcessStatic } from '@comunica/runner-cli';

EventEmitter.defaultMaxListeners = 20;

runArgsInProcessStatic(require('../engine-default.js')());
