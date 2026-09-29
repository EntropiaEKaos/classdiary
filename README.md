# ClassDiary

SaaS de diário de classe e gestão escolar online, pensado para escolas, cursos e redes de ensino.

## Fundação atual

- Next.js 16 (App Router)
- React 19 + TypeScript
- PostgreSQL
- Prisma ORM 7
- Arquitetura multi-tenant por organização
- Perfis: proprietário da plataforma, admin escolar, coordenação, professor, secretaria, responsável e aluno
- Modelos para turmas, disciplinas, matrículas, aulas, frequência, notas, comunicados, assinatura e auditoria
- Landing page e dashboard inicial responsivos
- Endpoint de health check em `/api/health`
- Pronto para deploy na Vercel

## Desenvolvimento

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:push
npm run dev
```

Abra `http://localhost:3000`.

## Variáveis de ambiente

- `DATABASE_URL`: conexão PostgreSQL
- `AUTH_SECRET`: segredo de autenticação
- `NEXT_PUBLIC_APP_URL`: URL pública da aplicação

## Vercel

1. Importe `EntropiaEKaos/classdiary` na Vercel.
2. Configure as variáveis de ambiente.
3. Use Node.js 22.
4. O framework deve ser detectado automaticamente como Next.js.
5. Após configurar o banco, aplique as migrations antes de promover para produção.

## Roadmap

1. Autenticação + onboarding da escola.
2. RBAC completo e isolamento de tenant.
3. CRUDs de alunos, turmas, disciplinas e equipe.
4. Diário do professor com chamada e conteúdo.
5. Avaliações, notas, médias e boletim.
6. Portal do aluno/responsável.
7. Calendário acadêmico e comunicados.
8. Assinaturas e cobrança SaaS.
9. PWA, notificações e relatórios.
10. Auditoria, observabilidade, backups e hardening de produção.
