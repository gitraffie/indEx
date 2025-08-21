// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDaCCFqs7cwKMiicnlP2Ig3s-WHw8gyZts",
  authDomain: "index-database-d00f9.firebaseapp.com",
  projectId: "index-database-d00f9",
  storageBucket: "index-database-d00f9.appspot.com",
  messagingSenderId: "310780304431",
  appId: "1:310780304431:web:18c2fdd5ab6405e80dfada"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Export for use in other modules
window.firebaseApp = {
  auth,
  db,
  storage
};
