const mongoose = require('mongoose');

const readingListSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  bookIds: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('ReadingList', readingListSchema);
