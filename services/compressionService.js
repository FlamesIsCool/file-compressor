const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const { 
  generateUniqueFilename, 
  getFileSize, 
  calculateCompressionRatio,
  getFileTypeCategory 
} = require('../utils/fileUtils');
const { emitProgress, emitStatus } = require('../utils/websocketUtils');

/**
 * Compress image files using Sharp
 */
async function compressImage(inputPath, outputDir, options = {}, io = null, jobId = null) {
  try {
    const {
      quality = 80,
      format = null, // auto-detect if null
      width = null,
      height = null,
      progressive = true
    } = options;

    if (io && jobId) {
      emitStatus(io, jobId, 'processing', 'Starting image compression...');
    }

    const filename = path.basename(inputPath);
    const ext = path.extname(filename).toLowerCase();
    
    // Determine output format
    let outputFormat = format;
    if (!outputFormat) {
      outputFormat = ext === '.png' ? 'png' : 'jpeg';
    }

    const outputFilename = generateUniqueFilename(filename, '_compressed');
    const outputPath = path.join(outputDir, outputFilename);

    let sharpInstance = sharp(inputPath);

    // Apply transformations
    if (width || height) {
      sharpInstance = sharpInstance.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      });
      
      if (io && jobId) {
        emitProgress(io, jobId, { progress: 30, message: 'Resizing image...' });
      }
    }

    // Apply format-specific compression
    if (outputFormat === 'jpeg') {
      sharpInstance = sharpInstance.jpeg({ 
        quality, 
        progressive,
        mozjpeg: true 
      });
    } else if (outputFormat === 'png') {
      sharpInstance = sharpInstance.png({ 
        quality,
        progressive,
        compressionLevel: 9
      });
    } else if (outputFormat === 'webp') {
      sharpInstance = sharpInstance.webp({ 
        quality,
        effort: 6
      });
    }

    if (io && jobId) {
      emitProgress(io, jobId, { progress: 60, message: 'Applying compression...' });
    }

    // Process the image
    await sharpInstance.toFile(outputPath);

    if (io && jobId) {
      emitProgress(io, jobId, { progress: 90, message: 'Finalizing...' });
    }

    // Get file sizes
    const originalSize = await getFileSize(inputPath);
    const compressedSize = await getFileSize(outputPath);
    const compressionRatio = calculateCompressionRatio(originalSize, compressedSize);

    const result = {
      originalPath: inputPath,
      compressedPath: outputPath,
      originalSize,
      compressedSize,
      compressionRatio,
      format: outputFormat
    };

    if (io && jobId) {
      emitProgress(io, jobId, { progress: 100, message: 'Image compression completed!' });
    }

    return result;
  } catch (error) {
    console.error('Image compression error:', error);
    throw new Error(`Image compression failed: ${error.message}`);
  }
}

/**
 * Compress video files using FFmpeg
 */
