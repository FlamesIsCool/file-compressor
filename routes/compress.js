const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const {
  compressImage,
  compressVideo,
  compressAudio,
  compressPDF,
  compressBatch
} = require('../services/compressionService');
const {
  generateJobId,
  getFileTypeCategory,
  validateFileExists,
  formatFileSize
} = require('../utils/fileUtils');
const { emitStatus, emitError, emitCompletion } = require('../utils/websocketUtils');

/**
 * Compress single file
 */
router.post('/single', async (req, res, next) => {
  let jobId;
  const io = req.app.get('io');
  
  try {
    const { filePath, options = {} } = req.body;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    jobId = generateJobId();
    
    // Validate file exists
    const fileExists = await validateFileExists(filePath);
    if (!fileExists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    const filename = path.basename(filePath);
    const fileType = getFileTypeCategory(filename);
    const tempDir = path.join(__dirname, '..', 'temp');
    
    await fs.ensureDir(tempDir);

    if (io) {
      emitStatus(io, jobId, 'started', `Starting compression of ${filename}`);
    }

    let result;
    
    // Route to appropriate compression service
    switch (fileType) {
      case 'images':
        result = await compressImage(filePath, tempDir, options, io, jobId);
        break;
      case 'videos':
        result = await compressVideo(filePath, tempDir, options, io, jobId);
        break;
      case 'audio':
        result = await compressAudio(filePath, tempDir, options, io, jobId);
        break;
      case 'documents':
        result = await compressPDF(filePath, tempDir, options, io, jobId);
        break;
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }

    // Prepare response
    const response = {
      success: true,
      jobId,
      originalFile: {
        path: filePath,
        name: filename,
        size: result.originalSize,
        formattedSize: formatFileSize(result.originalSize)
      },
      compressedFile: {
        path: result.compressedPath,
        name: path.basename(result.compressedPath),
        size: result.compressedSize,
        formattedSize: formatFileSize(result.compressedSize)
      },
      compression: {
        ratio: result.compressionRatio,
        savedBytes: result.originalSize - result.compressedSize,
        savedFormatted: formatFileSize(result.originalSize - result.compressedSize)
      },
      fileType,
      completedAt: new Date().toISOString()
    };

    if (io) {
      emitCompletion(io, jobId, response);
    }

    res.json(response);
  } catch (error) {
    console.error('Single file compression error:', error);
    
    if (io && jobId) {
      emitError(io, jobId, error.message);
    }
    
    next(error);
  }
});

/**
 * Compress multiple files
 */
router.post('/batch', async (req, res, next) => {
  let jobId;
  const io = req.app.get('io');
  
  try {
    const { files, options = {}, createArchive = false } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Files array is required'
      });
    }

    jobId = generateJobId();
    
    // Validate all files exist
    for (const file of files) {
      const exists = await validateFileExists(file.path);
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: `File not found: ${file.path}`
        });
      }
    }

    const tempDir = path.join(__dirname, '..', 'temp');
    await fs.ensureDir(tempDir);

    if (io) {
      emitStatus(io, jobId, 'started', `Starting batch compression of ${files.length} files`);
    }

    // Process batch compression
    const batchOptions = {
      image: options.image || {},
      video: options.video || {},
      audio: options.audio || {},
      pdf: options.pdf || {},
      createArchive
    };

    const result = await compressBatch(files, tempDir, batchOptions, io, jobId);

    // Calculate totals
    const successfulFiles = result.files.filter(f => !f.failed);
    const totalOriginalSize = successfulFiles.reduce((sum, f) => sum + (f.originalSize || 0), 0);
    const totalCompressedSize = successfulFiles.reduce((sum, f) => sum + (f.compressedSize || 0), 0);
    const totalSaved = totalOriginalSize - totalCompressedSize;

    const response = {
      success: true,
      jobId,
      type: 'batch',
      summary: {
        totalFiles: result.totalFiles,
        successfulFiles: result.successfulFiles,
        failedFiles: result.failedFiles,
        totalOriginalSize,
        totalCompressedSize,
        totalSaved,
        totalOriginalFormatted: formatFileSize(totalOriginalSize),
        totalCompressedFormatted: formatFileSize(totalCompressedSize),
        totalSavedFormatted: formatFileSize(totalSaved),
        overallRatio: totalOriginalSize > 0 ? Math.round((totalSaved / totalOriginalSize) * 100) : 0
      },
      files: result.files.map(file => ({
        originalFilename: file.originalFilename,
        success: !file.failed,
        ...(file.failed ? 
          { error: file.error } : 
          {
            compressedPath: file.compressedPath,
            originalSize: file.originalSize,
            compressedSize: file.compressedSize,
            compressionRatio: file.compressionRatio,
            formattedOriginalSize: formatFileSize(file.originalSize),
            formattedCompressedSize: formatFileSize(file.compressedSize)
          }
        )
      })),
      ...(result.archive && { archivePath: result.archive }),
      completedAt: new Date().toISOString()
    };

    if (io) {
      emitCompletion(io, jobId, response);
    }

    res.json(response);
  } catch (error) {
    console.error('Batch compression error:', error);
    
    if (io && jobId) {
      emitError(io, jobId, error.message);
    }
    
    next(error);
  }
});

/**
 * Compress files from uploaded job
 */
