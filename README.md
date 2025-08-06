# FileCompress Pro Backend

A comprehensive Express.js backend API for file compression supporting images, videos, audio files, and PDFs with real-time progress tracking via WebSocket.

## Features

- ✅ **Multi-format Support**: Images (JPEG, PNG, WebP, TIFF, BMP), Videos (MP4, AVI, MOV, etc.), Audio (MP3, WAV, FLAC, etc.), and PDFs
- ✅ **Real Compression**: Uses Sharp for images, FFmpeg for videos/audio, with configurable quality settings
- ✅ **Real-time Progress**: WebSocket integration for live compression progress updates
- ✅ **Batch Processing**: Upload and compress multiple files simultaneously
- ✅ **Security**: Rate limiting, CORS, Helmet security headers, file type validation
- ✅ **Production Ready**: Optimized for Render.com deployment with health checks
- ✅ **File Management**: Automatic cleanup, download management, archive creation

## Project Structure

```
filecompress-pro-backend/
├── package.json              # Dependencies and scripts
├── server.js                 # Main Express server
├── Dockerfile               # Container configuration
├── routes/
│   ├── upload.js            # File upload endpoints
│   ├── compress.js          # Compression endpoints
│   ├── download.js          # Download and file management
│   └── health.js            # Health check endpoints
├── services/
│   └── compressionService.js # Core compression logic
├── utils/
│   ├── websocketUtils.js    # WebSocket utilities
│   └── fileUtils.js         # File management utilities
├── middleware/
│   └── errorHandler.js      # Error handling middleware
├── uploads/                 # Upload directory (auto-created)
└── temp/                    # Compressed files directory (auto-created)
```

## API Endpoints

### Health & Status
- `GET /` - API information
- `GET /api/health` - Basic health check
- `GET /api/health/status` - Detailed system status
- `GET /api/health/ready` - Deployment readiness check

### File Upload
- `POST /api/upload/single` - Upload single file
- `POST /api/upload/multiple` - Upload multiple files
- `POST /api/upload/progress` - Upload with real-time progress
- `GET /api/upload/limits` - Get upload limits and supported formats

### Compression
- `POST /api/compress/single` - Compress single file
- `POST /api/compress/batch` - Compress multiple files
- `POST /api/compress/job/:jobId` - Compress uploaded files by job ID
- `GET /api/compress/options` - Get compression options
- `GET /api/compress/presets` - Get compression presets

### Download & File Management
- `GET /api/download/file/:filename` - Download compressed file
- `GET /api/download/list` - List available files
- `GET /api/download/info/:filename` - Get file information
- `POST /api/download/archive` - Create and download archive
- `DELETE /api/download/file/:filename` - Delete file

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Start production server:**
   ```bash
   npm start
   ```

### Docker Deployment

1. **Build image:**
   ```bash
   docker build -t filecompress-pro .
   ```

2. **Run container:**
   ```bash
   docker run -p 3000:3000 filecompress-pro
   ```

### Render.com Deployment

This project is optimized for Render.com deployment:

1. Connect your GitHub repository to Render
2. Choose "Web Service" 
3. Use the following settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node.js
   - **Port**: 3000

## Usage Examples

### Upload Files
```bash
curl -X POST -F "files=@image.jpg" -F "files=@video.mp4" \
  http://localhost:3000/api/upload/multiple
```

### Compress Images
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"filePath":"/path/to/image.jpg","options":{"quality":70,"format":"webp"}}' \
  http://localhost:3000/api/compress/single
```

### Download Compressed File
```bash
curl -O http://localhost:3000/api/download/file/compressed_image.webp
```

## WebSocket Integration

Connect to WebSocket for real-time progress updates:

```javascript
const socket = io('http://localhost:3000');
socket.emit('join-job', jobId);
socket.on('progress', (data) => console.log('Progress:', data));
socket.on('completed', (data) => console.log('Completed:', data));
```

## Configuration

### Compression Options

**Images (Sharp):**
- Quality: 1-100 (default: 80)
- Format: jpeg, png, webp (default: auto)
- Resize: width/height limits
- Progressive encoding

**Videos (FFmpeg):**
- Quality: low, medium, high (default: medium)
- Format: mp4, webm (default: mp4)
- Resolution limits: 1920x1080 default

**Audio (FFmpeg):**
- Quality: low (64k), medium (128k), high (192k)
- Format: mp3, aac (default: mp3)

### Limits
- Max file size: 100MB per file
- Max files per upload: 10
- Max total upload: 1GB
- File cleanup: 24 hours

## Dependencies

### Core Dependencies
- **Express.js**: Web framework
- **Sharp**: Image processing
- **FFmpeg**: Video/audio processing  
- **Socket.io**: WebSocket support
- **Multer**: File upload handling

### Security & Performance
- **Helmet**: Security headers
- **CORS**: Cross-origin support
- **Rate Limiting**: API protection
- **Compression**: Response compression

## Environment Requirements

- **Node.js**: >= 16.0.0
- **FFmpeg**: Required for video/audio compression
- **Memory**: 512MB+ recommended
- **Storage**: Temporary file space needed

## Health Monitoring

The API includes comprehensive health monitoring:

- **Basic Health**: `/api/health`
- **System Status**: `/api/health/status`
- **Service Checks**: `/api/health/check/:service`
- **Ready Check**: `/api/health/ready`

## Error Handling

Comprehensive error handling for:
- File type validation
- Size limit enforcement
- Compression failures
- Network errors
- File system issues

## License

MIT License

## Support

For issues and questions, please create an issue in the GitHub repository.
