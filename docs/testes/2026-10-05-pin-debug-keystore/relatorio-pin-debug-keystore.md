# Relatório — Pin da debug keystore no APK Android (2026-10-05)

PR: `feat/ci-pin-debug-keystore` · Workflow: `.github/workflows/android-debug.yml`

## Problema

APKs debug de runs diferentes do GitHub Actions tinham **assinaturas diferentes**, então o
Android recusava a instalação por cima com `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
("pacote em conflito") e era preciso desinstalar o app antes de cada atualização.

**Causa raiz:** o Android Gradle Plugin cria uma `debug.keystore` nova em cada runner
limpo; o template Capacitor não define `signingConfigs`, então o build `debug` usa o
default do AGP — que aponta para `$HOME/.android/debug.keystore`, um arquivo que **não
existe** no CI e é gerado do zero a cada execução.

## Correção entregue

1. **Uma única debug keystore** (JKS, `alias androiddebugkey`, senhas padrão `android`,
   RSA 2048, validade 10000 dias), custodiada como secret no GitHub — nunca no repositório.
2. **Step `Restore pinned debug keystore`** no workflow, antes do Gradle: decodifica
   `ANDROID_DEBUG_KEYSTORE_BASE64` para `$HOME/.android/debug.keystore`, valida com
   `keytool` e **falha de propósito** se o secret não existir (fallback silencioso
   recriaria o bug). Nenhuma alteração no `build.gradle` gerado é necessária.
3. **Step `Show debug APK signing certificate`**: imprime o fingerprint público do
   certificado do APK e o SHA-256 do arquivo em cada run — evidência auditável no log.
4. **`apps/android/README.md`**: onde criar os secrets e procedimento de rotação
   (com o custo da rotação explícito) + histórico de fingerprints.
5. **`.gitignore`**: bloqueia `*.keystore`, `*.jks`, `*.p12`.

Fingerprint público do certificado pinado (não é segredo — todo APK o expõe):

```
SHA-256  F5:2B:0A:64:F7:53:26:2E:96:CA:02:5E:26:4A:21:59:77:0A:29:D7:F2:FA:AD:56:AC:9A:37:D2:8D:BC:C9:8F
SHA-1    7C:57:42:BA:D5:7C:B1:E1:1D:77:FA:63:0E:CB:77:88:A0:C3:4B:38
```

## Evidência 1 — os APKs antigos do CI tinham todos chaves diferentes

Artifacts `plutao-debug-apk` baixados dos runs reais do repositório e conferidos com
`apksigner verify --print-certs` (procedimento: `gh run download <run-id> -n plutao-debug-apk`):

| Run (Actions) | Origem | SHA-256 do certificado |
| --- | --- | --- |
| 37287582681 | `feat/capacitor-shell` (push) | `72cc033b…7d5d` |
| 37293863549 | main — PR #116 | `62a12dc1…20ee` |
| 37295785810 | `feat/android-branding` (dispatch) | `c4ed3684…9c0c` |
| 37297569762 | main — PR #117 | `b0710e4f…25a6` |

Quatro runs, **quatro certificados distintos** → qualquer instalação por cima de um APK
gerado por outro run falha por conflito de assinatura. Causa raiz confirmada em dado real,
não por dedução.

## Evidência 2 — com o pin, builds independentes saem com o mesmo certificado

Build completo do projeto Capacitor no sandbox (mesmos passos do workflow: `npm ci` →
`cap add android` → `cap sync android` → `apply-branding.mjs` → `gradlew clean assembleDebug`),
variando apenas a keystore presente em `$HOME/.android/debug.keystore`:

| Build | Keystore usada | SHA-256 do APK | SHA-256 do certificado |
| --- | --- | --- | --- |
| run 1 (pinada) | keystore pinada | `7599c1be…2a18` | `f52b0a64…c98f` |
| run 2 (pinada) | mesma keystore pinada | `7599c1be…2a18` | `f52b0a64…c98f` |
| run 3 (sem pin) | keystore regenerada do zero | `3891c8ec…b6f8` | `04fac01c…b936` |

- Dois builds independentes com a keystore pinada produziram APKs **byte-idênticos**
  (`7599c1be…2a18`, mesmo hash do arquivo) com o mesmo certificado `f52b0a64…c98f`.
- Ao regenerar a chave (comportamento antigo do AGP), o certificado mudou para
  `04fac01c…b936` — exatamente o mecanismo que produzia o conflito.
- O certificado dos APKs gerados é igual ao SHA-256 do certificado da keystore entregue.

Identidade do pacote conferida com `aapt2 dump badging` em todos os APKs:
`package: name='app.plutao.os' versionCode='1' versionName='1.0'`, label `Plutão` — ou seja,
nome do pacote e versão não são a causa do conflito; a assinatura era.

## Evidência 3 — upgrade no aparelho (Poco C65)

As três condições que o PackageManager verifica para aceitar uma atualização são:
mesmo nome de pacote, **mesmo certificado de assinatura** e versão não retroativa.
Pacote e versão são idênticos e o certificado passou a ser estável entre runs, então
APK novo instala por cima do APK anterior assinado pela chave pinada.

**Atenção — uma vez só:** o APK instalado no aparelho hoje foi assinado por alguma das
quatro chaves antigas (que não existem mais em lugar nenhum). O **primeiro** APK pinado
vai conflitar com ele. Basta desinstalar o app uma vez
(`adb uninstall app.plutao.os` ou desinstalar na tela) e instalar; daí em diante todo APK
debug do CI instala por cima normalmente. O estado do Plutão vive no servidor, então
desinstalar não perde dado de conta.

Roteiro de teste no aparelho:

1. `adb install -r app-debug-run1-pinned.apk` depois de desinstalar o atual → deve instalar.
2. `adb install -r app-debug-variante2.apk` (build diferente, mesma chave) → **deve instalar
   por cima sem desinstalar e sem erro de conflito**. Este é o teste que prova a correção.

## Pendente neste relatório

O run manual (`workflow_dispatch`) na branch `feat/ci-pin-debug-keystore` depende de os
três secrets existirem no repositório. Este documento é atualizado com o link do run e o
fingerprint impresso no log assim que o run rodar. Nada aqui deve ser considerado
"verificado em produção" antes disso.