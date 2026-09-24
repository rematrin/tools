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
    collection,
    getDocs,
    deleteDoc,
    writeBatch,
    updateDoc,
    onSnapshot
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

// --- МИГРАЦИЯ: массив apps → подколлекция apps ---
async function migrateAppsToSubcollection(userId) {
    try {
        const userDocRef = doc(db, "users", userId);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) return false;

        const data = userSnap.data();
        // Проверяем, есть ли старый массив apps в документе пользователя
        if (!data.apps || !Array.isArray(data.apps) || data.apps.length === 0) return false;

        console.log(`[Migration] Найдено ${data.apps.length} приложений в старом формате. Миграция...`);

        // Вспомогательная функция: удаляет поле apps из документа пользователя
        const removeOldAppsField = async () => {
            const cleanData = { ...data };
            delete cleanData.apps;
            await setDoc(userDocRef, { ...cleanData, _appsMigrated: true, lastUpdated: new Date() });
        };

        // Проверяем, не мигрировали ли уже (если подколлекция уже содержит данные — не перезаписываем)
        const appsCollRef = collection(db, "users", userId, "apps");
        const existingSnap = await getDocs(appsCollRef);
        if (!existingSnap.empty) {
            console.log(`[Migration] Подколлекция apps уже содержит ${existingSnap.size} документов. Удаляем старое поле.`);
            await removeOldAppsField();
            return false;
        }

        // Записываем каждое приложение как отдельный документ в подколлекцию
        const batch = writeBatch(db);
        data.apps.forEach((app, index) => {
            const appDocRef = doc(appsCollRef); // auto-ID
            batch.set(appDocRef, { ...app, order: index });
        });
        await batch.commit();

        // Удаляем старое поле apps из документа пользователя
        await removeOldAppsField();

        console.log(`[Migration] Успешно мигрировано ${data.apps.length} приложений в подколлекцию.`);
        return true;
    } catch (e) {
        console.error("[Migration] Ошибка миграции:", e);
        return false;
    }
}

// --- Блокировка для предотвращения одновременной записи в подколлекцию apps ---
let _appsWriteLock = Promise.resolve();
function withAppsLock(fn) {
    const prev = _appsWriteLock;
    let resolve;
    _appsWriteLock = new Promise(r => { resolve = r; });
    return prev.then(() => fn()).finally(() => resolve());
}

