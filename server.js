const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const axios = require('axios');
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

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function normalizeTitle(title) {
    return String(title || '').trim().replace(/\s+/g, ' ');
}

function categorizeTrend(title) {
    const t = String(title || '').toLowerCase();
    const rules = [
        { category: 'Sports', words: ['cricket', 'ipl', 'football', 'fifa', 'nba', 'tennis', 'match', 'olympic'] },
        { category: 'Movies', words: ['movie', 'film', 'trailer', 'box office', 'cinema', 'release'] },
        { category: 'Music', words: ['song', 'music', 'album', 'single', 'concert', 'spotify', 'singer'] },
        { category: 'War/News', words: ['war', 'attack', 'strike', 'missile', 'election', 'president', 'minister', 'conflict'] },
        { category: 'Tech', words: ['ai', 'iphone', 'android', 'chatgpt', 'meta', 'google', 'microsoft', 'tesla', 'startup'] },
        { category: 'Lifestyle', words: ['glow up', 'fitness', 'fashion', 'makeup', 'skincare', 'diet', 'gym', 'travel'] }
    ];
    for (const rule of rules) {
        if (rule.words.some(word => t.includes(word))) return rule.category;
    }
    return 'Viral';
}

function scoreByRecency(dateString) {
    if (!dateString) return 0;
    const ts = new Date(dateString).getTime();
    if (!Number.isFinite(ts)) return 0;
    const hours = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
    if (hours <= 6) return 12;
    if (hours <= 24) return 9;
    if (hours <= 72) return 6;
    return 2;
}

async function getGoogleRssTrends(geo = 'IN') {
    const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
    const { data } = await axios.get(url, { timeout: 12000 });
    const xml = String(data || '');
    const items = [...xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g)];
    return items.slice(0, 30).map((match, index) => {
        const rawTitle = normalizeTitle(match[1]);
        return {
            id: `google-${geo}-${index}-${rawTitle.toLowerCase()}`,
            title: rawTitle,
            category: categorizeTrend(rawTitle),
            source: `google-${geo.toLowerCase()}`,
            mediaType: 'text',
            mediaUrl: `https://www.google.com/search?q=${encodeURIComponent(rawTitle)}`,
            thumbnailUrl: null,
            score: 85 - index + scoreByRecency(match[2]),
            publishedAt: new Date(match[2]).toISOString()
        };
    });
}

async function getRedditTrends() {
    const url = 'https://www.reddit.com/r/popular/hot.json?limit=35';
    const { data } = await axios.get(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'instapinz-trends/1.0' }
    });
    const posts = data?.data?.children || [];
    return posts.map((entry, index) => {
        const post = entry?.data || {};
        const title = normalizeTitle(decodeHtmlEntities(post.title || ''));
        const mediaUrl = post?.is_video
            ? post?.media?.reddit_video?.fallback_url || null
            : (post?.post_hint === 'image' ? post?.url_overridden_by_dest || null : null);
        const mediaType = post?.is_video ? 'video' : (post?.post_hint === 'image' ? 'image' : 'text');
        return {
            id: `reddit-${post.id || index}`,
            title,
            category: categorizeTrend(title),
            source: 'reddit',
            mediaType,
            mediaUrl: mediaUrl || (post.permalink ? `https://www.reddit.com${post.permalink}` : null),
            thumbnailUrl: post?.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : null,
            score: Math.min(95, 40 + Math.log10(Math.max(1, Number(post.score) || 1)) * 20) + scoreByRecency(new Date((post.created_utc || 0) * 1000).toISOString()),
            publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null
        };
    });
}

async function getYouTubeTrends() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return [];
    const url = 'https://www.googleapis.com/youtube/v3/videos';
    const fetchByRegion = async (regionCode, maxResults) => {
        const { data } = await axios.get(url, {
            timeout: 12000,
            params: {
                key: apiKey,
                part: 'snippet,statistics',
                chart: 'mostPopular',
                regionCode,
                maxResults
            }
        });
        return data?.items || [];
    };
    const [inVideos, usVideos] = await Promise.all([
        fetchByRegion('IN', 25),
        fetchByRegion('US', 15)
    ]);
    const videos = [...inVideos, ...usVideos];
    return videos.map((item, index) => {
        const title = normalizeTitle(item?.snippet?.title || '');
        const views = Number(item?.statistics?.viewCount) || 0;
        return {
            id: `youtube-${item.id || index}`,
            title,
            category: categorizeTrend(title),
            source: 'youtube',
            mediaType: 'video',
            mediaUrl: item?.id ? `https://www.youtube.com/embed/${item.id}` : null,
            thumbnailUrl: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.medium?.url || null,
            score: Math.min(100, 55 + Math.log10(Math.max(1, views)) * 8) + scoreByRecency(item?.snippet?.publishedAt),
            publishedAt: item?.snippet?.publishedAt || null
        };
    });
}

