const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const router = express.Router();
const { 
  isFileTypeSupported, 
  generateJobId, 
  generateUniqueFilename,
  getFileSize,
  formatFileSize,
  getFileTypeCategory
} = require('../utils/fileUtils');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    await fs.ensureDir(uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent conflicts
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  }
});

// File filter to check supported file types
const fileFilter = (req, file, cb) => {
  if (isFileTypeSupported(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${path.extname(file.originalname)}. Supported types: images, videos, audio, PDFs`), false);
  }
};

// Configure multer with limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 10 // Maximum 10 files
  }
});

/**
 * Upload single file
 */
router.post('/single', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const fileInfo = await getFileInfo(req.file);
    const jobId = generateJobId();

    res.json({
      success: true,
      jobId,
      file: fileInfo,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Upload multiple files
 */
router.post('/multiple', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const filesInfo = await Promise.all(
      req.files.map(file => getFileInfo(file))
    );

    const jobId = generateJobId();
    
    // Calculate total size
    const totalSize = filesInfo.reduce((sum, file) => sum + file.size, 0);

    res.json({
      success: true,
      jobId,
      files: filesInfo,
      totalFiles: filesInfo.length,
      totalSize: formatFileSize(totalSize),
      message: 'Files uploaded successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Upload with progress tracking
 */
router.post('/progress', (req, res, next) => {
  const uploadMiddleware = upload.array('files', 10);
  
  // Track upload progress
  let uploadProgress = 0;
  const jobId = generateJobId();
  const io = req.app.get('io');
  
  // Emit initial status
  if (io) {
    io.emit('uploadProgress', {
      jobId,
      progress: 0,
      message: 'Starting upload...'
    });
  }

  uploadMiddleware(req, res, async (err) => {
    try {
      if (err) {
        if (io) {
          io.emit('uploadError', {
            jobId,
            error: err.message
          });
        }
        return next(err);
      }

      if (!req.files || req.files.length === 0) {
        const error = new Error('No files uploaded');
        if (io) {
          io.emit('uploadError', {
            jobId,
            error: error.message
          });
        }
        return next(error);
      }

      // Process files and emit progress
      const filesInfo = [];
      const totalFiles = req.files.length;

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const fileInfo = await getFileInfo(file);
        filesInfo.push(fileInfo);

        const progress = Math.round(((i + 1) / totalFiles) * 100);
        
        if (io) {
          io.emit('uploadProgress', {
            jobId,
            progress,
            message: `Processed ${i + 1}/${totalFiles} files`,
            currentFile: fileInfo.originalName
          });
        }
      }

      const totalSize = filesInfo.reduce((sum, file) => sum + file.size, 0);

      if (io) {
        io.emit('uploadComplete', {
          jobId,
          files: filesInfo,
          totalFiles: filesInfo.length,
          totalSize: formatFileSize(totalSize)
        });
      }

      res.json({
        success: true,
        jobId,
        files: filesInfo,
        totalFiles: filesInfo.length,
        totalSize: formatFileSize(totalSize),
        message: 'Files uploaded successfully with progress tracking'
      });
    } catch (error) {
      if (io) {
        io.emit('uploadError', {
          jobId,
          error: error.message
        });
      }
      next(error);
    }
  });
});

/**
 * Get upload status/limits
 */
router.get('/limits', (req, res) => {
  res.json({
    maxFileSize: '100MB',
    maxFiles: 10,
    maxTotalSize: '1GB',
    supportedTypes: {
      images: ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp'],
      videos: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'],
      audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'],
      documents: ['.pdf']
    },
    note: 'All file sizes are per individual file'
  });
});

/**
 * Check if file type is supported
 */
router.post('/validate', express.json(), (req, res) => {
  try {
    const { filename, size } = req.body;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Filename is required'
      });
    }

    const isSupported = isFileTypeSupported(filename);
    const fileType = getFileTypeCategory(filename);
    const maxSize = 100 * 1024 * 1024; // 100MB
    
    const validation = {
      filename,
      supported: isSupported,
      fileType,
      sizeValid: !size || size <= maxSize,
      maxSizeBytes: maxSize,
      maxSizeFormatted: formatFileSize(maxSize)
    };

    if (size) {
      validation.providedSize = formatFileSize(size);
    }

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Clean up uploaded files (for testing/development)
 */
router.delete('/cleanup', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const files = await fs.readdir(uploadsDir);
    
    let cleanedCount = 0;
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      await fs.remove(filePath);
      cleanedCount++;
    }

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} uploaded files`,
      cleanedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get file information
 */
async function getFileInfo(file) {
  const fileSize = await getFileSize(file.path);
  
  return {
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    size: fileSize,
    formattedSize: formatFileSize(fileSize),
    mimetype: file.mimetype,
    fileType: getFileTypeCategory(file.originalname),
    uploadedAt: new Date().toISOString()
  };
}

// Error handling middleware specific to upload routes
router.use((err, req, res, next) => {
  // Clean up any uploaded files if there was an error
  if (req.file) {
    fs.remove(req.file.path).catch(console.error);
  }
  
  if (req.files && req.files.length > 0) {
    req.files.forEach(file => {
      fs.remove(file.path).catch(console.error);
    });
  }
  
  next(err);
});

module.exports = router;