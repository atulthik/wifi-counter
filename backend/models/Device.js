const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  mac: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  nickname: {
    type: String,
    default: ''
  },
  firstSeen: {
    type: Date,
    default: Date.now
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isAllowed: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Device', DeviceSchema);
