/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true with timeout and retry
 */
export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number = 30000,
  intervalMs: number = 1000,
  description: string = 'Condition'
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await condition();
      if (result) {
        return;
      }
    } catch (error) {
      // Condition check failed, will retry
      console.log(`${description} check failed, retrying...`, error);
    }

    await sleep(intervalMs);
  }

  throw new Error(`Timeout waiting for: ${description} (${timeoutMs}ms)`);
}

/**
 * Retry an operation with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Operation failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}
