// Copyright 2026 Firedance Multimedia LLC
// SPDX-License-Identifier: Apache-2.0
//
// Read-only client for the CSA Distributed Compliance Ledger (DCL) REST API.

export const MAINNET = 'https://on.dcl.csa-iot.org';
export const TESTNET = 'https://on.test-net.dcl.csa-iot.org';

/** Common Matter device types (Device Library spec). Unknown IDs are shown as hex. */
export const DEVICE_TYPES = {
  0x000a: 'Door Lock',
  0x000e: 'Aggregator (bridge)',
  0x0013: 'Bridged Node',
  0x0015: 'Contact Sensor',
  0x0016: 'Root Node',
  0x0022: 'Speaker',
  0x002b: 'Fan',
  0x0100: 'On/Off Light',
  0x0101: 'Dimmable Light',
  0x0103: 'On/Off Light Switch',
  0x0104: 'Dimmer Switch',
  0x0105: 'Color Dimmer Switch',
  0x0106: 'Light Sensor',
  0x0107: 'Occupancy Sensor',
  0x010a: 'On/Off Plug-in Unit',
  0x010b: 'Dimmable Plug-in Unit',
  0x010c: 'Color Temperature Light',
  0x010d: 'Extended Color Light',
  0x0202: 'Window Covering',
  0x0301: 'Thermostat',
  0x0302: 'Temperature Sensor',
  0x0307: 'Humidity Sensor',
};

/**
 * Consumer brands registered under another company's Vendor ID, so a search for the brand finds
 * the right vendor. Keep to brands confirmed against the DCL.
 */
export const BRAND_VENDORS = {
  hue: 0x100b, 'philips hue': 0x100b, philips: 0x100b, wiz: 0x100b,
  lifx: 0x1423,
};

/** softwareVersionCertificationStatus values. */
export const CERT_STATUS = { 0: 'dev-test', 1: 'provisional', 2: 'certified', 3: 'revoked' };

export const hex4 = (n) => `0x${Number(n).toString(16).toUpperCase().padStart(4, '0')}`;

/** Accepts 4107, "4107", "0x100B" or "100B" (hex only with the 0x prefix or hex letters). */
export function parseId(value, name = 'id') {
  const s = String(value).trim();
  let n;
  if (/^0x[0-9a-f]+$/i.test(s)) n = parseInt(s, 16);
  else if (/^\d+$/.test(s)) n = parseInt(s, 10);
  else if (/^[0-9a-f]+$/i.test(s)) n = parseInt(s, 16);
  else throw new Error(`${name} must be a number like 4107 or 0x100B, got "${value}"`);
  if (n < 0 || n > 0xffff) throw new Error(`${name} must be between 0 and 0xFFFF, got ${s}`);
  return n;
}

export function deviceTypeName(id) {
  if (id == null) return null;
  return DEVICE_TYPES[id] ?? `Device type ${hex4(id)}`;
}

