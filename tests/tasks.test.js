'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseArguments } = require('../lib/cli');
const { releaseName, platformAsset, parseChecksum } = require('../lib/installer');
const { buildArgs } = require('../TrivyScan/index');
const { flag, escapeVso } = require('../lib/ado');
const root = path.join(__dirname, '..');

test('task manifests and Node handlers valid', () => {
  const a = JSON.parse(fs.readFileSync(path.join(root, 'TrivyInstaller/task.json')));
  const b = JSON.parse(fs.readFileSync(path.join(root, 'TrivyScan/task.json')));
  const ext = JSON.parse(fs.readFileSync(path.join(root, 'vss-extension.json')));
  assert.equal(a.execution.Node24.target, 'index.js');
  assert.equal(b.execution.Node20_1.target, 'index.js');
  assert.equal(ext.contributions.length, 2);
  assert.notEqual(a.id, b.id);
  assert.equal(a.inputs[0].defaultValue, 'latest');
});
test('version latest and stable versions only', () => {
  assert.equal(releaseName('latest'), 'latest');
  assert.equal(releaseName('v0.76.1'), 'tags/v0.76.1');
  assert.equal(releaseName('0.76.1'), 'tags/v0.76.1');
  assert.throws(() => releaseName('latest;rm -rf /'));
});
test('correct asset naming across supported targets', () => {
  assert.equal(platformAsset('0.76.1', 'linux', 'x64'), 'trivy_0.76.1_Linux-64bit.tar.gz');
  assert.equal(platformAsset('0.76.1', 'linux', 'arm64'), 'trivy_0.76.1_Linux-ARM64.tar.gz');
  assert.equal(platformAsset('0.76.1', 'darwin', 'arm64'), 'trivy_0.76.1_macOS-ARM64.tar.gz');
  assert.equal(platformAsset('0.76.1', 'win32', 'x64'), 'trivy_0.76.1_windows-64bit.zip');
  assert.throws(() => platformAsset('0.76.1', 'win32', 'arm64'));
});
test('checksum parser requires exact filename', () => {
  const sum = 'b'.repeat(64);
  assert.equal(parseChecksum(`${sum}  trivy_0.76.1_Linux-64bit.tar.gz\n`, 'trivy_0.76.1_Linux-64bit.tar.gz'), sum);
  assert.throws(() => parseChecksum(`${sum}  wrongfile\n`, 'trivy_0.76.1_Linux-64bit.tar.gz'));
});
test('additional arguments tokenization preserves paths and quotes', () => {
  assert.deepEqual(parseArguments('--config "C:\\My Folder\\trivy.yaml" --image-src docker'),
    ['--config', 'C:\\My Folder\\trivy.yaml', '--image-src', 'docker']);
  assert.deepEqual(parseArguments("--scanners 'vuln,secret'"), ['--scanners', 'vuln,secret']);
  assert.throws(() => parseArguments('--config "foo'));
});
test('command build does not invoke a shell or interpolate target', () => {
  const vals = {command:'image',target:'registry/app:v1; echo SECRET',severity:'CRITICAL',format:'json',exitCode:'1', output:'report.json',additionalArguments:'--image-src docker'};
  const read = (name, fallback = '') => vals[name] ?? fallback;
  const r = buildArgs(read, () => false);
  assert.deepEqual(r.args.slice(-3), ['docker','--','registry/app:v1; echo SECRET']);
  assert.deepEqual(r.args.slice(0, 3), ['image','--severity','CRITICAL']);
});
test('flags / exitCode validation and escapes', () => {
  assert.equal(escapeVso('abc;]'), 'abc%3B%5D');
  const vals = {command:'fs',target:'.',exitCode:'abc'};
  assert.throws(() => buildArgs((name, fallback='') => vals[name] ?? fallback, () => false));
});
