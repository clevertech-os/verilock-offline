# VeriLock Offline

**Open-source companion to [verilock.online](https://verilock.online)** — hash documents on your device and verify Nimiq seal proofs **without uploading the file**.

## Download

**Latest release: [v0.1.3](https://github.com/clevertech-os/verilock-offline/releases/latest)** · [all releases](https://github.com/clevertech-os/verilock-offline/releases) · [SHA-256 checksums](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/SHA256SUMS.txt)

| Platform | Installer |
|----------|-----------|
| **macOS (Apple Silicon)** | [`.dmg` — aarch64](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/VeriLock.Offline_0.1.3_aarch64.dmg) |
| **macOS (Intel)** | [`.dmg` — x64](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/VeriLock.Offline_0.1.3_x64.dmg) |
| **Windows** | [`.msi`](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/VeriLock.Offline_0.1.3_x64_en-US.msi) · [`.exe` setup](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/VeriLock.Offline_0.1.3_x64-setup.exe) |
| **Linux** | [`.AppImage`](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/VeriLock.Offline_0.1.3_amd64.AppImage) · [`.deb`](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/VeriLock.Offline_0.1.3_amd64.deb) · [`.rpm`](https://github.com/clevertech-os/verilock-offline/releases/download/v0.1.3/VeriLock.Offline-0.1.3-1.x86_64.rpm) |
| **Web (no install)** | [clevertech-os.github.io/verilock-offline](https://clevertech-os.github.io/verilock-offline/) |

Builds are unsigned open-source binaries. macOS Gatekeeper / Windows SmartScreen may warn on first open — verify checksums above, then open anyway (macOS: right‑click → Open), or [build from source](#desktop-tauri).

**Product (create / invite / seal):** [verilock.online](https://verilock.online) · **License:** MIT

---

## What it does

1. **Check file (primary)** — drop any local file → SHA-256 on device → scan public Nimiq seal-sink transactions for matching seal payloads (RPC only; no product API).
2. **Verify by transaction** — if you already have a lock tx hash, compare the local hash to that one transaction.
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

Prefer a [prebuilt installer](#download)? Use the table at the top.

To build installers yourself (same UI as the web SPA):

```bash
# Install Rust: https://rustup.rs
npm install
npm run tauri:dev     # desktop window + hot reload
npm run tauri:build   # platform installers under src-tauri/target/release/bundle/
```

GitHub Actions (on version tags `v*`) builds macOS / Windows / Linux and attaches artifacts + `SHA256SUMS.txt` to the Release.

---

## Trust & audit

### Claims

| Claim | How to check |
|-------|----------------|
| File never uploaded | Search `src/` for `fetch`, `FormData`, `XMLHttpRequest`. Hash path uses only `crypto.subtle.digest` on local buffers. |
| Directory mode is opt-in | `OnlineLookupPanel` requires a consent checkbox; body is `{ sha256 }` only. |
| Chain match is independent of .online | `findSealMatchesByHash` in `nimiqRpc.ts` uses only the configured Nimiq RPC URL + known seal sink address. Matching is client-side on `recipientData`. |
| Chain verify is independent of .online | `verifyFileAgainstTx` talks only to the configured Nimiq RPC URL. |

### Network allowlist

| Purpose | Default host |
|---------|----------------|
| Chain scan / verify | `https://rpc.nimiqwatch.com` (configurable in Trust) |
| Seal sink (scan target) | `NQ815N9JRGBJMLJQNBKEMQ1RD27TXS8PCVKA` (build-time `VITE_ATTESTATION_SINK`) |
| Optional directory | `https://verilock.online` |
| Explorer links | `https://nimiq.watch` (opened by user) |

Local hash + certificate hash compare need **zero** network. Chain match needs RPC only.

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
| `VITE_ATTESTATION_SINK` | `NQ815N9JRGBJMLJQNBKEMQ1RD27TXS8PCVKA` |
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
