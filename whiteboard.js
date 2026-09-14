// whiteboard.js - Логика интерактивной доски с Firebase Firestore и LocalStorage

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    onSnapshot,
    getDocs,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// === Глобальные переменные ===
let db = null;
let currentUid = null;
let activeBoardId = null; // Будет браться из URL
let elements = {}; // id -> elementData
let boardConfig = { width: 2400, height: 1600 };
let unsubscribeElements = null;
let unsubscribeBoard = null;
let unsubscribeBoardsList = null;

// Стеки для Отмены и Повтора (Undo / Redo)
let undoStack = [];
let redoStack = [];

// Состояние навигации (Pan & Zoom)
let zoom = 1.0;
let panX = 100;
let panY = 100;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;

// Состояние сессии рисования (iOS PencilKit style)
let isDrawing = false;
let localStrokes = []; // Временные штрихи: { color, toolType, baseWidth, opacity, points: [] }
let localRedoStrokes = []; // Буфер отмененных штрихов
let localDrawingTool = 'pencil'; // 'pencil', 'select', 'highlighter', 'pen', 'eraser'
let hoveredEraserStrokeIndices = new Set(); // Индексы штрихов, подсвеченных ластиком (в стиле Milanote)
let selectedLocalStrokeIndex = -1; // Индекс выделенного синей обводкой штриха (в стиле Milanote)


let toolSettings = {
    pencil: { width: 4, opacity: 1.0 },
    highlighter: { width: 18, opacity: 0.45 },
    pen: { width: 3, opacity: 1.0 },
    eraser: { width: 20, opacity: 1.0 }
};
let activeDrawingPoints = [];
let activeDrawingPathEl = null;

// Состояние редактирования/выделения
let activeTool = 'select'; // 'select', 'text', 'sticker', 'frame', 'link', 'image', 'draw', 'eraser'
let activeColor = '#111827';
let selectedElementIds = new Set(); // Поддержка множественного выделения
let editingElementId = null; // ID элемента, который сейчас редактируется (сразу после создания)
let editingDrawingId = null; // ID элемента рисунка, который редактируется повторно
let savedTextRange = null; // Сохраненное выделение текста для создания ссылок

// Временные данные для перетаскивания и ресайза
let dragStartInfo = null; // { type: 'element'|'resize'|'canvas-resize'|'selection-marquee', id, startX, startY, ... }

// DOM Элементы
const dashboardView = document.getElementById('dashboardView');
const boardActiveView = document.getElementById('boardActiveView');
const boardsGrid = document.getElementById('boardsGrid');
const btnCreateBoard = document.getElementById('btnCreateBoard');
const boardSortSelect = document.getElementById('boardSortSelect');

let loadedBoardsList = [];
let currentSortOption = localStorage.getItem('board_sort_option') || 'updatedDesc';


const boardViewport = document.getElementById('boardViewport');
const canvasHolder = document.getElementById('canvasHolder');
const boardCanvas = document.getElementById('boardCanvas');
const elementsLayer = document.getElementById('elementsLayer');
const drawingLayer = document.getElementById('drawingLayer');

const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnZoomReset = document.getElementById('btnZoomReset');
const zoomPercent = document.getElementById('zoomPercent');
const btnToggleGrid = document.getElementById('btnToggleGrid');
const boardTitleInput = document.getElementById('boardTitleInput');
const saveStatus = document.getElementById('saveStatus');

const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');

const tools = {
    select: document.getElementById('toolSelect'),
    text: document.getElementById('toolText'),
    link: document.getElementById('toolLink'),
    image: document.getElementById('toolImage'),
    board: document.getElementById('toolBoard'),
    column: document.getElementById('toolColumn'),
    draw: document.getElementById('toolDraw'),
    eraser: document.getElementById('toolEraser')
};

const urlInputModal = document.getElementById('urlInputModal');
const bookmarkUrlInput = document.getElementById('bookmarkUrlInput');
const btnUrlCancel = document.getElementById('btnUrlCancel');
const btnUrlConfirm = document.getElementById('btnUrlConfirm');
const imageFileInput = document.getElementById('imageFileInput');

// DOM Элементы панели режима рисования (iOS PencilKit Dock)
const drawingModePanel = document.getElementById('drawingModePanel');
const drawBtnPencil = document.getElementById('drawBtnPencil');
const drawBtnSelect = document.getElementById('drawBtnSelect');
const drawBtnHighlighter = document.getElementById('drawBtnHighlighter');

const drawBtnPen = document.getElementById('drawBtnPen');
const drawBtnEraser = document.getElementById('drawBtnEraser');

const dockBtnUndo = document.getElementById('dockBtnUndo');
const dockBtnRedo = document.getElementById('dockBtnRedo');

const dockToolSettingsBtn = document.getElementById('dockToolSettingsBtn');
const dockSizePreviewDot = document.getElementById('dockSizePreviewDot');
const dockSizeBtnLabel = document.getElementById('dockSizeBtnLabel');
const dockSettingsPopover = document.getElementById('dockSettingsPopover');
const dockSizeSlider = document.getElementById('dockSizeSlider');
const dockSizeValue = document.getElementById('dockSizeValue');
const dockOpacitySlider = document.getElementById('dockOpacitySlider');
const dockOpacityValue = document.getElementById('dockOpacityValue');

const dockCustomColorTrigger = document.getElementById('dockCustomColorTrigger');
const dockCustomColorInput = document.getElementById('dockCustomColorInput');

const btnDrawDiscard = document.getElementById('btnDrawDiscard');
const btnDrawSave = document.getElementById('btnDrawSave');

// === РОУТИНГ И ИНИЦИАЛИЗАЦИЯ ===

function initRouting() {
    const urlParams = new URLSearchParams(window.location.search);
    const boardId = urlParams.get('id');

    if (boardId) {
        activeBoardId = boardId;
        dashboardView.style.display = 'none';
        boardActiveView.style.display = 'block';
        
        if (currentUid) {
            setupFirebaseSyncForBoard();
        } else {
            setupOfflineModeForBoard();
        }
    } else {
        activeBoardId = null;
        boardActiveView.style.display = 'none';
        dashboardView.style.display = 'block';
        
        if (currentUid) {
            setupFirebaseSyncForDashboard();
        } else {
            setupOfflineModeForDashboard();
        }
    }
}

// Отслеживание входа пользователя
window.addEventListener('authChanged', (e) => {
    const user = e.detail.user;
    currentUid = user ? user.uid : null;
    db = window.db || getFirestore();
    initRouting();
});

// Отслеживание загрузки документа
setTimeout(() => {
    if (window.auth && window.auth.currentUser) {
        currentUid = window.auth.currentUser.uid;
        db = window.db || getFirestore();
    }
    initRouting();
}, 800);

// === УПРАВЛЕНИЕ СТЕКОМ ОТМЕНЫ И ПОВТОРА (UNDO / REDO) ===

function updateUndoRedoButtons() {
    if (btnUndo) btnUndo.disabled = (undoStack.length === 0);
    if (btnRedo) btnRedo.disabled = (redoStack.length === 0);
}

function saveUndoState() {
    redoStack = [];
    
    const elementsClone = JSON.parse(JSON.stringify(elements));
    const configClone = JSON.parse(JSON.stringify(boardConfig));
    
    undoStack.push({
        elements: elementsClone,
        boardConfig: configClone
    });
    
    if (undoStack.length > 35) {
        undoStack.shift();
    }
    
    updateUndoRedoButtons();
}

function applyState(state, message) {
    elements = state.elements;
    boardConfig = state.boardConfig;

    showSaveStatus(message);

    if (currentUid && db) {
        const elementsCollRef = collection(db, "users", currentUid, "whiteboards", activeBoardId, "elements");
        getDocs(elementsCollRef).then(snap => {
            const batch = writeBatch(db);
            
            snap.forEach(docSnap => {
                batch.delete(docSnap.ref);
            });
            
            Object.values(elements).forEach(el => {
                const elDocRef = doc(db, "users", currentUid, "whiteboards", activeBoardId, "elements", el.id);
                batch.set(elDocRef, el);
            });

            const boardDocRef = doc(db, "users", currentUid, "whiteboards", activeBoardId);
            batch.set(boardDocRef, {
                width: boardConfig.width,
                height: boardConfig.height,
                title: boardTitleInput.value,
                updatedAt: Date.now()
            }, { merge: true });

            batch.commit().then(() => {
                showSaveStatus("Сохранено");
                renderElements();
                updateCanvasSize();
                updateUndoRedoButtons();
            });
        });
    } else {
        localStorage.setItem(`board_elements_${activeBoardId}`, JSON.stringify(elements));
        localStorage.setItem(`board_config_${activeBoardId}`, JSON.stringify({
            width: boardConfig.width,
            height: boardConfig.height,
            title: boardTitleInput.value
        }));
        
        showSaveStatus("Восстановлено локально");
        renderElements();
        updateCanvasSize();
        updateUndoRedoButtons();
    }
}

function undo() {
    if (undoStack.length === 0) return;

    const elementsClone = JSON.parse(JSON.stringify(elements));
    const configClone = JSON.parse(JSON.stringify(boardConfig));
    redoStack.push({
        elements: elementsClone,
        boardConfig: configClone
    });

    const prevState = undoStack.pop();
    applyState(prevState, "Отмена действия...");
}

function redo() {
    if (redoStack.length === 0) return;

    const elementsClone = JSON.parse(JSON.stringify(elements));
    const configClone = JSON.parse(JSON.stringify(boardConfig));
    undoStack.push({
        elements: elementsClone,
        boardConfig: configClone
    });

    const nextState = redoStack.pop();
    applyState(nextState, "Повтор действия...");
}

// === ЛОГИКА ДЛЯ ДАШБОРДА ===

function setupFirebaseSyncForDashboard() {
    if (unsubscribeBoardsList) unsubscribeBoardsList();

    const boardsCollRef = collection(db, "users", currentUid, "whiteboards");
    unsubscribeBoardsList = onSnapshot(boardsCollRef, (snap) => {
        const boardsList = [];
        snap.forEach(docSnap => {
            boardsList.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderBoardsGrid(boardsList);
    });
}

function setupOfflineModeForDashboard() {
    const localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
    renderBoardsGrid(localBoards);
}

function renderBoardsGrid(boardsList) {
    if (boardsList) {
        loadedBoardsList = boardsList;
    }
    
    // Сортировка loadedBoardsList
    const sorted = [...loadedBoardsList];
    sorted.sort((a, b) => {
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        const createdA = a.createdAt || a.updatedAt || 0;
        const createdB = b.createdAt || b.updatedAt || 0;
        const updatedA = a.updatedAt || 0;
        const updatedB = b.updatedAt || 0;

        if (currentSortOption === 'alphabeticalAsc') {
            return titleA.localeCompare(titleB, 'ru');
        } else if (currentSortOption === 'alphabeticalDesc') {
            return titleB.localeCompare(titleA, 'ru');
        } else if (currentSortOption === 'createdAsc') {
            return createdA - createdB;
        } else if (currentSortOption === 'createdDesc') {
            return createdB - createdA;
        } else if (currentSortOption === 'updatedAsc') {
            return updatedA - updatedB;
        } else { // updatedDesc
            return updatedB - updatedA;
        }
    });

    const topLevelBoards = sorted.filter(board => !board.parentBoardId);

    boardsGrid.innerHTML = '';
    
    if (topLevelBoards.length === 0) {
        boardsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-sec); padding: 40px;">
            У вас пока нет досок. Нажмите "Создать доску", чтобы начать!
        </div>`;
        return;
    }

    topLevelBoards.forEach(board => {
        const card = document.createElement('div');
        card.className = 'board-card';
        
        // Создаем выпадающее меню действий
        const dropdown = document.createElement('div');
        dropdown.className = 'board-actions-dropdown';
        dropdown.style.display = 'none';
        
        const renameBtn = document.createElement('button');
        renameBtn.className = 'board-dropdown-item';
        renameBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Переименовать</span>
        `;
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = 'none';
            showRenameBoardModal(board.id, board.title);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'board-dropdown-item btn-delete';
        deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Удалить</span>
        `;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = 'none';
            showDeleteBoardModal(board.id, board.title);
        });
        
        dropdown.appendChild(renameBtn);
        dropdown.appendChild(deleteBtn);
        card.appendChild(dropdown);

        const openMenu = () => {
            document.querySelectorAll('.board-actions-dropdown').forEach(dd => {
                if (dd !== dropdown) dd.style.display = 'none';
            });
            
            const isHidden = dropdown.style.display === 'none';
            if (isHidden) {
                dropdown.style.display = 'flex';
                dropdown.style.position = 'absolute';
                dropdown.style.left = 'auto';
                dropdown.style.right = '16px';
                dropdown.style.top = '48px';
            } else {
                dropdown.style.display = 'none';
            }
        };

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMenu();
        });

        card.addEventListener('click', (e) => {
            if (e.target.closest('.board-card-more') || e.target.closest('.board-actions-dropdown')) return;
            window.location.search = `?id=${board.id}`;
        });

        const title = document.createElement('h3');
        title.className = 'board-card-title';
        title.innerText = board.title || 'Без названия';
        card.appendChild(title);

        const dateStr = board.updatedAt ? new Date(board.updatedAt).toLocaleDateString('ru-RU') : 'Недавно';
        const date = document.createElement('div');
        date.className = 'board-card-date';
        date.innerText = `Изменено: ${dateStr}`;
        card.appendChild(date);

        const moreBtn = document.createElement('button');
        moreBtn.className = 'board-card-more';
        moreBtn.title = 'Действия';
        moreBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="1.5"></circle>
                <circle cx="12" cy="5" r="1.5"></circle>
                <circle cx="12" cy="19" r="1.5"></circle>
            </svg>
        `;
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openMenu();
        });
        card.appendChild(moreBtn);

        boardsGrid.appendChild(card);
    });
}

btnCreateBoard.addEventListener('click', () => {
    const newBoardId = "board_" + Math.random().toString(36).substring(2, 11);
    const newBoardData = {
        id: newBoardId,
        title: "Новая доска",
        width: 2400,
        height: 1600,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    if (currentUid && db) {
        const boardDocRef = doc(db, "users", currentUid, "whiteboards", newBoardId);
        setDoc(boardDocRef, newBoardData).then(() => {
            window.location.search = `?id=${newBoardId}`;
        });
    } else {
        const localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
        localBoards.push(newBoardData);
        localStorage.setItem('whiteboards_list', JSON.stringify(localBoards));
        window.location.search = `?id=${newBoardId}`;
    }
});

function showDeleteBoardModal(boardId, boardTitle) {
    const modal = document.getElementById('confirmDeleteBoardModal');
    const titleSpan = document.getElementById('confirmDeleteBoardTitle');
    const cancelBtn = document.getElementById('btnConfirmDeleteBoardCancel');
    const confirmBtn = document.getElementById('btnConfirmDeleteBoardConfirm');

    titleSpan.innerText = `«${boardTitle || 'Без названия'}»`;
    modal.style.display = 'flex';

    const newCancel = cancelBtn.cloneNode(true);
    const newConfirm = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    newCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    newConfirm.addEventListener('click', async () => {
        modal.style.display = 'none';
        await executeDeleteBoard(boardId);
    });
}

async function executeDeleteBoard(boardId) {
    if (currentUid && db) {
        try {
            const elementsCollRef = collection(db, "users", currentUid, "whiteboards", boardId, "elements");
            const snap = await getDocs(elementsCollRef);
            
            // Recursively delete sub-boards first
            for (let docSnap of snap.docs) {
                const el = docSnap.data();
                if (el.type === 'board' && el.targetBoardId) {
                    await executeDeleteBoard(el.targetBoardId);
                }
            }
            
            // Delete all elements of the current board
            const batch = writeBatch(db);
            snap.forEach(docSnap => {
                batch.delete(docSnap.ref);
            });
            await batch.commit();

            // Delete the board config / doc itself
            const boardDocRef = doc(db, "users", currentUid, "whiteboards", boardId);
            await deleteDoc(boardDocRef);
        } catch (err) {
            console.error("Error during cascading board deletion:", err);
        }
    } else {
        const elementsKey = `board_elements_${boardId}`;
        const localElements = JSON.parse(localStorage.getItem(elementsKey) || '{}');
        
        // Recursively delete sub-boards first
        for (let el of Object.values(localElements)) {
            if (el.type === 'board' && el.targetBoardId) {
                await executeDeleteBoard(el.targetBoardId);
            }
        }
        
        let localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
        localBoards = localBoards.filter(b => b.id !== boardId);
        localStorage.setItem('whiteboards_list', JSON.stringify(localBoards));

        localStorage.removeItem(`board_config_${boardId}`);
        localStorage.removeItem(elementsKey);
        
        if (typeof setupOfflineModeForDashboard === 'function') {
            setupOfflineModeForDashboard();
        }
    }
}

function showRenameBoardModal(boardId, currentTitle) {
    const modal = document.getElementById('renameBoardModal');
    const input = document.getElementById('renameBoardInput');
    const cancelBtn = document.getElementById('btnRenameBoardCancel');
    const confirmBtn = document.getElementById('btnRenameBoardConfirm');

    input.value = currentTitle || "";
    modal.style.display = 'flex';
    input.focus();
    input.select();

    const newCancel = cancelBtn.cloneNode(true);
    const newConfirm = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    const handleSave = async () => {
        const trimmedTitle = input.value.trim();
        if (!trimmedTitle) {
            alert("Название не может быть пустым!");
            return;
        }
        modal.style.display = 'none';
        await executeRenameBoard(boardId, trimmedTitle);
    };

    newCancel.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    newConfirm.addEventListener('click', handleSave);

    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            modal.style.display = 'none';
        }
    };
    input.removeEventListener('keydown', input._keydownHandler);
    input._keydownHandler = handleKeydown;
    input.addEventListener('keydown', handleKeydown);
}

