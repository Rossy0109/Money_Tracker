import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

const ai = genkit({
  plugins: [googleAI()],
});

export const analyzeExpenses = ai.defineFlow(
  {
    name: "analyzeExpenses",
    inputSchema: z.object({
      transactions: z.array(z.any()),
      budgets: z.array(z.any()),
    }),
    outputSchema: z.object({
        analysis: z.string().describe("Concise financial analysis"),
        recommendations: z.array(z.string()).describe("3 actionable recommendations"),
    }),
  },
  async (input) => {
    const prompt = `
      You are a professional financial advisor. Analyze the following transactions and budgets:
      Transactions: ${JSON.stringify(input.transactions)}
      Budgets: ${JSON.stringify(input.budgets)}
      
      Provide a concise financial analysis and 3 actionable recommendations.
    `;
    const response = await ai.generate({
      prompt,
      model: "googleai/gemini-1.5-flash",
      output: { schema: analyzeExpenses.outputSchema }
    });
    return response.output();
  }
);
