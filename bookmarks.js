import {
    getFirestore,
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    deleteDoc,
    updateDoc,
    writeBatch,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();

let currentUid = null;
let unsubscribe = null;
let allBookmarks = []; 
let currentFolder = 'all'; 

const container = document.getElementById('bookmarksContainer');
const searchInput = document.getElementById('bookmarkSearch');
const addBookmarkBtn = document.getElementById('addBookmarkBtn');
const countAllEl = document.getElementById('count-all');
const countTrashEl = document.getElementById('count-trash');
const trashBanner = document.getElementById('trash-banner');
const emptyTrashLink = document.getElementById('empty-trash-link');

let allCollections = [];
let unsubscribeCollections = null;
const collectionsContainer = document.getElementById('custom-collections-container');
const createCollectionBtn = document.getElementById('create-collection-btn');

// Profile Elements
const userNameEl = document.getElementById('user-name-display');
const userAvatarEl = document.getElementById('user-avatar-display');
const profileTrigger = document.getElementById('workspaceProfileTrigger');

// Setup Sidebar Resizer
function initSidebarResizer() {
    const sidebar = document.getElementById('appSidebar');
    const handle = document.getElementById('sidebarResizeHandle');
    if (!sidebar || !handle) return;

    let isResizing = false;
    let currentWidth = 280;

    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        currentWidth = parseInt(savedWidth, 10);
        document.documentElement.style.setProperty('--sidebar-width', currentWidth + 'px');
    }

    handle.addEventListener('mousedown', () => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        handle.classList.add('active');
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > 450) newWidth = 450;
        currentWidth = newWidth;
        document.documentElement.style.setProperty('--sidebar-width', currentWidth + 'px');
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            handle.classList.remove('active');
            localStorage.setItem('sidebarWidth', currentWidth);
        }
    });
}

// Mobile Menu Controls
function initMobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const overlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('appSidebar');

    if (!btn || !overlay || !sidebar) return;

    function open() {
        sidebar.classList.add('mobile-open');
        overlay.classList.add('active');
    }

    function close() {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
    }

    btn.addEventListener('click', open);
    overlay.addEventListener('click', close);

    // Close sidebar when clicking any links on mobile
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
        item.addEventListener('click', close);
    });
}

