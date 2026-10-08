# matter-dcl-mcp

An MCP server that lets AI assistants look things up in the **Matter Distributed Compliance
Ledger** (DCL), the official public registry of Matter vendors, products and certifications run by
the Connectivity Standards Alliance.

Ask your assistant things like:

- "What is device 0x100B / 8580?" → Signify, WiZ P45.E27, an Extended Color Light, with its support page
- "Is it Matter certified, and over which transport?" → certified, Matter 1.0, Wi-Fi + Bluetooth, certificate ID and date
- "Which Vendor ID does Eve use?" → 0x130A, Eve Systems GmbH
- "List Signify's registered products"

Read-only. No accounts, no API keys: the DCL is public, and the model is whatever your MCP client
uses.

## Install

Claude Code:

```sh
claude mcp add matter-dcl -- npx -y github:firedanceio/matter-dcl-mcp
```

Any MCP client that launches stdio servers:

```json
{
  "mcpServers": {
    "matter-dcl": { "command": "npx", "args": ["-y", "github:firedanceio/matter-dcl-mcp"] }
  }
}
```

Set `MATTER_DCL_NETWORK=testnet` to use the test ledger. Needs Node 20+.

## Tools

| Tool | What it returns |
|---|---|
| `dcl_lookup_device` | Vendor, product, device type, links and newest certification for a Vendor ID + Product ID. Start here. |
| `dcl_get_vendor` | The company registered under a Vendor ID |
| `dcl_search_vendors` | Vendor IDs matching a company or brand name |
| `dcl_get_product` | Product name, part number, device type, support/product/manual links, pairing and reset hints |
| `dcl_list_vendor_products` | Every product registered under a Vendor ID |
| `dcl_get_certification` | Certification status, certificate ID, date, Matter version and transport for a software version |

IDs can be decimal (`4107`) or hex (`0x100B`). Lookups are cached for the life of the server.

## Things worth knowing

- **The registered company is often not the brand on the box.** Philips Hue and WiZ are registered
  by Signify; LIFX lights use Feit Electric's Vendor ID. `dcl_search_vendors` maps these common
  brands for you.
- **Where Vendor and Product IDs come from:** a device's DNS-SD record (`VP=4107+8580`), its
  Basic Information cluster, or the onboarding payload in its QR code.
- **Certification status** is per software version: `certified`, `provisional`, `revoked`, or
  `dev-test`.

## From JavaScript

```js
import { Dcl } from 'matter-dcl-mcp';
const dcl = new Dcl();
console.log(await dcl.device(0x100b, 8580));
```

Also available for Dart and Flutter: [matter_dcl](https://github.com/firedanceio/matter_dcl).

## Licence

Apache-2.0. Made by [Firedance](https://firedance.io).
