// todo.js - Логика Туду Листа с Firebase Firestore

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
let unsubscribeTasks = null;
let allTasks = [];
let currentRoute = 'inbox'; // 'inbox' или 'today'
let isCompletedSectionCollapsed = localStorage.getItem('todo_completed_collapsed') === 'true';

// Функция проверки, создана ли задача сегодня
const isToday = (timestamp) => {
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
};

let selectedDueDate = null; // Хранит выбранную дату в формате YYYY-MM-DD
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11

let taskIdToDelete = null;

// DOM элементы
const authRequiredState = document.getElementById('authRequiredState');
const todoMainLayout = document.getElementById('todoMainLayout');
const sidebarAvatar = document.getElementById('sidebarAvatar');
const sidebarName = document.getElementById('sidebarName');
const inboxCounter = document.getElementById('inboxCounter');
const todayCounter = document.getElementById('todayCounter');
const btnLoginLarge = document.getElementById('btnLoginLarge');

const confirmDeleteModal = document.getElementById('confirmDeleteModal');
const confirmDeleteTaskTitle = document.getElementById('confirmDeleteTaskTitle');
const btnConfirmDeleteCancel = document.getElementById('btnConfirmDeleteCancel');
const btnConfirmDeleteCoform = document.getElementById('btnConfirmDeleteCoform');

const taskTitleInput = document.getElementById('taskTitleInput');
const btnAddTask = document.getElementById('btnAddTask');
const activeTasksContainer = document.getElementById('activeTasksContainer');

// Элементы выбора срока
const btnDueDate = document.getElementById('btnDueDate');
const dueDateBtnText = document.getElementById('dueDateBtnText');
const btnClearDueDate = document.getElementById('btnClearDueDate');
const dueDateDropdown = document.getElementById('dueDateDropdown');
const calendarMonthYear = document.getElementById('calendarMonthYear');
const calendarDaysGrid = document.getElementById('calendarDaysGrid');
const calPrevMonth = document.getElementById('calPrevMonth');
const calNextMonth = document.getElementById('calNextMonth');
const calCurrentMonth = document.getElementById('calCurrentMonth');
const quickDayToday = document.getElementById('quickDayToday');
const quickDayTomorrow = document.getElementById('quickDayTomorrow');
const quickDayWeekend = document.getElementById('quickDayWeekend');
const quickDayNextWeek = document.getElementById('quickDayNextWeek');

const completedSection = document.getElementById('completedSection');
const completedToggle = document.getElementById('completedToggle');
const completedToggleText = document.getElementById('completedToggleText');
const completedTasksContainer = document.getElementById('completedTasksContainer');

const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
const todoSidebar = document.getElementById('todoSidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');


// === ЛОГИКА КАЛЕНДАРЯ И СРОКОВ ===

// Открыть/закрыть выпадающее меню срока
if (btnDueDate) {
    btnDueDate.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dueDateDropdown.style.display === 'none') {
            openDueDateDropdown();
        } else {
            closeDueDateDropdown();
        }
    });
}

// Очистить выбранный срок
if (btnClearDueDate) {
    btnClearDueDate.addEventListener('click', (e) => {
        e.stopPropagation(); // Предотвращаем открытие выпадающего меню
        setDueDate(null);
        closeDueDateDropdown();
    });
}