/** 0x01030000 -> "1.3" */
export function specVersion(v) {
  if (!v) return null;
  return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}`;
}

export class Dcl {
  /**
   * @param {{ baseUrl?: string, timeoutMs?: number, fetch?: typeof fetch }} [opts]
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl ?? MAINNET).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.cache = new Map();
    this.vendorList = null;
  }

  /** GET a DCL path. Returns parsed JSON, or null for 404 (not registered). Throws on other errors. */
  async get(path) {
    if (this.cache.has(path)) return this.cache.get(path);
    const res = await this.fetch(this.baseUrl + path, { signal: AbortSignal.timeout(this.timeoutMs), headers: { Accept: 'application/json' } });
    if (res.status === 404) {
      this.cache.set(path, null);
      return null;
    }
    if (!res.ok) throw new Error(`DCL ${path} returned HTTP ${res.status}`);
    const json = await res.json();
    this.cache.set(path, json);
    return json;
  }

  async vendor(vid) {
    const v = (await this.get(`/dcl/vendorinfo/vendors/${vid}`))?.vendorInfo;
    return v ? formatVendor(v) : null;
  }

  async searchVendors(query, limit = 10) {
    if (!this.vendorList) {
      const all = [];
      let key = null;
      do {
        const qs = new URLSearchParams({ 'pagination.limit': '1000' });
        if (key) qs.set('pagination.key', key);
        const page = await this.get(`/dcl/vendorinfo/vendors?${qs}`);
        all.push(...(page?.vendorInfo ?? []));
        key = page?.pagination?.next_key ?? null;
      } while (key);
      this.vendorList = all.map(formatVendor);
    }
    const q = query.trim().toLowerCase();
    // Exact name, then name prefix, then any word in the name starting with the query.
    const word = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const score = (v) => {
      const names = [v.vendorName, v.companyPreferredName, v.companyLegalName].filter(Boolean).map((s) => s.toLowerCase());
      if (names.some((n) => n === q)) return 3;
      if (names.some((n) => n.startsWith(q))) return 2;
      if (names.some((n) => word.test(n))) return 1;
      return 0;
    };
    const brandVid = BRAND_VENDORS[q];
    const withBrand = (v) => (v.vendorId === brandVid ? { ...v, brandMatch: query.trim() } : v);
    return this.vendorList
      .map((v) => [v.vendorId === brandVid ? 4 : score(v), withBrand(v)])
      .filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0] || a[1].vendorId - b[1].vendorId)
      .slice(0, limit)
      .map(([, v]) => v);
  }

  async product(vid, pid) {
    const m = (await this.get(`/dcl/model/models/${vid}/${pid}`))?.model;
    return m ? formatProduct(m) : null;
  }

  async vendorProducts(vid) {
    const list = (await this.get(`/dcl/model/models/${vid}`))?.vendorProducts?.products ?? [];
    return list.map((p) => ({ productId: p.pid, productIdHex: hex4(p.pid), name: p.name, partNumber: p.partNumber && p.partNumber !== '-' ? p.partNumber : null }));
  }

  async softwareVersions(vid, pid) {
    return (await this.get(`/dcl/model/versions/${vid}/${pid}`))?.modelVersions?.softwareVersions ?? [];
  }

  /** Certification record for one software version, or the newest registered version. */
  async certification(vid, pid, softwareVersion) {
    let sv = softwareVersion;
    if (sv == null) {
      const versions = await this.softwareVersions(vid, pid);
      if (!versions.length) return null;
      sv = Math.max(...versions);
    }
    const info = (await this.get(`/dcl/compliance/compliance-info/${vid}/${pid}/${sv}/matter`))?.complianceInfo;
    const version = (await this.get(`/dcl/model/versions/${vid}/${pid}/${sv}`))?.modelVersion;
    if (!info && !version) return null;
    return {
      softwareVersion: sv,
      softwareVersionString: info?.softwareVersionString ?? version?.softwareVersionString ?? null,
      status: info ? CERT_STATUS[info.softwareVersionCertificationStatus] ?? String(info.softwareVersionCertificationStatus) : 'no compliance record',
      certificateId: info?.cDCertificateId || null,
      date: info?.date ? info.date.slice(0, 10) : null,
      matterVersion: specVersion(info?.specificationVersion ?? version?.specificationVersion),
      transport: info?.transport || null,
      certificationRoute: info?.certificationRoute || null,
      familyId: info?.familyId || null,
      otaUrl: version?.otaUrl || null,
      releaseNotesUrl: version?.releaseNotesUrl || null,
    };
  }

  async device(vid, pid) {
    const [vendor, product, certification] = await Promise.all([this.vendor(vid), this.product(vid, pid), this.certification(vid, pid).catch(() => null)]);
    return { vendorId: vid, vendorIdHex: hex4(vid), productId: pid, productIdHex: hex4(pid), vendor, product, certification };
  }
}

function formatVendor(v) {
  return {
    vendorId: v.vendorID,
    vendorIdHex: hex4(v.vendorID),
    vendorName: v.vendorName,
    companyPreferredName: v.companyPreferredName || null,
    companyLegalName: v.companyLegalName || null,
    website: v.vendorLandingPageURL || null,
  };
}

function formatProduct(m) {
  return {
    vendorId: m.vid,
    productId: m.pid,
    productIdHex: hex4(m.pid),
    productName: m.productName,
    productLabel: m.productLabel && m.productLabel !== m.productName ? m.productLabel : null,
    partNumber: m.partNumber && m.partNumber !== '-' ? m.partNumber : null,
    deviceTypeId: m.deviceTypeId ?? null,
    deviceType: deviceTypeName(m.deviceTypeId),
    supportUrl: m.supportUrl || null,
    productUrl: m.productUrl || null,
    userManualUrl: m.userManualUrl || null,
    pairingHint: m.commissioningModeInitialStepsInstruction || null,
    factoryResetHint: m.factoryResetStepsInstruction || null,
  };
}
