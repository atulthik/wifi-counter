const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  type: {
    type: String,
    enum: ['new_device', 'signal_drop', 'device_count_exceeded', 'info'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  isCleared: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('Alert', AlertSchema);