async function executeRenameBoard(boardId, trimmedTitle) {
    if (currentUid && db) {
        const boardDocRef = doc(db, "users", currentUid, "whiteboards", boardId);
        await setDoc(boardDocRef, {
            title: trimmedTitle,
            updatedAt: Date.now()
        }, { merge: true });
    } else {
        const localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
        const idx = localBoards.findIndex(b => b.id === boardId);
        if (idx !== -1) {
            localBoards[idx].title = trimmedTitle;
            localBoards[idx].updatedAt = Date.now();
            localStorage.setItem('whiteboards_list', JSON.stringify(localBoards));
        }
        
        const boardConfigLoc = JSON.parse(localStorage.getItem(`board_config_${boardId}`) || '{}');
        boardConfigLoc.title = trimmedTitle;
        localStorage.setItem(`board_config_${boardId}`, JSON.stringify(boardConfigLoc));

        setupOfflineModeForDashboard();
    }
}

if (boardSortSelect) {
    boardSortSelect.value = currentSortOption;
    boardSortSelect.addEventListener('change', (e) => {
        currentSortOption = e.target.value;
        localStorage.setItem('board_sort_option', currentSortOption);
        renderBoardsGrid();
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.board-card-more') && !e.target.closest('.board-actions-dropdown')) {
        document.querySelectorAll('.board-actions-dropdown').forEach(dd => {
            dd.style.display = 'none';
        });
    }
});

// Закрытие модалок по клику вне контента
document.querySelectorAll('.confirm-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.style.display = 'none';
        }
    });
});
// === ЛОГИКА ДЛЯ АКТИВНОЙ ДОСКИ ===

function setupFirebaseSyncForBoard() {
    if (unsubscribeElements) unsubscribeElements();
    if (unsubscribeBoard) unsubscribeBoard();

    showSaveStatus('Синхронизация...');

    const boardDocRef = doc(db, "users", currentUid, "whiteboards", activeBoardId);
    unsubscribeBoard = onSnapshot(boardDocRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            boardConfig.width = data.width || 2400;
            boardConfig.height = data.height || 1600;
            if (data.title) {
                boardTitleInput.value = data.title;
                adjustTitleInputWidth();
            }
            updateCanvasSize();
            renderBreadcrumbs();
        } else {
            setDoc(boardDocRef, {
                width: 2400,
                height: 1600,
                title: boardTitleInput.value,
                updatedAt: Date.now()
            });
        }
    });

    const elementsCollRef = collection(db, "users", currentUid, "whiteboards", activeBoardId, "elements");
    unsubscribeElements = onSnapshot(elementsCollRef, (snap) => {
        elements = {};
        snap.forEach(docSnap => {
            elements[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        renderElements();
        showSaveStatus('Сохранено');
        updateUndoRedoButtons();
        if (!hasCenteredOnLoad && Object.keys(elements).length > 0) {
            hasCenteredOnLoad = true;
            centerBoardOnElements();
        }
    }, (err) => {
        console.error("Ошибка синхронизации элементов:", err);
        showSaveStatus('Ошибка сети');
    });
}

function setupOfflineModeForBoard() {
    showSaveStatus('Черновик (локально)');

    const localConfig = localStorage.getItem(`board_config_${activeBoardId}`);
    if (localConfig) {
        const data = JSON.parse(localConfig);
        boardConfig.width = data.width || 2400;
        boardConfig.height = data.height || 1600;
        boardTitleInput.value = data.title || "Моя доска идей";
        adjustTitleInputWidth();
    }
    updateCanvasSize();
    renderBreadcrumbs();

    const localElements = localStorage.getItem(`board_elements_${activeBoardId}`);
    if (localElements) {
        elements = JSON.parse(localElements);
    } else {
        elements = {};
    }
    renderElements();
    updateUndoRedoButtons();
    if (!hasCenteredOnLoad && Object.keys(elements).length > 0) {
        hasCenteredOnLoad = true;
        centerBoardOnElements();
    }
}

function saveBoardInfo() {
    if (currentUid && db) {
        const boardDocRef = doc(db, "users", currentUid, "whiteboards", activeBoardId);
        setDoc(boardDocRef, {
            width: boardConfig.width,
            height: boardConfig.height,
            title: boardTitleInput.value,
            updatedAt: Date.now()
        }, { merge: true });
    } else {
        localStorage.setItem(`board_config_${activeBoardId}`, JSON.stringify({
            width: boardConfig.width,
            height: boardConfig.height,
            title: boardTitleInput.value
        }));
        
        const localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
        const idx = localBoards.findIndex(b => b.id === activeBoardId);
        if (idx !== -1) {
            localBoards[idx].title = boardTitleInput.value;
            localBoards[idx].updatedAt = Date.now();
            localStorage.setItem('whiteboards_list', JSON.stringify(localBoards));
        }

        showSaveStatus('Сохранено локально');
    }
    updateParentBoardElementTitle(boardTitleInput.value);
}

function saveElement(elData) {
    if (currentUid && db) {
        const elDocRef = doc(db, "users", currentUid, "whiteboards", activeBoardId, "elements", elData.id);
        setDoc(elDocRef, elData, { merge: true });
    } else {
        elements[elData.id] = elData;
        localStorage.setItem(`board_elements_${activeBoardId}`, JSON.stringify(elements));
        showSaveStatus('Сохранено локально');
        renderElements();
    }
}

function deleteElement(id) {
    saveUndoState();

    const el = elements[id];
    if (el && el.type === 'board' && el.targetBoardId) {
        executeDeleteBoard(el.targetBoardId);
    }

    if (el && (el.type === 'frame' || el.type === 'column')) {
        const batchUpdates = [];
        Object.values(elements).forEach(child => {
            if (child.parentId === id) {
                child.parentId = null;
                batchUpdates.push(child);
            }
        });
        batchUpdates.forEach(child => saveElement(child));
    }

    if (currentUid && db) {
        const elDocRef = doc(db, "users", currentUid, "whiteboards", activeBoardId, "elements", id);
        deleteDoc(elDocRef);
    } else {
        delete elements[id];
        localStorage.setItem(`board_elements_${activeBoardId}`, JSON.stringify(elements));
        showSaveStatus('Удалено локально');
        renderElements();
    }

    if (selectedElementIds.has(id)) {
        selectedElementIds.delete(id);
    }
}

// === УПРАВЛЕНИЕ МАСШТАБОМ И НАВИГАЦИЕЙ ===

function updateTransform() {
    canvasHolder.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    zoomPercent.innerText = `${Math.round(zoom * 100)}%`;
    if (typeof updateElementOptionsPanel === 'function') {
        updateElementOptionsPanel();
    }
    if (typeof updateTextFormatToolbarPosition === 'function') {
        updateTextFormatToolbarPosition();
    }
}

function zoomTo(newZoom, centerX, centerY) {
    const prevZoom = zoom;
    zoom = Math.min(Math.max(newZoom, 0.2), 3.0);
    panX = centerX - ((centerX - panX) * zoom) / prevZoom;
    panY = centerY - ((centerY - panY) * zoom) / prevZoom;
    updateTransform();
}

boardViewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = boardViewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomTo(zoom * factor, mouseX, mouseY);
}, { passive: false });

let isSpacePressed = false;
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.getAttribute('contenteditable') !== 'true') {
        isSpacePressed = true;
        boardViewport.style.cursor = 'grab';
    }

    // Ctrl+Z / Cmd+Z (Undo)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.getAttribute('contenteditable') === 'true') {
            return;
        }
        e.preventDefault();
        
        if (activeTool === 'draw') {
            if (localStrokes.length > 0) {
                const undone = localStrokes.pop();
                localRedoStrokes.push(undone);
                redrawLocalStrokes();
            }
        } else {
            undo();
        }
    }

    // Ctrl+Y / Cmd+Y / Ctrl+Shift+Z / Cmd+Shift+Z (Redo)
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.getAttribute('contenteditable') === 'true') {
            return;
        }
        e.preventDefault();
        
        if (activeTool === 'draw') {
            if (localRedoStrokes.length > 0) {
                const redone = localRedoStrokes.pop();
                localStrokes.push(redone);
                redrawLocalStrokes();
            }
        } else {
            redo();
        }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.getAttribute('contenteditable') === 'true') {
            return;
        }
        if (activeTool === 'draw' && selectedLocalStrokeIndex !== -1) {
            localStrokes.splice(selectedLocalStrokeIndex, 1);
            selectedLocalStrokeIndex = -1;
            redrawLocalStrokes();
            return;
        }
        if (selectedElementIds.size > 0) {
            selectedElementIds.forEach(id => {
                deleteElement(id);
            });
            selectedElementIds.clear();
        }
    }

});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        isSpacePressed = false;
        boardViewport.style.cursor = 'default';
    }
});

boardViewport.addEventListener('mousedown', (e) => {
    if (isPanning) return;

    if (e.button === 1 || e.button === 2 || (e.button === 0 && isSpacePressed)) {
        isPanning = true;
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        boardViewport.style.cursor = 'grabbing';
        e.preventDefault();
        return;
    }
});

boardViewport.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

btnZoomIn.addEventListener('click', () => {
    zoomTo(zoom * 1.2, window.innerWidth / 2, window.innerHeight / 2);
});
btnZoomOut.addEventListener('click', () => {
    zoomTo(zoom / 1.2, window.innerWidth / 2, window.innerHeight / 2);
});
btnZoomReset.addEventListener('click', () => {
    zoom = 1.0;
    panX = (window.innerWidth - boardConfig.width) / 2;
    panY = (window.innerHeight - boardConfig.height) / 2;
    updateTransform();
});

if (btnUndo) btnUndo.addEventListener('click', undo);
if (btnRedo) btnRedo.addEventListener('click', redo);

// === РАЗМЕР ХОЛСТА И ЕГО ИЗМЕНЕНИЕ ===
function updateCanvasSize() {
    boardCanvas.style.width = `${boardConfig.width}px`;
    boardCanvas.style.height = `${boardConfig.height}px`;
    
    // ВАЖНО: Задаем размеры SVG слою рисования
    drawingLayer.setAttribute("width", boardConfig.width);
    drawingLayer.setAttribute("height", boardConfig.height);
}

// === ВЫБОР ИНСТРУМЕНТОВ ===
function setTool(toolName) {
    activeTool = toolName;
    
    // Стилизуем кнопки тулбара
    Object.keys(tools).forEach(name => {
        if (tools[name]) {
            if (name === toolName) {
                tools[name].classList.add('active');
            } else {
                tools[name].classList.remove('active');
            }
        }
    });

    if (toolName === 'draw') {
        document.body.classList.add('drawing-mode-active');
        drawingModePanel.classList.add('active');
        if (!editingDrawingId) {
            localStrokes = [];
            localRedoStrokes = [];
            drawingLayer.innerHTML = '';
        }
        if (boardCanvas) boardCanvas.style.cursor = '';
        if (boardViewport) boardViewport.style.cursor = '';
        setLocalDrawingTool(localDrawingTool || 'pencil');
        selectedElementIds.clear();
        document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));
        renderElements();
    } else {
        const cursorClasses = ['cursor-pencil', 'cursor-select', 'cursor-highlighter', 'cursor-pen', 'cursor-eraser'];
        document.body.classList.remove('drawing-mode-active', ...cursorClasses);
        if (boardCanvas) boardCanvas.classList.remove(...cursorClasses);
        if (boardViewport) boardViewport.classList.remove(...cursorClasses);
        drawingModePanel.classList.remove('active');
        if (editingDrawingId) {
            editingDrawingId = null;
            localStrokes = [];
            drawingLayer.innerHTML = '';
            renderElements();
        }
    }




    if (toolName === 'eraser') {
        boardCanvas.style.cursor = 'cell';
    } else if (toolName !== 'draw') {
        boardCanvas.style.cursor = 'default';
        document.querySelectorAll('.board-element.eraser-hover-target').forEach(el => {
            el.classList.remove('eraser-hover-target');
        });
    }

}

Object.keys(tools).forEach(name => {
    if (tools[name]) {
        tools[name].addEventListener('click', () => setTool(name));
    }
});

// Переключение цвета на панели карандаша
document.querySelectorAll('.draw-color-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
        document.querySelectorAll('.draw-color-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        activeColor = opt.getAttribute('data-color');
    });
});

// Управление активным инструментом в доке PencilKit
function setLocalDrawingTool(toolName) {
    localDrawingTool = toolName;
    
    // Переключаем активные классы на кнопках инструментов
    if (drawBtnPencil) drawBtnPencil.classList.toggle('active', toolName === 'pencil');
    if (drawBtnSelect) drawBtnSelect.classList.toggle('active', toolName === 'select');
    if (drawBtnHighlighter) drawBtnHighlighter.classList.toggle('active', toolName === 'highlighter');
    if (drawBtnPen) drawBtnPen.classList.toggle('active', toolName === 'pen');
    if (drawBtnEraser) drawBtnEraser.classList.toggle('active', toolName === 'eraser');
    
    // Сбрасываем инлайновые курсоры, мешающие CSS
    if (boardCanvas) boardCanvas.style.cursor = '';
    if (boardViewport) boardViewport.style.cursor = '';

    // Устанавливаем класс курсора на body, boardCanvas и boardViewport
    const cursorClasses = ['cursor-pencil', 'cursor-select', 'cursor-highlighter', 'cursor-pen', 'cursor-eraser'];
    document.body.classList.remove(...cursorClasses);
    document.body.classList.add(`cursor-${toolName}`);
    if (boardCanvas) {
        boardCanvas.classList.remove(...cursorClasses);
        boardCanvas.classList.add(`cursor-${toolName}`);
    }
    if (boardViewport) {
        boardViewport.classList.remove(...cursorClasses);
        boardViewport.classList.add(`cursor-${toolName}`);
    }


    if (toolName !== 'eraser') {
        if (hoveredEraserStrokeIndices.size > 0) {
            hoveredEraserStrokeIndices.clear();
            redrawLocalStrokes();
        }
    }

    if (toolName !== 'select') {
        if (selectedLocalStrokeIndex !== -1) {
            selectedLocalStrokeIndex = -1;
            redrawLocalStrokes();
        }
    }

    // Синхронизируем слайдеры под настройки выбранного инструмента
    if (toolSettings[toolName]) {
        const settings = toolSettings[toolName];
        if (dockSizeSlider) dockSizeSlider.value = settings.width;
        if (dockSizeValue) dockSizeValue.innerText = `${settings.width}px`;
        if (dockSizeBtnLabel) dockSizeBtnLabel.innerText = `${settings.width}px`;
        
        const opacityPct = Math.round(settings.opacity * 100);
        if (dockOpacitySlider) dockOpacitySlider.value = opacityPct;
        if (dockOpacityValue) dockOpacityValue.innerText = `${opacityPct}%`;
        
        if (dockSizePreviewDot) {
            const dotSize = Math.max(4, Math.min(18, settings.width / 2.5));
            dockSizePreviewDot.style.width = `${dotSize}px`;
            dockSizePreviewDot.style.height = `${dotSize}px`;
            dockSizePreviewDot.style.backgroundColor = activeColor;
        }
    }
}

if (drawBtnPencil) drawBtnPencil.addEventListener('click', () => setLocalDrawingTool('pencil'));
if (drawBtnSelect) drawBtnSelect.addEventListener('click', () => setLocalDrawingTool('select'));
if (drawBtnHighlighter) drawBtnHighlighter.addEventListener('click', () => setLocalDrawingTool('highlighter'));
if (drawBtnPen) drawBtnPen.addEventListener('click', () => setLocalDrawingTool('pen'));
if (drawBtnEraser) drawBtnEraser.addEventListener('click', () => setLocalDrawingTool('eraser'));


// Кнопки Undo / Redo в доке
if (dockBtnUndo) {
    dockBtnUndo.addEventListener('click', () => {
        if (localStrokes.length > 0) {
            const undone = localStrokes.pop();
            localRedoStrokes.push(undone);
            redrawLocalStrokes();
        }
    });
}

if (dockBtnRedo) {
    dockBtnRedo.addEventListener('click', () => {
        if (localRedoStrokes.length > 0) {
            const redone = localRedoStrokes.pop();
            localStrokes.push(redone);
            redrawLocalStrokes();
        }
    });
}

// Поповер настроек размера и прозрачности
if (dockToolSettingsBtn) {
    dockToolSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dockSettingsPopover) {
            const isHidden = dockSettingsPopover.style.display === 'none' || !dockSettingsPopover.style.display;
            dockSettingsPopover.style.display = isHidden ? 'block' : 'none';
        }
    });
}

document.addEventListener('click', (e) => {
    if (dockSettingsPopover && !e.target.closest('#dockSettingsPopover') && !e.target.closest('#dockToolSettingsBtn')) {
        dockSettingsPopover.style.display = 'none';
    }
});

if (dockSizeSlider) {
    dockSizeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (toolSettings[localDrawingTool]) {
            toolSettings[localDrawingTool].width = val;
        }
        if (dockSizeValue) dockSizeValue.innerText = `${val}px`;
        if (dockSizeBtnLabel) dockSizeBtnLabel.innerText = `${val}px`;
        if (dockSizePreviewDot) {
            const dotSize = Math.max(4, Math.min(18, val / 2.5));
            dockSizePreviewDot.style.width = `${dotSize}px`;
            dockSizePreviewDot.style.height = `${dotSize}px`;
        }
    });
}

if (dockOpacitySlider) {
    dockOpacitySlider.addEventListener('input', (e) => {
        const pct = parseInt(e.target.value);
        const opacityVal = pct / 100;
        if (toolSettings[localDrawingTool]) {
            toolSettings[localDrawingTool].opacity = opacityVal;
        }
        if (dockOpacityValue) dockOpacityValue.innerText = `${pct}%`;
    });
}