async function compressVideo(inputPath, outputDir, options = {}, io = null, jobId = null) {
  return new Promise((resolve, reject) => {
    try {
      const {
        quality = 'medium', // low, medium, high
        format = 'mp4',
        maxWidth = 1920,
        maxHeight = 1080
      } = options;

      if (io && jobId) {
        emitStatus(io, jobId, 'processing', 'Starting video compression...');
      }

      const filename = path.basename(inputPath);
      const outputFilename = generateUniqueFilename(filename, '_compressed').replace(/\.[^/.]+$/, `.${format}`);
      const outputPath = path.join(outputDir, outputFilename);

      let videoBitrate, audioBitrate;
      
      // Set quality parameters
      switch (quality) {
        case 'low':
          videoBitrate = '500k';
          audioBitrate = '64k';
          break;
        case 'high':
          videoBitrate = '2000k';
          audioBitrate = '192k';
          break;
        default: // medium
          videoBitrate = '1000k';
          audioBitrate = '128k';
      }

      const command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .videoBitrate(videoBitrate)
        .audioBitrate(audioBitrate)
        .size(`${maxWidth}x${maxHeight}`)
        .autopad()
        .format(format)
        .output(outputPath);

      // Progress tracking
      command.on('progress', (progress) => {
        if (io && jobId && progress.percent) {
          const percent = Math.round(progress.percent);
          emitProgress(io, jobId, { 
            progress: percent, 
            message: `Processing video... ${percent}%` 
          });
        }
      });

      command.on('error', async (error) => {
        console.error('Video compression error:', error);
        reject(new Error(`Video compression failed: ${error.message}`));
      });

      command.on('end', async () => {
        try {
          const originalSize = await getFileSize(inputPath);
          const compressedSize = await getFileSize(outputPath);
          const compressionRatio = calculateCompressionRatio(originalSize, compressedSize);

          const result = {
            originalPath: inputPath,
            compressedPath: outputPath,
            originalSize,
            compressedSize,
            compressionRatio,
            format
          };

          if (io && jobId) {
            emitProgress(io, jobId, { progress: 100, message: 'Video compression completed!' });
          }

          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      command.run();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Compress audio files using FFmpeg
 */
async function compressAudio(inputPath, outputDir, options = {}, io = null, jobId = null) {
  return new Promise((resolve, reject) => {
    try {
      const {
        quality = 'medium', // low, medium, high
        format = 'mp3'
      } = options;

      if (io && jobId) {
        emitStatus(io, jobId, 'processing', 'Starting audio compression...');
      }

      const filename = path.basename(inputPath);
      const outputFilename = generateUniqueFilename(filename, '_compressed').replace(/\.[^/.]+$/, `.${format}`);
      const outputPath = path.join(outputDir, outputFilename);

      let bitrate;
      
      // Set quality parameters
      switch (quality) {
        case 'low':
          bitrate = '64k';
          break;
        case 'high':
          bitrate = '192k';
          break;
        default: // medium
          bitrate = '128k';
      }

      const command = ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate(bitrate)
        .format(format)
        .output(outputPath);

      command.on('progress', (progress) => {
        if (io && jobId && progress.percent) {
          const percent = Math.round(progress.percent);
          emitProgress(io, jobId, { 
            progress: percent, 
            message: `Processing audio... ${percent}%` 
          });
        }
      });

      command.on('error', (error) => {
        console.error('Audio compression error:', error);
        reject(new Error(`Audio compression failed: ${error.message}`));
      });

      command.on('end', async () => {
        try {
          const originalSize = await getFileSize(inputPath);
          const compressedSize = await getFileSize(outputPath);
          const compressionRatio = calculateCompressionRatio(originalSize, compressedSize);

          const result = {
            originalPath: inputPath,
            compressedPath: outputPath,
            originalSize,
            compressedSize,
            compressionRatio,
            format
          };

          if (io && jobId) {
            emitProgress(io, jobId, { progress: 100, message: 'Audio compression completed!' });
          }

          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      command.run();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Basic PDF compression (placeholder - requires external tools for real compression)
 */
async function compressPDF(inputPath, outputDir, options = {}, io = null, jobId = null) {
  try {
    if (io && jobId) {
      emitStatus(io, jobId, 'processing', 'Processing PDF...');
      emitProgress(io, jobId, { progress: 50, message: 'Copying PDF file...' });
    }

    const filename = path.basename(inputPath);
    const outputFilename = generateUniqueFilename(filename, '_compressed');
    const outputPath = path.join(outputDir, outputFilename);

    // For now, just copy the file (real PDF compression would require additional tools)
    await fs.copy(inputPath, outputPath);

    const originalSize = await getFileSize(inputPath);
    const compressedSize = await getFileSize(outputPath);
    const compressionRatio = 0; // No actual compression performed

    if (io && jobId) {
      emitProgress(io, jobId, { progress: 100, message: 'PDF processing completed!' });
    }

    return {
      originalPath: inputPath,
      compressedPath: outputPath,
      originalSize,
      compressedSize,
      compressionRatio,
      format: 'pdf',
      note: 'PDF compression requires additional tools - file copied as-is'
    };
  } catch (error) {
    console.error('PDF processing error:', error);
    throw new Error(`PDF processing failed: ${error.message}`);
  }
}

/**
 * Compress multiple files and create archive
 */
async function compressBatch(files, outputDir, options = {}, io = null, jobId = null) {
  try {
    const results = [];
    const total = files.length;

    if (io && jobId) {
      emitStatus(io, jobId, 'processing', `Starting batch compression of ${total} files...`);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileType = getFileTypeCategory(file.filename);
      
      if (io && jobId) {
        const progress = Math.round((i / total) * 90); // Reserve 10% for archiving
        emitProgress(io, jobId, { 
          progress, 
          message: `Processing file ${i + 1}/${total}: ${file.filename}` 
        });
      }

      let result;
      
      try {
        switch (fileType) {
          case 'images':
            result = await compressImage(file.path, outputDir, options.image, io, jobId);
            break;
          case 'videos':
            result = await compressVideo(file.path, outputDir, options.video, io, jobId);
            break;
          case 'audio':
            result = await compressAudio(file.path, outputDir, options.audio, io, jobId);
            break;
          case 'documents':
            result = await compressPDF(file.path, outputDir, options.pdf, io, jobId);
            break;
          default:
            throw new Error(`Unsupported file type: ${fileType}`);
        }
        
        result.originalFilename = file.filename;
        results.push(result);
      } catch (error) {
        console.error(`Error processing ${file.filename}:`, error);
        results.push({
          originalFilename: file.filename,
          error: error.message,
          failed: true
        });
      }
    }

    // Create archive if multiple files
    if (results.length > 1 && options.createArchive) {
      if (io && jobId) {
        emitProgress(io, jobId, { progress: 95, message: 'Creating archive...' });
      }

      const archivePath = await createArchive(results, outputDir, 'compressed_files.zip');
      
      if (io && jobId) {
        emitProgress(io, jobId, { progress: 100, message: 'Batch compression completed!' });
      }

      return {
        type: 'batch',
        files: results,
        archive: archivePath,
        totalFiles: total,
        successfulFiles: results.filter(r => !r.failed).length,
        failedFiles: results.filter(r => r.failed).length
      };
    }

    if (io && jobId) {
      emitProgress(io, jobId, { progress: 100, message: 'Batch compression completed!' });
    }

    return {
      type: 'batch',
      files: results,
      totalFiles: total,
      successfulFiles: results.filter(r => !r.failed).length,
      failedFiles: results.filter(r => r.failed).length
    };
  } catch (error) {
    console.error('Batch compression error:', error);
    throw new Error(`Batch compression failed: ${error.message}`);
  }
}

/**
 * Create ZIP archive from compressed files
 */
async function createArchive(results, outputDir, archiveName) {
  return new Promise((resolve, reject) => {
    const archivePath = path.join(outputDir, archiveName);
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve(archivePath);
    });

    archive.on('error', (error) => {
      reject(error);
    });

    archive.pipe(output);

    // Add compressed files to archive
    results.forEach((result) => {
      if (!result.failed && result.compressedPath) {
        const filename = path.basename(result.compressedPath);
        archive.file(result.compressedPath, { name: filename });
      }
    });

    archive.finalize();
  });
}

module.exports = {
  compressImage,
  compressVideo,
  compressAudio,
  compressPDF,
  compressBatch,
  createArchive
};