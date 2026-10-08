# Plutão OS — Roadmap: Mobile, Notificações e Conformidade (decisões de 2026-10-05)

Status: DECIDIDO (aprovado pelo Jadiel nesta sessão). Itens marcados [PENDENTE] ainda não têm dono/PR.
Origem: conversa Jadiel × Kimi. Este documento é a "memória" oficial do assunto — qualquer sessão futura deve lê-lo antes de propor próximos passos.

---

## 1. Arquitetura mobile — companheiro, não sistema completo

- **Decisão:** o app móvel é um **cliente-companheiro** do Plutão. Agentes, missões, conectores, credenciais e catálogo permanecem no servidor (Neon + Next.js). O APK nunca detém estado que não possa ser reconstruído do servidor.
- **Tecnologia:** Capacitor (não TWA como base, não RN/Flutter, Cordova descartado). TWA fica como opção futura para listagem na Play Store.
- **Modelo atual (shell remoto):** o APK carrega `https://plutao-os.vercel.app` via `server.url`, com bridge do Capacitor injetado. Consequência: todo deploy no Vercel reflete no APK **sem republicar APK**. Custo: sem internet o app não abre (aceito por ora; `www/index.html` é fallback offline).
- **appId definitivo:** `app.plutao.os` (irreversível — não mudar).
- **[PENDENTE P0] Domínio próprio:** todo o modelo (allowNavigation, confiança do APK, anti-clone, URL oficial) pressupõe domínio estável em vez de `plutao-os.vercel.app`. Quando existir: apontar no Vercel (HTTPS automático), trocar `server.url` + `allowNavigation` (restrito ao domínio próprio, **nunca** `*.vercel.app`), rebuild do APK via CI. appId não muda.
- **PR #115 (`feat/capacitor-shell`):** scaffold Capacitor em `apps/android/` + workflow `android-debug.yml` (build debug → artifact `plutao-debug-apk`, retention 7d, sem keystore/secrets, `permissions: contents: read`). Diretório `android/` não versionado (regenerado no CI com `cap add android`). Regra: **validar o workflow verde na branch via dispatch manual antes de mergear em main.**
- Root cause de CI descoberto: o repo root tem configuração de workspaces e o `npm ci` em `apps/android` não instalava no lugar certo (binário `cap` ausente). Correção: instalação dev/local explícita.
- Higiene futura do workflow: filtro `paths: apps/android/**` no gatilho; caminho do `sdkmanager` com fallback (sem `|| true` mascarando falha no workflow de release).

## 2. Distribuição e atualização

- **Canais:** Play Store como canal principal (recomendado; maior defesa anti-clone e confiança), APK direto como canal secundário documentado. Sem "lojas parceiras", sem selos não auditados, um botão, uma origem.
- **Site de versões:** rota `/download` no próprio app Next.js (não GitHub Pages — mesmo domínio = mesma cadeia de confiança). Histórico com versão, data, release notes, tamanho, **SHA-256 do APK** (para humanos verificarem), fingerprint da assinatura. APKs imutáveis por versão (`plutao-1.4.2.apk` nunca sobrescrito), manter últimas ~5 versões.
- **Manifesto de updates:** `GET /updates/manifest.json` com `latest`, `min_supported` (forced update — aposenta cliente vulnerável), e lista de releases (apk_url, sha256, size, notes, date). Idealmente assinado (Ed25519). APK valida assinatura/manifesto antes de confiar.
- **Atualização:** **nunca** auto-download+install (não usar `REQUEST_INSTALL_PACKAGES`). Notificação/banner → deep-link para `/download` → usuário instala pelo fluxo Android. Push de update entra no canal de marketing/novidades (consentido). Verificação de manifesto também no app open (banner in-app).
- **Hospedagem dos binários:** object storage com CDN (Cloudflare R2, egress zero). Vercel não é lugar para APK de 40–80 MB × N versões.
- **Keystore:** gerar uma única vez dentro do CI (job com keytool), guardar base64 no GitHub Secrets, não deixar nascer em sandbox de agente. Rotação tem custo alto — custodiar como segredo crítico nível Vercel/Neon.
- **CI de release (fase posterior):** tag `v*` → build assinado → sobe binário no bucket → atualiza manifesto assinado → `/download` lista novo (ISR). Nunca copiar hash manualmente — pipeline único.

## 3. Integridade do app e anti-clone

Arquitetura em camadas (quem decide é sempre o servidor; camadas 1–3 produzem evidência):

