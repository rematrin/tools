// whiteboard.js - Логика интерактивной доски с Firebase Firestore и LocalStorage

import {
    getFirestore,
    collection,
    doc,
    setDoc,
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

// Состояние рисования
let isDrawing = false;
let activeDrawingPoints = [];
let activeDrawingPathEl = null;

// Состояние редактирования/выделения
let activeTool = 'select'; // 'select', 'text', 'sticker', 'frame', 'link', 'image', 'draw', 'eraser'
let activeColor = '#3b82f6';
let selectedElementIds = new Set(); // Поддержка множественного выделения

// Временные данные для перетаскивания и ресайза
let dragStartInfo = null; // { type: 'element'|'resize'|'canvas-resize'|'selection-marquee'|'eraser-drag', id, startX, startY, ... }

// DOM Элементы
const dashboardView = document.getElementById('dashboardView');
const boardActiveView = document.getElementById('boardActiveView');
const boardsGrid = document.getElementById('boardsGrid');
const btnCreateBoard = document.getElementById('btnCreateBoard');

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
    sticker: document.getElementById('toolSticker'),
    frame: document.getElementById('toolFrame'),
    link: document.getElementById('toolLink'),
    image: document.getElementById('toolImage'),
    draw: document.getElementById('toolDraw'),
    eraser: document.getElementById('toolEraser')
};