// Закрывать выпадающее меню по клику вне его области и сворачивать форму ввода
document.addEventListener('click', (e) => {
    // 1. Закрытие всех календарей при клике вне
    document.querySelectorAll('.due-date-dropdown').forEach(dropdown => {
        if (dropdown.style.display !== 'none') {
            const wrapper = dropdown.closest('.due-date-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        }
    });
    
    // 2. Сворачивание формы добавления задачи при клике вне
    const addTaskForm = document.querySelector('.add-task-form');
    if (addTaskForm && addTaskForm.classList.contains('expanded')) {
        const isClickInsideForm = addTaskForm.contains(e.target) || (dueDateDropdown && dueDateDropdown.contains(e.target));
        if (!isClickInsideForm && taskTitleInput.value.trim() === '') {
            addTaskForm.classList.remove('expanded');
            taskTitleInput.placeholder = '+ Добавить задачу';
            setDueDate(null); // сбрасываем выбранную дату
            taskTitleInput.style.height = 'auto'; // Reset height
            updateAddFormCharCount(); // Reset counter
        }
    }

    // 3. Закрытие всех меню действий («три точки») при клике вне их области
    document.querySelectorAll('.task-actions-dropdown').forEach(dropdown => {
        if (dropdown.style.display !== 'none') {
            const taskActions = dropdown.closest('.task-actions');
            if (taskActions && !taskActions.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        }
    });
});

// Разворачивание формы ввода при клике на нее
const addTaskForm = document.querySelector('.add-task-form');
if (addTaskForm) {
    addTaskForm.addEventListener('click', (e) => {
        if (!addTaskForm.classList.contains('expanded')) {
            addTaskForm.classList.add('expanded');
            taskTitleInput.placeholder = 'Что бы вы хотели сделать?';
            taskTitleInput.focus();
            updateAddFormCharCount();
        }
    });
}

function openDueDateDropdown() {
    dueDateDropdown.style.display = 'flex';
    initQuickOptionsText();
    renderCalendarGrid();
}

function closeDueDateDropdown() {
    dueDateDropdown.style.display = 'none';
}

// Заполнить дни недели для быстрых опций
function initQuickOptionsText() {
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    
    // Сегодня
    const today = new Date();
    if (quickDayToday) quickDayToday.textContent = dayNames[today.getDay()];
    
    // Завтра
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (quickDayTomorrow) quickDayTomorrow.textContent = dayNames[tomorrow.getDay()];
}

// Привязка кликов к быстрым опциям
document.querySelectorAll('.quick-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-date');
        const today = new Date();
        
        let targetDate = null;
        
        if (type === 'today') {
            targetDate = today;
        } else if (type === 'tomorrow') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            targetDate = tomorrow;
        } else if (type === 'weekend') {
            const sat = new Date();
            const currentDay = sat.getDay();
            const daysToSat = currentDay === 6 ? 7 : (currentDay === 0 ? 6 : 6 - currentDay);
            sat.setDate(sat.getDate() + daysToSat);
            targetDate = sat;
        } else if (type === 'nextweek') {
            const nextMon = new Date();
            const currentDay = nextMon.getDay();
            const daysToMon = currentDay === 1 ? 7 : (currentDay === 0 ? 1 : 8 - currentDay);
            nextMon.setDate(nextMon.getDate() + daysToMon);
            targetDate = nextMon;
        } else if (type === 'none') {
            targetDate = null;
        }
        
        if (targetDate) {
            const formatted = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
            setDueDate(formatted);
        } else {
            setDueDate(null);
        }
        
        closeDueDateDropdown();
    });
});

// Установка выбранного срока
function setDueDate(dateStr) {
    selectedDueDate = dateStr;
    
    if (!selectedDueDate) {
        if (dueDateBtnText) dueDateBtnText.textContent = 'Срок';
        if (btnClearDueDate) btnClearDueDate.style.display = 'none';
        if (btnDueDate) btnDueDate.classList.remove('active');
    } else {
        const label = formatDueDateDisplay(selectedDueDate);
        if (dueDateBtnText) dueDateBtnText.textContent = label;
        if (btnClearDueDate) btnClearDueDate.style.display = 'inline-flex';
        if (btnDueDate) btnDueDate.classList.add('active');
    }
}

// Форматирование даты для кнопки и карточек
function formatDueDateDisplay(dateStr) {
    if (!dateStr) return 'Срок';
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    
    if (dateStr === todayStr) return 'Сегодня';
    if (dateStr === tomorrowStr) return 'Завтра';
    
    const [year, month, day] = dateStr.split('-');
    const monthsRuShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return `${parseInt(day, 10)} ${monthsRuShort[parseInt(month, 10) - 1]}`;
}

// Проверка просроченности даты
function isDateOverdue(dueDateStr) {
    if (!dueDateStr) return false;
    const today = new Date();
    today.setHours(0,0,0,0);
    const [year, month, day] = dueDateStr.split('-');
    const dueDate = new Date(year, month - 1, day);
    return dueDate < today;
}

// Рендеринг календарной сетки
function renderCalendarGrid() {
    const monthsRu = [
        'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
        'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
    ];
    if (calendarMonthYear) {
        calendarMonthYear.textContent = `${monthsRu[calendarMonth]} ${calendarYear}`;
    }
    
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6; // Воскресенье -> 6
    
    const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(calendarYear, calendarMonth, 0).getDate();
    
    if (calendarDaysGrid) {
        calendarDaysGrid.innerHTML = '';
        
        // Предыдущий месяц (заглушка)
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const dayNum = prevMonthTotalDays - i;
            const cell = createCalendarCell(dayNum, false, calendarMonth - 1, calendarYear);
            calendarDaysGrid.appendChild(cell);
        }
        
        // Текущий месяц
        for (let i = 1; i <= totalDays; i++) {
            const cell = createCalendarCell(i, true, calendarMonth, calendarYear);
            calendarDaysGrid.appendChild(cell);
        }
        
        // Следующий месяц (заглушка для получения ровно 6 строк / 42 ячеек)
        const totalCells = startDayOfWeek + totalDays;
        const remainingCells = 42 - totalCells;
        for (let i = 1; i <= remainingCells; i++) {
            const cell = createCalendarCell(i, false, calendarMonth + 1, calendarYear);
            calendarDaysGrid.appendChild(cell);
        }
    }
}

