'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const task of ['TrivyInstaller', 'TrivyScan']) {
  const target = path.join(root, task, 'lib');
  fs.mkdirSync(target, { recursive: true });
  for (const file of task === 'TrivyInstaller' ? ['ado.js', 'cli.js', 'installer.js'] : ['ado.js', 'cli.js']) {
    fs.copyFileSync(path.join(root, 'lib', file), path.join(target, file));
  }
}
console.log('Bibliotecas incluídas em cada task para execução isolada no Azure Pipelines.');
