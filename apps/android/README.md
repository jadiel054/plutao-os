# Plutão OS — App Android (shell Capacitor)

Cliente-companheiro do Plutão. O APK é um shell Capacitor que carrega o app web
publicado (`https://plutao-os.vercel.app` via `server.url`) com a bridge nativa
injetada. `appId` definitivo: `app.plutao.os` — **irreversível**.

- `capacitor.config.json` — configuração do shell (appId, server.url, allowNavigation).
- `www/` — fallback offline carregado quando não há rede.
- `branding/res/` — ícones e splash aplicados sobre o template gerado.
- `scripts/apply-branding.mjs` — copia o branding para dentro do projeto Android.
- `android/` — **não versionado**: regenerado a cada build com `cap add android`.

Contexto de produto e decisões: `docs/ROADMAP_MOBILE_NOTIFICACOES_LEGAL.md`.

## Build

O build roda **somente** no GitHub Actions, pelo workflow
`.github/workflows/android-debug.yml` (artifact `plutao-debug-apk`, retenção 7 dias).
Nada de gerar APK na máquina de um agente ou de um humano como fonte de verdade.

```
Checkout → Node 20 → JDK 17 → npm ci (apps/android) → cap add android
→ cap sync android → apply-branding → restaura keystore pinada → gradlew assembleDebug
→ imprime certificado → upload do artifact
```

Disparo manual (para validar na branch antes de mergear):

```
gh workflow run android-debug.yml --ref <branch>
gh run watch
```

## Login Google no Android: navegador → app

No APK, o botão Google (e GitHub) abre o provedor no navegador do sistema para
que o login rápido funcione corretamente. Depois da autenticação, o callback do
servidor redireciona para o deep link `plutao://oauth/callback`; o Android
reabre o APK, o `MobileOAuthBridge` consome o handoff e instala o cookie de
sessão dentro do WebView. Assim o usuário volta ao Cockpit do app, não fica em
uma aba `plutao-os.vercel.app`.

O handoff usa um token de sessão de uso único: o endpoint
`/api/auth/mobile/complete` apaga o token original antes de criar o cookie
HTTP-only final no WebView. O token nunca é impresso em log. O filtro Android e
o patch do manifesto são reaplicados por `scripts/apply-branding.mjs`, porque
`android/` é regenerado a cada run e não pode ser editado manualmente como fonte
de verdade.

## Assinatura debug: a keystore é PINADA (não gerada no CI)

