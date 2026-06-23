const { exec } = require('child_process');
const os = require('os');
const net = require('net');

// Helper to run shell commands
function runCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message, stdout: '', stderr });
      } else {
        resolve({ success: true, stdout, stderr });
      }
    });
  });
}

// Get the active local IP details for the Wireless adapter
function getWifiIpDetails() {
  const interfaces = os.networkInterfaces();

  console.log(interfaces);

  // Look for adapters with WiFi, Wireless, or WLAN in the name
  for (const name of Object.keys(interfaces)) {
    const isWifiName = name.toLowerCase().includes('wi-fi') ||
      name.toLowerCase().includes('wireless') ||
      name.toLowerCase().includes('wlan');
    if (isWifiName) {
      const ipv4 = interfaces[name].find(ip => ip.family === 'IPv4' && !ip.internal);
      if (ipv4) {
        return {
          interfaceName: name,
          ip: ipv4.address,
          subnet: ipv4.netmask,
          prefix: ipv4.address.split('.').slice(0, 3).join('.')
        };
      }
    }
  }

  // Fallback: any active wireless-like interface or default physical IPv4
  for (const name of Object.keys(interfaces)) {
    const ipv4 = interfaces[name].find(ip => ip.family === 'IPv4' && !ip.internal);
    if (ipv4) {
      return {
        interfaceName: name,
        ip: ipv4.address,
        subnet: ipv4.netmask,
        prefix: ipv4.address.split('.').slice(0, 3).join('.')
      };
    }
  }
  return null;
}

// Parse 'netsh wlan show interfaces'
function parseWlanInterfaces(stdout) {
  const result = {};
  const lines = stdout.split(/\r?\n/);

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().includes('there is') || trimmed.toLowerCase().includes('interface on')) {
      continue;
    }
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
    const value = trimmed.substring(colonIndex + 1).trim();

    if (key.includes('name')) result.name = value;
    else if (key.includes('description')) result.description = value;
    else if (key.includes('guid')) result.guid = value;
    else if (key.includes('physical address')) result.mac = value.toLowerCase().replace(/-/g, ':');
    else if (key.includes('state')) result.state = value;
    else if (key.includes('ssid') && !key.includes('bssid')) result.ssid = value;
    else if (key.includes('bssid')) result.bssid = value.toLowerCase().replace(/-/g, ':');
    else if (key.includes('band')) result.band = value;
    else if (key.includes('channel')) result.channel = parseInt(value, 10) || value;
    else if (key.includes('authentication')) result.auth = value;
    else if (key.includes('cipher')) result.cipher = value;
    else if (key.includes('receive rate')) result.receiveRate = parseInt(value, 10) || value;
    else if (key.includes('transmit rate')) result.transmitRate = parseInt(value, 10) || value;
    else if (key.includes('signal')) result.signal = parseInt(value.replace('%', ''), 10) || 0;
    else if (key.includes('rssi')) result.rssi = parseInt(value, 10) || 0;
  }
  return result;
}

// Parse 'netsh wlan show networks mode=bssid'
function parseNearbyNetworks(stdout) {
  const lines = stdout.split(/\r?\n/);
  const networks = [];
  let currentNetwork = null;
  let currentBssid = null;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const ssidMatch = trimmed.match(/^SSID\s+\d+\s*:\s*(.*)$/i);
    if (ssidMatch) {
      if (currentNetwork) {
        networks.push(currentNetwork);
      }
      currentNetwork = {
        ssid: ssidMatch[1].trim() || '[Hidden SSID]',
        auth: '',
        encryption: '',
        bssids: []
      };
      currentBssid = null;
      continue;
    }

    if (!currentNetwork) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim().toLowerCase();
    const value = trimmed.substring(colonIndex + 1).trim();

    if (key.startsWith('authentication')) {
      currentNetwork.auth = value;
    } else if (key.startsWith('encryption')) {
      currentNetwork.encryption = value;
    } else if (key.startsWith('bssid')) {
      currentBssid = {
        mac: value.toLowerCase().replace(/-/g, ':'),
        signal: 0,
        band: '',
        channel: ''
      };
      currentNetwork.bssids.push(currentBssid);
    } else if (currentBssid) {
      if (key === 'signal') {
        currentBssid.signal = parseInt(value.replace('%', ''), 10) || 0;
      } else if (key === 'band') {
        currentBssid.band = value;
      } else if (key === 'channel') {
        currentBssid.channel = parseInt(value, 10) || value;
      }
    }
  }
  if (currentNetwork) {
    networks.push(currentNetwork);
  }
  return networks;
}

