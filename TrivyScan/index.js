'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ado = require('./lib/ado');
const { parseArguments, locateTrivy, execute } = require('./lib/cli');
const COMMANDS = new Set(['image', 'fs', 'repo', 'config', 'rootfs', 'sbom', 'k8s']);
const FORMATS = new Set(['table', 'json', 'sarif', 'cyclonedx', 'spdx-json', 'template']);

function buildArgs(read = ado.input, boolean = ado.flag) {
  const command = read('command', 'image');
  if (!COMMANDS.has(command)) throw new Error(`Comando inválido: ${command}`);
  const target = read('target');
  if (!target) throw new Error('Informe target (imagem, caminho, URL ou contexto Kubernetes).');
  const format = read('format', 'table');
  if (!FORMATS.has(format)) throw new Error(`Formato inválido: ${format}`);
  const args = [command];
  const optional = [
    ['scanners', '--scanners'], ['severity', '--severity'], ['cacheDir', '--cache-dir'],
    ['ignoreFile', '--ignorefile'], ['timeout', '--timeout'], ['dbRepository', '--db-repository'],
  ];
  for (const [key, option] of optional) {
    const value = read(key);
    if (value) args.push(option, value);
  }
  if (boolean('ignoreUnfixed')) args.push('--ignore-unfixed');
  if (boolean('skipDbUpdate')) args.push('--skip-db-update');
  if (boolean('offlineScan')) args.push('--offline-scan');
  if (boolean('insecure')) args.push('--insecure');
  const failCode = read('exitCode', '0');
  if (!/^\d+$/.test(failCode) || Number(failCode) > 125) throw new Error('exitCode deve ser um inteiro entre 0 e 125.');
  args.push('--exit-code', failCode, '--format', format);
  const output = read('output');
  if (output) args.push('--output', output);
  const extra = read('additionalArguments');
  if (extra) args.push(...parseArguments(extra));
  args.push('--', target);
  return { args, output };
}
async function main() {
  try {
    const cwd = ado.validDirectory(ado.input('workingDirectory', process.env.SYSTEM_DEFAULTWORKINGDIRECTORY || process.cwd()));
    const { args, output } = buildArgs();
    if (output) fs.mkdirSync(path.dirname(path.resolve(cwd, output)), { recursive: true });
    const executable = locateTrivy();
    console.log(`Executando Trivy ${args[0]} (detalhes disponíveis na documentação da task).`);
    await execute(executable, args, { cwd, env: process.env });
    ado.complete('Scan Trivy concluído.');
  } catch (err) { ado.failed(err); }
}
if (require.main === module) main();
module.exports = { buildArgs, main };
