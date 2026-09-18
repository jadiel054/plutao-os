import type { Metadata } from "next";
import Link from "next/link";
import { DocShell } from "@/components/DocShell";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Termos de uso do serviço Plutão.",
};

export default function TermosPage() {
  return (
    <DocShell title="Termos de uso" updated="2026-09-18">
      <p>
        Estes Termos regem o uso do <strong className="text-[var(--text-primary)]">Plutão</strong>,
        sistema operacional de trabalho pessoal orientado a missões, evidência e execução com
        ferramentas. Ao criar conta ou usar o serviço, você concorda com estas regras.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">1. O serviço</h2>
      <p>
        O Plutão oferece interface web (e, no futuro, outros clientes) para planejar e executar
        missões, registrar evidências, anexar artefatos e, quando você autorizar, conectar
        serviços externos (por exemplo, repositórios de código). O produto evolui; funções em
        desenvolvimento podem estar limitadas ou indisponíveis.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">2. Conta e elegibilidade</h2>
      <p>
        Você é responsável pela veracidade dos dados de cadastro, pela guarda das credenciais e
        por toda atividade na conta. Não compartilhe sessão. Se suspeitar de acesso indevido,
        encerre sessões e altere a senha assim que o fluxo de recuperação estiver disponível.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">3. Uso aceitável</h2>
      <p>É proibido usar o Plutão para:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>violar lei aplicável, direitos de terceiros ou contratos de serviços conectados;</li>
        <li>tentar contornar autenticação, isolamento entre contas ou limites técnicos;</li>
        <li>carregar malware, conteúdo ilícito ou dados que você não tem direito de processar;</li>
        <li>abusar de infraestrutura (carga artificial, scraping agressivo, ataques).</li>
      </ul>
      <p>
        Missões e tools executam ações que você autoriza (incluindo, se conectado, leitura de
        dados em contas externas). Você permanece responsável pelo conteúdo e pelos efeitos dessas
        ações.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">4. Conteúdo e evidência</h2>
      <p>
        Você conserva direitos sobre o material que envia. Concede ao operador do serviço a
        licença necessária apenas para hospedar, processar e exibir esse material no âmbito do
        Plutão. Evidências e artefatos fazem parte do histórico da missão e podem ser retidos
        conforme a Política de Privacidade e obrigações legais.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">5. Conectores</h2>
      <p>
        Conectores usam autorização que você inicia (OAuth ou equivalente). Escopos e capacidades
        ficam visíveis no produto. Você pode desconectar a qualquer momento; isso remove o token
        armazenado no Plutão, sem necessariamente revogar o app no provedor externo — faça isso
        também no painel do provedor se desejar.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">6. Disponibilidade e isenções</h2>
      <p>
        O serviço é oferecido “como está”, com esforço razoável de disponibilidade. Não há
        garantia de resultado específico de uma missão, de ausência de interrupção ou de
        compatibilidade com todo hardware ou navegador. Modelos de linguagem podem errar; a
        evidência e a verificação existem para reduzir, não eliminar, esse risco.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">7. Limitação de responsabilidade</h2>
      <p>
        Na medida permitida pela lei brasileira, o operador não responde por danos indiretos,
        lucros cessantes ou perda de dados decorrentes do uso ou da impossibilidade de uso do
        serviço, salvo dolo ou culpa grave. Em qualquer caso, a responsabilidade agregada fica
        limitada ao que você tiver pago pelo serviço nos doze meses anteriores ao evento, se
        houver cobrança.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">8. Alterações e rescisão</h2>
      <p>
        Podemos atualizar estes Termos com data visível nesta página. Uso continuado após a
        alteração constitui aceitação. Podemos suspender ou encerrar contas que violem estes
        Termos. Você pode deixar de usar o serviço a qualquer momento; exclusão completa de dados
        segue a Política de Privacidade.
      </p>

      <h2 className="text-base font-semibold text-[var(--text-primary)] pt-2">9. Lei aplicável</h2>
      <p>
        Aplica-se a legislação da República Federativa do Brasil. Foro da comarca do domicílio do
        usuário consumidor, quando a lei do consumidor assim determinar.
      </p>

      <p className="pt-2 text-[11px] text-[var(--text-muted)]">
        Ver também{" "}
        <Link href="/legal/privacidade" className="text-[var(--selo)] hover:underline">
          Política de Privacidade
        </Link>
        .
      </p>
    </DocShell>
  );
}
