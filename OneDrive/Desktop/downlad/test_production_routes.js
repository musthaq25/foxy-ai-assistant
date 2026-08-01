const http = require('https');

const BASE_URL = 'https://daystack-mu.vercel.app';

function makeRequest(path, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'User-Agent': 'Node-Regression-Tester/1.0',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', err => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('DAYSTACK PRODUCTION ROUTE REGRESSION TEST SUITE');
  console.log(`Targeting: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function testRoute(name, testFn) {
    process.stdout.write(`Testing ${name}... `);
    try {
      await testFn();
      console.log('✅ PASSED');
      passed++;
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
      failed++;
    }
  }

  // Test 1: GET / (Root Home Page)
  await testRoute('GET / (Home Page)', async () => {
    const res = await makeRequest('/');
    if (res.statusCode !== 200) {
      throw new Error(`Expected 200, got ${res.statusCode}`);
    }
  });

  // Test 2: GET /payment (Payment Page - NOT 404)
  await testRoute('GET /payment (Payment Page)', async () => {
    const res = await makeRequest('/payment');
    if (res.statusCode !== 200) {
      throw new Error(`Expected 200 (renders checkout.html), got ${res.statusCode}`);
    }
    if (res.body.includes('404: NOT_FOUND')) {
      throw new Error('Response contained Vercel 404 NOT_FOUND page');
    }
    if (!res.body.includes('DayStack Payment')) {
      throw new Error('Response did not contain DayStack Payment HTML content');
    }
  });

  // Test 3: GET /payment-success (Success Page - NOT 404)
  await testRoute('GET /payment-success (Payment Success Page)', async () => {
    const res = await makeRequest('/payment-success');
    if (res.statusCode !== 200) {
      throw new Error(`Expected 200 (renders checkout.html), got ${res.statusCode}`);
    }
    if (res.body.includes('404: NOT_FOUND')) {
      throw new Error('Response contained Vercel 404 NOT_FOUND page');
    }
    if (!res.body.includes('Payment Successful!')) {
      throw new Error('Response did not contain Payment Successful HTML content');
    }
  });

  // Test 4: POST /payment/session without Auth Header (Should return 401/400, NOT 404)
  await testRoute('POST /payment/session unauthenticated check', async () => {
    const res = await makeRequest('/payment/session', 'POST', { 'Content-Type': 'application/json' }, { planId: 'plan_pro_monthly' });
    if (res.statusCode === 404) {
      throw new Error('Endpoint returned 404 NOT_FOUND (Vercel rewrite missing)');
    }
    if (res.statusCode !== 401 && res.statusCode !== 400) {
      throw new Error(`Expected 401 or 400 for unauthenticated request, got ${res.statusCode}`);
    }
  });

  // Test 5: POST /api/create-session unauthenticated check
  await testRoute('POST /api/create-session unauthenticated check', async () => {
    const res = await makeRequest('/api/create-session', 'POST', { 'Content-Type': 'application/json' }, { planId: 'plan_pro_monthly' });
    if (res.statusCode === 404) {
      throw new Error('Endpoint returned 404 NOT_FOUND');
    }
    if (res.statusCode !== 401 && res.statusCode !== 400) {
      throw new Error(`Expected 401 or 400 for unauthenticated request, got ${res.statusCode}`);
    }
  });

  // Test 6: POST /api/verify-session with invalid session
  await testRoute('POST /api/verify-session with invalid session', async () => {
    const res = await makeRequest('/api/verify-session', 'POST', { 'Content-Type': 'application/json' }, { sessionId: 'invalid_dummy_session' });
    if (res.statusCode !== 404 && res.statusCode !== 400) {
      throw new Error(`Expected 404 or 400 for invalid session, got ${res.statusCode}`);
    }
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