// --- API БАЗЫ ДАННЫХ ---
window.dbApi = {
    // Миграция (вызывается при логине)
    migrateApps: async () => {
        const user = auth.currentUser;
        if (!user) return false;
        return withAppsLock(() => migrateAppsToSubcollection(user.uid));
    },

    saveApps: async (appsArray) => {
        const user = auth.currentUser;
        if (!user) return;
        return withAppsLock(async () => {
            try {
                const appsCollRef = collection(db, "users", user.uid, "apps");

                // Удаляем все существующие документы в подколлекции
                const existingSnap = await getDocs(appsCollRef);
                const deleteBatch = writeBatch(db);
                existingSnap.forEach(docSnap => {
                    deleteBatch.delete(docSnap.ref);
                });
                await deleteBatch.commit();

                // Записываем новые приложения
                const saveBatch = writeBatch(db);
                appsArray.forEach((app, index) => {
                    const appDocRef = doc(appsCollRef); // auto-ID
                    saveBatch.set(appDocRef, { ...app, order: index });
                });
                await saveBatch.commit();

                // Обновляем метку времени в документе пользователя
                await setDoc(doc(db, "users", user.uid), { lastUpdated: new Date() }, { merge: true });
            } catch (e) { console.error("Error saving apps:", e); }
        });
    },

    loadApps: async () => {
        const user = auth.currentUser;
        if (!user) return null;
        return withAppsLock(async () => {
            try {
                const appsCollRef = collection(db, "users", user.uid, "apps");
                const snapshot = await getDocs(appsCollRef);

                if (snapshot.empty) return null;

                // Собираем приложения и сортируем по полю order
                const apps = [];
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    const { order, ...appData } = data;
                    apps.push({ ...appData, _order: order ?? 9999, _ref: docSnap.ref });
                });
                apps.sort((a, b) => a._order - b._order);

                // Дедупликация: если есть дубли (из-за гонки), удаляем лишние
                const seen = new Set();
                const unique = [];
                const dupeRefs = [];
                for (const app of apps) {
                    // Для папок добавляем кол-во элементов в ключ
                    const itemsKey = app.type === 'folder' ? `-${(app.items || []).length}items` : '';
                    const key = `${app.name || ''}-${app.url || ''}-${app.type || ''}${itemsKey}`;
                    if (seen.has(key)) {
                        dupeRefs.push(app._ref);
                    } else {
                        seen.add(key);
                        unique.push(app);
                    }
                }

                // Удаляем дубли из Firestore
                if (dupeRefs.length > 0) {
                    console.log(`[Dedup] Найдено ${dupeRefs.length} дубликатов, удаляю...`);
                    const dedupBatch = writeBatch(db);
                    dupeRefs.forEach(ref => dedupBatch.delete(ref));
                    await dedupBatch.commit();
                }

                // Убираем служебные поля
                return unique.map(({ _order, _ref, ...rest }) => rest);
            } catch (e) { return null; }
        });
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
    },
    saveCategories: async (categoriesArray) => {
        const user = auth.currentUser;
        if (!user) return;
        try {
            await setDoc(doc(db, "users", user.uid), { categories: categoriesArray, lastUpdated: new Date() }, { merge: true });
        } catch (e) { console.error("Error saving categories:", e); }
    },
    loadCategories: async () => {
        const user = auth.currentUser;
        if (!user) return [];
        try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? docSnap.data().categories || [] : [];
        } catch (e) { return []; }
    },
    subscribeToApps: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => {};
        const appsCollRef = collection(db, "users", user.uid, "apps");
        return onSnapshot(appsCollRef, (snapshot) => {
            if (snapshot.empty) {
                callback([]);
                return;
            }
            const apps = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const { order, ...appData } = data;
                apps.push({ ...appData, _order: order ?? 9999 });
            });
            apps.sort((a, b) => a._order - b._order);

            const seen = new Set();
            const unique = [];
            for (const app of apps) {
                const itemsKey = app.type === 'folder' ? `-${(app.items || []).length}items` : '';
                const key = `${app.name || ''}-${app.url || ''}-${app.type || ''}${itemsKey}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(app);
                }
            }
            const cleanApps = unique.map(({ _order, ...rest }) => rest);
            callback(cleanApps);
        }, (err) => {
            console.error("[RealtimeSync] Apps snapshot error:", err);
        });
    },
    subscribeToUserDoc: (callback) => {
        const user = auth.currentUser;
        if (!user) return () => {};
        const userDocRef = doc(db, "users", user.uid);
        return onSnapshot(userDocRef, (snap) => {
            if (snap.exists()) {
                callback(snap.data());
            }
        }, (err) => {
            console.error("[RealtimeSync] UserDoc snapshot error:", err);
        });
    }
};

// --- API АВТОРИЗАЦИИ ---
window.authApi = {
    login: async (email, password) => {
        try { await signInWithEmailAndPassword(auth, email, password); } catch (e) {
            if (window.showToast) window.showToast("Ошибка входа: " + e.message, true);
            else alert("Ошибка входа: " + e.message);
        }
    },
    register: async (email, password, name) => {
        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            if (name) await updateProfile(userCred.user, { displayName: name });
        } catch (e) {
            if (window.showToast) window.showToast("Ошибка регистрации: " + e.message, true);
            else alert("Ошибка регистрации: " + e.message);
        }
    },
    google: async () => {
        try { await signInWithPopup(auth, provider); } catch (e) {
            if (window.showToast) window.showToast("Ошибка Google: " + e.message, true);
            else alert("Ошибка Google: " + e.message);
        }
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
                <button class="sidebar-dummy-btn" id="btnOpenEditor" style="margin-bottom: 0; ${!currentUser ? 'opacity: 0.5; filter: grayscale(1); cursor: default;' : ''}" ${!currentUser ? 'disabled' : ''}>
                    <span>+</span> Добавить сайт
                </button>
                ${!currentUser ? `
                    <p class="section-desc" style="margin-top: 6px; color: #565656ff; font-weight: 500;">Войдите для добавления сайта и синхронизации.</p>
                ` : `
                    <p class="section-desc" style="margin-top: 6px;">Нажмите для добавления нового сайта.</p>
                `}
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
        const currentRows = localStorage.getItem('gridRows') || '6';
        const isGlassEnabled = localStorage.getItem('glassEffect') === 'true';
        const openInNewTab = localStorage.getItem('openInNewTab') === 'true';
        const expandedFolders = localStorage.getItem('expandedFolders') === 'true';
        const showFactsWidget = localStorage.getItem('showFactsWidget') !== 'false';

        const glassSettingsHTML = `
            <div class="profile-card" style="gap: 8px; padding: 12px 16px;">
                <h2 class="profile-title-in-card" style="font-size: 16px;">Макет и интерфейс</h2>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                    <span style="font-size: 14px;">Эффект стекла</span>
                    <label class="switch" style="transform: scale(0.85); transform-origin: right;">
                        <input type="checkbox" id="globalGlassToggle" ${isGlassEnabled ? 'checked' : ''}>
                        <span class="slider-toggle"></span>
                    </label>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0;">
                    <span style="font-size: 14px; flex: 1; padding-right: 10px;">Открывать сайты в новой вкладке</span>
                    <label class="switch" style="transform: scale(0.85); transform-origin: right;">
                        <input type="checkbox" id="openNewTabToggle" ${openInNewTab ? 'checked' : ''}>
                        <span class="slider-toggle"></span>
                    </label>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0;">
                    <span style="font-size: 14px; flex: 1; padding-right: 10px;">Расширенные папки</span>
                    <label class="switch" style="transform: scale(0.85); transform-origin: right;">
                        <input type="checkbox" id="expandedFoldersToggle" ${expandedFolders ? 'checked' : ''}>
                        <span class="slider-toggle"></span>
                    </label>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0;">
                    <span style="font-size: 14px; flex: 1; padding-right: 10px;">Вкладки в несколько рядов</span>
                    <label class="switch" style="transform: scale(0.85); transform-origin: right;">
                        <input type="checkbox" id="wrapCategoriesToggle" ${localStorage.getItem('wrapCategories') === 'true' ? 'checked' : ''}>
                        <span class="slider-toggle"></span>
                    </label>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0;">
                    <span style="font-size: 14px; flex: 1; padding-right: 10px;">Интересные факты и цитаты</span>
                    <label class="switch" style="transform: scale(0.85); transform-origin: right;">
                        <input type="checkbox" id="showFactsWidgetToggle" ${showFactsWidget ? 'checked' : ''}>
                        <span class="slider-toggle"></span>
                    </label>
                </div>
                <div class="slider-group" style="margin-top: 8px;">
                    <div class="slider-header" style="margin-bottom: 2px; display:flex; justify-content:space-between; font-size: 14px;">
                        <span>Колонок</span>
                        <span id="colCountValue">${currentCols}</span>
                    </div>
                    <input type="range" id="colCountSlider" class="ios-slider" min="3" max="10" step="1" value="${currentCols}">
                </div>
                <div class="slider-group" style="margin-top: 8px;">
                    <div class="slider-header" style="margin-bottom: 2px; display:flex; justify-content:space-between; font-size: 14px;">
                        <span>Рядов</span>
                        <span id="rowCountValue">${currentRows}</span>
                    </div>
                    <input type="range" id="rowCountSlider" class="ios-slider" min="3" max="10" step="1" value="${currentRows}">
                </div>
            </div>
        `;

        // УПРАВЛЕНИЕ ДАННЫМИ
        const dataManagementHTML = `
            <div class="profile-card" style="padding: 12px 16px; margin-bottom: 12px;">
                <h2 class="profile-title-in-card" style="font-size: 16px;">Файлы бэкапов</h2>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="primary-btn" id="btnExportData" style="background: #34C759; margin-top: 0; flex: 1; height: 34px; padding: 0; font-size: 12px; ${!currentUser ? 'opacity: 0.5; filter: grayscale(1); cursor: default;' : ''}" ${!currentUser ? 'disabled' : ''}>Экспорт данных</button>
                    <button class="primary-btn" id="btnImportData" style="background: #007AFF; margin-top: 0; flex: 1; height: 34px; padding: 0; font-size: 12px; ${!currentUser ? 'opacity: 0.5; filter: grayscale(1); cursor: default;' : ''}" ${!currentUser ? 'disabled' : ''}>Импорт данных</button>
                </div>
                ${!currentUser ? `
                    <p class="section-desc" style="margin-top: 6px; color: #565656ff; font-weight: 500;">Войдите для управления файлами.</p>
                ` : `
                    <p class="section-desc" style="margin-top: 6px;">Скачать или загрузить файл с сайтами и настройками.</p>
                `}
                <input type="file" id="importFileInput" style="display: none;" accept=".json">
            </div>
        `;

        // ИСТОРИЯ ВЕРСИЙ (БЭКАПЫ)
        const versionHistoryHTML = `
            <div class="profile-card" style="padding: 12px 16px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <h2 class="profile-title-in-card" style="font-size: 16px; margin: 0;">История версий</h2>
                    <button class="primary-btn" id="btnCreateBackup" style="background: #007AFF; margin: 0; padding: 0 10px; height: 28px; font-size: 12px; width: auto; font-weight: 500;">+ Бэкап</button>
                </div>
                <p class="section-desc" style="margin-top: 0; margin-bottom: 10px; font-size: 12px;">Авто-снимки и сохраненные точки восстановления.</p>
                <div id="versionHistoryList" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 2px;">
                </div>
            </div>
        `;

        // СБОРКА КОНТЕНТА
        content.innerHTML = addSiteHTML + accountHTML + glassSettingsHTML + context.wallpaperManager.getSettingsHTML(!currentUser) + versionHistoryHTML + dataManagementHTML;

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
                    const newApp = { name: data.name || "Новый сайт", url: u, icon: data.icon, category: data.category || [], _explicitNoMain: data._explicitNoMain };
                    const currentApps = context.getAppsFromStorage();
                    currentApps.push(newApp);
                    context.renderAppsToDOM(currentApps);
                    context.saveCurrentState(currentApps);
                    closeMenu();
                }, null, window.userCategories || []);
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

        // Открытие в новой вкладке
        const newTabToggle = document.getElementById('openNewTabToggle');
        if (newTabToggle) {
            newTabToggle.onchange = (e) => {
                const isEnabled = e.target.checked;
                localStorage.setItem('openInNewTab', isEnabled.toString());
                if (auth.currentUser) window.dbApi.saveSettings({ openInNewTab: isEnabled });
                // Принудительно перерисовываем иконки, чтобы обновились ссылки
                context.renderAppsToDOM(context.getAppsFromStorage());
            };
        }

        // Расширенные папки
        const expandedFoldersToggle = document.getElementById('expandedFoldersToggle');
        if (expandedFoldersToggle) {
            expandedFoldersToggle.onchange = (e) => {
                const isEnabled = e.target.checked;
                if (isEnabled) document.body.classList.add('expanded-folders');
                else document.body.classList.remove('expanded-folders');
                localStorage.setItem('expandedFolders', isEnabled.toString());
                if (auth.currentUser) window.dbApi.saveSettings({ expandedFolders: isEnabled });
            };
        }



        // Вкладки в несколько рядов
        const wrapCategoriesToggle = document.getElementById('wrapCategoriesToggle');
        if (wrapCategoriesToggle) {
            wrapCategoriesToggle.onchange = (e) => {
                const isEnabled = e.target.checked;
                localStorage.setItem('wrapCategories', isEnabled.toString());
                if (auth.currentUser) window.dbApi.saveSettings({ wrapCategories: isEnabled });
                if (window.applyCategoryBarWrapMode) window.applyCategoryBarWrapMode();
            };
        }

        // Интересные факты и цитаты
        const showFactsWidgetToggle = document.getElementById('showFactsWidgetToggle');
        if (showFactsWidgetToggle) {
            showFactsWidgetToggle.onchange = (e) => {
                const isEnabled = e.target.checked;
                localStorage.setItem('showFactsWidget', isEnabled.toString());
                if (auth.currentUser) window.dbApi.saveSettings({ showFactsWidget: isEnabled });
                if (isEnabled) document.body.classList.add('show-facts-widget-enabled');
                else document.body.classList.remove('show-facts-widget-enabled');
            };
        }

        // Колонки
        const colSlider = document.getElementById('colCountSlider');
        const colValue = document.getElementById('colCountValue');
        if (colSlider && colValue) {
            colSlider.oninput = (e) => {
                const val = e.target.value;
                colValue.innerText = val;
                localStorage.setItem('gridColumns', val);
                document.documentElement.style.setProperty('--grid-cols', val);
                if (context.onLayoutChange) context.onLayoutChange();
            };
            colSlider.onchange = (e) => {
                const val = e.target.value;
                localStorage.setItem('gridColumns', val);
                if (auth.currentUser) window.dbApi.saveSettings({ gridColumns: val });
            };
        }

        // Ряды
        const rowSlider = document.getElementById('rowCountSlider');
        const rowValue = document.getElementById('rowCountValue');
        if (rowSlider && rowValue) {
            rowSlider.oninput = (e) => {
                const val = e.target.value;
                rowValue.innerText = val;
                localStorage.setItem('gridRows', val);
                document.documentElement.style.setProperty('--grid-rows', val);
                if (context.onLayoutChange) context.onLayoutChange();
            };
            rowSlider.onchange = (e) => {
                const val = e.target.value;
                localStorage.setItem('gridRows', val);
                if (auth.currentUser) window.dbApi.saveSettings({ gridRows: val });
            };
        }

        // Обои
        context.wallpaperManager.attachListeners();

        // Отрисовка и обработчики истории версий
        function renderVersionHistoryUI() {
            const listContainer = document.getElementById('versionHistoryList');
            if (!listContainer) return;

            const VersionManager = window.VersionManager;
            if (!VersionManager) {
                listContainer.innerHTML = '<div style="font-size: 12px; color: rgba(255,255,255,0.5);">Загрузка...</div>';
                return;
            }

            const versions = VersionManager.getLocalVersions();
            if (!versions || versions.length === 0) {
                listContainer.innerHTML = '<div style="font-size: 12px; color: rgba(255,255,255,0.5); text-align: center; padding: 10px 0;">Нет сохраненных версий</div>';
                return;
            }

            listContainer.innerHTML = versions.map(v => `
                <div class="version-item-card" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0, 0, 0, 0.04); border: 1px solid rgba(0, 0, 0, 0.08); padding: 8px 10px; border-radius: 10px; gap: 8px; margin-bottom: 2px;">
                    <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; flex: 1;">
                        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
                            <span style="font-size: 13px; font-weight: 600; color: #1c1c1e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.label || 'Снимок'}</span>
                            <span style="font-size: 10px; background: ${v.isManual ? 'rgba(0, 122, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)'}; border: 1px solid ${v.isManual ? 'rgba(0, 122, 255, 0.25)' : 'transparent'}; padding: 1px 5px; border-radius: 4px; color: ${v.isManual ? '#007AFF' : '#555555'}; font-weight: 600; flex-shrink: 0;">${v.isManual ? '📌 Ручной' : '⚡ Авто'}</span>
                        </div>
                        <div style="font-size: 11px; color: #666666; font-weight: 400;">
                            ${v.dateStr} • ${v.device || 'Устройство'} • ${v.appsCount} сайтов${v.foldersCount ? `, ${v.foldersCount} папок` : ''}
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px; flex-shrink: 0;">
                        <button class="version-restore-btn" data-id="${v.id}" title="Восстановить это состояние" style="background: rgba(52, 199, 89, 0.18); border: 1px solid rgba(52, 199, 89, 0.4); color: #28a745; border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Откатить</button>
                        <button class="version-delete-btn" data-id="${v.id}" title="Удалить версию" style="background: rgba(255, 59, 48, 0.12); border: 1px solid rgba(255, 59, 48, 0.3); color: #dc3545; border-radius: 6px; padding: 4px 7px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s;">✕</button>
                    </div>
                </div>
            `).join('');

            listContainer.querySelectorAll('.version-restore-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.getAttribute('data-id');
                    const targetVer = versions.find(item => item.id === id);
                    const dateText = targetVer ? targetVer.dateStr : '';
                    
                    const performRestore = async () => {
                        await VersionManager.restoreVersion(id);
                        renderVersionHistoryUI();
                    };

                    if (context.confirmModal && context.confirmModal.showPrompt) {
                        context.confirmModal.showPrompt({
                            title: "Откат версии",
                            desc: `Восстановить состояние от ${dateText}? Текущие изменения будут сохранены в контрольный снимок перед откатом.`,
                            confirmText: "Восстановить",
                            cancelText: "Отмена",
                            onConfirm: performRestore
                        });
                    } else if (confirm(`Восстановить состояние от ${dateText}?`)) {
                        await performRestore();
                    }
                };
            });

            listContainer.querySelectorAll('.version-delete-btn').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.getAttribute('data-id');
                    VersionManager.deleteVersion(id);
                    renderVersionHistoryUI();
                };
            });
        }

        window.renderVersionHistoryUI = renderVersionHistoryUI;
        renderVersionHistoryUI();

        const btnCreateBackup = document.getElementById('btnCreateBackup');
        if (btnCreateBackup) {
            btnCreateBackup.onclick = () => {
                const label = prompt('Введите название для бэкапа (необязательно):', 'Ручной бэкап');
                if (label !== null) {
                    const snap = window.VersionManager ? window.VersionManager.createSnapshot(label.trim() || 'Ручной бэкап', null, true) : null;
                    if (snap) {
                        if (window.showToast) window.showToast(`Создан бэкап: ${snap.label}`);
                        renderVersionHistoryUI();
                    }
                }
            };
        }

        // Экспорт и Импорт
        const btnExport = document.getElementById('btnExportData');
        if (btnExport) {
            btnExport.onclick = () => {
                const data = {
                    apps: context.getAppsFromStorage(),
                    gridColumns: localStorage.getItem('gridColumns') || '4',
                    gridRows: localStorage.getItem('gridRows') || '6',
                    glassEffect: localStorage.getItem('glassEffect') === 'true',
                    openInNewTab: localStorage.getItem('openInNewTab') === 'true',
                    expandedFolders: localStorage.getItem('expandedFolders') === 'true',
                    wallpaper: JSON.parse(localStorage.getItem('user_wallpaper_settings_v1') || '{}')
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const date = new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `productivity_backup_${date}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };
        }

        const btnImport = document.getElementById('btnImportData');
        const fileInput = document.getElementById('importFileInput');
        if (btnImport && fileInput) {
            btnImport.onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);

                        // Импорт сайтов
                        if (data.apps && Array.isArray(data.apps)) {
                            const processImport = (replace) => {
                                if (window.VersionManager) {
                                    window.VersionManager.createSnapshot('Перед импортом');
                                }
                                let finalApps;
                                if (replace) {
                                    finalApps = data.apps;
                                } else {
                                    const currentApps = context.getAppsFromStorage();
                                    finalApps = [...currentApps, ...data.apps];

                                    const seen = new Set();
                                    finalApps = finalApps.filter(app => {
                                        const key = `${app.name}-${app.url}`;
                                        if (seen.has(key) && app.type !== 'folder') return false;
                                        seen.add(key);
                                        return true;
                                    });
                                }

                                localStorage.setItem('my_apps_cache_v1', JSON.stringify(finalApps));
                                context.renderAppsToDOM(finalApps);
                                context.saveCurrentState(finalApps);

                                // Продолжаем импорт настроек
                                finalizeImport(data);
                            };

                            if (context.confirmModal && context.confirmModal.showPrompt) {
                                context.confirmModal.showPrompt({
                                    title: "Импорт сайтов",
                                    desc: "Вы хотите заменить текущие сайты или добавить новые к существующим?",
                                    confirmText: "Заменить",
                                    ungroupText: "Объединить",
                                    cancelText: "Отмена",
                                    onConfirm: () => processImport(true),
                                    onUngroup: () => processImport(false)
                                });
                            } else {
                                const replace = confirm("Заменить текущие сайты импортированными? \n\n'ОК' — заменить полностью. \n'Отмена' — объединить (добавить к текущим).");
                                processImport(replace);
                            }
                        } else {
                            finalizeImport(data);
                        }

                        function finalizeImport(data) {
                            // Импорт колонок
                            if (data.gridColumns) {
                                localStorage.setItem('gridColumns', data.gridColumns);
                                document.documentElement.style.setProperty('--grid-cols', data.gridColumns);
                            }

                            // Импорт рядов
                            if (data.gridRows) {
                                localStorage.setItem('gridRows', data.gridRows);
                            }

                            // Импорт эффекта стекла
                            if (typeof data.glassEffect !== 'undefined') {
                                localStorage.setItem('glassEffect', data.glassEffect.toString());
                                if (data.glassEffect) document.body.classList.add('glass-mode');
                                else document.body.classList.remove('glass-mode');
                            }

                            // Импорт настройки открытия в новой вкладке
                            if (typeof data.openInNewTab !== 'undefined') {
                                localStorage.setItem('openInNewTab', data.openInNewTab.toString());
                            }

                            // Импорт расширенных папок
                            if (typeof data.expandedFolders !== 'undefined') {
                                localStorage.setItem('expandedFolders', data.expandedFolders.toString());
                                if (data.expandedFolders) document.body.classList.add('expanded-folders');
                                else document.body.classList.remove('expanded-folders');
                            }




                            // Импорт обоев
                            if (data.wallpaper) {
                                localStorage.setItem('user_wallpaper_settings_v1', JSON.stringify(data.wallpaper));
                                if (context.wallpaperManager) {
                                    context.wallpaperManager.settings = { ...context.wallpaperManager.defaultSettings, ...data.wallpaper };
                                    context.wallpaperManager.applySettings();
                                    context.wallpaperManager.refreshUI();
                                    context.wallpaperManager.saveToCloud();
                                }
                            }

                            if (context.showToast) context.showToast('Настройки успешно импортированы!');
                            else alert('Настройки и сайты успешно импортированы!');

                            renderSidebar();
                        }

                    } catch (err) {
                        console.error("Import error:", err);
                        if (context.showToast) context.showToast('Ошибка при импорте файла', true);
                        else alert('Ошибка при импорте файла. Убедитесь, что это корректный JSON файл настроек.');
                    }
                    // Сбрасываем input, чтобы можно было выбрать тот же файл снова
                    fileInput.value = '';
                };
                reader.readAsText(file);
            };
        }
    }

    return {
        refreshSidebar: renderSidebar
    };
}