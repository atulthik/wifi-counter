import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Users, 
  Activity, 
  AlertTriangle, 
  RefreshCw, 
  Edit2, 
  Check, 
  X, 
  Settings, 
  Database,
  Lock,
  Unlock,
  Radio,
  Clock,
  Search,
  HardDrive,
  ShieldAlert,
  Info,
  ChevronDown,
  ChevronUp,
  Cpu,
  Trash2,
  HelpCircle
} from 'lucide-react';

function App() {
  const [loading, setLoading] = useState(false);
  const [scanType, setScanType] = useState('quick'); // 'quick' (no sweep) or 'deep' (with sweep)
  const [networkData, setNetworkData] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [editingMac, setEditingMac] = useState(null);
  const [editingName, setEditingName] = useState('');
  
  // Filters & Sorting states
  const [deviceFilter, setDeviceFilter] = useState('');
  const [networkFilter, setNetworkFilter] = useState('');
  const [sortField, setSortField] = useState('ip'); // 'ip', 'nickname', 'mac', 'type', 'isAllowed'
  const [sortDirection, setSortDirection] = useState('asc');
  const [dbStatus, setDbStatus] = useState({ dbConnected: false, useFallback: true });
  const [dbDevices, setDbDevices] = useState([]);

  // Interactive Chart state
  const [hoveredScan, setHoveredScan] = useState(null);
  const [hoveredScanPos, setHoveredScanPos] = useState({ x: 0, y: 0 });
  const chartRef = useRef(null);

  // Manual configuration toggles
  const [showHelp, setShowHelp] = useState(false);

  // Vendor Lookup mapping
  const lookupVendor = (mac) => {
    if (!mac) return 'Unknown Vendor';
    const cleanMac = mac.toLowerCase().replace(/[:-]/g, '').substring(0, 6);
    const ouiTable = {
      '4c2338': 'Realtek Semiconductor',
      'dc6279': 'TP-Link Corporation',
      'b48c9d': 'Intel Corporation',
      '701a04': 'Microsoft Corporation',
      '3c5a37': 'Google LLC',
      '8c8590': 'Apple Inc.',
      'f01898': 'Apple Inc.',
      '18af61': 'Apple Inc.',
      '645d86': 'Samsung Electronics',
      'f8e61a': 'Samsung Electronics',
      'd80f99': 'Samsung Electronics',
      '44650d': 'Amazon Technologies',
      '000f53': 'Linksys',
      '001a11': 'Google LLC',
      '00000c': 'Cisco Systems',
      '000142': 'Cisco Systems',
      '00180a': 'Cisco Systems',
      '002686': 'HP Inc.',
      'c025a5': 'Dell Inc.',
      '00155d': 'Microsoft Corporation',
      '005056': 'VMware'
    };
    return ouiTable[cleanMac] || 'Generic Network Card';
  };

  useEffect(() => {
    fetchInitialData();
    const timer = setInterval(() => {
      fetchHistory();
      fetchAlerts();
      fetchDbStatus();
      fetchDbDevices();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      await fetchDbStatus();
      await triggerScan(false); // Quick run
      await fetchDbDevices();
      await fetchHistory();
      await fetchAlerts();
    } catch (err) {
      console.error('Initial fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDbStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const json = await res.json();
      if (json.success) setDbStatus(json.data);
    } catch (e) {
      console.error('DB Status fetch error:', e);
    }
  };

  const fetchDbDevices = async () => {
    try {
      const res = await fetch('/api/devices');
      const json = await res.json();
      if (json.success) setDbDevices(json.data);
    } catch (e) {
      console.error('DB Devices fetch error:', e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/scan/history');
      const json = await res.json();
      if (json.success) setHistory(json.data);
    } catch (e) {
      console.error('History fetch error:', e);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts');
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } catch (e) {
      console.error('Alerts fetch error:', e);
    }
  };

  const triggerScan = async (isManual = true) => {
    if (isManual) setLoading(true);
    try {
      const isDeep = scanType === 'deep';
      const res = await fetch(`/api/scan/current?sweep=${isManual && isDeep ? 'true' : 'false'}`);
      const json = await res.json();
      if (json.success) {
        setNetworkData(json.data);
        await fetchDbDevices();
        if (isManual) {
          await fetchHistory();
          await fetchAlerts();
        }
      }
    } catch (e) {
      console.error('Scan failed:', e);
    } finally {
      if (isManual) setLoading(false);
    }
  };

  const handleUpdateNickname = async (mac) => {
    try {
      const res = await fetch('/api/devices/nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, nickname: editingName })
      });
      const json = await res.json();
      if (json.success) {
        setEditingMac(null);
        await fetchDbDevices();
        if (networkData) {
          const updatedDevices = networkData.devices.map(d => 
            d.mac === mac ? { ...d, nickname: editingName } : d
          );
          setNetworkData({ ...networkData, devices: updatedDevices });
          if (selectedDevice && selectedDevice.mac === mac) {
            setSelectedDevice({ ...selectedDevice, nickname: editingName });
          }
        }
        fetchHistory();
      }
    } catch (e) {
      console.error('Failed to update nickname:', e);
    }
  };

  const handleToggleAllowed = async (mac, currentAllowed) => {
    try {
      const res = await fetch('/api/devices/allowed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, isAllowed: !currentAllowed })
      });
      const json = await res.json();
      if (json.success) {
        await fetchDbDevices();
        if (networkData) {
          const updatedDevices = networkData.devices.map(d => 
            d.mac === mac ? { ...d, isAllowed: !currentAllowed } : d
          );
          setNetworkData({ ...networkData, devices: updatedDevices });
          if (selectedDevice && selectedDevice.mac === mac) {
            setSelectedDevice({ ...selectedDevice, isAllowed: !currentAllowed });
          }
        }
        fetchAlerts();
      }
    } catch (e) {
      console.error('Failed to update allowed status:', e);
    }
  };

  const handleClearAlerts = async () => {
    try {
      const res = await fetch('/api/alerts/clear', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setAlerts([]);
      }
    } catch (e) {
      console.error('Failed to clear alerts:', e);
    }
  };

  const handleClearSingleAlert = async (timestamp) => {
    try {
      const res = await fetch('/api/alerts/clear-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp })
      });
      const json = await res.json();
      if (json.success) {
        setAlerts(alerts.filter(a => a.timestamp !== timestamp));
      }
    } catch (e) {
      console.error('Failed to clear alert:', e);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper: Signal Strength Bar Generator
  const renderSignalStrength = (strength) => {
    const activeBars = Math.ceil((strength / 100) * 4);
    return (
      <div className="signal-bar-group" title={`Signal Strength: ${strength}%`}>
        {[1, 2, 3, 4].map(b => (
          <div 
            key={b} 
            className={`signal-bar ${b <= activeBars ? 'active' : ''}`}
          />
        ))}
      </div>
    );
  };

  // Helper to render sort indicators
  const renderSortIndicator = (field) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp size={14} style={{ marginLeft: '4px' }} /> : <ChevronDown size={14} style={{ marginLeft: '4px' }} />;
  };

  // Custom Chart Hover Handling
  const handleMouseMove = (e) => {
    if (!history || history.length < 2 || !chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = 600;
    const paddingLeft = 35;
    const paddingRight = 15;
    const chartW = width - paddingLeft - paddingRight;

    // Calculate percentage width of hovered point
    const relativeX = (mouseX / rect.width) * width;
    const activeChartX = relativeX - paddingLeft;
    
    if (activeChartX < 0 || activeChartX > chartW) {
      setHoveredScan(null);
      return;
    }

    const pct = activeChartX / chartW;
    const index = Math.round(pct * (history.length - 1));
    const sorted = [...history].reverse(); // oldest to newest

    if (index >= 0 && index < sorted.length) {
      setHoveredScan(sorted[index]);
      
      // Calculate tooltip position
      const tooltipX = paddingLeft + (index / (sorted.length - 1)) * chartW;
      setHoveredScanPos({
        x: (tooltipX / width) * 100, // percentage relative to SVG
        y: mouseY - 20
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredScan(null);
  };

  // Build the list of all devices (online + offline)
  const allDevices = [];
  const seenMacs = new Set();

  // 1. Add all online devices from the current scan
  if (networkData?.devices) {
    networkData.devices.forEach(d => {
      allDevices.push({
        ...d,
        isOnline: true
      });
      seenMacs.add(d.mac.toLowerCase());
    });
  }

  // 2. Add registered devices from the database if they are not currently online
  dbDevices.forEach(d => {
    const cleanMac = d.mac.toLowerCase();
    if (!seenMacs.has(cleanMac)) {
      allDevices.push({
        mac: d.mac,
        ip: '---',
        type: 'Offline',
        nickname: d.nickname,
        isAllowed: d.isAllowed,
        isOnline: false,
        lastSeen: d.lastSeen
      });
      seenMacs.add(cleanMac);
    }
  });

  // Filter and Sort devices logic
  const filteredDevices = allDevices.filter(d => {
    const searchTerm = deviceFilter.toLowerCase();
    const nameMatch = (d.nickname || '').toLowerCase().includes(searchTerm);
    const ipMatch = (d.ip || '').toLowerCase().includes(searchTerm);
    const macMatch = (d.mac || '').toLowerCase().includes(searchTerm);
    const vendorMatch = lookupVendor(d.mac).toLowerCase().includes(searchTerm);
    const statusMatch = (d.isOnline ? 'online' : 'offline').includes(searchTerm);
    return nameMatch || ipMatch || macMatch || vendorMatch || statusMatch;
  });

  const sortedDevices = [...filteredDevices].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (sortField === 'ip') {
      if (a.ip === '---' && b.ip !== '---') return sortDirection === 'asc' ? 1 : -1;
      if (b.ip === '---' && a.ip !== '---') return sortDirection === 'asc' ? -1 : 1;
      if (a.ip === '---' && b.ip === '---') return 0;

      const aParts = (a.ip || '').split('.').map(Number);
      const bParts = (b.ip || '').split('.').map(Number);
      for (let i = 0; i < 4; i++) {
        if (aParts[i] !== bParts[i]) {
          return sortDirection === 'asc' ? aParts[i] - bParts[i] : bParts[i] - aParts[i];
        }
      }
      return 0;
    }

    if (sortField === 'nickname') {
      aVal = a.nickname || 'Unnamed Device';
      bVal = b.nickname || 'Unnamed Device';
    } else if (sortField === 'isAllowed') {
      aVal = a.isAllowed === false ? 0 : 1;
      bVal = b.isAllowed === false ? 0 : 1;
    }

    if (typeof aVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const filteredNearby = networkData?.nearby?.filter(n => {
    const searchTerm = networkFilter.toLowerCase();
    const ssidMatch = (n.ssid || '').toLowerCase().includes(searchTerm);
    const authMatch = (n.auth || '').toLowerCase().includes(searchTerm);
    const bandMatch = (n.band || '').toLowerCase().includes(searchTerm);
    const chanMatch = String(n.channel || '').toLowerCase().includes(searchTerm);
    return ssidMatch || authMatch || bandMatch || chanMatch;
  }) || [];

  // Active network stats variables
  const activeSsid = networkData?.connection?.ssid || 'Disconnected';
  const signal = networkData?.connection?.signal || 0;
  const deviceCount = networkData?.devices?.length || 0;
  const nearbyCount = networkData?.nearby?.length || 0;

  // Signal progress gauge calculations
  const radius = 24;
  const circ = 2 * Math.PI * radius;
  const strokeOffset = circ - (signal / 100) * circ;

  return (
    <div className="app-container">
      {/* Help Modal */}
      {showHelp && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(2, 6, 23, 0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(8px)'
        }}>
          <div className="glass-panel glow-indigo" style={{ maxWidth: '600px', width: '90%', margin: '1rem', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle color="var(--accent-primary)" />
                Wi-Fi Analyzer Help Guide
              </h3>
              <button onClick={() => setShowHelp(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
              <p><strong>Wi-Fi Analyzer</strong> monitors your WiFi interface and subnet connected nodes using local Windows commands:</p>
              <ul>
                <li><strong>Quick Scan</strong>: Queries local ARP cache immediately to resolve devices. Minimal CPU overhead.</li>
                <li><strong>Deep Scan</strong>: Performs a parallel ping sweep of all 254 subnet hosts to force devices to respond, updating the ARP cache for a 100% complete subnet profile. Takes about 3-5 seconds.</li>
                <li><strong>Nicknames & Block List</strong>: Mark specific devices. If a blocked device joins, a high-severity security alarm triggers.</li>
                <li><strong>Database State</strong>: Auto-detects local MongoDB. Fallback files (`db_fallback.json`) store credentials automatically if MongoDB is not active on the host machine.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="header-section">
        <div className="header-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1>Wi-Fi Analyzer</h1>
            <button 
              onClick={() => setShowHelp(true)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
              title="Show guide"
            >
              <HelpCircle size={20} className="hover-opacity-100" />
            </button>
          </div>
          <p>Real-time WiFi details, device count monitoring & intrusion detection</p>
        </div>
        
        {/* Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="tabs-group">
            <button 
              className={`tab-btn ${scanType === 'quick' ? 'active' : ''}`}
              onClick={() => setScanType('quick')}
              title="Fast scan of active ARP records"
            >
              Quick Scan
            </button>
            <button 
              className={`tab-btn ${scanType === 'deep' ? 'active' : ''}`}
              onClick={() => setScanType('deep')}
              title="Performs subnet ping sweep to find all online nodes"
            >
              Deep Scan
            </button>
          </div>

          <button 
            className={`btn-primary ${loading ? 'pulsing-scan' : ''}`} 
            onClick={() => triggerScan(true)}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner"></div>
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Scan Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Database Connectivity Banner */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '0.5rem 1rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderColor: dbStatus.useFallback ? 'var(--warning)' : 'var(--success)',
          fontSize: '0.85rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Database size={16} color={dbStatus.useFallback ? 'var(--warning)' : 'var(--success)'} />
          <span>
            Database State: {dbStatus.useFallback ? (
              <strong style={{ color: 'var(--warning)' }}>Local File Fallback Mode (db_fallback.json)</strong>
            ) : (
              <strong style={{ color: 'var(--success)' }}>MongoDB Connected</strong>
            )}
          </span>
        </div>
        <span style={{ color: 'var(--text-muted)' }}>
          Autosaving logs & device preferences
        </span>
      </div>

      {/* Stats Cards Row */}
      <div className="stat-grid">
        {/* Connection card */}
        <div className="glass-panel stat-card glow-cyan">
          <div className="stat-icon" style={{ color: 'var(--accent-secondary)' }}>
            {signal > 0 ? <Wifi size={28} /> : <WifiOff size={28} />}
          </div>
          <div className="stat-info">
            <span className="stat-label">Active Network</span>
            <span className="stat-value" style={{ fontSize: '1.4rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }} title={activeSsid}>
              {activeSsid}
            </span>
          </div>
        </div>

        {/* Connected devices count */}
        <div className="glass-panel stat-card glow-indigo">
          <div className="stat-icon" style={{ color: 'var(--accent-primary)' }}>
            <Users size={28} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Devices Connected</span>
            <span className="stat-value">{deviceFilter ? sortedDevices.length : deviceCount}</span>
            {deviceFilter && (
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', marginTop: '0.15rem', fontWeight: 600 }}>
                Filtered of {deviceCount}
              </span>
            )}
          </div>
        </div>

        {/* Circular Signal Quality Gauge */}
        <div className="glass-panel stat-card" style={{ padding: '1rem 1.5rem' }}>
          <div style={{ position: 'relative', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r={radius} fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
              <circle 
                cx="28" cy="28" r={radius} 
                fill="transparent" 
                stroke={signal < 50 ? 'var(--warning)' : 'var(--success)'} 
                strokeWidth="4"
                strokeDasharray={circ}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
            </svg>
            <span style={{ position: 'absolute', fontSize: '0.85rem', fontWeight: 'bold' }}>{signal}%</span>
          </div>
          <div className="stat-info">
            <span className="stat-label">Signal Quality</span>
            <span className="stat-value" style={{ fontSize: '1.2rem', color: signal < 50 ? 'var(--warning)' : 'var(--success)' }}>
              {signal < 50 ? 'Weak Link' : 'Strong Link'}
            </span>
          </div>
        </div>

        {/* Nearby SSIDs */}
        <div className="glass-panel stat-card">
          <div className="stat-icon" style={{ color: 'var(--warning)' }}>
            <Radio size={28} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Nearby Networks</span>
            <span className="stat-value">{networkFilter ? filteredNearby.length : nearbyCount}</span>
            {networkFilter && (
              <span style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.15rem', fontWeight: 600 }}>
                Filtered of {nearbyCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="main-grid">
        {/* Left Side: Devices list, details drawer, & Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Chart Section with Tooltip */}
          <div className="glass-panel" style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Network Load History</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Hover over curves for detailed scan markers</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }}></span>
                  Devices Count
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent-secondary)', display: 'inline-block' }}></span>
                  Signal Strength (%)
                </span>
              </div>
            </div>

            {/* Interactive chart frame */}
            <div 
              className="chart-container" 
              ref={chartRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: 'crosshair' }}
            >
              {history && history.length >= 2 ? (
                <>
                  {/* Tooltip vertical line marker */}
                  {hoveredScan && (
                    <div style={{
                      position: 'absolute',
                      left: `${hoveredScanPos.x}%`,
                      top: '15px',
                      bottom: '25px',
                      width: '1px',
                      background: 'rgba(255,255,255,0.2)',
                      pointerEvents: 'none'
                    }} />
                  )}

                  {/* Tooltip details overlay */}
                  {hoveredScan && (
                    <div style={{
                      position: 'absolute',
                      left: `${hoveredScanPos.x > 70 ? hoveredScanPos.x - 32 : hoveredScanPos.x + 2}%`,
                      top: '10px',
                      backgroundColor: 'rgba(11, 15, 25, 0.95)',
                      border: '1px solid var(--panel-border-hover)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      zIndex: 10,
                      pointerEvents: 'none',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
                      minWidth: '160px',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.25rem' }}>
                        {new Date(hoveredScan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div style={{ margin: '0.2rem 0' }}>SSID: <span style={{ color: 'var(--accent-secondary)', fontWeight: 500 }}>{hoveredScan.ssid || 'Unknown'}</span></div>
                      <div style={{ margin: '0.2rem 0' }}>Clients Connected: <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{hoveredScan.deviceCount}</span></div>
                      <div style={{ margin: '0.2rem 0' }}>Link Signal: <span style={{ color: 'var(--success)', fontWeight: 500 }}>{hoveredScan.signalStrength}%</span></div>
                    </div>
                  )}

                  {/* Raw SVG curves */}
                  {(() => {
                    const sorted = [...history].reverse();
                    const width = 600;
                    const height = 180;
                    const paddingLeft = 35;
                    const paddingRight = 15;
                    const paddingTop = 15;
                    const paddingBottom = 25;
                    const chartW = width - paddingLeft - paddingRight;
                    const chartH = height - paddingTop - paddingBottom;
                    const deviceCounts = sorted.map(s => s.deviceCount);
                    const maxDevices = Math.max(...deviceCounts, 5);

                    const getCoords = (val, max, idx) => {
                      const x = paddingLeft + (idx / (sorted.length - 1)) * chartW;
                      const y = paddingTop + chartH - (val / max) * chartH;
                      return { x, y };
                    };

                    let devicePath = '';
                    let signalPath = '';
                    let deviceArea = '';

                    sorted.forEach((scan, idx) => {
                      const pDev = getCoords(scan.deviceCount, maxDevices, idx);
                      const pSig = getCoords(scan.signalStrength || 0, 100, idx);

                      if (idx === 0) {
                        devicePath = `M ${pDev.x} ${pDev.y}`;
                        signalPath = `M ${pSig.x} ${pSig.y}`;
                        deviceArea = `M ${pDev.x} ${paddingTop + chartH} L ${pDev.x} ${pDev.y}`;
                      } else {
                        devicePath += ` L ${pDev.x} ${pDev.y}`;
                        signalPath += ` L ${pSig.x} ${pSig.y}`;
                        deviceArea += ` L ${pDev.x} ${pDev.y}`;
                      }

                      if (idx === sorted.length - 1) {
                        deviceArea += ` L ${pDev.x} ${paddingTop + chartH} Z`;
                      }
                    });

                    return (
                      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`}>
                        <defs>
                          <linearGradient id="devices-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.25"/>
                            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0"/>
                          </linearGradient>
                        </defs>
                        {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                          const y = paddingTop + r * chartH;
                          const label = Math.round(maxDevices * (1 - r));
                          return (
                            <g key={i}>
                              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} className="chart-grid-line" />
                              <text x={8} y={y + 4} className="chart-axis-text">{label}</text>
                            </g>
                          );
                        })}
                        <path d={deviceArea} fill="url(#devices-gradient)" />
                        <path d={devicePath} className="chart-path-devices" />
                        <path d={signalPath} className="chart-path-signal" />

                        {sorted.map((scan, idx) => {
                          if (idx === 0 || idx === Math.floor(sorted.length / 2) || idx === sorted.length - 1) {
                            const p = getCoords(0, 100, idx);
                            const timeStr = new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                              <text key={idx} x={p.x} y={height - 5} textAnchor="middle" className="chart-axis-text">
                                {timeStr}
                              </text>
                            );
                          }
                          return null;
                        })}
                      </svg>
                    );
                  })()}
                </>
              ) : (
                <div className="empty-state">
                  <Activity size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                  <p>Analyzing history logs...</p>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Need at least 2 scans to populate chart curves.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Connected Devices Table */}
          <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Subnet Connected Clients ({sortedDevices.length})</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sort by clicking columns, or click a row for depth lookup</p>
              </div>
              
              {/* Search */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Filter name, IP, MAC, vendor..." 
                  className="nickname-input"
                  style={{ paddingLeft: '30px', paddingRight: '28px', width: '250px' }}
                  value={deviceFilter}
                  onChange={(e) => setDeviceFilter(e.target.value)}
                />
                {deviceFilter && (
                  <button 
                    onClick={() => setDeviceFilter('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      padding: 0
                    }}
                    title="Clear filter"
                  >
                    <X size={16} className="hover-opacity-100" />
                  </button>
                )}
              </div>
            </div>

            <div className="table-container">
              {sortedDevices.length === 0 ? (
                <div className="empty-state">No matching devices found on the network.</div>
              ) : (
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('nickname')} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          Device Nickname {renderSortIndicator('nickname')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('ip')} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          IP Address {renderSortIndicator('ip')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('mac')} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          MAC Address {renderSortIndicator('mac')}
                        </div>
                      </th>
                      <th onClick={() => handleSort('isAllowed')} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          Status {renderSortIndicator('isAllowed')}
                        </div>
                      </th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDevices.map(device => {
                      const isEditing = editingMac === device.mac;
                      const vendor = lookupVendor(device.mac);
                      const isBlocked = device.isAllowed === false;
                      const isSelected = selectedDevice && selectedDevice.mac === device.mac;

                      return (
                        <tr 
                          key={device.mac}
                          onClick={() => setSelectedDevice(device)}
                          style={{
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                            borderLeft: isSelected ? '3px solid var(--accent-primary)' : '3px solid transparent'
                          }}
                        >
                          <td>
                            <div className="device-name-cell">
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="text" 
                                    className="nickname-input"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    placeholder="Nickname"
                                    autoFocus
                                  />
                                  <button 
                                    onClick={() => handleUpdateNickname(device.mac)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--success)' }}
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button 
                                    onClick={() => setEditingMac(null)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: device.isOnline ? 'var(--success)' : 'var(--text-muted)',
                                    boxShadow: device.isOnline ? '0 0 8px var(--success)' : 'none',
                                    flexShrink: 0
                                  }} title={device.isOnline ? 'Online' : 'Offline'}></span>
                                  <span className="device-nickname" style={{ color: device.isOnline ? 'var(--text-normal)' : 'var(--text-muted)' }}>
                                    {device.nickname || <em style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Unnamed Device</em>}
                                  </span>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingMac(device.mac);
                                      setEditingName(device.nickname || '');
                                    }}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.5, color: '#fff' }}
                                    title="Edit Nickname"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                </div>
                              )}
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>{vendor}</span>
                            </div>
                          </td>
                          <td style={{ fontFamily: 'monospace' }}>{device.ip}</td>
                          <td style={{ fontFamily: 'monospace', textTransform: 'uppercase', fontSize: '0.85rem' }}>{device.mac}</td>
                          <td>
                            {isBlocked ? (
                              <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                <ShieldAlert size={10} /> Blocked
                              </span>
                            ) : (
                              <span className="badge badge-success">Authorized</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <button 
                              className="tab-btn"
                              style={{ 
                                padding: '0.2rem 0.6rem', 
                                fontSize: '0.75rem',
                                color: isBlocked ? 'var(--success)' : 'var(--danger)',
                                border: '1px solid',
                                borderColor: isBlocked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                background: isBlocked ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleToggleAllowed(device.mac, device.isAllowed !== false)}
                            >
                              {isBlocked ? 'Authorize' : 'Block'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Selected Device Details Card */}
          {selectedDevice && (
            <div className="glass-panel glow-indigo" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Cpu size={18} color="var(--accent-primary)" />
                    Device Profile: {selectedDevice.nickname || 'Unnamed'}
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>MAC Address ID: {selectedDevice.mac.toUpperCase()}</p>
                </div>
                <button 
                  onClick={() => setSelectedDevice(null)} 
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Manufacturer</span>
                  <strong>{lookupVendor(selectedDevice.mac)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>IP Address</span>
                  <span style={{ fontFamily: 'monospace' }}>{selectedDevice.ip}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Authorization</span>
                  <strong>{selectedDevice.isAllowed !== false ? 'Authorized Node' : 'Intruder Blocked'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Network Status</span>
                  {selectedDevice.isOnline ? (
                    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--success)'
                      }}></span>
                      Online
                    </span>
                  ) : (
                    <span className="badge" style={{
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--panel-border)',
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      Offline
                    </span>
                  )}
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Interface Rank</span>
                  <span className="badge badge-info">{selectedDevice.type || 'Client'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Connection Panel, Alerts, Nearby Networks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Active Connection Panel */}
          <div className="glass-panel">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <HardDrive size={18} color="var(--accent-secondary)" />
              Interface Details
            </h3>
            {networkData?.connection ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Card Name</span>
                  <span style={{ fontWeight: 500, marginLeft: 'auto', textAlign: 'right', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={networkData.connection.description}>
                    {networkData.connection.description}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Radio Tech</span>
                  <span style={{ fontWeight: 500, marginLeft: 'auto' }}>{networkData.connection.type || 'Infrastructure'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Band / Channel</span>
                  <span style={{ fontWeight: 500, marginLeft: 'auto' }}>{networkData.connection.band || '5 GHz'} / Ch {networkData.connection.channel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Link Speed</span>
                  <span style={{ fontWeight: 500, marginLeft: 'auto' }}>
                    Rx {networkData.connection.receiveRate || 130} Mbps / Tx {networkData.connection.transmitRate || 130} Mbps
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Local IP Address</span>
                  <span style={{ fontWeight: 500, marginLeft: 'auto', fontFamily: 'monospace' }}>{networkData.connection.localIp}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Security Mode</span>
                  <span style={{ fontWeight: 500, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Lock size={14} color="var(--success)" />
                    {networkData.connection.auth || 'Secure'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="empty-state">No active connection. Trigger scan.</div>
            )}
          </div>

          {/* Security Alerts Feed */}
          <div className="glass-panel" style={{ borderColor: alerts.length > 0 ? 'var(--danger-glow)' : 'var(--panel-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} color={alerts.length > 0 ? 'var(--danger)' : 'var(--text-muted)'} />
                Intrusion Alerts {alerts.length > 0 && `(${alerts.length})`}
              </h3>
              {alerts.length > 0 && (
                <button 
                  onClick={handleClearAlerts}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                  className="hover-opacity-100"
                >
                  Dismiss All
                </button>
              )}
            </div>

            <div className="alerts-feed">
              {alerts.length === 0 ? (
                <div className="empty-state" style={{ padding: '1.5rem 0' }}>
                  <Check size={24} color="var(--success)" style={{ marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.85rem' }}>Your network environment is secure.</p>
                </div>
              ) : (
                alerts.map((alert, i) => {
                  let alertClass = 'alert-item-low';
                  if (alert.severity === 'high') alertClass = 'alert-item-high';
                  else if (alert.severity === 'medium') alertClass = 'alert-item-medium';

                  const time = new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={i} className={`alert-item ${alertClass}`} style={{ position: 'relative' }}>
                      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ paddingRight: '1.5rem' }}>
                        <p style={{ fontWeight: 500, fontSize: '0.85rem' }}>{alert.message}</p>
                        <span style={{ fontSize: '0.7rem', opacity: 0.75, display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '4px' }}>
                          <Clock size={10} /> {time}
                        </span>
                      </div>
                      <button 
                        onClick={() => handleClearSingleAlert(alert.timestamp)}
                        style={{
                          position: 'absolute', right: '8px', top: '8px',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: 'inherit', opacity: 0.6
                        }}
                        title="Dismiss Alert"
                        className="hover-opacity-100"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Nearby Wi-Fi Networks */}
          <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Nearby Networks ({filteredNearby.length})</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Other visible Access Points</p>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Filter..." 
                  className="nickname-input"
                  style={{ paddingLeft: '26px', paddingRight: '24px', fontSize: '0.8rem', width: '130px' }}
                  value={networkFilter}
                  onChange={(e) => setNetworkFilter(e.target.value)}
                />
                {networkFilter && (
                  <button 
                    onClick={() => setNetworkFilter('')}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      padding: 0
                    }}
                    title="Clear filter"
                  >
                    <X size={14} className="hover-opacity-100" />
                  </button>
                )}
              </div>
            </div>

            <div className="network-list">
              {filteredNearby.length === 0 ? (
                <div className="empty-state">No visible nearby networks scanned.</div>
              ) : (
                filteredNearby.map((net, i) => {
                  const firstBssid = net.bssids && net.bssids[0];
                  const signalVal = net.signal !== undefined ? net.signal : (firstBssid ? firstBssid.signal : 0);
                  const bandVal = net.band || (firstBssid ? firstBssid.band : '2.4 GHz');
                  const channelVal = net.channel !== undefined && net.channel !== 0 ? net.channel : (firstBssid ? firstBssid.channel : '');
                  const authVal = net.auth || 'WPA2-Personal';
                  const isSecure = authVal && !authVal.toLowerCase().includes('open');
                  
                  return (
                    <div key={i} className="network-item">
                      <div className="network-info">
                        <span className="network-ssid" style={{ fontSize: '0.9rem' }}>{net.ssid}</span>
                        <span className="network-subtext" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {isSecure ? <Lock size={10} color="var(--success)" /> : <Unlock size={10} color="var(--danger)" />}
                          {authVal} • {bandVal} (Ch {channelVal})
                        </span>
                      </div>
                      <div className="network-strength-container">
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{signalVal}%</span>
                        {renderSignalStrength(signalVal)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
