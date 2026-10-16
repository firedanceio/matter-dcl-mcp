#!/usr/bin/env node
// Copyright 2026 Firedance Multimedia LLC
// SPDX-License-Identifier: Apache-2.0
//
// MCP server (stdio) for the CSA Distributed Compliance Ledger: Matter vendors, products and
// certifications. Read-only, no API keys. Set MATTER_DCL_NETWORK=testnet for the test ledger.
// stdout is reserved for MCP frames; logs go to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Dcl, MAINNET, TESTNET } from '../lib/dcl.mjs';
import { createServer } from '../lib/server.mjs';

const dcl = new Dcl({ baseUrl: process.env.MATTER_DCL_NETWORK === 'testnet' ? TESTNET : MAINNET });
const server = createServer({ dcl });

await server.connect(new StdioServerTransport());
console.error(`[matter-dcl-mcp] ready (${dcl.baseUrl})`);
