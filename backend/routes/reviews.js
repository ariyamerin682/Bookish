const express = require('express');
const Review = require('../models/Review');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/reviews/:bookVolumeId
router.get('/:bookVolumeId', async (req, res) => {
  try {
    const reviews = await Review.find({ bookVolumeId: req.params.bookVolumeId })
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/reviews
router.post('/', auth, async (req, res) => {
  try {
    const { bookVolumeId, rating, text } = req.body;
    if (!bookVolumeId || !rating) {
      return res.status(400).json({ message: 'bookVolumeId and rating are required' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    const user = await User.findById(req.userId);
    const review = await Review.create({
      bookVolumeId,
      userId: req.userId,
      userName: user.name,
      rating: Number(rating),
      text: text || '',
    });
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/reviews/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    if (review.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    await review.deleteOne();
    res.json({ message: 'Review deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
