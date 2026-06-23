const mongoose = require('mongoose');

const ScanDeviceSchema = new mongoose.Schema({
  ip: { type: String, default: '' },
  mac: { type: String, lowercase: true, default: '' },
  type: { type: String, default: 'client' },
  nickname: { type: String, default: '' }
}, { _id: false });

const ScanNearbySchema = new mongoose.Schema({
  ssid: { type: String, default: '' },
  auth: { type: String, default: '' },
  signal: { type: Number, default: 0 },
  band: { type: String, default: '' },
  channel: { type: Number, default: 0 }
}, { _id: false });

const ScanSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  deviceCount: {
    type: Number,
    required: true
  },
  nearbyCount: {
    type: Number,
    required: true
  },
  signalStrength: {
    type: Number,
    default: 0
  },
  ssid: {
    type: String,
    default: ''
  },
  devices: [ScanDeviceSchema],
  nearby: [ScanNearbySchema]
});

module.exports = mongoose.model('Scan', ScanSchema);
