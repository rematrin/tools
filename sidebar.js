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
    // context: { iconEditor, wallpaperManager, getAppsFromDOM, renderAppsToDOM, saveCurrentState, defaultApps }

    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeMenuBtn = document.getElementById('closeMenuBtn');
    const tabAdd = document.getElementById('tabAdd');
    const tabSettings = document.getElementById('tabSettings');
    let authMode = 'login';
    let folderOpenTimer = null;

    // Добавляем стили для вложенности и D&D
    if (!document.getElementById('sidebar-dnd-styles')) {
        const style = document.createElement('style');
        style.id = 'sidebar-dnd-styles';
        style.innerHTML = `
            .sidebar-nested-list {
                min-height: 10px;
                margin-left: 0; 
                display: none; 
                flex-direction: column;
                background: #F2F2F7; /* Фон подложки */
            }
            .sidebar-folder-row.open .sidebar-nested-list {
                display: flex;
            }
            .sidebar-folder-row.open .folder-arrow {
                transform: rotate(180deg);
            }
            .folder-arrow {
                transition: transform 0.2s;
                margin-right: 4px; /* Уменьшили отступ */
                color: #8E8E93;
                cursor: pointer;
                padding: 5px; 
            }
            .sidebar-app-row.sortable-ghost {
                opacity: 0.4;
                background: #E5E5EA;
            }
            /* СТИЛИ ДЛЯ ВЛОЖЕННЫХ ЭЛЕМЕНТОВ (БЕЗ СМЕЩЕНИЯ ВПРАВО) */
            .nested-item-bg {
                background: #FAFAFC; 
                border-bottom: 1px solid #F2F2F7;
                padding-left: 12px !important; /* Было 45px, стало как у обычных строк */
            }
            .sidebar-nested-list:empty::after {
                content: 'Перетащите сюда';
                display: block;
                text-align: center;
                color: #C7C7CC;
                font-size: 11px;
                padding: 10px 0;
            }
            
            /* СТИЛЬ КНОПКИ ИКОНКИ (СИНИЙ) */
            .edit-icon-btn-small { 
                margin-top: 4px; 
                background: #007AFF !important; /* Синий цвет */
                color: white !important; 
                border: none; 
                border-radius: 6px; 
                padding: 6px 12px; 
                font-size: 13px; 
                cursor: pointer; 
                font-weight: 500;
            }
            .edit-icon-btn-small:hover { 
                background: #0056b3 !important; 
            }
        `;
        document.head.appendChild(style);
    }

    // Открытие/Закрытие меню
    function openMenu() {
        sidebar.classList.add('active');
        sidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (!tabSettings.classList.contains('active')) { renderAddTab(); }
    }

    function closeMenu() {
        sidebar.classList.remove('active');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Привязка событий
    menuBtn.addEventListener('click', openMenu);
    closeMenuBtn.addEventListener('click', closeMenu);
    sidebarOverlay.addEventListener('click', closeMenu);

    tabAdd.addEventListener('click', () => {
        tabAdd.classList.add('active');
        tabSettings.classList.remove('active');
        renderAddTab();
    });

    tabSettings.addEventListener('click', () => {
        tabSettings.classList.add('active');
        tabAdd.classList.remove('active');
        renderSettingsTab();
    });

    // --- ЛОГИКА ВКЛАДКИ "ПРИЛОЖЕНИЯ" ---
    function renderAddTab() {
        const content = document.getElementById('sidebarContent');
        content.innerHTML = `                
            <h2 class="section-title">Мои сайты</h2>
            <p class="section-desc">Перетащите сайт вниз на папку, чтобы добавить его внутрь.</p>
            
            <button class="sidebar-dummy-btn" id="btnOpenEditor">
                <span>+</span> Добавить сайт
            </button>

            <div id="sidebarAppsList" class="sidebar-app-list"></div>

            <h2 class="section-title" style="margin-top: 25px;">Мои папки</h2>
            <p class="section-desc">Управление папками и их содержимым.</p>
            
            <button class="sidebar-dummy-btn" id="btnAddFolder">
                <span>+</span> Добавить папку
            </button>

            <div id="sidebarFoldersList" class="sidebar-app-list" style="margin-bottom: 40px;"></div>
        `;

        // Обработчик "Добавить сайт"
        setTimeout(() => {
            const btn = document.getElementById('btnOpenEditor');
            if (btn) {
                btn.addEventListener('click', () => {
                    context.iconEditor.open((data) => {
                        let finalName = data.name || "Новый сайт";
                        let finalUrl = data.url || "";
                        if (finalUrl && !finalUrl.startsWith('http')) {
                            finalUrl = 'https://' + finalUrl;
                        }
                        const newApp = {
                            name: finalName,
                            url: finalUrl,
                            icon: data.icon
                        };
                        const currentApps = context.getAppsFromDOM();
                        currentApps.push(newApp);

                        context.renderAppsToDOM(currentApps);
                        context.saveCurrentState(currentApps);

                        renderSidebarAppsList();
                        closeMenu();
                    });
                });
            }

            // Обработчик "Добавить папку"
            const btnFolder = document.getElementById('btnAddFolder');
            if (btnFolder) {
                btnFolder.addEventListener('click', () => {
                    const newFolder = {
                        type: "folder",
                        name: "Новая папка",
                        items: []
                    };
                    const currentApps = context.getAppsFromDOM();
                    currentApps.push(newFolder);

                    context.renderAppsToDOM(currentApps);
                    context.saveCurrentState(currentApps);

                    renderSidebarAppsList();
                });
            }
        }, 0);

        renderSidebarAppsList();
    }

    // --- РЕНДЕР СПИСКОВ И D&D ---
    window.renderSidebarAppsList = function () {
        const appsListContainer = document.getElementById('sidebarAppsList');
        const foldersListContainer = document.getElementById('sidebarFoldersList');

        if (!appsListContainer || !foldersListContainer) return;

        // Сохранение состояния
        const openFolderNames = new Set();
        document.querySelectorAll('.sidebar-folder-row.open').forEach(row => {
            const nameEl = row.querySelector('.folder-name-text');
            const name = nameEl ? nameEl.innerText : row._appData?.name;
            if (name) openFolderNames.add(name);
        });

        appsListContainer.innerHTML = '';
        foldersListContainer.innerHTML = '';

        const currentApps = context.getAppsFromDOM();

        const sites = currentApps.filter(a => a.type !== 'folder');
        const folders = currentApps.filter(a => a.type === 'folder');

        // === РЕНДЕР САЙТОВ ===
        if (sites.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '15px';
            empty.style.textAlign = 'center';
            empty.style.color = '#8E8E93';
            empty.innerText = 'Список пуст';
            empty.className = 'empty-placeholder';
            appsListContainer.appendChild(empty);
        }

        sites.forEach((app) => {
            const row = createSiteRow(app, false);
            appsListContainer.appendChild(row);
        });

        // === РЕНДЕР ПАПОК ===
        if (folders.length === 0) {
            foldersListContainer.innerHTML = '<div style="padding:15px; text-align:center; color:#8E8E93; font-size:13px;">Нет папок</div>';
        }

        folders.forEach((folder) => {
            const folderRow = document.createElement('div');
            folderRow.className = 'sidebar-folder-row';

            if (openFolderNames.has(folder.name)) {
                folderRow.classList.add('open');
            }

            folderRow.style.display = 'flex';
            folderRow.style.flexDirection = 'column';
            folderRow.style.background = '#fff';
            folderRow.style.borderBottom = '1px solid #E5E5EA';

            folderRow._appData = folder;

            // Заголовок папки
            const header = document.createElement('div');
            header.className = 'sidebar-app-row';
            header.style.borderBottom = 'none';

            // ИЗМЕНЕНИЕ: Убрали количество штук
            header.innerHTML = `
                <div class="folder-arrow" onclick="toggleFolder(this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </div>
                <div class="sidebar-app-icon" style="display:flex; align-items:center; justify-content:center; background:#F2F2F7;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#007AFF" stroke="none">
                         <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
                <div class="sidebar-app-info" onclick="toggleFolder(this)" style="cursor:pointer">
                    <span class="sidebar-app-name folder-name-text" style="font-weight:600">${folder.name}</span>
                </div>
                <div class="row-actions">
                    <button class="action-btn" onclick="startEditFolder(this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="action-btn" onclick="askDeleteFolder(this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;

            const nestedContainer = document.createElement('div');
            nestedContainer.className = 'sidebar-nested-list';

            if (folder.items && folder.items.length > 0) {
                folder.items.forEach(subItem => {
                    const subRow = createSiteRow(subItem, true);
                    nestedContainer.appendChild(subRow);
                });
            } else {
                nestedContainer.style.minHeight = "40px";
            }

            folderRow.appendChild(header);
            folderRow.appendChild(nestedContainer);
            foldersListContainer.appendChild(folderRow);
        });

        initSidebarDragAndDrop();
    }

    function createSiteRow(app, isNested) {
        const row = document.createElement('div');
        row.className = 'sidebar-app-row';
        if (isNested) row.classList.add('nested-item-bg');

        row._appData = app;

        row.innerHTML = `
            <img src="${app.icon}" class="sidebar-app-icon" onerror="this.src='https://via.placeholder.com/36?text=?'">
            <div class="sidebar-app-info">
                <span class="sidebar-app-name">${app.name}</span>
            </div>
            <div class="row-actions">
                <button class="action-btn" onclick="startEditSite(this)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="action-btn" onclick="askDeleteSite(this)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
        return row;
    }

    // --- ЛОГИКА DRAG & DROP ---
    function initSidebarDragAndDrop() {
        if (!window.Sortable) return;

        const appsList = document.getElementById('sidebarAppsList');
        const nestedLists = document.querySelectorAll('.sidebar-nested-list');

        const sitesGroupConfig = {
            name: 'sitesGroup',
            pull: true,
            put: ['sitesGroup']
        };

        new Sortable(appsList, {
            group: sitesGroupConfig,
            animation: 250,
            swapThreshold: 0.65,
            invertSwap: true,
            ghostClass: 'sortable-ghost',
            onEnd: handleDragEnd,
            onMove: function (evt) {
                const related = evt.related;
                if (!related) return;

                const folderRow = related.closest('.sidebar-folder-row');

                if (folderRow && !folderRow.classList.contains('open')) {
                    if (!folderOpenTimer) {
                        folderOpenTimer = setTimeout(() => {
                            folderRow.classList.add('open');
                            folderOpenTimer = null;
                        }, 600);
                    }
                } else {
                    if (folderOpenTimer) {
                        clearTimeout(folderOpenTimer);
                        folderOpenTimer = null;
                    }
                }
            }
        });

        nestedLists.forEach(list => {
            new Sortable(list, {
                group: sitesGroupConfig,
                animation: 250,
                swapThreshold: 0.65,
                invertSwap: true,
                ghostClass: 'sortable-ghost',
                fallbackOnBody: true,
                onEnd: handleDragEnd
            });
        });

        const foldersList = document.getElementById('sidebarFoldersList');
        new Sortable(foldersList, {
            group: 'foldersGroup',
            animation: 250,
            swapThreshold: 0.65,
            invertSwap: true,
            handle: '.sidebar-folder-row',
            onEnd: handleDragEnd
        });
    }

    function handleDragEnd(evt) {
        if (folderOpenTimer) {
            clearTimeout(folderOpenTimer);
            folderOpenTimer = null;
        }
        rebuildAndSaveState();
    }

    function rebuildAndSaveState() {
        const newApps = [];

        const appsList = document.getElementById('sidebarAppsList');
        const siteRows = Array.from(appsList.children).filter(el => el.classList.contains('sidebar-app-row'));

        siteRows.forEach(row => {
            if (row._appData) {
                newApps.push(row._appData);
            }
        });

        const foldersList = document.getElementById('sidebarFoldersList');
        const folderRows = Array.from(foldersList.children).filter(el => el.classList.contains('sidebar-folder-row'));

        folderRows.forEach(fRow => {
            const folderData = { ...fRow._appData };
            folderData.items = [];

            const nestedContainer = fRow.querySelector('.sidebar-nested-list');
            if (nestedContainer) {
                const subRows = Array.from(nestedContainer.children).filter(el => el.classList.contains('sidebar-app-row'));
                subRows.forEach(sRow => {
                    if (sRow._appData) {
                        folderData.items.push(sRow._appData);
                    }
                });
            }
            newApps.push(folderData);
        });

        context.renderAppsToDOM(newApps);
        context.saveCurrentState(newApps);
        renderSidebarAppsList();
    }

    // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

    window.toggleFolder = function (element) {
        const folderRow = element.closest('.sidebar-folder-row');
        if (folderRow) folderRow.classList.toggle('open');
    };

    window.startEditSite = function (btn) {
        const row = btn.closest('.sidebar-app-row');
        const app = row._appData;

        context.iconEditor.open((newData) => {
            if (newData.name) app.name = newData.name;
            if (newData.url) {
                let u = newData.url.trim();
                if (u && !u.startsWith('http')) u = 'https://' + u;
                app.url = u;
            }
            if (newData.icon) app.icon = newData.icon;

            rebuildAndSaveState();
        }, { name: app.name, url: app.url, icon: app.icon });
    };

    window.askDeleteSite = function (btn) {
        const row = btn.closest('.sidebar-app-row');
        const actionsDiv = row.querySelector('.row-actions');

        actionsDiv.innerHTML = `
            <div class="delete-confirm-container">
                <span class="confirm-text" style="color:#FF3B30; font-size:12px;">Удалить?</span>
                <button class="confirm-btn confirm-yes" onclick="confirmDeleteRow(this)">Да</button>
                <button class="confirm-btn confirm-no" onclick="renderSidebarAppsList()">Нет</button>
            </div>`;
    };

    window.startEditFolder = function (btn) {
        const folderRow = btn.closest('.sidebar-folder-row');
        const header = folderRow.children[0];
        const infoDiv = header.querySelector('.sidebar-app-info');
        const actionsDiv = header.querySelector('.row-actions');
        const app = folderRow._appData;

        infoDiv.innerHTML = `
            <div class="sidebar-edit-wrapper">
                <input type="text" class="sidebar-edit-input edit-folder-name" value="${app.name}" placeholder="Название папки">
            </div>
        `;

        actionsDiv.innerHTML = `
             <button class="action-btn" onclick="renderSidebarAppsList()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/></svg>
            </button>
            <button class="action-btn" onclick="saveFolderFromRow(this)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
        `;
    };

    window.saveFolderFromRow = function (btn) {
        const folderRow = btn.closest('.sidebar-folder-row');
        const nameInput = folderRow.querySelector('.edit-folder-name');

        if (nameInput.value) {
            folderRow._appData.name = nameInput.value;
            rebuildAndSaveState();
        }
    };

    window.askDeleteFolder = function (btn) {
        const header = btn.closest('.sidebar-app-row');
        const actionsDiv = header.querySelector('.row-actions');

        actionsDiv.innerHTML = `
            <div class="delete-confirm-container">
                <span class="confirm-text" style="color:#FF3B30; font-size:12px;">Удалить?</span>
                <button class="confirm-btn confirm-yes" onclick="confirmDeleteRow(this)">Да</button>
                <button class="confirm-btn confirm-no" onclick="renderSidebarAppsList()">Нет</button>
            </div>`;
    };

    window.confirmDeleteRow = function (btn) {
        const siteRow = btn.closest('.sidebar-app-row');
        const folderRow = btn.closest('.sidebar-folder-row');

        if (folderRow && folderRow.contains(btn) && (!siteRow || folderRow.children[0] === siteRow)) {
            folderRow.remove();
        } else if (siteRow) {
            siteRow.remove();
        }

        rebuildAndSaveState();
    };

    // --- НАСТРОЙКИ (без изменений) ---
    function renderSettingsTab() {
        const content = document.getElementById('sidebarContent');
        const auth = window.auth;

        if (!auth) {
            content.innerHTML = `<div style="padding: 20px; text-align: center; color: #8E8E93;">Загрузка...</div>`;
            return;
        }

        const glassSwitchHTML = `
            <div class="profile-card">
                <h2 class="profile-title-in-card">Оформление</h2>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                    <span style="font-size: 16px; font-weight: 400; color: #000;">Эффект стекла</span>
                    <label class="switch">
                        <input type="checkbox" id="globalGlassToggle">
                        <span class="slider-toggle"></span>
                    </label>
                </div>
            </div>
        `;

        const currentCols = localStorage.getItem('gridColumns') || '4';
        const layoutSettingsHTML = `
            <div class="profile-card">
                <h2 class="profile-title-in-card">Настроить макет</h2>
                <div class="slider-group" style="margin-top: 15px;">
                    <div class="slider-header" style="margin-bottom: 10px;">
                        <span style="font-size: 16px; font-weight: 400;">Колонок</span>
                        <span id="colCountValue" style="font-size: 16px; font-weight: 400; color: #8E8E93;">${currentCols}</span>
                    </div>
                    <input type="range" id="colCountSlider" class="ios-slider" min="3" max="10" step="1" value="${currentCols}">
                </div>
            </div>
        `;

        const getProfileHTML = (user) => {
            const photoURL = user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop';
            const displayName = user.displayName || 'Пользователь';
            const email = user.email || '';
            const isGoogleAuth = user.providerData.some(provider => provider.providerId === 'google.com');
            const googleBadgeHTML = isGoogleAuth
                ? `<div class="google-badge"><img src="https://www.google.com/s2/favicons?domain=google.com" style="width: 100%; height: 100%; display: block;"></div>` : '';

            return `
                <div class="profile-card">
                    <h2 class="profile-title-in-card">Аккаунт</h2>
                    <div class="profile-content-row">
                        <div class="avatar-wrapper">
                            <img src="${photoURL}" class="profile-avatar" alt="Avatar">
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
        };

        const getLoginHTML = () => {
            return `
                <div class="profile-cardnon">
                    <h2 class="profile-title-in-card" style="margin-bottom: 10px;">Вход</h2>
                    <p class="section-desc">Войдите для синхронизации</p>
                    <div class="form-container" style="padding-top: 0; gap: 8px;">
                        <button id="doGoogleBtn" class="google-btn">
                            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill-rule="evenodd" fill-opacity="1" fill="#4285f4" stroke="none"></path><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill-rule="evenodd" fill-opacity="1" fill="#34a853" stroke="none"></path><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill-rule="evenodd" fill-opacity="1" fill="#fbbc05" stroke="none"></path><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill-rule="evenodd" fill-opacity="1" fill="#ea4335" stroke="none"></path></svg>
                            Войти через Google
                        </button>
                        <div class="divider">или</div>
                        <div class="form-group"><input type="email" id="authEmail" class="form-input" placeholder="Email"></div>
                        <div class="form-group"><input type="password" id="authPass" class="form-input" placeholder="Пароль"></div>
                        <button id="doLoginBtn" class="primary-btn">Войти</button>
                        <div class="text-link" id="goRegister" style="margin-top: 5px;">Нет аккаунта? Зарегистрироваться</div>
                    </div>
                </div>`;
        };

        const getRegisterHTML = () => {
            return `
                <div class="profile-cardnon">
                    <h2 class="profile-title-in-card" style="margin-bottom: 10px;">Регистрация</h2>
                    <div class="form-container" style="padding-top: 0; gap: 8px;">
                        <div class="form-group"><input type="text" id="regName" class="form-input" placeholder="Ваше имя"></div>
                        <div class="form-group"><input type="email" id="regEmail" class="form-input" placeholder="Email"></div>
                        <div class="form-group"><input type="password" id="regPass" class="form-input" placeholder="Пароль"></div>
                        <button id="doRegisterBtn" class="primary-btn">Создать аккаунт</button>
                        <div class="text-link" id="goLogin" style="margin-top: 5px;">Уже есть аккаунт? Войти</div>
                    </div>
                </div>`;
        };

        if (auth.currentUser) {
            content.innerHTML = getProfileHTML(auth.currentUser) + layoutSettingsHTML + glassSwitchHTML + context.wallpaperManager.getSettingsHTML(false);

            document.getElementById('logoutBtn').addEventListener('click', () => { if (window.authApi) window.authApi.logout(); });
            context.wallpaperManager.attachListeners();

        } else {
            const authHTML = (authMode === 'login') ? getLoginHTML() : getRegisterHTML();
            content.innerHTML = authHTML + layoutSettingsHTML + glassSwitchHTML + context.wallpaperManager.getSettingsHTML(true);

            if (authMode === 'login') {
                document.getElementById('doLoginBtn').onclick = () => {
                    const e = document.getElementById('authEmail').value;
                    const p = document.getElementById('authPass').value;
                    if (window.authApi) window.authApi.login(e, p);
                };
                document.getElementById('doGoogleBtn').onclick = () => { if (window.authApi) window.authApi.google(); };
                document.getElementById('goRegister').onclick = () => { authMode = 'register'; renderSettingsTab(); };
            } else {
                document.getElementById('doRegisterBtn').onclick = () => {
                    const n = document.getElementById('regName').value;
                    const e = document.getElementById('regEmail').value;
                    const p = document.getElementById('regPass').value;
                    if (window.authApi) window.authApi.register(e, p, n);
                };
                document.getElementById('goLogin').onclick = () => { authMode = 'login'; renderSettingsTab(); };
            }
            context.wallpaperManager.attachListeners();
        }

        setTimeout(() => {
            const toggle = document.getElementById('globalGlassToggle');
            if (toggle) {
                const isGlassEnabled = localStorage.getItem('glassEffect') === 'true';
                toggle.checked = isGlassEnabled;
                toggle.addEventListener('change', (e) => {
                    const isEnabled = e.target.checked;
                    if (isEnabled) document.body.classList.add('glass-mode');
                    else document.body.classList.remove('glass-mode');
                    localStorage.setItem('glassEffect', isEnabled.toString());
                    if (window.auth && window.auth.currentUser && window.dbApi) {
                        window.dbApi.saveSettings({ glassEffect: isEnabled });
                    }
                });
            }
        }, 0);

        setTimeout(() => {
            const slider = document.getElementById('colCountSlider');
            const valueDisplay = document.getElementById('colCountValue');

            if (slider && valueDisplay) {
                slider.addEventListener('input', (e) => {
                    const val = e.target.value;
                    valueDisplay.innerText = val;
                    document.documentElement.style.setProperty('--grid-cols', val);
                });

                slider.addEventListener('change', (e) => {
                    const val = e.target.value;
                    localStorage.setItem('gridColumns', val);
                    if (window.auth && window.auth.currentUser && window.dbApi) {
                        window.dbApi.saveSettings({ gridColumns: val });
                    }
                });
            }
        }, 0);
    }

    return {
        refreshSettingsTab: () => {
            if (tabSettings.classList.contains('active')) renderSettingsTab();
        }
    };
}