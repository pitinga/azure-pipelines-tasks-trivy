# Trivy Installer & Scanner — Azure DevOps extension

Extensão independente para **Azure Pipelines**, inspirada no modelo de duas tasks do projeto Flyway:

- **`TrivyInstaller@0`** — obtém a versão estável mais recente do Trivy (padrão `latest`) ou uma versão fixa, verifica SHA-256 e disponibiliza o executável no `PATH` do job;
- **`TrivyScan@0`** — executa análises do Trivy por imagem, sistema de arquivos, repositório, IaC, rootfs, SBOM ou Kubernetes.

A extensão usa executores **Node24** e **Node20_1** (agente >= 4.248.0) e não depende de pacotes npm em tempo de execução. Para produção, teste em um agente Azure DevOps antes de disponibilizar ao público.

## Exemplo rápido — imagem no ACR

```yaml
pool:
  vmImage: ubuntu-latest
steps:
- task: Docker@2
  displayName: Login no ACR
  inputs:
    command: login
    containerRegistry: 'MinhaConexaoACR'

- task: TrivyInstaller@0
  inputs:
    version: latest

- task: TrivyScan@0
  inputs:
    command: image
    target: 'meuacr.azurecr.io/minha-api:$(Build.BuildId)'
    scanners: 'vuln,secret'
    severity: 'HIGH,CRITICAL'
    format: json
    output: '$(Build.ArtifactStagingDirectory)/trivy.json'
    exitCode: '1'

- task: PublishPipelineArtifact@1
  condition: always()
  inputs:
    targetPath: '$(Build.ArtifactStagingDirectory)'
    artifact: 'trivy-report'
```

O login na registry precisa ocorrer **no mesmo job**, antes do scan. `exitCode: '1'` reprova o job quando encontrar vulnerabilidades dentro dos filtros; `exitCode: '0'` só reporta. O Trivy poderá necessitar acesso à Internet para baixar/atualizar bancos de vulnerabilidades.

## Trivy Installer — parâmetros

| Parâmetro | Padrão | Significado |
| --- | --- | --- |
| `version` | `latest` | Consulta a última *release estável* oficial. Também aceita `0.76.1` ou `v0.76.1` para fixar. |

**Como funciona:** consulta o GitHub Releases oficial, resolve o arquivo de acordo com SO/arquitetura, baixa arquivo e checksums, verifica SHA-256, extrai o executável e adiciona o diretório ao PATH do **job atual**. Utiliza cache `$(Agent.ToolsDirectory)/trivy/<versão>/<plataforma-arquitetura>` quando disponível, para não baixar novamente. Não faz alterações globais no sistema operacional nem exige `sudo`.

Compatibilidade: Linux x64/ARM64, macOS x64/ARM64, Windows x64. Necessário `tar` em Linux/macOS, e PowerShell (`powershell.exe`, `Expand-Archive`) no Windows. `latest` é resolvido a cada execução do installer; mudanças de versão geram outro diretório de cache.

As variáveis `TRIVY_PATH` (arquivo executável) e `TRIVY_VERSION` são disponibilizadas para tasks posteriores **do mesmo job**. Tasks em outro job precisam rodar o Installer novamente.

## Trivy Scan — referência de parâmetros

| Parâmetro | Padrão | Significado / exemplo |
| --- | --- | --- |
| `command` | `image` | `image`, `fs`, `repo`, `config`, `rootfs`, `sbom`, `k8s` |
| `target` | *(obrigatório)* | Imagem (`repo/image:tag`), diretório (`$(Build.SourcesDirectory)`), URL ou contexto Kubernetes |
| `workingDirectory` | `$(System.DefaultWorkingDirectory)` | Diretório de trabalho existente |
| `scanners` | vazio | Lista aceita pelo subcomando, ex.: `vuln,secret` ou `misconfig` |
| `severity` | `HIGH,CRITICAL` | Severidades desejadas |
| `format` | `table` | `table`, `json`, `sarif`, `cyclonedx`, `spdx-json`, `template` |
| `output` | vazio | Arquivo relativo ao diretório de trabalho ou caminho absoluto; vazio escreve no console |
| `exitCode` | `0` | `0` apenas informa; `1` falha ao encontrar achados; aceita de 0 a 125 |
| `ignoreUnfixed` | `false` | Passa `--ignore-unfixed` |
| `cacheDir` | vazio | Passa `--cache-dir` |
| `ignoreFile` | vazio | Passa `--ignorefile`, útil para `.trivyignore` |
| `timeout` | vazio | Ex.: `10m`, `1h` |
| `dbRepository` | vazio | Repositório alternativo para Trivy DB |
| `skipDbUpdate` | `false` | Passa `--skip-db-update`, exige banco já instalado |
| `offlineScan` | `false` | Passa `--offline-scan`, exige dados locais apropriados |
| `insecure` | `false` | Passa `--insecure` para TLS sem verificação **(não recomendado)** |
| `additionalArguments` | vazio | Argumentos extras, com aspas para preservar espaços; nunca inclua senhas |

**Observações:** as opções de scanner variam conforme o subcomando e a versão do Trivy. `format: template` requer um template via `additionalArguments` (`--template ...`). O modo `k8s` requer credenciais e `kubeconfig` configurados no agente. `ignoreFile` pode ser `.trivyignore` ou arquivo compatível com a versão usada.

## Autenticação e segredos

