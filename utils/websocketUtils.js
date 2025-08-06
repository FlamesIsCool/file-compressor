const activeConnections = new Map();

/**
 * Setup WebSocket connection handling
 */
function setupWebSocket(io) {
  io.on('connection', (socket) => {
    console.log(`📡 WebSocket client connected: ${socket.id}`);
    
    // Store the connection
    activeConnections.set(socket.id, socket);

    // Handle client joining a specific job room
    socket.on('join-job', (jobId) => {
      socket.join(jobId);
      console.log(`📋 Client ${socket.id} joined job room: ${jobId}`);
    });

    // Handle client leaving a job room
    socket.on('leave-job', (jobId) => {
      socket.leave(jobId);
      console.log(`📋 Client ${socket.id} left job room: ${jobId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`📡 WebSocket client disconnected: ${socket.id}`);
      activeConnections.delete(socket.id);
    });
  });

  console.log('🔌 WebSocket server initialized');
}

/**
 * Emit progress update to a specific job room
 */
function emitProgress(io, jobId, progressData) {
  if (!io || !jobId) {
    console.warn('⚠️ Cannot emit progress: missing io or jobId');
    return;
  }

  const payload = {
    jobId,
    timestamp: new Date().toISOString(),
    ...progressData
  };

  io.to(jobId).emit('progress', payload);
  console.log(`📊 Progress emitted for job ${jobId}:`, progressData);
}

/**
 * Emit completion notification to a specific job room
 */
function emitCompletion(io, jobId, completionData) {
  if (!io || !jobId) {
    console.warn('⚠️ Cannot emit completion: missing io or jobId');
    return;
  }

  const payload = {
    jobId,
    timestamp: new Date().toISOString(),
    status: 'completed',
    ...completionData
  };

  io.to(jobId).emit('completed', payload);
  console.log(`✅ Completion emitted for job ${jobId}:`, completionData);
}

/**
 * Emit error notification to a specific job room
 */
function emitError(io, jobId, errorData) {
  if (!io || !jobId) {
    console.warn('⚠️ Cannot emit error: missing io or jobId');
    return;
  }

  const payload = {
    jobId,
    timestamp: new Date().toISOString(),
    status: 'error',
    error: errorData
  };

  io.to(jobId).emit('error', payload);
  console.log(`❌ Error emitted for job ${jobId}:`, errorData);
}

/**
 * Emit status update to a specific job room
 */
function emitStatus(io, jobId, status, message = '') {
  if (!io || !jobId) {
    console.warn('⚠️ Cannot emit status: missing io or jobId');
    return;
  }

  const payload = {
    jobId,
    timestamp: new Date().toISOString(),
    status,
    message
  };

  io.to(jobId).emit('status', payload);
  console.log(`📢 Status emitted for job ${jobId}: ${status} - ${message}`);
}

/**
 * Get count of active WebSocket connections
 */
function getActiveConnectionsCount() {
  return activeConnections.size;
}

/**
 * Get all active connection IDs
 */
function getActiveConnectionIds() {
  return Array.from(activeConnections.keys());
}

/**
 * Check if WebSocket is available
 */
function isWebSocketAvailable(io) {
  return io && typeof io.emit === 'function';
}

module.exports = {
  setupWebSocket,
  emitProgress,
  emitCompletion,
  emitError,
  emitStatus,
  getActiveConnectionsCount,
  getActiveConnectionIds,
  isWebSocketAvailable
};