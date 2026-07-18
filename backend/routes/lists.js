const express = require('express');
const ReadingList = require('../models/ReadingList');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/lists
router.get('/', auth, async (req, res) => {
  try {
    const lists = await ReadingList.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(lists);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/lists
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'List name is required' });
    }
    const list = await ReadingList.create({
      userId: req.userId,
      name: name.trim(),
      bookIds: [],
    });
    res.status(201).json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/lists/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { bookId } = req.body;
    if (!bookId) {
      return res.status(400).json({ message: 'bookId is required' });
    }
    const list = await ReadingList.findOne({ _id: req.params.id, userId: req.userId });
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }
    const idx = list.bookIds.indexOf(bookId);
    if (idx >= 0) {
      list.bookIds.splice(idx, 1);
    } else {
      list.bookIds.push(bookId);
    }
    await list.save();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/lists/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const list = await ReadingList.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }
    res.json({ message: 'List deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
