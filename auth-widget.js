// auth-widget.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 1. НАСТРОЙКИ (ВСТАВЬТЕ СВОИ ДАННЫЕ) ---
const firebaseConfig = {
  apiKey: "AIzaSyDBNCQo3rYgmDZkZrGKT-g2t0LlpsfH1Pg",
  authDomain: "tools-c98fd.firebaseapp.com",
  projectId: "tools-c98fd",
  storageBucket: "tools-c98fd.firebasestorage.app",
  messagingSenderId: "595986762798",
  appId: "1:595986762798:web:b8c05cddcb0f3a610163bf",
  measurementId: "G-X3Z1KH8760"
};

// --- 2. HTML ШАБЛОН МОДАЛКИ ---
const modalHTML = `
<div class="auth-overlay" id="authOverlay">
    <div class="auth-modal mode-login" id="authModal">
        <button class="auth-close" id="authClose">&times;</button>
        
        <div class="view-login">
            <h2 class="auth-title">Вход</h2>
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
            <div style="margin-bottom:20px; font-size: 1.1rem;">
                Привет, <b id="profileName">User</b>!
            </div>
            <div style="color:#666; margin-bottom:20px;" id="profileEmail"></div>
            <button class="auth-btn secondary" id="btnLogout">Выйти</button>
        </div>
    </div>
</div>
`;

// Кнопка, которая появится на сайте
const triggerBtnHTML = `
<button id="auth-trigger-btn" title="Профиль">
    <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
</button>
`;

// --- 3. ИНИЦИАЛИЗАЦИЯ ---
function initAuthWidget() {
    // Вставляем HTML в страницу
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.body.insertAdjacentHTML('beforeend', triggerBtnHTML);

    // Запускаем Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    // --- DOM ЭЛЕМЕНТЫ ---
    const overlay = document.getElementById('authOverlay');
    const modal = document.getElementById('authModal');
    const triggerBtn = document.getElementById('auth-trigger-btn');
    
    // --- ОТКРЫТИЕ / ЗАКРЫТИЕ ---
    const openModal = () => overlay.classList.add('open');
    const closeModal = () => overlay.classList.remove('open');

    triggerBtn.addEventListener('click', openModal);
    document.getElementById('authClose').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if(e.target === overlay) closeModal(); });

    // --- ПЕРЕКЛЮЧЕНИЕ ВХОД / РЕГИСТРАЦИЯ ---
    document.getElementById('toRegister').onclick = () => {
        modal.classList.remove('mode-login');
        modal.classList.add('mode-register');
    };
    document.getElementById('toLogin').onclick = () => {
        modal.classList.remove('mode-register');
        modal.classList.add('mode-login');
    };

    // --- ЛОГИКА: РЕГИСТРАЦИЯ ---
    document.getElementById('btnRegister').addEventListener('click', async () => {
        const email = document.getElementById('regEmail').value;
        const pass = document.getElementById('regPass').value;
        const name = document.getElementById('regName').value;

        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            // Сохраняем имя пользователя в профиль Firebase
            await updateProfile(userCred.user, { displayName: name });
            alert("Успешно!");
        } catch (e) {
            alert("Ошибка: " + e.message);
        }
    });

    // --- ЛОГИКА: ВХОД ---
    document.getElementById('btnLogin').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPass').value;
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            // Окно закроется само благодаря onAuthStateChanged
        } catch (e) {
            alert("Ошибка входа: " + e.message);
        }
    });

    // --- ЛОГИКА: ВЫХОД ---
    document.getElementById('btnLogout').addEventListener('click', () => {
        signOut(auth);
    });

    // --- СЛУШАТЕЛЬ СОСТОЯНИЯ (ГЛАВНОЕ) ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Если вошел
            modal.classList.remove('mode-login', 'mode-register');
            modal.classList.add('mode-profile');
            
            // Обновляем данные в окне
            document.getElementById('profileName').textContent = user.displayName || "Друг";
            document.getElementById('profileEmail').textContent = user.email;
            
            // Меняем иконку кнопки на активную (можно добавить цвет)
            triggerBtn.style.borderColor = "var(--primary)";
            closeModal(); // Закрыть окно после успешного входа
        } else {
            // Если вышел
            modal.classList.remove('mode-profile', 'mode-register');
            modal.classList.add('mode-login');
            triggerBtn.style.borderColor = "var(--border-color)";
        }
    });
}

// Запускаем сразу при загрузке
initAuthWidget();