// Parse 'arp -a' for target IP
function parseArp(stdout, targetIp) {
  const lines = stdout.split(/\r?\n/);
  const devices = [];
  let underActiveInterface = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toLowerCase().startsWith('interface:')) {
      const ipMatch = trimmed.match(/interface:\s*([0-9.]+)/i);
      if (ipMatch && ipMatch[1] === targetIp) {
        underActiveInterface = true;
      } else {
        underActiveInterface = false;
      }
      continue;
    }

    if (underActiveInterface) {
      const cols = trimmed.split(/\s+/);
      if (cols.length >= 3) {
        const ip = cols[0];
        const mac = cols[1];
        const type = cols[2];

        // Exclude multicast/broadcast addresses
        if (
          ip.startsWith('224.') ||
          ip.startsWith('239.') ||
          ip.endsWith('.255') ||
          ip === '255.255.255.255' ||
          mac.toLowerCase().startsWith('ff-ff-ff-ff-ff-ff') ||
          mac.toLowerCase().startsWith('01-00-5e')
        ) {
          continue;
        }

        // Validate formats
        if (/^[0-9.]+$/.test(ip) && /^[0-9a-f-]{17}$/i.test(mac)) {
          devices.push({
            ip,
            mac: mac.toLowerCase().replace(/-/g, ':'),
            type: type.toLowerCase()
          });
        }
      }
    }
  }
  return devices;
}

// Trigger background ping command for an IP address (fast timeout)
function pingIP(ip) {
  return new Promise((resolve) => {
    // Windows: ping -n 1 -w 150 <ip>
    // -n 1: 1 packet
    // -w 150: wait 150ms for response
    exec(`ping -n 1 -w 150 ${ip}`, () => {
      resolve();
    });
  });
}

// Perform parallel sweep on subnet prefix
async function runPingSweep(prefix) {
  const concurrency = 40;
  const ips = [];
  for (let i = 1; i <= 254; i++) {
    ips.push(`${prefix}.${i}`);
  }

  for (let i = 0; i < ips.length; i += concurrency) {
    const chunk = ips.slice(i, i + concurrency);
    await Promise.all(chunk.map(ip => pingIP(ip)));
  }
}

// Probe a TCP port to see if the device is active (open or ECONNREFUSED)
function checkTCPPort(ip, port, timeout = 250) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (err) => {
      socket.destroy();
      if (err.code === 'ECONNREFUSED') {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, ip);
  });
}

// Verify reachability via ping and TCP ports 135/445
async function verifyDeviceOnline(ip, isHost = false) {
  if (isHost) return true;

  // 1. Try ICMP ping
  const pingOk = await new Promise((resolve) => {
    exec(`ping -n 1 -w 250 ${ip}`, (error, stdout) => {
      if (error) {
        resolve(false);
      } else {
        const ok = stdout.includes('Reply from') && !stdout.includes('Destination host unreachable');
        resolve(ok);
      }
    });
  });
  if (pingOk) return true;

  // 2. Try common TCP ports (135, 445, 80, 443, 22, 5357)
  const tcpResults = await Promise.all([
    checkTCPPort(ip, 135),
    checkTCPPort(ip, 445),
    checkTCPPort(ip, 80),
    checkTCPPort(ip, 443),
    checkTCPPort(ip, 22),
    checkTCPPort(ip, 5357)
  ]);

  return tcpResults.some(r => r === true);
}

