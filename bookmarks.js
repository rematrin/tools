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

let selectionMode = false;
let selectedBookmarks = new Set();

const container = document.getElementById('bookmarksContainer');
const searchInput = document.getElementById('bookmarkSearch');
const addBookmarkBtn = document.getElementById('addBookmarkBtn');
const countAllEl = document.getElementById('count-all');
const countTrashEl = document.getElementById('count-trash');
const trashBanner = document.getElementById('trash-banner');
const emptyTrashLink = document.getElementById('empty-trash-link');

let allCollections = [];
let unsubscribeCollections = null;
let bookmarksSortable = null;
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

        const faviconUrl = item.iconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        
        const isInTrash = !!item.inTrash;

        let actionsHtml = '';
        if (isInTrash) {
            actionsHtml = `
                <button class="btn-action-round btn-restore-bookmark" style="display:none;"></button>
                <button class="btn-action-round btn-delete-permanently" style="display:none;"></button>
                <button class="btn-action-round bookmark-dots-btn" title="Действия">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                </button>
            `;
        } else {
            actionsHtml = `
                <button class="btn-action-round btn-rename-bookmark" style="display:none;"></button>
                <button class="btn-action-round btn-move-to-trash" style="display:none;"></button>
                <button class="btn-action-round bookmark-dots-btn" title="Действия">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                </button>
            `;
        }

        const isDraggable = currentFolder !== 'all' && currentFolder !== 'trash' && !selectionMode;
        const dragHandleHtml = isDraggable ? `
            <div class="drag-handle" title="Перетащить">
                <svg width="10" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
            </div>
        ` : '';

        row.innerHTML = `
            ${dragHandleHtml}
            ${selectionMode ? `
            <div style="margin-right: 12px; display:flex; align-items:center;">
                <input type="checkbox" class="bookmark-select-checkbox" style="width:16px; height:16px; cursor:pointer;" ${selectedBookmarks.has(item.id) ? 'checked' : ''}>
            </div>
            ` : ''}
            <div class="bookmark-left" style="${selectionMode ? 'cursor: default;' : ''}">
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
                ${selectionMode ? '' : actionsHtml}
            </div>
        `;

        // Handle events
        const bookmarkLeft = row.querySelector('.bookmark-left');
        
        bookmarkLeft.addEventListener('click', (e) => {
            if (selectionMode) {
                e.preventDefault();
                const chk = row.querySelector('.bookmark-select-checkbox');
                if (chk) {
                    chk.checked = !chk.checked;
                    chk.dispatchEvent(new Event('change'));
                }
                return;
            }
            window.open(item.url, '_blank');
        });

        bookmarkLeft.addEventListener('auxclick', (e) => {
            if (e.button === 1 && !selectionMode) { // Middle click
                e.preventDefault();
                window.open(item.url, '_blank');
            }
        });

        const chk = row.querySelector('.bookmark-select-checkbox');
        if (chk) {
            chk.addEventListener('change', (e) => {
                if (e.target.checked) selectedBookmarks.add(item.id);
                else selectedBookmarks.delete(item.id);
                if (typeof updateSelectionTopBar === 'function') updateSelectionTopBar();
            });
        }

        const dotsBtn = row.querySelector('.bookmark-dots-btn');
        if (dotsBtn) {
            dotsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showBookmarkContextMenu(e, item, row);
            });
        }

        // Right click context menu for bookmark
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showBookmarkContextMenu(e, item, row);
        });

        // Inline Rename for single bookmark link
        const renameBtn = row.querySelector('.btn-rename-bookmark');
        if (renameBtn) {
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.openEditPanel) {
                    window.openEditPanel(item);
                }
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
            deletePermBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUid) return;
                
                showCustomConfirm(
                    "Подтвердите удаление",
                    "Удалить эту закладку НАВСЕГДА? Это действие необратимо.",
                    "Удалить навсегда",
                    async () => {
                        try {
                            await deleteDoc(doc(db, 'users', currentUid, 'bookmarks', item.id));
                        } catch (err) {
                            console.error('Delete failed', err);
                        }
                    }
                );
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
    
    // Update folder large icon dynamically based on the active folder/collection
    const largeIconSpan = document.querySelector('.folder-large-icon');
    if (largeIconSpan) {
        if (currentFolder === 'all') {
            largeIconSpan.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                </svg>
            `;
        } else if (currentFolder === 'trash') {
            largeIconSpan.innerHTML = `
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
        } else if (currentFolder.startsWith('coll_')) {
            const targetCollId = currentFolder.replace('coll_', '');
            const coll = allCollections.find(c => c.id === targetCollId);
            if (coll && coll.iconUrl) {
                largeIconSpan.innerHTML = `<img src="${coll.iconUrl}" style="width: 22px; height: 22px; object-fit: contain; border-radius: 4px;">`;
            } else {
                largeIconSpan.innerHTML = `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                `;
            }
        }
    }

    // Toggle trash notice banner
    if (trashBanner) {
        trashBanner.style.display = currentFolder === 'trash' ? 'flex' : 'none';
    }

    // Toggle addBookmarkBtn, mainActionsBtn, and drag-and-drop
    const mainActionsBtn = document.getElementById('main-more-actions-btn');
    const isSpecialFolder = currentFolder === 'all' || currentFolder === 'trash';
    
    if (addBookmarkBtn) {
        addBookmarkBtn.style.display = isSpecialFolder ? 'none' : 'flex';
    }
    if (mainActionsBtn) {
        mainActionsBtn.style.display = isSpecialFolder ? 'none' : 'flex';
    }
    if (bookmarksSortable) {
        bookmarksSortable.option("disabled", isSpecialFolder);
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
        performSearchAndFilter(); // dynamically updates the main header icon and lists!
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
        
        const iconHtml = coll.iconUrl ? 
            `<img src="${coll.iconUrl}" class="menu-icon-img" style="width: 16px; height: 16px; object-fit: contain; border-radius: 4px;">` :
            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>`;

        a.innerHTML = `
            <div class="menu-item-left">
                <div class="drag-handle" title="Перетащить">
                    <svg width="10" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>
                </div>
                <span class="menu-icon">
                    ${iconHtml}
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

        // Open Context Menu on right click
        a.addEventListener('contextmenu', (e) => {
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
            if (currentFolderTitle) {
                currentFolderTitle.innerText = coll.name;
                document.title = coll.name;
            }
            
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
        <div class="ctx-item" id="ctx-change-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
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
            showCustomAlert('Пустая коллекция', 'В этой коллекции пока нет закладок.');
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

    const changeIconBtn = menu.querySelector('#ctx-change-icon');
    if (changeIconBtn) {
        changeIconBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            menu.remove();
            showCollectionIconModal(collId, collName);
        });
    }

    // Prevent closing when clicking inside items that are purely disabled
    menu.addEventListener('click', (evt) => evt.stopPropagation());
}

