/**
 * Fase 4 — VALIDAÇÃO DE NAVEGAÇÃO do Computador do Plutão.
 *
 * Toda navegação (humana ou do agente) passa por aqui ANTES de virar
 * Page.goto / Input no Chromium remoto. Objetivo: impedir que a sessão
 * reach endereços internos/privados (loopback, rede local, link-local de
 * metadata cloud, ranges reservados) ou esquemas perigosos.
 *
 * Bloqueado por hostname:
 *  - "localhost", "*.localhost", "*.local", "*.internal", "*.lan", "*.home.arpa";
 *  - IPv4 em ranges não roteáveis/privados: 0/8, 10/8, 100.64/10 (CGNAT),
 *    127/8, 169.254/16 (metadata 169.254.169.254), 172.16/12, 192.168/16,
 *    192.0.0/24, 198.18/15, 224/4 (multicast), 240/4 e 255.255.255.255;
 *  - IPv6: ::1, ::/128, ::ffff:0:0/96 (mapeado p/ IPv4 privado), fc00::/7,
 *    fe80::/10, ff00::/8;
 *  - octetos octais/hexadecimais ("0177.0.0.1") e host sem ponto não-íntegro.
 *
 * Limitação documentada: não há fixação de DNS (DNS rebinding não é coberto
 * aqui — mitigation é rede/egress do provedor).
 */

const UNSAFE_URL_PREFIXES = [
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "about:",
  "blob:",
  "chrome:",
  "ws:",
  "wss:",
  "ftp:",
];

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
];

const BLOCKED_EXACT_HOSTS = new Set(["localhost", "metadata.google.internal"]);

function isBlockedIpv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split(".").map(Number);
  const [a, b] = octets as [number, number, number, number];
  if (octets.some((o) => o > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 224 || a >= 240) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h === "0:0:0:0:0:0:0:1" || h === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
  if (h.startsWith("ff")) return true;
  const mapped = h.match(/^::ffff:(.+)$/);
  if (mapped) {
    const tail = mapped[1]!;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(tail)) return isBlockedIpv4(tail);
    // Forma hexadecimal (::ffff:7f00:1 = 127.0.0.1)
    const groups = tail.split(":").filter(Boolean);
    if (groups.length >= 2) {
      try {
        const hi = parseInt(groups[groups.length - 2]!, 16);
        const lo = parseInt(groups[groups.length - 1]!, 16);
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          return isBlockedIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
        }
      } catch {
        return false;
      }
    }
  }
  return false;
}

function isBlockedHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_EXACT_HOSTS.has(host)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host.includes(":")) {
    const inside = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    return isBlockedIpv6(inside);
  }
  // Numérico: só aceita IPv4 dotted-decimal válido; "2130706433" ou
  // "0177.0.0.1" (formas opacas de loopback) caem aqui e são blocadas.
  if (/^[\d.]+$/.test(host)) {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    return isBlockedIpv4(host);
  }
  // Hostname de um só rótulo resolve dentro da rede local — bloqueado.
  if (!host.includes(".")) return true;
  return isBlockedIpv4(host);
}

export type UrlGuardResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/** Só http/https publicamente roteáveis — usado pelo agente E pelo humano. */
export function assertPublicHttpUrl(url: string): UrlGuardResult {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, reason: "esquema não permitido (somente http/https)" };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "URL malformada" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "esquema não permitido (somente http/https)" };
  }
  if (UNSAFE_URL_PREFIXES.some((prefix) => parsed.href.toLowerCase().startsWith(prefix))) {
    return { ok: false, reason: "esquema não permitido" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URL com credencial não é permitida" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, reason: "endereço interno/privado não é acessível pela sessão remota" };
  }
  return { ok: true, url: parsed.toString() };
}

/** Compat com chamadas puramente booleanas (rotas e adaptador). */
export function isForbiddenNavigateUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (UNSAFE_URL_PREFIXES.some((bad) => lower.startsWith(bad))) return true;
  return !assertPublicHttpUrl(url).ok;
}
