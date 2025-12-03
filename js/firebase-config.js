// IMPORTANT: Replace with your Firebase project's configuration
// This is sensitive information and should not be committed to a public repository.
// Consider using Firebase Hosting environment variables to store this.

const firebaseConfig = {
  apiKey: "AIzaSyBCMCnpghrEk4q6UKWGdFCnbDH_CmHmjHY",
  authDomain: "boardgameapp-cc741.firebaseapp.com",
  projectId: "boardgameapp-cc741",
  storageBucket: "boardgameapp-cc741.firebasestorage.app",
  messagingSenderId: "482372219202",
  appId: "1:482372219202:web:a4598f340ea5e3751bd8db"
};

// Initialize Firebase (v9 compat)
try {
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
} catch (error) {
  console.error("Firebase initialization error:", error);
  alert("Firebase could not be initialized. Please check your console for details.");
}