function createCalendarCell(dayNum, isCurrentMonth, month, year) {
    let cellMonth = month;
    let cellYear = year;
    
    if (cellMonth < 0) {
        cellMonth = 11;
        cellYear--;
    } else if (cellMonth > 11) {
        cellMonth = 0;
        cellYear++;
    }
    
    const cell = document.createElement('span');
    cell.className = 'calendar-day-cell';
    cell.textContent = dayNum;
    
    if (!isCurrentMonth) {
        cell.classList.add('other-month');
    }
    
    const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    
    if (selectedDueDate === dateStr) {
        cell.classList.add('selected');
    }
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (todayStr === dateStr) {
        cell.classList.add('today');
    }
    
    cell.addEventListener('click', (e) => {
        e.stopPropagation();
        setDueDate(dateStr);
        renderCalendarGrid();
    });
    
    return cell;
}

// Навигация по месяцам
if (calPrevMonth) {
    calPrevMonth.addEventListener('click', (e) => {
        e.stopPropagation();
        calendarMonth--;
        if (calendarMonth < 0) {
            calendarMonth = 11;
            calendarYear--;
        }
        renderCalendarGrid();
    });
}
if (calNextMonth) {
    calNextMonth.addEventListener('click', (e) => {
        e.stopPropagation();
        calendarMonth++;
        if (calendarMonth > 11) {
            calendarMonth = 0;
            calendarYear++;
        }
        renderCalendarGrid();
    });
}
if (calCurrentMonth) {
    calCurrentMonth.addEventListener('click', (e) => {
        e.stopPropagation();
        calendarYear = new Date().getFullYear();
        calendarMonth = new Date().getMonth();
        renderCalendarGrid();
    });
}

// Инициализация привязок к событиям входа
if (btnLoginLarge) {
    btnLoginLarge.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.openAuthModal === 'function') {
            window.openAuthModal(btnLoginLarge);
        }
    });
}

// Клик на имя/аватар пользователя для открытия профиля
const sidebarUser = document.querySelector('.sidebar-user');
if (sidebarUser) {
    sidebarUser.style.cursor = 'pointer';
    sidebarUser.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.openAuthModal === 'function') {
            window.openAuthModal(sidebarUser);
        }
    });
}

// Мобильное меню управление
if (mobileSidebarToggle && todoSidebar && sidebarOverlay) {
    const toggleSidebar = () => {
        todoSidebar.classList.toggle('mobile-open');
        sidebarOverlay.classList.toggle('active');
    };

    mobileSidebarToggle.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);
}

// Переключение секции выполненных задач
if (completedToggle && completedTasksContainer) {
    completedToggle.addEventListener('click', () => {
        isCompletedSectionCollapsed = !isCompletedSectionCollapsed;
        localStorage.setItem('todo_completed_collapsed', isCompletedSectionCollapsed);
        updateCompletedToggleUI();
    });
}

function updateCompletedToggleUI() {
    if (isCompletedSectionCollapsed) {
        completedToggle.classList.add('collapsed');
        completedTasksContainer.classList.add('collapsed');
    } else {
        completedToggle.classList.remove('collapsed');
        completedTasksContainer.classList.remove('collapsed');
    }
}

// Функция роутинга (обработки URL хэшей)
function handleRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'today') {
        currentRoute = 'today';
    } else {
        currentRoute = 'inbox';
        // Если хэш пустой или некорректный, устанавливаем дефолтный #inbox
        if (!window.location.hash || window.location.hash === '#') {
            history.replaceState(null, null, '#inbox');
        }
    }

    // Обновляем подсветку пунктов меню в сайдбаре
    const menuInbox = document.getElementById('menuInbox');
    const menuToday = document.getElementById('menuToday');
    
    if (menuInbox) {
        if (currentRoute === 'inbox') menuInbox.classList.add('active');
        else menuInbox.classList.remove('active');
    }
    if (menuToday) {
        if (currentRoute === 'today') menuToday.classList.add('active');
        else menuToday.classList.remove('active');
    }

    const titleEl = document.querySelector('.list-title');

    if (currentRoute === 'today') {
        if (titleEl) titleEl.textContent = 'Сегодня';
    } else {
        if (titleEl) titleEl.textContent = 'Входящие';
    }

    // Закрываем боковое меню на мобильных после клика
    if (todoSidebar && todoSidebar.classList.contains('mobile-open')) {
        todoSidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    renderTasks();
}