**Problema que isto resolve.** Por padrão, o Android Gradle Plugin cria uma
`debug.keystore` **nova a cada máquina/run**. Como cada run do CI é um runner
limpo, cada APK debug saía assinado com um certificado diferente. O Android só
aceita instalar um APK por cima de outro se a assinatura for a mesma, então a
instalação falhava com *"pacote em conflito"* / `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
e era preciso desinstalar o app antes, perdendo o estado local.

**Correção.** Existe **uma única** debug keystore, guardada como secret no
GitHub. O workflow decodifica esse secret para `$HOME/.android/debug.keystore`
antes do Gradle — que é exatamente o caminho que o AGP usa para o build `debug`
por padrão (alias `androiddebugkey`, senha `android`) — e portanto todos os runs
assinam com a **mesma chave**. Não é preciso alterar o `build.gradle` gerado.

### Secrets necessários

Em **GitHub → repo `jadiel054/plutao-os` → Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Obrigatório | Valor |
| --- | --- | --- |
| `ANDROID_DEBUG_KEYSTORE_BASE64` | sim | a keystore `debug.keystore` inteira, codificada em base64 (uma linha, sem quebras) |
| `ANDROID_DEBUG_KEYSTORE_PASSWORD` | recomendado | `android` (padrão de debug do AGP) |
| `ANDROID_DEBUG_KEY_PASSWORD` | recomendado | `android` (idêntico ao anterior — o JKS do AGP usa a mesma senha para store e key) |

Sem `ANDROID_DEBUG_KEYSTORE_BASE64` o job **falha de propósito**, com mensagem
apontando para este README: cair num fallback silencioso recriaria exatamente o
bug do conflito de pacote.

Secrets são write-only: quem os cria não consegue lê-los de volta depois. Guarde
o `debug.keystore` num gerenciador de senhas (1Password/Bitwarden) — sem ele não
há como reproduzir a assinatura de builds antigos.

### Regras inegociáveis

- A keystore e as senhas **nunca** entram no repositório, no corpo de um PR, em
  issue, em comentário ou em log de CI. `.gitignore` bloqueia `*.keystore`,
  `*.jks` e `*.p12` como segunda linha de defesa.
- O step do CI nunca imprime o conteúdo do secret (só o **fingerprint público**
  do certificado, que é informação pública e serve de evidência nos logs).
- Esta chave é a **debug**. A **release keystore** é assunto separado e mais
  crítico: precisa nascer dentro do CI (job com `keytool`), ser custodiada como
  segredo de nível Vercel/Neon e ter sua rotação tratada como incidente — nunca
  gerar em sandbox de agente.

## Rotação da debug keystore

Rotacione **só** se a chave vazar, for perdida, ou se as senhas deixarem de ser
aceitáveis. Custo da rotação: o APK novo passa a ter outra assinatura, então
**ele não instala por cima** de APKs assinados com a chave antiga — usuários
precisam desinstalar antes de instalar (dado local do app se perde; o estado do
Plutão vive no servidor, então o impacto é baixo, mas o atrito é real).

1. Gere a nova chave (mesmo alias e mesmas senhas padrão do AGP; validade longa
   evita nova rotação por expiração):

   ```bash
   keytool -genkeypair -v \
     -keystore debug.keystore \
     -storetype JKS \
     -storepass android -keypass android \
     -alias androiddebugkey \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -dname "CN=Android Debug,O=Android,C=US"
   ```

   > Use `CN=Android Debug,O=Android,C=US` para manter a mesma identidade de
   > certificado do padrão Android. Nunca reutilize a keystore de release aqui.

2. Gere o base64 em linha única e guarde o binário no gerenciador de senhas:

   ```bash
   base64 -w0 debug.keystore > ANDROID_DEBUG_KEYSTORE_BASE64.txt   # envie o conteúdo, não o arquivo
   ```

3. Atualize o secret `ANDROID_DEBUG_KEYSTORE_BASE64` no GitHub (Settings →
   Secrets and variables → Actions → clicar no secret → *Update*). Atualize
   também os dois secrets de senha, se mudaram.

4. Rode o workflow em uma branch (`gh workflow run android-debug.yml --ref <branch>`)
   e confira no log o step **Show debug APK signing certificate**: o SHA-256 deve
   ser novo e **estável entre runs**.

5. Anote a data e o motivo da rotação na tabela abaixo e avise o Jadiel para
   republicar o APK em `/download` (o fingerprint da assinatura é publicado lá —
   ver §2 do roadmap).

### Histórico de rotação

| Data | Motivo | Fingerprint SHA-256 do certificado | Quem |
| --- | --- | --- | --- |
| 2026-10-05 | Chave inicial de debug (correção do conflito de pacote em APK debug) | `F5:2B:0A:64:F7:53:26:2E:96:CA:02:5E:26:4A:21:59:77:0A:29:D7:F2:FA:AD:56:AC:9A:37:D2:8D:BC:C9:8F` | CI (PR `feat/ci-pin-debug-keystore`) |

O fingerprint **não é segredo** (todo APK carrega essa informação publicamente);
citar aqui serve de referência para conferir os logs do CI.

## Conferindo o APK baixado

```bash
sha256sum app-debug.apk
apksigner verify --print-certs app-debug.apk     # ou: keytool -printcert -jarfile app-debug.apk
```

O `certificate SHA-256 digest` precisa ser igual ao da tabela de rotação. Se for
diferente, o APK não foi assinado com a chave pinada.

## Instalando por cima (upgrade)

```bash
adb install -r app-debug.apk
```

Deve concluir sem `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Se esse erro aparecer,
o dispositivo tem um APK assinado com outra chave: desinstale
(`adb uninstall app.plutao.os`) ou compare o certificado dos dois APKs antes de
desinstalar.


## Canal próprio de atualização e release

O workflow `.github/workflows/android-release.yml` roda em tags `v*`. Ele gera um APK
release assinado, publica o asset imutável `plutao-VERSAO.apk` no GitHub Release e
anexa `release-metadata.json` com `versionCode`, `versionName`, notas, data,
tamanho, SHA-256 do APK e fingerprint da assinatura. O `versionCode` é o número
de commits que alteraram `apps/android`, portanto cresce quando o app muda.

### Secrets de release

Criar em **Settings → Secrets and variables → Actions → New repository secret**:

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_PASSWORD`

A keystore de release é crítica e nunca deve ser commitada, logada ou colocada no
artifact. Sem ela não é possível assinar uma atualização que o Android aceite por
cima da instalação existente. O fingerprint público deve ser registrado no
inventário de releases; senhas e base64 devem permanecer em um gerenciador de
segredos.

### Disparo e atualização manual

```bash
git tag v1.0.0
git push origin v1.0.0
```

A rota `/download` mostra o histórico, o tamanho, o SHA-256 e o fingerprint para
conferência humana. O app apenas avisa sobre uma atualização e abre essa rota; ele
nunca baixa ou instala APK automaticamente. O Android continua controlando o
fluxo de instalação.
