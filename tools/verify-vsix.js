'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// The Marketplace requires registered VSIX assets, not just files inside the ZIP.
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'dist');
const vsixFiles = fs.readdirSync(folder).filter(name => name.endsWith('.vsix'));
if (vsixFiles.length !== 1) throw new Error("Expected exactly one .vsix, got " + vsixFiles.length);
const vsix = path.join(folder, vsixFiles[0]);
const xml = execFileSync('unzip', ['-p', vsix, 'extension.vsixmanifest'], { encoding: 'utf8' });
const required = [
  ['Microsoft.VisualStudio.Services.Icons.Default', 'images/extension-icon.png'],
  ['Microsoft.VisualStudio.Services.Content.Details', 'overview.md'],
  ['Microsoft.VisualStudio.Services.Content.License', 'LICENSE']
];
for (const [assetType, filename] of required) {
  const tag = xml.match(new RegExp('<Asset\\b[^>]*\\bType="' + assetType.replace(/\./g, '\\.') + '"[^>]*>'));
  if (!tag || !tag[0].includes('Path="' + filename + '"')) {
    throw new Error('Missing marketplace asset registration: ' + assetType + ' -> ' + filename);
  }
  const bytes = execFileSync('unzip', ['-p', vsix, filename], { maxBuffer: 10 * 1024 * 1024 });
  if (bytes.length < 100) throw new Error('Missing or empty file ' + filename);
  if (filename.endsWith('.png') && (bytes.readUInt32BE(16) !== 128 || bytes.readUInt32BE(20) !== 128)) {
    throw new Error('Marketplace icon must be 128x128 pixels');
  }
  if (filename === 'overview.md' && !bytes.toString('utf8').includes('TrivyInstaller@0')) {
    throw new Error('Incomplete Marketplace overview');
  }
  console.log('OK: ' + assetType + ' (' + bytes.length + ' bytes)');
}
const version = JSON.parse(fs.readFileSync(path.join(root, 'vss-extension.json'), 'utf8')).version;
if (!xml.includes('Version="' + version + '"')) throw new Error('VSIX version mismatch: ' + version);
console.log('Marketplace assets verified in ' + vsixFiles[0]);
