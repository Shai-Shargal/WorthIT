import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAiClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

export function __resetOpenAiClientForTests(): void {
  client = null;
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
}

export function useVision(imageUrl?: string): boolean {
  return process.env.OPENAI_VISION === 'true' && Boolean(imageUrl);
}
