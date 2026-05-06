// server.js - minimal backend for Render health checks and static serve
// Only used by Render (server). Keeps a lightweight express server with /healthz.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from repo root (frontend build / static files)
app.use(express.static(path.join(__dirname, '/')));

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Simple landing to confirm server is running
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Expose healthz.html for Vercel-style checks too
app.get('/healthz.html', (req, res) => res.sendFile(path.join(__dirname, 'healthz.html')));

app.listen(PORT, () => {
  console.log(`[Server] Money Tracker backend listening on port ${PORT} (health: /healthz)`);
});
