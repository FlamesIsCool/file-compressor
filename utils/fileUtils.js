const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Supported file types and their extensions
 */
const SUPPORTED_TYPES = {
  images: ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp'],
  videos: ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'],
  documents: ['.pdf']
};

/**
 * Get all supported file extensions
 */
function getAllSupportedExtensions() {
  return Object.values(SUPPORTED_TYPES).flat();
}

/**
 * Check if file type is supported
 */
function isFileTypeSupported(filename) {
  const ext = path.extname(filename).toLowerCase();
  return getAllSupportedExtensions().includes(ext);
}

/**
 * Get file type category
 */
function getFileTypeCategory(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  for (const [category, extensions] of Object.entries(SUPPORTED_TYPES)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  
  return 'unknown';
}

/**
 * Generate unique job ID
 */
function generateJobId() {
  return uuidv4();
}

/**
 * Generate unique filename with timestamp
 */
function generateUniqueFilename(originalName, suffix = '') {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const timestamp = Date.now();
  const uniqueId = uuidv4().slice(0, 8);
  
  return `${baseName}${suffix}_${timestamp}_${uniqueId}${ext}`;
}

/**
 * Get file size in bytes
 */
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error('Error getting file size:', error);
    return 0;
  }
}

/**
 * Format file size to human readable format
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Calculate compression ratio
 */
function calculateCompressionRatio(originalSize, compressedSize) {
  if (originalSize === 0) return 0;
  return Math.round(((originalSize - compressedSize) / originalSize) * 100);
}

/**
 * Clean up old files in a directory
 */
async function cleanupOldFiles(directory, maxAgeHours = 24) {
  try {
    const files = await fs.readdir(directory);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    
    let cleanedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      
      try {
        const stats = await fs.stat(filePath);
        const fileAge = now - stats.mtime.getTime();
        
        if (fileAge > maxAge) {
          await fs.remove(filePath);
          cleanedCount++;
          console.log(`🗑️ Cleaned up old file: ${file}`);
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error);
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old files from ${directory}`);
    }
    
    return cleanedCount;
  } catch (error) {
    console.error('Error during cleanup:', error);
    return 0;
  }
}

/**
 * Clean up specific file
 */
async function cleanupFile(filePath) {
  try {
    await fs.remove(filePath);
    console.log(`🗑️ Cleaned up file: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error cleaning up file ${filePath}:`, error);
    return false;
  }
}

/**
 * Ensure directory exists
 */
async function ensureDirectory(dirPath) {
  try {
    await fs.ensureDir(dirPath);
    return true;
  } catch (error) {
    console.error(`Error ensuring directory ${dirPath}:`, error);
    return false;
  }
}

/**
 * Get safe filename (remove special characters)
 */
function getSafeFilename(filename) {
  // Remove or replace special characters
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Validate file exists and is accessible
 */
async function validateFileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.F_OK | fs.constants.R_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get directory size
 */
async function getDirectorySize(dirPath) {
  try {
    let totalSize = 0;
    const files = await fs.readdir(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('Error calculating directory size:', error);
    return 0;
  }
}

/**
 * Start periodic cleanup of temp files
 */
function startPeriodicCleanup(tempDir, intervalHours = 24, maxAgeHours = 24) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  setInterval(async () => {
    console.log('🧹 Starting periodic cleanup...');
    await cleanupOldFiles(tempDir, maxAgeHours);
  }, intervalMs);
  
  console.log(`🕐 Periodic cleanup scheduled every ${intervalHours} hours`);
}

module.exports = {
  SUPPORTED_TYPES,
  getAllSupportedExtensions,
  isFileTypeSupported,
  getFileTypeCategory,
  generateJobId,
  generateUniqueFilename,
  getFileSize,
  formatFileSize,
  calculateCompressionRatio,
  cleanupOldFiles,
  cleanupFile,
  ensureDirectory,
  getSafeFilename,
  validateFileExists,
  getDirectorySize,
  startPeriodicCleanup
};