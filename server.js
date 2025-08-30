// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// --- Middleware & Security ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(cors());
app.use(express.json());
app.use(limiter);
app.use(express.static('public'));

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bookshelf', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on('connected', () => console.log('Connected to MongoDB'));
mongoose.connection.on('error', (err) => console.error('MongoDB error:', err));
mongoose.connection.on('disconnected', () => console.log('Disconnected from MongoDB'));

// --- User Schema ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  books: {
    read: [{ title: String, author: String, genre: String, pages: Number, currentPage: Number, notes: String, progress: Number, color: String, dateAdded: { type: Date, default: Date.now } }],
    unread: [{ title: String, author: String, genre: String, pages: Number, currentPage: Number, notes: String, progress: Number, color: String, dateAdded: { type: Date, default: Date.now } }],
    wishlist: [{ title: String, author: String, genre: String, pages: Number, currentPage: Number, notes: String, progress: Number, color: String, dateAdded: { type: Date, default: Date.now } }]
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- Auth Middleware ---
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(403).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// --- Helper ---
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// --- Routes ---
// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields are required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      if (existingUser.email === email) return res.status(400).json({ error: 'Email already exists' });
      if (existingUser.username === username) return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword, books: { read: [], unread: [], wishlist: [] } });
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });

    res.status(201).json({ message: 'User created successfully', token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(400).json({ error: `${field} already exists` });
    }
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Username/email and password are required' });

    const user = await User.findOne({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });

    res.json({ message: 'Login successful', token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Books
app.get('/api/books', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user.books);
  } catch (err) {
    console.error('Get books error:', err);
    res.status(500).json({ error: 'Error fetching books' });
  }
});

app.put('/api/books', authenticateToken, async (req, res) => {
  try {
    const { books } = req.body;
    if (!books || typeof books !== 'object') return res.status(400).json({ error: 'Invalid books data' });
    await User.findByIdAndUpdate(req.user._id, { books });
    res.json({ message: 'Books updated successfully' });
  } catch (err) {
    console.error('Update books error:', err);
    res.status(500).json({ error: 'Error updating books' });
  }
});

// AI Summary
app.post('/api/ai-summary', authenticateToken, async (req, res) => {
  try {
    const { title, author } = req.body;
    if (!title || !author) return res.status(400).json({ error: 'Title and author are required' });

    const prompt = `Provide a concise, 1-2 sentence summary of the book '${title}' by ${author}.`;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI service not configured' });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) res.json({ summary: text });
    else res.status(500).json({ error: 'Could not generate summary' });
  } catch (err) {
    console.error('AI Summary error:', err);
    res.status(500).json({ error: 'Error generating summary' });
  }
});

// AI Recommendations
app.post('/api/ai-recommendations', authenticateToken, async (req, res) => {
  try {
    const { genre } = req.body;
    if (!genre) return res.status(400).json({ error: 'Genre is required' });

    const prompt = `Provide 3 book recommendations in the ${genre} genre as JSON with title, author, genre, and overview.`;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI service not configured' });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    const recs = JSON.parse(text || "[]");
    if (Array.isArray(recs) && recs.length > 0) res.json({ recommendations: recs });
    else res.status(500).json({ error: 'No recommendations generated' });
  } catch (err) {
    console.error('AI Recommendations error:', err);
    res.status(500).json({ error: 'Error fetching recommendations' });
  }
});

// Verify
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({ user: { id: req.user._id, username: req.user.username, email: req.user.email } });
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Frontend routes
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.use('/api/*', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));
app.get('*', (req, res) => res.sendFile(__dirname + '/public/auth.html'));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Export for Vercel ---
module.exports = app;

// --- Local server (only if run directly) ---
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Local: http://localhost:${PORT}`));

  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await mongoose.connection.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await mongoose.connection.close();
    process.exit(0);
  });
}

