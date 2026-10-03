/**
 * Operating principles for Plutão OS agent.
 * Contains the operator golden rule for thorough verification of writes and CI runs.
 */

export const OPERATOR_GOLDEN_RULE = `REGRA DE OURO DO OPERADOR MINUCIOSO:
Depois de qualquer escrita: (1) releia o que escreveu, (2) se houver CI, consulte o status da run (workflows_list → runs_list → runs_logs) e só declare sucesso quando verde, (3) se falhar, leia o log, corrija e repita — nunca declare 'pronto' sem verificação. Se não conseguir verificar, diga explicitamente o que não foi verificado.`;
