import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "prisma", "migrations");

if (!existsSync(dir)) {
  console.error("ERRO: prisma/migrations não existe. Baseline de produção ainda não foi criado.");
  process.exit(1);
}

const migrations = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(dir, name, "migration.sql")));

if (!migrations.length) {
  console.error("ERRO: nenhuma migration.sql encontrada. Não execute migrate deploy em produção.");
  process.exit(1);
}

console.log("Baseline/migrations encontradas: " + migrations.length);
