import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup       
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- КОНФИГ ---
const firebaseConfig = {
  apiKey: "AIzaSyDBNCQo3rYgmDZkZrGKT-g2t0LlpsfH1Pg",
  authDomain: "tools-c98fd.firebaseapp.com",
  projectId: "tools-c98fd",
  storageBucket: "tools-c98fd.firebasestorage.app",
  messagingSenderId: "595986762798",
  appId: "1:595986762798:web:b8c05cddcb0f3a610163bf",
  measurementId: "G-X3Z1KH8760"
};

// Инициализация
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Инициализация БД
const provider = new GoogleAuthProvider();

// Глобальные переменные
window.auth = auth;
window.db = db;

// API для работы с БД
window.dbApi = {
    // Сохранить массив приложений
    saveApps: async (appsArray) => {
        const user = auth.currentUser;
        if (!user) return; // Не сохраняем, если не вошли
        try {
            await setDoc(doc(db, "users", user.uid), { 
                apps: appsArray,
                lastUpdated: new Date()
            }, { merge: true });
            console.log("Settings saved to cloud");
        } catch (e) {
            console.error("Error saving settings:", e);
        }
    },

    // Загрузить массив приложений
    loadApps: async () => {
        const user = auth.currentUser;
        if (!user) return null;
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data().apps || [];
            } else {
                return null; // Данных нет (новый юзер)
            }
        } catch (e) {
            console.error("Error loading settings:", e);
            return null;
        }
    }
};

// API Авторизации
window.authApi = {
    login: async (email, password) => {
        try { await signInWithEmailAndPassword(auth, email, password); } 
        catch (e) { alert("Ошибка входа: " + e.message); }
    },
    register: async (email, password, name) => {
        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            if(name) await updateProfile(userCred.user, { displayName: name });
        } catch (e) { alert("Ошибка регистрации: " + e.message); }
    },
    google: async () => {
        try { await signInWithPopup(auth, provider); } 
        catch (e) { alert("Ошибка Google: " + e.message); }
    },
    logout: async () => {
        try { await signOut(auth); } 
        catch (e) { console.error(e); }
    }
};

console.log("Firebase Auth & Firestore Logic Loaded");
