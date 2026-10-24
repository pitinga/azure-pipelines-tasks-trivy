'use strict';
const https = require('node:https');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { execute } = require('./cli');

const RELEASES = 'https://api.github.com/repos/aquasecurity/trivy/releases';
const MAX_REDIRECTS = 8;
function releaseName(version) {
  if (version === 'latest') return 'latest';
  const clean = version.replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(clean)) throw new Error('version: use latest ou versão estável no formato X.Y.Z.');
  return `tags/v${clean}`;
}
function platformAsset(version, platform = process.platform, arch = process.arch) {
  const normalized = version.replace(/^v/, '');
  const osName = { linux: 'Linux', darwin: 'macOS', win32: 'windows' }[platform];
  const cpu = { x64: '64bit', arm64: 'ARM64' }[arch];
  if (!osName || !cpu || (platform === 'win32' && arch !== 'x64')) {
    throw new Error(`Sistema não suportado: ${platform}/${arch}. Use Linux, macOS (x64/arm64) ou Windows (x64).`);
  }
  return `trivy_${normalized}_${osName}-${cpu}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
}
function authorized(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || !(
    u.hostname === 'github.com' || u.hostname === 'api.github.com' ||
    u.hostname.endsWith('.githubusercontent.com') || u.hostname === 'githubusercontent.com')) {
    throw new Error(`Destino HTTP não autorizado: ${u.hostname}`);
  }
  return u;
}
async function request(url, destination, maxBytes, redirects = 0) {
  if (redirects > MAX_REDIRECTS) throw new Error('Muitos redirecionamentos HTTP.');
  const u = authorized(url);
  const headers = { 'User-Agent': 'azure-pipelines-tasks-trivy/0.1.0', Accept: 'application/vnd.github+json' };
  if (u.hostname === 'api.github.com' && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await new Promise((resolve, reject) => {
    const req = https.get(u, { headers, timeout: 120000 }, resolve);
    req.on('timeout', () => req.destroy(new Error('Tempo limite de download excedido.')));
    req.once('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
    const location = res.headers.location;
    res.resume();
    if (!location) throw new Error('Redirecionamento sem URL.');
    return request(new URL(location, u).href, destination, maxBytes, redirects + 1);
  }
  if (res.statusCode !== 200) {
    const chunks = [];
    let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > 512) break;
      chunks.push(chunk);
    }
    throw new Error(`HTTP ${res.statusCode} ao obter recurso do GitHub. ${Buffer.concat(chunks).toString('utf8').slice(0, 160)}`);
  }
  let size = 0;
  if (!destination) {
    const chunks = [];
    for await (const chunk of res) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Resposta maior que o limite esperado.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const output = fs.createWriteStream(destination, { flags: 'wx' });
  try {
    for await (const chunk of res) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Download maior que o limite de segurança.');
      if (!output.write(chunk)) await new Promise((resolve, reject) => {
        output.once('drain', resolve);
        output.once('error', reject);
      });
    }
    await new Promise((resolve, reject) => output.end(err => err ? reject(err) : resolve()));
    return destination;
  } catch (error) {
    output.destroy();
    throw error;
  }
}
async function getText(url, size = 5 * 1024 * 1024) { return (await request(url, null, size)).toString('utf8'); }
function parseChecksum(content, filename) {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2].trim() === filename) return match[1].toLowerCase();
  }
  throw new Error(`Checksum SHA-256 não encontrado para ${filename}.`);
}
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function extract(archive, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const bin = process.platform === 'win32' ? 'trivy.exe' : 'trivy';
  if (process.platform === 'win32') {
    const safeArchive = archive.replace(/'/g, "''");
    const safeDest = dest.replace(/'/g, "''");
    const command = `Expand-Archive -LiteralPath '${safeArchive}' -DestinationPath '${safeDest}' -Force`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
  } else {
    await execute('tar', ['-xzf', archive, '-C', dest, bin]);
  }
  const extracted = path.join(dest, bin);
  if (!fs.existsSync(extracted)) throw new Error(`Executável ${bin} não encontrado no pacote.`);
  if (process.platform !== 'win32') await fsp.chmod(extracted, 0o755);
  return extracted;
}
async function install(version, cacheRoot) {
  const release = JSON.parse(await getText(`${RELEASES}/${releaseName(version)}`));
  if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name || '') || release.prerelease || release.draft) {
    throw new Error('Release não estável ou metadados inesperados do GitHub.');
  }
  const actual = release.tag_name.slice(1);
  const filename = platformAsset(actual);
  const checksumName = `trivy_${actual}_checksums.txt`;
  const asset = release.assets?.find(a => a.name === filename);
  const checksum = release.assets?.find(a => a.name === checksumName);
  if (!asset || !checksum) throw new Error(`Assets oficiais não encontrados: ${filename} ou ${checksumName}.`);
  const binary = process.platform === 'win32' ? 'trivy.exe' : 'trivy';
  const targetDir = path.join(cacheRoot, 'trivy', actual, `${process.platform}-${process.arch}`);
  const targetBin = path.join(targetDir, binary);
  if (fs.existsSync(targetBin) && fs.existsSync(path.join(targetDir, '.verified'))) {
    console.log(`Reutilizando Trivy ${actual} do cache do agente.`);
    return { version: actual, binary: targetBin, cached: true };
  }
  await fsp.mkdir(path.dirname(targetDir), { recursive: true });
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'trivy-install-'));
  try {
    console.log(`Obtendo Trivy ${actual} (${process.platform}/${process.arch}) do GitHub Releases.`);
    const checksumText = await getText(checksum.browser_download_url);
    const expected = parseChecksum(checksumText, filename);
    const archive = path.join(temp, filename);
    await request(asset.browser_download_url, archive, 1024 * 1024 * 1024);
    const actualHash = await sha256(archive);
    if (actualHash !== expected) throw new Error(`SHA-256 inválido para ${filename}. Download rejeitado.`);
    console.log('Integridade SHA-256 verificada.');
    const staged = path.join(temp, 'staged');
    await extract(archive, staged);
    await fsp.writeFile(path.join(staged, '.verified'), `${actualHash}  ${filename}\n`);
    if (fs.existsSync(targetDir)) await fsp.rm(targetDir, { recursive: true, force: true });
    try {
      await fsp.rename(staged, targetDir);
    } catch (error) {
      if (error.code !== 'EXDEV') throw error;
      // Some agents use separate volumes for temp and tools.
      await fsp.cp(staged, targetDir, { recursive: true, force: true });
    }
    return { version: actual, binary: targetBin, cached: false };
  } finally { await fsp.rm(temp, { recursive: true, force: true }); }
}
module.exports = { releaseName, platformAsset, parseChecksum, install, getText };
