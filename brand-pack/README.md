# temp-png-upload — pack para o vibe code

Branch temporário com os 12 PNGs da identidade Plutão em JSON base64.

## Decode

```bash
python3 brand-pack/decode_plutao_brand_png.py brand-pack/plutao_brand_icons_b64.json
python3 brand-pack/decode_plutao_brand_png.py brand-pack/plutao_brand_selos_b64.json
python3 brand-pack/decode_plutao_brand_png.py brand-pack/plutao_brand_lockups_b64.json
```

Isso grava:
- `assets/brand/icons|selos|lockups/*`
- `apps/web/public/icon_192.png` e `icon_512.png`

Depois commit só esses paths em `main` (não mergear o branch inteiro).

Ver `brand-pack/INSTRUCTIONS.md`.
