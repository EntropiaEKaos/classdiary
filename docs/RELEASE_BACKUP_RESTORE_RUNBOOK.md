# ClassDiary — Runbook de release, backup e recuperação

Este documento descreve o procedimento operacional mínimo antes de publicar uma versão do ClassDiary. Ele complementa o painel `/dashboard/readiness` e não substitui políticas internas, revisão jurídica ou procedimentos do provedor de infraestrutura.

## 1. Gate de release

Uma publicação deve permanecer bloqueada enquanto qualquer controle objetivo do painel de readiness estiver pendente. O gate automático verifica, entre outros pontos:

- backup com status `VERIFIED` nas últimas 24 horas;
- restore drill `SUCCESS`, com dados verificados, nos últimos 30 dias;
- categorias internas de retenção cadastradas;
- billing configurado e assinatura externa vinculada quando aplicável;
- ausência de incidente crítico aberto.

Além do gate automático, o checklist manual deve registrar evidências de migrations, segurança, observabilidade e operação.

## 2. Backup

Nunca grave credenciais no repositório. Use a URL de banco fornecida pelo ambiente seguro do provedor.

Exemplo PostgreSQL:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="classdiary-$(date +%Y%m%d-%H%M).dump"
```

Depois de gerar o backup:

1. verifique se o arquivo existe e possui tamanho plausível;
2. armazene-o em destino protegido e versionado;
3. registre a referência/snapshot no painel Readiness;
4. marque `VERIFIED` somente depois de validar o artefato.

## 3. Restore drill

Execute restore apenas em banco isolado de teste/staging.

```bash
createdb classdiary_restore_test
pg_restore \
  --no-owner \
  --no-privileges \
  --dbname="postgresql://.../classdiary_restore_test" \
  classdiary-YYYYMMDD-HHMM.dump
```

Depois:

1. execute `npx prisma migrate status`;
2. confira organizações, usuários, matrículas e dados financeiros de amostra;
3. execute smoke tests e endpoints de health;
4. registre RTO, RPO, resultado e confirmação de integridade no painel;
5. elimine com segurança o banco temporário conforme a política interna.

## 4. Banco e migrations

Antes de release:

```bash
npm run db:validate
npm run db:migrate:status
npm run db:migrate:deploy
```

Nunca aplique `prisma db push` em produção como substituto das migrations versionadas.

## 5. Aplicação

A sequência mínima de certificação é:

```bash
npm run security:actions
npm run typecheck
npm run lint
npm run build
npm run e2e
```

Um novo commit invalida a certificação anterior. O release deve usar exatamente o SHA que passou pelos gates.

## 6. Health e observabilidade

Validar:

- `/api/health/live` — processo respondendo;
- `/api/health/ready` — banco e aplicação prontos;
- ausência de incidentes críticos abertos;
- logs sem erro recorrente após o smoke test.

## 7. Privacidade e LGPD operacional

Antes de publicação, confirme:

- portal do titular acessível;
- fluxo de solicitação de acesso/exportação/correção/anonimização/exclusão operacional;
- exportações registradas como acesso sensível;
- políticas internas de retenção preenchidas;
- dados exportados com `Cache-Control: private, no-store`;
- nenhuma credencial ou segredo incluído no export.

As regras de retenção configuradas no ClassDiary são controles internos e devem refletir as obrigações aplicáveis à organização responsável pelo tratamento.

## 8. Rollback

Se a versão nova apresentar regressão:

1. interrompa novas mudanças;
2. registre incidente;
3. reverta a aplicação para o último SHA certificado;
4. não reverta migrations destrutivamente sem plano testado;
5. restaure dados apenas quando houver perda/corrupção comprovada;
6. valide health/readiness e fluxos críticos;
7. documente causa, correção e prevenção no incidente.