const colorPickerPanel = document.getElementById('colorPickerPanel');
const urlInputModal = document.getElementById('urlInputModal');
const bookmarkUrlInput = document.getElementById('bookmarkUrlInput');
const btnUrlCancel = document.getElementById('btnUrlCancel');
const btnUrlConfirm = document.getElementById('btnUrlConfirm');
const imageFileInput = document.getElementById('imageFileInput');

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
    boardsGrid.innerHTML = '';
    
    if (boardsList.length === 0) {
        boardsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-sec); padding: 40px;">
            У вас пока нет досок. Нажмите "Создать доску", чтобы начать!
        </div>`;
        return;
    }

    boardsList.forEach(board => {
        const card = document.createElement('div');
        card.className = 'board-card';
        card.addEventListener('click', (e) => {
            if (e.target.closest('.board-card-delete')) return;
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

        const delBtn = document.createElement('button');
        delBtn.className = 'board-card-delete';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Удалить доску';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteBoard(board.id);
        });
        card.appendChild(delBtn);

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

async function deleteBoard(boardId) {
    if (!confirm("Вы уверены, что хотите полностью удалить эту доску со всеми элементами?")) return;

    if (currentUid && db) {
        const elementsCollRef = collection(db, "users", currentUid, "whiteboards", boardId, "elements");
        const snap = await getDocs(elementsCollRef);
        const batch = writeBatch(db);
        snap.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });
        await batch.commit();

        const boardDocRef = doc(db, "users", currentUid, "whiteboards", boardId);
        await deleteDoc(boardDocRef);
    } else {
        let localBoards = JSON.parse(localStorage.getItem('whiteboards_list') || '[]');
        localBoards = localBoards.filter(b => b.id !== boardId);
        localStorage.setItem('whiteboards_list', JSON.stringify(localBoards));

        localStorage.removeItem(`board_config_${boardId}`);
        localStorage.removeItem(`board_elements_${boardId}`);
        setupOfflineModeForDashboard();
    }
}

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
            }
            updateCanvasSize();
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
    }
    updateCanvasSize();

    const localElements = localStorage.getItem(`board_elements_${activeBoardId}`);
    if (localElements) {
        elements = JSON.parse(localElements);
    } else {
        elements = {};
    }
    renderElements();
    updateUndoRedoButtons();
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

    const path = document.getElementById(`svg_${id}`);
    if (path) path.remove();

    if (elements[id] && elements[id].type === 'frame') {
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
}

function zoomTo(newZoom, centerX, centerY) {
    const prevZoom = zoom;
    zoom = Math.min(Math.max(newZoom, 0.15), 4);
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
        undo();
    }

    // Ctrl+Y / Cmd+Y / Ctrl+Shift+Z / Cmd+Shift+Z (Redo)
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.getAttribute('contenteditable') === 'true') {
            return;
        }
        e.preventDefault();
        redo();
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.getAttribute('contenteditable') === 'true') {
            return;
        }
        if (selectedElementIds.size > 0) {
            if (confirm(`Удалить выделенные элементы (${selectedElementIds.size})?`)) {
                selectedElementIds.forEach(id => {
                    deleteElement(id);
                });
                selectedElementIds.clear();
            }
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
}

// === ВЫБОР ИНСТРУМЕНТОВ ===
function setTool(toolName) {
    activeTool = toolName;
    Object.keys(tools).forEach(name => {
        if (tools[name]) {
            if (name === toolName) {
                tools[name].classList.add('active');
            } else {
                tools[name].classList.remove('active');
            }
        }
    });

    if (toolName === 'draw' || toolName === 'sticker') {
        colorPickerPanel.classList.add('active');
    } else {
        colorPickerPanel.classList.remove('active');
    }

    if (toolName === 'draw') {
        boardCanvas.style.cursor = 'crosshair';
    } else if (toolName === 'eraser') {
        boardCanvas.style.cursor = 'cell';
    } else {
        boardCanvas.style.cursor = 'default';
    }
}

Object.keys(tools).forEach(name => {
    if (tools[name]) {
        tools[name].addEventListener('click', () => setTool(name));
    }
});

document.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
        document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        activeColor = opt.getAttribute('data-color');
    });
});

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
    
    if (type === 'sticker') {
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
    }

    const maxZ = Object.values(elements).reduce((max, el) => Math.max(max, el.zIndex || 0), 0);

    const elData = {
        id,
        type,
        x: Math.max(0, Math.min(x - width / 2, boardConfig.width - width)),
        y: Math.max(0, Math.min(y - height / 2, boardConfig.height - height)),
        width,
        height,
        zIndex: maxZ + 1,
        color: activeColor,
        ...extra
    };

    saveElement(elData);
    setTool('select');
    selectedElementIds.clear();
    selectedElementIds.add(id);
}

tools.text.addEventListener('click', () => createNewElement('text', undefined, undefined, { content: "Дважды кликните для ввода текста..." }));
tools.sticker.addEventListener('click', () => createNewElement('sticker', undefined, undefined, { content: "Заметка..." }));
tools.frame.addEventListener('click', () => createNewElement('frame', undefined, undefined, { content: "Новая группа" }));

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

tools.image.addEventListener('click', () => {
    imageFileInput.click();
});

imageFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showSaveStatus("Загрузка картинки...");

    try {
        const formData = new FormData();
        formData.append('image', file);

        const res = await fetch('https://api.imgbb.com/1/upload?key=fbd88ce7045582e4c4176c67de93ceee', {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error("Ошибка сервера Imgbb");

        const data = await res.json();
        const imageUrl = data.data.url;

        createNewElement('image', undefined, undefined, {
            imageUrl: imageUrl
        });
    } catch (err) {
        console.error("Ошибка загрузки изображения:", err);
        alert("Не удалось загрузить изображение. Пожалуйста, попробуйте снова.");
        showSaveStatus("Ошибка загрузки");
    }
});

// === РЕНДЕРИНГ ЭЛЕМЕНТОВ ===
function renderElements() {
    const activeTextareaId = document.activeElement ? document.activeElement.getAttribute('data-id') : null;
    elementsLayer.innerHTML = '';
    drawingLayer.innerHTML = '';

    const sortedElements = Object.values(elements).sort((a, b) => {
        if (a.type === 'frame' && b.type !== 'frame') return -1;
        if (a.type !== 'frame' && b.type === 'frame') return 1;
        return (a.zIndex || 0) - (b.zIndex || 0);
    });

    sortedElements.forEach(el => {
        if (el.type === 'drawing') {
            renderDrawing(el);
            return;
        }

        const elDiv = document.createElement('div');
        elDiv.className = `board-element el-${el.type}`;
        if (selectedElementIds.has(el.id)) {
            elDiv.classList.add('selected');
        }
        
        elDiv.style.left = `${el.x}px`;
        elDiv.style.top = `${el.y}px`;
        elDiv.style.width = `${el.width}px`;
        elDiv.style.height = `${el.height}px`;
        elDiv.style.zIndex = el.zIndex || 1;
        elDiv.setAttribute('data-id', el.id);

        if (el.type === 'sticker') {
            elDiv.style.backgroundColor = el.color || '#fef08a';
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'element-delete-btn';
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            deleteElement(el.id);
        });
        elDiv.appendChild(delBtn);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'element-resize-handle handle-se';
        elDiv.appendChild(resizeHandle);

        if (el.type === 'text' || el.type === 'sticker') {
            const textEl = document.createElement('div');
            textEl.className = 'el-text-content';
            textEl.contentEditable = true;
            textEl.setAttribute('data-id', el.id);
            textEl.innerText = el.content || '';
            
            textEl.addEventListener('blur', () => {
                const newText = textEl.innerText;
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

            elDiv.appendChild(textEl);

            if (activeTextareaId === el.id) {
                setTimeout(() => {
                    textEl.focus();
                }, 10);
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
        else if (el.type === 'image') {
            const img = document.createElement('img');
            img.src = el.imageUrl;
            elDiv.appendChild(img);
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

        elementsLayer.appendChild(elDiv);
    });
}

function renderDrawing(el) {
    if (!el.points || el.points.length === 0) return;
    
    let path = document.getElementById(`svg_${el.id}`);
    if (!path) {
        path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("id", `svg_${el.id}`);
        drawingLayer.appendChild(path);
    }
    
    const isSelected = selectedElementIds.has(el.id);
    path.setAttribute("stroke", isSelected ? "var(--accent-color)" : (el.color || "#000"));
    path.setAttribute("stroke-width", "4");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    
    if (isSelected) {
        path.setAttribute("stroke-dasharray", "4,4");
        path.classList.add('selected');
    } else {
        path.removeAttribute("stroke-dasharray");
        path.classList.remove('selected');
    }

    let d = `M ${el.points[0].x} ${el.points[0].y}`;
    for (let i = 1; i < el.points.length; i++) {
        d += ` L ${el.points[i].x} ${el.points[i].y}`;
    }
    path.setAttribute("d", d);
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

    // 1. Инструмент: Ластик
    if (activeTool === 'eraser') {
        const elementDiv = target.closest('.board-element');
        if (elementDiv) {
            const elId = elementDiv.getAttribute('data-id');
            deleteElement(elId);
            e.preventDefault();
            return;
        }

        Object.values(elements).forEach(el => {
            if (el.type === 'drawing' && el.points) {
                const hit = el.points.some(pt => {
                    const dx = pt.x - clickX;
                    const dy = pt.y - clickY;
                    return Math.sqrt(dx*dx + dy*dy) < 20;
                });
                if (hit) {
                    deleteElement(el.id);
                }
            }
        });

        dragStartInfo = { type: 'eraser-drag' };
        e.preventDefault();
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

    // 3. Рисование
    if (activeTool === 'draw') {
        saveUndoState();
        isDrawing = true;
        activeDrawingPoints = [{ x: clickX, y: clickY }];
        
        activeDrawingPathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        activeDrawingPathEl.setAttribute("stroke", activeColor);
        activeDrawingPathEl.setAttribute("stroke-width", "4");
        activeDrawingPathEl.setAttribute("fill", "none");
        activeDrawingPathEl.setAttribute("stroke-linecap", "round");
        activeDrawingPathEl.setAttribute("stroke-linejoin", "round");
        activeDrawingPathEl.setAttribute("d", `M ${clickX} ${clickY}`);
        drawingLayer.appendChild(activeDrawingPathEl);
        
        e.preventDefault();
        return;
    }

    // 4. Выделение, изменение размера и перетаскивание элементов
    const elementDiv = target.closest('.board-element');
    
    if (elementDiv) {
        const elId = elementDiv.getAttribute('data-id');
        
        if (!selectedElementIds.has(elId)) {
            if (!e.shiftKey) {
                selectedElementIds.clear();
                document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));
                document.querySelectorAll('path.selected').forEach(p => p.classList.remove('selected'));
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
                    if (elObj.type === 'drawing') {
                        dragStartInfo.initialPositions[id] = {
                            points: elObj.points.map(p => ({ x: p.x, y: p.y }))
                        };
                    } else {
                        // ВАЖНО: обновляем фактические размеры из DOM перед началом перетаскивания
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
                }
            });
        }
        e.preventDefault();
    } else {
        // Клик по пустому холсту - сброс выделения и старт прямоугольного выделения (marquee)
        if (e.button === 0 && activeTool === 'select' && (e.target === boardViewport || e.target === boardCanvas)) {
            selectedElementIds.clear();
            document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));
            document.querySelectorAll('path.selected').forEach(p => {
                p.classList.remove('selected');
                p.removeAttribute("stroke-dasharray");
                const lineId = p.id.replace('svg_', '');
                if (elements[lineId]) {
                    p.setAttribute("stroke", elements[lineId].color || "#000");
                }
            });

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

    if (dragStartInfo && dragStartInfo.type === 'eraser-drag') {
        Object.values(elements).forEach(el => {
            if (el.type === 'drawing' && el.points) {
                const hit = el.points.some(pt => {
                    const dx = pt.x - curX;
                    const dy = pt.y - curY;
                    return Math.sqrt(dx*dx + dy*dy) < 20;
                });
                if (hit) {
                    deleteElement(el.id);
                }
            }
        });
        return;
    }

    if (isDrawing && activeDrawingPathEl) {
        activeDrawingPoints.push({ x: curX, y: curY });
        
        let d = activeDrawingPathEl.getAttribute("d");
        d += ` L ${curX} ${curY}`;
        activeDrawingPathEl.setAttribute("d", d);
        return;
    }

    if (!dragStartInfo) return;

    const deltaX = (e.clientX - dragStartInfo.startX) / zoom;
    const deltaY = (e.clientY - dragStartInfo.startY) / zoom;

    // Прямоугольное выделение
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
            let overlaps = false;
            
            if (el.type === 'drawing' && el.points) {
                overlaps = el.points.some(pt => pt.x >= x && pt.x <= x + w && pt.y >= y && pt.y <= y + h);
                const path = document.getElementById(`svg_${el.id}`);
                if (overlaps) {
                    selectedElementIds.add(el.id);
                    if (path) {
                        path.classList.add('selected');
                        path.setAttribute("stroke", "var(--accent-color)");
                        path.setAttribute("stroke-dasharray", "4,4");
                    }
                } else {
                    if (path) {
                        path.classList.remove('selected');
                        path.removeAttribute("stroke-dasharray");
                        path.setAttribute("stroke", el.color || "#000");
                    }
                }
            } else if (el.type !== 'drawing') {
                overlaps = (el.x < x + w && el.x + el.width > x &&
                            el.y < y + h && el.y + el.height > y);
                
                const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
                if (overlaps) {
                    selectedElementIds.add(el.id);
                    if (elDiv) elDiv.classList.add('selected');
                } else {
                    if (elDiv) elDiv.classList.remove('selected');
                }
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
                if (el.type === 'drawing' && el.points) {
                    el.points.forEach(pt => { if (pt.x > maxRight) maxRight = pt.x; });
                } else if (el.type !== 'drawing') {
                    const r = el.x + el.width;
                    if (r > maxRight) maxRight = r;
                }
            });
            boardConfig.width = Math.max(maxRight + 40, dragStartInfo.startWidth + rawDeltaX / zoom);
        }
        else if (dragStartInfo.edge === 'bottom') {
            let maxBottom = 600;
            Object.values(elements).forEach(el => {
                if (el.type === 'drawing' && el.points) {
                    el.points.forEach(pt => { if (pt.y > maxBottom) maxBottom = pt.y; });
                } else if (el.type !== 'drawing') {
                    const b = el.y + el.height;
                    if (b > maxBottom) maxBottom = b;
                }
            });
            boardConfig.height = Math.max(maxBottom + 40, dragStartInfo.startHeight + rawDeltaY / zoom);
        }
        else if (dragStartInfo.edge === 'left') {
            let minX = Infinity;
            Object.values(elements).forEach(el => {
                if (el.type === 'drawing' && el.points) {
                    el.points.forEach(pt => { if (pt.x < minX) minX = pt.x; });
                } else if (el.type !== 'drawing') {
                    if (el.x < minX) minX = el.x;
                }
            });
            const allowedShift = minX !== Infinity ? minX - 30 : Infinity;
            const requestedShift = rawDeltaX / zoom;
            const shift = Math.min(allowedShift, requestedShift);
            
            const newWidth = dragStartInfo.startWidth - shift;
            if (newWidth >= 800) {
                boardConfig.width = newWidth;
                panX += shift * zoom;
                
                Object.values(elements).forEach(el => {
                    if (el.type === 'drawing' && el.points) {
                        el.points.forEach(pt => pt.x -= shift);
                    } else {
                        el.x -= shift;
                    }
                });
                dragStartInfo.startX = dragStartInfo.startX + shift * zoom;
                dragStartInfo.startWidth = newWidth;
            }
        }
        else if (dragStartInfo.edge === 'top') {
            let minY = Infinity;
            Object.values(elements).forEach(el => {
                if (el.type === 'drawing' && el.points) {
                    el.points.forEach(pt => { if (pt.y < minY) minY = pt.y; });
                } else if (el.type !== 'drawing') {
                    if (el.y < minY) minY = el.y;
                }
            });
            const allowedShift = minY !== Infinity ? minY - 30 : Infinity;
            const requestedShift = rawDeltaY / zoom;
            const shift = Math.min(allowedShift, requestedShift);
            
            const newHeight = dragStartInfo.startHeight - shift;
            if (newHeight >= 600) {
                boardConfig.height = newHeight;
                panY += shift * zoom;
                
                Object.values(elements).forEach(el => {
                    if (el.type === 'drawing' && el.points) {
                        el.points.forEach(pt => pt.y -= shift);
                    } else {
                        el.y -= shift;
                    }
                });
                dragStartInfo.startY = dragStartInfo.startY + shift * zoom;
                dragStartInfo.startHeight = newHeight;
            }
        }
        updateCanvasSize();
        updateTransform();
        renderElements();
    }

    // Групповое перемещение элементов (включая рисунки)
    else if (dragStartInfo.type === 'element') {
        selectedElementIds.forEach(id => {
            const el = elements[id];
            const startPos = dragStartInfo.initialPositions[id];
            if (el && startPos) {
                if (el.type === 'drawing') {
                    el.points.forEach((pt, idx) => {
                        pt.x = Math.max(0, Math.min(startPos.points[idx].x + deltaX, boardConfig.width));
                        pt.y = Math.max(0, Math.min(startPos.points[idx].y + deltaY, boardConfig.height));
                    });
                    renderDrawing(el);
                } else {
                    const prevX = el.x;
                    const prevY = el.y;
                    
                    el.x = Math.max(0, Math.min(startPos.x + deltaX, boardConfig.width - el.width));
                    el.y = Math.max(0, Math.min(startPos.y + deltaY, boardConfig.height - el.height));
                    
                    if (el.type === 'frame') {
                        const dX = el.x - prevX;
                        const dY = el.y - prevY;
                        Object.values(elements).forEach(child => {
                            if (child.parentId === el.id) {
                                child.x += dX;
                                child.y += dY;
                                saveElement(child);
                            }
                        });
                    }

                    const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
                    if (elDiv) {
                        elDiv.style.left = `${el.x}px`;
                        elDiv.style.top = `${el.y}px`;
                    }
                }
            }
        });
    }

    // Ресайз элемента (одиночный)
    else if (dragStartInfo.type === 'resize') {
        const el = elements[dragStartInfo.id];
        el.width = Math.max(60, dragStartInfo.startW + deltaX);
        el.height = Math.max(40, dragStartInfo.startH + deltaY);

        const elDiv = document.querySelector(`.board-element[data-id="${el.id}"]`);
        if (elDiv) {
            elDiv.style.width = `${el.width}px`;
            elDiv.style.height = `${el.height}px`;
        }
    }
});

boardViewport.addEventListener('mouseup', (e) => {
    if (isPanning) {
        isPanning = false;
        boardViewport.style.cursor = isSpacePressed ? 'grab' : 'default';
        return;
    }

    if (isDrawing) {
        isDrawing = false;
        if (activeDrawingPoints.length > 1) {
            const drawId = "el_" + Math.random().toString(36).substring(2, 11);
            const elData = {
                id: drawId,
                type: 'drawing',
                points: activeDrawingPoints,
                color: activeColor,
                zIndex: Object.values(elements).length + 1
            };
            saveElement(elData);
        }
        if (activeDrawingPathEl) {
            activeDrawingPathEl.remove();
            activeDrawingPathEl = null;
        }
        return;
    }

    if (!dragStartInfo) return;

    if (dragStartInfo.type === 'eraser-drag') {
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
                    if (el.type !== 'frame') {
                        const elCenter = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
                        const frames = Object.values(elements).filter(f => f.type === 'frame' && f.id !== el.id);
                        for (let frame of frames) {
                            if (elCenter.x >= frame.x && elCenter.x <= frame.x + frame.width &&
                                elCenter.y >= frame.y && elCenter.y <= frame.y + frame.height) {
                                newParentId = frame.id;
                                break;
                            }
                        }
                    }
                    el.parentId = newParentId;
                }
                saveElement(el);
            }
        });
    } 
    else if (dragStartInfo.type === 'resize') {
        saveElement(elements[dragStartInfo.id]);
    }

    dragStartInfo = null;
});

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function showSaveStatus(text) {
    saveStatus.innerText = text;
}

btnToggleGrid.addEventListener('click', () => {
    btnToggleGrid.classList.toggle('active');
    boardCanvas.classList.toggle('no-grid');
});

boardTitleInput.addEventListener('blur', saveBoardInfo);
boardTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        boardTitleInput.blur();
    }
});

// Первоначальное центрирование доски на экране
setTimeout(() => {
    panX = (window.innerWidth - boardConfig.width) / 2;
    panY = (window.innerHeight - boardConfig.height) / 2;
    updateTransform();
}, 200);