// Update User Profile in Sidebar
function updateProfileUI(user) {
    if (!userNameEl || !userAvatarEl) return;

    if (user) {
        userNameEl.innerText = user.displayName || "Пользователь";
        if (user.photoURL) {
            userAvatarEl.innerHTML = `<img src="${user.photoURL}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            const letter = user.displayName ? user.displayName[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : "U");
            userAvatarEl.innerText = letter;
            userAvatarEl.style.background = "#4a5568";
        }
    } else {
        userNameEl.innerText = "Войти";
        userAvatarEl.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display: block;">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
        userAvatarEl.style.background = "rgba(255,255,255,0.1)";
    }
}

// Function to count nouns helper
function getNoun(number, one, two, five) {
    let n = Math.abs(number);
    n %= 100;
    if (n >= 5 && n <= 20) return five;
    n %= 10;
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return two;
    return five;
}

// Render list of bookmarks
function renderList(items) {
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; margin-top: 60px; color: var(--text-secondary);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.4; margin-bottom: 12px;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p style="font-weight: 500;">Нет закладок</p>
            </div>
        `;
        return;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'bookmark-row';
        row.setAttribute('data-id', item.id);
        
        let domain = '';
        try {
            domain = new URL(item.url).hostname.replace('www.', '');
        } catch(e) {
            domain = item.url;
        }

        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        
        const isInTrash = !!item.inTrash;

        let actionsHtml = '';
        if (isInTrash) {
            // In Trash actions: Restore & Delete Permanently
            actionsHtml = `
                <button class="btn-action-round btn-restore-bookmark" title="Восстановить" style="color: #28a745;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 2v6h6"></path>
                        <path d="M3 13a9 9 0 1 0 3-7.7L3 8"></path>
                    </svg>
                </button>
                <button class="btn-action-round btn-delete-permanently" title="Удалить навсегда" style="color: #dc3545;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            `;
        } else {
            // Active actions: Open & Move to trash
            actionsHtml = `
                <button class="btn-action-round" title="Перейти на сайт" onclick="window.open('${item.url}', '_blank')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
                <button class="btn-action-round btn-rename-bookmark" title="Переименовать" style="color: var(--text-secondary);">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-action-round btn-move-to-trash" title="В корзину" style="color: #ff5e62;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;
        }

        row.innerHTML = `
            <div class="drag-handle" title="Перетащить">
                <svg width="10" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
            </div>
            <div class="bookmark-left">
                <div class="favicon-wrapper">
                    <img src="${faviconUrl}" class="favicon-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <span class="favicon-fallback" style="display:none;">${(item.title || 'B')[0].toUpperCase()}</span>
                </div>
                <div class="bookmark-info">
                    <h3 class="bookmark-title">${item.title || item.url}</h3>
                    <span class="bookmark-url">${item.url}</span>
                </div>
            </div>
            <div class="bookmark-actions">
                ${actionsHtml}
            </div>
        `;

        // Handle events
        row.querySelector('.bookmark-left').addEventListener('click', () => {
            window.open(item.url, '_blank');
        });

        // Inline Rename for single bookmark link
        const renameBtn = row.querySelector('.btn-rename-bookmark');
        if (renameBtn) {
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const titleEl = row.querySelector('.bookmark-title');
                if (!titleEl || titleEl.querySelector('input')) return;

                const oldTitle = item.title;
                titleEl.innerHTML = `<input type="text" class="inline-edit-input" style="color:var(--text); border-bottom-color:var(--accent);" value="${oldTitle}">`;
                const input = titleEl.querySelector('input');
                input.focus();
                input.select();

                let fin = false;
                async function saveBookmarkName() {
                    if (fin) return;
                    fin = true;
                    const newVal = input.value.trim();
                    if (newVal && newVal !== oldTitle) {
                        try {
                            await updateDoc(doc(db, 'users', currentUid, 'bookmarks', item.id), {
                                title: newVal
                            });
                        } catch(err) {
                            console.error(err);
                            titleEl.innerText = oldTitle;
                        }
                    } else {
                        titleEl.innerText = oldTitle;
                    }
                }

                input.addEventListener('blur', saveBookmarkName);
                input.addEventListener('keydown', (ev) => {
                    ev.stopPropagation();
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        input.blur();
                    } else if (ev.key === 'Escape') {
                        fin = true;
                        titleEl.innerText = oldTitle;
                    }
                });
                input.addEventListener('click', ev => {
                    ev.stopPropagation();
                    ev.preventDefault();
                });
            });
        }

        // Move to trash
        const moveTrashBtn = row.querySelector('.btn-move-to-trash');
        if (moveTrashBtn) {
            moveTrashBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUid) return;
                showCustomConfirm(
                    "Вы уверены?",
                    "Вы действительно хотите переместить эту закладку в корзину?",
                    "Переместить в корзину",
                    async () => {
                        try {
                            await updateDoc(doc(db, 'users', currentUid, 'bookmarks', item.id), {
                                inTrash: true,
                                deletedAt: serverTimestamp()
                            });
                        } catch (err) {
                            console.error('Move to trash failed', err);
                        }
                    }
                );
            });
        }

        // Restore from trash
        const restoreBtn = row.querySelector('.btn-restore-bookmark');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!currentUid) return;
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'bookmarks', item.id), {
                        inTrash: false,
                        deletedAt: null // Reset timestamp
                    });
                } catch (err) {
                    console.error('Restore failed', err);
                }
            });
        }

        // Delete Perm
        const deletePermBtn = row.querySelector('.btn-delete-permanently');
        if (deletePermBtn) {
            deletePermBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!currentUid) return;
                if (!confirm('Удалить эту закладку НАВСЕГДА? Это действие необратимо.')) return;
                try {
                    await deleteDoc(doc(db, 'users', currentUid, 'bookmarks', item.id));
                } catch (err) {
                    console.error('Delete failed', err);
                }
            });
        }

        container.appendChild(row);
    });

    const footer = document.createElement('div');
    footer.className = 'bookmarks-footer';
    const nounWord = currentFolder === 'trash' ? 'в корзине' : getNoun(items.length, 'закладка', 'закладки', 'закладок');
    footer.innerText = `${items.length} ${nounWord}`;
    container.appendChild(footer);
}

function handleSnapshot(snap) {
    allBookmarks = [];
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    snap.forEach(docSnap => {
        const data = docSnap.data();
        
        // Check client-side purge: 30 days logic
        if (data.inTrash === true && data.deletedAt) {
            try {
                const delTime = data.deletedAt.toDate().getTime();
                if (now - delTime > THIRTY_DAYS_MS) {
                    // Background auto-delete
                    deleteDoc(doc(db, 'users', currentUid, 'bookmarks', docSnap.id));
                    return; // Don't add it to current run output
                }
            } catch(e) {
                console.error("Timestamp err", e);
            }
        }

        allBookmarks.push({
            id: docSnap.id,
            ...data
        });
    });

    // Calculate live counters
    const activeLen = allBookmarks.filter(b => !b.inTrash).length;
    const trashLen = allBookmarks.filter(b => !!b.inTrash).length;

    if (countAllEl) countAllEl.innerText = activeLen;
    if (countTrashEl) countTrashEl.innerText = trashLen;

    performSearchAndFilter();
    
    // Update collections counters since counts may depend on bookmarks count change
    renderCollections();
}

function performSearchAndFilter() {
    const queryStr = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    // Toggle trash notice banner
    if (trashBanner) {
        trashBanner.style.display = currentFolder === 'trash' ? 'flex' : 'none';
    }

    // Filter by current tab view
    let filtered = [];
    if (currentFolder === 'trash') {
        filtered = allBookmarks.filter(b => !!b.inTrash);
    } else if (currentFolder.startsWith('coll_')) {
        const targetCollId = currentFolder.replace('coll_', '');
        filtered = allBookmarks.filter(b => !b.inTrash && b.collectionId === targetCollId);
    } else {
        filtered = allBookmarks.filter(b => !b.inTrash);
    }

    // Apply dynamic search if provided
    if (queryStr) {
        filtered = filtered.filter(b => 
            (b.title && b.title.toLowerCase().includes(queryStr)) || 
            (b.url && b.url.toLowerCase().includes(queryStr))
        );
    }

    // 3. Advanced Sorting: respect drag order, fallback to chronological desc
    filtered.sort((a, b) => {
        const aOrder = a.order ?? 999999;
        const bOrder = b.order ?? 999999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        
        const aDate = a.createdAt?.seconds ?? 0;
        const bDate = b.createdAt?.seconds ?? 0;
        return bDate - aDate;
    });

    renderList(filtered);
}

async function startForUser(uid) {
    if (!uid) return;
    if (unsubscribe) unsubscribe();
    
    container.innerHTML = `<div style="text-align: center; margin-top: 60px; opacity: 0.5;">Загрузка...</div>`;

    const q = query(collection(db, 'users', uid, 'bookmarks'), orderBy('createdAt', 'desc'));
    unsubscribe = onSnapshot(q, (snap) => {
        handleSnapshot(snap);
    }, (err) => {
        console.error('Bookmarks snapshot error', err);
        container.innerHTML = `<div style="text-align: center; margin-top: 60px; color: red;">Ошибка загрузки закладок</div>`;
    });

    // Listen to collections
    if (unsubscribeCollections) unsubscribeCollections();
    const collQ = query(collection(db, 'users', uid, 'collections'), orderBy('createdAt', 'asc'));
    unsubscribeCollections = onSnapshot(collQ, (snap) => {
        allCollections = [];
        snap.forEach(docSnap => {
            allCollections.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderCollections();
    }, (err) => console.error('Collections error', err));
}

function stopForUser() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (unsubscribeCollections) { unsubscribeCollections(); unsubscribeCollections = null; }
    allBookmarks = [];
    allCollections = [];
    if (collectionsContainer) collectionsContainer.innerHTML = '';
    if (countAllEl) countAllEl.innerText = '0';
    if (countTrashEl) countTrashEl.innerText = '0';
    container.innerHTML = `
        <div style="text-align: center; margin-top: 60px; color: var(--text-secondary);">
            <p>Пожалуйста, авторизуйтесь для просмотра ваших закладок.</p>
        </div>
    `;
}

// Dynamic render of user created collections in the sidebar
function renderCollections() {
    if (!collectionsContainer) return;
    collectionsContainer.innerHTML = '';

    // Sort: numeric order first, then creation timestamp asc
    allCollections.sort((a, b) => {
        const aOrder = a.order ?? 999999;
        const bOrder = b.order ?? 999999;
        if (aOrder !== bOrder) return aOrder - bOrder;

        const aDate = a.createdAt?.seconds ?? 0;
        const bDate = b.createdAt?.seconds ?? 0;
        return aDate - bDate;
    });

    allCollections.forEach(coll => {
        const collId = coll.id;
        // Count active bookmarks assigned to this collection
        const count = allBookmarks.filter(b => !b.inTrash && b.collectionId === collId).length;
        
        const isActive = currentFolder === `coll_${collId}`;

        const a = document.createElement('a');
        a.href = '#';
        a.className = `menu-item ${isActive ? 'highlighted' : ''}`;
        a.setAttribute('data-folder', `coll_${collId}`);
        
        a.innerHTML = `
            <div class="menu-item-left">
                <div class="drag-handle" title="Перетащить">
                    <svg width="10" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                </div>
                <span class="menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </span>
                <span>${coll.name}</span>
            </div>
            <div class="menu-item-right">
                <span class="menu-count">${count}</span>
                <button class="menu-dots-trigger" title="Действия">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                </button>
            </div>
        `;

        // Open Context Menu on click of three dots
        const dotsBtn = a.querySelector('.menu-dots-trigger');
        dotsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showCollectionContextMenu(e, collId, coll.name);
        });

        a.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Unhighlight all sidebar items including top static items
            document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => el.classList.remove('highlighted', 'active'));
            
            a.classList.add('highlighted');
            currentFolder = `coll_${collId}`;
            
            const currentFolderTitle = document.getElementById('currentFolderTitle');
            if (currentFolderTitle) currentFolderTitle.innerText = coll.name;
            
            performSearchAndFilter();
        });

        collectionsContainer.appendChild(a);
    });
}

// Helper: Display the context menu for collections
let activeContextMenu = null;

function showCollectionContextMenu(e, collId, collName) {
    // Close any existing menu
    if (activeContextMenu) activeContextMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    
    // Construct simplified menu items
    menu.innerHTML = `
        <div class="ctx-item" id="ctx-open-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            Открыть все закладки
        </div>
        <div class="ctx-item" id="ctx-rename">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            Переименовать
        </div>
        <div class="ctx-item ctx-item-disabled">
            Сменить иконку
        </div>
        <div class="ctx-item" id="ctx-import">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            Импорт
        </div>
        <div class="ctx-item danger" id="ctx-delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Удалить
        </div>
    `;

    document.body.appendChild(menu);
    activeContextMenu = menu;

    // Auto Positioning
    let x = e.clientX;
    let y = e.clientY;
    const menuRect = menu.getBoundingClientRect();
    
    // Keep inside window right bounds
    if (x + menuRect.width > window.innerWidth) {
        x = window.innerWidth - menuRect.width - 10;
    }
    // Keep inside window bottom bounds
    if (y + menuRect.height > window.innerHeight) {
        y = window.innerHeight - menuRect.height - 10;
    }
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // 1. Handle "Open all"
    menu.querySelector('#ctx-open-all').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        const children = allBookmarks.filter(b => !b.inTrash && b.collectionId === collId);
        if (children.length === 0) {
            alert('В этой коллекции пока нет закладок.');
            return;
        }
        
        // Note: browsers may require explicit user consent (popup alert) to open multiple tabs
        children.forEach(item => {
            window.open(item.url, '_blank');
        });
    });

    // 2. Add operational listener logic for functional items
    menu.querySelector('#ctx-rename').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        
        // Find exact link in sidebar to do local inline replacement
        const targetLink = document.querySelector(`[data-folder="coll_${collId}"]`);
        if (!targetLink) return;
        
        const labelSpan = targetLink.querySelector('.menu-item-left span:not(.menu-icon)');
        if (!labelSpan) return;

        // Store initial name to fallback on if needed
        const oldVal = collName;

        // Convert text to input
        labelSpan.innerHTML = `<input type="text" class="inline-edit-input" value="${oldVal}">`;
        const input = labelSpan.querySelector('input');
        input.focus();
        input.select();

        let finished = false;

        async function commitSave() {
            if (finished) return;
            finished = true;
            const newVal = input.value.trim();

            if (newVal && newVal !== oldVal) {
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'collections', collId), {
                        name: newVal
                    });
                    // Update title dynamically if we are currently in that collection
                    if (currentFolder === `coll_${collId}`) {
                        const titleEl = document.getElementById('currentFolderTitle');
                        if (titleEl) titleEl.innerText = newVal;
                    }
                } catch(err) {
                    console.error("Rename err", err);
                    labelSpan.innerText = oldVal;
                }
            } else {
                // No change or empty, revert to text
                labelSpan.innerText = oldVal;
            }
            // Note: Firebase Snapshot will auto-trigger full sidebar re-render immediately if save succeeds!
        }

        input.addEventListener('blur', commitSave);
        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // Prevent list interaction
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                finished = true;
                labelSpan.innerText = oldVal;
            }
        });
        // Prevent link activation on sidebar click while inside input
        input.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    menu.querySelector('#ctx-import').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        triggerCsvImport(collId);
    });

    menu.querySelector('#ctx-delete').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();

        showCustomConfirm(
            "Вы уверены?",
            "Действительно удалить коллекцию? Все закладки внутри коллекции будут перемещены в корзину.",
            `Удалить ${collName}`,
            async () => {
                try {
                    // 1. Find all child bookmarks assigned to this collection
                    const children = allBookmarks.filter(b => !b.inTrash && b.collectionId === collId);

                    // 2. Move child bookmarks to trash (as described in prompt)
                    if (children.length > 0) {
                        await Promise.all(children.map(item => 
                            updateDoc(doc(db, 'users', currentUid, 'bookmarks', item.id), {
                                inTrash: true,
                                deletedAt: serverTimestamp()
                            })
                        ));
                    }

                    // 3. Delete actual collection document
                    await deleteDoc(doc(db, 'users', currentUid, 'collections', collId));

                    // Switch view back to all if current was the deleted folder
                    if (currentFolder === `coll_${collId}`) {
                        document.querySelector('[data-folder="all"]').click();
                    }
                } catch(err) {
                    console.error("Delete cascade error", err);
                }
            }
        );
    });

    // Prevent closing when clicking inside items that are purely disabled
    menu.addEventListener('click', (evt) => evt.stopPropagation());
}

// Helper: macOS style custom confirm modal with generalized inputs
// Modal window to add a new Bookmark with custom logic
function showAddBookmarkModal() {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    overlay.innerHTML = `
        <div class="confirm-box" style="width: 350px;">
            <div class="confirm-title" style="margin-bottom: 18px;">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1070e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                 Добавить закладку
            </div>
            
            <div class="modal-input-group">
                <label>Ссылка</label>
                <input type="text" id="modal-bm-url" class="modal-input" placeholder="например, google.com" autocomplete="off">
            </div>
            
            <div class="modal-input-group" style="margin-bottom: 22px;">
                <label>Название</label>
                <input type="text" id="modal-bm-title" class="modal-input" placeholder="Имя сайта" autocomplete="off">
            </div>

            <button class="confirm-btn-primary" id="modal-bm-submit">Сохранить закладку</button>
            <button class="confirm-btn-secondary" id="modal-bm-cancel">Отмена</button>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    const urlInp = overlay.querySelector('#modal-bm-url');
    const titleInp = overlay.querySelector('#modal-bm-title');
    const submitBtn = overlay.querySelector('#modal-bm-submit');
    const cancelBtn = overlay.querySelector('#modal-bm-cancel');
    
    urlInp.focus();

    let manualTitleEdit = false;
    let titleFetchController = null;

    titleInp.addEventListener('input', () => {
        manualTitleEdit = true;
    });

    // Magic Fetch Logic
    async function triggerTitleFetch(targetUrl) {
        if (manualTitleEdit) return;
        
        if (titleFetchController) titleFetchController.abort();
        titleFetchController = new AbortController();

        try {
            // Use Microlink API: free, fast structured link data parser.
            // Returns perfectly resolved metadata without needing local DOMParser.
            const endpoint = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}`;
            
            const response = await fetch(endpoint, { signal: titleFetchController.signal });
            const result = await response.json();
            
            if (result && result.status === 'success' && result.data && result.data.title) {
                if (!manualTitleEdit && result.data.title.trim()) {
                    // Instantly set the actual human-friendly page title
                    titleInp.value = result.data.title.trim();
                }
            }
        } catch (e) {
            if (e.name !== 'AbortError') console.warn("Remote title fetch issue:", e);
        }
    }

    let debounceTimer = null;
    urlInp.addEventListener('input', () => {
        let val = urlInp.value.trim();
        if (!val) {
            if(!manualTitleEdit) titleInp.value = '';
            return;
        }
        
        let fullUrl = val;
        if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
        
        // 1. INSTANT FALLBACK (Parse domain so field isn't empty)
        if (!manualTitleEdit) {
            try {
                const u = new URL(fullUrl);
                let name = u.hostname.replace(/^www\./i, '');
                let p = name.split('.');
                if (p.length >= 1) {
                    let core = p[0].charAt(0).toUpperCase() + p[0].slice(1);
                    titleInp.value = core;
                }
            } catch (e) {}
        }

        // 2. ASYNC MAGIC FETCH (Debounced)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Only trigger if looks like a semi-valid domain to save bandwidth
            if (fullUrl.includes('.')) {
                triggerTitleFetch(fullUrl);
            }
        }, 700);
    });

    async function saveAndClose() {
        let url = urlInp.value.trim();
        if (!url) return;
        
        // Enforce protocol
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        
        let title = titleInp.value.trim() || url;
        
        overlay.remove();

        let currentCollId = null;
        if (currentFolder && currentFolder.startsWith('coll_')) {
            currentCollId = currentFolder.replace('coll_', '');
        }

        try {
            await addDoc(collection(db, 'users', currentUid, 'bookmarks'), {
                title,
                url,
                collectionId: currentCollId,
                createdAt: serverTimestamp()
            });
        } catch (e) {
            console.error(e);
            alert("Ошибка добавления закладки.");
        }
    }

    submitBtn.addEventListener('click', saveAndClose);
    cancelBtn.addEventListener('click', () => overlay.remove());
    
    [urlInp, titleInp].forEach(inp => {
        inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') saveAndClose();
            if (ev.key === 'Escape') overlay.remove();
        });
    });
    
    overlay.addEventListener('click', (e) => {
        if(e.target === overlay) overlay.remove();
    });
}

function showCustomConfirm(title, message, actionBtnText, onConfirmCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e67e22" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                ${title}
            </div>
            <div class="confirm-message">
                ${message}
            </div>
            <button class="confirm-btn-primary" id="btn-do-delete">${actionBtnText}</button>
            <button class="confirm-btn-secondary" id="btn-cancel-delete">Отмена</button>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btn-do-delete').addEventListener('click', () => {
        overlay.remove();
        onConfirmCallback();
    });

    overlay.querySelector('#btn-cancel-delete').addEventListener('click', () => {
        overlay.remove();
    });
    
    overlay.addEventListener('click', (e) => {
        if(e.target === overlay) overlay.remove();
    });
}

// Global listener to close context menus when clicking away
document.addEventListener('click', () => {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
});

// Auth interactions
window.addEventListener('authChanged', (e) => {
    const user = e.detail.user;
    currentUid = user ? user.uid : null;
    updateProfileUI(user);
    if (user) {
        startForUser(currentUid);
    } else {
        stopForUser();
    }
});

// Init trigger click to auth modal
if (profileTrigger) {
    profileTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.openAuthModal === 'function') {
            window.openAuthModal(profileTrigger);
        }
    });
}

// Add bookmark action
if (addBookmarkBtn) {
    addBookmarkBtn.addEventListener('click', () => {
        if (!currentUid) {
            if (typeof window.openAuthModal === 'function') window.openAuthModal(profileTrigger);
            return;
        }
        showAddBookmarkModal();
    });
}

// Hook up main header actions button
const mainActionsBtn = document.getElementById('main-more-actions-btn');
if (mainActionsBtn) {
    mainActionsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showMainContextMenu(e);
    });
}

// Helper: Display the context menu for main header actions
function showMainContextMenu(e) {
    if (activeContextMenu) activeContextMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    
    menu.innerHTML = `
        <div class="ctx-item" id="ctx-import-csv">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Импорт
        </div>
    `;

    document.body.appendChild(menu);
    activeContextMenu = menu;

    // Auto Positioning
    let x = e.clientX;
    let y = e.clientY;
    const menuRect = menu.getBoundingClientRect();
    
    if (x + menuRect.width > window.innerWidth) {
        x = window.innerWidth - menuRect.width - 10;
    }
    if (y + menuRect.height > window.innerHeight) {
        y = window.innerHeight - menuRect.height - 10;
    }
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    menu.querySelector('#ctx-import-csv').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        triggerCsvImport();
    });

    menu.addEventListener('click', (evt) => evt.stopPropagation());
}

function triggerCsvImport(targetCollId = undefined) {
    if (!currentUid) {
        if (typeof window.openAuthModal === 'function') window.openAuthModal(profileTrigger);
        return;
    }

    if (currentFolder === 'trash' && targetCollId === undefined) {
        alert('Импорт невозможен в корзину. Перейдите в другую папку или коллекцию.');
        return;
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            await processCsvImport(text, targetCollId);
        };
        reader.readAsText(file);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

async function processCsvImport(text, targetCollId = undefined) {
    const lines = parseCSV(text);
    if (lines.length < 2) {
        alert('Выбранный файл пуст или содержит недостаточно данных.');
        return;
    }

    const headers = lines[0].map(h => h.toLowerCase().trim());
    const titleIndex = headers.indexOf('title');
    const urlIndex = headers.indexOf('url');

    if (titleIndex === -1 || urlIndex === -1) {
        alert('Не удалось найти обязательные колонки "title" и "url" в CSV файле.');
        return;
    }

    let currentCollId = null;
    if (targetCollId !== undefined) {
        currentCollId = targetCollId;
    } else if (currentFolder && currentFolder.startsWith('coll_')) {
        currentCollId = currentFolder.replace('coll_', '');
    }

    const importedItems = [];
    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (row.length <= Math.max(titleIndex, urlIndex)) continue;
        
        let url = row[urlIndex] ? row[urlIndex].trim() : '';
        let title = row[titleIndex] ? row[titleIndex].trim() : '';

        if (!url) continue;
        if (!title) title = url;

        // Enforce protocol
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        importedItems.push({ title, url });
    }

    if (importedItems.length === 0) {
        alert('В файле не найдено корректных ссылок для импорта.');
        return;
    }

    let successCount = 0;
    const batchSize = 500;
    
    try {
        for (let i = 0; i < importedItems.length; i += batchSize) {
            const chunk = importedItems.slice(i, i + batchSize);
            const batch = writeBatch(db);
            
            for (const item of chunk) {
                const docRef = doc(collection(db, 'users', currentUid, 'bookmarks'));
                batch.set(docRef, {
                    title: item.title,
                    url: item.url,
                    collectionId: currentCollId,
                    createdAt: serverTimestamp()
                });
            }
            await batch.commit();
            successCount += chunk.length;
        }
        
        alert(`Успешно импортировано ${successCount} ${getNoun(successCount, 'закладка', 'закладки', 'закладок')}.`);
    } catch (err) {
        console.error('CSV Import failed', err);
        alert(`Произошла ошибка при импорте. Удалось импортировать: ${successCount}`);
    }
}

function parseCSV(text) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentValue = '';
    
    const firstLine = text.split('\n')[0] || '';
    const separator = firstLine.indexOf(';') !== -1 ? ';' : ',';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i+1];
        
        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentValue += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentValue += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === separator) {
                row.push(currentValue.trim());
                currentValue = '';
            } else if (char === '\r' || char === '\n') {
                row.push(currentValue.trim());
                if (row.some(cell => cell !== '')) {
                    lines.push(row);
                }
                row = [];
                currentValue = '';
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
            } else {
                currentValue += char;
            }
        }
    }
    if (currentValue || row.length > 0) {
        row.push(currentValue.trim());
        if (row.some(cell => cell !== '')) {
            lines.push(row);
        }
    }
    return lines;
}


// Setup Search live filtering
if (searchInput) {
    searchInput.addEventListener('input', performSearchAndFilter);
}

// Hook up "Empty trash" link
if (emptyTrashLink) {
    emptyTrashLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const trashItems = allBookmarks.filter(b => !!b.inTrash);
        if (trashItems.length === 0) return;
        
        if (!confirm(`Вы уверены, что хотите навсегда удалить ${trashItems.length} ${getNoun(trashItems.length, 'объект', 'объекта', 'объектов')}?`)) {
            return;
        }

        if (!currentUid) return;

        // Issue parallel delete requests
        try {
            await Promise.all(
                trashItems.map(item => deleteDoc(doc(db, 'users', currentUid, 'bookmarks', item.id)))
            );
        } catch (err) {
            console.error("Empty trash error", err);
            alert("Ошибка при очистке корзины.");
        }
    });
}

// Create custom collection
if (createCollectionBtn) {
    createCollectionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentUid) {
            if (typeof window.openAuthModal === 'function') window.openAuthModal(profileTrigger);
            return;
        }
        
        const name = prompt("Введите название новой коллекции:");
        if (!name || !name.trim()) return;

        try {
            await addDoc(collection(db, 'users', currentUid, 'collections'), {
                name: name.trim(),
                createdAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error creating collection", err);
            alert("Не удалось создать коллекцию.");
        }
    });
}

function initSortables() {
    // Ensure library is loaded
    if (typeof Sortable === 'undefined') {
        console.error("Sortable library not loaded.");
        return;
    }

    // 1. Custom Collections Reordering
    if (collectionsContainer) {
        Sortable.create(collectionsContainer, {
            animation: 180,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            forceFallback: false,
            onEnd: async function () {
                if (!currentUid) return;
                const items = Array.from(collectionsContainer.querySelectorAll('.menu-item'));
                const batch = writeBatch(db);
                items.forEach((el, index) => {
                    const folderId = el.getAttribute('data-folder');
                    if (!folderId) return;
                    const cleanId = folderId.replace('coll_', '');
                    const docRef = doc(db, 'users', currentUid, 'collections', cleanId);
                    batch.update(docRef, { order: index });
                });
                try {
                    await batch.commit();
                } catch(err) {
                    console.error("Failed saving collection order", err);
                }
            }
        });
    }

    // 2. Bookmarks List Reordering
    const bookmarksListEl = document.getElementById('bookmarksContainer');
    if (bookmarksListEl) {
        Sortable.create(bookmarksListEl, {
            animation: 180,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'list-drag-preview',
            forceFallback: true,
            fallbackTolerance: 3,
            fallbackOnBody: true,
            onEnd: async function () {
                if (!currentUid) return;
                // We only persist order changes if there's no search filtering active 
                // to avoid corrupted global orders based on partial views.
                const q = searchInput ? searchInput.value.trim() : '';
                if (q) {
                     alert("Невозможно переупорядочить список в режиме поиска.");
                     performSearchAndFilter(); // Revert visual
                     return;
                }

                const rows = Array.from(bookmarksListEl.querySelectorAll('.bookmark-row'));
                const batch = writeBatch(db);
                rows.forEach((el, index) => {
                    const bId = el.getAttribute('data-id');
                    if (!bId) return;
                    const docRef = doc(db, 'users', currentUid, 'bookmarks', bId);
                    batch.update(docRef, { order: index });
                });

                try {
                    await batch.commit();
                } catch(err) {
                    console.error("Failed saving bookmarks order", err);
                }
            }
        });
    }
}

// Global Initialization
document.addEventListener('DOMContentLoaded', () => {
    initSidebarResizer();
    initMobileMenu();
    initSortables();

    // Sidebar static links interactivity
    document.querySelectorAll('.sidebar-menu > a[data-folder], .sidebar-menu > div > a[data-folder]').forEach(item => {
        item.addEventListener('click', (e) => {
            // Ignore dynamic custom collections which live in nested container handle themselves
            if (item.parentElement && item.parentElement.id === 'custom-collections-container') return;

            e.preventDefault();
            document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => el.classList.remove('highlighted', 'active'));
            item.classList.add('highlighted');
            
            currentFolder = item.getAttribute('data-folder');
            
            const folderTitle = item.querySelector('span:not(.menu-icon)').innerText;
            const currentFolderTitle = document.getElementById('currentFolderTitle');
            if (currentFolderTitle) currentFolderTitle.innerText = folderTitle;
            
            performSearchAndFilter();
        });
    });

    // Check if user is already authed (late init race fix)
    if (window.currentUser) {
        currentUid = window.currentUser.uid;
        updateProfileUI(window.currentUser);
        startForUser(currentUid);
    } else {
        updateProfileUI(null);
    }
});
