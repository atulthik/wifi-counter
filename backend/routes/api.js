const express = require('express');
const router = express.Router();
const { runFullScan } = require('../utils/scanner');
const { db } = require('../utils/db');

// GET /api/scan/current
router.get('/scan/current', async (req, res) => {
  try {
    const runSweep = req.query.sweep === 'true';
    console.log(`Triggering scanner scan (ping sweep: ${runSweep})...`);
    
    // 1. Run the system commands
    const rawScan = await runFullScan({ runSweep });
    
    // 2. Fetch all known device nicknames & MACs
    const nicknames = await db.getDeviceNicknames();
    const devicesConfig = await db.getDevices();
    
    // 3. Enrich scan devices with nicknames & allowed status
    rawScan.devices = rawScan.devices.map(d => {
      const config = devicesConfig.find(c => c.mac === d.mac);
      return {
        ...d,
        nickname: nicknames[d.mac] || '',
        isAllowed: config ? config.isAllowed : true
      };
    });

    // 4. Save scan to database
    const savedScan = await db.saveScan(rawScan);

    // 5. Detect and trigger alerts
    // Check if new device MAC is found (i.e. not in our nickname DB or seen before)
    const knownMacs = Object.keys(nicknames);
    
    // Add default router/host macs if not already there, so we don't alert on standard nodes
    const hostMac = rawScan.connection ? rawScan.connection.mac : null;
    const gatewayMac = rawScan.devices.find(d => d.type === 'gateway')?.mac;
    
    for (let device of rawScan.devices) {
      // Check if unauthorized (blocked) device is active
      const config = devicesConfig.find(c => c.mac === device.mac);
      if (config && config.isAllowed === false) {
        const message = `Security Threat: Blocked device at IP ${device.ip} (${device.mac}) is connected to your Wi-Fi!`;
        console.log(`🚨 SECURITY ALERT: ${message}`);
        await db.saveAlert('new_device', message, 'high');
      }

      // Check if completely new device
      const isKnown = knownMacs.includes(device.mac) || 
                      device.mac === hostMac || 
                      device.mac === gatewayMac;
      
      if (!isKnown && device.mac && device.mac !== '00:00:00:00:00:00') {
        const message = `New unrecognized device detected on Wi-Fi: IP ${device.ip} (${device.mac})`;
        console.log(`🚨 ALERT: ${message}`);
        await db.saveAlert('new_device', message, 'medium');
        
        // Auto-initialize the device in nicknames DB so we only alert once
        await db.setDeviceNickname(device.mac, '');
      }
    }

    // Check if signal drops below critical (e.g. 50%)
    if (rawScan.connection && rawScan.connection.signal > 0 && rawScan.connection.signal < 50) {
      const message = `Weak Wi-Fi signal detected: ${rawScan.connection.signal}% (SSID: ${rawScan.connection.ssid})`;
      await db.saveAlert('signal_drop', message, 'low');
    }

    // Return the scan results
    res.json({
      success: true,
      data: {
        ...savedScan,
        connection: rawScan.connection
      },
      status: {
        isConnected: db.getIsConnected(),
        useFallback: db.getUseFallback()
      }
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/scan/history
router.get('/scan/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const history = await db.getHistory(limit);
    res.json({ success: true, data: history });
  } catch (err) {
    console.error('History fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/devices
router.get('/devices', async (req, res) => {
  try {
    const devices = await db.getDevices();
    res.json({ success: true, data: devices });
  } catch (err) {
    console.error('Fetch devices error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/nickname
router.post('/devices/nickname', async (req, res) => {
  try {
    const { mac, nickname } = req.body;
    if (!mac) {
      return res.status(400).json({ success: false, error: 'MAC address is required.' });
    }
    
    await db.setDeviceNickname(mac, nickname);
    res.json({ success: true, message: `Nickname updated for device ${mac}` });
  } catch (err) {
    console.error('Nickname set error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/allowed
router.post('/devices/allowed', async (req, res) => {
  try {
    const { mac, isAllowed } = req.body;
    if (!mac) {
      return res.status(400).json({ success: false, error: 'MAC address is required.' });
    }
    
    await db.setDeviceAllowed(mac, isAllowed);
    res.json({ success: true, message: `Authorization status updated for device ${mac}` });
  } catch (err) {
    console.error('Allowed set error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/alerts
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await db.getAlerts();
    res.json({ success: true, data: alerts });
  } catch (err) {
    console.error('Alerts fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/alerts/clear
router.post('/alerts/clear', async (req, res) => {
  try {
    await db.clearAlerts();
    res.json({ success: true, message: 'All active alerts cleared.' });
  } catch (err) {
    console.error('Alerts clear error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/alerts/clear-single
router.post('/alerts/clear-single', async (req, res) => {
  try {
    const { timestamp } = req.body;
    if (!timestamp) {
      return res.status(400).json({ success: false, error: 'Timestamp is required to clear single alert.' });
    }
    await db.clearAlert(timestamp);
    res.json({ success: true, message: 'Alert dismissed.' });
  } catch (err) {
    console.error('Alert clear-single error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      dbConnected: db.getIsConnected(),
      useFallback: db.getUseFallback()
    }
  });
});

module.exports = router;
