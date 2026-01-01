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

const firebaseConfig = {
  apiKey: "AIzaSyDBNCQo3rYgmDZkZrGKT-g2t0LlpsfH1Pg",
  authDomain: "tools-c98fd.firebaseapp.com",
  projectId: "tools-c98fd",
  storageBucket: "tools-c98fd.firebasestorage.app",
  messagingSenderId: "595986762798",
  appId: "1:595986762798:web:b8c05cddcb0f3a610163bf",
  measurementId: "G-X3Z1KH8760"
};

/* Убрана кнопка "Помощь" из HTML */
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
            <div style="margin: 15px 0; color: #818c99;">— или —</div>
            <input type="email" id="loginEmail" class="auth-input" placeholder="Email">
            <input type="password" id="loginPass" class="auth-input" placeholder="Пароль">
            <button class="auth-btn" id="btnLogin">Войти</button>
            <div class="auth-switch" id="toRegister">Нет аккаунта? Зарегистрироваться</div>
        </div>

        <div class="view-register">
            <h2 class="auth-title">Регистрация</h2>
            <input type="text" id="regName" class="auth-input" placeholder="Ваше имя">
            <input type="email" id="regEmail" class="auth-input" placeholder="Email">
            <input type="password" id="regPass" class="auth-input" placeholder="Пароль">
            <button class="auth-btn" id="btnRegister">Создать аккаунт</button>
            <div class="auth-switch" id="toLogin">Уже есть аккаунт? Войти</div>
        </div>

        <div class="view-profile">
            <div class="vk-user-card">
                <img id="profileAvatar" src="" class="vk-avatar-large">
                <div class="vk-user-name" id="profileName">Загрузка...</div>
                <div class="vk-user-sub" id="profileEmail">...</div>
                <button class="vk-manage-btn">
                    <div class="vk-manage-text">
                        <span>Управление аккаунтом</span>
                        <span style="background: #0077FF; color: white; padding: 0 4px; border-radius: 4px; font-size: 10px; font-weight: bold; line-height: 14px;">ID</span>
                    </div>
                </button>
            </div>
            <div class="vk-menu-list">
                <button class="vk-menu-item" id="menuThemeToggle">
                    <svg class="vk-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                    <span class="vk-menu-text">Тема: <span id="themeLabel">Светлая</span></span>
                </button>
                <button class="vk-menu-item item-logout" id="btnLogout">
                    <svg class="vk-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    <span class="vk-menu-text">Выйти</span>
                </button>
            </div>
        </div>
    </div>
</div>
`;

function initAuthWidget() {
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    const overlay = document.getElementById('authOverlay');
    const modal = document.getElementById('authModal');
    
    // === ЛОГИКА ПОЗИЦИОНИРОВАНИЯ ===
    const recalcPosition = () => {
        const triggerBtn = document.getElementById('profile-container');
        if (triggerBtn && overlay.classList.contains('open')) {
            const rect = triggerBtn.getBoundingClientRect();
            // Позиционируем
            modal.style.top = (rect.bottom + 8) + 'px';
            const rightPos = window.innerWidth - rect.right;
            modal.style.right = rightPos + 'px';
            modal.style.left = 'auto';
        }
    };

    const closeModal = () => {
        overlay.classList.remove('open');
        // Убираем слушатель ресайза при закрытии (оптимизация)
        window.removeEventListener('resize', recalcPosition);
    };

    window.openAuthModal = () => {
        if (overlay.classList.contains('open')) {
            closeModal();
            return;
        }
        overlay.classList.add('open');
        
        // Считаем позицию сразу
        recalcPosition();
        // И вешаем слушатель на изменение размера/зума
        window.addEventListener('resize', recalcPosition);
    };

    document.getElementById('authClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { 
        if(e.target === overlay) closeModal(); 
    });

    // Логика переключения
    document.getElementById('toRegister').onclick = () => {
        modal.classList.remove('mode-login'); modal.classList.add('mode-register');
    };
    document.getElementById('toLogin').onclick = () => {
        modal.classList.remove('mode-register'); modal.classList.add('mode-login');
    };

    // Авторизация
    document.getElementById('btnGoogleLogin').addEventListener('click', async () => {
        try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
    });
    document.getElementById('btnRegister').addEventListener('click', async () => {
        try {
            const uc = await createUserWithEmailAndPassword(auth, 
                document.getElementById('regEmail').value, 
                document.getElementById('regPass').value
            );
            await updateProfile(uc.user, { displayName: document.getElementById('regName').value });
        } catch (e) { alert("Error: " + e.message); }
    });
    document.getElementById('btnLogin').addEventListener('click', async () => {
        try {
            await signInWithEmailAndPassword(auth, 
                document.getElementById('loginEmail').value, 
                document.getElementById('loginPass').value
            );
        } catch (e) { alert("Error: " + e.message); }
    });
    document.getElementById('btnLogout').addEventListener('click', () => {
        signOut(auth);
        closeModal();
    });

    // Смена темы
    const themeBtn = document.getElementById('menuThemeToggle');
    const themeLabel = document.getElementById('themeLabel');
    const updateThemeText = () => {
        themeLabel.textContent = document.body.classList.contains('dark') ? "Темная" : "Светлая";
    };
    updateThemeText();

    themeBtn.addEventListener('click', () => {
        const mainThemeBtn = document.getElementById('themeToggle');
        if (mainThemeBtn) mainThemeBtn.click();
        else document.body.classList.toggle('dark');
        updateThemeText();
    });

    // Слушатель статуса
    onAuthStateChanged(auth, (user) => {
        if (user) {
            modal.classList.remove('mode-login', 'mode-register');
            modal.classList.add('mode-profile');
            document.getElementById('profileName').textContent = user.displayName || "Пользователь";
            document.getElementById('profileEmail').textContent = user.email;
            
            const avatar = document.getElementById('profileAvatar');
            if (user.photoURL) avatar.src = user.photoURL;
            else avatar.src = `https://via.placeholder.com/64/CCCCCC/FFFFFF?text=${(user.displayName||"U")[0]}`;
            
            if(overlay.classList.contains('open') && !modal.classList.contains('logged-in-flag')) {
                 closeModal();
            }
            modal.classList.add('logged-in-flag');
        } else {
            modal.classList.remove('mode-profile', 'logged-in-flag');
            modal.classList.add('mode-login');
        }
    });
}

initAuthWidget();