router.post('/job/:jobId', async (req, res, next) => {
  const { jobId } = req.params;
  const io = req.app.get('io');
  
  try {
    const { files, options = {}, createArchive = false } = req.body;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Files array is required'
      });
    }

    // Validate all files exist
    for (const file of files) {
      const exists = await validateFileExists(file.path);
      if (!exists) {
        return res.status(404).json({
          success: false,
          error: `File not found: ${file.path}`
        });
      }
    }

    const tempDir = path.join(__dirname, '..', 'temp');
    await fs.ensureDir(tempDir);

    if (io) {
      emitStatus(io, jobId, 'processing', `Processing ${files.length} files`);
    }

    // Process compression with the provided jobId
    const batchOptions = {
      image: options.image || {},
      video: options.video || {},
      audio: options.audio || {},
      pdf: options.pdf || {},
      createArchive
    };

    const result = await compressBatch(files, tempDir, batchOptions, io, jobId);

    // Calculate totals
    const successfulFiles = result.files.filter(f => !f.failed);
    const totalOriginalSize = successfulFiles.reduce((sum, f) => sum + (f.originalSize || 0), 0);
    const totalCompressedSize = successfulFiles.reduce((sum, f) => sum + (f.compressedSize || 0), 0);
    const totalSaved = totalOriginalSize - totalCompressedSize;

    const response = {
      success: true,
      jobId,
      type: 'batch',
      summary: {
        totalFiles: result.totalFiles,
        successfulFiles: result.successfulFiles,
        failedFiles: result.failedFiles,
        totalOriginalSize,
        totalCompressedSize,
        totalSaved,
        totalOriginalFormatted: formatFileSize(totalOriginalSize),
        totalCompressedFormatted: formatFileSize(totalCompressedSize),
        totalSavedFormatted: formatFileSize(totalSaved),
        overallRatio: totalOriginalSize > 0 ? Math.round((totalSaved / totalOriginalSize) * 100) : 0
      },
      files: result.files.map(file => ({
        originalFilename: file.originalFilename,
        success: !file.failed,
        ...(file.failed ? 
          { error: file.error } : 
          {
            compressedPath: file.compressedPath,
            originalSize: file.originalSize,
            compressedSize: file.compressedSize,
            compressionRatio: file.compressionRatio,
            formattedOriginalSize: formatFileSize(file.originalSize),
            formattedCompressedSize: formatFileSize(file.compressedSize)
          }
        )
      })),
      ...(result.archive && { archivePath: result.archive }),
      completedAt: new Date().toISOString()
    };

    if (io) {
      emitCompletion(io, jobId, response);
    }

    res.json(response);
  } catch (error) {
    console.error('Job compression error:', error);
    
    if (io) {
      emitError(io, jobId, error.message);
    }
    
    next(error);
  }
});

/**
 * Get compression options/presets
 */
router.get('/options', (req, res) => {
  res.json({
    image: {
      quality: {
        type: 'number',
        min: 1,
        max: 100,
        default: 80,
        description: 'Image quality (1-100)'
      },
      format: {
        type: 'string',
        options: ['jpeg', 'png', 'webp'],
        default: 'auto',
        description: 'Output format (auto-detects if not specified)'
      },
      width: {
        type: 'number',
        description: 'Maximum width in pixels (optional)'
      },
      height: {
        type: 'number',
        description: 'Maximum height in pixels (optional)'
      },
      progressive: {
        type: 'boolean',
        default: true,
        description: 'Use progressive encoding'
      }
    },
    video: {
      quality: {
        type: 'string',
        options: ['low', 'medium', 'high'],
        default: 'medium',
        description: 'Video compression quality'
      },
      format: {
        type: 'string',
        options: ['mp4', 'webm'],
        default: 'mp4',
        description: 'Output video format'
      },
      maxWidth: {
        type: 'number',
        default: 1920,
        description: 'Maximum width in pixels'
      },
      maxHeight: {
        type: 'number',
        default: 1080,
        description: 'Maximum height in pixels'
      }
    },
    audio: {
      quality: {
        type: 'string',
        options: ['low', 'medium', 'high'],
        default: 'medium',
        description: 'Audio compression quality'
      },
      format: {
        type: 'string',
        options: ['mp3', 'aac'],
        default: 'mp3',
        description: 'Output audio format'
      }
    },
    pdf: {
      note: 'PDF compression requires additional tools - currently only copies files'
    },
    batch: {
      createArchive: {
        type: 'boolean',
        default: false,
        description: 'Create ZIP archive of compressed files'
      }
    }
  });
});

/**
 * Get compression presets
 */
router.get('/presets', (req, res) => {
  res.json({
    web: {
      description: 'Optimized for web usage',
      image: { quality: 85, format: 'jpeg', progressive: true },
      video: { quality: 'medium', format: 'mp4', maxWidth: 1280, maxHeight: 720 },
      audio: { quality: 'medium', format: 'mp3' }
    },
    mobile: {
      description: 'Optimized for mobile devices',
      image: { quality: 75, format: 'jpeg', maxWidth: 800 },
      video: { quality: 'low', format: 'mp4', maxWidth: 720, maxHeight: 480 },
      audio: { quality: 'low', format: 'mp3' }
    },
    print: {
      description: 'Optimized for printing',
      image: { quality: 95, format: 'jpeg', progressive: false },
      video: { quality: 'high', format: 'mp4' },
      audio: { quality: 'high', format: 'mp3' }
    },
    archive: {
      description: 'Maximum compression for archival',
      image: { quality: 60, format: 'jpeg', progressive: true },
      video: { quality: 'low', format: 'mp4', maxWidth: 640, maxHeight: 360 },
      audio: { quality: 'low', format: 'mp3' }
    }
  });
});

module.exports = router;