// api/index.js
const express = require('express');
const serverless = require('serverless-http');
const app = express();

app.use(express.json());

// In-memory users (replace with DB later)
const users = [];

// ---- Routes ----

// Register
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  const user = { id: users.length + 1, username, email };
  users.push(user);
  res.json({ user, token: 'fake-jwt-token' });
});

// Login
app.post('/api/login', (req, res) => {
  const { usernameOrEmail, password } = req.body;
  const user = users.find(
    u => u.email === usernameOrEmail || u.username === usernameOrEmail
  );
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ user, token: 'fake-jwt-token' });
});

// Verify token (fake)
app.get('/api/verify', (req, res) => {
  res.json({ valid: true });
});

// Export for Vercel
module.exports = serverless(app);