// Primary scanner function
async function runFullScan(options = { runSweep: true }) {
  const result = {
    timestamp: new Date(),
    connection: null,
    devices: [],
    nearby: [],
    errors: []
  };

  // 1. Get Local IP configuration
  const localIpDetails = getWifiIpDetails();
  const targetIp = localIpDetails ? localIpDetails.ip : null;
  const subnetPrefix = localIpDetails ? localIpDetails.prefix : null;

  // 2. Scan Connection Status
  const interfaceRes = await runCommand('netsh wlan show interfaces');
  if (interfaceRes.success) {
    result.connection = parseWlanInterfaces(interfaceRes.stdout);
    if (targetIp) {
      result.connection.localIp = targetIp;
      result.connection.subnetMask = localIpDetails.subnet;
    }
  } else {
    result.errors.push(`WLAN interface check failed: ${interfaceRes.error}`);
    // Mock connections if netsh fails (e.g. no wifi card or mock environment)
    result.connection = {
      name: 'Wi-Fi (Mocked)',
      state: 'connected',
      ssid: 'Mock_WiFi_Network',
      bssid: 'aa:bb:cc:dd:ee:ff',
      band: '5 GHz',
      channel: 36,
      signal: 92,
      auth: 'WPA2-Personal',
      localIp: targetIp || '192.168.1.100',
      mac: '11:22:33:44:55:66'
    };
  }

  // 3. Scan Nearby Networks
  const networksRes = await runCommand('netsh wlan show networks mode=bssid');
  if (networksRes.success) {
    result.nearby = parseNearbyNetworks(networksRes.stdout);
  } else {
    result.errors.push(`WLAN nearby scan failed: ${networksRes.error}`);
    // Mock nearby networks
    result.nearby = [
      {
        ssid: 'Mock_WiFi_Network',
        auth: 'WPA2-Personal',
        encryption: 'CCMP',
        bssids: [{ mac: 'aa:bb:cc:dd:ee:ff', signal: 92, band: '5 GHz', channel: 36 }]
      },
      {
        ssid: 'Guest_WiFi_Open',
        auth: 'Open',
        encryption: 'None',
        bssids: [{ mac: '22:33:44:55:66:77', signal: 60, band: '2.4 GHz', channel: 6 }]
      },
      {
        ssid: 'Linksys_Router',
        auth: 'WPA3-Personal',
        encryption: 'CCMP',
        bssids: [{ mac: '88:99:aa:bb:cc:dd', signal: 45, band: '5 GHz', channel: 149 }]
      }
    ];
  }

  // 4. Subnet Ping Sweep & Devices scan (arp -a)
  if (targetIp && subnetPrefix) {
    if (options.runSweep) {
      await runPingSweep(subnetPrefix);
    }
    const arpRes = await runCommand('arp -a');
    if (arpRes.success) {
      const parsedDevices = parseArp(arpRes.stdout, targetIp);
      const verifiedDevices = [];
      
      // Perform parallel reachability verification on all parsed devices
      await Promise.all(parsedDevices.map(async (device) => {
        const isHost = device.ip === targetIp;
        const isOnline = await verifyDeviceOnline(device.ip, isHost);
        if (isOnline) {
          verifiedDevices.push(device);
        }
      }));
      
      result.devices = verifiedDevices;
    }
  }

  // If devices list is empty, add at least the router and host itself
  const hasHost = result.devices.some(d => d.ip === targetIp);
  const hostMac = result.connection ? result.connection.mac : 'unknown';
  if (!hasHost && targetIp) {
    result.devices.push({
      ip: targetIp,
      mac: hostMac,
      type: 'host'
    });
  }

  // Label Router / Gateway
  const gatewayIp = subnetPrefix ? `${subnetPrefix}.1` : '192.168.1.1';
  let hasGateway = result.devices.some(d => d.ip === gatewayIp);
  if (!hasGateway) {
    result.devices.push({
      ip: gatewayIp,
      mac: result.connection && result.connection.bssid ? result.connection.bssid : '00:00:00:00:00:00',
      type: 'gateway'
    });
  } else {
    // update label
    const gw = result.devices.find(d => d.ip === gatewayIp);
    if (gw) gw.type = 'gateway';
  }

  // Sort devices by last byte of IP address
  result.devices.sort((a, b) => {
    const aLast = parseInt(a.ip.split('.').pop(), 10) || 0;
    const bLast = parseInt(b.ip.split('.').pop(), 10) || 0;
    return aLast - bLast;
  });

  return result;
}

module.exports = {
  getWifiIpDetails,
  runPingSweep,
  runFullScan
};
