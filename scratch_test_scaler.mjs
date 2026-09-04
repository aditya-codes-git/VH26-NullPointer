import http from 'http';

function post(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

async function run() {
  console.log('=== STEP 1: Baseline Check ===');
  let t = await get('http://localhost:4000/api/metrics');
  console.log('Initial Workers:', t.workerScaling.currentWorkers);
  console.log('Accounting Invariant Check: Received =', t.totalReceived, 'Processed =', t.totalProcessed);

  console.log('\n=== STEP 2: Inducing Sustained Load to Cross Thresholds (Pressure >= 40% & Backlog) ===');
  // Ingest events directly or spike rate at 100,000/min to build queue pressure rapidly
  await post('http://localhost:4000/api/simulator/spike', { rate: 90000 });

  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 1000));
    t = await get('http://localhost:4000/api/metrics');
    console.log(`[t=${i+1}s] Workers: ${t.workerScaling.currentWorkers} | MaxPressure: ${t.workerScaling.queuePressure}% | Util: ${t.workerScaling.workerUtilization}% | Backlog: ${t.workerScaling.backlog} | UpEvents: ${t.workerScaling.scaleUpCount}`);
    if (t.workerScaling.scaleUpCount > 0) {
      console.log('Scale Up Action:', t.workerScaling.lastScalingAction?.direction, t.workerScaling.lastScalingAction?.previousWorkers, '->', t.workerScaling.lastScalingAction?.newWorkers);
      console.log('Reason:', t.workerScaling.lastScalingReason);
      break;
    }
  }

  console.log('\n=== STEP 3: Stop Traffic and Allow Backlog to Drain ===');
  await post('http://localhost:4000/api/simulator/stop', {});

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    t = await get('http://localhost:4000/api/metrics');
    console.log(`[t=${i+1}s drain] Workers: ${t.workerScaling.currentWorkers} | Pressure: ${t.workerScaling.queuePressure}% | Util: ${t.workerScaling.workerUtilization}% | Backlog: ${t.workerScaling.backlog} | DownEvents: ${t.workerScaling.scaleDownCount}`);
    if (t.workerScaling.scaleDownCount > 0) {
      console.log('Scale Down Action:', t.workerScaling.lastScalingAction?.direction, t.workerScaling.lastScalingAction?.previousWorkers, '->', t.workerScaling.lastScalingAction?.newWorkers);
      console.log('Reason:', t.workerScaling.lastScalingReason);
      break;
    }
  }

  console.log('\n=== STEP 4: Final Invariant & Telemetry Validation ===');
  t = await get('http://localhost:4000/api/metrics');
  const received = t.totalReceived;
  const processed = t.totalProcessed;
  const queued = t.criticalQueueSize + t.highQueueSize + t.lowQueueSize;
  const shed = t.shedCount;
  const inFlight = t.criticalInFlight;
  const diff = received - (processed + queued + shed + inFlight);

  console.log(`Accounting: Received (${received}) = Processed (${processed}) + Queued (${queued}) + Shed (${shed}) + InFlight (${inFlight})`);
  console.log(`Accounting Invariant DIFF: ${diff} (${diff === 0 ? '✓ PERFECTLY RECONCILED' : 'DISCREPANCY DETECTED'})`);
  console.log('Scaling History Length:', t.workerScaling.scalingHistory.length);
  for (const h of t.workerScaling.scalingHistory) {
    console.log(`- ${h.timestamp} [${h.direction}]: ${h.previousWorkers} -> ${h.newWorkers} | Pressure: ${h.queuePressure}% | Reason: ${h.reason}`);
  }
}

run().catch(console.error);
