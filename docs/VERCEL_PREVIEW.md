# EduSync — Checklist de Preview Vercel

## 1. Banco

Criar um PostgreSQL exclusivo para o EduSync e obter uma `DATABASE_URL`.

Não reutilizar banco de outro projeto.

## 2. Projeto Vercel

Criar/importar um projeto separado usando:

- Repository: `EntropiaEKaos/classdiary`
- Framework: Next.js
- Node.js: 22
- Build command: `npm run build`

## 3. Variáveis

Preview:

- `DATABASE_URL`
- `ADMIN_BOOTSTRAP_TOKEN`
- `NEXT_PUBLIC_APP_URL`

Produção deverá usar valores diferentes de preview.

## 4. Banco antes do preview

Enquanto a migration inicial ainda não estiver certificada, o ambiente de desenvolvimento pode usar:

```bash
npm run db:push
```

Para produção, usar migrations versionadas e `npm run db:migrate`.

## 5. Gate obrigatório

Executar:

```bash
npm run check
```

Depois validar:

- `GET /api/health` retorna HTTP 200 e `database: "ok"`
- login
- onboarding
- criação de aluno
- criação de turma
- matrícula
- disciplina/professor
- aula
- chamada
- nota
- boletim
- PDF
- convite
- portal aluno
- portal família
- Super Admin

## 6. Promoção

Primeiro preview. Produção somente após o mesmo artefato aprovado nos testes.
