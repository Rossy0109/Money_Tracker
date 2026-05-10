// server.js - minimal backend for Render health checks and static serve
// Only used by Render (server). Keeps a lightweight express server with /healthz.

const express = require('express');
const path = require('path');
const { analyzeExpenses } = require('./src/ai/genkit.ts');
const admin = require('./firebase-admin.js'); // Assuming I can import this

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.post('/api/ai/analyze', async (req, res) => {
    try {
        // Simple routing: if 'deep' analysis is requested, route to Python service
        if (req.body.type === 'deep') {
            const response = await fetch('http://localhost:8000/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });
            const result = await response.json();
            res.json(result);
        } else {
            // Default to Node.js Genkit flow
            const result = await analyzeExpenses(req.body);
            
            // Persistence: save to AI Studio database
            if (admin) {
                const db = admin.firestore();
                const aiDb = db.database('ai-studio-19d62b16-ab1c-4508-9f82-a97bbc9a8310');
                await aiDb.collection('insights').add({
                    analysis: result.analysis,
                    recommendations: result.recommendations,
                    timestamp: new Date(),
                    userId: req.body.userId || 'anonymous'
                });
            }
            res.json(result);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve static files from repo root (frontend build / static files)
app.use(express.static(path.join(__dirname, '/')));

// Health check endpoint
app.get(['/healthz', '/api/health'], (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Simple landing to confirm server is running
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Expose healthz.html for Vercel-style checks too
app.get('/healthz.html', (req, res) => res.sendFile(path.join(__dirname, 'healthz.html')));

app.listen(PORT, () => {
  console.log(`[Server] Money Tracker backend listening on port ${PORT} (health: /healthz)`);
});