1. **Assinatura do APK:** app revalida o próprio certificado (digest SHA-256 embutido). Clone precisa re-assinar → detectável.
2. **Origem da instalação** (`getInstallerPackageName`): instalador fora da lista → sinal (mirror enganado vira aviso, não punição).
3. **Play Integrity API** (basicIntegrity + deviceIntegrity; funciona fora da Play com Play Services).
4. **Sinais comportamentais no servidor:** versão declarada vs comportamento, taxa de erros, padrão de rede.

Fluxo de resposta (resposta graduada, nunca bloqueio cego):

```
detecção → flag na conta + aviso in-app persistente
  ("versão modificada detectada; sua conta está segura; baixe a oficial em [URL]; 7 dias")
  → dentro do prazo com app original: flag limpa
  → prazo vencido: SUSPENSÃO (não exclusão) → login pelo app oficial reativa automaticamente
```

- Prazo (7d) configurável no servidor, não hardcoded.
- **Caminho de contestação obrigatório** (root/custom ROM/WebView de OEM geram falsos positivos) → fila de revisão manual. Sem isso, bloqueio automático gera caso de consumo (CDC).
- Detecção entra na Política de Privacidade (base legal: segurança do tratamento, LGPD art. 7º IX / art. 46) e nos Termos (cláusula de suspensão por versão modificada, com notificação e prazo).
- Frame correto: proteção da **conta do usuário** contra cópias falsificadas (que exfiltram sessão), não DRM.
- Limite honesto: atacante determinado burla checks client-side; o valor é custo-elevador + proteção do usuário comum + resposta a incidente. Nunca prometer 100%.

## 4. Notificações (fase A antes de push de servidor)

- **Fase A (primeiro):** central de notificações in-app (tabela `notifications`, missão concluída/falha gera row) + **ponte Telegram** (conector já existe; missão concluída → mensagem; opt-in por conexão) + **notificações locais agendadas** (`@capacitor/local-notifications`, zero infra, rodam no aparelho).
- **Fase B (depois):** Web Push (navegador) e FCM (APK) via **outbox (`notification_outbox`) + provider abstraction** — o evento emite para a outbox; o provider entrega. Não amarrar Web Push ao browser de forma que exija reescrita no APK.
- **Duas categorias com bases legais distintas, nunca no mesmo toggle:**
  - Serviço (missão concluída, falha, aprovação pendente) — execução de contrato (art. 7º, V), ligado à conta, desligável por categoria.
  - Marketing (novidades, promoção) — **consentimento próprio** (art. 7º, I), granular, revogável, com descadastro em toda notificação.
- Permissão de push pedida **somente no gesto do usuário** (toggle → `requestPermission()`), nunca em page load.
- Restrições de plataforma: Android Chrome entrega push confiável com PWA instalado; iOS exige PWA instalado (Safari 16.4+).
- **NOVO REQUISITO (Jadiel, 2026-10-05):** página dedicada **"Tarefas em segundo plano" + "Agendadas"** (referência visual: sidebar "Agendadas" do Vibe/Mistral) — superfície de missões agendadas e jobs em execução, consumindo os mesmos dados de missões + outbox. Entra no escopo da Fase A.
- Firebase/FCM: decisão adiada. Conta existe, mas FCM só entra quando Telegram + local deixarem de bastar; avaliar alternativa simples (ntfy auto-hospedado) na ocasião.

## 5. LGPD e blindagem jurídica (vale para tudo, não só mobile)

- **Gap mais grave encontrado:** `/legal/privacidade` §1 diz "contato será publicado quando o canal oficial estiver definido" — **controlador anônimo**. Correção mínima: e-mail dedicado (`privacidade@` no domínio) + nome do responsável publicado. Decisão estrutural: formalizar pessoa jurídica (operar sem CNPJ como controlador empresarial é o maior risco da lista). Encarregado formal pode ser dispensado (pequeno porte), mas canal do titular é obrigatório.
- **Cookies:** banner **não é obrigatório hoje** (apenas cookie de sessão estritamente necessário — art. 7º, V + Guia ANPD de cookies). Será obrigatório quando entrar: telemetria de device class (fingerprinting conta como rastreamento), analytics, push. Quando existir: granular por finalidade, opt-in ativo, sem dark patterns, revogável com o mesmo nº de cliques.
- **Central de Consentimento:** UI + `consent_records` (user_id, escopo, versão da política, timestamp). Hoje mostra "nenhum rastreamento ativo"; consentimento de telemetria **antes do primeiro envio**.
- **Comunicação de incidente:** Resolução CD/ANPD nº 15/2024 — 3 dias úteis à ANPD e titulares a partir do conhecimento (dobrado para pequenos agentes), complementação em 20 dias úteis; **registro de incidente mantido ≥ 5 anos, mesmo os não notificáveis**. Criar `docs/INCIDENT_RESPONSE.md` com fluxo e dono.
- **Modelos de terceiros:** tabela `third_party_models` (id, licenciante, URL-fonte + revisão, licença SPDX, sha256, data de verificação, status, motivo de revogação) — sem linha, sem catálogo. Página `/legal/licencas` ganha seção **Modelos de terceiros** (inclui voz: Kokoro, Piper, Supertonic — hoje ausentes). License allowlist versionada em repo com teste que quebra build fora da lista. Termos ganham cláusula de modelos de terceiros (redistribuição de pesos exige licença que permita; restrições comunitárias repassadas no card do modelo; licenciante responde pelo modelo). Revogação via manifesto assinado com TTL curto (24h) alcançando até quem nunca abre o app.
- **Termos adicionais:** Marco Civil da Internet art. 19 (notice-and-takedown para share links), CDC art. 49 (arrependimento 7 dias para assinaturas) e cláusulas de cobrança recorrente.

