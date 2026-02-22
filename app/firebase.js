// app/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export const APP_ID = "lessonmaster-live-test";

let firebaseConfig;
try {
  firebaseConfig = JSON.parse(__firebase_config);
} catch (e) {
  // fallback (copied from your app.js)
  firebaseConfig = {
apiKey: "AIzaSyDPhxwYb2LmW-tYj3xtl5drDbrNjzZFeGw",
    authDomain: "lesson-master-b0ef4.firebaseapp.com",
    projectId: "lesson-master-b0ef4"
};
}

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

// Firestore helpers (same structure as your live app)
export const sessionDocRef = (pin) => doc(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', String(pin));
export const lessonsDocRef = (lessonId) => doc(db, 'artifacts', APP_ID, 'public', 'data', 'lessons', String(lessonId));
export const lessonsColRef = () => collection(db, 'artifacts', APP_ID, 'public', 'data', 'lessons');
export const participantsColRef = (pin) => collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', String(pin), 'participants');
export const answersColRef = (pin, slideIdx) => collection(db, 'artifacts', APP_ID, 'public', 'data', 'sessions', String(pin), 'responses', String(slideIdx), 'answers');
