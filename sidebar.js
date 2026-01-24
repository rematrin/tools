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

// --- КОНФИГ FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyDBNCQo3rYgmDZkZrGKT-g2t0LlpsfH1Pg",
    authDomain: "tools-c98fd.firebaseapp.com",
    projectId: "tools-c98fd",
    storageBucket: "tools-c98fd.firebasestorage.app",
    messagingSenderId: "595986762798",
    appId: "1:595986762798:web:b8c05cddcb0f3a610163bf",
    measurementId: "G-X3Z1KH8760"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

window.auth = auth;
window.db = db;

// --- API БАЗЫ ДАННЫХ ---
window.dbApi = {
    saveApps: async (appsArray) => {
        const user = auth.currentUser;
        if (!user) return;
        try {
            await setDoc(doc(db, "users", user.uid), { apps: appsArray, lastUpdated: new Date() }, { merge: true });
        } catch (e) { console.error("Error saving apps:", e); }
    },
    loadApps: async () => {
        const user = auth.currentUser;
        if (!user) return null;
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data().apps || [] : null;
        } catch (e) { return null; }
    },
    saveWallpaper: async (settings) => {
        const user = auth.currentUser;
        if (!user) return;
        try {
            await setDoc(doc(db, "users", user.uid), { wallpaper: settings, lastUpdated: new Date() }, { merge: true });
        } catch (e) { console.error("Error saving wallpaper:", e); }
    },
    loadWallpaper: async () => {
        const user = auth.currentUser;
        if (!user) return null;
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data().wallpaper || null : null;
        } catch (e) { return null; }
    },
    saveSettings: async (settingsObj) => {
        const user = auth.currentUser;
        if (!user) return;
        try {
            await setDoc(doc(db, "users", user.uid), { uiSettings: settingsObj, lastUpdated: new Date() }, { merge: true });
        } catch (e) { console.error("Error saving settings:", e); }
    },
    loadSettings: async () => {
        const user = auth.currentUser;
        if (!user) return null;
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data().uiSettings || null : null;
        } catch (e) { return null; }
    }
};

// --- API АВТОРИЗАЦИИ ---
window.authApi = {
    login: async (email, password) => {
        try { await signInWithEmailAndPassword(auth, email, password); } catch (e) { alert("Ошибка входа: " + e.message); }
    },
    register: async (email, password, name) => {
        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            if (name) await updateProfile(userCred.user, { displayName: name });
        } catch (e) { alert("Ошибка регистрации: " + e.message); }
    },
    google: async () => {
        try { await signInWithPopup(auth, provider); } catch (e) { alert("Ошибка Google: " + e.message); }
    },
    logout: async () => {
        try { await signOut(auth); } catch (e) { console.error(e); }
    }
};

// --- ЛОГИКА БОКОВОГО МЕНЮ (UI) ---

