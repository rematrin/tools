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

// Состояние сессии рисования (Milanote style)
let isDrawing = false;
let localStrokes = []; // Временные штрихи сессии рисования: { color, points: [] }
let localDrawingTool = 'pencil'; // 'pencil', 'eraser'
let activeDrawingPoints = [];
let activeDrawingPathEl = null;

// Состояние редактирования/выделения
let activeTool = 'select'; // 'select', 'text', 'sticker', 'frame', 'link', 'image', 'draw', 'eraser'
let activeColor = '#111827';
let selectedElementIds = new Set(); // Поддержка множественного выделения
let editingElementId = null; // ID элемента, который сейчас редактируется (сразу после создания)
let savedTextRange = null; // Сохраненное выделение текста для создания ссылок

// Временные данные для перетаскивания и ресайза
let dragStartInfo = null; // { type: 'element'|'resize'|'canvas-resize'|'selection-marquee', id, startX, startY, ... }

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

// DOM Элементы панели режима рисования (Milanote style)
const drawingModePanel = document.getElementById('drawingModePanel');
const drawBtnPencil = document.getElementById('drawBtnPencil');
const drawBtnEraser = document.getElementById('drawBtnEraser');
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
    if (typeof updateElementOptionsPanel === 'function') {
        updateElementOptionsPanel();
    }
    if (typeof updateTextFormatToolbarPosition === 'function') {
        updateTextFormatToolbarPosition();
    }
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
        // Входим в сессию рисования Milanote style
        document.body.classList.add('drawing-mode-active');
        drawingModePanel.classList.add('active');
        localStrokes = [];
        localDrawingTool = 'pencil';
        drawBtnPencil.classList.add('active');
        drawBtnEraser.classList.remove('active');
        
        drawingLayer.innerHTML = '';
        boardCanvas.style.cursor = 'crosshair';
        selectedElementIds.clear();
        document.querySelectorAll('.board-element').forEach(el => el.classList.remove('selected'));
    } else {
        document.body.classList.remove('drawing-mode-active');
        drawingModePanel.classList.remove('active');
    }

    if (toolName === 'sticker') {
        colorPickerPanel.classList.add('active');
    } else {
        colorPickerPanel.classList.remove('active');
    }

    if (toolName === 'eraser') {
        boardCanvas.style.cursor = 'cell';
    } else if (toolName !== 'draw') {
        boardCanvas.style.cursor = 'default';
    }
}

Object.keys(tools).forEach(name => {
    if (tools[name]) {
        tools[name].addEventListener('click', () => setTool(name));
    }
});

// Переключение цвета на панели карандаша / стикеров
document.querySelectorAll('.color-option, .draw-color-opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
        document.querySelectorAll('.color-option, .draw-color-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        activeColor = opt.getAttribute('data-color');
    });
});

// Кнопки управления сессией рисования
drawBtnPencil.addEventListener('click', () => {
    localDrawingTool = 'pencil';
    drawBtnPencil.classList.add('active');
    drawBtnEraser.classList.remove('active');
    boardCanvas.style.cursor = 'crosshair';
});

drawBtnEraser.addEventListener('click', () => {
    localDrawingTool = 'eraser';
    drawBtnEraser.classList.add('active');
    drawBtnPencil.classList.remove('active');
    boardCanvas.style.cursor = 'cell';
});

btnDrawDiscard.addEventListener('click', () => {
    exitDrawingMode(false);
});

btnDrawSave.addEventListener('click', () => {
    exitDrawingMode(true);
});

function exitDrawingMode(save = false) {
    document.body.classList.remove('drawing-mode-active');
    drawingModePanel.classList.remove('active');
    
    if (save && localStrokes.length > 0) {
        // Находим bounding box всех нарисованных линий
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        localStrokes.forEach(s => {
            s.points.forEach(pt => {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
            });
        });

        // Смещение всех точек относительно верхнего левого угла (minX, minY)
        const shiftedStrokes = localStrokes.map(s => {
            return {
                color: s.color,
                points: s.points.map(pt => ({
                    x: pt.x - minX,
                    y: pt.y - minY
                }))
            };
        });

        const w = Math.max(40, maxX - minX);
        const h = Math.max(40, maxY - minY);

        saveUndoState();

        const id = "el_" + Math.random().toString(36).substring(2, 11);
        const maxZ = Object.values(elements).reduce((max, el) => Math.max(max, el.zIndex || 0), 0);
        const elData = {
            id,
            type: 'drawing',
            x: minX,
            y: minY,
            width: w,
            height: h,
            strokes: shiftedStrokes,
            zIndex: maxZ + 1
        };

        saveElement(elData);
    }

    localStrokes = [];
    drawingLayer.innerHTML = '';
    setTool('select');
    renderElements();
}

