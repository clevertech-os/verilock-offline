# VeriLock Offline

**Open-source companion to [verilock.online](https://verilock.online)** — hash documents on your device and verify Nimiq seal proofs **without uploading the file**.

| Surface | Platforms |
|---------|-----------|
| **Web SPA** | [clevertech-os.github.io/verilock-offline](https://clevertech-os.github.io/verilock-offline/) — any modern browser |
| **Desktop app** | macOS, Windows, Linux installers on [Releases](https://github.com/clevertech-os/verilock-offline/releases) (Tauri 2) |

- **Live web:** https://clevertech-os.github.io/verilock-offline/  
- **Source:** this repository  
- **Latest release:** https://github.com/clevertech-os/verilock-offline/releases/latest  
- **Product (create / invite / seal):** [verilock.online](https://verilock.online)  
- **License:** MIT  

---

## What it does

1. **Fingerprint** — SHA-256 of any local file (Web Crypto). No network.
2. **Verify by transaction** — compare that hash to the seal payload in a Nimiq lock tx (public RPC only).
3. **Verify by certificate** — compare to a VeriLock certificate JSON (fully offline for hash match; optional chain re-check).
4. **Directory lookup (optional)** — send **only** the SHA-256 to verilock.online to list known agreements. Opt-in; not required for integrity proofs.

The file bytes never enter `fetch` / form uploads. Auditors: see [Trust & audit](#trust--audit).

---

## Quick start (web)

```bash
npm install
npm run dev      # http://localhost:5177
npm run check    # audit (no upload) + tests + production build
npm run build
npm run test
npm run audit    # static check: file bytes never sent over network
```

Requirements: **Node.js 20+**.

---

## Desktop (Tauri)

Builds native installers for **macOS**, **Windows**, and **Linux** from the same UI.

```bash
# Install Rust: https://rustup.rs
npm install
npm run tauri:dev     # desktop window + hot reload
npm run tauri:build   # platform installers under src-tauri/target/release/bundle/
```

GitHub Actions (on version tags) builds all three OS targets and attaches artifacts to the Release, plus SHA-256 checksums.

| OS | Typical artifacts |
|----|-------------------|
| macOS | `.dmg` |
| Windows | `.msi` / `.exe` |
| Linux | `.AppImage`, `.deb` |

Unsigned OSS builds may trigger Gatekeeper / SmartScreen warnings — verify checksums from the Release page, or build from source.

---

## Trust & audit

### Claims

| Claim | How to check |
|-------|----------------|
| File never uploaded | Search `src/` for `fetch`, `FormData`, `XMLHttpRequest`. Hash path uses only `crypto.subtle.digest` on local buffers. |
| Directory mode is opt-in | `OnlineLookupPanel` requires a consent checkbox; body is `{ sha256 }` only. |
| Chain verify is independent of .online | `nimiqRpc.ts` talks only to the configured Nimiq RPC URL. |

### Network allowlist

| Purpose | Default host |
|---------|----------------|
| Chain verify | `https://rpc.nimiqwatch.com` (configurable in Trust) |
| Optional directory | `https://verilock.online` |
| Explorer links | `https://nimiq.watch` (opened by user) |

Fingerprint + certificate hash compare need **zero** network.

### Seal payload protocol

Compatible with VeriLock on-chain locks:

| Format | Layout |
|--------|--------|
| Binary v1 (current) | 37 bytes: `0x01` + 4-byte doc short id + 32-byte SHA-256 |
| Legacy UTF-8 | `seal:v1:lock:{shortId8}:{sha256}` |

Implementation: [`src/lib/attestation.ts`](src/lib/attestation.ts). Seal protocol is summarized above; product create/sign/seal lives at [verilock.online](https://verilock.online).

---

## Relation to verilock.online

| | **verilock.online** | **verilock.offline** (this repo) |
|--|---------------------|----------------------------------|
| Create / invite / sign / seal | Yes | No |
| Local fingerprint | Yes | Yes |
| Verify against chain | Yes (via product API + RPC) | Yes (public RPC only) |
| Host agreement metadata | Yes | No |
| Upload document | **Never** | **Never** |
| Open source focus | Product monorepo | Small audit surface for verify-only |

---

## Configuration

| Env (build-time) | Default |
|------------------|---------|
| `VITE_NIMIQ_RPC_URL` | `https://rpc.nimiqwatch.com` |
| `VITE_ONLINE_API_BASE` | `https://verilock.online` |
| `VITE_ONLINE_LOOKUP_DEFAULT` | `false` |
| `VITE_BASE_PATH` | `./` (GitHub Pages–friendly) |

RPC URL can also be changed at runtime in the **Trust** tab (stored in `localStorage`).

---

## Project layout

```
src/                 Shared UI (web + desktop)
  lib/               Hash, attestation, certificate, RPC, online lookup
  components/        Panels
src-tauri/           Tauri 2 desktop shell (thin; no hashing in Rust)
.github/workflows/   Pages + multi-OS release
```

---

## Contributing

PRs welcome. Keep the audit surface small:

- Do not add wallet, seal, or file-upload features.
- Do not send document bytes over the network.
- Add fixtures when changing attestation parsing.

---

## License

MIT — see [LICENSE](LICENSE).
