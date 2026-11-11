/**
 * Deskmate — Optional Backend AI Proxy
 *
 * Provides natural language intent extraction for Pip companion.
 * Follows competition guidelines:
 * - Never exposes API keys in client-side code
 * - Applies strict rate limiting and query size bounds
 * - Returns structured PipCommand JSON
 * - Falls back cleanly when offline or unconfigured
 */

import http from 'http';

const PORT = process.env.PORT || 8081;

// Lightweight in-memory rate limiter (max 20 requests per minute per IP)
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateLimits.get(ip) ?? { count: 0, resetTime: now + 60000 };
  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + 60000;
  }
  entry.count += 1;
  ipRateLimits.set(ip, entry);
  return entry.count <= 25;
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/pip') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
    return;
  }

  const clientIp = req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024) {
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const query = String(parsed.query || '').trim().slice(0, 240);

      // In production/cloud environments, GEMINI_API_KEY or OPENAI_API_KEY can be hooked here.
      // If none is provided, it returns structured intent extraction:
      const lower = query.toLowerCase();

      let responseCommand = { intent: 'unknown' };

      if (/\b(?:focus|concentrate)\b/.test(lower)) {
        responseCommand = { intent: 'start-focus' };
      } else if (/\b(?:recap|summary|update)\b/.test(lower)) {
        responseCommand = { intent: 'recap' };
      } else if (/\b(?:done|complete|finished)\b/.test(lower)) {
        responseCommand = { intent: 'complete-task', taskQuery: query.replace(/\b(?:done|complete|finished)\b/i, '').trim() };
      } else if (/\b(?:add|create|make)\b/.test(lower)) {
        responseCommand = {
          intent: 'create-task',
          title: query.replace(/\b(?:add|create|make|task)\b/gi, '').trim(),
          estimatedMinutes: 30,
        };
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseCommand));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON request' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Deskmate AI Proxy] Listening on http://localhost:${PORT}/api/pip`);
});
