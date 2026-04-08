const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
let firebaseApp;

if (!admin.apps.length) {
  try {
    // Option 1: Use service account key file (recommended for production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccountPath = path.resolve(__dirname, '..', '..', process.env.FIREBASE_SERVICE_ACCOUNT);
      const serviceAccount = require(serviceAccountPath);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
    // Option 2: Use environment variables (for development)
    else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    // Option 3: Use Application Default Credentials (for local development)
    else {
      firebaseApp = admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
  }
}

const auth = admin.auth();

// Verify Firebase ID token
const verifyIdToken = async (idToken) => {
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
  try {
    return await auth.getUser(uid);
  } catch (error) {
    console.error('Error getting user:', error.message);
    throw error;
  }
};

module.exports = { auth, verifyIdToken, getUser };
