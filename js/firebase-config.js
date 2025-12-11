// This file contains the public Firebase configuration for the BoardGameApp.
// This information is not secret and is required for the client-side application to connect to Firebase.
// Security is enforced by Firestore Security Rules, not by hiding these keys.

let db;

const firebaseConfig = {
  apiKey: "AIzaSyBCMCnpghrEk4q6UKWGdFCnbDH_CmHmjHY",
  authDomain: "boardgameapp-cc741.firebaseapp.com",
  projectId: "boardgameapp-cc741",
  storageBucket: "boardgameapp-cc741.firebasestorage.app",
  messagingSenderId: "482372219202",
  appId: "1:482372219202:web:a4598f340ea5e3751bd8db"
};

// Initialize Firebase
try {
  if (!firebaseConfig.projectId) {
    throw new Error("Firebase configuration is missing or incomplete.");
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
} catch (error) {
  console.error("Firebase initialization error:", error);
  alert("Could not initialize Firebase. Please contact the administrator.");
}

// No local Functions emulator configuration — client will call deployed Cloud Functions.
