import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBZUG7tYqiZImENHUTQJZQ4CxVbmmNxK_A",
  authDomain: "nara-ff7d2.firebaseapp.com",
  projectId: "nara-ff7d2",
  storageBucket: "nara-ff7d2.firebasestorage.app",
  messagingSenderId: "883195108339",
  appId: "1:883195108339:web:4be1329c0424a9a5471086",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
