# Segurança da conta

O PR `feat/account-security` adiciona a primeira camada de segurança de conta prevista no roadmap.

## O que está implementado

- **2FA da conta:** TOTP compatível com Google Authenticator/Aegis; SMS não é usado.
- **Códigos de backup:** 10 códigos exibidos somente no momento da ativação; o banco armazena apenas hashes scrypt e cada código é invalidado após o primeiro uso.
- **Sessões ativas:** listagem por dispositivo aproximado/data e revogação individual ou de todas as outras sessões.
- **Desafio no login:** senha, OAuth e Magic Link não criam uma sessão final quando o TOTP está ativo; exigem o segundo fator.
- **Trava biométrica:** a preferência é persistida para o futuro plugin Android. A trava local não substitui o 2FA da conta. A biometria real deve ser implementada no APK usando Android Keystore biometric-bound; o servidor nunca recebe template biométrico.
- **Segredos TOTP:** cifrados com o AES-256-GCM já usado pelos conectores, usando `CONNECTOR_TOKEN_SECRET`, `SESSION_SECRET` ou `AUTH_SECRET`.

## Aplicar no Neon

A migration é deliberadamente manual, seguindo a regra do projeto:

```text
packages/db/drizzle/0020_account_security.sql
```

Execute-a uma vez no banco de produção antes de habilitar o fluxo em produção. Não executei comandos contra o Neon.

## Fluxo de ativação

1. A pessoa acessa **Configurações → Segurança → Configurar 2FA**.
2. Escaneia o QR code ou copia a chave `otpauth` em um autenticador.
3. Digita o código atual para confirmar.
4. Copia os 10 códigos de backup; eles não são recuperáveis pela interface depois da confirmação.

Para desativar, é necessário informar a senha da conta ou um código TOTP válido. Contas sem senha (por exemplo, criadas via OAuth) devem usar TOTP.

## Limitações assumidas

- A trava biométrica é apenas uma preferência até o plugin nativo Android ser implementado.
- A identificação de dispositivo nas sessões é aproximada, baseada no User-Agent; nenhum Android ID, serial ou fingerprint persistente é coletado.
- O primeiro fator de OAuth/Magic Link é seguido pelo TOTP no navegador quando 2FA está ativo.
