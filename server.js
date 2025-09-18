const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Trust first proxy


// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter);
app.use(express.static('public')); // Serve frontend files

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bookshelf', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// MongoDB connection event handlers
mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Disconnected from MongoDB');
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  books: {
    read: [{
      title: String,
      author: String,
      genre: String,
      pages: Number,
      currentPage: Number,
      notes: String,
      progress: Number,
      color: String,
      dateAdded: { type: Date, default: Date.now }
    }],
    unread: [{
      title: String,
      author: String,
      genre: String,
      pages: Number,
      currentPage: Number,
      notes: String,
      progress: Number,
      color: String,
      dateAdded: { type: Date, default: Date.now }
    }],
    wishlist: [{
      title: String,
      author: String,
      genre: String,
      pages: Number,
      currentPage: Number,
      notes: String,
      progress: Number,
      color: String,
      dateAdded: { type: Date, default: Date.now }
    }]
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Helper function to validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Routes

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      books: { read: [], unread: [], wishlist: [] }
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id }, 
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ error: `${field} already exists` });
    }
    
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    // Find user by username or email
    const user = await User.findOne({
      $or: [
        { username: usernameOrEmail },
        { email: usernameOrEmail }
      ]
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id }, 
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get user books
app.get('/api/books', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user.books);
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({ error: 'Error fetching books' });
  }
});

// Update user books
app.put('/api/books', authenticateToken, async (req, res) => {
  try {
    const { books } = req.body;
    
    if (!books || typeof books !== 'object') {
      return res.status(400).json({ error: 'Invalid books data' });
    }

    await User.findByIdAndUpdate(req.user._id, { books });
    
    res.json({ message: 'Books updated successfully' });
  } catch (error) {
    console.error('Update books error:', error);
    res.status(500).json({ error: 'Error updating books' });
  }
});

// AI Summary endpoint
app.post('/api/ai-summary', authenticateToken, async (req, res) => {
  try {
    const { title, author } = req.body;
    
    if (!title || !author) {
      return res.status(400).json({ error: 'Title and author are required' });
    }

    const prompt = `Provide a concise, 1-2 sentence summary of the book '${title}' by ${author}. The summary should be objective and neutral.`;
    
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI service is not configured' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.candidates && result.candidates.length > 0 && 
        result.candidates[0].content && result.candidates[0].content.parts.length > 0) {
      res.json({ summary: result.candidates[0].content.parts[0].text });
    } else {
      res.status(500).json({ error: 'Could not generate a summary' });
    }
  } catch (error) {
    console.error('AI Summary error:', error);
    res.status(500).json({ error: 'Error generating summary' });
  }
});

// AI Recommendations endpoint
app.post('/api/ai-recommendations', authenticateToken, async (req, res) => {
  try {
    const { genre } = req.body;
    
    if (!genre) {
      return res.status(400).json({ error: 'Genre is required' });
    }

    const uniqueId = Math.random();
    const prompt = `Provide 3 book recommendations in the ${genre} genre. The recommendations should be returned as a JSON array of objects. Each object should have 'title', 'author', 'genre' and 'overview' keys. The overview should be a short, one-sentence summary.
    
    Example: 
    [
      { "title": "The Hitchhiker's Guide to the Galaxy", "author": "Douglas Adams", "genre": "Science Fiction", "overview": "A man survives the destruction of Earth and embarks on an interstellar adventure with an alien friend." },
      { "title": "Dune", "author": "Frank Herbert", "genre": "Science Fiction", "overview": "A noble family is entrusted with the planet Arrakis, the only source of the most valuable substance in the universe." }
    ]
    
    // Unique ID: ${uniqueId}`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    
    const payload = {
      contents: chatHistory,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "title": { "type": "STRING" },
              "author": { "type": "STRING" },
              "genre": { "type": "STRING" },
              "overview": { "type": "STRING" }
            },
            "propertyOrdering": ["title", "author", "genre", "overview"]
          }
        }
      }
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'AI service is not configured' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    const recommendations = JSON.parse(result?.candidates?.[0]?.content?.parts?.[0]?.text);
    
    if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
      res.json({ recommendations });
    } else {
      res.status(500).json({ error: 'Could not fetch recommendations' });
    }
  } catch (error) {
    console.error('AI Recommendations error:', error);
    res.status(500).json({ error: 'Error fetching recommendations' });
  }
});

// Verify token endpoint
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Handle all other routes by serving the auth page
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/auth.html');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

