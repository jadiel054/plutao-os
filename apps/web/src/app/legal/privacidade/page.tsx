import type { Metadata } from "next";
import Link from "next/link";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o Plutão trata dados pessoais (LGPD).",
};

export default function PrivacidadePage() {
  return (
    <DocShell title="Política de Privacidade" updated="2026-09-18">
      <p>
        Esta política descreve como o <strong className="text-[var(--text-primary)]">Plutão</strong>{" "}
        trata dados pessoais no Brasil, em alinhamento com a Lei Geral de Proteção de Dados
        (LGPD — Lei nº 13.709/2018). Texto próprio do produto; não é modelo genérico de
        terceiros.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">1. Controlador</h2>
      <p>
        O operador do serviço Plutão é o controlador dos dados pessoais processados na
        plataforma. Contato para privacidade será publicado nesta página e em Configurações →
        Sobre quando o canal oficial estiver definido.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">2. Dados que tratamos</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong className="text-[var(--text-primary)]">Conta:</strong> e-mail, hash de senha,
          identificadores de sessão.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Uso do produto:</strong> missões, planos,
          mensagens de chat vinculadas à conta, evidências, artefatos, preferências (tema, modo
          de modelo, notificações locais).
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Conectores:</strong> identificador da conta
          externa (ex.: login GitHub), escopos autorizados, tokens de acesso criptografados no
          servidor, status da conexão. Não armazenamos a senha do provedor externo.
        </li>
        <li>
          <strong className="text-[var(--text-primary)]">Técnicos:</strong> logs de erro e métricas
          mínimas de disponibilidade, quando necessários à operação.
        </li>
      </ul>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">3. Finalidades e bases</h2>
      <p>Tratamos dados para:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>executar o contrato de uso (conta, missões, tools, interface);</li>
        <li>segurança, prevenção a abuso e integridade do sistema;</li>
        <li>cumprir obrigação legal quando aplicável;</li>
        <li>melhorar estabilidade do serviço com base em eventos técnicos agregados.</li>
      </ul>
      <p>
        Bases típicas: execução de contrato (art. 7º, V), legítimo interesse com salvaguardas
        (art. 7º, IX) e consentimento quando exigido (ex.: alguns conectores ou comunicações
        opcionais).
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">4. Modelos e execução</h2>
      <p>
        Para gerar respostas e planejar passos, o conteúdo relevante da conversa ou da missão
        pode ser enviado ao provedor de modelo configurado no ambiente (nuvem) ou processado
        localmente no seu dispositivo (modo offline, quando disponível). Esse envio é necessário
        à função do produto. Não vendemos o conteúdo das suas missões.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">5. Compartilhamento</h2>
      <p>Compartilhamos dados apenas com:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>infraestrutura de hospedagem e banco (processadores sob instrução);</li>
        <li>provedor de modelo, na medida do necessário para a inferência;</li>
        <li>provedores de conectores, quando você autoriza o OAuth e as tools usam a API deles;</li>
        <li>autoridades, quando houver obrigação legal válida.</li>
      </ul>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">6. Retenção e segurança</h2>
      <p>
        Mantemos dados enquanto a conta existir e pelo tempo necessário às finalidades acima ou
        a prazos legais. Tokens de conector são criptografados em repouso na aplicação. Sessões
        usam cookies HTTP-only. Nenhum sistema é risco zero; reportamos incidentes relevantes
        conforme a LGPD.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">7. Seus direitos</h2>
      <p>
        Nos termos da LGPD, você pode solicitar confirmação de tratamento, acesso, correção,
        anonimização, portabilidade, eliminação de dados desnecessários, informação sobre
        compartilhamentos e revogação de consentimento. No produto: exportação parcial e limpeza
        de cache local em Configurações → Privacidade; desconexão de conectores a qualquer
        momento. Demais pedidos: canal do controlador.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">8. Crianças</h2>
      <p>
        O serviço não se destina a menores de 18 anos sem representação legal adequada. Não
        coletamos intencionalmente dados de crianças.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">9. Alterações</h2>
      <p>
        Alterações relevantes serão publicadas nesta página com nova data. O uso continuado após
        a publicação indica ciência da versão vigente.
      </p>

      <p className="pt-2 text-[11px] text-[var(--text-muted)]">
        Ver também{" "}
        <Link href="/legal/termos" className="text-[var(--selo)] hover:underline">
          Termos de uso
        </Link>
        .
      </p>
    </DocShell>
  );
}
