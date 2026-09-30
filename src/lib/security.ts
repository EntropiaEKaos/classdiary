import { headers } from "next/headers";

export async function assertTrustedMutationOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (!origin || !host) {
    throw new Error("Origem da requisição não identificada.");
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Origem da requisição inválida.");
  }

  if (originHost !== host) {
    throw new Error("Origem não autorizada.");
  }

  const fetchSite = h.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new Error("Origem não autorizada.");
  }
}
