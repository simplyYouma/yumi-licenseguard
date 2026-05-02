# INTEGRATION.md — Plugging `@yumi/licenseguard` into a Yumi POS project

Use this document when you create a new POS project, or when you migrate an existing one to consume the shared `@yumi/licenseguard` package.

> **Audience**: human developers AND AI vibe-coding assistants. Every step here is mechanical and self-contained — read once, reproduce anywhere.

---

## 0. Mental model (read first)

```
┌──────────────────────────────┐
│  Yumi Hub (Cloudflare Worker + D1)
│  - Issues Ed25519 license signatures
│  - Holds revocation state
│  - Serves /api/verify (HTTPS)
│  Lives at: github.com/simplyYouma/yumi-hub-cf  (private)
└──────────┬───────────────────┘
           │ HTTPS every 20 min + on-demand
┌──────────▼───────────────────┐
│  Client POS app (Tauri + React)
│  ┌─────────────────────────┐  │
│  │  @yumi/licenseguard     │  │  ← single source of truth
│  │  github.com/simplyYouma/│  │     for license + HWID + crypto
│  │  yumi-licenseguard      │  │  (public repo, consumed via tag)
│  │  TS screens + Rust crate│  │
│  └─────────────────────────┘  │
│  ┌─────────────────────────┐  │
│  │  Project-specific code  │  │  ← only this part is unique
│  │  (DB, business logic)   │  │     per POS app
│  └─────────────────────────┘  │
└──────────────────────────────┘
```

**Golden rule**: never duplicate license / HWID / crypto / secure-storage logic into a POS project. If you find yourself writing such code, stop — extend `yumi-licenseguard` instead.

---

## 1. Required project skeleton

A conformant Tauri POS project has this shape:

```
my-pos/
├── package.json                # depends on "@yumi/licenseguard"
├── .env / .env.example         # VITE_YUMI_PROJECT_ID, VITE_YUMI_HUB_URL, VITE_ACCENT_COLOR…
├── vite.config.ts              # base: './', resolve.dedupe: ['react', 'react-dom']
├── src/
│   ├── App.tsx                 # imports LicenseGuard from "@yumi/licenseguard"
│   ├── components/             # UI only — no licensing code
│   ├── services/               # data access; one module per domain
│   ├── hooks/                  # state primitives
│   └── lib/                    # pure utils (no I/O)
└── src-tauri/
    ├── Cargo.toml              # git dep "yumi-licenseguard"; no ed25519/hex direct deps
    ├── build.rs                # fn main() { tauri_build::build() }
    └── src/lib.rs              # registers yumi commands + project-specific commands only
```

---

## 2. Add the package — exactly five mechanical edits

### Edit 1 — `package.json`

Add the npm dependency, pinned to a tag of `yumi-licenseguard`:

```json
{
  "dependencies": {
    "@yumi/licenseguard": "github:simplyYouma/yumi-licenseguard#v1.0.0"
  }
}
```

**Why a tag?** The tag locks the resolution to a specific commit. Bug fixes and security upgrades bump the tag; consumers opt in by editing this line.

### Edit 2 — `src-tauri/Cargo.toml`

Add the Rust crate, also pinned to the same tag:

```toml
[dependencies]
# ... your other deps ...
yumi-licenseguard = { git = "https://github.com/simplyYouma/yumi-licenseguard.git", tag = "v1.0.0" }
```

**Do not** also depend on `ed25519-dalek` or `hex` directly. The crate handles all crypto.

### Edit 3 — `src-tauri/src/lib.rs`

