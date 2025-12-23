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
const provider = new GoogleAuthProvider();

// Делаем auth глобальным, чтобы index.html видел состояние
window.auth = auth;

// Экспортируем функции API в глобальную область, чтобы index.html мог их вызывать
window.authApi = {
    // ВХОД
    login: async (email, password) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Ничего не делаем, onAuthStateChanged сам обновит интерфейс
        } catch (e) {
            alert("Ошибка входа: " + e.message);
        }
    },

    // РЕГИСТРАЦИЯ
    register: async (email, password, name) => {
        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            if(name) {
                await updateProfile(userCred.user, { displayName: name });
            }
        } catch (e) {
            alert("Ошибка регистрации: " + e.message);
        }
    },

    // GOOGLE
    google: async () => {
        try {
            await signInWithPopup(auth, provider);
        } catch (e) {
            console.error(e);
            alert("Ошибка Google: " + e.message);
        }
    },

    // ВЫХОД
    logout: async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.error(e);
        }
    }
};

console.log("Firebase Auth Logic Loaded");
