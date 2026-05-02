# @yumi/licenseguard

Official, single-source-of-truth security package for all Yumi ecosystem client applications. Lives inside the `Yumi-Hub-CF` monorepo at `Yumi-Hub-CF/packages/licenseguard/`.

> **Conformance**: implements the [Yumi Hub Security & Scalability Standard](../../.agent/skills/yumi-hub/SKILL.md) (LicenseGuard Elite Pro v2).

## Why this package exists

Every client app (The-Tailor, Barber_Shop, DjamiRestau, …) used to embed its own copy of the LicenseGuard logic. Any security change required editing N projects in lockstep. This package consolidates **all** license, HWID, crypto, and Hub-sync logic into one auditable, versioned unit shipped as part of the Yumi Hub product.

## Architecture

```
Yumi-Hub-CF/packages/licenseguard/
├── ts/      → React/TS surface (screens, hooks, hub client)
├── tauri/   → Rust crate (HWID, Ed25519, encrypted storage, clock anti-fraud)
└── config/  → Per-project config schema
```

**Sensitive logic lives in Rust.** The TypeScript layer only renders screens and invokes Tauri commands — it never holds keys, never decides validity, never touches storage directly.

## Consuming this package

The repo uses **npm workspaces** (root `YUMI-PROJECT/package.json`). Consumer apps reference the package by name; npm wires the symlink automatically.

```jsonc
// <consumer>/package.json
"dependencies": { "@yumi/licenseguard": "*" }
```

```toml
# <consumer>/src-tauri/Cargo.toml
yumi-licenseguard = { path = "../../Yumi-Hub-CF/packages/licenseguard/tauri" }
```

```tsx
// <consumer>/src/App.tsx
import { LicenseGuard } from '@yumi/licenseguard';
import config from './yumi.config';

<LicenseGuard config={config}><App /></LicenseGuard>
```

A single `npm install` from the monorepo root installs everything.

## Versioning

Strict [SemVer](https://semver.org). Breaking changes bump the major. See [CHANGELOG.md](./CHANGELOG.md).

## Security

See [SECURITY.md](./SECURITY.md) for the threat model and cryptographic guarantees.
