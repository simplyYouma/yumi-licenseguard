# INTEGRATION.md — Plugging `@yumi/licenseguard` into a Yumi POS project

Use this document when you create a new POS project, or when you migrate an existing one to consume the shared `@yumi/licenseguard` package.

> **Audience**: human developers AND AI vibe-coding assistants. Every step here is mechanical and self-contained — read once, reproduce anywhere.

---

## 0. Mental model (read first)

```
┌──────────────────────────────┐
│  Yumi Hub  (Cloudflare Worker + D1)
│  - Issues Ed25519 license sigs
│  - Holds revocation state
│  - Serves /api/verify (HTTP)
└──────────┬───────────────────┘
           │ HTTPS every 20 min + on-demand
┌──────────▼───────────────────┐
│  Client POS app (Tauri + React)
│  ┌─────────────────────────┐  │
│  │  @yumi/licenseguard     │  │  ← single source of truth
│  │  (TS screens + hooks)   │  │     for license + HWID + crypto
│  │  (Rust crate: cipher,   │  │
│  │   clock, hwid, storage) │  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │  Project-specific code  │  │  ← only this part is unique
│  │  (DB, business logic)   │  │
│  └─────────────────────────┘  │
└──────────────────────────────┘
```

**Golden rule**: never duplicate license / HWID / crypto / secure-storage logic into the project. If you find yourself writing such code in a client project, stop — extend `yumi-licenseguard` instead.

---

## 1. Required project skeleton

A conformant project has this shape (the parts that matter for licensing):

```
my-pos/
├── package.json                    # has @yumi/licenseguard dep
├── .env                            # VITE_YUMI_PROJECT_ID, VITE_YUMI_HUB_URL, VITE_ACCENT_COLOR…
├── src/
│   ├── App.tsx                     # imports LicenseGuard from @yumi/licenseguard
│   └── yumi.config.ts              # per-project config (productId, productName, branding)
└── src-tauri/
    ├── Cargo.toml                  # path-deps yumi-licenseguard
    └── src/lib.rs                  # registers yumi commands + project commands
```

---

## 2. Wiring — five mechanical edits

### 2.1 `package.json`

Add the dependency:

```jsonc
{
  "dependencies": {
    "@yumi/licenseguard": "*"
    // …other deps
  }
}
```

The repo uses **npm workspaces** (root `YUMI-PROJECT/package.json`). The `*`
specifier resolves automatically to the local workspace at
`Yumi-Hub-CF/packages/licenseguard/ts`. After editing, run `npm install` from
the **monorepo root** (not the project subfolder).

### 2.2 `src-tauri/Cargo.toml`

Add the crate:

```toml
[dependencies]
yumi-licenseguard = { path = "../../Yumi-Hub-CF/packages/licenseguard/tauri" }
# remove: ed25519-dalek, hex (now provided by the crate)
```

### 2.3 `src-tauri/src/lib.rs`

Register the six Tauri commands the package exposes:

```rust
.invoke_handler(tauri::generate_handler![
    // Yumi LicenseGuard (shared crate)
    yumi_licenseguard::commands::get_machine_id,
    yumi_licenseguard::commands::verify_license,
    yumi_licenseguard::commands::get_license_key,
    yumi_licenseguard::commands::save_license_key,
    yumi_licenseguard::commands::get_secure_storage,
    yumi_licenseguard::commands::set_secure_storage,
    yumi_licenseguard::commands::clock_check,
    // …project-specific commands
])
```

**Delete** any local copies of `get_machine_id`, `verify_license`, `get_license_key`, `save_license_key`, `get_secure_storage`, `set_secure_storage` from the project's `lib.rs`. They live in the crate now.

### 2.4 `src/App.tsx`

Replace the local import:

```diff
- import { LicenseGuard } from '@/components/Guard/LicenseGuard/index';
+ import { LicenseGuard } from '@yumi/licenseguard';
```

Wrap your root tree exactly as before:

```tsx
<LicenseGuard>
  <App />
</LicenseGuard>
```

### 2.5 Delete the duplicate folder

```bash
rm -rf src/components/Guard/LicenseGuard
```

That's it. Five edits, no exceptions.

---

## 3. Environment variables (`.env`)