**ACR recomendado:** use a task `Docker@2` com `command: login` e uma *service connection* Azure Container Registry. Ela cria as credenciais Docker que o Trivy pode consultar durante `image`. Outra opção é `AzureCLI@2` autenticado por uma service connection e executar `az acr login --name <nome-do-acr>` antes da task, no mesmo job. Nos agentes, o cliente Docker e acesso ao registry devem estar disponíveis.

**Registry com usuário/senha:** o Trivy aceita `TRIVY_USERNAME` e `TRIVY_PASSWORD`. Defina variáveis secretas na pipeline ou no Variable Group e disponibilize-as ao processo de scan. Como task customizada, as variáveis não-secretas normalmente aparecem no ambiente; variáveis secretas devem ser mapeadas explicitamente com `env:` no próprio passo `TrivyScan@0`, ou você pode estender a task para ter entradas secretas específicas. Não coloque `--password` em `additionalArguments`.

**Secure Files:** para uma configuração sensível do Trivy (`trivy.yaml`), use `DownloadSecureFile@1`, e informe o caminho usando `additionalArguments`. Isso **é compatível**, mas não é necessário para autenticação simples no ACR:

```yaml
- task: DownloadSecureFile@1
  name: trivyConfig
  inputs:
    secureFile: 'trivy-config.yaml'
- task: TrivyScan@0
  inputs:
    command: fs
    target: '$(Build.SourcesDirectory)'
    additionalArguments: '--config "$(trivyConfig.secureFilePath)"'
```

Para credenciais em arquivo, respeite as permissões, o formato aceito pelo Trivy e não as imprima em logs. Uma configuração do Trivy não substitui automaticamente as credenciais de acesso ao Azure ou Kubernetes.

## Exemplos adicionais

- [`examples/azure-pipelines.yml`](examples/azure-pipelines.yml) — imagem ACR e publicação JSON;
- [`examples/azure-pipelines-fs.yml`](examples/azure-pipelines-fs.yml) — filesystem Windows e relatório SARIF.

### Falhar apenas com CRITICAL

```yaml
- task: TrivyScan@0
  inputs:
    command: image
    target: '$(imageFullName)'
    scanners: vuln
    severity: CRITICAL
    ignoreUnfixed: true
    exitCode: '1'
```

### Verificar IaC

```yaml
- task: TrivyScan@0
  inputs:
    command: config
    target: '$(Build.SourcesDirectory)/infra'
    scanners: misconfig
    format: table
```

## Estrutura

```text
TrivyInstaller/
  task.json
  index.js
  lib/             # cópia independente gerada por tools/prepare.js
TrivyScan/
  task.json
  index.js
  lib/
lib/                 # código-fonte compartilhado
images/              # ícone de extensão
examples/            # exemplos YAML
.github/workflows/    # build + validação + artefato VSIX
vss-extension.json    # manifesto Marketplace
```

## Build e Marketplace

1. Crie um repositório próprio, por exemplo `pitinga/azure-pipelines-tasks-trivy`, e suba os arquivos.
2. Ajuste `publisher` em `vss-extension.json` para seu **publisher real do Visual Studio Marketplace**. O ID do publisher não é necessariamente seu login GitHub.
3. A GitHub Action `Validate and package VSIX` roda testes e publica o artefato `trivy-azure-devops-vsix`. Basta abrir **Actions**, selecionar a execução e baixar o arquivo produzido.
4. Para construir localmente com Node 20/24: `npm install --no-save tfx-cli@0.24.2`, depois `npm run check` e `npm run package:vsix`.
5. No [Visual Studio Marketplace Publisher Portal](https://marketplace.visualstudio.com/manage/publishers/), crie/abra o publisher; importe o `.vsix`, mantenha privado no primeiro teste e compartilhe com a organização Azure DevOps para validar. Após testar, publique publicamente caso queira.

O manifesto começa com `"public": false` para evitar publicação pública prematura. Para atualizações, aumente `vss-extension.json.version` e o patch/minor/major dos `task.json`; não reutilize versões da extensão já publicadas.

**Importante:** o pacote VSIX ainda precisa passar por integração com um agente Azure Pipelines e testes com downloads reais do Trivy; os testes incluídos validam estrutura, parâmetros e funções puras. O arquivo `.vsix` é criado automaticamente pelo GitHub Actions assim que os arquivos forem enviados ao repositório. Aqui não há dependência npm embutida nas tasks.

### Diagnósticos comuns

- **Trivy não encontrado:** execute o Installer antes do Scan, **no mesmo job**.
- **401/403 GitHub Releases:** GitHub API tem *rate limit*; se necessário mapeie um token como `GITHUB_TOKEN` no ambiente seguro do Installer ou fixe a versão. Não registre o token em logs.
- **401 no ACR:** autentique com `Docker@2 login` ou `az acr login` e confira permissão `AcrPull`.
- **Banco Trivy indisponível:** permita acesso aos registries de dados ou configure `dbRepository`; somente habilite `skipDbUpdate` com cache preparado.
- **Windows: `tar` não disponível:** o Installer usa `Expand-Archive` no Windows, portanto não requer `tar`.
- **Agente antigo:** atualize para >= 4.248.0 para o executor Node20_1; Node24 é usado quando disponível.

## Referências

- Trivy instalação: https://www.trivy.dev/docs/latest/getting-started/installation/
- Trivy CLI: https://www.trivy.dev/docs/latest/reference/cli/trivy/
- Azure DevOps custom tasks: https://learn.microsoft.com/azure/devops/extend/develop/add-build-task
- Azure DevOps node runners: https://learn.microsoft.com/azure/devops/pipelines/agents/nodejs-runners

## Licença

MIT. Este projeto é uma implementação nova, não uma redistribuição do código do projeto Flyway.
