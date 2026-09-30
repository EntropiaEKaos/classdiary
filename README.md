# ClassDiary

SaaS multi-tenant de diário de classe e gestão escolar online para escolas, cursos e redes de ensino.

## Stack

- Next.js 16 / React 19 / TypeScript
- PostgreSQL
- Prisma ORM 7 + `@prisma/adapter-pg`
- Sessões persistidas em banco com cookie HttpOnly
- RBAC por instituição
- Deploy alvo: Vercel

## Módulos atuais

- Super Admin SaaS
- Onboarding de escola
- Usuários, convites e papéis
- Alunos, professores, turmas e matrículas
- Disciplinas e alocação docente
- Diário de classe
- Frequência
- Atividades e entregas
- Notas ponderadas
- Recuperação
- Fechamento de período
- Boletins e PDF
- Conselho de classe
- Ocorrências
- Calendário acadêmico
- Comunicados
- Histórico escolar
- Documentos
- Portal do professor
- Portal do aluno
- Portal da família
- Planos Starter / Pro / Enterprise
- Auditoria
- Health/readiness em `/api/health`

## Documentação comercial

- [PDF comercial - funcionalidades implementadas](docs/ClassDiary_Documentacao_Comercial.pdf)
- O PDF é regenerável pelo workflow `Generate Commercial PDF` a partir de `scripts/generate_commercial_pdf.py`.

## Desenvolvimento

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run seed
npm run dev
```

## Checagem completa

```bash
npm run check
```

Executa geração do Prisma, typecheck, lint e build de produção.

## Variáveis de ambiente

Obrigatórias:

- `DATABASE_URL` — conexão PostgreSQL.
- `ADMIN_BOOTSTRAP_TOKEN` — token longo usado somente no bootstrap inicial.
- `NEXT_PUBLIC_APP_URL` — URL pública do ambiente.

Opcionais para seed local:

- `SEED_OWNER_EMAIL`
- `SEED_OWNER_PASSWORD`

Nunca use as credenciais padrão do seed em produção.

## Primeiro acesso

1. Configure o PostgreSQL.
2. Gere/aplique o schema.
3. Use `/api/bootstrap` uma única vez ou o seed somente em ambiente de teste.
4. Entre em `/login`.
5. Crie a escola no onboarding.
6. Cadastre equipe, turmas, disciplinas e alunos.

## Vercel

O repositório deve ser importado como um projeto próprio: `EntropiaEKaos/classdiary`.

Configuração:

- Framework: Next.js
- Node.js: 22
- Build: `npm run build`
- `DATABASE_URL`, `ADMIN_BOOTSTRAP_TOKEN` e `NEXT_PUBLIC_APP_URL` configuradas por ambiente
- validar `/api/health` antes de promover qualquer preview

O projeto ClassDiary deve permanecer independente de outros projetos Vercel.

## CI

O workflow em `.github/workflows/ci.yml` roda:

- instalação
- Prisma generate
- typecheck
- lint
- build

Também existe `workflow_dispatch` para execução manual.

## Segurança implementada

- bcrypt cost 12
- sessão aleatória persistida somente por hash
- cookie HttpOnly / SameSite=Lax / Secure em produção
- RBAC em mutações críticas
- isolamento por organizationId
- convites de uso único com expiração
- auditoria de ações críticas
- headers HTTP defensivos
- bloqueio de notas após fechamento de período
- autorização específica para boletim PDF
- healthcheck de banco

## Antes de produção

Ainda devem ser concluídos/certificados:

1. migration inicial versionada com banco definitivo;
2. execução verde do CI;
3. banco de preview;
4. preview Vercel;
5. testes E2E do fluxo crítico;
6. revisão de LGPD e política de retenção;
7. backups e observabilidade;
8. cobrança recorrente integrada a um gateway real.

Não promover para produção sem estes gates.
