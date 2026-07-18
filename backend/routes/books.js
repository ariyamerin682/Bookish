const express = require('express');
const axios = require('axios');
const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchGoogleBooks(query, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const params = { q: query, maxResults: 20 };
      if (process.env.GOOGLE_BOOKS_API_KEY) {
        params.key = process.env.GOOGLE_BOOKS_API_KEY;
      }
      const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
        params,
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      if (err.response && err.response.status === 429 && i < retries - 1) {
        await sleep(2000 * (i + 1));
        continue;
      }
      throw err;
    }
  }
}

// GET /api/books/search?q=...
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    const cached = getCached(q.toLowerCase());
    if (cached) return res.json(cached);
    const data = await fetchGoogleBooks(q);
    const books = (data.items || []).map(item => {
      const info = item.volumeInfo || {};
      return {
        id: item.id, volumeId: item.id,
        title: info.title || 'Untitled',
        authors: info.authors ? info.authors.join(', ') : 'Unknown',
        cover: info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : null,
        description: info.description || '',
        pageCount: info.pageCount || 0, rating: info.averageRating || 0,
        publishedDate: info.publishedDate || '',
        publisher: info.publisher || '',
        categories: info.categories || [],
      };
    });
    setCache(q.toLowerCase(), books);
    res.json(books);
  } catch (err) {
    console.error('Google Books API error:', err.message);
    res.status(500).json({ message: 'Error fetching books. Please try again.' });
  }
});

// POST /api/books/favorite/toggle
router.post('/favorite/toggle', auth, async (req, res) => {
  try {
    const { bookId } = req.body;
    if (!bookId) {
      return res.status(400).json({ message: 'bookId is required' });
    }
    const user = await User.findById(req.userId);
    const idx = user.favorites.indexOf(bookId);
    if (idx >= 0) {
      user.favorites.splice(idx, 1);
    } else {
      user.favorites.push(bookId);
    }
    await user.save();
    res.json({ favorites: user.favorites });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/books/favorites
router.get('/favorites', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ favorites: user.favorites });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