function showCollectionIconModal(collId, collName) {
    const coll = allCollections.find(c => c.id === collId);
    const currentIconUrl = coll ? coll.iconUrl : null;

    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';

    overlay.innerHTML = `
        <div class="confirm-box" style="width: 360px; padding: 24px;">
            <div class="confirm-title" style="font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Иконка коллекции
            </div>
            
            <div class="confirm-message" style="margin-bottom: 16px; font-size: 13px; opacity: 0.85; line-height: 1.4;">
                Загрузите изображение, вставьте из буфера обмена (Ctrl + V) или перетащите файл в область ниже.
            </div>

            <!-- Drag and Drop / Paste Area -->
            <div id="icon-dropzone" class="icon-dropzone">
                <div class="dropzone-preview" style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
                    ${currentIconUrl ? 
                        `<img src="${currentIconUrl}" style="width: 48px; height: 48px; object-fit: contain; border-radius: 8px;">` :
                        `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>`
                    }
                </div>
                <div class="dropzone-text" style="font-size: 13px; font-weight: 500;">
                    Кликните для выбора файла или перетащите его сюда
                </div>
            </div>

            <!-- Upload Hidden Input -->
            <input type="file" id="modalIconFileInput" accept="image/*" style="display: none;">

            <!-- Actions -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <button class="confirm-btn-primary" id="btn-select-file" style="margin: 0; padding: 10px; border-radius: 8px;">Выбрать файл...</button>
                
                ${currentIconUrl ? 
                    `<button class="confirm-btn-secondary" id="btn-delete-icon" style="margin: 0; padding: 10px; border-radius: 8px; color: #ff5f56; border-color: rgba(255, 95, 86, 0.2);">Удалить иконку</button>` : 
                    ''
                }
                
                <button class="confirm-btn-secondary" id="btn-close-icon-modal" style="margin: 0; padding: 10px; border-radius: 8px;">Отмена</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const dropzone = overlay.querySelector('#icon-dropzone');
    const fileInput = overlay.querySelector('#modalIconFileInput');
    const selectFileBtn = overlay.querySelector('#btn-select-file');
    const deleteIconBtn = overlay.querySelector('#btn-delete-icon');
    const closeBtn = overlay.querySelector('#btn-close-icon-modal');

    // 1. Paste handler (Ctrl + V)
    function handlePaste(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf("image") === 0) {
                const file = item.getAsFile();
                processAndUpload(file);
                break;
            }
        }
    }
    document.addEventListener('paste', handlePaste);

    // 2. Drag & Drop handler
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#1070e5';
        dropzone.style.background = 'rgba(16, 112, 229, 0.05)';
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = '';
        dropzone.style.background = '';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '';
        dropzone.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processAndUpload(file);
        }
    });

    // 3. Selection
    dropzone.addEventListener('click', () => fileInput.click());
    selectFileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processAndUpload(file);
    });

    // 4. Delete Icon
    if (deleteIconBtn) {
        deleteIconBtn.addEventListener('click', async () => {
            overlay.remove();
            document.removeEventListener('paste', handlePaste);
            try {
                // Save null to remove the custom icon in Firestore
                await updateDoc(doc(db, 'users', currentUid, 'collections', collId), {
                    iconUrl: null
                });

                // Update folder large icon dynamically if active
                if (currentFolder === `coll_${collId}`) {
                    const largeIconSpan = document.querySelector('.folder-large-icon');
                    if (largeIconSpan) {
                        largeIconSpan.innerHTML = `
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                        `;
                    }
                }
            } catch (err) {
                console.error("Error removing icon:", err);
                showCustomAlert("Ошибка", "Не удалось удалить иконку.");
            }
        });
    }

    // 5. Cancel / Close
    closeBtn.addEventListener('click', () => {
        overlay.remove();
        document.removeEventListener('paste', handlePaste);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
            document.removeEventListener('paste', handlePaste);
        }
    });

    // Core Processing & Upload logic inside the Modal
    async function processAndUpload(file) {
        // Change text/preview to Loading
        dropzone.style.pointerEvents = 'none';
        selectFileBtn.style.pointerEvents = 'none';
        selectFileBtn.innerText = 'Загрузка...';
        if (deleteIconBtn) deleteIconBtn.style.display = 'none';
        
        dropzone.querySelector('.dropzone-preview').innerHTML = `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="32" stroke-dashoffset="8" fill="none" opacity="0.3"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
            </svg>
        `;
        dropzone.querySelector('.dropzone-text').innerText = 'Загрузка изображения...';

        const reader = new FileReader();
        reader.onload = function(evt) {
            const img = new Image();
            img.onload = function() {
                let width = img.width;
                let height = img.height;
                const maxSide = 128;

                if (width > height) {
                    if (width > maxSide) {
                        height = Math.round(height * (maxSide / width));
                        width = maxSide;
                    }
                } else {
                    if (height > maxSide) {
                        width = Math.round(width * (maxSide / height));
                        height = maxSide;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(async (blob) => {
                    const API_KEY = 'fbd88ce7045582e4c4176c67de93ceee';
                    const formData = new FormData();
                    formData.append('image', blob);

                    try {
                        const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
                            method: 'POST',
                            body: formData
                        });
                        const data = await response.json();
                        if (data && data.data && data.data.url) {
                            const url = data.data.url;
                            // Save in Firestore
                            await updateDoc(doc(db, 'users', currentUid, 'collections', collId), {
                                iconUrl: url
                            });

                            // Update folder large icon dynamically if active
                            if (currentFolder === `coll_${collId}`) {
                                const largeIconSpan = document.querySelector('.folder-large-icon');
                                if (largeIconSpan) {
                                    largeIconSpan.innerHTML = `<img src="${url}" style="width: 22px; height: 22px; object-fit: contain; border-radius: 4px;">`;
                                }
                            }
                            
                            // Close modal successfully
                            overlay.remove();
                            document.removeEventListener('paste', handlePaste);
                        } else {
                            throw new Error('Upload failed');
                        }
                    } catch (err) {
                        console.error('Error uploading collection icon:', err);
                        showCustomAlert('Ошибка', 'Не удалось загрузить иконку. Попробуйте еще раз.');
                        
                        // Reset Dropzone UI
                        dropzone.style.pointerEvents = 'auto';
                        selectFileBtn.style.pointerEvents = 'auto';
                        selectFileBtn.innerText = 'Выбрать файл...';
                        if (deleteIconBtn) deleteIconBtn.style.display = 'block';
                        
                        dropzone.querySelector('.dropzone-preview').innerHTML = currentIconUrl ? 
                            `<img src="${currentIconUrl}" style="width: 48px; height: 48px; object-fit: contain; border-radius: 8px;">` :
                            `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>`;
                        dropzone.querySelector('.dropzone-text').innerText = 'Кликните для выбора файла или перетащите его сюда';
                    }
                }, file.type || 'image/png');
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Helper: Display the context menu for bookmarks
function showBookmarkContextMenu(e, item, row) {
    // Close any existing menu
    if (activeContextMenu) activeContextMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    
    // Construct menu items
    if (item.inTrash) {
        menu.innerHTML = `
            <div class="ctx-item" id="ctx-restore-bookmark" style="color: #28a745;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"></path><path d="M3 13a9 9 0 1 0 3-7.7L3 8"></path></svg>
                Восстановить
            </div>
            <div class="ctx-item danger" id="ctx-delete-permanently">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Удалить навсегда
            </div>
        `;
    } else {
        menu.innerHTML = `
            <div class="ctx-item" id="ctx-open-tab">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                Открыть в новой вкладке
            </div>
            <div class="ctx-item" id="ctx-edit-bookmark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                Редактировать
            </div>
            <div class="ctx-item danger" id="ctx-delete-bookmark">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Удалить
            </div>
        `;
    }

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

    if (item.inTrash) {
        menu.querySelector('#ctx-restore-bookmark').addEventListener('click', (evt) => {
            evt.stopPropagation();
            menu.remove();
            const restoreBtn = row.querySelector('.btn-restore-bookmark');
            if (restoreBtn) restoreBtn.click();
        });

        menu.querySelector('#ctx-delete-permanently').addEventListener('click', (evt) => {
            evt.stopPropagation();
            menu.remove();
            const deletePermBtn = row.querySelector('.btn-delete-permanently');
            if (deletePermBtn) deletePermBtn.click();
        });
    } else {
        // 1. Open in new tab
        menu.querySelector('#ctx-open-tab').addEventListener('click', (evt) => {
            evt.stopPropagation();
            menu.remove();
            window.open(item.url, '_blank');
        });

        // 2. Edit
        menu.querySelector('#ctx-edit-bookmark').addEventListener('click', (evt) => {
            evt.stopPropagation();
            menu.remove();
            const renameBtn = row.querySelector('.btn-rename-bookmark');
            if (renameBtn) renameBtn.click();
        });

        // 3. Delete
        menu.querySelector('#ctx-delete-bookmark').addEventListener('click', (evt) => {
            evt.stopPropagation();
            menu.remove();
            const moveTrashBtn = row.querySelector('.btn-move-to-trash');
            if (moveTrashBtn) moveTrashBtn.click();
        });
    }

    // Prevent closing when clicking inside items that are purely disabled
    menu.addEventListener('click', (evt) => evt.stopPropagation());
}

// Helper: macOS style custom confirm modal with generalized inputs
// Modal window to add a new Bookmark with custom logic
// Modal window to add a new Bookmark with custom logic
function showAddBookmarkModal() {
    const popover = document.getElementById('addBookmarkPopover');
    if (!popover) return;
    
    // Toggle off if already open
    if (popover.classList.contains('active')) {
        popover.classList.remove('active');
        return;
    }
    
    popover.classList.add('active');
    
    const urlInp = document.getElementById('popoverBookmarkUrl');
    const titleInp = document.getElementById('popoverBookmarkTitle');
    const submitBtn = document.getElementById('popoverSubmitBtn');
    const cancelBtn = document.getElementById('popoverCancelBtn');
    
    // Reset values
    urlInp.value = '';
    titleInp.value = '';
    urlInp.focus();

    let manualTitleEdit = false;
    let titleFetchController = null;

    titleInp.oninput = () => {
        manualTitleEdit = true;
    };

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
    urlInp.oninput = () => {
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
    };

    async function saveAndClose() {
        let url = urlInp.value.trim();
        if (!url) return;
        
        // Enforce protocol
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        
        let title = titleInp.value.trim() || url;
        
        popover.classList.remove('active');

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
        } catch (error) {
            console.error("Error adding bookmark:", error);
            showCustomAlert("Ошибка", "Ошибка добавления закладки.");
        }
    }

    submitBtn.onclick = saveAndClose;
    cancelBtn.onclick = () => popover.classList.remove('active');
    
    const handleKeydown = (ev) => {
        if (ev.key === 'Enter') saveAndClose();
        if (ev.key === 'Escape') popover.classList.remove('active');
    };
    
    urlInp.onkeydown = handleKeydown;
    titleInp.onkeydown = handleKeydown;
    
    // Close when clicking outside of the popover
    const outsideClickListener = (e) => {
        if (!popover.contains(e.target) && e.target !== document.getElementById('addBookmarkBtn') && !document.getElementById('addBookmarkBtn').contains(e.target)) {
            popover.classList.remove('active');
            document.removeEventListener('click', outsideClickListener);
        }
    };
    
    // Slight delay so the click that opened the popover doesn't immediately close it
    setTimeout(() => {
        document.addEventListener('click', outsideClickListener);
    }, 10);
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

function showCustomAlert(title, message, btnText = "ОК") {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                ${title}
            </div>
            <div class="confirm-message">
                ${message}
            </div>
            <button class="confirm-btn-primary" id="btn-ok-alert" style="width: 100%; margin-top: 10px;">${btnText}</button>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btn-ok-alert').addEventListener('click', () => {
        overlay.remove();
    });
    
    overlay.addEventListener('click', (e) => {
        if(e.target === overlay) overlay.remove();
    });
}

function showCollectionSelectModal(onSelectCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';

    let html = `
        <div class="confirm-box" style="width: 340px; max-height: 85vh; display: flex; flex-direction: column; padding: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border);">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text);">Выберите коллекцию</h3>
                <button class="btn-action-round" id="close-col-modal" style="margin-right: -8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div style="overflow-y: auto; padding: 8px 0; display: flex; flex-direction: column; flex: 1;">
    `;
    if (allCollections.length > 0) {
        html += `<div style="padding: 12px 20px 8px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">Коллекции</div>`;
        allCollections.forEach(coll => {
            const count = allBookmarks.filter(b => !b.inTrash && b.collectionId === coll.id).length;
            const collIconHtml = coll.iconUrl ?
                `<img src="${coll.iconUrl}" style="width: 16px; height: 16px; object-fit: contain; border-radius: 4px;">` :
                `<span style="font-size: 16px;">📁</span>`;

            html += `
                <div class="col-modal-item" data-id="${coll.id}">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${collIconHtml}
                        <span>${coll.name}</span>
                    </div>
                    <span style="color: var(--text-secondary); font-size: 12px;">${count}</span>
                </div>
            `;
        });
    }

    html += `
            </div>
        </div>
    `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    overlay.querySelector('#close-col-modal').addEventListener('click', () => {
        overlay.remove();
    });

    overlay.querySelectorAll('.col-modal-item').forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-id') === 'all' ? null : item.getAttribute('data-id');
            overlay.remove();
            if (onSelectCallback) onSelectCallback(targetId);
        });
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
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
        <div class="ctx-item" id="ctx-select-mode">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
            Выбрать
        </div>
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

    const selectBtn = menu.querySelector('#ctx-select-mode');
    if (selectBtn) {
        selectBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            menu.remove();
            selectionMode = true;
            selectedBookmarks.clear();
            performSearchAndFilter();
            if (typeof updateSelectionTopBar === 'function') updateSelectionTopBar();
        });
    }

    menu.querySelector('#ctx-import-csv').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        triggerCsvImport();
    });

    menu.addEventListener('click', (evt) => evt.stopPropagation());
}

function updateSelectionTopBar() {
    const normalRow = document.getElementById('normal-title-row');
    const selectionRow = document.getElementById('selection-title-row');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const countText = document.getElementById('selectionCountText');

    if (!selectionMode) {
        if (normalRow) normalRow.style.display = 'flex';
        if (selectionRow) selectionRow.style.display = 'none';
        return;
    }

    if (normalRow) normalRow.style.display = 'none';
    if (selectionRow) selectionRow.style.display = 'flex';
    
    const visibleRows = container.querySelectorAll('.bookmark-row');
    if (countText) {
        countText.innerText = `${selectedBookmarks.size} выбрано`;
    }
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = visibleRows.length > 0 && selectedBookmarks.size === visibleRows.length;
    }
}

function triggerCsvImport(targetCollId = undefined) {
    if (!currentUid) {
        if (typeof window.openAuthModal === 'function') window.openAuthModal(profileTrigger);
        return;
    }

    if (currentFolder === 'trash' && targetCollId === undefined) {
        showCustomAlert('Внимание', 'Импорт невозможен в корзину. Перейдите в другую папку или коллекцию.');
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
        showCustomAlert('Ошибка', 'Выбранный файл пуст или содержит недостаточно данных.');
        return;
    }

    const headers = lines[0].map(h => h.toLowerCase().trim());
    const titleIndex = headers.indexOf('title');
    const urlIndex = headers.indexOf('url');

    if (titleIndex === -1 || urlIndex === -1) {
        showCustomAlert('Ошибка', 'Не удалось найти обязательные колонки "title" и "url" в CSV файле.');
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
        showCustomAlert('Внимание', 'В файле не найдено корректных ссылок для импорта.');
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
        
        showCustomAlert('Готово', `Успешно импортировано ${successCount} ${getNoun(successCount, 'закладка', 'закладки', 'закладок')}.`);
    } catch (err) {
        console.error('CSV Import failed', err);
        showCustomAlert('Ошибка', `Произошла ошибка при импорте. Удалось импортировать: ${successCount}`);
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
        
        if (!currentUid) return;

        showCustomConfirm(
            "Очистка корзины",
            `Вы уверены, что хотите навсегда удалить ${trashItems.length} ${getNoun(trashItems.length, 'объект', 'объекта', 'объектов')}?`,
            "Очистить",
            async () => {
                try {
                    await Promise.all(
                        trashItems.map(item => deleteDoc(doc(db, 'users', currentUid, 'bookmarks', item.id)))
                    );
                } catch (err) {
                    console.error("Empty trash error", err);
                    showCustomAlert("Ошибка", "Ошибка при очистке корзины.");
                }
            }
        );
    });
}

// Create custom collection
if (createCollectionBtn) {
    createCollectionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUid) {
            if (typeof window.openAuthModal === 'function') window.openAuthModal(profileTrigger);
            return;
        }
        
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => el.classList.remove('highlighted', 'active'));

        const a = document.createElement('a');
        a.href = '#';
        a.className = `menu-item highlighted`;
        
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
                <span style="flex: 1; min-width: 0;"><input type="text" class="inline-edit-input" placeholder="Новая коллекция"></span>
            </div>
            <div class="menu-item-right">
                <span class="menu-count">0</span>
            </div>
        `;

        collectionsContainer.appendChild(a);
        
        const input = a.querySelector('input');
        input.focus();
        
        let finished = false;
        async function saveCollection() {
            if (finished) return;
            finished = true;
            const val = input.value.trim();
            if (val) {
                try {
                    await addDoc(collection(db, 'users', currentUid, 'collections'), {
                        name: val,
                        createdAt: serverTimestamp()
                    });
                } catch (err) {
                    console.error("Failed to create collection", err);
                    a.remove();
                }
            } else {
                a.remove();
            }
        }

        input.addEventListener('blur', saveCollection);
        input.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                input.blur();
            } else if (ev.key === 'Escape') {
                finished = true;
                a.remove();
            }
        });
        input.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
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
        bookmarksSortable = Sortable.create(bookmarksListEl, {
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
                if (currentFolder === 'all' && searchInput && searchInput.value.trim() !== '') {
                     showCustomAlert("Внимание", "Невозможно переупорядочить список в режиме поиска.");
                     performSearchAndFilter();
                     return false; 
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
            if (currentFolderTitle) {
                currentFolderTitle.innerText = folderTitle;
                document.title = folderTitle;
            }
            
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

    // Mass Action Listeners
    const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
    if (cancelSelectionBtn) {
        cancelSelectionBtn.addEventListener('click', () => {
            selectionMode = false;
            selectedBookmarks.clear();
            performSearchAndFilter();
            updateSelectionTopBar();
        });
    }

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            selectedBookmarks.clear();
            if (isChecked) {
                const visibleRows = container.querySelectorAll('.bookmark-row');
                visibleRows.forEach(row => {
                    const bId = row.getAttribute('data-id');
                    if (bId) selectedBookmarks.add(bId);
                });
            }
            performSearchAndFilter(); // Re-render to update checkboxes
            updateSelectionTopBar();
        });
    }

    const massDeleteBtn = document.getElementById('massDeleteBtn');
    if (massDeleteBtn) {
        massDeleteBtn.addEventListener('click', async () => {
            if (selectedBookmarks.size === 0 || !currentUid) return;
            
            if (currentFolder === 'trash') {
                showCustomConfirm(
                    "Удаление навсегда",
                    `Удалить ${selectedBookmarks.size} закладок НАВСЕГДА? Это действие необратимо.`,
                    "Удалить",
                    async () => {
                        const batch = writeBatch(db);
                        selectedBookmarks.forEach(bId => {
                            const docRef = doc(db, 'users', currentUid, 'bookmarks', bId);
                            batch.delete(docRef);
                        });
                        try {
                            await batch.commit();
                            selectionMode = false;
                            selectedBookmarks.clear();
                            performSearchAndFilter();
                            updateSelectionTopBar();
                        } catch (err) {
                            console.error('Mass delete failed', err);
                        }
                    }
                );
            } else {
                showCustomConfirm(
                    "Вы уверены?",
                    `Вы действительно хотите переместить в корзину ${selectedBookmarks.size} закладок?`,
                    "Переместить в корзину",
                    async () => {
                        const batch = writeBatch(db);
                        selectedBookmarks.forEach(bId => {
                            const docRef = doc(db, 'users', currentUid, 'bookmarks', bId);
                            batch.update(docRef, { 
                                inTrash: true,
                                deletedAt: serverTimestamp()
                            });
                        });
                        try {
                            await batch.commit();
                            selectionMode = false;
                            selectedBookmarks.clear();
                            performSearchAndFilter();
                            updateSelectionTopBar();
                        } catch (err) {
                            console.error('Mass move to trash failed', err);
                        }
                    }
                );
            }
        });
    }

    const massMoveBtn = document.getElementById('massMoveBtn');
    if (massMoveBtn) {
        massMoveBtn.addEventListener('click', () => {
            if (selectedBookmarks.size === 0 || !currentUid) return;
            
            showCollectionSelectModal(async (targetCollId) => {
                const batch = writeBatch(db);
                selectedBookmarks.forEach(bId => {
                    const docRef = doc(db, 'users', currentUid, 'bookmarks', bId);
                    batch.update(docRef, { collectionId: targetCollId });
                });
                
                try {
                    await batch.commit();
                    selectionMode = false;
                    selectedBookmarks.clear();
                    performSearchAndFilter();
                    updateSelectionTopBar();
                } catch (err) {
                    console.error('Mass move failed', err);
                }
            });
        });
    }

    // --- Edit Panel Logic ---
    let currentEditingBookmarkId = null;

    window.openEditPanel = function(item) {
        const editPanel = document.getElementById('editPanel');
        const bookmarkApp = document.querySelector('.bookmark-app');
        
        if (!editPanel || !bookmarkApp) return;

        currentEditingBookmarkId = item.id;
        
        bookmarkApp.classList.add('editing-mode');
        editPanel.classList.add('active');
        
        let domain = '';
        try { domain = new URL(item.url).hostname; } catch(e) {}
        const faviconUrl = item.iconUrl || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : '');
        
        const favImg = document.getElementById('editFavicon');
        if (favImg) {
            favImg.src = faviconUrl;
            favImg.style.display = faviconUrl ? 'block' : 'none';
        }
        
        document.getElementById('editTitleInput').value = item.title || item.url || '';
        document.getElementById('editUrlInput').value = item.url || '';
        
        const collNameSpan = document.getElementById('editCollectionName');
        if (item.collectionId) {
            const coll = allCollections.find(c => c.id === item.collectionId);
            if (coll) {
                const iconPrefix = coll.iconUrl ? 
                    `<img src="${coll.iconUrl}" style="width: 14px; height: 14px; object-fit: contain; border-radius: 2px; vertical-align: middle; margin-right: 6px;">` :
                    `<span style="margin-right: 6px; vertical-align: middle;">📁</span>`;
                collNameSpan.innerHTML = `${iconPrefix}<span style="vertical-align: middle;">${coll.name}</span>`;
            } else {
                collNameSpan.innerHTML = 'Выберите коллекцию';
            }
        } else {
            collNameSpan.innerHTML = 'Выберите коллекцию';
        }

        // Auto-resize URL textarea
        setTimeout(() => {
            const urlArea = document.getElementById('editUrlInput');
            if (urlArea) {
                urlArea.style.height = 'auto';
                urlArea.style.height = urlArea.scrollHeight + 'px';
            }
        }, 0);
    };

    const closeEditPanelBtn = document.getElementById('closeEditPanelBtn');
    if (closeEditPanelBtn) {
        closeEditPanelBtn.addEventListener('click', () => {
            const bookmarkApp = document.querySelector('.bookmark-app');
            const editPanel = document.getElementById('editPanel');
            if (bookmarkApp) bookmarkApp.classList.remove('editing-mode');
            if (editPanel) editPanel.classList.remove('active');
            currentEditingBookmarkId = null;
        });
    }
    


    // Auto-save logic
    async function saveEditField(field, value) {
        if (!currentEditingBookmarkId || !currentUid) return;
        try {
            await updateDoc(doc(db, 'users', currentUid, 'bookmarks', currentEditingBookmarkId), {
                [field]: value
            });
        } catch (err) {
            console.error(`Failed to save ${field}:`, err);
        }
    }

    const editTitleInput = document.getElementById('editTitleInput');
    if (editTitleInput) {
        editTitleInput.addEventListener('blur', () => saveEditField('title', editTitleInput.value.trim()));
    }

    const editUrlInput = document.getElementById('editUrlInput');
    if (editUrlInput) {
        editUrlInput.addEventListener('blur', () => saveEditField('url', editUrlInput.value.trim()));
        editUrlInput.addEventListener('input', () => {
            editUrlInput.style.height = 'auto';
            editUrlInput.style.height = editUrlInput.scrollHeight + 'px';
        });
    }

    // Icon Upload Logic
    const editChangeIconBtn = document.getElementById('editChangeIconBtn');
    const editIconFileInput = document.getElementById('editIconFileInput');
    
    if (editChangeIconBtn && editIconFileInput) {
        editChangeIconBtn.addEventListener('click', () => {
            if (!currentEditingBookmarkId) return;
            editIconFileInput.click();
        });
        
        editIconFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            editChangeIconBtn.innerText = 'Загрузка...';
            editChangeIconBtn.style.pointerEvents = 'none';
            
            const reader = new FileReader();
            reader.onload = function(evt) {
                const img = new Image();
                img.onload = function() {
                    let width = img.width;
                    let height = img.height;
                    const maxSide = 128;
                    
                    if (width > height) {
                        if (width > maxSide) {
                            height = Math.round(height * (maxSide / width));
                            width = maxSide;
                        }
                    } else {
                        if (height > maxSide) {
                            width = Math.round(width * (maxSide / height));
                            height = maxSide;
                        }
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    canvas.toBlob(async (blob) => {
                        const API_KEY = 'fbd88ce7045582e4c4176c67de93ceee';
                        const formData = new FormData();
                        formData.append('image', blob);
                        
                        try {
                            const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
                                method: 'POST',
                                body: formData
                            });
                            const data = await response.json();
                            if (data && data.data && data.data.url) {
                                const url = data.data.url;
                                await saveEditField('iconUrl', url);
                                document.getElementById('editFavicon').src = url;
                                performSearchAndFilter(); // refresh list
                            } else {
                                throw new Error('Upload failed');
                            }
                        } catch (err) {
                            console.error('Error uploading icon:', err);
                            showCustomAlert('Ошибка', 'Не удалось загрузить иконку. Попробуйте еще раз.');
                        } finally {
                            editChangeIconBtn.innerText = 'Изменить иконку';
                            editChangeIconBtn.style.pointerEvents = 'auto';
                            editIconFileInput.value = '';
                        }
                    }, file.type || 'image/png');
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Edit Panel Collection Button
    const editCollectionBtn = document.getElementById('editCollectionBtn');
    if (editCollectionBtn) {
        editCollectionBtn.addEventListener('click', () => {
            if (!currentEditingBookmarkId || !currentUid) return;
            showCollectionSelectModal(async (targetCollId) => {
                await saveEditField('collectionId', targetCollId);
                // Update UI visually
                const collNameSpan = document.getElementById('editCollectionName');
                if (targetCollId) {
                    const coll = allCollections.find(c => c.id === targetCollId);
                    if (coll) {
                        const iconPrefix = coll.iconUrl ? 
                            `<img src="${coll.iconUrl}" style="width: 14px; height: 14px; object-fit: contain; border-radius: 2px; vertical-align: middle; margin-right: 6px;">` :
                            `<span style="margin-right: 6px; vertical-align: middle;">📁</span>`;
                        collNameSpan.innerHTML = `${iconPrefix}<span style="vertical-align: middle;">${coll.name}</span>`;
                    } else {
                        collNameSpan.innerHTML = 'Выберите коллекцию';
                    }
                } else {
                    collNameSpan.innerHTML = 'Выберите коллекцию';
                }
            });
        });
    }

    const editDeleteBtn = document.getElementById('editDeleteBtn');
    if (editDeleteBtn) {
        editDeleteBtn.addEventListener('click', () => {
            if (!currentEditingBookmarkId || !currentUid) return;
            showCustomConfirm(
                "Удалить закладку?",
                "Вы действительно хотите переместить эту закладку в корзину?",
                "Переместить",
                async () => {
                    try {
                        await updateDoc(doc(db, 'users', currentUid, 'bookmarks', currentEditingBookmarkId), {
                            inTrash: true,
                            deletedAt: serverTimestamp()
                        });
                        // Close panel
                        closeEditPanelBtn.click();
                    } catch (err) {
                        console.error('Delete failed', err);
                    }
                }
            );
        });
    }

});
