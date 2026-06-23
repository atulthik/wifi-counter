const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Scan = require('../models/Scan');
const Device = require('../models/Device');
const Alert = require('../models/Alert');

const FALLBACK_FILE_PATH = path.join(__dirname, '..', 'db_fallback.json');

let isConnected = false;
let useFallback = false;

// Ensure fallback JSON exists with default structure
function initFallbackFile() {
  if (!fs.existsSync(FALLBACK_FILE_PATH)) {
    fs.writeFileSync(
      FALLBACK_FILE_PATH,
      JSON.stringify({ devices: [], scans: [], alerts: [] }, null, 2)
    );
  }
}

function readFallback() {
  try {
    initFallbackFile();
    const data = fs.readFileSync(FALLBACK_FILE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading fallback file:', err);
    return { devices: [], scans: [], alerts: [] };
  }
}

function writeFallback(data) {
  try {
    fs.writeFileSync(FALLBACK_FILE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing fallback file:', err);
  }
}

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wifi-count';
  try {
    console.log(`Connecting to MongoDB at: ${uri}...`);
    // Connect with a 3-second timeout so it fails quickly if MongoDB isn't running
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000
    });
    isConnected = true;
    useFallback = false;
    console.log('MongoDB connected successfully.');
  } catch (err) {
    console.warn('⚠️ MongoDB connection failed. Falling back to local file database (db_fallback.json)');
    isConnected = false;
    useFallback = true;
    initFallbackFile();
  }
}

