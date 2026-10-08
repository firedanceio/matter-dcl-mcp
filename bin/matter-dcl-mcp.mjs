#!/usr/bin/env node
// Copyright 2026 Firedance Multimedia LLC
// SPDX-License-Identifier: Apache-2.0
//
// MCP server (stdio) for the CSA Distributed Compliance Ledger: Matter vendors, products and
// certifications. Read-only, no API keys. Set MATTER_DCL_NETWORK=testnet for the test ledger.
// stdout is reserved for MCP frames; logs go to stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Dcl, MAINNET, TESTNET, parseId } from '../lib/dcl.mjs';

const dcl = new Dcl({ baseUrl: process.env.MATTER_DCL_NETWORK === 'testnet' ? TESTNET : MAINNET });
const server = new McpServer({ name: 'matter-dcl', version: '0.1.0' });

const id = (what) => z.union([z.number().int(), z.string()]).describe(`${what}, decimal (4107) or hex (0x100B)`);
const readOnly = { readOnlyHint: true, openWorldHint: true };

/** Run a lookup and return it as JSON text, or a readable error. */
async function answer(fn) {
  try {
    const result = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(result ?? { found: false }, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] };
  }
}

server.registerTool('dcl_lookup_device', {
  title: 'Look up a Matter device',
  description: 'Everything the DCL knows about a device from its Vendor ID and Product ID: maker, product name, device type, support links and certification. Use this first when you have a VID/PID pair, e.g. from a DNS-SD "VP=4107+8580" record or a device\'s Basic Information cluster.',
  inputSchema: { vendor_id: id('Vendor ID'), product_id: id('Product ID') },
  annotations: readOnly,
}, ({ vendor_id, product_id }) => answer(() => dcl.device(parseId(vendor_id, 'vendor_id'), parseId(product_id, 'product_id'))));

server.registerTool('dcl_get_vendor', {
  title: 'Get a Matter vendor',
  description: 'The company registered under a Matter Vendor ID. The registered company is often not the brand on the box (Philips Hue and WiZ are under Signify; LIFX uses Feit Electric).',
  inputSchema: { vendor_id: id('Vendor ID') },
  annotations: readOnly,
}, ({ vendor_id }) => answer(() => dcl.vendor(parseId(vendor_id, 'vendor_id'))));

server.registerTool('dcl_search_vendors', {
  title: 'Search Matter vendors by name',
  description: 'Find Vendor IDs by company or brand name (exact, prefix, then word matches). Common brands registered under another company are mapped too (Hue and WiZ to Signify, LIFX to Feit Electric). The first call downloads the vendor list (under 1,000 entries) and caches it.',
  inputSchema: { query: z.string().min(1).describe('Name to search for, e.g. "signify" or "eve"'), limit: z.number().int().min(1).max(50).default(10) },
  annotations: readOnly,
}, ({ query, limit }) => answer(() => dcl.searchVendors(query, limit)));

server.registerTool('dcl_get_product', {
  title: 'Get a Matter product',
  description: 'A product model: name, label, part number, device type, support/product/manual links and pairing or factory-reset hints when the maker registered them.',
  inputSchema: { vendor_id: id('Vendor ID'), product_id: id('Product ID') },
  annotations: readOnly,
}, ({ vendor_id, product_id }) => answer(() => dcl.product(parseId(vendor_id, 'vendor_id'), parseId(product_id, 'product_id'))));

server.registerTool('dcl_list_vendor_products', {
  title: 'List a vendor\'s Matter products',
  description: 'Every product model registered under a Vendor ID, with Product IDs and names.',
  inputSchema: { vendor_id: id('Vendor ID') },
  annotations: readOnly,
}, ({ vendor_id }) => answer(() => dcl.vendorProducts(parseId(vendor_id, 'vendor_id'))));

server.registerTool('dcl_get_certification', {
  title: 'Get Matter certification',
  description: 'Certification for a product\'s software version (the newest registered version if omitted): status (certified, provisional, revoked), certificate ID, date, Matter version and transport (Wi-Fi, Thread, Ethernet, Bluetooth).',
  inputSchema: {
    vendor_id: id('Vendor ID'),
    product_id: id('Product ID'),
    software_version: z.number().int().min(0).optional().describe('Numeric software version; omit for the newest'),
  },
  annotations: readOnly,
}, ({ vendor_id, product_id, software_version }) =>
  answer(() => dcl.certification(parseId(vendor_id, 'vendor_id'), parseId(product_id, 'product_id'), software_version)));

await server.connect(new StdioServerTransport());
console.error(`[matter-dcl-mcp] ready (${dcl.baseUrl})`);
