import http from 'http';

const routes = [
  '/',
  '/ai-assistant',
  '/my-assistant',
  '/knowledge',
  '/market',
  '/gulio',
  '/gumzo',
  '/daktari',
  '/profile',
  '/settings',
  '/admin',
  '/login',
  '/signup',
  '/server.cjs',
  '/server.cjs.map'
];

async function checkRoute(path: string): Promise<{ path: string; status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:5000${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          path,
          status: res.statusCode || 0,
          body,
          headers: res.headers
        });
      });
    });
    req.on('error', reject);
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('  FIREBASE HOSTING LOCAL VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const route of routes) {
    try {
      const res = await checkRoute(route);

      if (route.startsWith('/server.cjs')) {
        // Security check: must not expose the Node.js server source/code
        const exposesServerCode = res.body.includes('startServer') || res.body.includes('express()') || res.body.includes('extractUserAuthFromRequest');
        if (res.status === 301 || res.status === 302 || res.status === 404 || (res.status === 200 && !exposesServerCode && res.body.includes('<div id="root"></div>'))) {
          console.log(`✅ [PASS] Security: ${route} is protected (Status: ${res.status}, server secrets not exposed)`);
          passed++;
        } else {
          console.error(`❌ [FAIL] Security: ${route} is exposing raw server code!`);
          failed++;
        }
      } else {
        // SPA routes must return 200 and serve index.html
        if (res.status === 200 && res.body.includes('<div id="root"></div>')) {
          console.log(`✅ [PASS] SPA Route: ${route} returned HTTP 200 with index.html SPA root`);
          passed++;
        } else {
          console.error(`❌ [FAIL] SPA Route: ${route} returned HTTP ${res.status}`);
          failed++;
        }
      }
    } catch (err: any) {
      console.error(`❌ [FAIL] Route ${route} failed with network error:`, err.message);
      failed++;
    }
  }

  console.log('\n================================================================');
  console.log(`  SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
