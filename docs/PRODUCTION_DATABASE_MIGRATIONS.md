# Migrações de banco para produção

O ClassDiary ainda está em fase de evolução rápida e, até este ponto, o ambiente de desenvolvimento/CI usa `prisma db push`.

## Estado atual

- O schema Prisma é a fonte de verdade.
- Ainda não existe uma baseline versionada em `prisma/migrations`.
- Por segurança, `npm run db:migrate` será um gate: ele falha se não existir pelo menos uma migration real.
- **Não executar `prisma migrate deploy` em produção antes de criar e validar a baseline.**

## Processo obrigatório antes do primeiro deploy de banco

1. Congelar temporariamente mudanças de schema.
2. Criar uma cópia isolada do banco alvo ou um banco de staging vazio.
3. Gerar uma migration baseline equivalente ao schema atual.
4. Revisar manualmente o SQL gerado, principalmente:
   - FKs e `onDelete`;
   - índices/uniques;
   - campos Decimal;
   - enums/status;
   - novas relações opcionais;
   - tabelas financeiras;
   - tabelas de autenticação/sessão;
   - `LoginThrottle`.
5. Aplicar a baseline em um banco vazio com `prisma migrate deploy`.
6. Rodar:
   - `prisma validate`
   - `prisma migrate status`
   - seed somente em ambiente descartável/staging
   - typecheck
   - lint
   - build
7. Comparar schema resultante com o schema esperado.
8. Se já existir um banco real criado por `db push`, **não reaplicar o SQL baseline nele**. Marcar a baseline como aplicada apenas depois de confirmar que o banco existente corresponde ao schema da baseline.
9. A partir daí, toda mudança de schema deve gerar uma nova migration versionada e revisada.

## Política depois da baseline

Desenvolvimento:
- alterar `prisma/schema.prisma`
- gerar migration com nome descritivo
- revisar SQL
- commitar schema + migration juntos

CI:
- criar PostgreSQL limpo
- executar `prisma migrate deploy`
- executar seed de teste
- typecheck
- lint
- build

Produção:
- backup/snapshot antes de migrations destrutivas
- executar somente `prisma migrate deploy`
- nunca usar `prisma db push`
- nunca usar `prisma migrate reset`
- nunca apagar migration já aplicada
- para mudanças destrutivas, usar estratégia expand/contract em mais de um deploy

## Mudanças destrutivas

Para renomear/remover coluna ou relação:
1. adicionar a estrutura nova sem remover a antiga;
2. publicar código compatível com ambas;
3. migrar/backfill dos dados;
4. verificar integridade;
5. remover a estrutura antiga em migration posterior.

Isso evita downtime e perda de dados.

## Gate atual

Enquanto não existir `prisma/migrations/<baseline>/migration.sql`, o comando:

`npm run db:migrate`

deve falhar propositalmente.

Isso é intencional.
