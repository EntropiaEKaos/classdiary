export async function retrySerializable<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";

      if (code !== "P2034" || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw lastError;
}