// Слушаем изменение URL хэша
window.addEventListener('hashchange', handleRoute);

// Слушатель состояния авторизации
window.addEventListener('authChanged', (e) => {
    const user = e.detail.user;
    currentUid = user ? user.uid : null;
    
    if (user) {
        // Заполняем профиль в боковом меню
        if (sidebarName) sidebarName.textContent = user.displayName || "Пользователь";
        if (sidebarAvatar) {
            if (user.photoURL) {
                sidebarAvatar.src = user.photoURL;
                sidebarAvatar.style.display = 'block';
            } else {
                const firstLetter = (user.displayName || "U")[0].toUpperCase();
                sidebarAvatar.src = `https://via.placeholder.com/40/CCCCCC/FFFFFF?text=${firstLetter}`;
                sidebarAvatar.style.display = 'block';
            }
        }
        
        // Показываем интерфейс
        if (authRequiredState) authRequiredState.style.setProperty('display', 'none', 'important');
        if (todoMainLayout) todoMainLayout.style.display = 'flex';
        
        startTodoForUser(currentUid);
        handleRoute();
    } else {
        // Скрываем интерфейс
        if (todoMainLayout) todoMainLayout.style.setProperty('display', 'none', 'important');
        if (authRequiredState) authRequiredState.style.display = 'block';
        
        stopTodoForUser();
    }
});

// Загрузка данных пользователя
function startTodoForUser(uid) {
    if (unsubscribeTasks) unsubscribeTasks();
    
    const q = query(collection(db, 'users', uid, 'tasks'), orderBy('createdAt', 'desc'));
    
    unsubscribeTasks = onSnapshot(q, (snapshot) => {
        allTasks = [];
        snapshot.forEach((docSnap) => {
            allTasks.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        
        renderTasks();
    }, (error) => {
        console.error("Ошибка при получении списка задач:", error);
    });
}

// Отписка и очистка
function stopTodoForUser() {
    if (unsubscribeTasks) {
        unsubscribeTasks();
        unsubscribeTasks = null;
    }
    allTasks = [];
}

// Функция обновления счетчика символов для формы добавления
const charLimitWarning = document.getElementById('charLimitWarning');
function updateAddFormCharCount() {
    if (!charLimitWarning || !taskTitleInput) return;
    const len = taskTitleInput.value.length;
    charLimitWarning.textContent = `Лимит названия задачи: ${len} / 500`;
    if (len > 500) {
        charLimitWarning.classList.add('exceeded');
        if (btnAddTask) btnAddTask.disabled = true;
    } else {
        charLimitWarning.classList.remove('exceeded');
        if (btnAddTask) btnAddTask.disabled = false;
    }
}

// Добавление задачи
async function handleAddTask() {
    const titleText = taskTitleInput.value.trim();
    if (!titleText || titleText.length > 500 || !currentUid) return;
    
    // Блокируем кнопку на время добавления
    btnAddTask.disabled = true;
    
    try {
        await addDoc(collection(db, 'users', currentUid, 'tasks'), {
            title: titleText,
            completed: false,
            dueDate: selectedDueDate,
            createdAt: serverTimestamp()
        });
        taskTitleInput.value = '';
        setDueDate(null);
        taskTitleInput.style.height = 'auto'; // Reset height
        updateAddFormCharCount(); // Reset counter
    } catch (err) {
        console.error("Не удалось добавить задачу:", err);
    } finally {
        btnAddTask.disabled = false;
    }
}

// Добавление клика и клавиши Enter
if (btnAddTask) {
    btnAddTask.addEventListener('click', handleAddTask);
}
if (taskTitleInput) {
    taskTitleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTask();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            taskTitleInput.value = '';
            taskTitleInput.blur();
            const form = document.querySelector('.add-task-form');
            if (form) {
                form.classList.remove('expanded');
            }
            taskTitleInput.placeholder = '+ Добавить задачу';
            setDueDate(null);
            taskTitleInput.style.height = 'auto'; // Reset height
            updateAddFormCharCount(); // Reset counter
        }
    });

    taskTitleInput.addEventListener('input', () => {
        taskTitleInput.style.height = 'auto';
        taskTitleInput.style.height = taskTitleInput.scrollHeight + 'px';
        updateAddFormCharCount();
    });
}

// Удаление задачи
async function deleteTask(taskId) {
    if (!currentUid || !taskId) return;
    try {
        await deleteDoc(doc(db, 'users', currentUid, 'tasks', taskId));
    } catch (err) {
        console.error("Ошибка удаления задачи:", err);
    }
}

