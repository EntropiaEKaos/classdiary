function isRetryableSerializationError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: unknown;
  };

  const code = String(candidate.code ?? "");
  const message = String(candidate.message ?? "").toLowerCase();
  const meta = JSON.stringify(candidate.meta ?? {}).toLowerCase();

  return (
    code === "P2034" ||
    code === "40001" ||
    message.includes("could not serialize access") ||
    message.includes("serialization failure") ||
    message.includes("concurrent update") ||
    meta.includes("could not serialize access") ||
    meta.includes("40001")
  );
}

export async function retrySerializable<T>(
  operation: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableSerializationError(error) || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }

  throw lastError;
}
