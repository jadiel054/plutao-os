"use client";

import { useEffect, useState } from "react";

/**
 * Banner global de conectividade.
 * Não bloqueia a UI — só sinaliza modo degradado (missão deve continuar
 * via capacidades locais quando existirem).
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="w-full px-3 py-2 text-center text-[11px] font-mono bg-amber-500/15 text-amber-200 border-b border-amber-500/30"
    >
      Offline — a interface continua; a missão depende de capacidades locais (WebGPU / cache).
      Reconecte para sincronizar com o servidor.
    </div>
  );
}
