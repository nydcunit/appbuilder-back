const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:helloworld@cluster0.kapy7mg.mongodb.net/appbuilder?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Import Routes
const authRoutes = require('./routes/auth');
const appRoutes = require('./routes/apps');
const databaseRoutes = require('./routes/databases');
const databaseQueryRoutes = require('./routes/databaseQueries');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/apps', appRoutes);
app.use('/api/databases', databaseRoutes);
app.use('/api/databases', databaseQueryRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'AppBuilder API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Documentation route
app.get('/api', (req, res) => {
  res.json({
    message: 'AppBuilder API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register a new user',
        'POST /api/auth/login': 'Login user',
        'GET /api/auth/verify': 'Verify JWT token',
        'GET /api/auth/profile': 'Get user profile'
      },
      apps: {
        'GET /api/apps': 'Get all user apps',
        'GET /api/apps/:id': 'Get specific app',
        'POST /api/apps': 'Create new app',
        'PUT /api/apps/:id': 'Update app',
        'DELETE /api/apps/:id': 'Delete app',
        'POST /api/apps/:id/publish': 'Publish/unpublish app'
      },
      databases: {
        'GET /api/databases': 'Get all user databases',
        'GET /api/databases/:id': 'Get specific database',
        'POST /api/databases': 'Create new database',
        'DELETE /api/databases/:id': 'Delete database',
        'GET /api/databases/:id/tables': 'Get database tables',
        'POST /api/databases/:id/tables': 'Create new table',
        'DELETE /api/databases/:id/tables/:tableId': 'Delete table',
        'GET /api/databases/:id/tables/:tableId/columns': 'Get table columns',
        'POST /api/databases/:id/tables/:tableId/columns': 'Create new column',
        'DELETE /api/databases/:id/tables/:tableId/columns/:columnId': 'Delete column',
        'GET /api/databases/:id/tables/:tableId/records': 'Get table records',
        'POST /api/databases/:id/tables/:tableId/records': 'Create new record',
        'PUT /api/databases/:id/tables/:tableId/records/:recordId': 'Update record',
        'POST /api/databases/:id/tables/:tableId/records/delete-multiple': 'Delete multiple records',
        'POST /api/databases/:id/tables/:tableId/query': 'Execute database query for calculations'
      }
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error.stack);
  res.status(500).json({ 
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'API route not found',
    availableEndpoints: 'Visit /api for documentation'
  });
});

// Create HTTP server and Socket.IO instance
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", /^http:\/\/.*\.localhost:3000$/],
    methods: ["GET", "POST"]
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Handle joining app-specific rooms
  socket.on('join-app', (appId) => {
    socket.join(`app-${appId}`);
    console.log(`📱 Socket ${socket.id} joined app-${appId}`);
  });

  // Handle leaving app rooms
  socket.on('leave-app', (appId) => {
    socket.leave(`app-${appId}`);
    console.log(`📱 Socket ${socket.id} left app-${appId}`);
  });

  // Handle app save events from builder
  socket.on('app-saved', (appId) => {
    console.log(`💾 App ${appId} saved, broadcasting to preview windows`);
    // Broadcast to all preview windows for this app
    socket.to(`app-${appId}`).emit('app-updated', { appId, timestamp: Date.now() });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/api`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Socket.IO server ready`);
});
