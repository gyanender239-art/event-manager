const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Global cached connection for Serverless
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/eventora';
    console.log('Connecting to MongoDB Atlas...');
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
    }).then((mongooseInstance) => {
      console.log('MongoDB Connected successfully');
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    console.error('MongoDB Connection Error:', err.message);
    throw err;
  }
};

// Root / Health checks (run without DB check for fast ping)
app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Eventora API is running',
    dbReady: mongoose.connection.readyState === 1,
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.json({
      status: 'ok',
      dbReady: true,
      dbState: mongoose.connection.readyState,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      dbReady: false,
      error: err.message,
    });
  }
});

// Middleware to ensure DB connection before executing any API route
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    return res.status(500).json({
      message: 'Database connection failed',
      error: err.message,
    });
  }
});

// Routes
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