## 6. Blueprint "Vitrine de Modelos Locais" — melhorias aprovadas

- §3 vira pipeline de 4 estágios: sinais brutos → payload versionado → derivação de device_class (função pura) → decisão de política. Thresholds (5 testes/3 usuários/50%) viram config versionada remota.
- Feature detection primeiro, inferência de aparelho depois. **Nunca bloquear botão só por valor reportado pelo cliente** (spoofável); bloqueio real = cota medida (`storage.estimate()`) ou histórico agregado de falha da classe.
- `deviceMemory`/`hardwareConcurrency` = limites inferiores, nunca exatos. Rede desconhecida = tratar como o caso padrão do alerta de dados móveis.
- Classe fallback obrigatória (`unknown-conservador`); > ~15% dos usuários em fallback = métrica de saúde da detecção.
- **Pré-requisitos de deploy para fase 1:** COOP/COEP (SharedArrayBuffer — decisão de produto, afeta embeds de terceiros) e CSP com `wasm-unsafe-eval` restrito ao motor local.
- Votos: test-run token assinado de uso único emitido só após inferência real; rate limit por conta/IP/classe; falha técnica pesa mais que clique.
- Manifesto de modelo assinado pelo servidor; runtime do motor local sem rede (CSP garante).
- LGPD: retenção explícita, k-anonymity na classe (< N usuários não persiste), consentimento antes do primeiro envio, sem identificador único de aparelho.

## 7. UI (tarefas de interface, executar em ordem, um PR por vez)

1. **`feat/ui-loading-identity`** — indicador "agente trabalhando" com o símbolo de `src/app/icon.svg` como **anel orbital** (estilo planeta) ao lado/avatar do agente durante a geração (inspiração comportamental: Perplexity gira o avatar; visual 100% identidade Plutão); `loading.tsx` com skeleton no tema escuro; transições de página discretas. Restrições: só transform/opacity, `prefers-reduced-motion`, zero layout shift, 360px e aparelho fraco, sem dependência pesada. **Reimplementar padrões, nunca copiar assets/CSS de terceiros.**
2. **`feat/chat-mobile-layout`** — primeiro auditar o ChatShell atual e documentar problemas no PR; depois corrigir: input ancorado (safe-area-inset-bottom, 100dvh), comportamento com teclado aberto, sem cobrir mensagens. Zero regressão desktop.
3. **`feat/computer-benchmark`** — benchmark primeiro (`docs/UI_BENCHMARK.md`): avaliar fluxos de streaming de desktop e documentar padrões de UX e proposta para elevar o "computador" do Plutão. Só depois decidir escopo de implementação.
- Disciplina: agente propõe PR → revisão (Kimi) → Jadiel mergeia pelo celular. Nada de push direto em main.
- Excluir do produto: upsell fixo em sidebar (promo entra por canal consentido ou contexto, não banner fixo).

## 8. Fluxo de trabalho estabelecido (vale daqui em diante)

- Automação assistida é **autora de código via PR**, nunca build machine, nunca cofre de segredo, nunca push em main.
- Builds rodam no GitHub Actions; APK sai como artifact; teste real no Poco C65.
- Revisão de diff por Kimi antes de cada merge. Um PR por vez.
- Status só é VERIFICADO com evidência em produção/build verde.


## 9. Addendum 2026-10-05 (teste real do APK no Poco C65)

