const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500
  };

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = {
      message: 'File too large. Maximum size allowed is 100MB per file.',
      status: 413
    };
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    error = {
      message: 'Too many files. Maximum 10 files allowed per upload.',
      status: 413
    };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = {
      message: 'Unexpected file field or too many files.',
      status: 400
    };
  }

  // File type errors
  if (err.message && err.message.includes('Invalid file type')) {
    error = {
      message: err.message,
      status: 400
    };
  }

  // FFmpeg errors
  if (err.message && err.message.includes('ffmpeg')) {
    error = {
      message: 'Video compression failed. Please check the video format.',
      status: 422
    };
  }

  // Sharp errors
  if (err.message && err.message.includes('Input file contains unsupported image format')) {
    error = {
      message: 'Unsupported image format. Please use JPEG, PNG, WebP, or TIFF.',
      status: 422
    };
  }

  // File system errors
  if (err.code === 'ENOENT') {
    error = {
      message: 'File not found.',
      status: 404
    };
  }

  if (err.code === 'EACCES') {
    error = {
      message: 'Permission denied.',
      status: 403
    };
  }

  if (err.code === 'ENOSPC') {
    error = {
      message: 'No space left on device.',
      status: 507
    };
  }

  // Rate limit errors
  if (err.message && err.message.includes('Too many requests')) {
    error = {
      message: 'Rate limit exceeded. Please try again later.',
      status: 429
    };
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error = {
      message: 'Validation failed: ' + err.message,
      status: 400
    };
  }

  // Send error response
  res.status(error.status).json({
    success: false,
    error: {
      message: error.message,
      status: error.status,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    },
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;