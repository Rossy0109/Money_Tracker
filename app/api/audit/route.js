import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

// Initialize the Google provider with the API key from environment variables
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        console.warn("[AI API] GOOGLE_GENERATIVE_AI_API_KEY is missing.");
        return new Response(JSON.stringify({ 
            error: 'AI assistant is not configured. Please set the GOOGLE_GENERATIVE_AI_API_KEY environment variable.' 
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
    }

    const { transactions, query } = await req.json();
    
    // Simple summary to keep token usage low
    const totalAmount = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const summary = {
      count: transactions.length,
      totalAmount,
      recent: transactions.slice(0, 10) // Contextual data
    };

    const systemPrompt = `You are a professional Financial Controller. Your goal is to audit project performance with precision.
    Focus on profit leaks, budget variances, and cash flow stability. Maintain a professional, concise tone. 
    Current User Data: ${JSON.stringify(summary)}`;

    const result = await streamText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      prompt: query,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[AI API Error]:", error);
    return new Response(JSON.stringify({ error: 'Failed to process AI audit.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
