const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
let firebaseApp;

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (privateKey) {
      // Handle cases where the private key might be wrapped in quotes or have escaped newlines
      privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
    }

    console.log(`[Firebase] Initializing for project: ${projectId || 'unknown'}`);

    // Option 1 (PREFERRED for production/Render): Use individual env vars
    if (clientEmail && privateKey && projectId) {
      console.log('[Firebase] Using environment variables for authentication');
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId, // Explicitly set at top level as well
      });
    }
    // Option 2: Use service account key file
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        console.log(`[Firebase] Using service account file: ${process.env.FIREBASE_SERVICE_ACCOUNT}`);
        const serviceAccountPath = path.resolve(__dirname, '..', '..', process.env.FIREBASE_SERVICE_ACCOUNT);
        const serviceAccount = require(serviceAccountPath);
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || projectId,
        });
      } catch (fileErr) {
        console.warn('[Firebase] Service account file not found or invalid:', fileErr.message);
      }
    }
    
    // If still not initialized, try Option 3 or fail
    if (!firebaseApp && projectId) {
      console.log('[Firebase] Falling back to default credentials with projectId');
      firebaseApp = admin.initializeApp({
        projectId,
      });
    }

    if (firebaseApp) {
      console.log('[Firebase] Admin initialized successfully');
    } else {
      const missing = [];
      if (!projectId) missing.push('FIREBASE_PROJECT_ID');
      if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
      if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
      
      console.error(`[Firebase] Initialization failed. Missing variables: ${missing.join(', ')}`);
    }
  } catch (error) {
    console.error('[Firebase] Critical initialization error:', error.message);
  }
}

// Guard: only call admin.auth() if Firebase was successfully initialized
let auth;
try {
  auth = admin.auth();
} catch (err) {
  console.error('[Firebase] admin.auth() failed — Firebase not initialized:', err.message);
  auth = null;
}

// Verify Firebase ID token
const verifyIdToken = async (idToken) => {
  if (!auth) throw new Error('Firebase is not initialized. Check FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY env vars.');
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying ID token:', error.message);
    throw error;
  }
};

// Get user by UID
const getUser = async (uid) => {
  if (!auth) throw new Error('Firebase is not initialized.');
  try {
    return await auth.getUser(uid);
  } catch (error) {
    console.error('Error getting user:', error.message);
    throw error;
  }
};

module.exports = { auth, verifyIdToken, getUser };
