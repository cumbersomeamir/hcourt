/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Generate a unique key for a change to prevent duplicates
 */
export function generateChangeKey(
  courtNo: string,
  changeType: string,
  caseNumber?: string,
  timestamp?: Date
): string {
  const timeWindow = timestamp ? Math.floor(timestamp.getTime() / 60000) : Math.floor(Date.now() / 60000);
  return `${courtNo}:${changeType}:${caseNumber || 'none'}:${timeWindow}`;
}

