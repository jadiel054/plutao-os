# Plutão Android branding

Assets gerados exclusivamente a partir do símbolo oficial do Plutão em
`assets/brand/vectors/mark.svg`, confirmado também pelo HTML 3D enviado para a tarefa:
colchetes assimétricos + losango central. O HTML de referência usa Three.js apenas para
extrusão e interação; nenhum texto, CDN ou asset externo foi incorporado ao APK.

- Fundo de ícone e splash: `#0a0a0f`.
- Foreground adaptativo: símbolo transparente na área segura de 108dp.
- Fallback legado: `ic_launcher.png` e `ic_launcher_round.png` em mdpi, hdpi, xhdpi,
  xxhdpi e xxxhdpi.
- Splash: orientações portrait/landscape em todas as densidades geradas pelo template.

O diretório `android/` é regenerado pelo CI. O workflow executa
`scripts/apply-branding.mjs` depois de `cap add`/`cap sync` para copiar estes assets para
o projeto nativo antes do Gradle.
