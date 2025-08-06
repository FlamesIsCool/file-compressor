const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const { 
  validateFileExists, 
  getFileSize, 
  formatFileSize,
  cleanupFile 
} = require('../utils/fileUtils');

/**
 * Download single compressed file
 */
router.get('/file/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const tempDir = path.join(__dirname, '..', 'temp');
    const filePath = path.join(tempDir, filename);
    
    // Validate file exists and is accessible
    const fileExists = await validateFileExists(filePath);
    if (!fileExists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Create read stream and pipe to response
    const readStream = fs.createReadStream(filePath);
    
    readStream.on('error', (error) => {
      console.error('Download stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error reading file'
        });
      }
    });

    readStream.pipe(res);
    
    // Optional: Clean up file after download (uncomment if desired)
    // readStream.on('end', () => {
    //   setTimeout(() => cleanupFile(filePath), 5000); // 5 second delay
    // });
    
  } catch (error) {
    console.error('Download error:', error);
    next(error);
  }
});

/**
 * Download file with custom name
 */
router.get('/file/:filename/as/:downloadName', async (req, res, next) => {
  try {
    const { filename, downloadName } = req.params;
    const tempDir = path.join(__dirname, '..', 'temp');
    const filePath = path.join(tempDir, filename);
    
    // Validate file exists
    const fileExists = await validateFileExists(filePath);
    if (!fileExists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    
    // Set headers with custom download name
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Stream file
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    
  } catch (error) {
    console.error('Download with custom name error:', error);
    next(error);
  }
});

/**
 * Create and download archive of multiple files
 */
router.post('/archive', async (req, res, next) => {
  try {
    const { files, archiveName = 'compressed_files.zip' } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Files array is required'
      });
    }

    const tempDir = path.join(__dirname, '..', 'temp');
    
    // Validate all files exist
    const validFiles = [];
    for (const filename of files) {
      const filePath = path.join(tempDir, filename);
      const exists = await validateFileExists(filePath);
      if (exists) {
        validFiles.push({ filename, path: filePath });
      }
    }

    if (validFiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid files found'
      });
    }

    // Set headers for archive download
    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Cache-Control', 'no-cache');

    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Handle archive errors
    archive.on('error', (error) => {
      console.error('Archive error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error creating archive'
        });
      }
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add files to archive
    for (const file of validFiles) {
      archive.file(file.path, { name: file.filename });
    }

    // Finalize archive
    await archive.finalize();
    
  } catch (error) {
    console.error('Archive creation error:', error);
    next(error);
  }
});

/**
 * Get file information before download
 */
router.get('/info/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const tempDir = path.join(__dirname, '..', 'temp');
    const filePath = path.join(tempDir, filename);
    
    // Validate file exists
    const fileExists = await validateFileExists(filePath);
    if (!fileExists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    const fileSize = await getFileSize(filePath);
    
    res.json({
      success: true,
      file: {
        filename,
        size: fileSize,
        formattedSize: formatFileSize(fileSize),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        downloadUrl: `/api/download/file/${filename}`,
        type: path.extname(filename).substring(1) || 'unknown'
      }
    });
    
  } catch (error) {
    console.error('File info error:', error);
    next(error);
  }
});

/**
 * List available files for download
 */
router.get('/list', async (req, res, next) => {
  try {
    const tempDir = path.join(__dirname, '..', 'temp');
    
    // Ensure temp directory exists
    await fs.ensureDir(tempDir);
    
    const files = await fs.readdir(tempDir);
    const fileInfos = [];
    
    for (const filename of files) {
      const filePath = path.join(tempDir, filename);
      
      try {
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          const fileSize = stats.size;
          
          fileInfos.push({
            filename,
            size: fileSize,
            formattedSize: formatFileSize(fileSize),
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            downloadUrl: `/api/download/file/${filename}`,
            type: path.extname(filename).substring(1) || 'unknown'
          });
        }
      } catch (error) {
        console.error(`Error getting stats for ${filename}:`, error);
      }
    }
    
    // Sort by creation time (newest first)
    fileInfos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({
      success: true,
      files: fileInfos,
      totalFiles: fileInfos.length,
      totalSize: formatFileSize(fileInfos.reduce((sum, file) => sum + file.size, 0))
    });
    
  } catch (error) {
    console.error('List files error:', error);
    next(error);
  }
});

/**
 * Stream file (for preview/inline viewing)
 */
router.get('/stream/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const tempDir = path.join(__dirname, '..', 'temp');
    const filePath = path.join(tempDir, filename);
    
    // Validate file exists
    const fileExists = await validateFileExists(filePath);
    if (!fileExists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;
    const ext = path.extname(filename).toLowerCase();
    
    // Set appropriate content type based on file extension
    let contentType = 'application/octet-stream';
    if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.mp3') contentType = 'audio/mpeg';
    
    // Set headers for streaming
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Handle range requests for media files
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);
      
      const readStream = fs.createReadStream(filePath, { start, end });
      readStream.pipe(res);
    } else {
      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
    }
    
  } catch (error) {
    console.error('Stream error:', error);
    next(error);
  }
});

/**
 * Delete downloaded file
 */
router.delete('/file/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const tempDir = path.join(__dirname, '..', 'temp');
    const filePath = path.join(tempDir, filename);
    
    // Validate file exists
    const fileExists = await validateFileExists(filePath);
    if (!fileExists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Delete file
    await fs.remove(filePath);
    
    res.json({
      success: true,
      message: `File ${filename} deleted successfully`
    });
    
  } catch (error) {
    console.error('Delete file error:', error);
    next(error);
  }
});

/**
 * Clean up old files
 */
router.post('/cleanup', async (req, res, next) => {
  try {
    const { maxAgeHours = 24 } = req.body;
    const tempDir = path.join(__dirname, '..', 'temp');
    
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    
    let cleanedCount = 0;
    
    for (const filename of files) {
      const filePath = path.join(tempDir, filename);
      
      try {
        const stats = await fs.stat(filePath);
        const fileAge = now - stats.mtime.getTime();
        
        if (fileAge > maxAge) {
          await fs.remove(filePath);
          cleanedCount++;
        }
      } catch (error) {
        console.error(`Error processing ${filename}:`, error);
      }
    }
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old files`,
      cleanedCount,
      maxAgeHours
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    next(error);
  }
});

module.exports = router;