// Логика модального окна подтверждения удаления
function showDeleteConfirmation(taskId, taskTitle) {
    taskIdToDelete = taskId;
    if (confirmDeleteTaskTitle) {
        confirmDeleteTaskTitle.textContent = taskTitle;
    }
    if (confirmDeleteModal) {
        confirmDeleteModal.style.display = 'flex';
    }
}

function hideDeleteConfirmation() {
    taskIdToDelete = null;
    if (confirmDeleteModal) {
        confirmDeleteModal.style.display = 'none';
    }
}

if (btnConfirmDeleteCancel) {
    btnConfirmDeleteCancel.addEventListener('click', hideDeleteConfirmation);
}

if (btnConfirmDeleteCoform) {
    btnConfirmDeleteCoform.addEventListener('click', () => {
        if (taskIdToDelete) {
            deleteTask(taskIdToDelete);
        }
        hideDeleteConfirmation();
    });
}

if (confirmDeleteModal) {
    confirmDeleteModal.addEventListener('click', (e) => {
        if (e.target === confirmDeleteModal) {
            hideDeleteConfirmation();
        }
    });
}

// Переключение выполнения задачи
async function toggleTaskCompleted(taskId, currentStatus) {
    if (!currentUid || !taskId) return;
    try {
        await updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
            completed: !currentStatus
        });
    } catch (err) {
        console.error("Ошибка обновления задачи:", err);
    }
}

function createDropdownHtml() {
    return `
        <div class="due-date-dropdown" style="display: none;">
            <div class="due-quick-options">
                <button class="quick-opt-btn" type="button" data-date="today">
                    <span class="quick-opt-left">
                        <span class="quick-opt-icon" style="color: #22c55e;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        </span>
                        <span>Сегодня</span>
                    </span>
                    <span class="quick-opt-day-name">Пн</span>
                </button>
                <button class="quick-opt-btn" type="button" data-date="tomorrow">
                    <span class="quick-opt-left">
                        <span class="quick-opt-icon" style="color: #f97316;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <circle cx="12" cy="12" r="4"></circle>
                                <line x1="12" y1="2" x2="12" y2="4"></line>
                                <line x1="12" y1="20" x2="12" y2="22"></line>
                                <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"></line>
                                <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"></line>
                                <line x1="2" y1="12" x2="4" y2="12"></line>
                                <line x1="20" y1="12" x2="22" y2="12"></line>
                                <line x1="6.34" y1="17.66" x2="4.93" y2="19.07"></line>
                                <line x1="19.07" y1="4.93" x2="17.66" y2="6.34"></line>
                            </svg>
                        </span>
                        <span>Завтра</span>
                    </span>
                    <span class="quick-opt-day-name">Вт</span>
                </button>
            </div>
            
            <div class="due-divider"></div>
            
            <div class="due-calendar-picker">
                <div class="calendar-header">
                    <span class="calendar-month-year">июнь 2026</span>
                    <div class="calendar-nav">
                        <button class="cal-nav-btn cal-prev-month" type="button" title="Предыдущий месяц">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <button class="cal-nav-btn cal-current-month" type="button" title="Текущий месяц">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><circle cx="12" cy="12" r="6"/></svg>
                        </button>
                        <button class="cal-nav-btn cal-next-month" type="button" title="Следующий месяц">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                </div>
                <div class="calendar-weekdays">
                    <span>ПН</span><span>ВТ</span><span>СР</span><span>ЧТ</span><span>ПТ</span><span>СБ</span><span>ВС</span>
                </div>
                <div class="calendar-days"></div>
            </div>
            
            <div class="due-divider"></div>
            
            <div class="due-footer-actions">
                <button class="footer-action-btn btn-time" type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    Время
                </button>
                <button class="footer-action-btn btn-repeat" type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>
                    Повтор
                </button>
            </div>
        </div>
    `;
}

