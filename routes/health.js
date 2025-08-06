const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { 
  getDirectorySize, 
  formatFileSize,
  getAllSupportedExtensions 
} = require('../utils/fileUtils');
const { getActiveConnectionsCount } = require('../utils/websocketUtils');

/**
 * Basic health check
 */
router.get('/', async (req, res) => {
  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptime,
        formatted: formatUptime(uptime)
      },
      memory: {
        rss: formatFileSize(memoryUsage.rss),
        heapUsed: formatFileSize(memoryUsage.heapUsed),
        heapTotal: formatFileSize(memoryUsage.heapTotal),
        external: formatFileSize(memoryUsage.external)
      },
      nodejs: process.version,
      platform: process.platform,
      activeConnections: getActiveConnectionsCount()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Detailed system status
 */
router.get('/status', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const tempDir = path.join(__dirname, '..', 'temp');
    
    const [uploadsSize, tempSize] = await Promise.all([
      getDirectorySize(uploadsDir).catch(() => 0),
      getDirectorySize(tempDir).catch(() => 0)
    ]);

    const supportedTypes = getAllSupportedExtensions();

    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        express: 'running',
        websocket: 'running',
        fileSystem: 'accessible',
        compression: 'available'
      },
      directories: {
        uploads: {
          path: uploadsDir,
          size: formatFileSize(uploadsSize),
          accessible: await fs.pathExists(uploadsDir)
        },
        temp: {
          path: tempDir,
          size: formatFileSize(tempSize),
          accessible: await fs.pathExists(tempDir)
        }
      },
      capabilities: {
        imageCompression: true,
        videoCompression: true,
        audioCompression: true,
        pdfProcessing: true,
        batchProcessing: true,
        realtimeProgress: true
      },
      supportedFormats: {
        total: supportedTypes.length,
        extensions: supportedTypes
      },
      limits: {
        maxFileSize: '100MB',
        maxFiles: 10,
        maxUploadSize: '1GB'
      },
      activeConnections: getActiveConnectionsCount()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Check if specific service is available
 */
router.get('/check/:service', async (req, res) => {
  const { service } = req.params;
  
  try {
    let result = { service, status: 'unknown' };
    
    switch (service.toLowerCase()) {
      case 'sharp':
        try {
          const sharp = require('sharp');
          result = { service, status: 'available', version: sharp.versions };
        } catch (error) {
          result = { service, status: 'unavailable', error: error.message };
        }
        break;
        
      case 'ffmpeg':
        try {
          const ffmpeg = require('fluent-ffmpeg');
          result = { service, status: 'available', note: 'FFmpeg wrapper loaded' };
        } catch (error) {
          result = { service, status: 'unavailable', error: error.message };
        }
        break;
        
      case 'websocket':
        result = { 
          service, 
          status: 'available', 
          activeConnections: getActiveConnectionsCount() 
        };
        break;
        
      case 'filesystem':
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        const tempDir = path.join(__dirname, '..', 'temp');
        
        const uploadsExists = await fs.pathExists(uploadsDir);
        const tempExists = await fs.pathExists(tempDir);
        
        result = {
          service,
          status: uploadsExists && tempExists ? 'available' : 'partial',
          directories: {
            uploads: uploadsExists,
            temp: tempExists
          }
        };
        break;
        
      default:
        return res.status(400).json({
          error: `Unknown service: ${service}`,
          availableServices: ['sharp', 'ffmpeg', 'websocket', 'filesystem']
        });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      service,
      status: 'error',
      error: error.message
    });
  }
});

/**
 * Simple ping endpoint
 */
router.get('/ping', (req, res) => {
  res.json({
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

/**
 * Ready check for deployment platforms
 */
router.get('/ready', async (req, res) => {
  try {
    // Check critical dependencies
    const checks = [
      { name: 'express', check: () => !!require('express') },
      { name: 'sharp', check: () => !!require('sharp') },
      { name: 'fluent-ffmpeg', check: () => !!require('fluent-ffmpeg') },
      { name: 'socket.io', check: () => !!require('socket.io') }
    ];

    const results = [];
    let allHealthy = true;

    for (const { name, check } of checks) {
      try {
        const healthy = check();
        results.push({ name, status: healthy ? 'ok' : 'failed' });
        if (!healthy) allHealthy = false;
      } catch (error) {
        results.push({ name, status: 'failed', error: error.message });
        allHealthy = false;
      }
    }

    if (allHealthy) {
      res.json({
        status: 'ready',
        checks: results,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        checks: results,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);
  
  return parts.join(' ') || '0s';
}

module.exports = router;