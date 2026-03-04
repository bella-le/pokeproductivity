#!/usr/bin/env node
// Simple build script: package with @electron/packager, then fix signing.
const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'dist-pkg');

// ── 1. Package ──────────────────────────────────────────────────────────────
console.log('Packaging…');
execFileSync(
  path.join(ROOT, 'node_modules', '.bin', 'electron-packager'),
  [
    ROOT,
    'PokéProductivity',
    '--platform=darwin',
    '--arch=arm64',
    '--out=' + OUT,
    '--overwrite',
    '--icon=' + path.join(ROOT, 'assets', 'icon.icns'),
    '--app-bundle-id=com.pokeproductivity.app',
    '--app-version=0.1.0',
    '--no-prune',        // keep all node_modules (we have none anyway)
  ],
  { cwd: ROOT, stdio: 'inherit' }
);

const appPath = path.join(OUT, 'PokéProductivity-darwin-arm64', 'PokéProductivity.app');
const infoPlist = path.join(appPath, 'Contents', 'Info.plist');

// ── 2. Remove ElectronAsarIntegrity if present ───────────────────────────────
try {
  execFileSync('/usr/libexec/PlistBuddy', [
    '-c', 'Delete :ElectronAsarIntegrity', infoPlist,
  ]);
  console.log('Removed ElectronAsarIntegrity');
} catch { /* not present — fine */ }

// ── 3. Ad-hoc re-sign the whole bundle ──────────────────────────────────────
// electron-packager changes Info.plist (bundle ID etc.) which breaks the
// original Electron signature. --deep re-signs everything consistently.
console.log('Signing…');
execFileSync('codesign', [
  '--deep', '--force', '--sign', '-', '--timestamp=none', appPath,
], { stdio: 'inherit' });

console.log('\nDone!  App is at:');
console.log(appPath);
