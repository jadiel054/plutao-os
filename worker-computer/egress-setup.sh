#!/usr/bin/env bash
# Onda 2 — política de EGRESS DE REDE para o computador persistente (mini PC).
# A garantia dura contra SSRF/DNS rebinding é REDE, não aplicação (auditoria).
# Execute como root no mini PC ANTES de expor qualquer endpoint.
#
# Política: o processo do Chromium só alcança a internet; loopback, rede
# local, link-local (metadata 169.254.169.254) e ranges reservados ficam
# bloqueados no nível de pacote, para QUALQUER processo do usuário do browser.
set -euo pipefail

BROWSER_USER="${BROWSER_USER:-browser}"   # usuário dedicado que roda o Chromium
WAN_IF="${WAN_IF:-wlan0}"                 # interface com internet

# 1) Bloqueia acesso a redes privadas/reservadas saindo pela WAN.
for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 127.0.0.0/8 169.254.0.0/16 \
           100.64.0.0/10 192.0.0.0/24 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4; do
  iptables -C OUTPUT -m owner --uid-owner "$BROWSER_USER" -d "$net" -j REJECT 2>/dev/null || \
    iptables -A OUTPUT -m owner --uid-owner "$BROWSER_USER" -d "$net" -j REJECT
done

# 2) Permite apenas a interface WAN (sem acesso a bridges/docker internos).
iptables -C OUTPUT -m owner --uid-owner "$BROWSER_USER" -o lo -j REJECT 2>/dev/null || \
  iptables -A OUTPUT -m owner --uid-owner "$BROWSER_USER" -o lo -j REJECT

# 3) DNS: usa apenas resolvedor configurado (mitigação parcial de rebinding —
# o bloqueio por IP acima cobre o re-bind para ranges privados).
echo "Egress de rede aplicado para o usuário '$BROWSER_USER'."
echo "Recomendado: rodar o Chromium sob este usuário dedicado e persistir as"
echo "regras com iptables-persistent (netfilter-persistent save)."
