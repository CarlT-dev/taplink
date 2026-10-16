import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA094sPRLgAW-sQvrvr3f0y_IYQY5orMq0",
  authDomain: "tap-link-admin.firebaseapp.com",
  projectId: "tap-link-admin",
  storageBucket: "tap-link-admin.firebasestorage.app",
  messagingSenderId: "250416508821",
  appId: "1:250416508821:web:2e531b48f46fda11e0109c",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = initializeFirestore(
  app,
  {},
  "default"
);