if (dockCustomColorInput) {
    dockCustomColorInput.addEventListener('input', (e) => {
        activeColor = e.target.value;
        document.querySelectorAll('.draw-color-opt').forEach(o => o.classList.remove('active'));
        if (dockCustomColorTrigger) dockCustomColorTrigger.classList.add('active');
        if (dockSizePreviewDot) dockSizePreviewDot.style.backgroundColor = activeColor;
    });
}

btnDrawDiscard.addEventListener('click', () => {
    exitDrawingMode(false);
});

btnDrawSave.addEventListener('click', () => {
    exitDrawingMode(true);
});

function buildSvgPathAndWidth(points, defaultWidth = 4, toolType = 'pencil') {
    if (!points || points.length === 0) return { d: '', strokeWidth: defaultWidth };
    
    let totalP = 0, countP = 0;
    points.forEach(pt => {
        if (pt.pressure !== undefined && pt.pressure > 0) {
            totalP += pt.pressure;
            countP++;
        }
    });
    
    let strokeWidth = defaultWidth;
    if (countP > 0) {
        const avgP = totalP / countP;
        if (toolType === 'pen') {
            strokeWidth = Math.max(1, Math.min(80, defaultWidth * (0.5 + avgP * 1.0)));
        } else if (toolType === 'highlighter') {
            strokeWidth = Math.max(8, Math.min(100, defaultWidth * (0.8 + avgP * 0.4)));
        } else {
            strokeWidth = Math.max(1.5, Math.min(60, defaultWidth * (0.35 + avgP * 1.3)));
        }
    }
    
    if (points.length === 1) {
        return {
            d: `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${(points[0].x + 0.1).toFixed(1)} ${(points[0].y + 0.1).toFixed(1)}`,
            strokeWidth
        };
    }
    
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${xc.toFixed(1)} ${yc.toFixed(1)}`;
    }
    d += ` L ${points[points.length - 1].x.toFixed(1)} ${points[points.length - 1].y.toFixed(1)}`;
    
    return { d, strokeWidth };
}

function editExistingDrawing(elId) {
    const el = elements[elId];
    if (!el || el.type !== 'drawing') return;

    editingDrawingId = elId;
    
    // Переводим точки из локальных координат элемента обратно в глобальные координаты холста
    localStrokes = (el.strokes || []).map(s => {
        return {
            color: s.color || activeColor,
            toolType: s.toolType || 'pencil',
            baseWidth: s.baseWidth || 4,
            opacity: s.opacity !== undefined ? s.opacity : 1.0,
            points: (s.points || []).map(pt => ({
                x: pt.x + el.x,
                y: pt.y + el.y,
                pressure: pt.pressure !== undefined ? pt.pressure : 0.5
            }))
        };
    });
    localRedoStrokes = [];

    // Входим в режим рисования
    setTool('draw');
    redrawLocalStrokes();
}

function exitDrawingMode(save = false) {
    document.body.classList.remove('drawing-mode-active');
    drawingModePanel.classList.remove('active');
    if (dockSettingsPopover) dockSettingsPopover.style.display = 'none';
    
    if (save) {
        if (localStrokes.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            localStrokes.forEach(s => {
                s.points.forEach(pt => {
                    if (pt.x < minX) minX = pt.x;
                    if (pt.x > maxX) maxX = pt.x;
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                });
            });

            const shiftedStrokes = localStrokes.map(s => {
                return {
                    color: s.color,
                    toolType: s.toolType || 'pencil',
                    baseWidth: s.baseWidth || 4,
                    opacity: s.opacity !== undefined ? s.opacity : 1.0,
                    points: s.points.map(pt => ({
                        x: pt.x - minX,
                        y: pt.y - minY,
                        pressure: pt.pressure !== undefined ? pt.pressure : 0.5
                    }))
                };
            });

            const w = Math.max(40, maxX - minX);
            const h = Math.max(40, maxY - minY);

            saveUndoState();

            if (editingDrawingId && elements[editingDrawingId]) {
                // Обновляем существующий элемент рисунка на месте
                const el = elements[editingDrawingId];
                el.x = minX;
                el.y = minY;
                el.width = w;
                el.height = h;
                el.originalWidth = w;
                el.originalHeight = h;
                el.strokes = shiftedStrokes;
                saveElement(el);
            } else {
                // Создаем новый элемент рисунка
                const id = "el_" + Math.random().toString(36).substring(2, 11);
                const maxZ = Object.values(elements).reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
                const elData = {
                    id,
                    type: 'drawing',
                    x: minX,
                    y: minY,
                    width: w,
                    height: h,
                    originalWidth: w,
                    originalHeight: h,
                    strokes: shiftedStrokes,
                    zIndex: maxZ + 1
                };
                saveElement(elData);
            }
        } else if (editingDrawingId) {
            // Если в режиме редактирования все линии были стерты, удаляем элемент
            deleteElement(editingDrawingId);
        }
    }

    editingDrawingId = null;
    localStrokes = [];
    drawingLayer.innerHTML = '';
    setTool('select');
    renderElements();
}

function redrawLocalStrokes() {
    drawingLayer.innerHTML = '';
    localStrokes.forEach((stroke, index) => {
        if (!stroke.points || stroke.points.length === 0) return;
        const toolType = stroke.toolType || 'pencil';
        const baseW = stroke.baseWidth || (toolType === 'highlighter' ? 18 : 4);
        const opacity = stroke.opacity !== undefined ? stroke.opacity : (toolType === 'highlighter' ? 0.45 : 1.0);

        const { d, strokeWidth } = buildSvgPathAndWidth(stroke.points, baseW, toolType);

        // В стиле Milanote: выделенный синей обводкой штрих (инструмент Выбор/Курсор)
        if (index === selectedLocalStrokeIndex) {
            const blueOutline = document.createElementNS("http://www.w3.org/2000/svg", "path");
            blueOutline.setAttribute("stroke", "#3b82f6");
            blueOutline.setAttribute("stroke-width", (strokeWidth + 6).toFixed(1));
            blueOutline.setAttribute("fill", "none");
            blueOutline.setAttribute("stroke-linecap", toolType === 'highlighter' ? "butt" : "round");
            blueOutline.setAttribute("stroke-linejoin", "round");
            blueOutline.setAttribute("stroke-opacity", "0.95");
            blueOutline.setAttribute("d", d);
            drawingLayer.appendChild(blueOutline);
        }

        // В стиле Milanote: подсвечиваем штрихи, подлежащие удалению, яркой красной обводкой
        if (hoveredEraserStrokeIndices.has(index)) {

            const outlinePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            outlinePath.setAttribute("stroke", "#ef4444");
            outlinePath.setAttribute("stroke-width", (strokeWidth + 5).toFixed(1));
            outlinePath.setAttribute("fill", "none");
            outlinePath.setAttribute("stroke-linecap", toolType === 'highlighter' ? "butt" : "round");
            outlinePath.setAttribute("stroke-linejoin", "round");
            outlinePath.setAttribute("stroke-opacity", "0.95");
            outlinePath.setAttribute("d", d);
            drawingLayer.appendChild(outlinePath);
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("stroke", stroke.color || activeColor);
        path.setAttribute("stroke-width", strokeWidth.toFixed(1));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", toolType === 'highlighter' ? "butt" : "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-opacity", opacity.toString());

        if (toolType === 'highlighter') {
            path.style.mixBlendMode = 'multiply';
        }

        path.setAttribute("d", d);
        drawingLayer.appendChild(path);
    });
}


// === СОЗДАНИЕ ЭЛЕМЕНТОВ ===
function createNewElement(type, x, y, extra = {}) {
    saveUndoState();

    const id = "el_" + Math.random().toString(36).substring(2, 11);
    
    if (x === undefined || y === undefined) {
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        x = Math.round((viewportCenterX - panX) / zoom);
        y = Math.round((viewportCenterY - panY) / zoom);
    }

    let width = 180;
    let height = 100;
    
    if (type === 'text') {
        width = 320;
        height = 120;
    } else if (type === 'sticker') {
        width = 160;
        height = 160;
    } else if (type === 'frame') {
        width = 400;
        height = 300;
    } else if (type === 'image') {
        width = 300;
        height = 200;
    } else if (type === 'link') {
        width = 280;
        height = 110;
    } else if (type === 'board') {
        width = 240;
        height = 84;
    } else if (type === 'column') {
        width = 240;
        height = 300;
    }

    const maxZ = Object.values(elements).reduce((max, el) => Math.max(max, el.zIndex || 0), 0);

    const finalWidth = extra.width || width;
    const finalHeight = extra.height || height;

    const elData = {
        id,
        type,
        x: Math.max(0, Math.min(x - finalWidth / 2, boardConfig.width - finalWidth)),
        y: Math.max(0, Math.min(y - finalHeight / 2, boardConfig.height - finalHeight)),
        width: finalWidth,
        height: finalHeight,
        zIndex: maxZ + 1,
        color: (type === 'board') ? null : ((type === 'text' || type === 'column' || type === 'frame' || type === 'link') ? '#ffffff' : activeColor), // Текстовый блок, столбец, группа и ссылка изначально белые
        ...extra
    };

    if (type === 'text' || type === 'sticker') {
        editingElementId = id;
    }

    saveElement(elData);
    setTool('select');
    selectedElementIds.clear();
    selectedElementIds.add(id);
}

tools.text.addEventListener('click', () => createNewElement('text', undefined, undefined, { content: "" }));

if (tools.board) {
    tools.board.addEventListener('click', async () => {
        const newSubBoardId = "board_" + Math.random().toString(36).substring(2, 11);
        const newBoardData = {
            id: newSubBoardId,
            parentBoardId: activeBoardId,
            title: "Встроенная доска",
            width: 2400,
            height: 1600,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        showSaveStatus("Создание встроенной доски...");

        if (currentUid && db) {
            const boardDocRef = doc(db, "users", currentUid, "whiteboards", newSubBoardId);
            await setDoc(boardDocRef, newBoardData);
        } else {
            const localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
            localBoards.push(newBoardData);
            localStorage.setItem('whiteboards_list', JSON.stringify(localBoards));
        }

        createNewElement('board', undefined, undefined, {
            targetBoardId: newSubBoardId,
            content: "Встроенная доска"
        });
        showSaveStatus("Встроенная доска создана");
    });
}

if (tools.column) {
    tools.column.addEventListener('click', () => createNewElement('column', undefined, undefined, { content: "Новая колонка" }));
}

tools.link.addEventListener('click', () => {
    urlInputModal.classList.add('active');
    bookmarkUrlInput.value = '';
    bookmarkUrlInput.focus();
});

btnUrlCancel.addEventListener('click', () => urlInputModal.classList.remove('active'));
btnUrlConfirm.addEventListener('click', async () => {
    const url = bookmarkUrlInput.value.trim();
    if (!url) return;
    urlInputModal.classList.remove('active');

    showSaveStatus("Загрузка превью...");
    let title = url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
    let desc = "Нажмите, чтобы открыть ссылку";

    createNewElement('link', undefined, undefined, {
        url: url,
        content: title,
        description: desc,
        imageUrl: null
    });
});

async function uploadToImgBB(base64OrBlob) {
    const API_KEY = 'fbd88ce7045582e4c4176c67de93ceee';
    const formData = new FormData();
    if (typeof base64OrBlob === 'string') {
        const cleanBase64 = base64OrBlob.split(',')[1];
        formData.append('image', cleanBase64);
    } else {
        formData.append('image', base64OrBlob);
    }
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
        method: 'POST',
        body: formData
    });
    const result = await response.json();
    if (result.success) return result.data.url; else throw new Error('ImgBB Upload Failed');
}

function openImageUploadModal(onUploadSuccess) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';

    overlay.innerHTML = `
        <div class="confirm-box thumbnail-confirm-box" style="padding: 24px;">
            <div class="confirm-title" style="font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Картинка
            </div>
            
            <div class="modal-tabs" style="flex-shrink: 0;">
                <button class="modal-tab active" data-tab="file">Из файла</button>
                <button class="modal-tab" data-tab="url">По ссылке</button>
            </div>

            <!-- Вкладка: Из файла -->
            <div id="tab-content-file" class="tab-content-pane">
                <div class="confirm-message" style="margin-bottom: 16px; font-size: 13px; opacity: 0.85; line-height: 1.4;">
                    Загрузите изображение, вставьте из буфера обмена (Ctrl + V) или перетащите файл в область ниже.
                </div>

                <div id="icon-dropzone" class="icon-dropzone" style="margin-bottom: 16px;">
                    <div class="dropzone-preview" style="max-width: 100%; display: flex; align-items: center; justify-content: center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload" style="opacity: 0.6; color: var(--text-sec);"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
                    </div>
                    <div class="dropzone-text" style="font-size: 13px; font-weight: 500; margin-top: 8px;">
                        Кликните для выбора файла или перетащите его сюда
                    </div>
                </div>
            </div>

            <!-- Вкладка: По ссылке -->
            <div id="tab-content-url" class="tab-content-pane" style="display: none;">
                <div class="confirm-message" style="margin-bottom: 16px; font-size: 13px; opacity: 0.85; line-height: 1.4;">
                    Вставьте прямую ссылку на изображение в поле ниже.
                </div>
                
                <input type="text" id="modal-url-input" class="modal-url-input-field" placeholder="https://site.com/image.png" autocomplete="off">
            </div>

            <!-- Скрытый инпут для выбора файла -->
            <input type="file" id="modalIconFileInput" accept="image/*" style="display: none;">

            <!-- Общие действия -->
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: auto; flex-shrink: 0;">
                <button class="confirm-btn-primary" id="btn-select-file" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Выбрать файл...</button>
                <button class="confirm-btn-primary" id="btn-load-link" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%; display: none;">Сохранить</button>
                
                <button class="confirm-btn-secondary" id="btn-close-icon-modal" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Отмена</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const dropzone = overlay.querySelector('#icon-dropzone');
    const fileInput = overlay.querySelector('#modalIconFileInput');
    const selectFileBtn = overlay.querySelector('#btn-select-file');
    const closeBtn = overlay.querySelector('#btn-close-icon-modal');
    
    const tabBtns = overlay.querySelectorAll('.modal-tab');
    const tabPanes = overlay.querySelectorAll('.tab-content-pane');
    const urlInput = overlay.querySelector('#modal-url-input');
    const loadLinkBtn = overlay.querySelector('#btn-load-link');

    // Переключение вкладок
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetTab = btn.dataset.tab;
            tabPanes.forEach(pane => pane.style.display = 'none');
            overlay.querySelector(`#tab-content-${targetTab}`).style.display = 'flex';
            
            if (targetTab === 'file') {
                selectFileBtn.style.display = 'block';
                loadLinkBtn.style.display = 'none';
            } else if (targetTab === 'url') {
                selectFileBtn.style.display = 'none';
                loadLinkBtn.style.display = 'block';
                if (urlInput) {
                    setTimeout(() => urlInput.focus(), 100);
                }
            }
        });
    });

    // 1. Paste handler (Ctrl + V)
    async function handlePaste(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf("image") === 0) {
                const file = item.getAsFile();
                await processAndUpload(file);
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

    dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '';
        dropzone.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            await processAndUpload(file);
        }
    });

    // 3. Selection
    dropzone.addEventListener('click', () => fileInput.click());
    selectFileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) await processAndUpload(file);
    });

    // 4. Link Upload
    loadLinkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const urlVal = urlInput.value.trim();
        if (!urlVal) return;

        try {
            setLoadingState(true);

            const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(urlVal)}`;
            const img = new Image();
            img.crossOrigin = "anonymous";
            
            img.onload = async () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL("image/png");
                try {
                    const hostedUrl = await uploadToImgBB(dataUrl);
                    onUploadSuccess(hostedUrl);
                    cleanup();
                } catch (e) {
                    console.error(e);
                    alert('Не удалось сохранить изображение.');
                    setLoadingState(false);
                }
            };

            img.onerror = () => {
                const directImg = new Image();
                directImg.crossOrigin = "anonymous";
                directImg.onload = async () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = directImg.width;
                    canvas.height = directImg.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(directImg, 0, 0);
                    const dataUrl = canvas.toDataURL("image/png");
                    try {
                        const hostedUrl = await uploadToImgBB(dataUrl);
                        onUploadSuccess(hostedUrl);
                        cleanup();
                    } catch (e) {
                        console.error(e);
                        alert('Не удалось сохранить изображение.');
                        setLoadingState(false);
                    }
                };
                directImg.onerror = () => {
                    alert('Не удалось загрузить изображение по указанной ссылке.');
                    setLoadingState(false);
                };
                directImg.src = urlVal;
            };

            img.src = proxyUrl;
        } catch (err) {
            console.error(err);
            alert('Ошибка загрузки.');
            setLoadingState(false);
        }
    });

    function setLoadingState(loading) {
        const tabsContainer = overlay.querySelector('.modal-tabs');
        if (loading) {
            loadLinkBtn.disabled = true;
            loadLinkBtn.innerText = 'Загрузка...';
            selectFileBtn.disabled = true;
            selectFileBtn.innerText = 'Загрузка...';
            if (tabsContainer) {
                tabsContainer.style.pointerEvents = 'none';
                tabsContainer.style.opacity = '0.5';
            }
            dropzone.style.pointerEvents = 'none';
            
            dropzone.querySelector('.dropzone-preview').innerHTML = `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="32" stroke-dashoffset="8" fill="none" opacity="0.3"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
                </svg>
            `;
            dropzone.querySelector('.dropzone-text').innerText = 'Загрузка изображения...';
        } else {
            loadLinkBtn.disabled = false;
            loadLinkBtn.innerText = 'Сохранить';
            selectFileBtn.disabled = false;
            selectFileBtn.innerText = 'Выбрать файл...';
            if (tabsContainer) {
                tabsContainer.style.pointerEvents = 'auto';
                tabsContainer.style.opacity = '1';
            }
            dropzone.style.pointerEvents = 'auto';
            
            dropzone.querySelector('.dropzone-preview').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload" style="opacity: 0.6; color: var(--text-sec);"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>`;
            dropzone.querySelector('.dropzone-text').innerText = 'Кликните для выбора файла или перетащите его сюда';
        }
    }

    function cleanup() {
        overlay.remove();
        document.removeEventListener('paste', handlePaste);
    }

    closeBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup();
    });

    async function processAndUpload(file) {
        setLoadingState(true);
        try {
            const hostedUrl = await uploadToImgBB(file);
            onUploadSuccess(hostedUrl);
            cleanup();
        } catch (err) {
            console.error('Error uploading image:', err);
            alert('Не удалось загрузить изображение.');
            setLoadingState(false);
        }
    }
}

