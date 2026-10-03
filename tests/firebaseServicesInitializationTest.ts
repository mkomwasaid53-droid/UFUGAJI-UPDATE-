import app, { auth, db, storage } from '../src/lib/firebase';
import firebaseConfigJson from '../firebase-applet-config.json';

async function testFirebaseServices() {
  console.log('================================================================');
  console.log('  FIREBASE CLIENT SERVICES INITIALIZATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. App initialization
  assert(Boolean(app), 'Firebase App instance initialized successfully');
  assert(app.options.projectId === 'ufugaji-update', `Project ID matches ufugaji-update (found: ${app.options.projectId})`);
  assert(app.options.appId === firebaseConfigJson.appId, 'App ID matches firebase-applet-config.json');

  // 2. Authentication initialization
  assert(Boolean(auth), 'Firebase Authentication service initialized');
  assert(auth.app.name === app.name, 'Auth is bound to the primary Firebase App');

  // 3. Firestore initialization
  assert(Boolean(db), 'Cloud Firestore instance initialized');
  assert(db.app.name === app.name, 'Firestore is bound to the primary Firebase App');

  // 4. Storage initialization
  assert(Boolean(storage), 'Firebase Storage instance initialized');
  assert(storage.app.name === app.name, 'Storage is bound to the primary Firebase App');

  // 5. Config integrity
  assert(Boolean(firebaseConfigJson.apiKey), 'Firebase API key present in client config');
  assert(firebaseConfigJson.authDomain === 'ufugaji-update.firebaseapp.com', 'Auth domain is ufugaji-update.firebaseapp.com');

  console.log('\n================================================================');
  console.log(`  SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

testFirebaseServices().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
