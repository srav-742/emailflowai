const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
let firebaseApp;

if (!admin.apps.length) {
  try {
    // Option 1 (PREFERRED for production/Render): Use individual env vars
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    // Option 2: Use service account key file (only when env vars aren't set)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccountPath = path.resolve(__dirname, '..', '..', process.env.FIREBASE_SERVICE_ACCOUNT);
        const serviceAccount = require(serviceAccountPath);
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      } catch (fileErr) {
        console.warn('Firebase service account file not found, skipping:', fileErr.message);
      }
    }
    // Option 3: Use Application Default Credentials (local dev fallback)
    else {
      firebaseApp = admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }

    if (firebaseApp) {
      console.log('Firebase Admin initialized successfully');
    } else {
      console.error('Firebase Admin initialization error: No valid credentials found. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in environment variables.');
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
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
