import type { Metadata } from "next";
import Link from "next/link";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = {
  title: "Central de ajuda",
  description: "Como usar o Plutão: missões, evidência, conectores e privacidade.",
};

const FAQ = [
  {
    q: "O que é uma missão?",
    a: "Missão é a unidade de trabalho do Plutão: um objetivo com plano, execução, evidência e critério de conclusão. Diferente de uma conversa solta, a missão guarda estado, passos e resultados no servidor — mesmo se você fechar o navegador.",
  },
  {
    q: "Por que o Plutão pede confirmação antes de executar?",
    a: "Para alinhar o caminho. O Núcleo resume o que entendeu, propõe passos e só avança com alinhamento explícito. Isso evita executar plano errado e gera trilha auditável.",
  },
  {
    q: "O que é evidência?",
    a: "Registro factual do que aconteceu na execução (resultado de ferramenta, erro, checkpoint). Texto do modelo sozinho não fecha uma missão: a conclusão exige evidência compatível com a definição de pronto.",
  },
  {
    q: "Como funcionam os conectores?",
    a: "Conectores ligam contas externas (começando pelo GitHub) com estados claros: desconectado, autorizando, conectado, reconectar ou erro. O token fica criptografado no servidor. Só com status conectado o Executor pode chamar tools daquela conta.",
  },
  {
    q: "Posso interromper uma missão?",
    a: "Sim. Use parar missão na interface de execução. O estado passa a CANCELLED (terminal). Não reescreve evidência já gravada.",
  },
  {
    q: "Modo offline faz o quê?",
    a: "Preferência de modelo local (quando disponível no dispositivo). Missões e conta continuam no servidor quando há rede. Offline não substitui conectores que dependem de OAuth na nuvem.",
  },
  {
    q: "Onde gerencio privacidade e dados?",
    a: "Em Configurações → Privacidade: exportação local, limpeza de cache neste dispositivo e saída de conta. A Política de Privacidade descreve o tratamento de dados pessoais.",
  },
  {
    q: "A Central de ajuda terá um assistente?",
    a: "A estrutura está pronta para respostas orientadas a perguntas frequentes. Um assistente de suporte no app, restrito a tópicos de produto Plutão, pode ser ligado em versão futura sem misturar com a execução de missões.",
  },
] as const;

export default function AjudaPage() {
  return (
    <DocShell title="Central de ajuda" updated="2026-09-18">
      <p>
        Este espaço explica como o Plutão organiza trabalho: missões, plano, evidência e
        conectores. Não é um manual genérico de “assistente” — é o mapa do sistema que você
        está usando.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">Começar</h2>
      <ol className="list-decimal pl-5 space-y-2">
        <li>
          Crie conta e entre em{" "}
          <Link href="/chat" className="text-[var(--selo)] hover:underline">
            Chat
          </Link>
          .
        </li>
        <li>Descreva o objetivo. Se for tarefa real, o Núcleo propõe plano e pede alinhamento.</li>
        <li>
          Acompanhe execução e evidência no painel de missão. Ajuste ou pare se necessário.
        </li>
        <li>
          Em{" "}
          <Link href="/configuracoes?tab=conectores" className="text-[var(--selo)] hover:underline">
            Configurações → Conectores
          </Link>
          , ligue GitHub quando precisar de repositórios, issues ou actions na missão.
        </li>
      </ol>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-4">Perguntas frequentes</h2>
      <div className="space-y-4">
        {FAQ.map((item) => (
          <div
            key={item.q}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{item.q}</h3>
            <p className="mt-2 text-[var(--text-secondary)]">{item.a}</p>
          </div>
        ))}
      </div>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-4">Documentos</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <Link href="/legal/termos" className="text-[var(--selo)] hover:underline">
            Termos de uso
          </Link>
        </li>
        <li>
          <Link href="/legal/privacidade" className="text-[var(--selo)] hover:underline">
            Política de Privacidade
          </Link>
        </li>
        <li>
          <Link href="/legal/licencas" className="text-[var(--selo)] hover:underline">
            Licenças de software
          </Link>
        </li>
      </ul>

      <p className="text-[11px] text-[var(--text-muted)] pt-4">
        Dúvidas de conta ou exclusão de dados: use Configurações → Privacidade ou o canal de
        contato indicado nos Termos quando publicado pelo operador do serviço.
      </p>
    </DocShell>
  );
}
