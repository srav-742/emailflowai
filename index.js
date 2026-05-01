/**
 * EmailFlow AI - Failsafe Entry Point
 * This file ensures that even if Render looks in the root directory,
 * it successfully finds and starts the backend server.
 */
console.log('🔥 [ROOT] FILE STARTED - Bridge Executing');
console.log('🚀 [Failsafe] Booting EmailFlow AI from project root...');

// Pass through to the real server logic
try {
  require('./backend/src/server.js');
  console.log('✅ [Failsafe] Backend server bridge established.');
} catch (error) {
  console.error('❌ [Failsafe] Critical boot error:', error.message);
  process.exit(1);
}
