'use strict';
const os = require('node:os');
const path = require('node:path');
const ado = require('./lib/ado');
const { install } = require('./lib/installer');
const { execute } = require('./lib/cli');

async function main() {
  try {
    const version = ado.input('version', 'latest');
    const cacheRoot = process.env.AGENT_TOOLSDIRECTORY || process.env.RUNNER_TOOL_CACHE ||
      path.join(os.homedir(), '.trivy-task-tools');
    const result = await install(version, cacheRoot);
    await execute(result.binary, ['--version']);
    ado.prependPath(path.dirname(result.binary));
    ado.setVariable('TRIVY_PATH', result.binary);
    ado.setVariable('TRIVY_VERSION', result.version);
    ado.complete(`Trivy ${result.version} disponível para as próximas tasks deste job.`);
  } catch (err) { ado.failed(err); }
}
if (require.main === module) main();
module.exports = { main };
