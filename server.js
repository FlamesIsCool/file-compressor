const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs-extra');

// Import routes
const uploadRoutes = require('./routes/upload');
const compressRoutes = require('./routes/compress');
const downloadRoutes = require('./routes/download');
const healthRoutes = require('./routes/health');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Import utils
const { setupWebSocket } = require('./utils/websocketUtils');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for downloads
app.use('/downloads', express.static(path.join(__dirname, 'temp')));

// Ensure required directories exist
async function ensureDirectories() {
  const dirs = ['uploads', 'temp'];
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    await fs.ensureDir(dirPath);
    console.log(`✓ Ensured directory exists: ${dir}/`);
  }
}

// Setup WebSocket
setupWebSocket(io);

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/compress', compressRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/health', healthRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'FileCompress Pro Backend API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      upload: '/api/upload',
      compress: '/api/compress',
      download: '/api/download',
      health: '/api/health'
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    await ensureDirectories();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 FileCompress Pro Backend running on port ${PORT}`);
      console.log(`📁 Upload directory: ${path.join(__dirname, 'uploads')}`);
      console.log(`🗂️  Temp directory: ${path.join(__dirname, 'temp')}`);
      console.log(`🌐 WebSocket enabled for real-time progress`);
      console.log(`🔒 Security middleware active`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

// Make io available globally for routes
app.set('io', io);

startServer();

module.exports = app;