function redrawLocalStrokes() {
    drawingLayer.innerHTML = '';
    localStrokes.forEach((stroke, strokeIdx) => {
        if (!stroke.points || stroke.points.length === 0) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("stroke", stroke.color);
        path.setAttribute("stroke-width", "4");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        
        let d = `M ${stroke.points[0].x} ${stroke.points[0].y}`;
        for (let i = 1; i < stroke.points.length; i++) {
            d += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
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
        color: type === 'text' ? '#ffffff' : activeColor, // Текстовый блок изначально белый
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
tools.sticker.addEventListener('click', () => createNewElement('sticker', undefined, undefined, { content: "" }));
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
    
    // Всегда очищаем SVG-слой перед перерисовкой
    drawingLayer.innerHTML = '';

    // Если мы в режиме активного рисования, рисуем временные штрихи сессии
    if (activeTool === 'draw') {
        localStrokes.forEach((stroke) => {
            if (!stroke.points || stroke.points.length === 0) return;
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("stroke", stroke.color);
            path.setAttribute("stroke-width", "4");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("stroke-linejoin", "round");
            
            let d = `M ${stroke.points[0].x} ${stroke.points[0].y}`;
            for (let i = 1; i < stroke.points.length; i++) {
                d += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
            }
            path.setAttribute("d", d);
            drawingLayer.appendChild(path);
        });
    }

    const sortedElements = Object.values(elements).sort((a, b) => {
        if (a.type === 'frame' && b.type !== 'frame') return -1;
        if (a.type !== 'frame' && b.type === 'frame') return 1;
        return (a.zIndex || 0) - (b.zIndex || 0);
    });

    sortedElements.forEach(el => {
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

        // Применяем кастомные цвета, скругление и тени (только не для рисунков)
        if (el.type === 'drawing') {
            elDiv.style.backgroundColor = 'transparent';
            elDiv.style.boxShadow = 'none';
            elDiv.style.border = 'none';
            elDiv.style.borderRadius = '0px';
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

        // Для рисунков убираем возможность изменения размера (скрываем ресайзер)
        if (el.type !== 'drawing') {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'element-resize-handle handle-se';
            elDiv.appendChild(resizeHandle);
        }

        if (el.type === 'drawing') {
            const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgEl.setAttribute("viewBox", `0 0 ${el.width} ${el.height}`);
            svgEl.setAttribute("width", "100%");
            svgEl.setAttribute("height", "100%");

            if (el.strokes) {
                el.strokes.forEach(stroke => {
                    if (!stroke.points || stroke.points.length === 0) return;
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute("stroke", stroke.color || "#000");
                    path.setAttribute("stroke-width", "4");
                    path.setAttribute("fill", "none");
                    path.setAttribute("stroke-linecap", "round");
                    path.setAttribute("stroke-linejoin", "round");
                    
                    let d = `M ${stroke.points[0].x} ${stroke.points[0].y}`;
                    for (let i = 1; i < stroke.points.length; i++) {
                        d += ` L ${stroke.points[i].x} ${stroke.points[i].y}`;
                    }
                    path.setAttribute("d", d);
                    svgEl.appendChild(path);
                });
            }
            elDiv.appendChild(svgEl);
        }
        else if (el.type === 'text' || el.type === 'sticker') {
            const textEl = document.createElement('div');
            textEl.className = 'el-text-content';
            textEl.contentEditable = "false"; // По умолчанию выключено редактирование
            textEl.setAttribute('data-id', el.id);
            textEl.innerHTML = el.content || '';
            
            textEl.addEventListener('blur', () => {
                textEl.contentEditable = "false";
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

            // Двойной клик активирует редактирование
            elDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                textEl.contentEditable = "true";
                textEl.focus();
                
                // Ставим курсор в конец текста
                const range = document.createRange();
                range.selectNodeContents(textEl);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
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
    updateElementOptionsPanel();
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

    // 1. Рисование внутри сессии (Milanote style)
    if (activeTool === 'draw') {
        if (localDrawingTool === 'pencil') {
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
        }
        else if (localDrawingTool === 'eraser') {
            localStrokes = localStrokes.filter(stroke => {
                const touched = stroke.points.some(pt => {
                    const dx = pt.x - clickX;
                    const dy = pt.y - clickY;
                    return Math.sqrt(dx*dx + dy*dy) < 20;
                });
                return !touched;
            });
            redrawLocalStrokes();
            dragStartInfo = { type: 'local-eraser-drag' };
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

    if (dragStartInfo && dragStartInfo.type === 'local-eraser-drag') {
        localStrokes = localStrokes.filter(stroke => {
            const touched = stroke.points.some(pt => {
                const dx = pt.x - curX;
                const dy = pt.y - curY;
                return Math.sqrt(dx*dx + dy*dy) < 20;
            });
            return !touched;
        });
        redrawLocalStrokes();
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
    
    if (typeof updateElementOptionsPanel === 'function') {
        updateElementOptionsPanel();
    }
});

boardViewport.addEventListener('mouseup', (e) => {
    if (isPanning) {
        isPanning = false;
        boardViewport.style.cursor = isSpacePressed ? 'grab' : 'default';
        return;
    }

    // Завершаем текущую линию в локальной сессии рисования
    if (isDrawing) {
        isDrawing = false;
        if (activeDrawingPoints.length > 1) {
            localStrokes.push({
                color: activeColor,
                points: activeDrawingPoints
            });
        }
        if (activeDrawingPathEl) {
            activeDrawingPathEl.remove();
            activeDrawingPathEl = null;
        }
        redrawLocalStrokes();
        return;
    }

    if (!dragStartInfo) return;

    if (dragStartInfo.type === 'local-eraser-drag') {
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
    if (typeof updateElementOptionsPanel === 'function') {
        updateElementOptionsPanel();
    }
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

// Переменная отслеживания первого центрирования
let hasCenteredOnLoad = false;

function centerBoardOnElements() {
    const els = Object.values(elements);
    const headerEl = document.querySelector('.board-header');
    const headerHeight = headerEl ? headerEl.offsetHeight : 64;
    const bannerEl = document.getElementById('mobileReadOnlyBanner');
    const bannerHeight = (bannerEl && mobileReadOnlyBanner.style.display !== 'none') ? 40 : 0;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight - headerHeight - bannerHeight;

    if (isMobileOrTablet) {
        // На мобильных подбираем зум, чтобы уместить все элементы на экране
        if (els.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            els.forEach(el => {
                minX = Math.min(minX, el.x);
                maxX = Math.max(maxX, el.x + el.width);
                minY = Math.min(minY, el.y);
                maxY = Math.max(maxY, el.y + el.height);
            });
            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;
            
            // Задаем масштаб с запасом 80px по бокам
            zoom = Math.min(viewportWidth / (contentWidth + 80), viewportHeight / (contentHeight + 80));
            zoom = Math.min(Math.max(zoom, 0.15), 1.2); // Ограничиваем сверху 1.2
            
            const centerX = minX + contentWidth / 2;
            const centerY = minY + contentHeight / 2;
            
            panX = viewportWidth / 2 - centerX * zoom;
            panY = (headerHeight + bannerHeight) + viewportHeight / 2 - centerY * zoom;
        } else {
            // Если доска пустая, вмещаем весь холст в экран
            zoom = Math.min(viewportWidth / boardConfig.width, viewportHeight / boardConfig.height) * 0.95;
            zoom = Math.min(Math.max(zoom, 0.15), 1.0);
            
            panX = (viewportWidth - boardConfig.width * zoom) / 2;
            panY = (headerHeight + bannerHeight) + (viewportHeight - boardConfig.height * zoom) / 2;
        }
    } else {
        // На десктопе сохраняем текущий масштаб, центрируем с учетом шапки
        if (els.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            els.forEach(el => {
                minX = Math.min(minX, el.x);
                maxX = Math.max(maxX, el.x + el.width);
                minY = Math.min(minY, el.y);
                maxY = Math.max(maxY, el.y + el.height);
            });
            const centerX = minX + (maxX - minX) / 2;
            const centerY = minY + (maxY - minY) / 2;
            
            panX = viewportWidth / 2 - centerX * zoom;
            panY = (headerHeight + bannerHeight) + viewportHeight / 2 - centerY * zoom;
        } else {
            panX = (viewportWidth - boardConfig.width * zoom) / 2;
            panY = (headerHeight + bannerHeight) + (viewportHeight - boardConfig.height * zoom) / 2;
        }
    }
    updateTransform();
}

// === МОБИЛЬНАЯ АДАПТИВНОСТЬ И ТАЧ-СОБЫТИЯ ===
const isMobileOrTablet = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (isMobileOrTablet) {
    const mobileReadOnlyBanner = document.getElementById('mobileReadOnlyBanner');
    if (mobileReadOnlyBanner) {
        mobileReadOnlyBanner.style.display = 'flex';
    }
    
    // Скрываем маркеры ресайза и тулбары в режиме просмотра
    document.body.classList.add('mobile-readonly-mode');
    
    // Инициализация тач-событий для навигации
    let startTouchPanX = 0;
    let startTouchPanY = 0;
    let isTouchPanning = false;
    let startTouchDist = 0;
    let startTouchZoom = 1.0;

    boardViewport.addEventListener('touchstart', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) {
            return; 
        }
        if (e.touches.length === 1) {
            isTouchPanning = true;
            startTouchPanX = e.touches[0].clientX - panX;
            startTouchPanY = e.touches[0].clientY - panY;
        } else if (e.touches.length === 2) {
            isTouchPanning = false;
            startTouchZoom = zoom;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            startTouchDist = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });

    boardViewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isTouchPanning) {
            panX = e.touches[0].clientX - startTouchPanX;
            panY = e.touches[0].clientY - startTouchPanY;
            updateTransform();
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const factor = dist / startTouchDist;
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            
            const rect = boardViewport.getBoundingClientRect();
            const mouseX = centerX - rect.left;
            const mouseY = centerY - rect.top;
            
            zoomTo(startTouchZoom * factor, mouseX, mouseY);
        }
    }, { passive: true });

    boardViewport.addEventListener('touchend', (e) => {
        isTouchPanning = false;
    }, { passive: true });
}

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
    
    if (selectedElementIds.size === 1 && activeTool === 'select') {
        const id = Array.from(selectedElementIds)[0];
        const el = elements[id];
        
        // Показываем плашку только для настраиваемых типов
        if (el && (el.type === 'text' || el.type === 'sticker' || el.type === 'frame' || el.type === 'link')) {
            panel.style.display = 'flex';
            
            const elDiv = document.querySelector(`.board-element[data-id="${id}"]`);
            if (elDiv) {
                const rect = elDiv.getBoundingClientRect();
                const viewportRect = boardViewport.getBoundingClientRect();
                
                // Вычисляем координаты относительно viewport
                const top = rect.top - viewportRect.top - 48; // на 48px выше элемента
                const left = rect.left - viewportRect.left + (rect.width - panel.offsetWidth) / 2;
                
                panel.style.top = `${Math.max(10, top)}px`;
                panel.style.left = `${Math.max(10, left)}px`;
            }
            
            // Синхронизируем цвета
            popup.querySelectorAll('.popup-color-opt').forEach(opt => {
                if (opt.getAttribute('data-color') === el.color) {
                    opt.classList.add('active');
                } else {
                    opt.classList.remove('active');
                }
            });
            
            // Синхронизируем тени
            popup.querySelectorAll('.shadow-opt-btn').forEach(btn => {
                if (btn.getAttribute('data-shadow') === (el.shadowType || 'box')) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            // Синхронизируем скругление
            const brSlider = document.getElementById('sliderCornerRadius');
            const brLabel = document.getElementById('lblCornerRadiusValue');
            const currentBr = el.borderRadius !== undefined ? el.borderRadius : 8;
            brSlider.value = currentBr;
            brLabel.innerText = `${currentBr}px`;
            
            return;
        }
    }
    
    panel.style.display = 'none';
    popup.classList.remove('active');
}

function initElementOptionsPanel() {
    const btnColor = document.getElementById('btnOptColor');
    const popup = document.getElementById('elementSettingsPopup');
    const sliderBr = document.getElementById('sliderCornerRadius');
    const labelBr = document.getElementById('lblCornerRadiusValue');
    const customColorInput = document.getElementById('optCustomColorInput');

    btnColor.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.classList.toggle('active');
    });
    
    // Закрытие попапа и сброс выделения при клике вне элементов
    document.addEventListener('mousedown', (e) => {
        if (activeTool === 'draw') return; // Не сбрасываем выделение в процессе рисования
        
        if (!e.target.closest('#elementOptionsPanel') && 
            !e.target.closest('#textFormatToolbar') && 
            !e.target.closest('.board-element') && 
            !e.target.closest('.board-toolbar') && 
            !e.target.closest('.board-header')) {
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

    // Предотвращаем потерю фокуса с contenteditable при кликах на панель и поп-апы
    [btnBold, btnItalic, btnUnderline, btnStrike, btnHighlight, highlightPopup].forEach(el => {
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

    btnHighlight.addEventListener('click', () => {
        highlightPopup.classList.toggle('active');
    });

    highlightPopup.querySelectorAll('.highlight-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
            const type = opt.getAttribute('data-type');
            const color = opt.getAttribute('data-color');
            if (type === 'fore') {
                document.execCommand('foreColor', false, color);
            } else if (type === 'back') {
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
            }
        }
    });
}

initElementOptionsPanel();
initTextFormatToolbar();
