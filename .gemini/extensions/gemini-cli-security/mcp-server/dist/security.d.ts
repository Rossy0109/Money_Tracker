#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'fs';
import path from 'path';
export declare function findLineNumbers({ filePath, snippet, }: {
    filePath: string;
    snippet: string;
}, dependencies?: {
    fs: typeof fs;
    path: typeof path;
}): Promise<CallToolResult>;
