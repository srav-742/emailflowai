/**
 * scripts/test_queue.js — BullMQ Verification Script
 * 
 * Usage: 
 *   node scripts/test_queue.js [--fail]
 */

const axios = require('axios');

const PORT = process.env.PORT || 10000;
const BASE_URL = `http://localhost:${PORT}/api`;
const shouldFail = process.argv.includes('--fail');

async function runTest() {
  console.log('🧪 Starting BullMQ Verification Test...');
  console.log(`📡 Targeting: ${BASE_URL}/test-queue${shouldFail ? '?fail=true' : ''}`);

  try {
    const response = await axios.get(`${BASE_URL}/test-queue`, {
      params: { fail: shouldFail }
    });

    console.log('✅ Request Sent Successfully!');
    console.log('📦 Response:', response.data);
    console.log('\n================================================');
    console.log('NEXT STEPS:');
    console.log('1. Check backend logs for "🚀 [AI Worker] Processing..."');
    if (shouldFail) {
      console.log('2. Watch for retries (should see "Job failed" and then re-processing)');
      console.log('3. After 5 failures, check for "💀 Job permanently failed (DLQ)"');
      console.log('4. Verify the "failed_jobs" table in your database');
    } else {
      console.log('2. Watch for "✅ [AI Worker] Job completed"');
    }
    console.log('3. Visit Bull Board: http://localhost:' + PORT + '/admin/queues');
    console.log('================================================');

  } catch (error) {
    console.error('❌ Error sending request:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('👉 Is the backend server running? (npm run dev)');
    }
  }
}

runTest();
