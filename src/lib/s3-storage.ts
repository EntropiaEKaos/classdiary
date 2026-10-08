import { createHash, createHmac, randomUUID } from "node:crypto";


function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function encodePath(key: string) {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function iso8601(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function getConfig() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1";

  if (!accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("S3 não configurado. Defina AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e S3_BUCKET.");
  }

  return { accessKeyId, secretAccessKey, sessionToken, bucket, region };
}

export function safeStorageName(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);

  return normalized || "arquivo";
}

export function buildStorageKey(params: {
  organizationId: string;
  category: string;
  entityType?: string | null;
  entityId?: string | null;
  originalName: string;
}) {
  const category = params.category.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "document";
  const entity = params.entityType
    ? params.entityType.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
    : "general";
  const id = params.entityId?.replace(/[^a-zA-Z0-9_-]/g, "_") || "unlinked";

  return [
    params.organizationId,
    category,
    entity,
    id,
    randomUUID() + "-" + safeStorageName(params.originalName),
  ].join("/");
}

function presign(params: {
  method: "GET" | "PUT";
  key: string;
  expiresIn: number;
}) {
  const { accessKeyId, secretAccessKey, sessionToken, bucket, region } = getConfig();
  const now = new Date();
  const amzDate = iso8601(now);
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalUri = "/" + encodePath(params.key);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const query = new URLSearchParams();
  query.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  query.set("X-Amz-Credential", `${accessKeyId}/${credentialScope}`);
  query.set("X-Amz-Date", amzDate);
  query.set("X-Amz-Expires", String(params.expiresIn));
  query.set("X-Amz-SignedHeaders", "host");
  if (sessionToken) query.set("X-Amz-Security-Token", sessionToken);

  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function presignPutObject(key: string, expiresIn = 900) {
  return presign({ method: "PUT", key, expiresIn });
}

export function presignGetObject(key: string, expiresIn = 300) {
  return presign({ method: "GET", key, expiresIn });
}

export function s3Configured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      process.env.S3_BUCKET?.trim(),
  );
}
