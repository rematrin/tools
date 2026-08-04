// teleprompter.js - Core Teleprompter PWA Logic matching sufler.pro mobile dashboard with Folders and Custom Modals support

document.addEventListener('DOMContentLoaded', () => {
    // === DOM ELEMENTS ===
    const editContainer = document.getElementById('edit-container');
    const prompterContainer = document.getElementById('prompter-container');
    const scriptInput = document.getElementById('script-input');
    const launchBtn = document.getElementById('launch-btn');
    const exitBtn = document.getElementById('exit-btn');
    const prompterText = document.getElementById('prompter-text');
    const prompterScrollWrapper = document.getElementById('prompter-scroll-wrapper');
    const controlPanel = document.getElementById('control-panel');
    
    // Bottom Navigation & Tabs
    const textsTab = document.getElementById('texts-tab');
    const helpTab = document.getElementById('help-tab');
    const remoteTab = document.getElementById('remote-tab');
    const accountTab = document.getElementById('account-tab');
    const premiumTab = document.getElementById('premium-tab');
    const editorView = document.getElementById('editor-view');
    const bottomNav = document.getElementById('bottom-nav');
    
    // Texts Tab specific DOM
    const scriptsList = document.getElementById('scripts-list');
    const searchInput = document.getElementById('search-input');
    const fabAddBtn = document.getElementById('fab-add-btn');

    // Bottom Add Options Sheet
    const addSheetOverlay = document.getElementById('add-sheet-overlay');
    const addSheet = document.getElementById('add-sheet');
    const addTextOption = document.getElementById('add-text-option');
    const addFolderOption = document.getElementById('add-folder-option');

    // Editor Header
    const editorBackBtn = document.getElementById('editor-back-btn');
    const scriptTitleInput = document.getElementById('script-title-input');

    // Chapters & Stats DOM Elements
    const addChapterBtn = document.getElementById('add-chapter-btn');
    const chaptersList = document.getElementById('chapters-list');
    const chapterTitleInput = document.getElementById('chapter-title-input');
    const statCharsChapter = document.getElementById('stat-chars-chapter');
    const statChars = document.getElementById('stat-chars');
    const statWordsChapter = document.getElementById('stat-words-chapter');
    const statWords = document.getElementById('stat-words');
    const statTime = document.getElementById('stat-time');

    // Editor Settings DOM (Right Panel)
    const editorSpeedSlider = document.getElementById('editor-speed-slider');
    const editorSpeedVal = document.getElementById('editor-speed-val');
    const editorFontSizeSlider = document.getElementById('editor-font-size-slider');
    const editorFontSizeVal = document.getElementById('editor-font-size-val');
    const editorMarginSlider = document.getElementById('editor-margin-slider');
    const editorMarginVal = document.getElementById('editor-margin-val');
    const editorLineHeightSlider = document.getElementById('editor-line-height-slider');
    const editorLineHeightVal = document.getElementById('editor-line-height-val');
    const editorMirrorToggle = document.getElementById('editor-mirror-toggle');
    const editorGuideToggle = document.getElementById('editor-guide-toggle');

    // Player Controls DOM Elements (Playback Floating Panel)
    const playPauseBtn = document.getElementById('play-pause-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const speedSlider = document.getElementById('speed-slider');
    const speedVal = document.getElementById('speed-val');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeVal = document.getElementById('font-size-val');
    const marginSlider = document.getElementById('margin-slider');
    const marginVal = document.getElementById('margin-val');
    const lineHeightSlider = document.getElementById('line-height-slider');
    const lineHeightVal = document.getElementById('line-height-val');
    const mirrorToggle = document.getElementById('mirror-toggle');
    const guideToggle = document.getElementById('guide-toggle');
    const prevChapterBtn = document.getElementById('prev-chapter-btn');
    const nextChapterBtn = document.getElementById('next-chapter-btn');
    const prompterChapterIndicator = document.getElementById('prompter-chapter-indicator');

    // Countdown Overlay DOM Elements
    const countdownOverlay = document.getElementById('countdown-overlay');
    const countdownNumber = document.getElementById('countdown-number');

    const wakeLockStatus = document.getElementById('wakelock-status');
    const readingGuide = document.getElementById('reading-guide');

    // Presets
    const presetBtns = document.querySelectorAll('.preset-btn');

    // === STATE VARIABLES ===
    let scripts = [];
    let folders = [];
    
    let currentFolderId = null; // null represents Root directory
    let currentScriptId = '';
    let activeTab = 'texts'; // texts | help | remote | account | premium

    // Active script's chapters and settings variables
    let chapters = [];
    let activeChapterId = '';

    let isPlaying = false;
    let speed = 5; 
    let fontSize = 48; 
    let margin = 15; 
    let lineHeight = 1.5; 
    let alignment = 'center'; 
    let countdownDelay = 3; 
    let isMirrored = false;
    let showGuide = true;
    
    // Animation & Scroll variables
    let animationFrameId = null;
    let lastTimestamp = 0;
    let scrollPosition = 0;
    let isUserScrolling = false;
    let userScrollTimeout = null;
    
    // Countdown state variables
    let countdownInterval = null;
    let isCountingDown = false;

    // Wake Lock
    let wakeLock = null;

    // Auto-hide controls variables
    let controlsHideTimeout = null;
    const CONTROLS_HIDE_DELAY = 3000;

    // === DEFAULT PRESET TEXTS ===
    const scriptPresets = {
        test: `Добро пожаловать в Телесуфлер! 🚀

Это PWA-приложение, созданное для того, чтобы помочь вам записывать видео без запинок.

Нажмите Play внизу, чтобы запустить прокрутку!`,
        pitch: `Приветствую! Сегодня я представлю вам наш новый продукт. 💡

Мы разработали его, основываясь на отзывах сотен пользователей, которым не хватало простоты и скорости.

Наш сервис работает полностью автономно и доступен на любом устройстве в один клик.`,
        speech: `Дорогие друзья и коллеги! 🤝

Сегодня особенный день. Мы собрались здесь, чтобы подвести итоги нашей совместной работы за этот год.

Каждый из нас внес неоценимый вклад в развитие этого проекта. Спасибо вам!`
    };

    // === DEFAULT FOLDERS (Matches user screenshot) ===
    const defaultFolders = [
        { id: 'f1', title: 'тест', parentId: null }
    ];

    // === DEFAULT SCRIPTS (Matches user screenshot) ===
    const defaultScripts = [
        {
            id: '1',
            title: 'Демо текст',
            folderId: null, // Root
            chapters: [
                { id: 'c1', title: '1. Демо текст', text: `Ну вот! Теперь снимать видео стало ещё проще и быстрее. Телесуфлер sufler.pro поможет вам читать текст, глядя прямо в камеру.` }
            ],
            settings: {
                speed: 5,
                fontSize: 48,
                margin: 15,
                lineHeight: 1.5,
                alignment: 'center',
                countdownDelay: 3,
                isMirrored: false,
                showGuide: true
            }
        },
        {
            id: '2',
            title: 'Второй текст внутри',
            folderId: null, // Root
            chapters: [
                { id: 'c2', title: '1. Начало текста', text: `привет это тест текста. Это вторая карточка сценария в вашем списке. Вы можете изменить её содержание в любое время.` }
            ],
            settings: {
                speed: 6,
                fontSize: 44,
                margin: 15,
                lineHeight: 1.6,
                alignment: 'left',
                countdownDelay: 0,
                isMirrored: false,
                showGuide: true
            }
        },
        {
            id: '3',
            title: 'Внутри папки пример',
            folderId: 'f1', // inside default folder 'тест'
            chapters: [
                { id: 'c3', title: '1. Пример текста в папке', text: `Я хочу чтобы ты был счастлив. Это текст, сохраненный внутри демонстрационной папки "тест".` }
            ],
            settings: {
                speed: 5,
                fontSize: 48,
                margin: 15,
                lineHeight: 1.5,
                alignment: 'center',
                countdownDelay: 3,
                isMirrored: false,
                showGuide: true
            }
        }
    ];

    // === INITIALIZATION ===
    function init() {
        // Load default/local storage folders & scripts list
        loadFoldersFromStorage();
        loadScriptsFromStorage();

        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('[Teleprompter] SW registered successfully'))
                .catch(err => console.log('[Teleprompter] SW registration failed', err));
        }

        // Setup Account tab triggers
        const loginBtn = document.getElementById('account-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', function() {
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal(this, 'login');
                }
            });
        }

        const logoutBtn = document.getElementById('account-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function() {
                if (window.firebaseAuth) {
                    window.firebaseAuth.signOut();
                    localStorage.removeItem('google_access_token');
                }
            });
        }
    }

    // === DATA STORAGE (SYNC FIRESTORE & LOCAL STORAGE) ===
    function loadFoldersFromStorage() {
        const saved = localStorage.getItem('teleprompter_folders');
        if (saved) {
            try {
                folders = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse local folders', e);
                folders = [...defaultFolders];
            }
        } else {
            folders = [...defaultFolders];
            localStorage.setItem('teleprompter_folders', JSON.stringify(folders));
        }
    }

    function loadScriptsFromStorage() {
        const saved = localStorage.getItem('teleprompter_scripts');
        if (saved) {
            try {
                scripts = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse local scripts', e);
                scripts = [...defaultScripts];
            }
        } else {
            scripts = [...defaultScripts];
            localStorage.setItem('teleprompter_scripts', JSON.stringify(scripts));
        }
    }

    async function loadFoldersFromFirestore() {
        if (!window.currentUser || !window.getDocs || !window.collection || !window.db) return;
        try {
            const q = await window.getDocs(window.collection(window.db, "users", window.currentUser.uid, "folders"));
            const dbFolders = [];
            q.forEach(doc => {
                dbFolders.push(doc.data());
            });
            if (dbFolders.length > 0) {
                folders = dbFolders;
            } else {
                folders.forEach(async (f) => {
                    await saveFolderToDb(f);
                });
            }
        } catch (e) {
            console.error("Failed to load folders from cloud Firestore:", e);
        }
    }

    async function loadScriptsFromFirestore() {
        if (!window.currentUser || !window.getDocs || !window.collection || !window.db) return;
        try {
            const q = await window.getDocs(window.collection(window.db, "users", window.currentUser.uid, "scripts"));
            const dbScripts = [];
            q.forEach(doc => {
                dbScripts.push(doc.data());
            });
            if (dbScripts.length > 0) {
                scripts = dbScripts;
            } else {
                scripts.forEach(async (s) => {
                    await saveScriptToDb(s);
                });
            }
        } catch (e) {
            console.error("Failed to load scripts from cloud Firestore:", e);
        }
    }

    async function saveFolderToDb(folder) {
        localStorage.setItem('teleprompter_folders', JSON.stringify(folders));
        if (window.currentUser && window.setDoc && window.doc && window.db) {
            try {
                await window.setDoc(window.doc(window.db, "users", window.currentUser.uid, "folders", folder.id), folder);
            } catch (e) {
                console.error("Failed to save folder to cloud Firestore:", e);
            }
        }
    }

    async function saveScriptToDb(script) {
        localStorage.setItem('teleprompter_scripts', JSON.stringify(scripts));
        if (window.currentUser && window.setDoc && window.doc && window.db) {
            try {
                await window.setDoc(window.doc(window.db, "users", window.currentUser.uid, "scripts", script.id), script);
            } catch (e) {
                console.error("Failed to save script to cloud Firestore:", e);
            }
        }
    }

    // === BOTTOM ADD OPTIONS SHEET ===
    function openAddSheet() {
        addSheetOverlay.classList.remove('hidden');
        addSheetOverlay.offsetHeight; // Force reflow
        addSheetOverlay.classList.add('open');
    }

    function closeAddSheet() {
        addSheetOverlay.classList.remove('open');
        setTimeout(() => {
            addSheetOverlay.classList.add('hidden');
        }, 250);
    }

    // === CUSTOM MODAL SYSTEM ===
    function showCustomModal({ title, message, defaultValue = null, showInput = false, confirmText = 'ОК', cancelText = 'Отмена' }) {
        return new Promise((resolve) => {
            const container = document.getElementById('custom-modal-container');
            const titleEl = document.getElementById('custom-modal-title');
            const messageEl = document.getElementById('custom-modal-message');
            const inputContainer = document.getElementById('custom-modal-input-container');
            const inputEl = document.getElementById('custom-modal-input');
            const cancelBtn = document.getElementById('custom-modal-cancel-btn');
            const confirmBtn = document.getElementById('custom-modal-confirm-btn');

            titleEl.textContent = title;
            messageEl.textContent = message || '';
            confirmBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            if (showInput) {
                inputContainer.classList.remove('hidden');
                inputEl.value = defaultValue || '';
                setTimeout(() => inputEl.focus(), 50);
            } else {
                inputContainer.classList.add('hidden');
            }

            if (cancelText === null) {
                cancelBtn.classList.add('hidden');
            } else {
                cancelBtn.classList.remove('hidden');
            }

            container.classList.remove('hidden');
            container.offsetHeight; // force reflow
            container.classList.add('open');

            function cleanup(result) {
                container.classList.remove('open');
                setTimeout(() => {
                    container.classList.add('hidden');
                }, 200);
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                inputEl.removeEventListener('keydown', onKeyDown);
                resolve(result);
            }

            function onConfirm() {
                if (showInput) {
                    cleanup(inputEl.value);
                } else {
                    cleanup(true);
                }
            }

            function onCancel() {
                cleanup(null);
            }

            function onKeyDown(e) {
                if (e.key === 'Enter') {
                    onConfirm();
                } else if (e.key === 'Escape') {
                    onCancel();
                }
            }

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            inputEl.addEventListener('keydown', onKeyDown);
        });
    }

    // === RENDERING HIERARCHICAL LIST & SEARCH ===
    function renderScriptsList() {
        scriptsList.innerHTML = '';
        const query = searchInput.value.trim().toLowerCase();
        
        // 1. Back button to navigate parent folder if inside a folder
        if (currentFolderId !== null && !query) {
            const backCard = document.createElement('div');
            backCard.className = 'script-card';
            backCard.innerHTML = `
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <span class="folder-icon"></span>
                    <span class="font-bold text-white text-base">...</span>
                </div>
            `;
            backCard.addEventListener('click', () => {
                const currentFolder = folders.find(f => f.id === currentFolderId);
                currentFolderId = currentFolder ? currentFolder.parentId : null;
                renderScriptsList();
            });
            scriptsList.appendChild(backCard);
        }

        // Filter and display folders
        let filteredFolders = [];
        let filteredScripts = [];

        if (query) {
            // Global search
            filteredFolders = folders.filter(f => f.title.toLowerCase().includes(query));
            filteredScripts = scripts.filter(s => s.title.toLowerCase().includes(query));
        } else {
            // Folders and scripts inside current folderId
            filteredFolders = folders.filter(f => f.parentId === currentFolderId);
            filteredScripts = scripts.filter(s => s.folderId === currentFolderId);
        }

        if (filteredFolders.length === 0 && filteredScripts.length === 0 && (currentFolderId === null || query)) {
            const empty = document.createElement('div');
            empty.className = 'text-center py-12 text-gray-500 text-sm';
            empty.textContent = 'Нет сценариев и папок. Нажмите + чтобы создать!';
            scriptsList.appendChild(empty);
            return;
        }

        // Render Folders first
        filteredFolders.forEach(folder => {
            const card = document.createElement('div');
            card.className = 'script-card';
            card.dataset.id = folder.id;

            const textContainer = document.createElement('div');
            textContainer.className = 'flex items-center gap-3 flex-1 min-w-0';

            const icon = document.createElement('span');
            icon.className = 'folder-icon';
            textContainer.appendChild(icon);

            const title = document.createElement('span');
            title.className = 'font-bold text-white text-base truncate';
            title.textContent = folder.title || 'Без названия';
            textContainer.appendChild(title);

            card.appendChild(textContainer);

            // Actions for folder (Rename, Delete)
            const actions = document.createElement('div');
            actions.className = 'flex items-center gap-3 shrink-0';

            // Rename Pencil Btn
            const renameBtn = document.createElement('button');
            renameBtn.className = 'p-2 text-gray-400 hover:text-white transition';
            renameBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                </svg>
            `;
            renameBtn.title = 'Переименовать';
            renameBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newTitle = await showCustomModal({
                    title: 'Переименовать папку',
                    message: 'Введите новое название для папки:',
                    defaultValue: folder.title,
                    showInput: true
                });
                if (newTitle && newTitle.trim() !== '') {
                    folder.title = newTitle.trim();
                    await saveFolderToDb(folder);
                    renderScriptsList();
                }
            });
            actions.appendChild(renameBtn);

            // Delete bin Btn
            const delBtn = document.createElement('button');
            delBtn.className = 'p-2 text-gray-400 hover:text-red-500 transition';
            delBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            `;
            delBtn.title = 'Удалить папку';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmDelete = await showCustomModal({
                    title: 'Удалить папку',
                    message: `Удалить папку "${folder.title || 'Без названия'}" и всё её содержимое?`
                });
                if (confirmDelete) {
                    await deleteFolder(folder.id);
                }
            });
            actions.appendChild(delBtn);
            card.appendChild(actions);

            card.addEventListener('click', () => {
                currentFolderId = folder.id;
                renderScriptsList();
            });

            scriptsList.appendChild(card);
        });

        // Render Scripts
        filteredScripts.forEach(script => {
            const card = document.createElement('div');
            card.className = 'script-card';
            card.dataset.id = script.id;

            const textContainer = document.createElement('div');
            textContainer.className = 'flex-1 pr-4 min-w-0';

            const title = document.createElement('h3');
            title.className = 'font-bold text-white text-base truncate';
            title.textContent = script.title || 'Без названия';
            textContainer.appendChild(title);

            const firstChapterText = (script.chapters && script.chapters[0] && script.chapters[0].text) || '';
            const preview = document.createElement('p');
            preview.className = 'text-xs text-gray-400 truncate mt-1';
            preview.textContent = firstChapterText || 'Текст пуст...';
            textContainer.appendChild(preview);

            card.appendChild(textContainer);

            // Actions
            const actions = document.createElement('div');
            actions.className = 'flex items-center gap-3 shrink-0';

            const editBtn = document.createElement('button');
            editBtn.className = 'p-2 text-gray-400 hover:text-white transition';
            editBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                </svg>
            `;
            editBtn.title = 'Редактировать';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openScriptEditor(script.id);
            });
            actions.appendChild(editBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'p-2 text-gray-400 hover:text-red-500 transition';
            delBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            `;
            delBtn.title = 'Удалить';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmDelete = await showCustomModal({
                    title: 'Удалить сценарий',
                    message: `Удалить сценарий "${script.title || 'Без названия'}"?`
                });
                if (confirmDelete) {
                    await deleteScript(script.id);
                }
            });
            actions.appendChild(delBtn);

            card.appendChild(actions);

            card.addEventListener('click', () => {
                openScriptEditor(script.id);
            });

            scriptsList.appendChild(card);
        });
    }

    async function deleteFolder(id) {
        // Recursive deletion for children
        const scriptsToDelete = scripts.filter(s => s.folderId === id);
        const childFolders = folders.filter(f => f.parentId === id);

        for (let s of scriptsToDelete) {
            await deleteScript(s.id);
        }

        for (let f of childFolders) {
            await deleteFolder(f.id);
        }

        const idx = folders.findIndex(f => f.id === id);
        if (idx !== -1) {
            folders.splice(idx, 1);
            localStorage.setItem('teleprompter_folders', JSON.stringify(folders));

            if (window.currentUser && window.deleteDoc && window.doc && window.db) {
                try {
                    await window.deleteDoc(window.doc(window.db, "users", window.currentUser.uid, "folders", id));
                } catch (e) {
                    console.error("Failed to delete folder from Firestore:", e);
                }
            }
        }
        renderScriptsList();
    }

    async function deleteScript(id) {
        const idx = scripts.findIndex(s => s.id === id);
        if (idx !== -1) {
            scripts.splice(idx, 1);
            localStorage.setItem('teleprompter_scripts', JSON.stringify(scripts));

            if (window.currentUser && window.deleteDoc && window.doc && window.db) {
                try {
                    await window.deleteDoc(window.doc(window.db, "users", window.currentUser.uid, "scripts", id));
                } catch (e) {
                    console.error("Failed to delete script from Firestore:", e);
                }
            }
            renderScriptsList();
        }
    }

    async function createFolder() {
        const title = await showCustomModal({
            title: 'Создать папку',
            message: 'Введите название папки:',
            defaultValue: 'Новая папка',
            showInput: true
        });
        if (!title || title.trim() === '') return;

        const newId = 'f_' + Date.now();
        const newFolder = {
            id: newId,
            title: title.trim(),
            parentId: currentFolderId
        };
        folders.push(newFolder);
        await saveFolderToDb(newFolder);
        renderScriptsList();
    }

    async function createScript() {
        const newId = Date.now().toString();
        const newScript = {
            id: newId,
            title: 'Новый сценарий',
            folderId: currentFolderId, // Set current parent folder
            chapters: [
                { id: 'c_' + Date.now(), title: 'Глава 1', text: '' }
            ],
            settings: {
                speed: 5,
                fontSize: 48,
                margin: 15,
                lineHeight: 1.5,
                alignment: 'center',
                countdownDelay: 3,
                isMirrored: false,
                showGuide: true
            }
        };
        scripts.push(newScript);
        await saveScriptToDb(newScript);
        openScriptEditor(newId);
    }

    // === EDIT SCRIPT WORKSPACE VIEW ===
    function openScriptEditor(scriptId) {
        const script = scripts.find(s => s.id === scriptId);
        if (!script) return;
        currentScriptId = scriptId;

        // Apply script title
        scriptTitleInput.value = script.title || 'Новый сценарий';

        // Load settings values
        const s = script.settings || {};
        speed = s.speed !== undefined ? s.speed : 5;
        fontSize = s.fontSize !== undefined ? s.fontSize : 48;
        margin = s.margin !== undefined ? s.margin : 15;
        lineHeight = s.lineHeight !== undefined ? s.lineHeight : 1.5;
        alignment = s.alignment !== undefined ? s.alignment : 'center';
        countdownDelay = s.countdownDelay !== undefined ? s.countdownDelay : 3;
        isMirrored = s.isMirrored !== undefined ? s.isMirrored : false;
        showGuide = s.showGuide !== undefined ? s.showGuide : true;

        // Set inputs values
        editorSpeedSlider.value = speed;
        editorSpeedVal.textContent = speed;
        speedSlider.value = speed;
        speedVal.textContent = speed;

        editorFontSizeSlider.value = fontSize;
        editorFontSizeVal.textContent = fontSize + 'px';
        fontSizeSlider.value = fontSize;
        fontSizeVal.textContent = fontSize + 'px';

        editorMarginSlider.value = margin;
        editorMarginVal.textContent = margin + '%';
        marginSlider.value = margin;
        marginVal.textContent = margin + '%';

        editorLineHeightSlider.value = lineHeight;
        editorLineHeightVal.textContent = lineHeight.toFixed(1);
        lineHeightSlider.value = lineHeight;
        lineHeightVal.textContent = lineHeight.toFixed(1);

        updateAlignmentButtonStates('editor-align', alignment);
        updateAlignmentButtonStates('align', alignment);

        updateDelayButtonStates('editor-delay', countdownDelay);
        updateDelayButtonStates('delay', countdownDelay);

        editorMirrorToggle.checked = isMirrored;
        mirrorToggle.checked = isMirrored;

        editorGuideToggle.checked = showGuide;
        guideToggle.checked = showGuide;

        // Load chapters
        chapters = script.chapters || [];
        if (chapters.length === 0) {
            chapters = [{ id: 'c_' + Date.now(), title: 'Глава 1', text: '' }];
            script.chapters = chapters;
        }

        activeChapterId = chapters[0].id;
        selectChapter(activeChapterId);

        updatePrompterStyles();

        // Switch to editor layout
        document.body.classList.add('editor-active');
        editorView.classList.remove('hidden');
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    }

    function closeScriptEditor() {
        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            const activeCh = chapters.find(c => c.id === activeChapterId);
            if (activeCh) {
                activeCh.text = scriptInput.value;
                activeCh.title = chapterTitleInput.value;
            }

            script.chapters = chapters;
            script.title = scriptTitleInput.value.trim() || 'Без названия';
            script.settings = {
                speed,
                fontSize,
                margin,
                lineHeight,
                alignment,
                countdownDelay,
                isMirrored,
                showGuide
            };

            saveScriptToDb(script);
        }

        currentScriptId = '';

        // Switch back to list view
        document.body.classList.remove('editor-active');
        editorView.classList.add('hidden');
        
        const activeTabEl = document.getElementById(`${activeTab}-tab`);
        if (activeTabEl) {
            activeTabEl.classList.remove('hidden');
        }

        renderScriptsList();
    }

    // === CHAPTER OPERATIONS ===
    function renderChaptersList() {
        chaptersList.innerHTML = '';
        chapters.forEach((chapter, index) => {
            const item = document.createElement('div');
            item.className = `chapter-item ${chapter.id === activeChapterId ? 'active' : ''}`;
            item.dataset.id = chapter.id;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'text-xs font-semibold truncate text-gray-200 flex-1';
            titleSpan.textContent = `${index + 1}. ${chapter.title || 'Без названия'}`;
            item.appendChild(titleSpan);

            const delBtn = document.createElement('button');
            delBtn.className = 'p-1 text-gray-500 hover:text-red-400 transition ml-2 flex items-center';
            delBtn.innerHTML = `
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            `;
            delBtn.title = 'Удалить главу';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (chapters.length <= 1) {
                    await showCustomModal({
                        title: 'Внимание',
                        message: 'Нельзя удалить единственную главу!',
                        cancelText: null
                    });
                    return;
                }
                const confirmDelete = await showCustomModal({
                    title: 'Удалить главу',
                    message: `Удалить главу "${chapter.title || 'Без названия'}"?`
                });
                if (confirmDelete) {
                    deleteChapter(chapter.id);
                }
            });
            item.appendChild(delBtn);

            item.addEventListener('click', () => {
                selectChapter(chapter.id);
            });

            chaptersList.appendChild(item);
        });
    }

    function selectChapter(id) {
        if (activeChapterId && activeChapterId !== id) {
            const currentCh = chapters.find(c => c.id === activeChapterId);
            if (currentCh) {
                currentCh.text = scriptInput.value;
                currentCh.title = chapterTitleInput.value;
            }
        }

        activeChapterId = id;
        const chapter = chapters.find(c => c.id === activeChapterId);
        if (chapter) {
            chapterTitleInput.value = chapter.title;
            scriptInput.value = chapter.text;
        }

        renderChaptersList();
        updateStats();
    }

    function deleteChapter(id) {
        const index = chapters.findIndex(c => c.id === id);
        if (index !== -1) {
            chapters.splice(index, 1);
            if (activeChapterId === id) {
                activeChapterId = chapters[Math.max(0, index - 1)].id;
            }
            
            const script = scripts.find(s => s.id === currentScriptId);
            if (script) {
                script.chapters = chapters;
                saveScriptToDb(script);
            }
            
            selectChapter(activeChapterId);
        }
    }

    // Add chapter inside script
    function addChapter() {
        const newId = Date.now().toString();
        const newChapter = {
            id: newId,
            title: `Глава ${chapters.length + 1}`,
            text: ''
        };
        chapters.push(newChapter);

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.chapters = chapters;
            saveScriptToDb(script);
        }

        selectChapter(newId);
        chapterTitleInput.focus();
        chapterTitleInput.select();
    }

    // === SETTINGS CONTROLS AND SYNC ===
    function updateSpeed(newSpeed) {
        speed = parseInt(newSpeed);
        editorSpeedSlider.value = speed;
        editorSpeedVal.textContent = speed;
        speedSlider.value = speed;
        speedVal.textContent = speed;
        
        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.speed = speed;
            saveScriptToDb(script);
        }
        updateStats();
    }

    function updateFontSize(newSize) {
        fontSize = parseInt(newSize);
        editorFontSizeSlider.value = fontSize;
        editorFontSizeVal.textContent = fontSize + 'px';
        fontSizeSlider.value = fontSize;
        fontSizeVal.textContent = fontSize + 'px';

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.fontSize = fontSize;
            saveScriptToDb(script);
        }
        updatePrompterStyles();
    }

    function updateMargin(newMargin) {
        margin = parseInt(newMargin);
        editorMarginSlider.value = margin;
        editorMarginVal.textContent = margin + '%';
        marginSlider.value = margin;
        marginVal.textContent = margin + '%';

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.margin = margin;
            saveScriptToDb(script);
        }
        updatePrompterStyles();
    }

    function updateLineHeight(newLH) {
        lineHeight = parseFloat(newLH);
        editorLineHeightSlider.value = lineHeight;
        editorLineHeightVal.textContent = lineHeight.toFixed(1);
        lineHeightSlider.value = lineHeight;
        lineHeightVal.textContent = lineHeight.toFixed(1);

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.lineHeight = lineHeight;
            saveScriptToDb(script);
        }
        updatePrompterStyles();
    }

    function updateAlignment(newAlign) {
        alignment = newAlign;
        updateAlignmentButtonStates('editor-align', alignment);
        updateAlignmentButtonStates('align', alignment);

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.alignment = alignment;
            saveScriptToDb(script);
        }
        updatePrompterStyles();
    }

    function updateAlignmentButtonStates(prefix, activeAlign) {
        ['left', 'center', 'right'].forEach(a => {
            const btn = document.getElementById(`${prefix}-${a}-btn`);
            if (!btn) return;
            if (a === activeAlign) {
                btn.classList.add('bg-blue-600', 'text-white');
                btn.classList.remove('text-gray-400', 'hover:text-white');
            } else {
                btn.classList.remove('bg-blue-600', 'text-white');
                btn.classList.add('text-gray-400', 'hover:text-white');
            }
        });
    }

    // Sync Delay Controls
    function updateCountdownDelay(newDelay) {
        countdownDelay = parseInt(newDelay);
        updateDelayButtonStates('editor-delay', countdownDelay);
        updateDelayButtonStates('delay', countdownDelay);

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.countdownDelay = countdownDelay;
            saveScriptToDb(script);
        }
    }

    function updateDelayButtonStates(prefix, activeDelay) {
        [0, 3, 5, 10].forEach(d => {
            const btn = document.getElementById(`${prefix}-${d}-btn`);
            if (!btn) return;
            if (d === activeDelay) {
                btn.classList.add('bg-blue-600', 'text-white', 'font-bold');
                btn.classList.remove('text-gray-400', 'hover:text-white');
            } else {
                btn.classList.remove('bg-blue-600', 'text-white', 'font-bold');
                btn.classList.add('text-gray-400', 'hover:text-white');
            }
        });
    }

    function updateMirror(newMirror) {
        isMirrored = newMirror;
        editorMirrorToggle.checked = isMirrored;
        mirrorToggle.checked = isMirrored;

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.isMirrored = isMirrored;
            saveScriptToDb(script);
        }
        updatePrompterStyles();
    }

    function updateGuide(newGuide) {
        showGuide = newGuide;
        editorGuideToggle.checked = showGuide;
        guideToggle.checked = showGuide;

        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.settings.showGuide = showGuide;
            saveScriptToDb(script);
        }
        updatePrompterStyles();
    }

    function updatePrompterStyles() {
        prompterText.style.fontSize = `${fontSize}px`;
        prompterText.style.paddingLeft = `${margin}%`;
        prompterText.style.paddingRight = `${margin}%`;
        prompterText.style.lineHeight = `${lineHeight}`;
        
        prompterText.style.textAlign = alignment;

        if (isMirrored) {
            prompterText.classList.add('mirror-content');
        } else {
            prompterText.classList.remove('mirror-content');
        }

        readingGuide.style.display = showGuide ? 'flex' : 'none';
    }

    // === STATISTICS ===
    function updateStats() {
        const currentText = scriptInput.value || '';
        const charCountChapter = currentText.length;
        const wordCountChapter = currentText.trim() === '' ? 0 : currentText.trim().split(/\s+/).length;
        
        statCharsChapter.textContent = charCountChapter;
        statWordsChapter.textContent = wordCountChapter;
        
        let totalChars = 0;
        let totalWords = 0;
        chapters.forEach(c => {
            totalChars += c.text.length;
            const textTrim = c.text.trim();
            totalWords += textTrim === '' ? 0 : textTrim.split(/\s+/).length;
        });
        
        statChars.textContent = totalChars;
        statWords.textContent = totalWords;
        
        const wpm = 90 + (speed * 10);
        const totalSeconds = Math.round((totalWords / wpm) * 60);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        statTime.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // === PLAYBACK MODULE ===
    function buildPrompterText() {
        prompterText.innerHTML = '';
        chapters.forEach((chapter, index) => {
            const section = document.createElement('div');
            section.className = 'prompter-chapter-section';
            section.id = `prompter-chapter-${chapter.id}`;
            section.dataset.chapterId = chapter.id;
            section.dataset.chapterIndex = index;
            section.dataset.chapterTitle = chapter.title;

            const header = document.createElement('div');
            header.className = 'text-blue-500/40 text-sm tracking-widest font-semibold my-12 border-b border-gray-900 pb-2 select-none';
            header.textContent = `--- ${chapter.title.toUpperCase()} ---`;
            section.appendChild(header);

            const content = document.createElement('div');
            content.style.whiteSpace = 'pre-wrap';
            content.textContent = chapter.text || '(Глава пуста)';
            section.appendChild(content);

            prompterText.appendChild(section);
        });
    }

    function scrollToChapter(chapterId) {
        const el = document.getElementById(`prompter-chapter-${chapterId}`);
        if (el) {
            const wrapperPaddingTop = parseInt(window.getComputedStyle(prompterScrollWrapper).paddingTop) || 0;
            const targetScrollTop = el.offsetTop - wrapperPaddingTop + 50;

            const wasPlaying = isPlaying;
            if (isPlaying) {
                togglePlay();
            }

            prompterScrollWrapper.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });

            scrollPosition = targetScrollTop;

            if (wasPlaying) {
                setTimeout(() => {
                    lastTimestamp = performance.now();
                    isPlaying = true;
                    updatePlayBtnState();
                    prompterScrollWrapper.classList.add('scrolling-active');
                    animationFrameId = requestAnimationFrame(scrollLoop);
                }, 350);
            }
        }
    }

    function navigateChapter(direction) {
        const sections = prompterText.querySelectorAll('.prompter-chapter-section');
        if (sections.length === 0) return;

        const wrapperHeight = prompterScrollWrapper.clientHeight;
        const guidelineY = prompterScrollWrapper.scrollTop + (wrapperHeight * 0.45);

        let currentIndex = 0;
        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            if (guidelineY >= sec.offsetTop && guidelineY <= sec.offsetTop + sec.offsetHeight) {
                currentIndex = i;
                break;
            }
        }

        const targetIndex = currentIndex + direction;
        if (targetIndex >= 0 && targetIndex < sections.length) {
            scrollToChapter(sections[targetIndex].dataset.chapterId);
        }
    }

    function updateActiveChapterIndicator() {
        const wrapperHeight = prompterScrollWrapper.clientHeight;
        const guidelineY = prompterScrollWrapper.scrollTop + (wrapperHeight * 0.45);

        const sections = prompterText.querySelectorAll('.prompter-chapter-section');
        let activeSection = null;

        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            const secTop = sec.offsetTop;
            const secBottom = secTop + sec.offsetHeight;

            if (guidelineY >= secTop && guidelineY <= secBottom) {
                activeSection = sec;
                break;
            }
        }

        if (activeSection) {
            const index = parseInt(activeSection.dataset.chapterIndex) + 1;
            const title = activeSection.dataset.chapterTitle;
            prompterChapterIndicator.textContent = `ГЛАВА ${index}: ${title}`;
        }
    }

    function startCountdown(callback) {
        if (countdownDelay === 0) {
            callback();
            return;
        }

        isCountingDown = true;
        countdownOverlay.classList.remove('hidden');
        countdownNumber.textContent = countdownDelay;

        let count = countdownDelay;

        if (countdownInterval) clearInterval(countdownInterval);

        countdownInterval = setInterval(() => {
            count--;
            if (count <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                countdownOverlay.classList.add('hidden');
                isCountingDown = false;
                callback();
            } else {
                countdownNumber.textContent = count;
            }
        }, 1000);
    }

    function cancelCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        countdownOverlay.classList.add('hidden');
        isCountingDown = false;
    }

    function togglePlay() {
        if (isCountingDown) {
            cancelCountdown();
            isPlaying = false;
            updatePlayBtnState();
            releaseWakeLock();
            showControls();
            return;
        }

        isPlaying = !isPlaying;
        updatePlayBtnState();

        if (isPlaying) {
            prompterScrollWrapper.classList.add('scrolling-active');
            requestWakeLock();
            resetControlsHideTimer();

            startCountdown(() => {
                lastTimestamp = performance.now();
                animationFrameId = requestAnimationFrame(scrollLoop);
            });
        } else {
            prompterScrollWrapper.classList.remove('scrolling-active');
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            releaseWakeLock();
            showControls();
        }
    }

    function updatePlayBtnState() {
        if (isPlaying) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            playPauseBtn.setAttribute('aria-label', 'Пауза');
        } else {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            playPauseBtn.setAttribute('aria-label', 'Старт');
        }
    }

    function scrollLoop(timestamp) {
        if (!isPlaying) return;

        const delta = (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;

        const cappedDelta = Math.min(delta, 0.1);
        const pixelsPerSecond = Math.pow(speed, 1.4) * 6.5;

        scrollPosition += pixelsPerSecond * cappedDelta;
        prompterScrollWrapper.scrollTop = scrollPosition;

        const maxScroll = prompterScrollWrapper.scrollHeight - prompterScrollWrapper.clientHeight;
        if (prompterScrollWrapper.scrollTop >= maxScroll - 2) {
            isPlaying = false;
            updatePlayBtnState();
            prompterScrollWrapper.classList.remove('scrolling-active');
            releaseWakeLock();
            showControls();
            return;
        }

        animationFrameId = requestAnimationFrame(scrollLoop);
    }

    function handleWrapperScroll() {
        const currentScroll = prompterScrollWrapper.scrollTop;
        
        if (!isPlaying) {
            scrollPosition = currentScroll;
            return;
        }

        if (isUserScrolling) {
            scrollPosition = currentScroll;
            if (userScrollTimeout) clearTimeout(userScrollTimeout);
            userScrollTimeout = setTimeout(() => {
                isUserScrolling = false;
            }, 100);
        }
    }

    function showControls() {
        controlPanel.classList.remove('control-panel-hidden');
        if (isPlaying) {
            resetControlsHideTimer();
        } else {
            if (controlsHideTimeout) {
                clearTimeout(controlsHideTimeout);
                controlsHideTimeout = null;
            }
        }
    }

    function hideControls() {
        if (isPlaying) {
            controlPanel.classList.add('control-panel-hidden');
        }
    }

    function resetControlsHideTimer() {
        if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
        controlsHideTimeout = setTimeout(hideControls, CONTROLS_HIDE_DELAY);
    }

    // === WAKE LOCK ===
    async function requestWakeLock() {
        if (!('wakeLock' in navigator)) {
            updateWakeLockStatusUI(false, 'Not Supported');
            return;
        }

        try {
            wakeLock = await navigator.wakeLock.request('screen');
            updateWakeLockStatusUI(true, 'Active');

            wakeLock.addEventListener('release', () => {
                updateWakeLockStatusUI(false, 'Released');
            });
        } catch (err) {
            updateWakeLockStatusUI(false, 'Failed');
        }
    }

    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    function updateWakeLockStatusUI(active, text) {
        if (!wakeLockStatus) return;
        
        if (active) {
            wakeLockStatus.innerHTML = `
                <span class="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    Экран активен
                </span>`;
        } else {
            if (text === 'Not Supported') {
                wakeLockStatus.innerHTML = `
                    <span class="inline-flex items-center gap-1 text-xs text-slate-500 font-normal">
                        Суфлер
                    </span>`;
            } else {
                wakeLockStatus.innerHTML = `
                    <span class="inline-flex items-center gap-1 text-xs text-amber-500 font-normal">
                        Суфлер
                    </span>`;
            }
        }
    }

    // Keyboard Shortcuts
    function handleKeyDown(e) {
        if (prompterContainer.classList.contains('hidden')) return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlay();
                break;
            case 'Escape':
                e.preventDefault();
                exitPrompter();
                break;
            case 'ArrowUp':
                e.preventDefault();
                updateSpeed(Math.min(20, speed + 1));
                break;
            case 'ArrowDown':
                e.preventDefault();
                updateSpeed(Math.max(1, speed - 1));
                break;
            case 'ArrowRight':
                e.preventDefault();
                navigateChapter(1);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                navigateChapter(-1);
                break;
            case 'BracketLeft':
                e.preventDefault();
                updateFontSize(Math.max(24, fontSize - 2));
                break;
            case 'BracketRight':
                e.preventDefault();
                updateFontSize(Math.min(110, fontSize + 2));
                break;
        }
    }

    async function launchPrompter() {
        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            const activeCh = chapters.find(c => c.id === activeChapterId);
            if (activeCh) {
                activeCh.text = scriptInput.value;
                activeCh.title = chapterTitleInput.value;
            }
            script.chapters = chapters;
            script.title = scriptTitleInput.value.trim() || 'Без названия';
            script.settings = {
                speed,
                fontSize,
                margin,
                lineHeight,
                alignment,
                countdownDelay,
                isMirrored,
                showGuide
            };
            saveScriptToDb(script);
        }

        const textExists = chapters.some(c => c.text.trim() !== '');
        if (!textExists) {
            await showCustomModal({
                title: 'Внимание',
                message: 'Пожалуйста, введите текст сценария хотя бы в одной главе!',
                cancelText: null
            });
            return;
        }

        buildPrompterText();
        updatePrompterStyles();

        editContainer.classList.add('hidden');
        prompterContainer.classList.remove('hidden');
        document.body.classList.add('prompter-active');

        prompterScrollWrapper.scrollTop = 0;
        scrollPosition = 0;
        isPlaying = false;
        isCountingDown = false;
        
        updatePlayBtnState();
        showControls();
        updateActiveChapterIndicator();

        const header = document.getElementById('header-container');
        if (header) header.style.display = 'none';
    }

    function exitPrompter() {
        cancelCountdown();

        if (isPlaying) {
            togglePlay();
        }

        prompterContainer.classList.add('hidden');
        editContainer.classList.remove('hidden');
        document.body.classList.remove('prompter-active');

        const header = document.getElementById('header-container');
        if (header) header.style.display = '';

        if (controlsHideTimeout) clearTimeout(controlsHideTimeout);
    }

    // === TAB ROUTING LISTENERS ===
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            if (tabId === activeTab) return;

            tabs.forEach(t => {
                t.classList.remove('active', 'text-red-500', 'font-semibold');
                t.classList.add('text-gray-400', 'font-medium');
            });
            tab.classList.add('active', 'text-red-500', 'font-semibold');
            tab.classList.remove('text-gray-400', 'font-medium');

            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            
            const activeTabEl = document.getElementById(`${tabId}-tab`);
            if (activeTabEl) {
                activeTabEl.classList.remove('hidden');
            }

            activeTab = tabId;

            if (activeTab === 'texts') {
                renderScriptsList();
            }
        });
    });

    // === LISTENERS REGISTER ===

    // FAB Add button opens options bottom sheet
    fabAddBtn.addEventListener('click', openAddSheet);

    // Option selections
    addTextOption.addEventListener('click', () => {
        closeAddSheet();
        createScript();
    });

    addFolderOption.addEventListener('click', () => {
        closeAddSheet();
        createFolder();
    });

    // Search bar filter
    searchInput.addEventListener('input', renderScriptsList);

    // Back to texts list
    editorBackBtn.addEventListener('click', closeScriptEditor);

    // script title change
    scriptTitleInput.addEventListener('input', () => {
        const script = scripts.find(s => s.id === currentScriptId);
        if (script) {
            script.title = scriptTitleInput.value;
            saveScriptToDb(script);
        }
    });

    // Chapters actions
    addChapterBtn.addEventListener('click', addChapter);
    
    chapterTitleInput.addEventListener('input', () => {
        const chapter = chapters.find(c => c.id === activeChapterId);
        if (chapter) {
            chapter.title = chapterTitleInput.value;
            renderChaptersList();
            
            const script = scripts.find(s => s.id === currentScriptId);
            if (script) {
                script.chapters = chapters;
                saveScriptToDb(script);
            }
        }
    });

    scriptInput.addEventListener('input', () => {
        const chapter = chapters.find(c => c.id === activeChapterId);
        if (chapter) {
            chapter.text = scriptInput.value;
            updateStats();
            
            const script = scripts.find(s => s.id === currentScriptId);
            if (script) {
                script.chapters = chapters;
                saveScriptToDb(script);
            }
        }
    });

    launchBtn.addEventListener('click', launchPrompter);
    exitBtn.addEventListener('click', exitPrompter);

    // Sync input sliders
    editorSpeedSlider.addEventListener('input', (e) => updateSpeed(e.target.value));
    speedSlider.addEventListener('input', (e) => updateSpeed(e.target.value));

    editorFontSizeSlider.addEventListener('input', (e) => updateFontSize(e.target.value));
    fontSizeSlider.addEventListener('input', (e) => updateFontSize(e.target.value));

    editorMarginSlider.addEventListener('input', (e) => updateMargin(e.target.value));
    marginSlider.addEventListener('input', (e) => updateMargin(e.target.value));

    editorLineHeightSlider.addEventListener('input', (e) => updateLineHeight(e.target.value));
    lineHeightSlider.addEventListener('input', (e) => updateLineHeight(e.target.value));

    // Align buttons
    ['editor-align', 'align'].forEach(prefix => {
        ['left', 'center', 'right'].forEach(a => {
            const btn = document.getElementById(`${prefix}-${a}-btn`);
            if (btn) {
                btn.addEventListener('click', () => updateAlignment(a));
            }
        });
    });

    // Countdown Delay buttons
    ['editor-delay', 'delay'].forEach(prefix => {
        [0, 3, 5, 10].forEach(d => {
            const btn = document.getElementById(`${prefix}-${d}-btn`);
            if (btn) {
                btn.addEventListener('click', () => updateCountdownDelay(d));
            }
        });
    });

    // Toggles
    editorMirrorToggle.addEventListener('change', (e) => updateMirror(e.target.checked));
    mirrorToggle.addEventListener('change', (e) => updateMirror(e.target.checked));

    editorGuideToggle.addEventListener('change', (e) => updateGuide(e.target.checked));
    guideToggle.addEventListener('change', (e) => updateGuide(e.target.checked));

    // Preset buttons
    presetBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const type = btn.getAttribute('data-preset');
            if (scriptPresets[type]) {
                const confirmPreset = await showCustomModal({
                    title: 'Применить шаблон',
                    message: 'Заменить текст текущей главы шаблоном?'
                });
                if (confirmPreset) {
                    scriptInput.value = scriptPresets[type];
                    const chapter = chapters.find(c => c.id === activeChapterId);
                    if (chapter) {
                        chapter.text = scriptPresets[type];
                        const script = scripts.find(s => s.id === currentScriptId);
                        if (script) {
                            script.chapters = chapters;
                            saveScriptToDb(script);
                        }
                        updateStats();
                    }
                }
            }
        });
    });

    // Chapter Navigation in player mode
    prevChapterBtn.addEventListener('click', () => navigateChapter(-1));
    nextChapterBtn.addEventListener('click', () => navigateChapter(1));

    // Scroll wrapper scroll sync
    prompterScrollWrapper.addEventListener('scroll', () => {
        handleWrapperScroll();
        if (!prompterContainer.classList.contains('hidden')) {
            updateActiveChapterIndicator();
        }
    });

    prompterScrollWrapper.addEventListener('touchstart', () => { isUserScrolling = true; }, { passive: true });
    prompterScrollWrapper.addEventListener('mousedown', () => { isUserScrolling = true; });

    // Interaction controls revealing
    prompterScrollWrapper.addEventListener('click', (e) => {
        if (e.target === prompterScrollWrapper || e.target === prompterText || e.target.closest('.prompter-chapter-section')) {
            showControls();
            togglePlay();
        }
    });

    prompterContainer.addEventListener('mousemove', showControls);
    prompterContainer.addEventListener('touchstart', showControls, { passive: true });

    // Play button
    playPauseBtn.addEventListener('click', togglePlay);

    // Keyboard hotkeys
    window.addEventListener('keydown', handleKeyDown);

    // Visibility change WakeLock sync
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && isPlaying) {
            await requestWakeLock();
        }
    });

    // Firebase Auth state listener integration
    window.addEventListener('authChanged', async (e) => {
        const user = e.detail.user;
        const profileCard = document.getElementById('account-profile-card');
        const loginCard = document.getElementById('account-login-card');

        if (user) {
            if (profileCard) profileCard.classList.remove('hidden');
            if (loginCard) loginCard.classList.add('hidden');

            const nameEl = document.getElementById('account-name');
            const emailEl = document.getElementById('account-email');
            const avatar = document.getElementById('account-avatar');

            if (nameEl) nameEl.textContent = user.displayName || "Пользователь";
            if (emailEl) emailEl.textContent = user.email || "";
            if (avatar) {
                if (user.photoURL) avatar.src = user.photoURL;
                else avatar.src = `https://via.placeholder.com/64/CCCCCC/FFFFFF?text=${(user.displayName || "U")[0]}`;
            }

            // Sync folders & scripts from cloud Firestore
            await loadFoldersFromFirestore();
            await loadScriptsFromFirestore();
        } else {
            if (profileCard) profileCard.classList.add('hidden');
            if (loginCard) loginCard.classList.remove('hidden');

            loadFoldersFromStorage();
            loadScriptsFromStorage();
        }

        renderScriptsList();
    });

    // Run startup initialization
    init();
});
