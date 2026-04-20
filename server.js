const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
require('dotenv').config();
console.log("ENV CHECK:", process.env.MONGODB_URI);

const app = express();

// Middleware
app.use(cors({
  origin: [
    'https://instapinz.vercel.app',
    'https://instapinz-nischit-kanthalas-projects.vercel.app',
    'https://instapinz-git-master-nischit-kanthalas-projects.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));

// Helper function to safely read a directory
async function safeReadDir(dir) {
    try {
        return await fs.readdir(dir);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

function getBaseUrl(req) {
    const configured = process.env.PUBLIC_BASE_URL;
    if (configured && typeof configured === 'string' && configured.trim()) {
        return configured.trim().replace(/\/+$/, '');
    }
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.get('host') || '').toString().split(',')[0].trim();
    return `${proto}://${host}`.replace(/\/+$/, '');
}

function getMediaTypeByExt(ext) {
    const videoExts = new Set(['mp4', 'webm', 'ogg', 'mov']);
    const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
    if (videoExts.has(ext)) return 'video';
    if (imageExts.has(ext)) return 'image';
    return 'unknown';
}

function encodePathSegment(segment) {
    return encodeURIComponent(segment).replace(/%2F/g, '/');
}

async function listMediaFromDir(absDirPath, publicPrefix, source) {
    const files = await safeReadDir(absDirPath);
    const media = [];
    for (const file of files) {
        const ext = file.toLowerCase().split('.').pop();
        const type = getMediaTypeByExt(ext);
        if (type === 'unknown') continue;
        const encodedFile = encodePathSegment(file);
        media.push({
            filename: file,
            path: `/${publicPrefix}/${encodedFile}`,
            type,
            source
        });
    }
    // deterministic order to keep pagination stable across reloads
    media.sort((a, b) => a.filename.localeCompare(b.filename));
    return media;
}

function paginate(items, limit, cursor) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 200));
    let startIndex = 0;
    if (cursor) {
        const decoded = Buffer.from(String(cursor), 'base64').toString('utf8');
        const idx = Number(decoded);
        if (Number.isFinite(idx) && idx >= 0) startIndex = idx;
    }
    const slice = items.slice(startIndex, startIndex + safeLimit);
    const nextIndex = startIndex + slice.length;
    const nextCursor = nextIndex < items.length ? Buffer.from(String(nextIndex), 'utf8').toString('base64') : null;
    return { slice, nextCursor, limit: safeLimit, startIndex };
}

function fnv1a32(str) {
    // Simple deterministic hash for stable "shuffle"
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    // convert to unsigned
    return h >>> 0;
}

function seededOrder(items, seed) {
    const s = String(seed ?? '');
    return [...items].sort((a, b) => {
        const ha = fnv1a32(`${s}|${a.source}|${a.filename}`);
        const hb = fnv1a32(`${s}|${b.source}|${b.filename}`);
        return ha - hb;
    });
}

// API endpoint to get media files (images/videos) from webdesigns and tobejson directories
// Supports stable pagination: ?limit=30&cursor=<base64Index>&type=image|video&source=webdesigns|tobejson|all&shuffle=1
app.get('/api/media-files', async (req, res) => {
    try {
        const baseUrl = getBaseUrl(req);
        const webdesignsPath = path.join(__dirname, 'public', 'webdesigns');
        const tobejsonPath = path.join(__dirname, 'public', 'tobejson');
        
        const webdesignsMedia = await listMediaFromDir(webdesignsPath, 'webdesigns', 'webdesigns');
        const tobejsonMedia = await listMediaFromDir(tobejsonPath, 'tobejson', 'tobejson');

        let allMedia = [...webdesignsMedia, ...tobejsonMedia];

        // filtering
        const { type, source, shuffle, limit, cursor } = req.query;
        if (source && source !== 'all') {
            allMedia = allMedia.filter(m => m.source === source);
        }
        if (type) {
            allMedia = allMedia.filter(m => m.type === type);
        }

        // optional shuffle:
        // - if seed is provided => stable randomized order (good for pagination/infinite scroll)
        // - otherwise fall back to Math.random (not stable)
        const { seed } = req.query;
        if (seed) {
            allMedia = seededOrder(allMedia, seed);
        } else if (String(shuffle) === '1' || String(shuffle).toLowerCase() === 'true') {
            allMedia = allMedia.sort(() => 0.5 - Math.random());
        }

        // stable pagination by index cursor
        const { slice: pageItems, nextCursor } = paginate(allMedia, limit, cursor);

        // add absolute URL for frontends hosted elsewhere
        const withUrls = (items) => items.map(item => ({
            ...item,
            url: `${baseUrl}${item.path}`
        }));

        res.json({
            success: true,
            data: {
                webdesigns: withUrls(webdesignsMedia),
                tobejson: withUrls(tobejsonMedia),
                all: withUrls(allMedia),
                page: withUrls(pageItems),
                nextCursor,
                total: allMedia.length
            }
        });

    } catch (error) {
        console.error('Error getting media files:', error);
        res.status(500).json({
            error: 'Failed to get media files',
            details: error.message
        });
    }
});

// Instagram Scraping API Endpoint
app.post('/api/scrape-instagram', async (req, res) => {
    try {
        const { username, postCount = 50 } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        console.log(`Starting Instagram scrape for @${username}, ${postCount} posts`);

        // Run the Python scraper script
        const pythonProcess = spawn('python', ['scrape_instagram.py'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Send input to Python script
        pythonProcess.stdin.write(`${username}\n${postCount}\n`);
        pythonProcess.stdin.end();

        let output = '';
        let errorOutput = '';

        // Collect output from Python script
        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        // Wait for Python script to complete
        await new Promise((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Python script exited with code ${code}`));
                }
            });
        });

        // Look for the generated JSON file
        const files = await fs.readdir('.');
        const jsonFiles = files.filter(file => 
            file.includes(username) && file.endsWith('.json')
        );

        if (jsonFiles.length === 0) {
            throw new Error('No JSON file was generated');
        }

        // Get the most recent file for this username
        const latestFile = jsonFiles.sort().pop();
        const filePath = path.join(__dirname, latestFile);

        // Read and parse the JSON file
        const jsonData = await fs.readFile(filePath, 'utf8');
        const scrapedData = JSON.parse(jsonData);

        // Move the file to public directory for frontend access
        const publicFilePath = path.join(__dirname, 'public', latestFile);
        await fs.copyFile(filePath, publicFilePath);

        console.log(`Instagram scrape completed for @${username}`);

        res.json({
            success: true,
            message: `Successfully scraped ${scrapedData.total_posts} posts from @${username}`,
            data: scrapedData,
            filename: latestFile
        });

    } catch (error) {
        console.error('Instagram scraping error:', error);
        res.status(500).json({
            error: 'Failed to scrape Instagram posts',
            details: error.message
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve media files from webdesigns directory
app.use('/webdesigns', express.static(path.join(__dirname, 'public', 'webdesigns')));

// Serve media files from tobejson directory
app.use('/tobejson', express.static(path.join(__dirname, 'public', 'tobejson')));

// MongoDB Connection
const connectDB = async () => {
    try {
        console.log('Attempting to connect to MongoDB...');
        const mongoURI = process.env.MONGODB_URI;
        if (!mongoURI) {
            throw new Error('MONGODB_URI environment variable is not set.');
        }
        console.log('MongoDB URI:', mongoURI);
        
        const conn = await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000
        });
        
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        
        // Create collections if they don't exist
        const collections = await conn.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        console.log('Existing collections:', collectionNames);
        
        if (!collectionNames.includes('users')) {
            await conn.connection.db.createCollection('users');
            console.log('Users collection created');
        }
    } catch (err) {
        console.error('MongoDB Connection Error Details:', {
            name: err.name,
            message: err.message,
            code: err.code,
            stack: err.stack
        });
        process.exit(1);
    }
};

connectDB();

// Serve specific HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/thank-you', (req, res) => {
    console.log('Thank-you page requested');
    res.sendFile(path.join(__dirname, 'public', 'thank-you.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all route for other static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', req.path));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        message: 'Internal server error',
        error: err.message
    });
});

// Start HTTP server (always, not just in development)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`HTTP Server running on port ${PORT}`);
    console.log(`Frontend available at: http://localhost:${PORT}`);
});

// Export for Vercel
module.exports = app; 