# Instruções para o vibe code (Mistral)

Repo: `jadiel054/plutao-os`  
Branch deste pack: `temp-png-upload`

## Tarefa única

1. Checkout deste branch e rode o decoder nos 3 JSON.
2. Leve para `main` **apenas** os PNGs gerados.
3. Commit e push em `main`.

```bash
git fetch origin temp-png-upload
git checkout temp-png-upload

python3 brand-pack/decode_plutao_brand_png.py brand-pack/plutao_brand_icons_b64.json
python3 brand-pack/decode_plutao_brand_png.py brand-pack/plutao_brand_selos_b64.json
python3 brand-pack/decode_plutao_brand_png.py brand-pack/plutao_brand_lockups_b64.json

ls -la assets/brand/icons/ assets/brand/selos/ assets/brand/lockups/
ls -la apps/web/public/icon_192.png apps/web/public/icon_512.png

git checkout main
git checkout temp-png-upload -- assets/brand/icons assets/brand/selos assets/brand/lockups apps/web/public/icon_192.png apps/web/public/icon_512.png

git add assets/brand/icons assets/brand/selos assets/brand/lockups apps/web/public/icon_192.png apps/web/public/icon_512.png
git commit -m "brand(identity): add portal PNG pack (icons, selos, lockups)"
git push origin main
```

## Regras

- NÃO refatorar CSS, schema, Auth, Mission Core, docs.
- NÃO usar `icon-192.png` (hífen). Underscore: `icon_192.png`.
- NÃO fazer merge do branch `temp-png-upload` inteiro em main (evita trazer os JSON base64).