function initCalendarForWrapper(wrapperEl, activeDate, onSelect) {
    let localSelectedDate = activeDate;
    let localYear = activeDate ? parseInt(activeDate.split('-')[0], 10) : new Date().getFullYear();
    let localMonth = activeDate ? parseInt(activeDate.split('-')[1], 10) - 1 : new Date().getMonth();
    
    const btn = wrapperEl.querySelector('.btn-due-date');
    const textLabel = wrapperEl.querySelector('.due-date-text');
    const clearIcon = wrapperEl.querySelector('.clear-due-icon');
    
    // Вставляем меню, если его еще нет
    let dropdown = wrapperEl.querySelector('.due-date-dropdown');
    if (!dropdown) {
        wrapperEl.insertAdjacentHTML('beforeend', createDropdownHtml());
        dropdown = wrapperEl.querySelector('.due-date-dropdown');
    }
    
    // Заполняем названия дней для быстрых опций
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayNameEl = dropdown.querySelector('.due-quick-options button[data-date="today"] .quick-opt-day-name');
    if (todayNameEl) todayNameEl.textContent = dayNames[today.getDay()];
    const tomorrowNameEl = dropdown.querySelector('.due-quick-options button[data-date="tomorrow"] .quick-opt-day-name');
    if (tomorrowNameEl) tomorrowNameEl.textContent = dayNames[tomorrow.getDay()];
    
    const openDropdown = () => {
        dropdown.style.display = 'flex';
        renderGrid();
    };
    
    const closeDropdown = () => {
        dropdown.style.display = 'none';
    };
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown.style.display === 'none') {
            openDropdown();
        } else {
            closeDropdown();
        }
    });
    
    if (clearIcon) {
        clearIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            updateDate(null);
            closeDropdown();
        });
    }
    
    // Клик по быстрым кнопкам
    dropdown.querySelectorAll('.quick-opt-btn').forEach(optBtn => {
        optBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = optBtn.getAttribute('data-date');
            let targetDate = null;
            
            if (type === 'today') {
                targetDate = today;
            } else if (type === 'tomorrow') {
                targetDate = tomorrow;
            }
            
            if (targetDate) {
                const formatted = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
                updateDate(formatted);
            } else {
                updateDate(null);
            }
            closeDropdown();
        });
    });
    
    // Навигация
    dropdown.querySelector('.cal-prev-month').addEventListener('click', (e) => {
        e.stopPropagation();
        localMonth--;
        if (localMonth < 0) {
            localMonth = 11;
            localYear--;
        }
        renderGrid();
    });
    dropdown.querySelector('.cal-next-month').addEventListener('click', (e) => {
        e.stopPropagation();
        localMonth++;
        if (localMonth > 11) {
            localMonth = 0;
            localYear++;
        }
        renderGrid();
    });
    dropdown.querySelector('.cal-current-month').addEventListener('click', (e) => {
        e.stopPropagation();
        localYear = new Date().getFullYear();
        localMonth = new Date().getMonth();
        renderGrid();
    });
    
    function renderGrid() {
        const monthsRu = [
            'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
            'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
        ];
        dropdown.querySelector('.calendar-month-year').textContent = `${monthsRu[localMonth]} ${localYear}`;
        
        const firstDay = new Date(localYear, localMonth, 1);
        let startDayOfWeek = firstDay.getDay() - 1;
        if (startDayOfWeek < 0) startDayOfWeek = 6;
        
        const totalDays = new Date(localYear, localMonth + 1, 0).getDate();
        const prevMonthTotalDays = new Date(localYear, localMonth, 0).getDate();
        
        const daysGrid = dropdown.querySelector('.calendar-days');
        daysGrid.innerHTML = '';
        
        // Предыдущий месяц
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const dayNum = prevMonthTotalDays - i;
            daysGrid.appendChild(createCell(dayNum, false, localMonth - 1, localYear));
        }
        // Текущий месяц
        for (let i = 1; i <= totalDays; i++) {
            daysGrid.appendChild(createCell(i, true, localMonth, localYear));
        }
        // Следующий месяц
        const totalCells = startDayOfWeek + totalDays;
        const remainingCells = 42 - totalCells;
        for (let i = 1; i <= remainingCells; i++) {
            daysGrid.appendChild(createCell(i, false, localMonth + 1, localYear));
        }
    }
    
    function createCell(dayNum, isCurrentMonth, month, year) {
        let cellMonth = month;
        let cellYear = year;
        if (cellMonth < 0) {
            cellMonth = 11;
            cellYear--;
        } else if (cellMonth > 11) {
            cellMonth = 0;
            cellYear++;
        }
        
        const cell = document.createElement('span');
        cell.className = 'calendar-day-cell';
        cell.textContent = dayNum;
        if (!isCurrentMonth) cell.classList.add('other-month');
        
        const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        if (localSelectedDate === dateStr) cell.classList.add('selected');
        
        const tdy = new Date();
        const tdyStr = `${tdy.getFullYear()}-${String(tdy.getMonth() + 1).padStart(2, '0')}-${String(tdy.getDate()).padStart(2, '0')}`;
        if (tdyStr === dateStr) cell.classList.add('today');
        
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            updateDate(dateStr);
            renderGrid();
        });
        return cell;
    }
    
    function updateDate(dateStr) {
        localSelectedDate = dateStr;
        onSelect(dateStr);
        
        if (!localSelectedDate) {
            textLabel.textContent = 'Срок';
            if (clearIcon) clearIcon.style.display = 'none';
            btn.classList.remove('active');
        } else {
            textLabel.textContent = formatDueDateDisplay(dateStr);
            if (clearIcon) clearIcon.style.display = 'inline-flex';
            btn.classList.add('active');
        }
    }
}

