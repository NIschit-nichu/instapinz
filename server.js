const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
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

// API endpoint to get all media files from webdesigns and tobejson directories
app.get('/api/media-files', async (req, res) => {
    try {
        const webdesignsPath = path.join(__dirname, 'public', 'webdesigns');
        const tobejsonPath = path.join(__dirname, 'public', 'tobejson');
        
        // Get files from webdesigns directory (handle missing dir)
        const webdesignsFiles = await safeReadDir(webdesignsPath);
        const webdesignsMedia = webdesignsFiles
            .filter(file => {
                const ext = file.toLowerCase().split('.').pop();
                return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'mp4', 'webm', 'ogg', 'mov'].includes(ext);
            })
            .map(file => ({
                filename: file,
                path: `/webdesigns/${file}`,
                type: file.toLowerCase().split('.').pop() === 'mp4' ? 'video' : 'image',
                source: 'webdesigns'
            }));

        // Get files from tobejson directory (handle missing dir)
        const tobejsonFiles = await safeReadDir(tobejsonPath);
        const tobejsonMedia = tobejsonFiles
            .filter(file => {
                const ext = file.toLowerCase().split('.').pop();
                return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'mp4', 'webm', 'ogg', 'mov'].includes(ext);
            })
            .map(file => ({
                filename: file,
                path: `/tobejson/${file}`,
                type: file.toLowerCase().split('.').pop() === 'mp4' ? 'video' : 'image',
                source: 'tobejson'
            }));

        // Combine and shuffle all media files
        const allMedia = [...webdesignsMedia, ...tobejsonMedia];
        const shuffledMedia = allMedia.sort(() => 0.5 - Math.random());

        res.json({
            success: true,
            data: {
                webdesigns: webdesignsMedia,
                tobejson: tobejsonMedia,
                all: shuffledMedia,
                total: shuffledMedia.length
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
        // Use environment variable for MongoDB URI, fallback to local for development
        const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/saas-landing';
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
        // Don't exit process in production, just log the error
        if (process.env.NODE_ENV === 'production') {
            console.error('MongoDB connection failed in production');
        } else {
            process.exit(1);
        }
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