Register the six shared Tauri commands inside `tauri::generate_handler!`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ... your plugins ...
        .invoke_handler(tauri::generate_handler![
            // Shared LicenseGuard (yumi_licenseguard crate)
            yumi_licenseguard::commands::get_machine_id,
            yumi_licenseguard::commands::verify_license,
            yumi_licenseguard::commands::get_license_key,
            yumi_licenseguard::commands::save_license_key,
            yumi_licenseguard::commands::get_secure_storage,
            yumi_licenseguard::commands::set_secure_storage,
            // Your project-specific commands below
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

The `commands::` submodule prefix matters — Rust requires `#[tauri::command]` items to live in a module when the crate is consumed as a library.

### Edit 4 — `src/App.tsx`

Wrap the root tree:

```tsx
import { LicenseGuard } from '@yumi/licenseguard';

export default function App() {
    return (
        <LicenseGuard>
            <YourActualApp />
        </LicenseGuard>
    );
}
```

The `<LicenseGuard>` orchestrator handles all blocking screens (activation / banned / expired / clock-fraud / sync-required) and only renders children once the license is valid.

### Edit 5 — `.env` (and `.env.example`)

Set the project-specific identity:

```dotenv
# Required
VITE_YUMI_PROJECT_ID=<UUID issued by the Hub admin>
VITE_YUMI_HUB_URL=https://yumi-hub.fysokona.workers.dev/api/verify

# Optional (white-label theming — defaults inside the package)
VITE_PROJECT_NAME=My POS
VITE_ACCENT_COLOR=#7A9080
VITE_FONT_SERIF="Baskervville", serif
VITE_FONT_SANS="Outfit", sans-serif
```

Commit `.env.example`. **Never commit** the real `.env` (add it to `.gitignore`).

---

## 3. Mandatory `vite.config.ts` flags

Two settings are required for Tauri production builds:

```ts
export default defineConfig({
    // ...
    base: './',                                // assets resolve relative to tauri://localhost
    resolve: { dedupe: ['react', 'react-dom'] }, // prevents double React inside the package
});
```

Without `base: './'` → white screen in the bundled app.
Without `dedupe` → runtime `Cannot read properties of null (reading 'useState')`.

## 4. Mandatory `tauri.conf.json` CSP

Tauri 2 IPC commands (like the SQL plugin) need an explicit CSP allowance:

```jsonc
{
  "app": {
    "security": {
      "csp": "default-src 'self'; connect-src 'self' ipc: http://ipc.localhost https://yumi-hub.fysokona.workers.dev"
    }
  }
}
```

Without `ipc: http://ipc.localhost` in `connect-src` → all IPC calls blocked → app fails to load.

---

## 5. Upgrade workflow (when the package gets a new release)

1. New tag is published, e.g. `v1.1.0`.
2. In your POS project, edit `package.json` → bump `#v1.0.0` to `#v1.1.0`.
3. Edit `src-tauri/Cargo.toml` → bump `tag = "v1.0.0"` to `tag = "v1.1.0"`.
4. `npm install && cd src-tauri && cargo update -p yumi-licenseguard`.
5. Build, smoke-test, ship.

**You upgrade when you want.** No forced cascade. Old POS apps on `v1.0.0` keep working.

---

## 6. Conformance checklist

Tick each box before merging:

- [ ] `@yumi/licenseguard` in `package.json` dependencies (with explicit `#vX.Y.Z` tag).
- [ ] `yumi-licenseguard` git dep in `Cargo.toml` (with explicit `tag = "vX.Y.Z"`); **no** `ed25519-dalek` or `hex` direct deps.
- [ ] No `src/components/Guard/LicenseGuard/` folder (the local copy must be deleted post-migration).
- [ ] `src/App.tsx` imports `LicenseGuard` from `@yumi/licenseguard` — never from a relative path.
- [ ] `lib.rs` registers all six yumi commands (paths under `yumi_licenseguard::commands::*`).
- [ ] `.env.example` is committed; real `.env` is `.gitignore`d.
- [ ] No hardcoded brand colors or strings in components.
- [ ] `vite.config.ts` sets `base: './'` and `resolve.dedupe: ['react', 'react-dom']`.
- [ ] `tauri.conf.json` `security.csp` `connect-src` includes `ipc: http://ipc.localhost`.
- [ ] `package-lock.json` is committed (CI requires it).
- [ ] `package.json` version and `tauri.conf.json` version are aligned before every release build.

If any box is unchecked, it is **not** conformant. Fix before merging.

---

*Yumi — 2026 Edition*
