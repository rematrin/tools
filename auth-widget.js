// auth-widget.js

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

// --- ВАШ КОНФИГ ---
const firebaseConfig = {
  apiKey: "AIzaSyDBNCQo3rYgmDZkZrGKT-g2t0LlpsfH1Pg",
  authDomain: "tools-c98fd.firebaseapp.com",
  projectId: "tools-c98fd",
  storageBucket: "tools-c98fd.firebasestorage.app",
  messagingSenderId: "595986762798",
  appId: "1:595986762798:web:b8c05cddcb0f3a610163bf",
  measurementId: "G-X3Z1KH8760"
};

// --- HTML ШАБЛОН ---
const modalHTML = `
<div class="auth-overlay" id="authOverlay">
    <div class="auth-modal mode-login" id="authModal">
        <button class="auth-close" id="authClose">&times;</button>
        
        <div class="view-login">
            <h2 class="auth-title">Вход</h2>
            
            <button class="auth-btn google-btn" id="btnGoogleLogin">
                <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill-rule="evenodd" fill-opacity="1" fill="#4285f4" stroke="none"></path><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill-rule="evenodd" fill-opacity="1" fill="#34a853" stroke="none"></path><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill-rule="evenodd" fill-opacity="1" fill="#fbbc05" stroke="none"></path><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill-rule="evenodd" fill-opacity="1" fill="#ea4335" stroke="none"></path></svg>
                Войти через Google
            </button>
            
            <div style="margin: 15px 0; color: #ccc;">— или —</div>

            <input type="email" id="loginEmail" class="auth-input" placeholder="Email">
            <input type="password" id="loginPass" class="auth-input" placeholder="Пароль">
            <button class="auth-btn" id="btnLogin">Войти</button>
            <div class="auth-switch" id="toRegister">Нет аккаунта? Зарегистрироваться</div>
        </div>

        <div class="view-register">
            <h2 class="auth-title">Регистрация</h2>
            <input type="text" id="regName" class="auth-input" placeholder="Ваше имя">
            <input type="email" id="regEmail" class="auth-input" placeholder="Email">
            <input type="password" id="regPass" class="auth-input" placeholder="Пароль (мин. 6 симв.)">
            <button class="auth-btn" id="btnRegister">Создать аккаунт</button>
            <div class="auth-switch" id="toLogin">Уже есть аккаунт? Войти</div>
        </div>

        <div class="view-profile">
            <h2 class="auth-title">Профиль</h2>
            <img id="profileAvatar" src="" style="width: 60px; height: 60px; border-radius: 50%; margin-bottom: 10px; display:none;">
            
            <div style="margin-bottom:20px; font-size: 1.1rem;">
                Привет, <b id="profileName">User</b>!
            </div>
            <div style="color:#666; margin-bottom:20px;" id="profileEmail"></div>
            <button class="auth-btn secondary" id="btnLogout">Выйти</button>
        </div>
    </div>
</div>
`;

// Кнопку можно скрыть через CSS (.auth-trigger-btn { display: none; }), если она мешает дизайну
const triggerBtnHTML = `
<button id="auth-trigger-btn" title="Профиль" style="display:none;"> <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
</button>
`;

function initAuthWidget() {
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.insertAdjacentHTML('beforeend', triggerBtnHTML);

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ: Делаем auth глобальным ---
    window.auth = auth;
    // --------------------------------------------------

    const overlay = document.getElementById('authOverlay');
    const modal = document.getElementById('authModal');
    const triggerBtn = document.getElementById('auth-trigger-btn');
    
    const openModal = () => overlay.classList.add('open');
    const closeModal = () => overlay.classList.remove('open');

    // --- ЭКСПОРТ ФУНКЦИИ ОТКРЫТИЯ ОКНА ---
    // Чтобы кнопка "Войти" в боковом меню могла вызывать это окно
    window.authWidget = {
        openLogin: openModal
    };
    // -------------------------------------

    triggerBtn.addEventListener('click', openModal);
    document.getElementById('authClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });

    document.getElementById('toRegister').onclick = () => {
        modal.classList.remove('mode-login');
        modal.classList.add('mode-register');
    };
    document.getElementById('toLogin').onclick = () => {
        modal.classList.remove('mode-register');
        modal.classList.add('mode-login');
    };

    // --- ЛОГИКА GOOGLE ВХОДА ---
    document.getElementById('btnGoogleLogin').addEventListener('click', async () => {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error(error);
            alert("Ошибка Google входа: " + error.message);
        }
    });

    // Регистрация
    document.getElementById('btnRegister').addEventListener('click', async () => {
        const email = document.getElementById('regEmail').value;
        const pass = document.getElementById('regPass').value;
        const name = document.getElementById('regName').value;
        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCred.user, { displayName: name });
        } catch (e) {
            alert("Ошибка: " + e.message);
        }
    });

    // Вход
    document.getElementById('btnLogin').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPass').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (e) {
            alert("Ошибка: " + e.message);
        }
    });

    document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

    // СЛУШАТЕЛЬ
    onAuthStateChanged(auth, (user) => {
        if (user) {
            modal.classList.remove('mode-login', 'mode-register');
            modal.classList.add('mode-profile');
            
            document.getElementById('profileName').textContent = user.displayName || "Друг";
            document.getElementById('profileEmail').textContent = user.email;
            
            const avatar = document.getElementById('profileAvatar');
            if (user.photoURL) {
                avatar.src = user.photoURL;
                avatar.style.display = "inline-block";
            } else {
                avatar.style.display = "none";
            }

            closeModal(); 
        } else {
            modal.classList.remove('mode-profile', 'mode-register');
            modal.classList.add('mode-login');
        }
    });
}

initAuthWidget();
