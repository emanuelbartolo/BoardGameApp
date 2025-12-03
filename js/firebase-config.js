// IMPORTANT: Replace with your Firebase project's configuration
// This is sensitive information and should not be committed to a public repository.
// Consider using Firebase Hosting environment variables to store this.

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || window.firebaseConfig?.apiKey || "",
  authDomain: "boardgameapp-cc741.firebaseapp.com",
  projectId: "boardgameapp-cc741",
  storageBucket: "boardgameapp-cc741.firebasestorage.app",
  messagingSenderId: "482372219202",
  appId: "1:482372219202:web:a4598f340ea5e3751bd8db"
};

// Initialize Firebase (v9 compat)
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
