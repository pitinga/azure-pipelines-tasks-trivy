# Trivy Installer & Scanner for Azure Pipelines

Execute o **Trivy** em pipelines Azure DevOps utilizando duas tasks independentes: uma instala e verifica o binário oficial; a outra executa análises de segurança e gera relatórios. A instalação da extensão não requer scripts manuais.

| Task | Finalidade |
| --- | --- |
| **Trivy Installer** (`TrivyInstaller@0`) | Instala a versão estável mais recente ou uma versão fixa do Trivy, com cache e verificação SHA-256. |
| **Trivy Scan** (`TrivyScan@0`) | Executa análises de imagens, diretórios, repositórios Git, IaC, rootfs, SBOM e Kubernetes. |

## 1. Instalar o Trivy

~~~yaml
- task: TrivyInstaller@0
  displayName: 'Trivy | Instalar'
  inputs:
    version: 'latest'
~~~

**Parâmetro `version`:** `latest` (padrão) consulta a última release estável oficial a cada execução. Também aceita uma versão fixa como `0.76.1`. Plataformas: Linux x64/ARM64, macOS x64/ARM64 e Windows x64. O cache é organizado por versão, sistema operacional e arquitetura. O executável é disponibilizado para as próximas etapas **do mesmo job**.

## 2. Analisar uma imagem no Azure Container Registry (ACR)

Para imagens privadas, autentique-se na registry com uma *service connection* antes do scan, no mesmo job:

~~~yaml
steps:
- task: Docker@2
  displayName: 'ACR | Login'
  inputs:
    command: 'login'
    containerRegistry: 'MinhaServiceConnectionACR'

- task: TrivyInstaller@0
  inputs:
    version: 'latest'

- task: TrivyScan@0
  displayName: 'Trivy | Analisar imagem'
  inputs:
    command: 'image'
    target: 'meuacr.azurecr.io/minha-api:$(Build.BuildId)'
    scanners: 'vuln,secret'
    severity: 'HIGH,CRITICAL'
    ignoreUnfixed: true
    format: 'json'
    output: '$(Build.ArtifactStagingDirectory)/trivy.json'
    exitCode: '1'

- task: PublishPipelineArtifact@1
  displayName: 'Publicar relatório'
  condition: always()
  inputs:
    targetPath: '$(Build.ArtifactStagingDirectory)'
    artifact: 'trivy-report'
~~~

**Política de falha:** `exitCode: '1'` reprova o job quando o Trivy encontra achados dentro dos filtros configurados; `exitCode: '0'` apenas reporta. Erros de execução continuam reprovando a task.

## 3. Outros tipos de análise

**Código-fonte / diretório local:**

~~~yaml
- task: TrivyScan@0
  inputs:
    command: 'fs'
    target: '$(Build.SourcesDirectory)'
    scanners: 'vuln,secret,misconfig'
    severity: 'MEDIUM,HIGH,CRITICAL'
    format: 'sarif'
    output: '$(Build.ArtifactStagingDirectory)/trivy.sarif'
    exitCode: '0'
~~~

**Infraestrutura como código (Terraform, Kubernetes manifests etc.):**

~~~yaml
- task: TrivyScan@0
  inputs:
    command: 'config'
    target: '$(Build.SourcesDirectory)/infra'
    scanners: 'misconfig'
    format: 'table'
~~~

**Kubernetes:** use `command: 'k8s'` e um contexto de kubeconfig válido ou `cluster` como target. Configure previamente a autenticação e as permissões do agente.

## 4. Referência de todos os parâmetros da task Trivy Scan

| Parâmetro | Padrão | Descrição |
| --- | --- | --- |
| `command` | `image` | `image`, `fs`, `repo`, `config`, `rootfs`, `sbom`, `k8s`. |
| `target` | obrigatório | Caminho, imagem com tag/digest, URL Git ou contexto Kubernetes. |
| `workingDirectory` | `$(System.DefaultWorkingDirectory)` | Diretório de trabalho. |
| `scanners` | padrão do Trivy | Ex.: `vuln,secret`, `misconfig`; varia conforme o comando. |
| `severity` | `HIGH,CRITICAL` | Ex.: `UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL`. |
| `format` | `table` | `table`, `json`, `sarif`, `cyclonedx`, `spdx-json`, `template`. |
| `output` | console | Caminho do arquivo de saída. |
| `exitCode` | `0` | `0`: só informa; `1`: falha quando encontrar achados. |
| `ignoreUnfixed` | `false` | Ignora vulnerabilidades sem correção disponível. |
| `cacheDir` | vazio | Diretório de cache do banco de vulnerabilidades. |
| `ignoreFile` | vazio | Arquivo `.trivyignore` ou equivalente. |
| `timeout` | vazio | Timeout, como `30m` ou `1h`. |
| `dbRepository` | vazio | Repositório alternativo para o banco de vulnerabilidades. |
| `skipDbUpdate` | `false` | Não atualiza o banco; exige cache preparado. |
| `offlineScan` | `false` | Evita parte das consultas externas; exige dados locais. |
| `insecure` | `false` | Desativa validações TLS quando aplicável (**não recomendado**). |
| `additionalArguments` | vazio | Flags extras da CLI; use aspas para argumentos com espaços. |

**Observação:** a disponibilidade de cada flag depende do subcomando e da versão do Trivy. Em `format: template`, o template deve ser informado por argumentos adicionais.

## 5. Autenticação, segredos e relatórios

- **ACR privado:** autentique com `Docker@2` e uma service connection ou com `AzureCLI@2` + `az acr login`. Verifique permissões de leitura da imagem.
- **Senhas/tokens:** use variáveis secretas do Azure DevOps. Não inclua credenciais em texto puro nos argumentos ou nos arquivos YAML. Quando necessário, mapeie os segredos explicitamente para o ambiente da task.
- **Secure Files:** para um `trivy.yaml` sensível, use `DownloadSecureFile@1` e passe `--config "$(trivyConfig.secureFilePath)"` em `additionalArguments`.
- **Relatórios:** `json` para automações, `sarif` para ferramentas de segurança, `table` para logs e `cyclonedx`/`spdx-json` para SBOM. Publique resultados com `PublishPipelineArtifact@1` e `condition: always()`.

## 6. Requisitos

- Azure Pipelines agent >= 4.248.0 (executor Node 20; Node 24 quando disponível).
- Acesso à Internet para releases e banco Trivy, salvo configurações offline adequadas.
- Credenciais do ACR/Kubernetes e permissões de leitura dos alvos quando necessário.

**[Documentação completa, código-fonte e exemplos YAML](https://github.com/pitinga/azure-pipelines-tasks-trivy)** · **[Suporte e problemas](https://github.com/pitinga/azure-pipelines-tasks-trivy/issues)**

*Extensão de comunidade. O Trivy é um projeto da Aqua Security; esta extensão não é oficial da Aqua Security.*
