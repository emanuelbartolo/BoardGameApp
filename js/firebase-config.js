// IMPORTANT: This file handles Firebase configuration.
// It prioritizes the configuration injected by Firebase Hosting.
// For local development, it falls back to the configuration provided in `firebase-env.js`.

const firebaseConfig = {
  // Use the key from Firebase Hosting if available, otherwise fall back to the local config.
  apiKey: window.firebaseConfig?.apiKey || window.localFirebaseConfig?.apiKey || "",
  authDomain: "boardgameapp-cc741.firebaseapp.com",
  projectId: "boardgameapp-cc741",
  storageBucket: "boardgameapp-cc741.firebasestorage.app",
  messagingSenderId: "482372219202",
  appId: "1:482372219202:web:a4598f340ea5e3751bd8db"
};

// ... (rest of the file remains the same)
try {
  // Check if Firebase API key is actually provided
  if (!firebaseConfig.apiKey) {
    throw new Error("Firebase API key is missing. Ensure FIREBASE_API_KEY environment variable is set in your hosting environment or firebaseConfig.apiKey is provided.");
  }
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
} catch (error) {
  console.error("Firebase initialization error:", error);
  // If the error is due to missing config, provide a more user-friendly message
  if (error.message.includes("Firebase API key is missing")) {
    alert(error.message + " Please contact the administrator.");
  } else {
    alert("Firebase could not be initialized. Please check your console for details.");
  }
}
