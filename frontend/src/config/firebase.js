import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBaEgms6pXOfw_NIIYSbDH0_PwFrnBR7eU',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'email-c1fc9.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'email-c1fc9',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'email-c1fc9.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '622165679601',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:622165679601:web:809bd6610336fbee90f850',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-TE5VBXBVHJ',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let analytics;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (e) {
    console.warn('Analytics not available:', e.message);
  }
}

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export { auth, googleProvider, GoogleAuthProvider, signInWithPopup, signOut };
export { analytics };
export default app;
