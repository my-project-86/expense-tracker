import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
// import logger from './utils/logger';

// --- Firebase configuration ---
// const firebaseconfig = { ... };
// Disabled for testing crash

const firebaseconfig = {
  apiKey: "AIzaSyCb8EFJrC833Csip_UCqNhqRYUEX4luhm4",
  authDomain: "squad-split-project.firebaseapp.com",
  projectId: "squad-split-project",
  // NOTE: storageBucket must be appspot.com for Web SDK
  storageBucket: "squad-split-project.appspot.com",
  messagingSenderId: "637698498417",
  appId: "1:637698498417:android:bc08bb8e0252f088e7a0d0"
};
// const firebaseconfig = null;

// Runtime check for required config fields
if (firebaseconfig) {
  Object.entries(firebaseconfig).forEach(([key, value]) => {
    if (!value) {
      throw new Error(`Missing Firebase config value for: ${key}`);
    }
  });
}

// --- Initialize Firebase App ---
let app = null;
try {
  if (firebaseconfig && !getApps().length) {
    app = initializeApp(firebaseconfig);
  } else if (firebaseconfig) {
    app = getApp();
  }
  // Uncomment for development debugging only:
  // logger.info("Firebase App Initialized:", app);
} catch (error) {
  // Handle initialization errors
  // logger.error("Firebase initialization error:", error);
  // throw error;
}

// --- Get Auth and Firestore instances with correct persistence ---
let auth = null;
let db = null;
if (app) {
  if (Platform.OS !== 'web') {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  } else {
    auth = getAuth(app);
  }
  db = getFirestore(app);
}

// --- Export instances for use in other files ---
export { db, app, auth };

// Usage example (in another file):
// import { db } from './fireBaseConfig';
// import { collection, getDocs } from 'firebase/firestore';
// const querySnapshot = await getDocs(collection(db, 'yourCollection'));
// querySnapshot.forEach(doc => console.log(doc.id, doc.data()));

// --- Example: Using logger middleware (Node.js/Express only) ---
// import logger from './utils/logger';
// app.use(logger); // If using Express backend
