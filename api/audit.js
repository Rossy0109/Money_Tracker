import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { messages, userId } = req.body;
  
  try {
    const result = await generateText({
      model: google('gemini-2.0-flash'),
      messages: messages,
    });
    res.status(200).json({ content: result.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process AI audit.' });
  }
}
