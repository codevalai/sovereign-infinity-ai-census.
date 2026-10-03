import { getOpenAIClient } from '../openai_client.js';

export async function runDot(task: { prompt: string }): Promise<string | null> {
  const response = await getOpenAIClient().chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a micro-agent. Complete exactly one task and return its result.',
      },
      { role: 'user', content: task.prompt },
    ],
  });

  return response.choices[0]?.message.content ?? null;
}