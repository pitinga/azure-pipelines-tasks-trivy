'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');

test('scan task launches executable without shell and builds correct argv', () => {
  if (process.platform === 'win32') return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-scan-test-'));
  const script = path.join(dir, 'trivy');
  const capture = path.join(dir, 'argv.json');
  fs.writeFileSync(script, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.env.CAPTURE_ARGV, JSON.stringify(process.argv.slice(2)));\n`);
  fs.chmodSync(script, 0o755);
  const cp = spawnSync(process.execPath, [path.join(root, 'TrivyScan/index.js')], {
    cwd: dir, encoding: 'utf8', env: {
      ...process.env, TRIVY_PATH: script, CAPTURE_ARGV: capture,
      INPUT_COMMAND:'image', INPUT_TARGET:'acregistry.io/app:test; echo injected',
      INPUT_FORMAT:'json', INPUT_EXITCODE:'1', INPUT_SEVERITY:'CRITICAL',
      INPUT_ADDITIONALARGUMENTS:'--image-src docker', INPUT_WORKINGDIRECTORY:dir,
    },
  });
  assert.equal(cp.status, 0, cp.stdout + cp.stderr);
  const args = JSON.parse(fs.readFileSync(capture, 'utf8'));
  assert.deepEqual(args, ['image','--severity','CRITICAL','--exit-code','1','--format','json','--image-src','docker','--','acregistry.io/app:test; echo injected']);
  assert.match(cp.stdout, /result=Succeeded/);
  fs.rmSync(dir, {recursive:true,force:true});
});

test('scan task propagates Trivy exit code and marks failure', () => {
  const cp = spawnSync(process.execPath, [path.join(root, 'TrivyScan/index.js')], {
    encoding:'utf8', env:{...process.env, INPUT_COMMAND:'image', INPUT_TARGET:'', INPUT_WORKINGDIRECTORY:root},
  });
  assert.equal(cp.status, 1);
  assert.match(cp.stdout, /result=Failed/);
});
