# Trivy Installer & Scanner

Integre o Trivy a pipelines de build e release do Azure DevOps com **duas tasks independentes**.

**Trivy Installer** instala a última versão estável oficial ou uma versão fixa; inclui cache, verificação SHA-256 e suporte a Windows x64, Linux e macOS (x64/ARM64).

**Trivy Scan** verifica imagens de contêiner, repositórios Git, arquivos, IaC, rootfs, SBOM e Kubernetes. Configure severidade, scanners, exclusões, formato JSON/SARIF e política de falha.

## Exemplo YAML

```yaml
- task: TrivyInstaller@0
  inputs:
    version: latest
- task: TrivyScan@0
  inputs:
    command: fs
    target: '$(Build.SourcesDirectory)'
    severity: 'HIGH,CRITICAL'
    scanners: 'vuln,secret'
    exitCode: '1'
```

Para imagens privadas ACR, autentique antes do scan com `Docker@2` (login) ou `AzureCLI@2` + `az acr login`. Para compartilhar relatórios, utilize `PublishPipelineArtifact@1`. Para arquivos de configuração protegidos, utilize `DownloadSecureFile@1` e `additionalArguments: '--config "$(trivyConfig.secureFilePath)"'`.

**Documentação completa:** https://github.com/pitinga/azure-pipelines-tasks-trivy/blob/main/README.md
