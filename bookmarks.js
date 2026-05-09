import {
    getFirestore,
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    deleteDoc,
    updateDoc,
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
                <button class="btn-action-round btn-move-to-trash" title="В корзину" style="color: #ff5e62;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;
        }

        row.innerHTML = `
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
    menu.querySelector('#ctx-rename').addEventListener('click', async (evt) => {
        evt.stopPropagation();
        menu.remove();
        const newName = prompt("Введите новое имя коллекции:", collName);
        if (!newName || !newName.trim() || newName.trim() === collName) return;
        
        try {
            await updateDoc(doc(db, 'users', currentUid, 'collections', collId), {
                name: newName.trim()
            });
            // Update title dynamically if we are currently in that collection
            if (currentFolder === `coll_${collId}`) {
                const titleEl = document.getElementById('currentFolderTitle');
                if (titleEl) titleEl.innerText = newName.trim();
            }
        } catch(err) {
            console.error("Rename err", err);
        }
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
function showCustomConfirm(title, message, actionBtnText, onConfirmCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
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
    addBookmarkBtn.addEventListener('click', async () => {
        if (!currentUid) {
            if (typeof window.openAuthModal === 'function') window.openAuthModal(profileTrigger);
            return;
        }

        let url = prompt("Введите URL ссылки:");
        if (!url) return;
        url = url.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        let title = prompt("Название закладки (необязательно):", "");
        if (title !== null) title = title.trim();

        let currentCollId = null;
        if (currentFolder.startsWith('coll_')) {
            currentCollId = currentFolder.replace('coll_', '');
        }

        try {
            await addDoc(collection(db, 'users', currentUid, 'bookmarks'), {
                title: title || url,
                url,
                collectionId: currentCollId,
                createdAt: serverTimestamp()
            });
        } catch (e) {
            console.error('Error adding bookmark:', e);
            alert('Ошибка добавления закладки.');
        }
    });
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

// Global Initialization
document.addEventListener('DOMContentLoaded', () => {
    initSidebarResizer();
    initMobileMenu();

    // Sidebar static links interactivity
    document.querySelectorAll('.sidebar-menu > a[data-folder], .sidebar-menu > div > a[data-folder]').forEach(item => {
        item.addEventListener('click', (e) => {
            // Ignore dynamic custom collections which live in nested container handle themselves
            if (item.parentElement.id === 'custom-collections-container') return;

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
