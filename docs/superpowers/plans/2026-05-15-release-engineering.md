# Release Engineering (F8–F9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create production app icon assets (F8) and a GitHub Actions CI pipeline that builds and publishes Windows (.msi) and macOS (.dmg) installers on tag push (F9).

**Architecture:** Icon assets live in `src-tauri/icons/`. The CI workflow uses `tauri-apps/tauri-action@v0` (official action) which handles cross-platform build + artifact upload in one step.

**Tech Stack:** GitHub Actions, tauri-apps/tauri-action@v0, Node 22, Rust stable, ImageMagick or `tauri icon` CLI for asset generation.

**Prerequisite:** Complete frontend-features and tauri-integration plans. Repository must be pushed to GitHub with Actions enabled.

---

## File Map

| File | Change |
|------|--------|
| `src-tauri/icons/` | **Create/Replace** — all platform icon files |
| `src-tauri/tauri.conf.json` | Update `bundle.icon` array |
| `index.html` | Update favicon |
| `.github/workflows/release.yml` | **Create** — CI/CD pipeline |
| `CHANGELOG.md` | **Create** — version log |

---

## Task 1 — F8: Generate App Icon Assets

**Files:**
- Create: `src-tauri/icons/` (all sizes)
- Modify: `src-tauri/tauri.conf.json`
- Modify: `index.html`

The Tauri CLI provides `tauri icon` which auto-generates all required sizes from a single 1024×1024 source PNG.

- [ ] **Step 1: Create the source icon SVG**

Create `src-tauri/icons/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <!-- Background -->
  <rect width="1024" height="1024" rx="220" fill="#2563eb"/>
  <!-- "E" letterform representing Edge -->
  <rect x="280" y="280" width="464" height="80" rx="16" fill="white"/>
  <rect x="280" y="472" width="340" height="80" rx="16" fill="white"/>
  <rect x="280" y="664" width="464" height="80" rx="16" fill="white"/>
  <rect x="280" y="280" width="80" height="464" rx="16" fill="white"/>
</svg>
```

- [ ] **Step 2: Convert SVG to 1024×1024 PNG (source for tauri icon)**

Check if ImageMagick is available:

```bash
convert --version 2>/dev/null && \
  convert -background none -size 1024x1024 \
    src-tauri/icons/icon-source.svg \
    src-tauri/icons/icon-1024.png && \
  echo "Converted with ImageMagick" || \
  echo "ImageMagick unavailable — use an online SVG-to-PNG converter and save as src-tauri/icons/icon-1024.png"
```

If ImageMagick is unavailable: convert the SVG to PNG manually (browser, Inkscape, or any online tool) and save as `src-tauri/icons/icon-1024.png` (1024×1024 px).

- [ ] **Step 3: Generate all platform icon sizes via Tauri CLI**

```bash
npx tauri icon src-tauri/icons/icon-1024.png
```

Expected output: creates `src-tauri/icons/` files including:
- `32x32.png`, `128x128.png`, `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `Square30x30Logo.png`, `Square44x44Logo.png`, etc. (Windows Store)

Also copy the tray icon:

```bash
cp src-tauri/icons/32x32.png src-tauri/icons/tray-icon.png
```

- [ ] **Step 4: Update `src-tauri/tauri.conf.json` bundle icons**

Add the `bundle.icon` array:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "icon": [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]
}
```

- [ ] **Step 5: Update `index.html` favicon**

In `index.html`, replace or add the favicon link inside `<head>`:

```html
<link rel="icon" type="image/png" href="/src-tauri/icons/32x32.png" />
```

For production builds, copy the icon to `public/favicon.png` so Vite includes it:

```bash
mkdir -p public && cp src-tauri/icons/32x32.png public/favicon.png
```

Then update `index.html`:

```html
<link rel="icon" type="image/png" href="/favicon.png" />
```

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -5 && cd src-tauri && cargo build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/icons/ src-tauri/tauri.conf.json index.html public/
git commit -m "feat(F8): add app icon assets for Windows and macOS"
```

---

## Task 2 — F9: Create CHANGELOG

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to Edge Todos are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.0.0] — TBD

### Added
- Mouse leave auto-hide: window hides to screen edge after 1.5 s when docked
- Drag insertion indicator line for precise todo reordering
- Priority group collapse/expand toggle
- Keyboard shortcuts: Ctrl+Enter (first group), Ctrl+N (Nth group)
- System tray icon with show/quit menu; close button hides to tray
- Window position and size memory across restarts
- Native file dialogs for import and export in desktop mode
- About dialog with version number and MIT license info
- App icon for Windows and macOS
- GitHub Actions CI for Windows (.msi) and macOS (.dmg) builds
```

- [ ] **Step 2: Update version in `package.json` and `src-tauri/tauri.conf.json`**

In `package.json`, change `"version"` to `"1.0.0"`.

In `src-tauri/tauri.conf.json`, change `"version"` to `"1.0.0"`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md package.json src-tauri/tauri.conf.json
git commit -m "chore: bump version to 1.0.0, add CHANGELOG"
```

---

## Task 3 — F9: GitHub Actions Release CI

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/` directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: '--target aarch64-apple-darwin'
          - platform: macos-latest
            args: '--target x86_64-apple-darwin'
          - platform: windows-latest
            args: ''

    runs-on: ${{ matrix.platform }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install frontend dependencies
        run: npm ci

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Edge Todos ${{ github.ref_name }}'
          releaseBody: |
            See [CHANGELOG.md](https://github.com/${{ github.repository }}/blob/main/CHANGELOG.md) for details.
          releaseDraft: true
          prerelease: false
          args: ${{ matrix.args }}
```

- [ ] **Step 3: Verify YAML syntax**

```bash
node -e "
const fs = require('fs');
const yaml = require('js-yaml');
try {
  yaml.load(fs.readFileSync('.github/workflows/release.yml', 'utf8'));
  console.log('YAML valid');
} catch(e) {
  console.error('YAML error:', e.message);
}
" 2>/dev/null || python3 -c "
import yaml, sys
with open('.github/workflows/release.yml') as f:
    yaml.safe_load(f)
print('YAML valid')
"
```

Expected: `YAML valid`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(F9): GitHub Actions CI for Windows + macOS release builds"
```

---

## Task 4 — Tagging v1.0.0

**Prerequisite:** All previous tasks committed and pushed to GitHub. Verify Actions are enabled in repository Settings → Actions.

- [ ] **Step 1: Push all commits to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Create and push release tag**

```bash
git tag v1.0.0
git push origin v1.0.0
```

Expected: GitHub Actions workflow triggers automatically.

- [ ] **Step 3: Monitor CI on GitHub**

Open: `https://github.com/<owner>/<repo>/actions`

Expected: 3 jobs run (macos arm64, macos x86_64, windows). Each completes in ~15–20 minutes. A draft Release is created with `.msi` and `.dmg` attached.

- [ ] **Step 4: Publish the GitHub Release**

On GitHub → Releases → find the draft → edit release notes → click "Publish release".

---

## Notes on macOS Code Signing

macOS will show a security warning for unsigned apps. For v1.0.0, users can right-click → Open to bypass it. For v1.1, add Apple Developer certificate secrets to the repository and enable signing in the workflow:

```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```
