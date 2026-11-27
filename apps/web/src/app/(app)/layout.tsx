import type { ReactNode } from "react";
import { NixVoiceAssist } from "@/components/chat/NixVoiceAssist";
import { AppearanceApplier } from "@/components/AppearanceApplier";

/**
 * Layout do grupo (app): renderiza a assistência por voz em TODAS as páginas
 * autenticadas (voz global), compartilhando o contexto da página atual com o
 * núcleo agêntico. O componente não renderiza em navegadores sem suporte.
 * AppearanceApplier aplica tema/densidade/idioma globalmente.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AppearanceApplier />
      <NixVoiceAssist />
    </>
  );
}