The TS surface reads these at build time via `import.meta.env`:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_YUMI_PROJECT_ID` | yes | UUID identifying this product to the Hub |
| `VITE_YUMI_HUB_URL` | yes | Full `/api/verify` URL, e.g. `https://hub.yumi.app/api/verify` |
| `VITE_ACCENT_COLOR` | optional | White-label theme accent |
| `VITE_FONT_SANS` | optional | White-label font family |

A `.env.example` MUST ship with every project — never commit a real `.env`.

---

## 4. License key format (what the Hub issues)

Two formats are supported by `verify_license`:

| Format | Message signed | Notes |
|---|---|---|
| **v2.5** (preferred) | `productId\|HWID\|expiry_ms` | Binds the key to a specific product *and* machine *and* expiry |
| **v1 legacy** | `HWID\|expiry_ms` | Older keys, still accepted for backward compatibility |

The signature is Ed25519, hex-encoded. The full key delivered to the customer is `expiryHex.signatureHex` (the dot is the separator). The TS layer parses it; you do not need to.

---

## 5. Behavioural contract (what `LicenseGuard` does at boot)

In order:

1. **HWID** — `get_machine_id` returns a stable hardware fingerprint (WMIC UUID → MachineGuid → reg fallback → `/etc/machine-id`).
2. **Saved license** — read from encrypted local storage via `get_license_key`. Empty → render `ActivationScreen`.
3. **Clock fraud** — `clock_check` (Rust-authoritative, monotonic high-water). Fail → `ClockFraudScreen`.
4. **Sync window** — if last hub sync > `syncLockMins` → `SyncRequiredScreen` (user must hit "Sync Now").
5. **Local crypto verify** — `verify_license`, dual-path (v2.5 then v1 legacy fallback). Fail → unlicensed.
6. **Hub verification** — POST `/api/verify` with `{ hwid, project_id }`. Source of truth for revocation, expiry, and notifications. Failure here is non-fatal (offline grace).
7. **Periodic resync** — every 20 minutes thereafter.

Screens are picked automatically based on state — your code should never decide which screen to show.

---

## 6. Project-specific Rust commands

Keep these in your project's `src-tauri/src/lib.rs`. They are **not** licensing concerns:

- Database backup / migrations / queries
- Password hashing (`bcrypt`)
- UUID generation
- Printer / scanner / hardware integrations specific to your domain

If you find yourself writing one of these in more than two projects, propose extracting it into a future `@yumi/common` crate — but **do not** add it to `@yumi/licenseguard`.

---

## 7. Updating the package itself

When you discover a bug in the license flow, fix it inside `Yumi-Hub-CF/packages/licenseguard/`:

1. Make the change in `ts/src/` and/or `tauri/src/`
2. Bump version in BOTH `ts/package.json` and `tauri/Cargo.toml` (keep them aligned)
3. Add a new entry to `CHANGELOG.md` with the date + phase number + what changed
4. Run `npm install` and `cargo check` from any consumer project to validate

All consuming projects will pick up the change at their next `npm install` / `cargo build`.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module '@yumi/licenseguard'` | `npm install` not run after adding the dep | run `npm install` in the project |
| `Cannot find module 'react'` typechecking the package | Package devDeps missing | run `npm install` inside `Yumi-Hub-CF/packages/licenseguard/ts/` |
| `cargo check` errors about `ed25519-dalek` | Old direct dep in project Cargo.toml | remove `ed25519-dalek` and `hex` lines — they come transitively |
| App boots but shows ActivationScreen even with valid `.license` | Storage encryption / HWID changed | check `.yumi.salt` + HWID match the original install |
| Hub returns 500 | Hub-side issue (Supabase, schema) | not a client problem — investigate in `Yumi-Hub` repo |
| ClockFraud screen on first boot of a fresh install | `clock_check` saw no prior timestamp and rolled forward — this is OK | only an issue if it persists after a restart |

---

## 9. Vibe-coding shortcut

When asking an AI to scaffold a new POS, paste this prompt:

> Create a new Tauri+React POS project named `<NAME>` based on `Yumi-Client-Project-Template`. Wire it to consume `@yumi/licenseguard` per `Yumi-Hub-CF/packages/licenseguard/INTEGRATION.md`. Set `VITE_YUMI_PROJECT_ID=<UUID>` and `VITE_YUMI_HUB_URL=https://hub.yumi.app/api/verify` in `.env`. Do not duplicate any license code into the new project. Verify with `npm run build` and `cargo check`.

The AI agent reads this file, follows §2, and you get a conformant project.