// Database Helpers
const db = {
  // Device nicknames
  getDeviceNicknames: async () => {
    if (isConnected && !useFallback) {
      try {
        const devices = await Device.find({});
        const map = {};
        devices.forEach(d => {
          map[d.mac] = d.nickname;
        });
        return map;
      } catch (err) {
        console.error('MongoDB read error, switching to fallback:', err);
      }
    }
    
    // Fallback
    const local = readFallback();
    const map = {};
    (local.devices || []).forEach(d => {
      map[d.mac] = d.nickname;
    });
    return map;
  },

  setDeviceNickname: async (mac, nickname) => {
    mac = mac.toLowerCase();
    if (isConnected && !useFallback) {
      try {
        await Device.findOneAndUpdate(
          { mac },
          { nickname, lastSeen: new Date() },
          { upsert: true, new: true }
        );
        return { success: true };
      } catch (err) {
        console.error('MongoDB write error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    const devices = local.devices || [];
    const idx = devices.findIndex(d => d.mac === mac);
    if (idx !== -1) {
      devices[idx].nickname = nickname;
      devices[idx].lastSeen = new Date();
    } else {
      devices.push({
        mac,
        nickname,
        firstSeen: new Date(),
        lastSeen: new Date(),
        isAllowed: true
      });
    }
    local.devices = devices;
    writeFallback(local);
    return { success: true };
  },

  getDevices: async () => {
    if (isConnected && !useFallback) {
      try {
        return await Device.find({});
      } catch (err) {
        console.error('MongoDB read devices error, using fallback:', err);
      }
    }
    // Fallback
    const local = readFallback();
    return local.devices || [];
  },

  setDeviceAllowed: async (mac, isAllowed) => {
    mac = mac.toLowerCase();
    if (isConnected && !useFallback) {
      try {
        await Device.findOneAndUpdate(
          { mac },
          { isAllowed, lastSeen: new Date() },
          { upsert: true, new: true }
        );
        return { success: true };
      } catch (err) {
        console.error('MongoDB write allowed error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    const devices = local.devices || [];
    const idx = devices.findIndex(d => d.mac === mac);
    if (idx !== -1) {
      devices[idx].isAllowed = isAllowed;
      devices[idx].lastSeen = new Date();
    } else {
      devices.push({
        mac,
        nickname: '',
        firstSeen: new Date(),
        lastSeen: new Date(),
        isAllowed
      });
    }
    local.devices = devices;
    writeFallback(local);
    return { success: true };
  },

  // Scans
  saveScan: async (scanData) => {
    // Lookup nicknames to enrich scanner data
    const nicknamesMap = await db.getDeviceNicknames();
    const enrichedDevices = scanData.devices.map(d => ({
      ...d,
      nickname: nicknamesMap[d.mac] || ''
    }));

    const finalScan = {
      timestamp: scanData.timestamp || new Date(),
      deviceCount: enrichedDevices.length,
      nearbyCount: scanData.nearby.length,
      signalStrength: scanData.connection ? scanData.connection.signal : 0,
      ssid: scanData.connection ? scanData.connection.ssid : '',
      devices: enrichedDevices,
      nearby: scanData.nearby.map(n => ({
        ssid: n.ssid,
        auth: n.auth || '',
        signal: n.bssids && n.bssids[0] ? n.bssids[0].signal : 0,
        band: n.bssids && n.bssids[0] ? n.bssids[0].band : '',
        channel: n.bssids && n.bssids[0] ? n.bssids[0].channel : 0
      }))
    };

    if (isConnected && !useFallback) {
      try {
        await Scan.create(finalScan);
        return finalScan;
      } catch (err) {
        console.error('MongoDB write scan error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    local.scans = local.scans || [];
    local.scans.push(finalScan);
    
    // Cap historical scans to 150 entries in local JSON file to keep it fast
    if (local.scans.length > 150) {
      local.scans.shift();
    }
    writeFallback(local);
    return finalScan;
  },

  getHistory: async (limit = 50) => {
    if (isConnected && !useFallback) {
      try {
        return await Scan.find({}).sort({ timestamp: -1 }).limit(limit);
      } catch (err) {
        console.error('MongoDB read history error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    const scans = local.scans || [];
    // Return sorted descending (newest first)
    return [...scans].reverse().slice(0, limit);
  },

  // Alerts
  saveAlert: async (type, message, severity = 'low') => {
    const newAlert = {
      timestamp: new Date(),
      type,
      message,
      severity,
      isCleared: false
    };

    if (isConnected && !useFallback) {
      try {
        const AlertModel = require('../models/Alert');
        await AlertModel.create(newAlert);
        return newAlert;
      } catch (err) {
        console.error('MongoDB write alert error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    local.alerts = local.alerts || [];
    local.alerts.push(newAlert);
    if (local.alerts.length > 100) {
      local.alerts.shift();
    }
    writeFallback(local);
    return newAlert;
  },

  getAlerts: async () => {
    if (isConnected && !useFallback) {
      try {
        return await Alert.find({ isCleared: false }).sort({ timestamp: -1 });
      } catch (err) {
        console.error('MongoDB read alerts error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    return (local.alerts || []).filter(a => !a.isCleared).reverse();
  },

  clearAlerts: async () => {
    if (isConnected && !useFallback) {
      try {
        await Alert.updateMany({ isCleared: false }, { isCleared: true });
        return { success: true };
      } catch (err) {
        console.error('MongoDB clear alerts error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    local.alerts = (local.alerts || []).map(a => ({ ...a, isCleared: true }));
    writeFallback(local);
    return { success: true };
  },

  clearAlert: async (timestamp) => {
    const time = new Date(timestamp);
    if (isConnected && !useFallback) {
      try {
        await Alert.updateOne({ timestamp: time }, { isCleared: true });
        return { success: true };
      } catch (err) {
        console.error('MongoDB clear alert error, using fallback:', err);
      }
    }

    // Fallback
    const local = readFallback();
    local.alerts = (local.alerts || []).map(a => {
      if (new Date(a.timestamp).getTime() === time.getTime()) {
        return { ...a, isCleared: true };
      }
      return a;
    });
    writeFallback(local);
    return { success: true };
  },

  getUseFallback: () => useFallback,
  getIsConnected: () => isConnected
};

module.exports = {
  connectDB,
  db
};
