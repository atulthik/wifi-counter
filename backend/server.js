require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./utils/db');
const { runFullScan } = require('./utils/scanner');
const { db } = require('./utils/db');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Router
app.use('/api', apiRoutes);

// Static assets (if serving React build in production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Wi-Fi Count Check API is running. Direct requests to /api/scan/current');
  });
}

// Background scheduler for automatic periodic scans
let scanInterval;
function startBackgroundScanning() {
  const intervalTime = parseInt(process.env.SCAN_INTERVAL_MS, 10) || 300000; // default 5 mins
  console.log(`Starting background Wi-Fi scanner (interval: ${intervalTime / 1000}s)`);
  
  scanInterval = setInterval(async () => {
    try {
      console.log('Running background periodic Wi-Fi scan...');
      // In background scans, run a quick check without a heavy ping sweep to conserve bandwidth
      const rawScan = await runFullScan({ runSweep: false });
      const enrichedScan = await db.saveScan(rawScan);
      console.log(`Background scan logged. Count: ${enrichedScan.deviceCount} devices, ${enrichedScan.nearbyCount} nearby networks.`);
    } catch (err) {
      console.error('Error in background scanner:', err);
    }
  }, intervalTime);
}

// Startup server
async function startServer() {
  // Connect to database (with JSON fallback)
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    
    // Perform initial scan on startup to populate database
    setTimeout(async () => {
      try {
        console.log('Running initial boot WiFi scan...');
        const initialScan = await runFullScan({ runSweep: false });
        await db.saveScan(initialScan);
        console.log('Initial scan saved successfully.');
      } catch (err) {
        console.error('Failed to run initial scan:', err);
      }
    }, 1000);

    // Start background scanner
    startBackgroundScanning();
  });
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  clearInterval(scanInterval);
  process.exit(0);
});

startServer();