async function readTrendKeywords() {
    try {
        const filePath = path.join(__dirname, 'public', 'trending-keywords.json');
        const raw = await fs.readFile(filePath, 'utf8');
        // tolerate BOM and accidental trailing commas/newlines
        const cleaned = String(raw).replace(/^\uFEFF/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
            return parsed.map(k => normalizeTitle(k).toLowerCase()).filter(Boolean);
        }
        if (Array.isArray(parsed?.keywords)) {
            return parsed.keywords.map(k => normalizeTitle(k).toLowerCase()).filter(Boolean);
        }
        // Supports grouped schema: { "🔥": { category, keywords: [] }, ... }
        if (parsed && typeof parsed === 'object') {
            const grouped = Object.values(parsed)
                .flatMap(group => Array.isArray(group?.keywords) ? group.keywords : [])
                .map(k => normalizeTitle(k).toLowerCase())
                .filter(Boolean);
            if (grouped.length) return [...new Set(grouped)];
        }
        return [];
    } catch (err) {
        console.warn('Failed to parse trending-keywords.json:', err.message);
        return [];
    }
}

function keywordBoostScore(title, keywords) {
    const t = String(title || '').toLowerCase();
    let boost = 0;
    for (const kw of keywords) {
        if (!kw) continue;
        if (t.includes(kw)) boost += 8;
    }
    return boost;
}

function expandKeywords(keywords) {
    const base = keywords && keywords.length ? keywords : ['sports', 'tech', 'ai', 'gaming', 'glowup'];
    const variants = [];
    for (const kw of base) {
        variants.push(kw);
        variants.push(`${kw} trend`);
        variants.push(`${kw} india`);
        variants.push(`${kw} global`);
    }
    return [...new Set(variants.map(v => normalizeTitle(v).toLowerCase()).filter(Boolean))];
}

