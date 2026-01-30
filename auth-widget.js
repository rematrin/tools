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
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDBNCQo3rYgmDZkZrGKT-g2t0LlpsfH1Pg",
    authDomain: "tools-c98fd.firebaseapp.com",
    projectId: "tools-c98fd",
    storageBucket: "tools-c98fd.firebasestorage.app",
    messagingSenderId: "595986762798",
    appId: "1:595986762798:web:b8c05cddcb0f3a610163bf",
    measurementId: "G-X3Z1KH8760"
};

// Экспортируем функции для других модулей
window.doc = doc;
window.setDoc = setDoc;
window.getDoc = getDoc;
window.updateDoc = (d, data) => setDoc(d, data, { merge: true }); // Упрощенный update
window.serverTimestamp = serverTimestamp;

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
                <img id="profileAvatar" src="https://i.ibb.co/Z6vRKK9x/0000000.jpg" class="vk-avatar-large">
                <div class="vk-user-name" id="profileName">Загрузка...</div>
                <div class="vk-user-sub" id="profileEmail">...</div>
            </div>
            <div class="vk-menu-list">
                <button class="vk-menu-item item-logout" id="btnLogout">
                    <svg class="vk-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    <span class="vk-menu-text">Выйти</span>
                </button>
            </div>
        </div>

        <div class="view-connect">
            <h2 class="auth-title">Облако</h2>
            <div style="background: rgba(38, 136, 235, 0.1); color: #2688eb; padding: 12px; border-radius: 10px; font-size: 0.85rem; margin-bottom: 20px; line-height: 1.4; text-align: center;">
                Подключитесь к Google Drive, чтобы ваши планы сохранялись автоматически и были доступны везде.
            </div>
            <button class="auth-btn google-btn" id="btnGoogleConnect">
                <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill-rule="evenodd" fill-opacity="1" fill="#4285f4" stroke="none"></path><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill-rule="evenodd" fill-opacity="1" fill="#34a853" stroke="none"></path><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill-rule="evenodd" fill-opacity="1" fill="#fbbc05" stroke="none"></path><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill-rule="evenodd" fill-opacity="1" fill="#ea4335" stroke="none"></path></svg>
                Подключить Drive
            </button>
        </div>

        <div class="auth-footer">
            <span class="auth-footer-label">Тема:</span>
            <div class="theme-control">
                <button class="theme-btn" data-theme="light" title="Светлая">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                </button>
                <button class="theme-btn" data-theme="dark" title="Темная">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </button>
                <button class="theme-btn" data-theme="auto" title="Системная">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
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
    const db = getFirestore(app);
    window.db = db; // Экспортируем для сервиса диска

    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');

    // ПАРАМЕТРЫ ДЛЯ OFFLINE ACCESS (Refresh Token)
    provider.setCustomParameters({
        'access_type': 'offline'
        // 'prompt': 'consent' // Удалено, чтобы не заставлять пользователя подтверждать права каждый раз
    });

    const overlay = document.getElementById('authOverlay');
    const modal = document.getElementById('authModal');

    let activeTrigger = null;

    // === ЛОГИКА ОПРЕДЕЛЕНИЯ ТЕМЫ ===
    const themeBtns = document.querySelectorAll('.theme-btn');

    // Функция: Подсветить активную кнопку
    const updateThemeUI = (currentTheme) => {
        themeBtns.forEach(btn => {
            if (btn.dataset.theme === currentTheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    // Функция: Узнать текущую тему
    const detectCurrentTheme = () => {
        // Проверяем наличие глобальной функции из theme-loader.js
        if (typeof window.getThemeMode === 'function') {
            return window.getThemeMode();
        }

        // Фолбэк, если лоадер еще не загрузился или произошла ошибка
        const stored = localStorage.getItem('themeMode');
        if (stored === 'system') return 'auto';
        if (stored === 'light' || stored === 'dark') return stored;
        return 'auto';
    };

    // === ПОЗИЦИОНИРОВАНИЕ ===
    const recalcPosition = () => {
        const triggerBtn = activeTrigger || document.getElementById('profile-container');

        if (triggerBtn && overlay.classList.contains('open')) {
            const rect = triggerBtn.getBoundingClientRect();
            const modalHeight = modal.offsetHeight || 300; // Rough estimate if not rendered

            // Если снизу мало места, открываем над кнопкой
            if (rect.bottom + modalHeight > window.innerHeight) {
                modal.style.top = 'auto';
                modal.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
                modal.style.transformOrigin = 'bottom left';
            } else {
                modal.style.top = (rect.bottom + 8) + 'px';
                modal.style.bottom = 'auto';
                modal.style.transformOrigin = 'top left';
            }

            const centerX = window.innerWidth / 2;
            if (rect.left < centerX) {
                modal.style.left = rect.left + 'px';
                modal.style.right = 'auto';
            } else {
                const rightPos = window.innerWidth - rect.right;
                modal.style.right = rightPos + 'px';
                modal.style.left = 'auto';
                if (modal.style.transformOrigin.includes('bottom')) {
                    modal.style.transformOrigin = 'bottom right';
                } else {
                    modal.style.transformOrigin = 'top right';
                }
            }
        }
    };

    const closeModal = () => {
        overlay.classList.remove('open');
        window.removeEventListener('resize', recalcPosition);
        activeTrigger = null;
    };

    window.openAuthModal = (triggerElement, mode) => {
        if (overlay.classList.contains('open')) {
            const currentModeClass = Array.from(modal.classList).find(c => c.startsWith('mode-'));
            if (mode && currentModeClass === 'mode-' + mode) {
                closeModal();
                return;
            }
            if (!mode) {
                closeModal();
                return;
            }
        }

        if (mode) {
            modal.classList.remove('mode-login', 'mode-register', 'mode-profile', 'mode-connect');
            modal.classList.add('mode-' + mode);
        }

        activeTrigger = triggerElement;
        overlay.classList.add('open');
        recalcPosition();
        window.addEventListener('resize', recalcPosition);

        // Синхронизируем UI при открытии
        updateThemeUI(detectCurrentTheme());
    };

    // === ОБРАБОТЧИК КЛИКА ПО ТЕМЕ ===
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedTheme = btn.dataset.theme; // 'light', 'dark', 'auto'

            // 1. Сразу меняем UI
            updateThemeUI(selectedTheme);

            // 2. Безопасно вызываем функцию смены темы
            if (typeof window.setTheme === 'function') {
                window.setTheme(selectedTheme);
            } else {
                // Если theme-loader.js почему-то не прогрузился
                console.error("Ошибка: theme-loader.js не инициализирован. Применяю локальный фоллбэк.");

                // Простой фоллбэк, чтобы хоть как-то работало
                document.body.classList.remove('dark');
                if (selectedTheme === 'dark') {
                    document.body.classList.add('dark');
                } else if (selectedTheme === 'auto') {
                    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        document.body.classList.add('dark');
                    }
                }
                localStorage.setItem('themeMode', selectedTheme === 'auto' ? 'system' : selectedTheme);
            }
        });
    });

    document.getElementById('authClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    document.getElementById('toRegister').onclick = () => {
        modal.classList.remove('mode-login'); modal.classList.add('mode-register');
    };
    document.getElementById('toLogin').onclick = () => {
        modal.classList.remove('mode-register'); modal.classList.add('mode-login');
    };

    const refreshGoogleToken = async () => {
        try {
            console.log("Запускаем обновление токена через Popup...");
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential.accessToken;
            const refreshToken = result._tokenResponse?.refreshToken || null;

            if (token) {
                // Устанавливаем "вечный" срок жизни для локальной проверки (10 лет)
                // На самом деле токен Google живет 1 час, но мы будем обновлять его только по факту ошибки 401
                const expiry = Date.now() + 10 * 365 * 24 * 3600 * 1000;
                localStorage.setItem('google_access_token', token);
                localStorage.setItem('google_token_expiry', expiry);

                const user = auth.currentUser;
                if (user) {
                    await setDoc(doc(db, "users", user.uid), {
                        google_access_token: token,
                        google_token_expiry: expiry,
                        google_refresh_token: refreshToken,
                        updated_at: serverTimestamp()
                    }, { merge: true });
                }

                window.dispatchEvent(new CustomEvent('googleTokenChanged', { detail: { token } }));
                return token;
            }
        } catch (e) {
            console.error("Ошибка при обновлении токена:", e);
            throw e;
        }
    };
    window.refreshGoogleToken = refreshGoogleToken;

    document.getElementById('btnGoogleLogin').addEventListener('click', refreshGoogleToken);
    document.getElementById('btnGoogleConnect').addEventListener('click', async () => {
        await refreshGoogleToken();
        closeModal();
    });

    // Функция для получения токена с проверкой на протухание
    window.getGoogleAccessToken = () => {
        const token = localStorage.getItem('google_access_token');
        const expiry = localStorage.getItem('google_token_expiry');

        if (token && expiry && Date.now() < parseInt(expiry)) {
            return token;
        }
        return null; // Токен протух или отсутствует
    };
    document.getElementById('btnRegister').addEventListener('click', async () => {
        try {
            const uc = await createUserWithEmailAndPassword(auth,
                document.getElementById('regEmail').value,
                document.getElementById('regPass').value
            );
            await updateProfile(uc.user, { displayName: document.getElementById('regName').value });
        } catch (e) {
            if (typeof showToast === 'function') showToast("Ошибка: " + e.message, 'error');
            else console.error(e);
        }
    });
    document.getElementById('btnLogin').addEventListener('click', async () => {
        try {
            await signInWithEmailAndPassword(auth,
                document.getElementById('loginEmail').value,
                document.getElementById('loginPass').value
            );
        } catch (e) {
            if (typeof showToast === 'function') showToast("Ошибка: " + e.message, 'error');
            else console.error(e);
        }
    });
    document.getElementById('btnLogout').addEventListener('click', () => {
        signOut(auth);
        localStorage.removeItem('google_access_token');
        closeModal();
    });

    onAuthStateChanged(auth, async (user) => {
        window.currentUser = user; // Делаем пользователя доступным глобально
        if (user) {
            modal.classList.remove('mode-login', 'mode-register');
            modal.classList.add('mode-profile');
            document.getElementById('profileName').textContent = user.displayName || "Пользователь";
            document.getElementById('profileEmail').textContent = user.email;

            const avatar = document.getElementById('profileAvatar');
            if (user.photoURL) avatar.src = user.photoURL;
            else avatar.src = `https://via.placeholder.com/64/CCCCCC/FFFFFF?text=${(user.displayName || "U")[0]}`;

            if (overlay.classList.contains('open') && !modal.classList.contains('logged-in-flag')) {
                closeModal();
            }
            modal.classList.add('logged-in-flag');

            // Попробуем достать токен из БД если его нет в localStorage
            if (!localStorage.getItem('google_access_token')) {
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        if (data.google_access_token) {
                            localStorage.setItem('google_access_token', data.google_access_token);
                            localStorage.setItem('google_token_expiry', data.google_token_expiry || 0);
                        }
                    }
                } catch (e) { console.error("Ошибка синхронизации токена:", e); }
            }

            // Генерируем событие об изменении состояния авторизации
            window.dispatchEvent(new CustomEvent('authChanged', { detail: { user } }));
        } else {
            modal.classList.remove('mode-profile', 'logged-in-flag');
            modal.classList.add('mode-login');

            const avatar = document.getElementById('profileAvatar');
            if (avatar) avatar.src = 'https://i.ibb.co/Z6vRKK9x/0000000.jpg';

            window.dispatchEvent(new CustomEvent('authChanged', { detail: { user: null } }));
        }
    });

    // Экспортируем auth и provider для возможности повторного получения токена если он протух
    window.firebaseAuth = auth;
    window.googleProvider = provider;
}

initAuthWidget();