// This file initializes Firebase. It's safe to commit.
// It uses config from Firebase Hosting when deployed, or falls back to `firebase-env.js` for local development.

let firebaseConfig;
let db;

// `window.firebaseConfig` is injected by Firebase Hosting's /__/firebase/init.js
if (window.firebaseConfig) {
  console.log("Using Firebase Hosting config");
  firebaseConfig = window.firebaseConfig;
} else {
  // `window.localFirebaseConfig` is provided by the gitignored `js/firebase-env.js` for local development
  console.log("Using local fallback config from firebase-env.js");
  firebaseConfig = window.localFirebaseConfig;
}

// Initialize Firebase
try {
  if (!firebaseConfig || !firebaseConfig.projectId) { // Check for a critical field like projectId
    throw new Error("Firebase configuration is incomplete or missing. Ensure firebase-env.js is correct for local development.");
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch (error) {
  console.error("Firebase initialization error:", error);
  alert("Could not initialize Firebase. Please check your console for details.");
}
