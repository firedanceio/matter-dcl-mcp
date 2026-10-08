import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dcl, parseId, specVersion, deviceTypeName } from '../lib/dcl.mjs';

const routes = {
  '/dcl/vendorinfo/vendors/4107': { vendorInfo: { vendorID: 4107, vendorName: 'Signify', companyPreferredName: 'Signify', vendorLandingPageURL: '' } },
  '/dcl/model/models/4107/8580': { model: { vid: 4107, pid: 8580, deviceTypeId: 269, productName: 'WiZ P45.E27', productLabel: 'WiZ P45.E27', partNumber: '-', supportUrl: 'https://wiz.guide/matter' } },
  '/dcl/model/models/4107': { vendorProducts: { vid: 4107, products: [{ pid: 8580, name: 'WiZ P45.E27', partNumber: '-' }, { pid: 2, name: 'BSB002', partNumber: '046677458478' }] } },
  '/dcl/model/versions/4107/8580': { modelVersions: { softwareVersions: [0, 3] } },
  '/dcl/model/versions/4107/8580/3': { modelVersion: { softwareVersionString: 'v1.3', specificationVersion: 0x01030000 } },
  '/dcl/compliance/compliance-info/4107/8580/3/matter': { complianceInfo: { softwareVersionString: 'v1.3', softwareVersionCertificationStatus: 2, cDCertificateId: 'CSA-TEST', date: '2025-01-02T00:00:00.000Z', specificationVersion: 0x01030000, transport: 'wi-fi,bluetooth' } },
};
function fakeFetch(calls = []) {
  return async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    calls.push(path);
    const body = routes[path];
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response('{"code":5}', { status: 404 });
  };
}

test('parseId accepts decimal and hex, rejects junk and out-of-range', () => {
  assert.equal(parseId(4107), 4107);
  assert.equal(parseId('0x100B'), 4107);
  assert.equal(parseId('100B'), 4107);
  assert.throws(() => parseId('nope'));
  assert.throws(() => parseId(0x10000));
});

test('helpers', () => {
  assert.equal(specVersion(0x01030000), '1.3');
  assert.equal(deviceTypeName(0x010d), 'Extended Color Light');
  assert.equal(deviceTypeName(0x9999), 'Device type 0x9999');
});

test('device lookup combines vendor, product and newest certification', async () => {
  const d = await new Dcl({ fetch: fakeFetch() }).device(4107, 8580);
  assert.equal(d.vendor.vendorName, 'Signify');
  assert.equal(d.product.deviceType, 'Extended Color Light');
  assert.equal(d.product.partNumber, null);
  assert.equal(d.certification.softwareVersion, 3);
  assert.equal(d.certification.status, 'certified');
  assert.equal(d.certification.matterVersion, '1.3');
});

test('unregistered IDs are null and cached', async () => {
  const calls = [];
  const dcl = new Dcl({ fetch: fakeFetch(calls) });
  assert.equal(await dcl.vendor(1), null);
  assert.equal(await dcl.vendor(1), null);
  assert.equal(calls.length, 1);
});

test('vendor products list', async () => {
  const list = await new Dcl({ fetch: fakeFetch() }).vendorProducts(4107);
  assert.deepEqual(list.map((p) => p.productIdHex), ['0x2184', '0x0002']);
  assert.equal(list[1].partNumber, '046677458478');
});

test('server errors throw', async () => {
  const dcl = new Dcl({ fetch: async () => new Response('x', { status: 503 }) });
  await assert.rejects(dcl.vendor(4107), /HTTP 503/);
});

test('brand search finds the registering company', async () => {
  const page = { vendorInfo: [{ vendorID: 4107, vendorName: 'Signify' }, { vendorID: 5155, vendorName: 'Feit Electric' }, { vendorID: 4999, vendorName: 'Govee' }], pagination: { next_key: null } };
  const dcl = new Dcl({ fetch: async () => new Response(JSON.stringify(page), { status: 200 }) });
  const [hue] = await dcl.searchVendors('Hue');
  assert.equal(hue.vendorName, 'Signify');
  assert.equal(hue.brandMatch, 'Hue');
  assert.equal((await dcl.searchVendors('lifx'))[0].vendorName, 'Feit Electric');
  assert.equal((await dcl.searchVendors('gov'))[0].vendorName, 'Govee');
});
