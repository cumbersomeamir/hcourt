type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type Gpt5NanoInput = {
  messages: ChatMessage[];
  maxCompletionTokens?: number;
};

function normalizeAzureBaseEndpoint(rawValue?: string | null) {
  const value = String(rawValue || '').trim().replace(/\/+$/, '');
  if (!value) return '';

  if (value.includes('/openai/v1')) {
    return value;
  }

  if (value.includes('.openai.azure.com')) {
    return `${value}/openai/v1`;
  }

  if (value.includes('.cognitiveservices.azure.com')) {
    return value
      .replace('.cognitiveservices.azure.com', '.openai.azure.com')
      .concat('/openai/v1');
  }

  return value;
}

function getAzureOpenAiV1Base() {
  const explicitBase = normalizeAzureBaseEndpoint(process.env.AZURE_OPENAI_V1_BASE);
  if (explicitBase) return explicitBase;

  const inferredBase = normalizeAzureBaseEndpoint(process.env.AZURE_BASE_ENDPOINT);
  if (inferredBase) return inferredBase;

  throw new Error(
    'Missing Azure GPT-5 Nano configuration. Set AZURE_OPENAI_V1_BASE or AZURE_BASE_ENDPOINT.'
  );
}

function getAzureApiKey() {
  const apiKey = process.env.AZURE_COGNITIVE_KEY || process.env.AZURE_API_KEY || '';
  if (!apiKey) {
    throw new Error(
      'Missing Azure GPT-5 Nano API key. Set AZURE_COGNITIVE_KEY or AZURE_API_KEY.'
    );
  }
  return apiKey;
}

export async function runGpt5Nano(input: Gpt5NanoInput): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${getAzureOpenAiV1Base()}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAzureApiKey()}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages: input.messages,
        max_completion_tokens: input.maxCompletionTokens || 1600,
      }),
      cache: 'no-store',
    });

    const payload = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    };

    if (!response.ok) {
      throw new Error(payload.error?.message || `GPT-5 Nano request failed with ${response.status}`);
    }

    const firstChoice = payload.choices?.[0];
    const content = firstChoice?.message?.content?.trim();
    if (!content) {
      if (
        firstChoice?.finish_reason === 'length' &&
        (input.maxCompletionTokens || 1600) < 4000
      ) {
        return runGpt5Nano({
          ...input,
          maxCompletionTokens: Math.max((input.maxCompletionTokens || 1600) * 2, 4000),
        });
      }
      throw new Error('GPT-5 Nano returned an empty response.');
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}
