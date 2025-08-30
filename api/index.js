// api/index.js
const express = require('express');
const serverless = require('serverless-http');
const bcrypt = require('bcryptjs');   // if you used bcrypt
const jwt = require('jsonwebtoken'); // if you used JWT
const path = require('path');

const app = express();
app.use(express.json());

// Fake secret for demo (use process.env.JWT_SECRET in production!)
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// In-memory users (replace with DB later)
let users = [];

// ---- Routes ----

// Serve frontend (index.html)
app.get('/', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public/index.html'));
});

// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = { id: users.length + 1, username, email, password: hashed };
  users.push(user);

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ user: { id: user.id, username, email }, token });
});

// Login
app.post('/api/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  const user = users.find(
    u => u.email === usernameOrEmail || u.username === usernameOrEmail
  );
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ user: { id: user.id, username: user.username, email: user.email }, token });
});

// Verify token
app.get('/api/verify', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });

  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Export for Vercel
module.exports = serverless(app);
