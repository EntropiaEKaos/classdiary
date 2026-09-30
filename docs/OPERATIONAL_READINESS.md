# Política operacional de backup, restore e readiness

## Objetivo

Este documento define a preparação mínima antes de promover o ClassDiary para produção.

## Backup

A estratégia definitiva depende do provedor de PostgreSQL e do armazenamento de arquivos escolhido no ambiente de produção.

Requisitos mínimos:

- backup automático do banco de dados;
- retenção compatível com o plano operacional;
- snapshot antes de migrations destrutivas;
- backups de arquivos/media quando o storage definitivo estiver habilitado;
- registro periódico da verificação no painel **Readiness operacional**;
- nunca considerar um backup válido apenas porque o job do provedor afirma ter terminado.

## Verificação de backup

Cada verificação deve registrar:

- tipo: DATABASE, FILES ou FULL;
- provedor;
- referência do snapshot/backup;
- status VERIFIED, PARTIAL ou FAILED;
- observação/evidência.

## Restore drill

Um backup só é considerado operacionalmente confiável depois de um restore drill em ambiente isolado.

O teste deve confirmar:

1. restauração do banco sem sobrescrever produção;
2. inicialização da aplicação contra a cópia restaurada;
3. integridade das principais tabelas;
4. autenticação;
5. leitura de dados acadêmicos e financeiros;
6. consistência de relações Prisma;
7. RTO observado;
8. RPO observado;
9. registro do resultado no ClassDiary.

Nunca executar restore drill diretamente sobre o banco de produção.

## RTO e RPO

Antes do lançamento comercial, a operação deve definir:

- RTO: tempo máximo aceitável para restaurar o serviço;
- RPO: perda máxima aceitável de dados entre o último backup e uma falha.

Os valores medidos devem ser registrados em cada RestoreDrill.

## Health probes

- `/api/health/live`: confirma que o processo HTTP está respondendo.
- `/api/health/ready`: confirma acesso ao PostgreSQL e consultas básicas do modelo.
- `/api/health`: healthcheck legado compatível.

Nenhum endpoint de health expõe segredos ou strings de conexão.

## Incidentes

Incidentes devem registrar:

- severidade;
- serviço afetado;
- início;
- descrição/impacto;
- resolução;
- responsável pela resolução;
- horário de encerramento.

Incidente CRITICAL aberto deve bloquear promoção para produção até resolução ou aceite explícito de risco.

## Checklist de lançamento

Itens obrigatórios recomendados:

- DB_BASELINE: baseline de migrations versionada e validada;
- DB_MIGRATE_STAGING: `prisma migrate deploy` validado em staging;
- BACKUP_POLICY: política de backup configurada no provedor;
- RESTORE_DRILL: restore drill concluído com dados verificados;
- HEALTH_READY: readiness probe validado;
- SECURITY_HEADERS: headers/CSP/HSTS validados;
- PRIVACY_CENTER: fluxos de privacidade validados;
- E2E_CRITICAL: testes E2E dos fluxos críticos;
- OBSERVABILITY: coleta de erros/logs e alertas configurada;
- RUNBOOK: procedimento de incidente e rollback documentado.

## Regra de promoção

Não promover para produção enquanto existir item obrigatório do checklist em PENDING, IN_PROGRESS ou BLOCKED.

A confirmação final deve sempre usar o mesmo SHA que passou nos gates de CI e nos testes de staging.