tools.image.addEventListener('click', () => {
    openImageUploadModal((imageUrl) => {
        if (imageUrl) {
            showSaveStatus("Загрузка картинки...");
            const img = new Image();
            img.onload = () => {
                const aspect = img.width / img.height;
                const targetWidth = 300;
                const targetHeight = Math.round(targetWidth / aspect);
                createNewElement('image', undefined, undefined, {
                    imageUrl: imageUrl,
                    width: targetWidth,
                    height: targetHeight
                });
            };
            img.onerror = () => {
                createNewElement('image', undefined, undefined, {
                    imageUrl: imageUrl
                });
            };
            img.src = imageUrl;
        }
    });
});

// === ХЕЛПЕРЫ СТАТИСТИКИ И ЦВЕТОВ ВСТРОЕННЫХ ДОСОК ===
const BOARD_PASTEL_COLORS = [
    '#F08E51', // Warm Orange
    '#9D85C4', // Purple
    '#8083B8', // Slate Indigo
    '#E66862', // Coral Red
    '#DFAB5F', // Muted Gold
    '#48A3E3', // Soft Sky Blue
    '#4BB885'  // Emerald Green
];

function getBoardIconColor(el) {
    if (el.iconColor) return el.iconColor;
    if (el.color) return el.color;
    let str = (el.id || '') + (el.content || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % BOARD_PASTEL_COLORS.length;
    return BOARD_PASTEL_COLORS[index];
}

function getBoardIconStrokeColor(bgColor) {
    if (!bgColor || bgColor === 'transparent') return 'var(--accent-color)';
    const lower = bgColor.toLowerCase();
    if (lower === '#ffffff' || lower === '#fff' || lower === '#fef08a' || lower === 'white') {
        return '#1e293b';
    }
    return '#ffffff';
}

function formatElementsCount(elsArr) {
    if (!elsArr || elsArr.length === 0) return '0 карточек';
    
    let boardCount = 0;
    let cardCount = 0;
    let docCount = 0;
    let otherCount = 0;

    elsArr.forEach(e => {
        if (e.type === 'board') {
            boardCount++;
        } else if (e.type === 'text' || e.type === 'sticker' || e.type === 'column' || e.type === 'frame') {
            cardCount++;
        } else if (e.type === 'link' || e.type === 'image') {
            docCount++;
        } else {
            otherCount++;
        }
    });

    const parts = [];
    if (boardCount > 0) {
        if (boardCount === 1) parts.push('1 доска');
        else if (boardCount >= 2 && boardCount <= 4) parts.push(`${boardCount} доски`);
        else parts.push(`${boardCount} досок`);
    }
    if (cardCount > 0) {
        if (cardCount === 1) parts.push('1 карточка');
        else if (cardCount >= 2 && cardCount <= 4) parts.push(`${cardCount} карточки`);
        else parts.push(`${cardCount} карточек`);
    }
    if (docCount > 0) {
        if (docCount === 1) parts.push('1 документ');
        else if (docCount >= 2 && docCount <= 4) parts.push(`${docCount} документа`);
        else parts.push(`${docCount} документов`);
    }
    if (otherCount > 0) {
        if (otherCount === 1) parts.push('1 элемент');
        else if (otherCount >= 2 && otherCount <= 4) parts.push(`${otherCount} элемента`);
        else parts.push(`${otherCount} элементов`);
    }

    if (parts.length > 0) return parts.join(', ');
    return `${elsArr.length} элементов`;
}

function getSubboardStatsText(targetBoardId) {
    if (!targetBoardId) return '0 карточек';
    try {
        const raw = localStorage.getItem(`board_elements_${targetBoardId}`);
        if (raw) {
            const els = JSON.parse(raw);
            const elsArr = Object.values(els);
            return formatElementsCount(elsArr);
        }
    } catch(e) {}
    return '0 карточек';
}

// === РЕНДЕРИНГ ЭЛЕМЕНТОВ ===
function renderElements() {
    if (typeof layoutColumns === 'function') {
        layoutColumns(false);
    }
    const activeTextareaId = document.activeElement ? document.activeElement.getAttribute('data-id') : null;
    elementsLayer.innerHTML = '';
    
    // Всегда очищаем SVG-слой перед перерисовкой
    drawingLayer.innerHTML = '';

    // Если мы в режиме активного рисования, перерисовываем штрихи сессии
    if (activeTool === 'draw') {
        redrawLocalStrokes();
    }

    const sortedElements = Object.values(elements).sort((a, b) => {
        const isAContainer = (a.type === 'frame' || a.type === 'column');
        const isBContainer = (b.type === 'frame' || b.type === 'column');
        if (isAContainer && !isBContainer) return -1;
        if (!isAContainer && isBContainer) return 1;
        return (a.zIndex || 0) - (b.zIndex || 0);
    });

    sortedElements.forEach(el => {
        if (editingDrawingId && el.id === editingDrawingId) {
            return; // Скрываем редактируемый рисунок с элементов, пока он отображается на слое рисования
        }
        const elDiv = document.createElement('div');
        let resizeHandle = null;
        elDiv.className = `board-element el-${el.type}`;
        if (selectedElementIds.has(el.id)) {
            elDiv.classList.add('selected');
        }
        
        if (el.parentId) {
            const parentEl = elements[el.parentId];
            if (parentEl && parentEl.type === 'column') {
                elDiv.classList.add('in-column');
            }
        }
        
        elDiv.style.left = `${el.x}px`;
        elDiv.style.top = `${el.y}px`;
        elDiv.style.width = `${el.width}px`;
        elDiv.style.height = `${el.height}px`;
        elDiv.style.zIndex = (el.type === 'frame' || el.type === 'column') ? 1 : (el.zIndex || 2);
        elDiv.setAttribute('data-id', el.id);

        // Применяем кастомные цвета, скругление и тени (только не для рисунков)
        if (el.type === 'drawing') {
            elDiv.style.backgroundColor = 'transparent';
            elDiv.style.boxShadow = 'none';
            elDiv.style.border = 'none';
            elDiv.style.borderRadius = '0px';
        } else if (el.type === 'column' || el.type === 'frame') {
            elDiv.style.backgroundColor = '';
            
            const br = el.borderRadius !== undefined ? el.borderRadius : 12;
            elDiv.style.borderRadius = `${br}px`;

            elDiv.style.border = ''; // сброс
            const shadow = el.shadowType || 'box';
            if (shadow === 'none') {
                elDiv.style.boxShadow = 'none';
            } else if (shadow === 'box') {
                elDiv.style.boxShadow = '0 3px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)';
            } else if (shadow === 'sticker') {
                elDiv.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.16), 0 6px 12px rgba(0, 0, 0, 0.12)';
            } else if (shadow === 'paper') {
                elDiv.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.22), 0 5px 15px rgba(0, 0, 0, 0.15)';
            } else if (shadow === 'film') {
                elDiv.style.boxShadow = '6px 6px 0px 0px #000000';
                elDiv.style.border = '2px solid #000000';
            }
        } else {
            elDiv.style.backgroundColor = el.color || (el.type === 'sticker' ? '#fef08a' : '#ffffff');
            
            const br = el.borderRadius !== undefined ? el.borderRadius : 8;
            elDiv.style.borderRadius = `${br}px`;

            elDiv.style.border = ''; // сброс
            const shadow = el.shadowType || 'box';
            if (shadow === 'none') {
                elDiv.style.boxShadow = 'none';
            } else if (shadow === 'box') {
                elDiv.style.boxShadow = '0 3px 6px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)';
            } else if (shadow === 'sticker') {
                elDiv.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.16), 0 6px 12px rgba(0, 0, 0, 0.12)';
            } else if (shadow === 'paper') {
                elDiv.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.22), 0 5px 15px rgba(0, 0, 0, 0.15)';
            } else if (shadow === 'film') {
                elDiv.style.boxShadow = '6px 6px 0px 0px #000000';
                elDiv.style.border = '2px solid #000000';
            }
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'element-delete-btn';
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            deleteElement(el.id);
        });
        elDiv.appendChild(delBtn);

        // Для рисунков и встроенных досок убираем возможность изменения размера (скрываем ресайзер)
        if (el.type !== 'drawing' && el.type !== 'board') {
            resizeHandle = document.createElement('div');
            resizeHandle.className = 'element-resize-handle handle-se';
            elDiv.appendChild(resizeHandle);
        }

        if (el.type === 'drawing') {
            const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            const viewW = el.originalWidth || el.width;
            const viewH = el.originalHeight || el.height;
            svgEl.setAttribute("viewBox", `0 0 ${viewW} ${viewH}`);
            svgEl.setAttribute("width", "100%");
            svgEl.setAttribute("height", "100%");

            if (el.strokes) {
                el.strokes.forEach(stroke => {
                    if (!stroke.points || stroke.points.length === 0) return;
                    const toolType = stroke.toolType || 'pencil';
                    const baseW = stroke.baseWidth || (toolType === 'highlighter' ? 18 : 4);
                    const opacity = stroke.opacity !== undefined ? stroke.opacity : (toolType === 'highlighter' ? 0.45 : 1.0);

                    const { d, strokeWidth } = buildSvgPathAndWidth(stroke.points, baseW, toolType);
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute("stroke", stroke.color || "#000");
                    path.setAttribute("stroke-width", strokeWidth.toFixed(1));
                    path.setAttribute("fill", "none");
                    path.setAttribute("stroke-linecap", toolType === 'highlighter' ? "butt" : "round");
                    path.setAttribute("stroke-linejoin", "round");
                    path.setAttribute("stroke-opacity", opacity.toString());

                    if (toolType === 'highlighter') {
                        path.style.mixBlendMode = 'multiply';
                    }

                    path.setAttribute("d", d);
                    svgEl.appendChild(path);
                });
            }
            elDiv.appendChild(svgEl);
            elDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                editExistingDrawing(el.id);
            });
        }
        else if (el.type === 'text' || el.type === 'sticker') {
            const textEl = document.createElement('div');
            textEl.className = 'el-text-content';
            textEl.contentEditable = "false"; // По умолчанию выключено редактирование
            textEl.setAttribute('data-id', el.id);
            textEl.innerHTML = el.content || '';
            
            textEl.addEventListener('paste', (e) => {
                e.preventDefault();
                const html = e.clipboardData.getData('text/html');
                if (html) {
                    // Очищаем HTML от стилей, шрифтов и размеров, но сохраняем разметку (заголовки, жирность, списки)
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    
                    const cleanNode = (node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            node.removeAttribute('style');
                            node.removeAttribute('class');
                            node.removeAttribute('id');
                            node.removeAttribute('face');
                            node.removeAttribute('size');
                            node.removeAttribute('color');
                            
                            if (node.tagName.toLowerCase() === 'font') {
                                const span = document.createElement('span');
                                span.innerHTML = node.innerHTML;
                                node.parentNode.replaceChild(span, node);
                                node = span;
                            }
                        }
                        for (let i = 0; i < node.childNodes.length; i++) {
                            cleanNode(node.childNodes[i]);
                        }
                    };
                    
                    cleanNode(doc.body);
                    document.execCommand('insertHTML', false, doc.body.innerHTML);
                } else {
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                }
            });

            // Автосохранение чекбоксов в чеклисте при их клике/изменении
            textEl.addEventListener('change', (e) => {
                if (e.target && e.target.type === 'checkbox') {
                    if (e.target.checked) {
                        e.target.setAttribute('checked', 'checked');
                    } else {
                        e.target.removeAttribute('checked');
                    }
                    saveUndoState();
                    el.content = textEl.innerHTML;
                    saveElement(el);
                }
            });

            textEl.addEventListener('blur', () => {
                textEl.contentEditable = "false";
                const cleanHTML = linkifyHTML(textEl.innerHTML);
                textEl.innerHTML = cleanHTML;
                const newText = textEl.innerHTML;
                if (el.content !== newText) {
                    saveUndoState();
                    el.content = newText;
                    el.height = elDiv.offsetHeight;
                    saveElement(el);
                }
            });
            
            textEl.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });

            elDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                textEl.contentEditable = "true";
                textEl.focus();
                
                // Перемещаем курсор в конец текста
                if (window.getSelection && document.createRange) {
                    const range = document.createRange();
                    range.selectNodeContents(textEl);
                    range.collapse(false); // false означает схлопнуть в конец
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            });

            elDiv.appendChild(textEl);

            // Если элемент редактируется в данный момент (только что создан)
            if (editingElementId === el.id) {
                textEl.contentEditable = "true";
                setTimeout(() => {
                    textEl.focus();
                    editingElementId = null;
                }, 50);
            }
        } 
        else if (el.type === 'frame') {
            const frameTitle = document.createElement('div');
            frameTitle.className = 'frame-title';
            frameTitle.contentEditable = true;
            frameTitle.innerText = el.content || 'Группа';
            frameTitle.addEventListener('blur', () => {
                saveUndoState();
                el.content = frameTitle.innerText;
                saveElement(el);
            });
            frameTitle.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });
            elDiv.appendChild(frameTitle);
        }
        else if (el.type === 'column') {
            elDiv.innerHTML = '';
            elDiv.appendChild(delBtn);
            elDiv.appendChild(resizeHandle);

            const colHeader = document.createElement('div');
            colHeader.className = 'column-header';

            const colTitle = document.createElement('div');
            colTitle.className = 'column-title';
            colTitle.contentEditable = true;
            colTitle.innerText = el.content || 'Название столбца';
            colTitle.addEventListener('blur', () => {
                const newContent = colTitle.innerText.trim();
                if (el.content !== newContent) {
                    saveUndoState();
                    el.content = newContent;
                    saveElement(el);
                }
            });
            colTitle.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    colTitle.blur();
                }
            });
            colHeader.appendChild(colTitle);

            const childElements = Object.values(elements).filter(child => child.parentId === el.id);
            const colSubtitle = document.createElement('div');
            colSubtitle.className = 'column-subtitle';
            colSubtitle.innerText = formatElementsCount(childElements);
            colHeader.appendChild(colSubtitle);

            elDiv.appendChild(colHeader);
        }
        else if (el.type === 'image') {
            elDiv.style.display = 'flex';
            elDiv.style.flexDirection = 'column';
            
            const img = document.createElement('img');
            img.src = el.imageUrl;
            img.style.flex = '1';
            img.style.minHeight = '0';
            img.style.width = '100%';
            img.style.objectFit = 'cover';
            img.style.pointerEvents = 'none';
            elDiv.appendChild(img);
            
            if (el.hasCaption) {
                const capContainer = document.createElement('div');
                capContainer.className = 'image-caption-container';
                
                const caption = document.createElement('div');
                caption.className = 'image-caption';
                caption.contentEditable = 'true';
                caption.setAttribute('placeholder', 'Описание картинки...');
                caption.innerHTML = el.caption || '';
                
                caption.addEventListener('blur', () => {
                    saveUndoState();
                    const cleanHTML = linkifyHTML(caption.innerHTML);
                    caption.innerHTML = cleanHTML;
                    el.caption = caption.innerHTML;
                    saveElement(el);
                });
                
                caption.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                });

                caption.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                });
                
                capContainer.appendChild(caption);
                elDiv.appendChild(capContainer);
            }
        }
        else if (el.type === 'link') {
            elDiv.innerHTML = '';
            elDiv.appendChild(delBtn);
            elDiv.appendChild(resizeHandle);

            const aLink = document.createElement('a');
            aLink.href = el.url;
            aLink.target = '_blank';
            aLink.className = 'el-link';

            if (el.imageUrl) {
                const img = document.createElement('img');
                img.src = el.imageUrl;
                img.className = 'link-preview-image';
                aLink.appendChild(img);
            } else {
                const gradDiv = document.createElement('div');
                gradDiv.className = 'link-preview-image-gradient';
                gradDiv.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.95;">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                `;
                aLink.appendChild(gradDiv);
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = 'link-preview-content';

            const title = document.createElement('div');
            title.className = 'link-preview-title';
            title.innerText = el.content || 'Ссылка';
            contentDiv.appendChild(title);

            const desc = document.createElement('div');
            desc.className = 'link-preview-desc';
            desc.innerText = el.description || '';
            contentDiv.appendChild(desc);

            const urlTag = document.createElement('div');
            urlTag.className = 'link-url-tag';
            urlTag.innerText = el.url;
            contentDiv.appendChild(urlTag);

            aLink.appendChild(contentDiv);
            elDiv.appendChild(aLink);
        }
        else if (el.type === 'board') {
            elDiv.innerHTML = '';
            elDiv.appendChild(delBtn);

            const boardLink = document.createElement('div');
            boardLink.className = 'el-board-link';
            
            const iconDiv = document.createElement('div');
            iconDiv.className = 'board-link-icon';
            const iconBgColor = getBoardIconColor(el);
            const iconStroke = getBoardIconStrokeColor(iconBgColor);
            iconDiv.style.backgroundColor = iconBgColor;
            if (iconBgColor === '#ffffff' || iconBgColor === '#fff' || iconBgColor === 'white') {
                iconDiv.style.border = '1px solid rgba(0, 0, 0, 0.12)';
            } else {
                iconDiv.style.border = 'none';
            }
            iconDiv.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconStroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                </svg>
            `;
            boardLink.appendChild(iconDiv);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'board-link-content';

            const title = document.createElement('div');
            title.className = 'board-link-title';
            title.innerText = el.content || 'Встроенная доска';
            contentDiv.appendChild(title);

            const desc = document.createElement('div');
            desc.className = 'board-link-desc';
            desc.innerText = getSubboardStatsText(el.targetBoardId);
            contentDiv.appendChild(desc);

            if (currentUid && db && el.targetBoardId) {
                const subElementsColl = collection(db, "users", currentUid, "whiteboards", el.targetBoardId, "elements");
                getDocs(subElementsColl).then(snap => {
                    const subElsArr = [];
                    snap.forEach(d => subElsArr.push(d.data()));
                    desc.innerText = formatElementsCount(subElsArr);
                    const localObj = {};
                    subElsArr.forEach(item => { localObj[item.id] = item; });
                    localStorage.setItem(`board_elements_${el.targetBoardId}`, JSON.stringify(localObj));
                }).catch(() => {});
            }

            boardLink.appendChild(contentDiv);
            elDiv.appendChild(boardLink);

            elDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                window.location.search = `?id=${el.targetBoardId}`;
            });
        }

        elementsLayer.appendChild(elDiv);
    });
    updateElementOptionsPanel();
    updateSelectionOverlay();
}

// === ОБРАБОТКА ДРАГ-Н-ДРОПА, РЕСАЙЗА И РИСОВАНИЯ ===

boardViewport.addEventListener('mousedown', (e) => {
    if (isPanning) return;

    const target = e.target;

    const rect = boardCanvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / zoom;
    const clickY = (e.clientY - rect.top) / zoom;

    if (target.closest('[contenteditable="true"]') || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return; 
    }

    if (document.activeElement && (document.activeElement.getAttribute('contenteditable') === 'true' || document.activeElement.tagName === 'INPUT')) {
        document.activeElement.blur();
        window.getSelection().removeAllRanges();
    }

    // 1. Рисование внутри сессии (PencilKit style)
    if (activeTool === 'draw') {
        if (localDrawingTool === 'select') {
            let foundIndex = -1;
            localStrokes.forEach((stroke, index) => {
                const touched = stroke.points.some(pt => {
                    const dx = pt.x - clickX;
                    const dy = pt.y - clickY;
                    const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 10);
                    return Math.sqrt(dx * dx + dy * dy) < r;
                });
                if (touched) foundIndex = index;
            });

            if (foundIndex !== -1) {
                selectedLocalStrokeIndex = foundIndex;
                const strokeToMove = localStrokes[foundIndex];
                dragStartInfo = {
                    type: 'local-stroke-drag',
                    strokeIndex: foundIndex,
                    startX: clickX,
                    startY: clickY,
                    initialPoints: strokeToMove.points.map(pt => ({ ...pt }))
                };
            } else {
                selectedLocalStrokeIndex = -1;
                dragStartInfo = null;
            }
            redrawLocalStrokes();
            e.preventDefault();
            return;
        } else if (localDrawingTool === 'eraser') {
            localStrokes = localStrokes.filter(stroke => {
                const touched = stroke.points.some(pt => {
                    const dx = pt.x - clickX;
                    const dy = pt.y - clickY;
                    const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                    return Math.sqrt(dx*dx + dy*dy) < r;
                });
                return !touched;
            });
            redrawLocalStrokes();
            dragStartInfo = { type: 'local-eraser-drag' };
        } else {

            isDrawing = true;
            activeDrawingPoints = [{ x: clickX, y: clickY, pressure: 0.5 }];
            
            const tool = localDrawingTool;
            const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
            const opacity = toolSettings[tool] ? toolSettings[tool].opacity : 1.0;

            const { d, strokeWidth } = buildSvgPathAndWidth(activeDrawingPoints, baseW, tool);
            activeDrawingPathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
            activeDrawingPathEl.setAttribute("stroke", activeColor);
            activeDrawingPathEl.setAttribute("stroke-width", strokeWidth.toFixed(1));
            activeDrawingPathEl.setAttribute("fill", "none");
            activeDrawingPathEl.setAttribute("stroke-linecap", tool === 'highlighter' ? "butt" : "round");
            activeDrawingPathEl.setAttribute("stroke-linejoin", "round");
            activeDrawingPathEl.setAttribute("stroke-opacity", opacity.toString());

            if (tool === 'highlighter') {
                activeDrawingPathEl.style.mixBlendMode = 'multiply';
            }

            activeDrawingPathEl.setAttribute("d", d);
            drawingLayer.appendChild(activeDrawingPathEl);
        }
        e.preventDefault();
        return;
    }

    if (activeTool === 'eraser') {
        const elementDiv = target.closest('.board-element');
        if (elementDiv) {
            const elId = elementDiv.getAttribute('data-id');
            deleteElement(elId);
            e.preventDefault();
        }
        return;
    }

    // 2. Изменение границ доски за края
    if (target.classList.contains('canvas-resize-handle')) {
        saveUndoState();
        const edge = target.getAttribute('data-edge');
        dragStartInfo = {
            type: 'canvas-resize',
            edge: edge,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: boardConfig.width,
            startHeight: boardConfig.height
        };
        e.preventDefault();
        return;
    }

    // 2.5. Ресайз через оверлей (selection overlay)
    if (target.classList.contains('selection-overlay-handle')) {
        saveUndoState();
        const handleType = target.className.split(' ').find(c => c.startsWith('handle-')).replace('handle-', '');
        
        if (selectedElementIds.size === 1) {
            const singleId = Array.from(selectedElementIds)[0];
            if (elements[singleId] && elements[singleId].type === 'board') {
                e.preventDefault();
                return;
            }
            dragStartInfo = {
                type: 'resize',
                id: singleId,
                handle: handleType,
                startX: e.clientX,
                startY: e.clientY,
                startW: elements[singleId].width,
                startH: elements[singleId].height,
                startXPos: elements[singleId].x,
                startYPos: elements[singleId].y
            };
        }
        e.preventDefault();
        return;
    }

    // 3. Выделение, изменение размера и перетаскивание элементов
    const elementDiv = target.closest('.board-element');
    
    if (elementDiv) {
        const elId = elementDiv.getAttribute('data-id');
        
        if (!selectedElementIds.has(elId)) {
            if (!e.shiftKey) {
                selectedElementIds.clear();
                document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));
            }
            selectedElementIds.add(elId);
            elementDiv.classList.add('selected');
        }

        const allElementsArray = Object.values(elements);
        const maxZ = allElementsArray.reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
        
        selectedElementIds.forEach(id => {
            if (elements[id] && elements[id].zIndex !== maxZ) {
                elements[id].zIndex = maxZ + 1;
                saveElement(elements[id]);
            }
        });

        // Ресайз элемента (одиночный)
        if (target.classList.contains('element-resize-handle')) {
            saveUndoState();
            dragStartInfo = {
                type: 'resize',
                id: elId,
                startX: e.clientX,
                startY: e.clientY,
                startW: elements[elId].width,
                startH: elements[elId].height
            };
        } 
        // Групповое перемещение элементов
        else {
            saveUndoState();
            dragStartInfo = {
                type: 'element',
                id: elId,
                startX: e.clientX,
                startY: e.clientY,
                initialPositions: {}
            };
            selectedElementIds.forEach(id => {
                const elObj = elements[id];
                if (elObj) {
                    const elDiv = document.querySelector(`.board-element[data-id="${id}"]`);
                    if (elDiv) {
                        elObj.width = elDiv.offsetWidth;
                        elObj.height = elDiv.offsetHeight;
                    }
                    dragStartInfo.initialPositions[id] = {
                        x: elObj.x,
                        y: elObj.y
                    };
                }
            });
        }
        e.preventDefault();
    } else {
        // Клик по пустому холсту - сброс выделения и старт прямоугольного выделения (marquee)
        if (e.button === 0 && activeTool === 'select' && (e.target === boardViewport || e.target === boardCanvas)) {
            selectedElementIds.clear();
            document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));

            dragStartInfo = {
                type: 'selection-marquee',
                startX: e.clientX,
                startY: e.clientY,
                boardStartX: clickX,
                boardStartY: clickY
            };

            const marquee = document.createElement('div');
            marquee.className = 'selection-box';
            marquee.style.left = `${clickX}px`;
            marquee.style.top = `${clickY}px`;
            marquee.style.width = '0px';
            marquee.style.height = '0px';
            boardCanvas.appendChild(marquee);
            dragStartInfo.marqueeEl = marquee;
            
            e.preventDefault();
        }
    }
    updateSelectionOverlay();
});

boardViewport.addEventListener('mousemove', (e) => {
    if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        updateTransform();
        return;
    }

    const rect = boardCanvas.getBoundingClientRect();
    const curX = (e.clientX - rect.left) / zoom;
    const curY = (e.clientY - rect.top) / zoom;

    // Подсветка штрихов красным контуром в стиле Milanote при наведении ластика
    const isEraserActive = (activeTool === 'draw' && localDrawingTool === 'eraser') || activeTool === 'eraser';
    if (isEraserActive && !isDrawing && !dragStartInfo) {
        const newHovered = new Set();
        localStrokes.forEach((stroke, index) => {
            const touched = stroke.points.some(pt => {
                const dx = pt.x - curX;
                const dy = pt.y - curY;
                const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                return Math.sqrt(dx * dx + dy * dy) < r;
            });
            if (touched) newHovered.add(index);
        });

        let changed = newHovered.size !== hoveredEraserStrokeIndices.size;
        if (!changed) {
            for (let idx of newHovered) {
                if (!hoveredEraserStrokeIndices.has(idx)) {
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            hoveredEraserStrokeIndices = newHovered;
            redrawLocalStrokes();
        }
    } else if (hoveredEraserStrokeIndices.size > 0 && !dragStartInfo) {
        hoveredEraserStrokeIndices.clear();
        redrawLocalStrokes();
    }

    // Подсветка элементов доски при глобальном ластике
    if (activeTool === 'eraser' && !dragStartInfo) {
        const elementDiv = e.target.closest ? e.target.closest('.board-element') : null;
        document.querySelectorAll('.board-element.eraser-hover-target').forEach(el => {
            if (el !== elementDiv) el.classList.remove('eraser-hover-target');
        });
        if (elementDiv) {
            elementDiv.classList.add('eraser-hover-target');
        }
    } else {
        document.querySelectorAll('.board-element.eraser-hover-target').forEach(el => {
            el.classList.remove('eraser-hover-target');
        });
    }

    if (dragStartInfo && dragStartInfo.type === 'local-stroke-drag') {
        const deltaX = curX - dragStartInfo.startX;
        const deltaY = curY - dragStartInfo.startY;
        const stroke = localStrokes[dragStartInfo.strokeIndex];
        if (stroke && dragStartInfo.initialPoints) {
            stroke.points = dragStartInfo.initialPoints.map(pt => ({
                ...pt,
                x: pt.x + deltaX,
                y: pt.y + deltaY
            }));
            redrawLocalStrokes();
        }
        return;
    }

    if (dragStartInfo && dragStartInfo.type === 'local-eraser-drag') {
        localStrokes = localStrokes.filter(stroke => {
            const touched = stroke.points.some(pt => {
                const dx = pt.x - curX;
                const dy = pt.y - curY;
                const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                return Math.sqrt(dx*dx + dy*dy) < r;
            });
            return !touched;
        });
        hoveredEraserStrokeIndices.clear();
        redrawLocalStrokes();
        return;
    }


    if (isDrawing && activeDrawingPathEl) {
        activeDrawingPoints.push({ x: curX, y: curY, pressure: 0.5 });
        
        const tool = localDrawingTool;
        const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
        const { d, strokeWidth } = buildSvgPathAndWidth(activeDrawingPoints, baseW, tool);
        activeDrawingPathEl.setAttribute("d", d);
        activeDrawingPathEl.setAttribute("stroke-width", strokeWidth.toFixed(1));
        return;
    }

    if (!dragStartInfo) return;


    const deltaX = (e.clientX - dragStartInfo.startX) / zoom;
    const deltaY = (e.clientY - dragStartInfo.startY) / zoom;

    // Прямоугольное выделение (Marquee)
    if (dragStartInfo.type === 'selection-marquee') {
        const x = Math.min(dragStartInfo.boardStartX, curX);
        const y = Math.min(dragStartInfo.boardStartY, curY);
        const w = Math.abs(dragStartInfo.boardStartX - curX);
        const h = Math.abs(dragStartInfo.boardStartY - curY);
        
        dragStartInfo.marqueeEl.style.left = `${x}px`;
        dragStartInfo.marqueeEl.style.top = `${y}px`;
        dragStartInfo.marqueeEl.style.width = `${w}px`;
        dragStartInfo.marqueeEl.style.height = `${h}px`;
        
        selectedElementIds.clear();
        Object.values(elements).forEach(el => {
            const overlaps = (el.x < x + w && el.x + el.width > x &&
                              el.y < y + h && el.y + el.height > y);
            
            const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
            if (overlaps) {
                selectedElementIds.add(el.id);
                if (elDiv) elDiv.classList.add('selected');
            } else {
                if (elDiv) elDiv.classList.remove('selected');
            }
        });
        return;
    }

    // Изменение размера холста
    if (dragStartInfo.type === 'canvas-resize') {
        const rawDeltaX = e.clientX - dragStartInfo.startX;
        const rawDeltaY = e.clientY - dragStartInfo.startY;

        if (dragStartInfo.edge === 'right') {
            let maxRight = 800;
            Object.values(elements).forEach(el => {
                const r = el.x + el.width;
                if (r > maxRight) maxRight = r;
            });
            boardConfig.width = Math.max(maxRight + 40, dragStartInfo.startWidth + rawDeltaX / zoom);
        }
        else if (dragStartInfo.edge === 'bottom') {
            let maxBottom = 600;
            Object.values(elements).forEach(el => {
                const b = el.y + el.height;
                if (b > maxBottom) maxBottom = b;
            });
            boardConfig.height = Math.max(maxBottom + 40, dragStartInfo.startHeight + rawDeltaY / zoom);
        }
        else if (dragStartInfo.edge === 'left') {
            let minX = Infinity;
            Object.values(elements).forEach(el => {
                if (el.x < minX) minX = el.x;
            });
            const allowedShift = minX !== Infinity ? minX - 30 : Infinity;
            const requestedShift = rawDeltaX / zoom;
            const shift = Math.min(allowedShift, requestedShift);
            
            const newWidth = dragStartInfo.startWidth - shift;
            if (newWidth >= 800) {
                boardConfig.width = newWidth;
                panX += shift * zoom;
                
                Object.values(elements).forEach(el => {
                    el.x -= shift;
                });
                dragStartInfo.startX = dragStartInfo.startX + shift * zoom;
                dragStartInfo.startWidth = newWidth;
            }
        }
        else if (dragStartInfo.edge === 'top') {
            let minY = Infinity;
            Object.values(elements).forEach(el => {
                if (el.y < minY) minY = el.y;
            });
            const allowedShift = minY !== Infinity ? minY - 30 : Infinity;
            const requestedShift = rawDeltaY / zoom;
            const shift = Math.min(allowedShift, requestedShift);
            
            const newHeight = dragStartInfo.startHeight - shift;
            if (newHeight >= 600) {
                boardConfig.height = newHeight;
                panY += shift * zoom;
                
                Object.values(elements).forEach(el => {
                    el.y -= shift;
                });
                dragStartInfo.startY = dragStartInfo.startY + shift * zoom;
                dragStartInfo.startHeight = newHeight;
            }
        }
        updateCanvasSize();
        updateTransform();
        renderElements();
    }

    // Групповое перемещение элементов
    else if (dragStartInfo.type === 'element') {
        selectedElementIds.forEach(id => {
            const el = elements[id];
            const startPos = dragStartInfo.initialPositions[id];
            if (el && startPos) {
                const prevX = el.x;
                const prevY = el.y;
                
                el.x = Math.max(0, Math.min(startPos.x + deltaX, boardConfig.width - el.width));
                el.y = Math.max(0, Math.min(startPos.y + deltaY, boardConfig.height - el.height));
                
                if (el.type === 'frame' || el.type === 'column') {
                    const dX = el.x - prevX;
                    const dY = el.y - prevY;
                    Object.values(elements).forEach(child => {
                        if (child.parentId === el.id) {
                            child.x += dX;
                            child.y += dY;
                            
                            const childDiv = document.querySelector(`.board-element[data-id="${child.id}"]`);
                            if (childDiv) {
                                childDiv.style.left = `${child.x}px`;
                                childDiv.style.top = `${child.y}px`;
                            }
                        }
                    });
                }

                const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
                if (elDiv) {
                    elDiv.style.left = `${el.x}px`;
                    elDiv.style.top = `${el.y}px`;
                }
            }
        });
    }

    // Ресайз элемента (одиночный)
    else if (dragStartInfo.type === 'resize') {
        const el = elements[dragStartInfo.id];
        const handle = dragStartInfo.handle;
        
        let minW = 60;
        let minH = 40;
        if (el.type === 'text') {
            minW = 160;
            minH = 48;
        } else if (el.type === 'sticker') {
            minW = 80;
            minH = 80;
        }
        
        let newWidth = el.width;
        let newHeight = el.height;
        let newX = el.x;
        let newY = el.y;
        
        const lockAspectRatio = (el.type === 'drawing' || el.type === 'image');
        let ratio;
        if (el.type === 'image' && el.hasCaption) {
            ratio = dragStartInfo.startW / Math.max(1, dragStartInfo.startH - 48);
        } else {
            ratio = dragStartInfo.startW / dragStartInfo.startH;
        }
        
        if (lockAspectRatio) {
            let targetWidth = dragStartInfo.startW;
            if (handle === 'br' || handle === 'tr') {
                targetWidth = dragStartInfo.startW + deltaX;
            } else {
                targetWidth = dragStartInfo.startW - deltaX;
            }
            
            let targetHeight;
            if (el.type === 'image' && el.hasCaption) {
                targetHeight = (targetWidth / ratio) + 48;
            } else {
                targetHeight = targetWidth / ratio;
            }
            
            if (targetWidth < minW) {
                targetWidth = minW;
                if (el.type === 'image' && el.hasCaption) {
                    targetHeight = (targetWidth / ratio) + 48;
                } else {
                    targetHeight = targetWidth / ratio;
                }
            }
            
            const minHeightLimit = el.type === 'image' && el.hasCaption ? (minH + 48) : minH;
            if (targetHeight < minHeightLimit) {
                targetHeight = minHeightLimit;
                if (el.type === 'image' && el.hasCaption) {
                    targetWidth = (targetHeight - 48) * ratio;
                } else {
                    targetWidth = targetHeight * ratio;
                }
            }
            
            newWidth = targetWidth;
            newHeight = targetHeight;
            
            if (handle === 'bl' || handle === 'tl') {
                newX = dragStartInfo.startXPos + (dragStartInfo.startW - newWidth);
            }
            if (handle === 'tr' || handle === 'tl') {
                newY = dragStartInfo.startYPos + (dragStartInfo.startH - newHeight);
            }
        } else {
            if (handle === 'br') {
                newWidth = Math.max(minW, dragStartInfo.startW + deltaX);
                newHeight = Math.max(minH, dragStartInfo.startH + deltaY);
            } else if (handle === 'bl') {
                newWidth = Math.max(minW, dragStartInfo.startW - deltaX);
                newHeight = Math.max(minH, dragStartInfo.startH + deltaY);
                if (newWidth > minW) {
                    newX = dragStartInfo.startXPos + deltaX;
                }
            } else if (handle === 'tr') {
                newWidth = Math.max(minW, dragStartInfo.startW + deltaX);
                newHeight = Math.max(minH, dragStartInfo.startH - deltaY);
                if (newHeight > minH) {
                    newY = dragStartInfo.startYPos + deltaY;
                }
            } else if (handle === 'tl') {
                newWidth = Math.max(minW, dragStartInfo.startW - deltaX);
                newHeight = Math.max(minH, dragStartInfo.startH - deltaY);
                if (newWidth > minW) {
                    newX = dragStartInfo.startXPos + deltaX;
                }
                if (newHeight > minH) {
                    newY = dragStartInfo.startYPos + deltaY;
                }
            }
        }
        
        el.width = newWidth;
        el.height = newHeight;
        el.x = newX;
        el.y = newY;

        const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
        if (elDiv) {
            elDiv.style.width = `${el.width}px`;
            elDiv.style.height = `${el.height}px`;
            elDiv.style.left = `${el.x}px`;
            elDiv.style.top = `${el.y}px`;
        }
    }
    
    if (typeof updateElementOptionsPanel === 'function') {
        updateElementOptionsPanel();
    }
    updateSelectionOverlay();
});


boardViewport.addEventListener('mouseleave', () => {
    if (hoveredEraserStrokeIndices.size > 0) {
        hoveredEraserStrokeIndices.clear();
        redrawLocalStrokes();
    }
    document.querySelectorAll('.board-element.eraser-hover-target').forEach(el => {
        el.classList.remove('eraser-hover-target');
    });
});

boardViewport.addEventListener('mouseup', (e) => {
    setTimeout(() => {
        updateSelectionOverlay();
        if (typeof updateElementOptionsPanel === 'function') {
            updateElementOptionsPanel();
        }
    }, 0);
    if (isPanning) {
        isPanning = false;
        boardViewport.style.cursor = isSpacePressed ? 'grab' : 'default';
        return;
    }

    // Завершаем текущую линию в локальной сессии рисования
    if (isDrawing) {
        isDrawing = false;
        if (activeDrawingPoints.length > 1) {
            const tool = localDrawingTool;
            const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
            const opacity = toolSettings[tool] ? toolSettings[tool].opacity : 1.0;
            localStrokes.push({
                color: activeColor,
                toolType: tool,
                baseWidth: baseW,
                opacity: opacity,
                points: activeDrawingPoints
            });
            localRedoStrokes = []; // Очищаем redo-буфер при рисовании нового штриха
        }
        if (activeDrawingPathEl) {
            activeDrawingPathEl.remove();
            activeDrawingPathEl = null;
        }
        redrawLocalStrokes();
        return;
    }

    if (!dragStartInfo) return;

    if (dragStartInfo.type === 'local-stroke-drag' || dragStartInfo.type === 'local-eraser-drag') {
        dragStartInfo = null;
        return;
    }


    if (dragStartInfo.type === 'selection-marquee') {
        if (dragStartInfo.marqueeEl) {
            dragStartInfo.marqueeEl.remove();
        }
        dragStartInfo = null;
        return;
    }

    if (dragStartInfo.type === 'canvas-resize') {
        saveBoardInfo();
        if (!currentUid) {
            localStorage.setItem(`board_elements_${activeBoardId}`, JSON.stringify(elements));
        } else {
            Object.values(elements).forEach(el => saveElement(el));
        }
    }
    else if (dragStartInfo.type === 'element') {
        selectedElementIds.forEach(id => {
            const el = elements[id];
            if (el) {
                if (selectedElementIds.size === 1) {
                    let newParentId = null;
                    if (el.type !== 'frame' && el.type !== 'column') {
                        const elCenter = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
                        const containers = Object.values(elements).filter(f => (f.type === 'frame' || f.type === 'column') && f.id !== el.id);
                        for (let container of containers) {
                            if (elCenter.x >= container.x && elCenter.x <= container.x + container.width &&
                                elCenter.y >= container.y && elCenter.y <= container.y + container.height) {
                                newParentId = container.id;
                                break;
                            }
                        }
                    }
                    el.parentId = newParentId;
                }
                saveElement(el);
                if (el.type === 'frame' || el.type === 'column') {
                    Object.values(elements).forEach(child => {
                        if (child.parentId === el.id) {
                            saveElement(child);
                        }
                    });
                }
            }
        });

        if (typeof layoutColumns === 'function') {
            layoutColumns(true);
        }
    } 
    else if (dragStartInfo.type === 'resize') {
        saveElement(elements[dragStartInfo.id]);
    }

    dragStartInfo = null;
    if (typeof updateElementOptionsPanel === 'function') {
        updateElementOptionsPanel();
    }
    updateSelectionOverlay();
});

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function showSaveStatus(text) {
    saveStatus.innerText = text;
}

btnToggleGrid.addEventListener('click', () => {
    btnToggleGrid.classList.toggle('active');
    boardCanvas.classList.toggle('no-grid');
});

function adjustTitleInputWidth() {
    if (!boardTitleInput) return;
    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.whiteSpace = 'pre';
    const style = window.getComputedStyle(boardTitleInput);
    tempSpan.style.fontSize = style.fontSize;
    tempSpan.style.fontWeight = style.fontWeight;
    tempSpan.style.fontFamily = style.fontFamily;
    tempSpan.style.letterSpacing = style.letterSpacing;
    tempSpan.innerText = boardTitleInput.value || boardTitleInput.placeholder || '';
    document.body.appendChild(tempSpan);
    boardTitleInput.style.width = Math.min(Math.max(tempSpan.getBoundingClientRect().width + 24, 120), 450) + 'px';
    document.body.removeChild(tempSpan);
}

boardTitleInput.addEventListener('input', adjustTitleInputWidth);
boardTitleInput.addEventListener('blur', saveBoardInfo);
boardTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        boardTitleInput.blur();
    }
});

// === ОБРАБОТКА ТАЧ-СОБЫТИЙ ДЛЯ ПЛАНШЕТОВ / СЕНСОРНЫХ ЭКРАНОВ ===
let isTouchPanning = false;
let startTouchPanX = 0;
let startTouchPanY = 0;
let startTouchZoom = 1;
let startTouchDist = 0;
let touchStartX = 0;
let touchStartY = 0;
let touchedElementIdCandidate = null;
let isTouchOnAlreadySelected = false;

boardViewport.addEventListener('touchstart', (e) => {
    if (e.target.closest('a') || e.target.closest('button') || e.target.closest('[contenteditable="true"]') || e.target.closest('input') || e.target.closest('.pencilkit-dock') || e.target.closest('.element-options-panel')) {
        return; 
    }

    if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchedElementIdCandidate = null;
        isTouchOnAlreadySelected = false;

        const target = touch.target;
        const rect = boardCanvas.getBoundingClientRect();
        const clickX = (touch.clientX - rect.left) / zoom;
        const clickY = (touch.clientY - rect.top) / zoom;

        const touchedElement = target.closest('.board-element');
        const handleEl = target.closest('.selection-overlay-handle') || target.closest('.element-resize-handle');

        if (activeTool === 'draw') {
            isTouchPanning = false;
            if (localDrawingTool === 'select') {
                let foundIndex = -1;
                localStrokes.forEach((stroke, index) => {
                    const touched = stroke.points.some(pt => {
                        const dx = pt.x - clickX;
                        const dy = pt.y - clickY;
                        const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 10);
                        return Math.sqrt(dx * dx + dy * dy) < r;
                    });
                    if (touched) foundIndex = index;
                });

                if (foundIndex !== -1) {
                    selectedLocalStrokeIndex = foundIndex;
                    const strokeToMove = localStrokes[foundIndex];
                    dragStartInfo = {
                        type: 'local-stroke-drag',
                        strokeIndex: foundIndex,
                        startX: clickX,
                        startY: clickY,
                        initialPoints: strokeToMove.points.map(pt => ({ ...pt }))
                    };
                } else {
                    selectedLocalStrokeIndex = -1;
                    dragStartInfo = null;
                }
                redrawLocalStrokes();
                return;
            } else if (localDrawingTool === 'eraser') {
                localStrokes = localStrokes.filter(stroke => {
                    const touched = stroke.points.some(pt => {
                        const dx = pt.x - clickX;
                        const dy = pt.y - clickY;
                        const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                        return Math.sqrt(dx * dx + dy * dy) < r;
                    });
                    return !touched;
                });
                redrawLocalStrokes();
                dragStartInfo = { type: 'local-eraser-drag' };
                return;
            } else {
                isDrawing = true;
                activeDrawingPoints = [{ x: clickX, y: clickY, pressure: 0.5 }];
                
                const tool = localDrawingTool;
                const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
                const opacity = toolSettings[tool] ? toolSettings[tool].opacity : 1.0;

                const { d, strokeWidth } = buildSvgPathAndWidth(activeDrawingPoints, baseW, tool);
                activeDrawingPathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                activeDrawingPathEl.setAttribute("stroke", activeColor);
                activeDrawingPathEl.setAttribute("stroke-width", strokeWidth.toFixed(1));
                activeDrawingPathEl.setAttribute("fill", "none");
                activeDrawingPathEl.setAttribute("stroke-linecap", tool === 'highlighter' ? "butt" : "round");
                activeDrawingPathEl.setAttribute("stroke-linejoin", "round");
                activeDrawingPathEl.setAttribute("stroke-opacity", opacity.toString());

                if (tool === 'highlighter') {
                    activeDrawingPathEl.style.mixBlendMode = 'multiply';
                }

                activeDrawingPathEl.setAttribute("d", d);
                drawingLayer.appendChild(activeDrawingPathEl);
                return;
            }
        }

        if (activeTool === 'eraser') {
            isTouchPanning = false;
            if (touchedElement) {
                const elId = touchedElement.getAttribute('data-id');
                deleteElement(elId);
            }
            return;
        }

        if (handleEl) {
            isTouchPanning = false;
            saveUndoState();
            const handleType = handleEl.className.split(' ').find(c => c.startsWith('handle-')) ? handleEl.className.split(' ').find(c => c.startsWith('handle-')).replace('handle-', '') : 'br';
            
            let singleId = touchedElement ? touchedElement.getAttribute('data-id') : (selectedElementIds.size === 1 ? Array.from(selectedElementIds)[0] : null);
            if (singleId && elements[singleId]) {
                dragStartInfo = {
                    type: 'resize',
                    id: singleId,
                    handle: handleType,
                    startX: touch.clientX,
                    startY: touch.clientY,
                    startW: elements[singleId].width,
                    startH: elements[singleId].height,
                    startXPos: elements[singleId].x,
                    startYPos: elements[singleId].y
                };
            }
            return;
        }

        if (touchedElement) {
            const textContentEl = target.closest('.el-text-content');
            if (textContentEl) {
                const textRect = textContentEl.getBoundingClientRect();
                const isScrollbarArea = (touch.clientX >= textRect.right - 28);
                if (isScrollbarArea && textContentEl.scrollHeight > textContentEl.clientHeight) {
                    isTouchPanning = false;
                    dragStartInfo = {
                        type: 'text-scrollbar-scroll',
                        el: textContentEl,
                        startY: touch.clientY,
                        startScrollTop: textContentEl.scrollTop,
                        rect: textRect
                    };
                    if (e.cancelable) e.preventDefault();
                    return;
                }
            }

            const elId = touchedElement.getAttribute('data-id');
            isTouchOnAlreadySelected = selectedElementIds.has(elId);

            if (isTouchOnAlreadySelected) {
                // Элемент УЖЕ выделен -> можно сразу сдвигать его
                isTouchPanning = false;
                saveUndoState();
                dragStartInfo = {
                    type: 'element',
                    id: elId,
                    startX: touch.clientX,
                    startY: touch.clientY,
                    initialPositions: {}
                };
                selectedElementIds.forEach(id => {
                    const elObj = elements[id];
                    if (elObj) {
                        const elDiv = document.querySelector(`.board-element[data-id="${id}"]`);
                        if (elDiv) {
                            elObj.width = elDiv.offsetWidth;
                            elObj.height = elDiv.offsetHeight;
                        }
                        dragStartInfo.initialPositions[id] = { x: elObj.x, y: elObj.y };
                    }
                });
            } else {
                // Элемент НЕ выделен -> кандидат на выделение ТАПОМ. По умолчанию заготовляем панорамирование доски
                touchedElementIdCandidate = elId;
                isTouchPanning = false;
                startTouchPanX = touch.clientX - panX;
                startTouchPanY = touch.clientY - panY;
            }
            return;
        }

        // Касание пустого места
        isTouchPanning = true;
        startTouchPanX = touch.clientX - panX;
        startTouchPanY = touch.clientY - panY;

    } else if (e.touches.length === 2) {
        isTouchPanning = false;
        startTouchZoom = zoom;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        startTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
}, { passive: false });

boardViewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = boardCanvas.getBoundingClientRect();
        const curX = (touch.clientX - rect.left) / zoom;
        const curY = (touch.clientY - rect.top) / zoom;
        const dist = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);

        // Если касание началось на НЕВЫДЕЛЕННОМ элементе, но палец сдвинулся (> 8px) -> это движение/скролл доски
        if (touchedElementIdCandidate && dist > 8) {
            isTouchPanning = true;
            touchedElementIdCandidate = null; // Отменяем кандидатуру выделения
        }

        if (isTouchPanning) {
            panX = touch.clientX - startTouchPanX;
            panY = touch.clientY - startTouchPanY;
            updateTransform();
            return;
        }

        if (isDrawing && activeDrawingPathEl) {
            activeDrawingPoints.push({ x: curX, y: curY, pressure: 0.5 });
            const tool = localDrawingTool;
            const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
            const { d, strokeWidth } = buildSvgPathAndWidth(activeDrawingPoints, baseW, tool);
            activeDrawingPathEl.setAttribute("d", d);
            activeDrawingPathEl.setAttribute("stroke-width", strokeWidth.toFixed(1));
            if (e.cancelable) e.preventDefault();
            return;
        }

        if (dragStartInfo) {
            if (e.cancelable) e.preventDefault();

            if (dragStartInfo.type === 'text-scrollbar-scroll') {
                const deltaY = touch.clientY - dragStartInfo.startY;
                const scrollableH = dragStartInfo.el.scrollHeight - dragStartInfo.el.clientHeight;
                const trackH = dragStartInfo.rect.height;
                const ratio = scrollableH / Math.max(1, trackH - 30);
                dragStartInfo.el.scrollTop = Math.max(0, Math.min(scrollableH, dragStartInfo.startScrollTop + deltaY * Math.max(1, ratio)));
                return;
            }

            if (dragStartInfo.type === 'local-stroke-drag') {
                const deltaX = curX - dragStartInfo.startX;
                const deltaY = curY - dragStartInfo.startY;
                const stroke = localStrokes[dragStartInfo.strokeIndex];
                if (stroke && dragStartInfo.initialPoints) {
                    stroke.points = dragStartInfo.initialPoints.map(pt => ({
                        ...pt,
                        x: pt.x + deltaX,
                        y: pt.y + deltaY
                    }));
                    redrawLocalStrokes();
                }
                return;
            }

            if (dragStartInfo.type === 'local-eraser-drag') {
                localStrokes = localStrokes.filter(stroke => {
                    const touched = stroke.points.some(pt => {
                        const dx = pt.x - curX;
                        const dy = pt.y - curY;
                        const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                        return Math.sqrt(dx * dx + dy * dy) < r;
                    });
                    return !touched;
                });
                redrawLocalStrokes();
                return;
            }

            const deltaX = (touch.clientX - dragStartInfo.startX) / zoom;
            const deltaY = (touch.clientY - dragStartInfo.startY) / zoom;

            if (dragStartInfo.type === 'element') {
                selectedElementIds.forEach(id => {
                    const el = elements[id];
                    const startPos = dragStartInfo.initialPositions[id];
                    if (el && startPos) {
                        const prevX = el.x;
                        const prevY = el.y;
                        
                        el.x = Math.max(0, Math.min(startPos.x + deltaX, boardConfig.width - el.width));
                        el.y = Math.max(0, Math.min(startPos.y + deltaY, boardConfig.height - el.height));
                        
                        if (el.type === 'frame' || el.type === 'column') {
                            const dX = el.x - prevX;
                            const dY = el.y - prevY;
                            Object.values(elements).forEach(child => {
                                if (child.parentId === el.id) {
                                    child.x += dX;
                                    child.y += dY;
                                    const childDiv = document.querySelector(`.board-element[data-id="${child.id}"]`);
                                    if (childDiv) {
                                        childDiv.style.left = `${child.x}px`;
                                        childDiv.style.top = `${child.y}px`;
                                    }
                                }
                            });
                        }

                        const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
                        if (elDiv) {
                            elDiv.style.left = `${el.x}px`;
                            elDiv.style.top = `${el.y}px`;
                        }
                    }
                });
                updateSelectionOverlay();
                if (typeof updateElementOptionsPanel === 'function') {
                    updateElementOptionsPanel();
                }
            } else if (dragStartInfo.type === 'resize') {
                const el = elements[dragStartInfo.id];
                if (el) {
                    const handle = dragStartInfo.handle;
                    let minW = el.type === 'text' ? 160 : (el.type === 'sticker' ? 80 : 60);
                    let minH = el.type === 'text' ? 48 : (el.type === 'sticker' ? 80 : 40);

                    let newWidth = el.width;
                    let newHeight = el.height;
                    let newX = el.x;
                    let newY = el.y;

                    if (handle === 'br') {
                        newWidth = Math.max(minW, dragStartInfo.startW + deltaX);
                        newHeight = Math.max(minH, dragStartInfo.startH + deltaY);
                    } else if (handle === 'bl') {
                        newWidth = Math.max(minW, dragStartInfo.startW - deltaX);
                        newHeight = Math.max(minH, dragStartInfo.startH + deltaY);
                        if (newWidth > minW) newX = dragStartInfo.startXPos + deltaX;
                    } else if (handle === 'tr') {
                        newWidth = Math.max(minW, dragStartInfo.startW + deltaX);
                        newHeight = Math.max(minH, dragStartInfo.startH - deltaY);
                        if (newHeight > minH) newY = dragStartInfo.startYPos + deltaY;
                    } else if (handle === 'tl') {
                        newWidth = Math.max(minW, dragStartInfo.startW - deltaX);
                        newHeight = Math.max(minH, dragStartInfo.startH - deltaY);
                        if (newWidth > minW) newX = dragStartInfo.startXPos + deltaX;
                        if (newHeight > minH) newY = dragStartInfo.startYPos + deltaY;
                    }

                    el.width = newWidth;
                    el.height = newHeight;
                    el.x = newX;
                    el.y = newY;

                    const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
                    if (elDiv) {
                        elDiv.style.width = `${el.width}px`;
                        elDiv.style.height = `${el.height}px`;
                        elDiv.style.left = `${el.x}px`;
                        elDiv.style.top = `${el.y}px`;
                    }
                    updateSelectionOverlay();
                }
            }
        }
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const factor = dist / Math.max(1, startTouchDist);
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        
        const rect = boardViewport.getBoundingClientRect();
        const mouseX = centerX - rect.left;
        const mouseY = centerY - rect.top;
        
        zoomTo(startTouchZoom * factor, mouseX, mouseY);
    }
}, { passive: false });

boardViewport.addEventListener('touchend', (e) => {
    isTouchPanning = false;

    let endX = touchStartX;
    let endY = touchStartY;
    if (e.changedTouches && e.changedTouches.length > 0) {
        endX = e.changedTouches[0].clientX;
        endY = e.changedTouches[0].clientY;
    }
    const dist = Math.hypot(endX - touchStartX, endY - touchStartY);

    // Если это был ТАП (короткий клик пальцем без сдвига) по НЕВЫДЕЛЕННОМУ элементу -> ВЫДЕЛЯЕМ
    if (touchedElementIdCandidate && dist <= 8) {
        selectedElementIds.clear();
        document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));
        selectedElementIds.add(touchedElementIdCandidate);
        const elDiv = document.querySelector(`.board-element[data-id="${touchedElementIdCandidate}"]`);
        if (elDiv) elDiv.classList.add('selected');

        const allElementsArray = Object.values(elements);
        const maxZ = allElementsArray.reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
        if (elements[touchedElementIdCandidate] && elements[touchedElementIdCandidate].zIndex !== maxZ) {
            elements[touchedElementIdCandidate].zIndex = maxZ + 1;
            saveElement(elements[touchedElementIdCandidate]);
        }
    } else if (!touchedElementIdCandidate && !isTouchOnAlreadySelected && dist <= 8 && activeTool !== 'draw') {
        // ТАП по пустому месту -> СНИМАЕМ выделение
        selectedElementIds.clear();
        document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));
    }

    touchedElementIdCandidate = null;
    isTouchOnAlreadySelected = false;

    if (isDrawing) {
        isDrawing = false;
        if (activeDrawingPoints.length > 1) {
            const tool = localDrawingTool;
            const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
            const opacity = toolSettings[tool] ? toolSettings[tool].opacity : 1.0;
            localStrokes.push({
                color: activeColor,
                toolType: tool,
                baseWidth: baseW,
                opacity: opacity,
                points: activeDrawingPoints
            });
            localRedoStrokes = [];
        }
        if (activeDrawingPathEl) {
            activeDrawingPathEl.remove();
            activeDrawingPathEl = null;
        }
        redrawLocalStrokes();
    }

    if (dragStartInfo) {
        if (dragStartInfo.type === 'element') {
            selectedElementIds.forEach(id => {
                const el = elements[id];
                if (el) saveElement(el);
            });
        } else if (dragStartInfo.type === 'resize') {
            if (elements[dragStartInfo.id]) {
                saveElement(elements[dragStartInfo.id]);
            }
        }
        dragStartInfo = null;
    }
    updateSelectionOverlay();
    if (typeof updateElementOptionsPanel === 'function') {
        updateElementOptionsPanel();
    }
}, { passive: true });

// === ОБРАБОТКА ПОИНТЕР-СОБЫТИЙ ДЛЯ APPLE PENCIL И СТИЛУСОВ ===
let isPenDrawing = false;
let activePenPointerId = null;

boardViewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'pen') return;

    if (e.target.closest('[contenteditable="true"]') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('button')) {
        return;
    }

    const isEraserPen = (e.button === 5 || (e.buttons & 32) || (e.pointerType === 'pen' && e.button === 2));

    if (activeTool !== 'draw' && activeTool !== 'eraser' && !isEraserPen) {
        setTool('draw');
    }

    const rect = boardCanvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / zoom;
    const clickY = (e.clientY - rect.top) / zoom;
    const pressure = (e.pressure !== undefined && e.pressure > 0) ? e.pressure : 0.5;

    isPenDrawing = true;
    activePenPointerId = e.pointerId;

    if (activeTool === 'draw' && localDrawingTool === 'select') {
        let foundIndex = -1;
        localStrokes.forEach((stroke, index) => {
            const touched = stroke.points.some(pt => {
                const dx = pt.x - clickX;
                const dy = pt.y - clickY;
                const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 10);
                return Math.sqrt(dx * dx + dy * dy) < r;
            });
            if (touched) foundIndex = index;
        });

        if (foundIndex !== -1) {
            selectedLocalStrokeIndex = foundIndex;
            const strokeToMove = localStrokes[foundIndex];
            dragStartInfo = {
                type: 'local-stroke-drag',
                strokeIndex: foundIndex,
                startX: clickX,
                startY: clickY,
                initialPoints: strokeToMove.points.map(pt => ({ ...pt }))
            };
        } else {
            selectedLocalStrokeIndex = -1;
            dragStartInfo = null;
        }
        redrawLocalStrokes();
        e.preventDefault();
        return;
    }

    if (activeTool === 'eraser' || isEraserPen) {

        localStrokes = localStrokes.filter(stroke => {
            const touched = stroke.points.some(pt => {
                const dx = pt.x - clickX;
                const dy = pt.y - clickY;
                const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                return Math.sqrt(dx * dx + dy * dy) < r;
            });
            return !touched;
        });
        redrawLocalStrokes();
        dragStartInfo = { type: 'local-eraser-drag' };
    } else {
        isDrawing = true;
        activeDrawingPoints = [{ x: clickX, y: clickY, pressure: pressure }];
        
        const tool = localDrawingTool;
        const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
        const opacity = toolSettings[tool] ? toolSettings[tool].opacity : 1.0;

        const { d, strokeWidth } = buildSvgPathAndWidth(activeDrawingPoints, baseW, tool);
        activeDrawingPathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        activeDrawingPathEl.setAttribute("stroke", activeColor);
        activeDrawingPathEl.setAttribute("stroke-width", strokeWidth.toFixed(1));
        activeDrawingPathEl.setAttribute("fill", "none");
        activeDrawingPathEl.setAttribute("stroke-linecap", tool === 'highlighter' ? "butt" : "round");
        activeDrawingPathEl.setAttribute("stroke-linejoin", "round");
        activeDrawingPathEl.setAttribute("stroke-opacity", opacity.toString());

        if (tool === 'highlighter') {
            activeDrawingPathEl.style.mixBlendMode = 'multiply';
        }

        activeDrawingPathEl.setAttribute("d", d);
        drawingLayer.appendChild(activeDrawingPathEl);
    }

    e.preventDefault();
}, { passive: false });

boardViewport.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'pen' && !isPenDrawing) {
        const rect = boardCanvas.getBoundingClientRect();
        const curX = (e.clientX - rect.left) / zoom;
        const curY = (e.clientY - rect.top) / zoom;
        const isEraserActive = (activeTool === 'draw' && localDrawingTool === 'eraser') || activeTool === 'eraser';
        if (isEraserActive) {
            const newHovered = new Set();
            localStrokes.forEach((stroke, index) => {
                const touched = stroke.points.some(pt => {
                    const dx = pt.x - curX;
                    const dy = pt.y - curY;
                    const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                    return Math.sqrt(dx * dx + dy * dy) < r;
                });
                if (touched) newHovered.add(index);
            });

            let changed = newHovered.size !== hoveredEraserStrokeIndices.size;
            if (!changed) {
                for (let idx of newHovered) {
                    if (!hoveredEraserStrokeIndices.has(idx)) {
                        changed = true;
                        break;
                    }
                }
            }

            if (changed) {
                hoveredEraserStrokeIndices = newHovered;
                redrawLocalStrokes();
            }
        }
    }

    if (e.pointerType !== 'pen' || !isPenDrawing || activePenPointerId !== e.pointerId) return;


    const rect = boardCanvas.getBoundingClientRect();
    const coalescedEvents = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];

    if (dragStartInfo && dragStartInfo.type === 'local-stroke-drag') {
        coalescedEvents.forEach(evt => {
            const curX = (evt.clientX - rect.left) / zoom;
            const curY = (evt.clientY - rect.top) / zoom;
            const deltaX = curX - dragStartInfo.startX;
            const deltaY = curY - dragStartInfo.startY;
            const stroke = localStrokes[dragStartInfo.strokeIndex];
            if (stroke && dragStartInfo.initialPoints) {
                stroke.points = dragStartInfo.initialPoints.map(pt => ({
                    ...pt,
                    x: pt.x + deltaX,
                    y: pt.y + deltaY
                }));
            }
        });
        redrawLocalStrokes();
        return;
    }

    if (dragStartInfo && dragStartInfo.type === 'local-eraser-drag') {

        coalescedEvents.forEach(evt => {
            const curX = (evt.clientX - rect.left) / zoom;
            const curY = (evt.clientY - rect.top) / zoom;
            localStrokes = localStrokes.filter(stroke => {
                const touched = stroke.points.some(pt => {
                    const dx = pt.x - curX;
                    const dy = pt.y - curY;
                    const r = Math.max(25, (stroke.baseWidth || 4) / 2 + 12);
                    return Math.sqrt(dx * dx + dy * dy) < r;
                });
                return !touched;
            });
        });
        redrawLocalStrokes();
        return;
    }

    if (isDrawing && activeDrawingPathEl) {
        coalescedEvents.forEach(evt => {
            const curX = (evt.clientX - rect.left) / zoom;
            const curY = (evt.clientY - rect.top) / zoom;
            const pressure = (evt.pressure !== undefined && evt.pressure > 0) ? evt.pressure : 0.5;
            activeDrawingPoints.push({ x: curX, y: curY, pressure: pressure });
        });

        const tool = localDrawingTool;
        const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
        const { d, strokeWidth } = buildSvgPathAndWidth(activeDrawingPoints, baseW, tool);
        activeDrawingPathEl.setAttribute("d", d);
        activeDrawingPathEl.setAttribute("stroke-width", strokeWidth.toFixed(1));
    }

    e.preventDefault();
}, { passive: false });

const endPenDrawing = (e) => {
    if (e.pointerType !== 'pen' || activePenPointerId !== e.pointerId) return;
    
    isPenDrawing = false;
    activePenPointerId = null;

    if (isDrawing) {
        isDrawing = false;
        if (activeDrawingPoints.length > 1) {
            const tool = localDrawingTool;
            const baseW = toolSettings[tool] ? toolSettings[tool].width : 4;
            const opacity = toolSettings[tool] ? toolSettings[tool].opacity : 1.0;
            localStrokes.push({
                color: activeColor,
                toolType: tool,
                baseWidth: baseW,
                opacity: opacity,
                points: activeDrawingPoints
            });
            localRedoStrokes = [];
        }
        if (activeDrawingPathEl) {
            activeDrawingPathEl.remove();
            activeDrawingPathEl = null;
        }
        redrawLocalStrokes();
    }
    dragStartInfo = null;
};

boardViewport.addEventListener('pointerup', endPenDrawing);
boardViewport.addEventListener('pointercancel', endPenDrawing);

// Запуск центрирования при первой загрузке данных
setTimeout(() => {
    if (!hasCenteredOnLoad) {
        hasCenteredOnLoad = true;
        centerBoardOnElements();
    }
}, 600);

// === УПРАВЛЕНИЕ ПАНЕЛЬЮ НАСТРОЕК ЭЛЕМЕНТА ===
function updateElementOptionsPanel() {
    const panel = document.getElementById('elementOptionsPanel');
    const popup = document.getElementById('elementSettingsPopup');
    const btnColor = document.getElementById('btnOptColor');
    
    if (selectedElementIds.size >= 1 && activeTool === 'select') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasValidElement = false;
        
        selectedElementIds.forEach(id => {
            const el = elements[id];
            if (el) {
                hasValidElement = true;
                minX = Math.min(minX, el.x);
                minY = Math.min(minY, el.y);
                maxX = Math.max(maxX, el.x + el.width);
                maxY = Math.max(maxY, el.y + el.height);
            }
        });
        
        if (hasValidElement) {
            panel.style.display = 'flex';
            
            const isMultiSelect = selectedElementIds.size > 1;
            let singleEl = null;
            if (!isMultiSelect) {
                singleEl = elements[Array.from(selectedElementIds)[0]];
            }
            
            const btnAddText = document.getElementById('btnOptAddText');
            const btnEditImage = document.getElementById('btnOptEditImage');
            const btnEditDrawing = document.getElementById('btnOptEditDrawing');

            if (isMultiSelect || (singleEl && (singleEl.type === 'drawing' || singleEl.type === 'image'))) {
                btnColor.style.display = 'none';
                popup.classList.remove('active');
            } else {
                btnColor.style.display = 'block';
            }

            if (!isMultiSelect && singleEl && singleEl.type === 'drawing') {
                if (btnEditDrawing) btnEditDrawing.style.display = 'block';
            } else {
                if (btnEditDrawing) btnEditDrawing.style.display = 'none';
            }

            if (!isMultiSelect && singleEl && singleEl.type === 'image') {
                if (btnAddText) btnAddText.style.display = 'block';
                if (btnEditImage) btnEditImage.style.display = 'block';
            } else {
                if (btnAddText) btnAddText.style.display = 'none';
                if (btnEditImage) btnEditImage.style.display = 'none';
            }
            
            const canvasRect = boardCanvas.getBoundingClientRect();
            const viewportRect = boardViewport.getBoundingClientRect();
            
            const left = canvasRect.left - viewportRect.left + minX * zoom + ((maxX - minX) * zoom - panel.offsetWidth) / 2;
            const top = canvasRect.top - viewportRect.top + minY * zoom - 48;
            
            panel.style.top = `${Math.max(10, top)}px`;
            panel.style.left = `${Math.max(10, left)}px`;
            
            if (!isMultiSelect && singleEl && singleEl.type !== 'drawing' && singleEl.type !== 'image') {
                // Синхронизируем цвета
                const currentColor = singleEl.type === 'board' ? getBoardIconColor(singleEl) : singleEl.color;
                popup.querySelectorAll('.popup-color-opt').forEach(opt => {
                    if (opt.getAttribute('data-color') === currentColor || opt.getAttribute('data-color') === singleEl.color) {
                        opt.classList.add('active');
                    } else {
                        opt.classList.remove('active');
                    }
                });
                
                // Синхронизируем тени
                popup.querySelectorAll('.shadow-opt-btn').forEach(btn => {
                    if (btn.getAttribute('data-shadow') === (singleEl.shadowType || 'box')) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                
                // Синхронизируем скругление
                const brSlider = document.getElementById('sliderCornerRadius');
                const brLabel = document.getElementById('lblCornerRadiusValue');
                const currentBr = singleEl.borderRadius !== undefined ? singleEl.borderRadius : 8;
                brSlider.value = currentBr;
                brLabel.innerText = `${currentBr}px`;
            }
            
            return;
        }
    }
    
    panel.style.display = 'none';
    popup.classList.remove('active');
}

function initElementOptionsPanel() {
    const btnColor = document.getElementById('btnOptColor');
    const btnDelete = document.getElementById('btnOptDelete');
    const btnAddText = document.getElementById('btnOptAddText');
    const btnEditImage = document.getElementById('btnOptEditImage');
    const popup = document.getElementById('elementSettingsPopup');
    const sliderBr = document.getElementById('sliderCornerRadius');
    const labelBr = document.getElementById('lblCornerRadiusValue');
    const customColorInput = document.getElementById('optCustomColorInput');

    const btnEditDrawing = document.getElementById('btnOptEditDrawing');
    if (btnEditDrawing) {
        btnEditDrawing.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedElementIds.size === 1) {
                const id = Array.from(selectedElementIds)[0];
                editExistingDrawing(id);
            }
        });
    }

    btnColor.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.classList.toggle('active');
    });

    if (btnAddText) {
        btnAddText.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedElementIds.size === 1) {
                const id = Array.from(selectedElementIds)[0];
                const el = elements[id];
                if (el && el.type === 'image') {
                    saveUndoState();
                    el.hasCaption = !el.hasCaption;
                    if (el.hasCaption) {
                        el.caption = el.caption || "";
                        el.height += 48;
                    } else {
                        el.height = Math.max(80, el.height - 48);
                    }
                    saveElement(el);
                    renderElements();
                }
            }
        });
    }

    if (btnEditImage) {
        btnEditImage.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedElementIds.size === 1) {
                const id = Array.from(selectedElementIds)[0];
                const el = elements[id];
                if (el && el.type === 'image') {
                    openImageUploadModal((newUrl) => {
                        if (newUrl) {
                            saveUndoState();
                            el.imageUrl = newUrl;
                            const img = new Image();
                            img.onload = () => {
                                const aspect = img.width / img.height;
                                el.height = Math.round(el.width / aspect) + (el.hasCaption ? 48 : 0);
                                saveElement(el);
                                renderElements();
                            };
                            img.onerror = () => {
                                saveElement(el);
                                renderElements();
                            };
                            img.src = newUrl;
                        }
                    });
                }
            }
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedElementIds.size > 0) {
                saveUndoState();
                const ids = Array.from(selectedElementIds);
                ids.forEach(id => {
                    deleteElement(id);
                });
                selectedElementIds.clear();
                renderElements();
            }
        });
    }
    
    // Закрытие попапа и сброс выделения при клике вне элементов
    document.addEventListener('mousedown', (e) => {
        if (activeTool === 'draw') return; // Не сбрасываем выделение в процессе рисования
        
        if (!e.target.closest('#elementOptionsPanel') && 
            !e.target.closest('#textFormatToolbar') && 
            !e.target.closest('.board-element') && 
            !e.target.closest('.board-toolbar') && 
            !e.target.closest('.board-header') &&
            !e.target.closest('.selection-overlay-box') &&
            !e.target.closest('.selection-overlay-handle')) {
            selectedElementIds.clear();
            renderElements();
        } else if (!e.target.closest('#elementOptionsPanel')) {
            popup.classList.remove('active');
        }
    });

    // Обработка клика по цветам
    popup.querySelectorAll('.popup-color-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedElementIds.size === 1) {
                const id = Array.from(selectedElementIds)[0];
                const color = opt.getAttribute('data-color');
                saveUndoState();
                elements[id].color = color;
                saveElement(elements[id]);
                renderElements();
                
                popup.querySelectorAll('.popup-color-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            }
        });
    });

    // Кастомный цвет
    customColorInput.addEventListener('input', (e) => {
        if (selectedElementIds.size === 1) {
            const id = Array.from(selectedElementIds)[0];
            elements[id].color = e.target.value;
            saveElement(elements[id]);
            renderElements();
        }
    });
    customColorInput.addEventListener('change', (e) => {
        saveUndoState();
    });

    // Изменение тени
    popup.querySelectorAll('.shadow-opt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedElementIds.size === 1) {
                const id = Array.from(selectedElementIds)[0];
                const shadow = btn.getAttribute('data-shadow');
                saveUndoState();
                elements[id].shadowType = shadow;
                saveElement(elements[id]);
                
                popup.querySelectorAll('.shadow-opt-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    });

    // Изменение скругления углов
    sliderBr.addEventListener('input', (e) => {
        if (selectedElementIds.size === 1) {
            const id = Array.from(selectedElementIds)[0];
            const val = parseInt(e.target.value);
            labelBr.innerText = `${val}px`;
            elements[id].borderRadius = val;
            saveElement(elements[id]);
        }
    });
    sliderBr.addEventListener('change', (e) => {
        saveUndoState();
    });
}

// === УПРАВЛЕНИЕ ТУЛБАРОМ ФОРМАТИРОВАНИЯ ВЫДЕЛЕННОГО ТЕКСТА ===
function updateTextFormatToolbarPosition() {
    const toolbar = document.getElementById('textFormatToolbar');
    if (!toolbar || toolbar.style.display === 'none') return;
    
    const selection = window.getSelection();
    const activeEl = document.activeElement;
    
    if (activeEl && activeEl.closest('.el-text-content') && !selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const viewportRect = boardViewport.getBoundingClientRect();
        
        const top = rect.top - viewportRect.top - 46;
        const left = rect.left - viewportRect.left + (rect.width - toolbar.offsetWidth) / 2;
        
        toolbar.style.top = `${Math.max(10, top)}px`;
        toolbar.style.left = `${Math.max(10, left)}px`;
    } else {
        toolbar.style.display = 'none';
        document.getElementById('formatHighlightPopup').classList.remove('active');
        document.getElementById('formatTypePopup').classList.remove('active');
    }
}

// Экспортируем функцию в глобальную область, чтобы updateTransform мог ее вызвать
window.updateTextFormatToolbarPosition = updateTextFormatToolbarPosition;

function initTextFormatToolbar() {
    const toolbar = document.getElementById('textFormatToolbar');
    const btnBold = document.getElementById('btnFmtBold');
    const btnItalic = document.getElementById('btnFmtItalic');
    const btnUnderline = document.getElementById('btnFmtUnderline');
    const btnStrike = document.getElementById('btnFmtStrike');
    const btnHighlight = document.getElementById('btnFmtHighlight');
    const highlightPopup = document.getElementById('formatHighlightPopup');
    
    const btnType = document.getElementById('btnFmtType');
    const typePopup = document.getElementById('formatTypePopup');
    const btnInsertTodo = document.getElementById('btnInsertTodo');

    // Предотвращаем потерю фокуса с contenteditable при кликах на панель и поп-апы
    [btnBold, btnItalic, btnUnderline, btnStrike, btnHighlight, highlightPopup, btnType, typePopup, btnInsertTodo].forEach(el => {
        if (el) {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });
        }
    });

    btnBold.addEventListener('click', () => {
        document.execCommand('bold', false, null);
    });

    btnItalic.addEventListener('click', () => {
        document.execCommand('italic', false, null);
    });

    btnUnderline.addEventListener('click', () => {
        document.execCommand('underline', false, null);
    });

    btnStrike.addEventListener('click', () => {
        document.execCommand('strikeThrough', false, null);
    });

    btnType.addEventListener('click', () => {
        typePopup.classList.toggle('active');
        highlightPopup.classList.remove('active');
    });

    typePopup.querySelectorAll('.type-opt[data-command]').forEach(opt => {
        opt.addEventListener('click', () => {
            const cmd = opt.getAttribute('data-command');
            const val = opt.getAttribute('data-val') || null;
            document.execCommand(cmd, false, val);
            typePopup.classList.remove('active');
        });
    });

    btnInsertTodo.addEventListener('click', () => {
        document.execCommand('insertHTML', false, '<p class="todo-line"><input type="checkbox">&nbsp;</p>');
        typePopup.classList.remove('active');
    });

    btnHighlight.addEventListener('click', () => {
        highlightPopup.classList.toggle('active');
        typePopup.classList.remove('active');
    });

    highlightPopup.querySelectorAll('.highlight-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            const type = opt.getAttribute('data-type');
            let color = opt.getAttribute('data-color');
            if (type === 'fore') {
                if (color === 'inherit') {
                    color = getComputedStyle(document.body).getPropertyValue('--text-color').trim() || '#0f172a';
                }
                document.execCommand('foreColor', false, color);
            } else if (type === 'back') {
                if (color === 'transparent') {
                    color = 'rgba(0,0,0,0)';
                }
                document.execCommand('backColor', false, color);
            }
            highlightPopup.classList.remove('active');
        });
    });

    // Отслеживание выделения текста внутри блоков
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        const activeEl = document.activeElement;
        
        if (activeEl && activeEl.closest('.el-text-content') && !selection.isCollapsed && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const viewportRect = boardViewport.getBoundingClientRect();
            
            toolbar.style.display = 'flex';
            
            const top = rect.top - viewportRect.top - 46;
            const left = rect.left - viewportRect.left + (rect.width - toolbar.offsetWidth) / 2;
            
            toolbar.style.top = `${Math.max(10, top)}px`;
            toolbar.style.left = `${Math.max(10, left)}px`;
        } else {
            // Не прячем тулбар, если пользователь кликает или выбирает цвет
            const isInteractingWithToolbar = document.activeElement && 
                document.activeElement.closest('#textFormatToolbar');
            
            if (!isInteractingWithToolbar) {
                toolbar.style.display = 'none';
                highlightPopup.classList.remove('active');
                typePopup.classList.remove('active');
            }
        }
    });
}

initElementOptionsPanel();
initTextFormatToolbar();

function updateSelectionOverlay() {
    let overlay = document.getElementById('selectionOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'selectionOverlay';
        overlay.className = 'selection-overlay-box';
        
        const handles = ['tl', 'tr', 'bl', 'br'];
        handles.forEach(h => {
            const handleEl = document.createElement('div');
            handleEl.className = `selection-overlay-handle handle-${h}`;
            overlay.appendChild(handleEl);
        });
        
        boardCanvas.appendChild(overlay);
    }
    
    if (activeTool === 'draw' || selectedElementIds.size === 0) {
        overlay.style.display = 'none';
        return;
    }

    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasValidElement = false;
    
    selectedElementIds.forEach(id => {
        const el = elements[id];
        if (el) {
            hasValidElement = true;
            minX = Math.min(minX, el.x);
            minY = Math.min(minY, el.y);
            maxX = Math.max(maxX, el.x + el.width);
            maxY = Math.max(maxY, el.y + el.height);
        }
    });
    
    if (!hasValidElement) {
        overlay.style.display = 'none';
        return;
    }
    
    overlay.style.display = 'block';
    overlay.style.left = `${minX}px`;
    overlay.style.top = `${minY}px`;
    overlay.style.width = `${maxX - minX}px`;
    overlay.style.height = `${maxY - minY}px`;

    let isResizable = true;
    if (selectedElementIds.size === 1) {
        const singleId = Array.from(selectedElementIds)[0];
        const el = elements[singleId];
        if (el && el.type === 'board') {
            isResizable = false;
        }
    }
    const overlayHandles = overlay.querySelectorAll('.selection-overlay-handle');
    overlayHandles.forEach(h => {
        h.style.display = isResizable ? 'block' : 'none';
    });
}

function linkifyHTML(html) {
    if (!html) return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    const walk = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
            let parent = node.parentNode;
            while (parent && parent !== tempDiv) {
                if (parent.tagName === 'A') {
                    return NodeFilter.FILTER_REJECT;
                }
                parent = parent.parentNode;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const urlRegex = /(https?:\/\/[^\s<]+)/gi;
    const nodesToReplace = [];
    
    let textNode;
    while (textNode = walk.nextNode()) {
        if (urlRegex.test(textNode.nodeValue)) {
            nodesToReplace.push(textNode);
        }
        urlRegex.lastIndex = 0;
    }

    nodesToReplace.forEach(node => {
        const text = node.nodeValue;
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        
        text.replace(urlRegex, (url, index) => {
            if (index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
            }
            const a = document.createElement('a');
            a.href = url.trim();
            a.target = '_blank';
            a.innerText = url;
            a.setAttribute('draggable', 'false');
            fragment.appendChild(a);
            lastIndex = index + url.length;
            return url;
        });
        
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        
        if (node.parentNode) {
            node.parentNode.replaceChild(fragment, node);
        }
    });
    
    return tempDiv.innerHTML;
}

// Глобальный перехватчик кликов по авто-ссылкам в текстовых редакторах
document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && (e.target.closest('.el-text-content') || e.target.closest('.image-caption'))) {
        e.preventDefault();
        e.stopPropagation();
        window.open(a.href, '_blank');
    }
});

async function getBoardTitleAndParent(boardId) {
    if (!boardId) return null;
    if (currentUid && db) {
        try {
            const docRef = doc(db, "users", currentUid, "whiteboards", boardId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                return { title: data.title || "Без названия", parentBoardId: data.parentBoardId };
            }
        } catch (err) {
            console.error("Error loading board info for breadcrumbs:", err);
        }
    } else {
        const localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
        const b = localBoards.find(x => x.id === boardId);
        if (b) {
            return { title: b.title || "Без названия", parentBoardId: b.parentBoardId };
        }
    }
    return null;
}

async function renderBreadcrumbs() {
    const breadcrumbsContainer = document.getElementById('boardBreadcrumbs');
    if (!breadcrumbsContainer) return;

    breadcrumbsContainer.innerHTML = '';

    const homeLink = document.createElement('a');
    homeLink.href = 'whiteboard.html';
    homeLink.className = 'breadcrumb-item';
    homeLink.innerText = 'Мои доски';
    breadcrumbsContainer.appendChild(homeLink);

    if (!activeBoardId) return;

    const parentChain = [];
    let currentId = activeBoardId;
    
    try {
        while (currentId) {
            const boardInfo = await getBoardTitleAndParent(currentId);
            if (!boardInfo) break;
            
            if (currentId !== activeBoardId) {
                parentChain.unshift({
                    id: currentId,
                    title: boardInfo.title
                });
            }
            currentId = boardInfo.parentBoardId;
        }

        parentChain.forEach(item => {
            const separator = document.createElement('span');
            separator.className = 'breadcrumb-separator';
            separator.innerText = '/';
            breadcrumbsContainer.appendChild(separator);

            const link = document.createElement('a');
            link.href = `whiteboard.html?id=${item.id}`;
            link.className = 'breadcrumb-item';
            link.innerText = item.title;
            breadcrumbsContainer.appendChild(link);
        });

        const finalSeparator = document.createElement('span');
        finalSeparator.className = 'breadcrumb-separator';
        finalSeparator.innerText = '/';
        breadcrumbsContainer.appendChild(finalSeparator);

    } catch (err) {
        console.error("Error building breadcrumbs:", err);
    }
}

async function updateParentBoardElementTitle(newTitle) {
    const currentBoard = await getBoardTitleAndParent(activeBoardId);
    if (!currentBoard || !currentBoard.parentBoardId) return;

    const parentId = currentBoard.parentBoardId;
    if (currentUid && db) {
        try {
            const elementsCollRef = collection(db, "users", currentUid, "whiteboards", parentId, "elements");
            const snap = await getDocs(elementsCollRef);
            const batch = writeBatch(db);
            let hasUpdate = false;
            snap.forEach(docSnap => {
                const el = docSnap.data();
                if (el.type === 'board' && el.targetBoardId === activeBoardId) {
                    const elDocRef = doc(db, "users", currentUid, "whiteboards", parentId, "elements", el.id);
                    batch.set(elDocRef, { content: newTitle }, { merge: true });
                    hasUpdate = true;
                }
            });
            if (hasUpdate) {
                await batch.commit();
            }
        } catch (err) {
            console.error("Error updating parent board element title:", err);
        }
    } else {
        const parentElementsKey = `board_elements_${parentId}`;
        const parentElements = JSON.parse(localStorage.getItem(parentElementsKey) || '{}');
        let updated = false;
        Object.values(parentElements).forEach(el => {
            if (el.type === 'board' && el.targetBoardId === activeBoardId) {
                el.content = newTitle;
                updated = true;
            }
        });
        if (updated) {
            localStorage.setItem(parentElementsKey, JSON.stringify(parentElements));
        }
    }
}

function layoutColumns(shouldSave = false) {
    const allElements = Object.values(elements);
    const columns = allElements.filter(el => el.type === 'column');
    
    columns.forEach(col => {
        const children = allElements.filter(el => el.parentId === col.id);
        
        children.sort((a, b) => a.y - b.y);
        
        const colWidth = col.width || 240;
        let currentY = col.y + 72;
        
        children.forEach(child => {
            const targetX = col.x + 12;
            const targetY = currentY;
            const targetWidth = colWidth - 24;
            let targetHeight = child.height;
            if (child.type === 'board') {
                targetHeight = Math.max(84, child.height);
            }
            
            if (child.x !== targetX || child.y !== targetY || child.width !== targetWidth || (child.type === 'board' && child.height !== targetHeight)) {
                child.x = targetX;
                child.y = targetY;
                child.width = targetWidth;
                if (child.type === 'board') child.height = targetHeight;
                if (shouldSave) {
                    saveElement(child);
                }
            }
            currentY += targetHeight + 12;
        });
        
        const targetHeight = Math.max(120, currentY - col.y + 12);
        if (col.height !== targetHeight) {
            col.height = targetHeight;
            if (shouldSave) {
                saveElement(col);
            }
        }
    });
}


