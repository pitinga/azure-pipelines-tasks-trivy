'use strict';
const fs = require('node:fs');
const path = require('node:path');

function input(name, fallback = '') {
  const key = `INPUT_${name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`;
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value.trim();
}
function flag(name, fallback = false) {
  const value = input(name, String(fallback)).toLowerCase();
  if (!['true', 'false'].includes(value)) throw new Error(`Entrada ${name}: esperado true ou false.`);
  return value === 'true';
}
function escapeVso(value) {
  return String(value).replace(/%/g, '%AZP25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
    .replace(/;/g, '%3B').replace(/\]/g, '%5D');
}
function issue(message, type = 'error') { console.log(`##vso[task.logissue type=${type};]${escapeVso(message)}`); }
function setVariable(name, value) { console.log(`##vso[task.setvariable variable=${name};]${escapeVso(value)}`); }
function prependPath(dir) { console.log(`##vso[task.prependpath]${escapeVso(dir)}`); }
function complete(message) { console.log(`##vso[task.complete result=Succeeded;]${escapeVso(message)}`); }
function failed(err) {
  const message = err instanceof Error ? err.message : String(err);
  issue(message);
  console.log(`##vso[task.complete result=Failed;]${escapeVso(message)}`);
  process.exitCode = 1;
}
function validDirectory(raw) {
  const dir = path.resolve(raw || process.cwd());
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Diretório não encontrado: ${dir}`);
  return dir;
}
module.exports = { input, flag, escapeVso, issue, setVariable, prependPath, complete, failed, validDirectory };