export function initSidebarManager(context) {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeMenuBtn = document.getElementById('closeMenuBtn');
    let authMode = 'login';

    function openMenu() {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderSidebar();
    }

    function closeMenu() {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    menuBtn.addEventListener('click', openMenu);
    closeMenuBtn.addEventListener('click', closeMenu);
    sidebarOverlay.addEventListener('click', closeMenu);

    function renderSidebar() {
        const content = document.getElementById('sidebarContent');
        const currentUser = auth.currentUser;

        // КНОПКА "ДОБАВИТЬ САЙТ" (ВСЕГДА ВВЕРХУ)
        const addSiteHTML = `
            <div class="profile-cardnon" style="margin-bottom: 20px;">
                <h2 class="profile-title-in-card" style="margin-bottom: 10px;">Мои сайты</h2>
                <p class="section-desc">Нажмите для добавления нового сайта.</p>
                <button class="sidebar-dummy-btn" id="btnOpenEditor" style="margin-bottom: 0;">
                    <span>+</span> Добавить сайт
                </button>
            </div>
        `;

        // АККАУНТ / ВХОД
        let accountHTML = "";
        if (currentUser) {
            const photoURL = currentUser.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop';
            const displayName = currentUser.displayName || 'Пользователь';
            const email = currentUser.email || '';
            const isGoogleAuth = currentUser.providerData.some(p => p.providerId === 'google.com');
            const googleBadgeHTML = isGoogleAuth ? `<div class="google-badge"><img src="https://www.google.com/s2/favicons?domain=google.com" style="width: 100%; height: 100%;"></div>` : '';

            accountHTML = `
                <div class="profile-card">
                    <h2 class="profile-title-in-card">Аккаунт</h2>
                    <div class="profile-content-row">
                        <div class="avatar-wrapper">
                            <img src="${photoURL}" class="profile-avatar">
                            ${googleBadgeHTML}
                        </div>
                        <div class="profile-info">
                            <div class="profile-name">${displayName}</div>
                            <div class="profile-email">${email}</div>
                            <button class="logout-btn-styled" id="logoutBtn">
                                <svg class="logout-icon-small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                    <polyline points="16 17 21 12 16 7"></polyline>
                                    <line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                Выйти
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            if (authMode === 'login') {
                accountHTML = `
                    <div class="profile-cardnon">
                        <h2 class="profile-title-in-card" style="margin-bottom: 10px;">Вход</h2>
                        <div class="form-container" style="gap: 8px;">
                            <button id="doGoogleBtn" class="google-btn">
                                <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285f4"></path><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34a853"></path><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fbbc05"></path><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#ea4335"></path></svg>
                                Google
                            </button>
                            <div class="divider">или</div>
                            <input type="email" id="authEmail" class="form-input" placeholder="Email">
                            <input type="password" id="authPass" class="form-input" placeholder="Пароль">
                            <button id="doLoginBtn" class="primary-btn">Войти</button>
                            <div class="text-link" id="goRegister">Регистрация</div>
                        </div>
                    </div>`;
            } else {
                accountHTML = `
                    <div class="profile-cardnon">
                        <h2 class="profile-title-in-card" style="margin-bottom: 10px;">Регистрация</h2>
                        <div class="form-container" style="gap: 8px;">
                            <input type="text" id="regName" class="form-input" placeholder="Имя">
                            <input type="email" id="regEmail" class="form-input" placeholder="Email">
                            <input type="password" id="regPass" class="form-input" placeholder="Пароль">
                            <button id="doRegisterBtn" class="primary-btn">Создать</button>
                            <div class="text-link" id="goLogin">Уже есть аккаунт? Войти</div>
                        </div>
                    </div>`;
            }
        }

        // ОФОРМЛЕНИЕ
        const currentCols = localStorage.getItem('gridColumns') || '4';
        const isGlassEnabled = localStorage.getItem('glassEffect') === 'true';

        const glassSettingsHTML = `
            <div class="profile-card">
                <h2 class="profile-title-in-card">Макет и Стекло</h2>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <span>Эффект стекла</span>
                    <label class="switch">
                        <input type="checkbox" id="globalGlassToggle" ${isGlassEnabled ? 'checked' : ''}>
                        <span class="slider-toggle"></span>
                    </label>
                </div>
                <div class="slider-group" style="margin-top: 15px;">
                    <div class="slider-header" style="margin-bottom: 5px; display:flex; justify-content:space-between;">
                        <span>Колонок</span>
                        <span id="colCountValue">${currentCols}</span>
                    </div>
                    <input type="range" id="colCountSlider" class="ios-slider" min="3" max="10" step="1" value="${currentCols}">
                </div>
            </div>
        `;

        // СБОРКА КОНТЕНТА
        content.innerHTML = addSiteHTML + accountHTML + glassSettingsHTML + context.wallpaperManager.getSettingsHTML(!currentUser);

        // ПРИВЯЗКА СОБЫТИЙ
        attachSidebarEvents();
    }

    function attachSidebarEvents() {
        // Добавление сайта
        const btnAdd = document.getElementById('btnOpenEditor');
        if (btnAdd) {
            btnAdd.onclick = () => {
                context.iconEditor.open((data) => {
                    let u = data.url || "";
                    if (u && !u.startsWith('http')) u = 'https://' + u;
                    const newApp = { name: data.name || "Новый сайт", url: u, icon: data.icon };
                    const currentApps = context.getAppsFromDOM();
                    currentApps.push(newApp);
                    context.renderAppsToDOM(currentApps);
                    context.saveCurrentState(currentApps);
                    closeMenu();
                });
            };
        }

        // Аккаунт / Авторизация
        if (auth.currentUser) {
            const logout = document.getElementById('logoutBtn');
            if (logout) logout.onclick = () => window.authApi.logout();
        } else {
            const doLogin = document.getElementById('doLoginBtn');
            if (doLogin) doLogin.onclick = () => {
                const e = document.getElementById('authEmail').value;
                const p = document.getElementById('authPass').value;
                window.authApi.login(e, p);
            };
            const doGoogle = document.getElementById('doGoogleBtn');
            if (doGoogle) doGoogle.onclick = () => window.authApi.google();

            const goReg = document.getElementById('goRegister');
            if (goReg) goReg.onclick = () => { authMode = 'register'; renderSidebar(); };

            const goLog = document.getElementById('goLogin');
            if (goLog) goLog.onclick = () => { authMode = 'login'; renderSidebar(); };

            const doRegister = document.getElementById('doRegisterBtn');
            if (doRegister) doRegister.onclick = () => {
                const n = document.getElementById('regName').value;
                const e = document.getElementById('regEmail').value;
                const p = document.getElementById('regPass').value;
                window.authApi.register(e, p, n);
            };
        }

        // Стекло
        const glassToggle = document.getElementById('globalGlassToggle');
        if (glassToggle) {
            glassToggle.onchange = (e) => {
                const isEnabled = e.target.checked;
                if (isEnabled) document.body.classList.add('glass-mode');
                else document.body.classList.remove('glass-mode');
                localStorage.setItem('glassEffect', isEnabled.toString());
                if (auth.currentUser) window.dbApi.saveSettings({ glassEffect: isEnabled });
            };
        }

        // Колонки
        const colSlider = document.getElementById('colCountSlider');
        const colValue = document.getElementById('colCountValue');
        if (colSlider && colValue) {
            colSlider.oninput = (e) => {
                const val = e.target.value;
                colValue.innerText = val;
                document.documentElement.style.setProperty('--grid-cols', val);
            };
            colSlider.onchange = (e) => {
                const val = e.target.value;
                localStorage.setItem('gridColumns', val);
                if (auth.currentUser) window.dbApi.saveSettings({ gridColumns: val });
            };
        }

        // Обои
        context.wallpaperManager.attachListeners();
    }

    return {
        refreshSidebar: renderSidebar
    };
}