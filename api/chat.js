import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { messages, userId } = req.body;

  const result = await streamText({
    model: google('gemini-1.5-flash'),
    messages,
    tools: {
      getTransactions: tool({
        description: 'Get recent transactions for the user',
        parameters: z.object({ limit: z.number().default(10) }),
        execute: async ({ limit }) => {
          const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('occurred_at', { ascending: false })
            .limit(limit);
          if (error) throw error;
          return data;
        },
      }),
      getBalances: tool({
        description: 'Get total balance across all accounts',
        parameters: z.object({}),
        execute: async () => {
          const { data, error } = await supabase
            .from('accounts')
            .select('balance')
            .eq('user_id', userId);
          if (error) throw error;
          return data.reduce((acc, curr) => acc + curr.balance, 0);
        },
      }),
    },
  });

  return result.pipeTextStreamToResponse(res);
}