// Переименование задачи (Карточка редактирования)
function enableInlineEdit(taskItemEl, task, titleSpan) {
    if (taskItemEl.classList.contains('editing')) return;
    
    taskItemEl.classList.add('editing');
    
    let editSelectedDueDate = task.dueDate;
    
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-task-container';
    
    editContainer.innerHTML = `
        <textarea class="task-input edit-title-input" placeholder="Что бы вы хотели сделать?" rows="1" style="height: auto;"></textarea>
        <div class="char-limit-warning edit-char-limit">Лимит названия задачи: 0 / 500</div>
        <div class="form-actions" style="margin-top: 14px;">
            <div class="due-date-wrapper">
                <button class="btn-due-date ${editSelectedDueDate ? 'active' : ''}" type="button">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span class="due-date-text">${formatDueDateDisplay(editSelectedDueDate)}</span>
                    <span class="clear-due-icon" style="display: ${editSelectedDueDate ? 'inline-flex' : 'none'};" title="Очистить">&times;</span>
                </button>
            </div>
            <div class="edit-actions-right" style="display: flex; gap: 8px;">
                <button class="btn-cancel" type="button">Отмена</button>
                <button class="btn-save" type="button">Сохранить</button>
            </div>
        </div>
    `;
    
    taskItemEl.appendChild(editContainer);
    
    const input = editContainer.querySelector('.edit-title-input');
    const warning = editContainer.querySelector('.edit-char-limit');
    const btnSave = editContainer.querySelector('.btn-save');
    
    const updateEditCharCount = () => {
        const len = input.value.length;
        warning.textContent = `Лимит названия задачи: ${len} / 500`;
        if (len > 500) {
            warning.classList.add('exceeded');
            btnSave.disabled = true;
        } else {
            warning.classList.remove('exceeded');
            btnSave.disabled = false;
        }
    };
    
    input.value = task.title;
    
    // Auto-resize textarea height immediately based on initial content
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    
    updateEditCharCount();

    input.focus();
    // Помещаем курсор в конец текста без автовыделения
    const val = input.value;
    input.value = '';
    input.value = val;
    
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        updateEditCharCount();
    });
    
    const btnCancel = editContainer.querySelector('.btn-cancel');
    const wrapper = editContainer.querySelector('.due-date-wrapper');
    
    // Инициализируем календарь
    initCalendarForWrapper(wrapper, editSelectedDueDate, (dateStr) => {
        editSelectedDueDate = dateStr;
    });
    
    const finishEdit = async () => {
        const newTitle = input.value.trim();
        if (!newTitle || newTitle.length > 500) return;
        
        taskItemEl.classList.remove('editing');
        editContainer.remove();
        
        const titleChanged = newTitle !== task.title;
        const dateChanged = editSelectedDueDate !== task.dueDate;
        
        if (titleChanged || dateChanged) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                    title: newTitle,
                    dueDate: editSelectedDueDate
                });
            } catch (err) {
                console.error("Ошибка сохранения задачи:", err);
                renderTasks();
            }
        } else {
            renderTasks();
        }
    };
    
    const cancelEdit = () => {
        taskItemEl.classList.remove('editing');
        editContainer.remove();
        renderTasks();
    };
    
    btnSave.addEventListener('click', (e) => {
        e.stopPropagation();
        finishEdit();
    });
    
    btnCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelEdit();
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// Отрендерить задачи в UI
function renderTasks() {
    const activeTasks = allTasks.filter(t => !t.completed);
    const completedTasks = allTasks.filter(t => t.completed);
    
    // Вычисляем счетчики для сайдбара
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
    
    const isTodayTask = (t) => {
        return t.dueDate === todayStr;
    };

    const inboxActiveCount = activeTasks.length;
    const todayActiveCount = activeTasks.filter(isTodayTask).length;
    
    if (inboxCounter) {
        inboxCounter.textContent = inboxActiveCount;
        inboxCounter.style.display = inboxActiveCount > 0 ? 'inline-block' : 'none';
    }
    if (todayCounter) {
        todayCounter.textContent = todayActiveCount;
        todayCounter.style.display = todayActiveCount > 0 ? 'inline-block' : 'none';
    }
    
    // Фильтруем задачи для отображения в зависимости от текущей вкладки (роута)
    let displayActiveTasks = [];
    let displayCompletedTasks = [];
    
    if (currentRoute === 'today') {
        displayActiveTasks = activeTasks.filter(isTodayTask);
        displayCompletedTasks = completedTasks.filter(isTodayTask);
    } else { // inbox
        displayActiveTasks = activeTasks;
        displayCompletedTasks = completedTasks;
    }
    
    // 1. РЕНДЕРИМ АКТИВНЫЕ ЗАДАЧИ
    activeTasksContainer.innerHTML = '';
    
    if (displayActiveTasks.length === 0) {
        activeTasksContainer.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 14 14"></polyline>
                </svg>
                <h3 class="empty-title">Все дела сделаны!</h3>
                <p class="empty-text">Добавьте новую задачу выше, чтобы спланировать свой день.</p>
            </div>
        `;
    } else {
        displayActiveTasks.forEach(task => {
            const el = createTaskRowElement(task);
            activeTasksContainer.appendChild(el);
        });
    }
    
    // 2. РЕНДЕРИМ ВЫПОЛНЕННЫЕ ЗАДАЧИ
    completedTasksContainer.innerHTML = '';
    
    if (displayCompletedTasks.length === 0) {
        if (completedSection) completedSection.style.display = 'none';
    } else {
        if (completedSection) completedSection.style.display = 'block';
        if (completedToggleText) completedToggleText.textContent = `Выполненные (${displayCompletedTasks.length})`;
        
        displayCompletedTasks.forEach(task => {
            const el = createTaskRowElement(task);
            completedTasksContainer.appendChild(el);
        });
        
        updateCompletedToggleUI();
    }
}

// Создать DOM элемент для строки задачи
function createTaskRowElement(task) {
    const item = document.createElement('div');
    item.className = `task-item ${task.completed ? 'completed' : ''}`;
    item.setAttribute('data-id', task.id);
    
    item.innerHTML = `
        <div class="checkbox-wrapper">
            <button class="custom-checkbox" aria-label="${task.completed ? 'Отметить невыполненной' : 'Отметить выполненной'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
        </div>
        <div class="task-content">
            <span class="task-title-text">${escapeHtml(task.title)}</span>
            ${task.dueDate ? `
                <span class="task-due-badge ${isDateOverdue(task.dueDate) ? 'overdue' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align: middle; margin-right: 3px; display: inline-block;">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span style="vertical-align: middle;">${formatDueDateDisplay(task.dueDate)}</span>
                </span>
            ` : ''}
        </div>
        <div class="task-actions">
            <button class="action-btn btn-more" title="Действия">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1.5"></circle>
                    <circle cx="12" cy="5" r="1.5"></circle>
                    <circle cx="12" cy="19" r="1.5"></circle>
                </svg>
            </button>
            <div class="task-actions-dropdown" style="display: none;">
                <button class="dropdown-item btn-edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Редактировать</span>
                </button>
                <button class="dropdown-item btn-delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Удалить</span>
                </button>
            </div>
        </div>
    `;
    
    const checkbox = item.querySelector('.custom-checkbox');
    const titleSpan = item.querySelector('.task-title-text');
    const btnMore = item.querySelector('.btn-more');
    const actionsDropdown = item.querySelector('.task-actions-dropdown');
    const btnEdit = item.querySelector('.btn-edit');
    const btnDelete = item.querySelector('.btn-delete');
    
    // Клик на чекбокс
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaskCompleted(task.id, task.completed);
    });
    
    // Клик на три точки
    btnMore.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Закрываем другие открытые меню действий перед тем, как открыть это
        document.querySelectorAll('.task-item').forEach(taskItem => {
            if (taskItem !== item) {
                taskItem.classList.remove('menu-open');
                const dropdown = taskItem.querySelector('.task-actions-dropdown');
                if (dropdown) dropdown.style.display = 'none';
            }
        });
        
        const isHidden = actionsDropdown.style.display === 'none';
        if (isHidden) {
            actionsDropdown.style.display = 'flex';
            item.classList.add('menu-open');
        } else {
            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');
        }
    });
    
    // Клик на кнопку редактирования из меню
    btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        actionsDropdown.style.display = 'none';
        item.classList.remove('menu-open');
        enableInlineEdit(item, task, titleSpan);
    });
    
    // Двойной клик на текст задачи также переводит в режим редактирования
    titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        enableInlineEdit(item, task, titleSpan);
    });
    
    // Клик на удаление из меню
    btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        actionsDropdown.style.display = 'none';
        item.classList.remove('menu-open');
        showDeleteConfirmation(task.id, task.title);
    });
    
    return item;
}

// Вспомогательная функция для экранирования HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Обработчик изменения размера окна для корректной высоты всех textarea
window.addEventListener('resize', () => {
    if (taskTitleInput) {
        taskTitleInput.style.height = 'auto';
        taskTitleInput.style.height = taskTitleInput.scrollHeight + 'px';
    }
    document.querySelectorAll('.edit-title-input').forEach(el => {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    });
});