async function getPinterestByKeywords(keywords) {
    const queries = expandKeywords(keywords).slice(0, 12);
    const reqs = queries.map(async (q) => {
        const url = `https://in.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`;
        const { data } = await axios.get(url, {
            timeout: 12000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        const html = String(data || '');
        const pinUrls = [...html.matchAll(/https?:\/\/(?:[a-z]{2}\.)?pinterest\.[^"'\s]+\/pin\/\d+[^\s"']*/g)].map(m => m[0]);
        const imageUrls = [...html.matchAll(/https:\/\/i\.pinimg\.com\/[^"'\s]+/g)]
            .map(m => cleanPinterestImageUrl(m[0]))
            .filter(Boolean);
        const max = Math.min(12, Math.max(pinUrls.length, imageUrls.length));
        const out = [];
        for (let i = 0; i < max; i++) {
            const pinPageUrl = pinUrls[i] || `https://in.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`;
            const thumb = imageUrls[i] || pinterestPlaceholder(`#${q}`);
            out.push({
                id: `pinterest-web-${q}-${i}`,
                title: normalizeTitle(`#${q}`),
                category: categorizeTrend(q),
                source: 'pinterest-web',
                mediaType: 'text',
                mediaUrl: pinPageUrl,
                thumbnailUrl: thumb,
                score: 74 - i,
                publishedAt: new Date().toISOString()
            });
        }
        return out;
    });
    const settled = await Promise.allSettled(reqs);
    return settled.filter(s => s.status === 'fulfilled').flatMap(s => s.value);
}

async function getPinterestTrendingRSS() {
    // Secondary Pinterest method (region/global signals)
    const rssUrl = 'https://trends.pinterest.com/rss';
    const { data } = await axios.get(rssUrl, { timeout: 12000 });
    const xml = String(data || '');
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?(?:<link>(.*?)<\/link>)?[\s\S]*?<\/item>/g)];
    return items.slice(0, 40).map((m, i) => {
        const title = normalizeTitle(decodeHtmlEntities(m[1] || 'Pinterest trend'));
        return {
            id: `pinterest-rss-${i}-${title.toLowerCase()}`,
            title,
            category: categorizeTrend(title),
            source: 'pinterest-rss',
            mediaType: 'text',
            mediaUrl: m[2] || `https://trends.pinterest.com/`,
            thumbnailUrl: pinterestPlaceholder(title),
            score: 70 - i,
            publishedAt: new Date().toISOString()
        };
    });
}

async function getYouTubeByKeywords(keywords) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey || !keywords.length) return [];
    const url = 'https://www.googleapis.com/youtube/v3/search';
    const selected = keywords.slice(0, 10);
    const requests = selected.map(async (q) => {
        const { data } = await axios.get(url, {
            timeout: 12000,
            params: {
                key: apiKey,
                part: 'snippet',
                q,
                type: 'video',
                maxResults: 10,
                order: 'viewCount',
                regionCode: 'IN',
                relevanceLanguage: 'en'
            }
        });
        return (data?.items || []).map((item, idx) => ({
            id: `youtube-search-${item?.id?.videoId || idx}-${q}`,
            title: normalizeTitle(item?.snippet?.title || ''),
            category: categorizeTrend(item?.snippet?.title || q),
            source: 'youtube-search',
            mediaType: 'video',
            mediaUrl: item?.id?.videoId ? `https://www.youtube.com/embed/${item.id.videoId}` : null,
            thumbnailUrl: item?.snippet?.thumbnails?.high?.url || item?.snippet?.thumbnails?.medium?.url || null,
            score: 70 - idx + 10,
            publishedAt: item?.snippet?.publishedAt || null
        }));
    });
    const settled = await Promise.allSettled(requests);
    return settled
        .filter(s => s.status === 'fulfilled')
        .flatMap(s => s.value);
}

function pickTopN(items, n) {
    return [...items].sort((a, b) => b.score - a.score).slice(0, n);
}

function shuffleArray(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function pinterestPlaceholder(title) {
    return `https://placehold.co/640x360/f8fafc/334155?text=${encodeURIComponent((title || 'Pinterest trend').slice(0, 50))}`;
}

function cleanPinterestImageUrl(url) {
    if (!url) return null;
    let out = String(url).trim();
    out = out.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (!out.startsWith('http')) return null;
    return out;
}

function internetFallbackImage(title, index = 0) {
    const raw = String(title || 'trending').toLowerCase();
    const keyword = raw.replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).slice(0, 2).join(',');
    const safeKeyword = keyword || 'trending';
    const lock = Math.abs(fnv1a32(`${safeKeyword}|${index}`)) % 10000;
    // keyword-based random stock image
    return `https://loremflickr.com/640/360/${encodeURIComponent(safeKeyword)}?lock=${lock}`;
}

function ensureVisualPreview(items) {
    return items.map((item, idx) => {
        if (item.thumbnailUrl && String(item.thumbnailUrl).startsWith('http')) return item;
        return {
            ...item,
            thumbnailUrl: internetFallbackImage(item.title, idx)
        };
    });
}

function buildPinterestFallback(keywords, count = 40) {
    const pool = (keywords && keywords.length ? keywords : [
        'glowup', 'sports', 'gaming', 'tech', 'ai', 'fitness', 'fashion', 'travel'
    ]);
    const out = [];
    for (let i = 0; i < count; i++) {
        const kw = pool[i % pool.length];
        const title = `Pinterest: ${kw}`;
        out.push({
            id: `pinterest-fallback-${i}-${kw}`,
            title,
            category: categorizeTrend(kw),
            source: 'pinterest-fallback',
            mediaType: 'text',
            mediaUrl: `https://in.pinterest.com/search/pins/?q=${encodeURIComponent(kw)}`,
            thumbnailUrl: pinterestPlaceholder(kw),
            score: 68 - (i % 10),
            publishedAt: new Date().toISOString()
        });
    }
    return out;
}

function pickRandomWithReplacement(items, n) {
    if (!items.length || n <= 0) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(items[Math.floor(Math.random() * items.length)]);
    }
    return out;
}

function pickWindowFromPool(items, count, offset, seed) {
    if (!Array.isArray(items) || !items.length || count <= 0) return [];
    const ordered = seededOrder(items, seed);
    const start = Math.max(0, Number(offset) || 0);
    const out = [];
    for (let i = 0; i < count; i++) {
        out.push(ordered[(start + i) % ordered.length]);
    }
    return out;
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

// Real-time trend feed endpoint (India-first + global blend)
app.get('/api/trending', async (req, res) => {
    try {
        const keywords = await readTrendKeywords();
        const focusKeyword = normalizeTitle(req.query.focus || '').toLowerCase();
        const feedKeywords = focusKeyword ? [focusKeyword, ...keywords] : keywords;
        const [googleInResult, googleUsResult, redditResult, youtubeResult, pinterestWebResult, pinterestRssResult, youtubeKeywordResult] = await Promise.allSettled([
            getGoogleRssTrends('IN'),
            getGoogleRssTrends('US'),
            getRedditTrends(),
            getYouTubeTrends(),
            getPinterestByKeywords(feedKeywords),
            getPinterestTrendingRSS(),
            getYouTubeByKeywords(feedKeywords)
        ]);

        const sources = [];
        let googleItems = [];
        let redditItems = [];
        let youtubeItems = [];
        let pinterestItems = [];

        if (googleInResult.status === 'fulfilled') {
            googleItems.push(...googleInResult.value);
            sources.push('google-in');
        }
        if (googleUsResult.status === 'fulfilled') {
            googleItems.push(...googleUsResult.value.map(item => ({ ...item, score: item.score - 6 })));
            sources.push('google-us');
        }
        if (redditResult.status === 'fulfilled') {
            redditItems = redditResult.value;
            sources.push('reddit');
        }
        if (youtubeResult.status === 'fulfilled') {
            youtubeItems.push(...youtubeResult.value);
            sources.push('youtube');
        }
        if (pinterestWebResult.status === 'fulfilled') {
            pinterestItems.push(...pinterestWebResult.value);
            sources.push('pinterest-web');
        }
        if (pinterestRssResult.status === 'fulfilled') {
            pinterestItems.push(...pinterestRssResult.value);
            sources.push('pinterest-rss');
        }
        if (youtubeKeywordResult.status === 'fulfilled') {
            youtubeItems.push(...youtubeKeywordResult.value);
            sources.push('youtube-search');
        }

        // Ensure Pinterest always has data
        if (pinterestItems.length < 40) {
            const needed = 40 - pinterestItems.length;
            pinterestItems.push(...buildPinterestFallback(keywords, needed));
        }

        const dedupe = (items) => {
            const byTitle = new Map();
            for (const item of items) {
                const key = (item.title || '').toLowerCase();
                const existing = byTitle.get(key);
                if (!existing || item.score > existing.score) byTitle.set(key, item);
            }
            return [...byTitle.values()];
        };

        pinterestItems = dedupe(pinterestItems);
        googleItems = dedupe(googleItems);
        youtubeItems = dedupe(youtubeItems);
        redditItems = dedupe(redditItems);

        const boostItems = (items) => items.map(item => ({
            ...item,
            score: item.score + keywordBoostScore(item.title, feedKeywords)
        }));

        pinterestItems = boostItems(pinterestItems);
        googleItems = boostItems(googleItems);
        youtubeItems = boostItems(youtubeItems);
        redditItems = boostItems(redditItems);

        const limit = 100;
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const redditCount = 40;
        const pinterestCount = 20;
        const googleCount = 20;
        const youtubeCount = 20;

        const pinterestPool = pickTopN(pinterestItems, Math.max(120, pinterestItems.length));
        const googlePool = pickTopN(googleItems, Math.max(120, googleItems.length));
        const youtubePool = pickTopN(youtubeItems, Math.max(120, youtubeItems.length));
        const redditPool = pickTopN(redditItems, Math.max(120, redditItems.length));

        const baseSeed = `${focusKeyword || 'all'}|${offset}`;
        const mixed = ensureVisualPreview(shuffleArray([
            ...pickWindowFromPool(redditPool, redditCount, offset, `${baseSeed}|reddit`),
            ...pickWindowFromPool(pinterestPool, pinterestCount, offset, `${baseSeed}|pinterest`),
            ...pickWindowFromPool(googlePool, googleCount, offset, `${baseSeed}|google`),
            ...pickWindowFromPool(youtubePool, youtubeCount, offset, `${baseSeed}|youtube`)
        ])).map((item, idx) => ({
            ...item,
            id: `${item.id}-o${offset}-i${idx}`,
            rank: offset + idx + 1
        }));

        const page = mixed;
        const hasMore = true;

        res.json({
            success: true,
            meta: {
                total: mixed.length,
                limit,
                offset,
                hasMore,
                refreshedAt: new Date().toISOString(),
                sources,
                audience: '16-35',
                keywordsUsed: feedKeywords.length,
                focusKeyword: focusKeyword || null,
                mixRatio: {
                    pinterest: `${pinterestCount}/${limit}`,
                    google: `${googleCount}/${limit}`,
                    youtube: `${youtubeCount}/${limit}`,
                    reddit: `${redditCount}/${limit}`
                }
            },
            data: page
        });
    } catch (error) {
        console.error('Error getting trends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch trends',
            details: error.message
        });
    }
});

app.get('/api/trending-keywords', async (req, res) => {
    try {
        const keywords = await readTrendKeywords();
        res.json({ success: true, data: keywords });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/image-proxy', async (req, res) => {
    try {
        const url = String(req.query.url || '');
        if (!url || !/^https?:\/\//i.test(url)) {
            return res.status(400).send('Invalid url');
        }
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 12000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.pinterest.com/'
            }
        });
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(Buffer.from(response.data));
    } catch (error) {
        return res.status(404).send('Image unavailable');
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

app.get('/trending', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trending.html'));
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