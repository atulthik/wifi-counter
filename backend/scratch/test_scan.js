const { runFullScan } = require('../utils/scanner');

async function test() {
  console.log('Running scanner test...');
  const result = await runFullScan({ runSweep: false });
  console.log('Result connection:', result.connection);
  console.log('Detected nearby networks count:', result.nearby.length);
  console.log('Detected nearby networks:', JSON.stringify(result.nearby, null, 2));
}

test();
