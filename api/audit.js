import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

function summarizeData(data) {
  // Simple summary to keep token usage low
  const total = data.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return {
    count: data.length,
    totalAmount: total,
    recent: data.slice(-5) // Send only last 5 for context
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { messages, projectData, projectTargets } = req.body;
  
  try {
    const summary = summarizeData(projectData);
    const systemPrompt = `You are a professional Financial Controller. Your goal is to audit project performance with precision.
    Focus on profit leaks, budget variances, and cash flow stability. Maintain a professional, concise tone.`;

    const result = await streamText({
      model: google('gemini-2.0-flash'),
      system: systemPrompt,
      messages: [
        ...messages,
        {
          role: 'user',
          content: `Project Summary: ${JSON.stringify(summary)}. Targets: ${JSON.stringify(projectTargets)}`
        }
      ],
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    for await (const textPart of result.textStream) {
      res.write(textPart);
    }
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process AI audit.' });
  }
}
