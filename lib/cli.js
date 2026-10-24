'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function parseArguments(line) {
  const result = [];
  let token = '', quote = null, started = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (!quote && /\s/.test(c)) {
      if (started) { result.push(token); token = ''; started = false; }
      continue;
    }
    if (c === '"' || c === "'") {
      if (quote === c) { quote = null; continue; }
      if (!quote) { quote = c; started = true; continue; }
    }
    if (c === '\\' && quote !== "'" && i + 1 < line.length &&
        (line[i + 1] === '"' || (!quote && /\s/.test(line[i + 1])))) {
      token += line[++i]; started = true; continue;
    }
    token += c; started = true;
  }
  if (quote) throw new Error('Aspas sem fechamento em additionalArguments.');
  if (started) result.push(token);
  return result;
}
function onPath(executable, env = process.env) {
  const search = (env.PATH || env.Path || '').split(path.delimiter);
  const names = process.platform === 'win32' ? [executable + '.exe', executable] : [executable];
  for (const dir of search) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}
function locateTrivy() {
  const explicitly = process.env.TRIVY_PATH;
  if (explicitly) {
    if (!fs.existsSync(explicitly)) throw new Error(`TRIVY_PATH não existe: ${explicitly}`);
    return explicitly;
  }
  return onPath('trivy') || (() => { throw new Error('Trivy não encontrado. Execute TrivyInstaller@0 primeiro, no mesmo job.'); })();
}
function execute(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, shell: false, stdio: options.stdio || 'inherit' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Trivy terminou com código ${code ?? 'desconhecido'}${signal ? ` (sinal ${signal})` : ''}.`));
    });
  });
}
module.exports = { parseArguments, onPath, locateTrivy, execute };
