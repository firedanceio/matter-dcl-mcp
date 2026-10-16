import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../lib/server.mjs';

async function connect(opts) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([createServer(opts).connect(a), client.connect(b)]);
  return client;
}

const dcl = {
  vendor: async (vid) => ({ vendorId: vid, vendorName: 'Signify' }),
  device: async () => { throw new Error('DCL unreachable'); },
};

test('lists the six tools', async () => {
  const { tools } = await (await connect({ dcl })).listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'dcl_get_certification', 'dcl_get_product', 'dcl_get_vendor',
    'dcl_list_vendor_products', 'dcl_lookup_device', 'dcl_search_vendors',
  ]);
});

test('onResult runs only after a successful lookup and can refuse it', async () => {
  const seen = [];
  const client = await connect({ dcl, onResult: (tool) => { seen.push(tool); return seen.length < 2; } });
  const ok = await client.callTool({ name: 'dcl_get_vendor', arguments: { vendor_id: '0x100B' } });
  assert.equal(ok.isError, undefined);
  assert.match(ok.content[0].text, /Signify/);
  const failed = await client.callTool({ name: 'dcl_lookup_device', arguments: { vendor_id: 1, product_id: 2 } });
  assert.equal(failed.isError, true);
  assert.deepEqual(seen, ['dcl_get_vendor']);
  const refused = await client.callTool({ name: 'dcl_get_vendor', arguments: { vendor_id: 4107 } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /limit/);
});