- **APK testado e funcionando** (shell remoto): navegação nativa rápida, app carrega produção. Checklist de validação completo com Jadiel.
- **Identidade:** APK debug saiu com ícone padrão do template (reprovado por Jadiel). [PENDENTE] PR: ícones adaptativos Android + splash gerados de `src/app/icon.svg` (símbolo oficial), nome "Plutão".
- **Onboarding com consentimento (novo requisito Jadiel):** na criação de conta — Termos obrigatórios (checkbox não pré-marcado) + link da Política. NUNCA bundlear "aceitar tudo"; login não pode depender de marketing. Após login, Central de Consentimento com cartões: notificações de serviço (contrato), novidades/promoções (opt-in), análise de aparelho para sugerir modelos (opt-in, explica classe-faixas, ver/apagar). Permissão POST_NOTIFICATIONS (Android 13+) só no gesto do toggle.
- **Modelos locais "sem ensaio" — correção de arquitetura:** inferência local real NÃO será WebAssembly/WebView (lento demais no C65; referências PocketPal/RikkaHub usam llama.cpp nativo via JNI). **Decisão: plugin nativo próprio no Capacitor embutindo llama.cpp**; WebView conversa com o motor nativo. Sequência: (1) plugin + 1 GGUF + chat integrado, (2) benchmark real + detecção de falha real (OOM/timeout/load) → fluxo Funciona/Galho, (3) vitrine consumindo o catálogo.
- **Vitrine de modelos (novo requisito Jadiel):** página única agregando modelos gratuitos (LLMs GGUF + cloud: vídeo/imagem/escrita/código/ensino) com busca por nome exato. **Sem necessidade de afiliação HF/OpenRouter para LISTAR:** HF tem API pública gratuita de busca (`huggingface.co/api/models`), OpenRouter tem endpoint público de listagem — mesma técnica de PocketPal/RikkaHub (busca sob demanda, nada armazenado deles). `local_models_catalog` permanece a camada de curadoria Verificado (licença permitida, SHA, sem código remoto).
- **Honestidade da vitrine desde o dia 1:** selo claro "Roda no seu aparelho" (GGUF compatível com a device_class) vs "Via nuvem" (modelos pesados: vídeo/imagem, dezenas de GB — não rodam no C65). Nuvem = chave do usuário ou crédito Plutão. Sem prometer "todos locais".
- **Marcas de terceiros (GPT, NVIDIA, Llama):** uso nominativo factual em catálogo é legítimo; proibido insinuar endosso.
- **Faixas de viabilidade na vitrine (detalhado Jadiel):** lista completa (leve→pesado), 3 faixas por aparelho: verde (roda bem), amarelo (ressalvas com limite detectado), vermelho (card expansível com o PORQUÊ dos sinais reais — "detectamos pelo menos X GB", nunca RAM exata — e opções "Vou correr o risco" / "Escolher outro"). Sistema recomenda, não bloqueia (regra do blueprint). **"Vou correr o risco" gera registro** (quem/quando/modelo/motivo exibido) — evidência contra reclamação futura.
- **Correção de suposição (importante):** HF/OpenRouter NÃO testam nem certificam modelos listados — listagem ≠ verificado. A curadoria "Verificado" é 100% do Plutão (licença, SHA, varredura, compatibilidade). Teste remoto pré-download só existe para modelos "Via nuvem" (OpenRouter/HF Inference); para modelo local, GGUF rodando em servidor não prevê tokens/s no aparelho do usuário — o teste local real (baixar→rodar→medir→Funciona/Galho) é a única medida verdadeira e permanece o fluxo.
- **Segurança mobile (novo requisito Jadiel):** tela Configurações → Segurança no APK com: (1) **trava do app** — biometria via Android Keystore com chave biometric-bound (biometria fica no SO, app nunca vê template → mata dado sensível LGPD; no web, equivalente WebAuthn/passkey); (2) **2FA da conta** — TOTP + códigos de backup, validado no servidor, **nunca SMS** (SIM swap); (3) **sessões ativas com revogação por dispositivo** (celular perdido/roubado); (4) atalho para Central de Consentimentos. Distinção rígida: trava local (conveniência) ≠ 2FA de conta (segurança real). Futuro: passkeys unificando as camadas (mesma credencial no app e web). Ordem: ciclo onboarding/consentimento, depois da vitrine; trava biométrica pode viajar no PR nativo (Keystore).
- **Estratégia "app-first" (decidido):** o APK é o cliente prioritário/aliado do usuário; o web/PWA permanece como canal de descoberta (faixa aproximada honesta, "exata no app") e base sempre atualizada. **Regra de ouro: o app é uma EXPANSÃO do sistema, nunca um fork** — coração (conta, chat, missões, conectores, catálogo, consentimentos) no web consumido pelo shell; capacidades nativas (detecção exata, llama.cpp, push com ações, térmica, biometria, integridade) no APK via plugins. Funil: site = descoberta, app = uso diário.
- **Detecção em 3 níveis (decidido após questionamento do Jadiel sobre exatidão tipo console):** Navegador é aproximado POR DESIGN (anti-fingerprinting; não vai mudar). APK nativo Android dá exatidão quase console (`Build.MODEL` exato, RAM total/livre via ActivityManager, núcleos reais, GPU GL/Vulkan, armazenamento via StatFs, **térmica via PowerManager.getThermalHeadroom** e bateria). Estratégia: (1) web = classe aproximada com rótulo honesto "exata no app"; (2) nativo = specs exatas + **resolução de SKU**: Build.MODEL contra base de dispositivos (catálogo público do Google Play) → perfil SoC/GPU/RAM conhecido; (3) **micro-benchmark de 15s no primeiro uso** calibra a recomendação pela medição real daquele aparelho (detecção = pré-filtro, medição = verdade). Valores viajam assinados pelo plugin de integridade; servidor cruza com benchmark agregado (anti-spoof). **LGPD:** exatidão = fingerprint forte → o opt-in "análise de aparelho" deve pedir exatidão explicitamente; jamais coletar ANDROID_ID/serial. Construir junto com o plugin llama.cpp (mesmo PR nativo): módulos `inference-engine` + `device-capabilities`.
- **STATUS (2026-10-05):** PR #116 (vitrine) MERGEADO + migration 0018 aplicada no Neon (7 curados, risk_acceptances vazia). Vitrine ✅ completa. PR #117 (branding: ícones adaptativos + splash do símbolo oficial `assets/brand/vectors/mark.svg`, script apply-branding.mjs no CI) MERGEADO.
- **REGRA DE OURO DO PIPELINE (imposta após erro de "pacote em conflito" em 2026-10-05):** debug keystore NUNCA mais regenerada por run. Keystore de debug fixa gerada uma vez, base64 nos GitHub Secrets, decodificada no workflow para `~/.android/debug.keystore` antes do Gradle → todos os APKs debug assinados com a MESMA chave, instalação por cima sempre funciona. Mesmo padrão da keystore de release (gerada uma vez, só existe nos Secrets).
- **STATUS keystore pinada (2026-10-05):** PR #118 MERGEADO — debug keystore pinada (fingerprint `F5:2B:0A:64…`), workflow injeta signingConfig via properties dos Secrets, fail-closed, `.gitignore` bloqueia keystore. Causa raiz provada: 4 runs = 4 certificados. **BACKLOG SEGURANÇA:** OAuth mobile usa deep link `plutao://` (custom scheme → interceptável; token uso único limita dano). Migrar para **Android App Links** quando o domínio próprio (P0) existir.
- **CANAL PRÓPRIO DE ATUALIZAÇÃO (2026-10-05):** PR #119 MERGEADO — release keystore gerada (alias `plutao`, validade até 2051, fingerprint `23:AB:D9:7F…`, secrets criados, **arquivo da keystore guardado pelo Jadiel**). Workflow `android-release.yml`: tag `v*` → build assinado → GitHub Release com `plutao-VERSAO.apk` + `release-metadata.json` (SHA-256 verificado por round-trip). `/api/updates/manifest.json` (cache 60s) + página `/download` (SHA-256 e fingerprint exibidos, copy anti-clone) + checker nativo diário (card → /download; `minSupported` → diálogo bloqueante). **Decisão de uso:** debug no aparelho do Jadiel para dev; release (tags) para distribuição — primeiro APK release exige uma desinstalação do debug. Release de teste `v0.0.1-teste` apagado após validação.
- **Ordem de execução FINAL (Jadiel):** (a) ~~PR vitrine~~ ✅ FEITO; (b) PR ícones/splash + onboarding de consentimento + segurança mobile; (c) PR plugin nativo (`inference-engine` + `device-capabilities` + Keystore) — Kimi detalha a spec antes, nenhum agente toca sem ela. UI prompts §7 seguem válidos e podem intercalar depois de (b).

## 10. Pendências P0 (não esquecer)

1. **Domínio próprio** — desbloqueia allowNavigation confiável, URL oficial do APK, anti-clone, e-mail de privacidade.
2. **Formalização do controlador** (pessoa jurídica) + e-mail `privacidade@` publicado na /legal/privacidade (hoje: "será publicado quando definido" — gap LGPD).
3. **`docs/INCIDENT_RESPONSE.md`** — fluxo de 3 dias úteis (Resolução CD/ANPD 15/2024), registro de incidentes ≥ 5 anos.
4. Commite deste documento em `docs/` no repo (memória oficial do projeto).
