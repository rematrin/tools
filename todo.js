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
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();

function getCalendarSvg(day) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
        <text x="12" y="19" font-size="8.5" font-family="-apple-system, system-ui, sans-serif" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">${day}</text>
    </svg>`;
}

// Initialize dynamic calendar icon on page load
const menuTodayEl = document.getElementById('menuToday');
if (menuTodayEl) {
    const todayIconEl = menuTodayEl.querySelector('.menu-icon');
    if (todayIconEl) {
        todayIconEl.innerHTML = getCalendarSvg(new Date().getDate());
    }
}
const mobileNavTodayEl = document.getElementById('mobileNavToday');
if (mobileNavTodayEl) {
    const todayIconEl = mobileNavTodayEl.querySelector('.mobile-nav-icon');
    if (todayIconEl) {
        todayIconEl.innerHTML = getCalendarSvg(new Date().getDate());
    }
}

let currentUid = null;
let unsubscribeTasks = null;
let allTasks = [];
let currentRoute = 'inbox'; // 'inbox' или 'today'
let isCompletedSectionCollapsed = localStorage.getItem('todo_completed_collapsed') === 'true';
let activeContextMenu = null;

let projectsList = [];
let unsubscribeProjects = null;
let sectionsList = [];
let unsubscribeSections = null;

const btnAddProject = document.getElementById('btnAddProject');
const projectsListContainer = document.getElementById('projectsList');

// Функция проверки, создана ли задача сегодня
const isToday = (timestamp) => {
    if (!timestamp) return false;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const today = new Date();
    return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
};

const getDefaultDueDate = () => {
    if (currentRoute === 'today') {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    if (currentRoute === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    }
    return null;
};

let selectedDueDate = getDefaultDueDate(); // Хранит выбранную дату в формате YYYY-MM-DD
let selectedDueTime = null; // Хранит выбранное время в формате HH:MM
let selectedDueRepeat = null; // Хранит выбранный повтор: daily, weekly, weekday, monthly, yearly, custom
let selectedPriority = 0; // Приоритет новой задачи по умолчанию
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
const tomorrowCounter = document.getElementById('tomorrowCounter');
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

// Выбор проекта для новой задачи
let addTaskSelectedProjectId = null;
const btnAddTaskProject = document.getElementById('btnAddTaskProject');
const addTaskProjectIcon = document.getElementById('addTaskProjectIcon');
const addTaskProjectText = document.getElementById('addTaskProjectText');
const addTaskProjectDropdown = document.getElementById('addTaskProjectDropdown');

const completedSection = document.getElementById('completedSection');
const completedToggle = document.getElementById('completedToggle');
const completedToggleText = document.getElementById('completedToggleText');
const completedTasksContainer = document.getElementById('completedTasksContainer');
const completedClearBtn = document.getElementById('completedClearBtn');

let currentDisplayCompletedTasks = [];

const contentSidebarToggle = document.getElementById('contentSidebarToggle');
const sidebarCloseToggle = document.getElementById('sidebarCloseToggle');
const todoSidebar = document.getElementById('todoSidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Выбор приоритета
const btnPriority = document.getElementById('btnPriority');
const priorityDropdown = document.getElementById('priorityDropdown');
const priorityBtnIcon = document.getElementById('priorityBtnIcon');
const priorityBtnText = document.getElementById('priorityBtnText');

function setPriority(val) {
    selectedPriority = val;
    if (priorityBtnText && priorityBtnIcon) {
        if (val === 3) {
            priorityBtnText.textContent = 'Приоритет 1';
            priorityBtnIcon.style.color = '#dc2626';
            priorityBtnIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15" stroke="#dc2626" stroke-width="2"></line>
                </svg>
            `;
        } else if (val === 2) {
            priorityBtnText.textContent = 'Приоритет 2';
            priorityBtnIcon.style.color = '#d97706';
            priorityBtnIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15" stroke="#d97706" stroke-width="2"></line>
                </svg>
            `;
        } else if (val === 1) {
            priorityBtnText.textContent = 'Приоритет 3';
            priorityBtnIcon.style.color = '#2563eb';
            priorityBtnIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15" stroke="#2563eb" stroke-width="2"></line>
                </svg>
            `;
        } else {
            priorityBtnText.textContent = 'Приоритет';
            priorityBtnIcon.style.color = '#808080';
            priorityBtnIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15"></line>
                </svg>
            `;
        }
    }
    if (priorityDropdown) {
        priorityDropdown.querySelectorAll('.priority-opt-btn').forEach(btn => {
            const btnPrio = parseInt(btn.getAttribute('data-priority'));
            const check = btn.querySelector('.priority-check');
            if (check) {
                check.style.display = (btnPrio === val) ? 'inline' : 'none';
            }
        });
    }
}

if (btnPriority && priorityDropdown) {
    btnPriority.addEventListener('click', (e) => {
        e.stopPropagation();
        if (priorityDropdown.style.display === 'none' || priorityDropdown.style.display === '') {
            if (addTaskProjectDropdown) addTaskProjectDropdown.style.display = 'none';
            if (dueDateDropdown) dueDateDropdown.style.display = 'none';
            priorityDropdown.style.display = 'flex';
        } else {
            priorityDropdown.style.display = 'none';
        }
    });

    priorityDropdown.querySelectorAll('.priority-opt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const prio = parseInt(btn.getAttribute('data-priority'));
            setPriority(prio);
            priorityDropdown.style.display = 'none';
        });
    });
}

// === ЛОГИКА КАЛЕНДАРЯ И СРОКОВ ===

if (dueDateDropdown) {
    setupNestedViews(
        dueDateDropdown,
        () => selectedDueDate,
        (dateStr) => {
            selectedDueDate = dateStr;
        },
        () => selectedDueTime,
        (timeStr) => {
            selectedDueTime = timeStr;
        },
        () => selectedDueRepeat,
        (repeatStr) => {
            selectedDueRepeat = repeatStr;
        },
        () => {
            setDueDate(selectedDueDate, selectedDueTime, selectedDueRepeat);
        }
    );
}

// Открыть/закрыть выпадающее меню срока
if (btnDueDate) {
    btnDueDate.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dueDateDropdown.style.display === 'none') {
            if (addTaskProjectDropdown) addTaskProjectDropdown.style.display = 'none';
            if (priorityDropdown) priorityDropdown.style.display = 'none';
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

// Открыть/закрыть выпадающее меню проектов для новой задачи
if (btnAddTaskProject) {
    btnAddTaskProject.addEventListener('click', (e) => {
        e.stopPropagation();
        if (addTaskProjectDropdown.style.display === 'none') {
            if (dueDateDropdown) dueDateDropdown.style.display = 'none';
            if (priorityDropdown) priorityDropdown.style.display = 'none';
            addTaskProjectDropdown.style.display = 'flex';
            renderAddTaskProjectDropdown();
        } else {
            addTaskProjectDropdown.style.display = 'none';
        }
    });
}

// Закрывать выпадающие меню по клику вне их области и сворачивать форму ввода
document.addEventListener('click', (e) => {
    // 1. Закрытие всех календарей/выпадающих списков при клике вне
    document.querySelectorAll('.due-date-dropdown').forEach(dropdown => {
        if (dropdown.style.display !== 'none') {
            const wrapper = dropdown.closest('.due-date-wrapper') || dropdown.closest('.add-task-project-wrapper') || dropdown.closest('.priority-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        }
    });

    // 2. Сворачивание формы добавления задачи при клике вне
    const addTaskForm = document.querySelector('.add-task-form');
    if (addTaskForm && addTaskForm.classList.contains('expanded')) {
        const isClickInsideForm = addTaskForm.contains(e.target) || 
                                  (dueDateDropdown && dueDateDropdown.contains(e.target)) ||
                                  (addTaskProjectDropdown && addTaskProjectDropdown.contains(e.target)) ||
                                  (priorityDropdown && priorityDropdown.contains(e.target));
        if (!isClickInsideForm && taskTitleInput.value.trim() === '') {
            addTaskForm.classList.remove('expanded');
            taskTitleInput.placeholder = '+ Добавить задачу';
            setDueDate(getDefaultDueDate()); // сбрасываем выбранную дату к дефолтной для текущего раздела
            setPriority(0); // сбрасываем приоритет
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
                taskActions.closest('.task-item')?.classList.remove('menu-open');
            }
        }
    });

    // 4. Закрытие меню действий раздела при клике вне его области
    document.querySelectorAll('.section-actions-dropdown').forEach(dropdown => {
        if (dropdown.style.display !== 'none') {
            const wrapper = dropdown.closest('.section-actions-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                dropdown.style.display = 'none';
                dropdown.closest('.project-section-header')?.classList.remove('menu-open');
            }
        }
    });

    // 5. Закрытие меню действий проекта в шапке при клике вне
    const projectHeaderDropdown = document.getElementById('projectHeaderDropdown');
    if (projectHeaderDropdown && projectHeaderDropdown.style.display !== 'none') {
        const headerActions = document.getElementById('projectHeaderActions');
        if (headerActions && !headerActions.contains(e.target)) {
            projectHeaderDropdown.style.display = 'none';
        }
    }

    // 6. Закрытие контекстного меню проектов при клике вне
    if (activeContextMenu && !e.target.closest('.project-actions-btn') && !e.target.closest('.custom-context-menu')) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }

    // 7. Закрытие меню пользователя при клике вне
    const userProfileMenuEl = document.getElementById('userProfileMenu');
    if (userProfileMenuEl && userProfileMenuEl.style.display !== 'none' && !e.target.closest('.sidebar-user') && !userProfileMenuEl.contains(e.target)) {
        userProfileMenuEl.style.display = 'none';
    }
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
    const mainView = dueDateDropdown.querySelector('.due-main-view');
    const timeView = dueDateDropdown.querySelector('.due-time-view');
    const repeatView = dueDateDropdown.querySelector('.due-repeat-view');
    if (mainView) mainView.style.display = 'flex';
    if (timeView) timeView.style.display = 'none';
    if (repeatView) repeatView.style.display = 'none';
    initQuickOptionsText();
    renderCalendarGrid();
}

function closeDueDateDropdown() {
    dueDateDropdown.style.display = 'none';
}

function setAddTaskProject(projectId) {
    addTaskSelectedProjectId = projectId;
    if (projectId === null) {
        if (addTaskProjectText) addTaskProjectText.textContent = 'Входящие';
        if (addTaskProjectIcon) {
            addTaskProjectIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`;
        }
    } else {
        const project = projectsList.find(p => p.id === projectId);
        if (project) {
            if (addTaskProjectText) addTaskProjectText.textContent = project.name;
            if (addTaskProjectIcon) {
                addTaskProjectIcon.innerHTML = project.iconUrl ?
                    `<img src="${project.iconUrl}" style="width: 14px; height: 14px; object-fit: contain; border-radius: 4px; display: block;">` :
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>`;
            }
        } else {
            setAddTaskProject(null);
        }
    }
}

function renderAddTaskProjectDropdown() {
    if (!addTaskProjectDropdown) return;
    addTaskProjectDropdown.innerHTML = '';

    // 1. Входящие
    const isInboxSelected = addTaskSelectedProjectId === null;
    const inboxItem = document.createElement('button');
    inboxItem.className = 'dropdown-item';
    inboxItem.type = 'button';
    inboxItem.innerHTML = `
        <span class="dropdown-item-left">
            <span class="dropdown-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
            </span>
            <span>Входящие</span>
        </span>
        ${isInboxSelected ? '<span class="dropdown-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
    `;
    inboxItem.addEventListener('click', (e) => {
        e.stopPropagation();
        setAddTaskProject(null);
        addTaskProjectDropdown.style.display = 'none';
    });
    addTaskProjectDropdown.appendChild(inboxItem);

    // 2. Пользовательские проекты
    projectsList.forEach(project => {
        const isSelected = addTaskSelectedProjectId === project.id;
        const projectItem = document.createElement('button');
        projectItem.className = 'dropdown-item';
        projectItem.type = 'button';

        const iconHtml = project.iconUrl ?
            `<img src="${project.iconUrl}">` :
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>`;

        projectItem.innerHTML = `
            <span class="dropdown-item-left">
                <span class="dropdown-item-icon">
                    ${iconHtml}
                </span>
                <span>${escapeHtml(project.name)}</span>
            </span>
            ${isSelected ? '<span class="dropdown-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
        `;
        projectItem.addEventListener('click', (e) => {
            e.stopPropagation();
            setAddTaskProject(project.id);
            addTaskProjectDropdown.style.display = 'none';
        });
        addTaskProjectDropdown.appendChild(projectItem);
    });
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
function setDueDate(dateStr, timeStr = undefined, repeatStr = undefined) {
    selectedDueDate = dateStr;
    if (timeStr !== undefined) selectedDueTime = timeStr;
    if (repeatStr !== undefined) selectedDueRepeat = repeatStr;

    if (!selectedDueDate) {
        selectedDueTime = null;
        selectedDueRepeat = null;
        if (dueDateBtnText) dueDateBtnText.textContent = 'Срок';
        if (btnClearDueDate) btnClearDueDate.style.display = 'none';
        if (btnDueDate) btnDueDate.classList.remove('active');
    } else {
        const label = formatDueDateDisplay(selectedDueDate, selectedDueTime, selectedDueRepeat);
        if (dueDateBtnText) dueDateBtnText.textContent = label;
        if (btnClearDueDate) btnClearDueDate.style.display = 'inline-flex';
        if (btnDueDate) btnDueDate.classList.add('active');
    }
}

// Форматирование даты для кнопки и карточек
function formatDueDateDisplay(dateStr, timeStr = null, repeatStr = null) {
    if (!dateStr) return 'Срок';

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    let label = '';
    if (dateStr === todayStr) {
        label = 'Сегодня';
    } else if (dateStr === tomorrowStr) {
        label = 'Завтра';
    } else if (dateStr === yesterdayStr) {
        label = 'Вчера';
    } else {
        const [year, month, day] = dateStr.split('-');
        const monthsRuShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        label = `${parseInt(day, 10)} ${monthsRuShort[parseInt(month, 10) - 1]}`;
        const currentYear = new Date().getFullYear();
        if (parseInt(year, 10) !== currentYear) {
            label += ` ${year}`;
        }
    }

    if (timeStr) {
        label += ` в ${timeStr}`;
    }

    if (repeatStr) {
        const labelRepeat = getRepeatLabel(repeatStr, dateStr);
        if (labelRepeat) {
            label += ` (${labelRepeat})`;
        }
    }

    return label;
}

function getDayOfWeekPhrase(dayIndex) {
    switch(dayIndex) {
        case 0: return 'в воскресенье';
        case 1: return 'в понедельник';
        case 2: return 'во вторник';
        case 3: return 'в среду';
        case 4: return 'в четверг';
        case 5: return 'в пятницу';
        case 6: return 'в субботу';
        default: return '';
    }
}

function getRepeatOptions(dateStr) {
    let dayOfWeekName = 'четверг';
    let dayNum = '11-го';
    let dayAndMonth = '11-го июня';
    
    if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        
        const daysRu = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
        dayOfWeekName = daysRu[dateObj.getDay()];
        
        dayNum = `${day}-го`;
        
        const monthsRuGenitive = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ];
        dayAndMonth = `${day}-го ${monthsRuGenitive[month - 1]}`;
    } else {
        const today = new Date();
        const daysRu = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
        dayOfWeekName = daysRu[today.getDay()];
        dayNum = `${today.getDate()}-го`;
        const monthsRuGenitive = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ];
        dayAndMonth = `${today.getDate()}-го ${monthsRuGenitive[today.getMonth()]}`;
    }
    
    let weeklyText = '';
    if (dayOfWeekName === 'среда') {
        weeklyText = 'Каждую среду (еженедельно)';
    } else if (dayOfWeekName === 'пятница') {
        weeklyText = 'Каждую пятницу (еженедельно)';
    } else if (dayOfWeekName === 'суббота') {
        weeklyText = 'Каждую субботу (еженедельно)';
    } else if (dayOfWeekName === 'воскресенье') {
        weeklyText = 'Каждое воскресенье (еженедельно)';
    } else {
        weeklyText = `Каждый ${dayOfWeekName} (еженедельно)`;
    }
    
    return [
        { id: 'daily', text: 'Каждый день' },
        { id: 'weekday', text: 'Каждый будний день (Пн - Пт)' },
        { id: 'weekly', text: weeklyText },
        { id: 'monthly', text: `Каждое ${dayNum} числа (ежемесячно)` },
        { id: 'yearly', text: `Каждое ${dayAndMonth} (ежегодно)` }
    ];
}

function getRepeatLabel(repeatCode, dateStr) {
    if (!repeatCode) return '';
    let dayOfWeekName = 'четверг';
    let dayNum = '11-го';
    
    if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const daysRu = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
        dayOfWeekName = daysRu[dateObj.getDay()];
        dayNum = `${day}-го`;
    }
    
    switch(repeatCode) {
        case 'daily': return 'каждый день';
        case 'weekly': return 'еженедельно';
        case 'weekday': return 'будни';
        case 'monthly': return 'ежемесячно';
        case 'yearly': return 'ежегодно';
        case 'custom': return 'повтор';
        default: return '';
    }
}

function calculateNextDueDate(currentDateStr, repeatCode) {
    if (!currentDateStr) return null;
    const [year, month, day] = currentDateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    
    switch(repeatCode) {
        case 'daily':
            dateObj.setDate(dateObj.getDate() + 1);
            break;
        case 'weekly':
            dateObj.setDate(dateObj.getDate() + 7);
            break;
        case 'weekday':
            dateObj.setDate(dateObj.getDate() + 1);
            if (dateObj.getDay() === 6) { // Saturday -> Monday
                dateObj.setDate(dateObj.getDate() + 2);
            } else if (dateObj.getDay() === 0) { // Sunday -> Monday
                dateObj.setDate(dateObj.getDate() + 1);
            }
            break;
        case 'monthly':
            dateObj.setMonth(dateObj.getMonth() + 1);
            break;
        case 'yearly':
            dateObj.setFullYear(dateObj.getFullYear() + 1);
            break;
        default:
            return null;
    }
    
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
}

function setupNestedViews(dropdownEl, getSelectedDate, setSelectedDate, getSelectedTime, setSelectedTime, getSelectedRepeat, setSelectedRepeat, onDone) {
    const mainView = dropdownEl.querySelector('.due-main-view');
    const timeView = dropdownEl.querySelector('.due-time-view');
    const repeatView = dropdownEl.querySelector('.due-repeat-view');
    
    const btnTime = dropdownEl.querySelector('.btn-time');
    const btnRepeat = dropdownEl.querySelector('.btn-repeat');
    
    const timeBackBtn = dropdownEl.querySelector('.time-back-btn');
    const repeatBackBtn = dropdownEl.querySelector('.repeat-back-btn');
    
    const timeInput = dropdownEl.querySelector('.time-picker-input');
    const timeClearBtn = dropdownEl.querySelector('.time-clear-btn');
    const timePickerList = dropdownEl.querySelector('.time-picker-list');
    const repeatPickerList = dropdownEl.querySelector('.repeat-picker-list');
    
    const ensureDateSelected = () => {
        if (!getSelectedDate()) {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            setSelectedDate(todayStr);
        }
    };
    
    if (btnTime) {
        btnTime.addEventListener('click', (e) => {
            e.stopPropagation();
            mainView.style.display = 'none';
            timeView.style.display = 'flex';
            
            const currentVal = getSelectedTime() || '00:00';
            timeInput.value = currentVal;
            renderTimeList(currentVal);
            setTimeout(() => {
                timeInput.focus();
                timeInput.setSelectionRange(0, 5);
            }, 50);
        });
    }
    
    if (btnRepeat) {
        btnRepeat.addEventListener('click', (e) => {
            e.stopPropagation();
            mainView.style.display = 'none';
            repeatView.style.display = 'flex';
            
            renderRepeatList();
        });
    }
    
    if (timeBackBtn) {
        timeBackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            timeView.style.display = 'none';
            mainView.style.display = 'flex';
        });
    }
    
    if (repeatBackBtn) {
        repeatBackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            repeatView.style.display = 'none';
            mainView.style.display = 'flex';
        });
    }
    
    if (timeClearBtn) {
        timeClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            timeInput.value = '00:00';
            setSelectedTime(null);
            timeView.style.display = 'none';
            mainView.style.display = 'flex';
            onDone();
        });
    }
    
    const validateTimeStr = (str) => {
        const parts = str.split(':');
        if (parts.length !== 2) return false;
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        return (!isNaN(h) && h >= 0 && h < 24 && !isNaN(m) && m >= 0 && m < 60);
    };
    
    if (timeInput) {
        timeInput.addEventListener('keydown', (e) => {
            if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape'].includes(e.key)) {
                if (e.key === 'Backspace') {
                    e.preventDefault();
                    let start = timeInput.selectionStart;
                    let end = timeInput.selectionEnd;
                    let val = timeInput.value.split('');
                    
                    if (start === end) {
                        if (start > 0) {
                            let deletePos = start - 1;
                            if (deletePos === 2) deletePos = 1;
                            val[deletePos] = '0';
                            timeInput.value = val.join('');
                            timeInput.setSelectionRange(deletePos, deletePos);
                        }
                    } else {
                        for (let i = start; i < end; i++) {
                            if (i !== 2) val[i] = '0';
                        }
                        timeInput.value = val.join('');
                        timeInput.setSelectionRange(start, start);
                    }
                    const cur = timeInput.value;
                    if (validateTimeStr(cur)) {
                        renderTimeList(cur);
                    }
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = timeInput.value.trim();
                    if (validateTimeStr(val)) {
                        ensureDateSelected();
                        setSelectedTime(val);
                        timeView.style.display = 'none';
                        mainView.style.display = 'flex';
                        onDone();
                    }
                }
                return;
            }
            
            if (!/[0-9]/.test(e.key)) {
                e.preventDefault();
                return;
            }
            
            e.preventDefault();
            let start = timeInput.selectionStart;
            let end = timeInput.selectionEnd;
            let val = timeInput.value.split('');
            
            if (start === end) {
                if (start < 5) {
                    let pos = start;
                    if (pos === 2) pos = 3;
                    val[pos] = e.key;
                    timeInput.value = val.join('');
                    timeInput.setSelectionRange(pos + 1, pos + 1);
                }
            } else {
                let pos = start;
                if (pos === 2) pos = 3;
                val[pos] = e.key;
                for (let i = start + 1; i < end; i++) {
                    if (i !== 2) val[i] = '0';
                }
                timeInput.value = val.join('');
                timeInput.setSelectionRange(pos + 1, pos + 1);
            }
            
            const cur = timeInput.value;
            if (validateTimeStr(cur)) {
                renderTimeList(cur);
            }
        });
        
        timeInput.addEventListener('blur', () => {
            const val = timeInput.value.trim();
            if (validateTimeStr(val)) {
                setSelectedTime(val);
            } else {
                timeInput.value = getSelectedTime() || '00:00';
            }
        });
    }
    
    function renderTimeList(selectedVal) {
        if (!timePickerList) return;
        timePickerList.innerHTML = '';
        
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const isSelected = selectedVal === timeStr;
                
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `time-select-item ${isSelected ? 'selected' : ''}`;
                item.innerHTML = `
                    <span>${timeStr}</span>
                    ${isSelected ? '<span class="time-select-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
                `;
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ensureDateSelected();
                    setSelectedTime(timeStr);
                    timeView.style.display = 'none';
                    mainView.style.display = 'flex';
                    onDone();
                });
                
                timePickerList.appendChild(item);
            }
        }
    }
    
    function renderRepeatList() {
        if (!repeatPickerList) return;
        repeatPickerList.innerHTML = '';
        
        const options = getRepeatOptions(getSelectedDate());
        const selectedVal = getSelectedRepeat();
        
        options.forEach(opt => {
            const isSelected = selectedVal === opt.id;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `repeat-select-item ${isSelected ? 'selected' : ''}`;
            item.innerHTML = `
                <span>${opt.text}</span>
                ${isSelected ? '<span class="repeat-select-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
            `;
            
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                ensureDateSelected();
                setSelectedRepeat(opt.id);
                repeatView.style.display = 'none';
                mainView.style.display = 'flex';
                onDone();
            });
            
            repeatPickerList.appendChild(item);
        });
    }
}

// Проверка просроченности даты
function isDateOverdue(dueDateStr) {
    if (!dueDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = dueDateStr.split('-');
    const dueDate = new Date(year, month - 1, day);
    return dueDate < today;
}

// Проверка, является ли дата сегодняшней
function isDateToday(dueDateStr) {
    if (!dueDateStr) return false;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dueDateStr === todayStr;
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

// Клик на имя/аватар пользователя для открытия простого меню
const sidebarUser = document.querySelector('.sidebar-user');
const sidebarHeader = document.querySelector('.sidebar-header');
if (sidebarHeader && !document.getElementById('userProfileMenu')) {
    const userMenuHtml = `
        <div class="user-profile-menu" id="userProfileMenu" style="display: none;">
            <button class="user-menu-item" id="btnUserMenuSettings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>Настройки</span>
            </button>
            <button class="user-menu-item item-danger" id="btnUserMenuLogout">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span>Выйти</span>
            </button>
        </div>
    `;
    sidebarHeader.insertAdjacentHTML('beforeend', userMenuHtml);
}

const userProfileMenu = document.getElementById('userProfileMenu');
const btnUserMenuSettings = document.getElementById('btnUserMenuSettings');
const btnUserMenuLogout = document.getElementById('btnUserMenuLogout');

if (sidebarUser && userProfileMenu) {
    sidebarUser.style.cursor = 'pointer';
    sidebarUser.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentUid) {
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal(sidebarUser);
            }
            return;
        }
        if (userProfileMenu.style.display === 'none' || userProfileMenu.style.display === '') {
            userProfileMenu.style.display = 'flex';
        } else {
            userProfileMenu.style.display = 'none';
        }
    });

    if (btnUserMenuSettings) {
        btnUserMenuSettings.addEventListener('click', (e) => {
            e.stopPropagation();
            userProfileMenu.style.display = 'none';
            openSettingsModal();
        });
    }

    if (btnUserMenuLogout) {
        btnUserMenuLogout.addEventListener('click', (e) => {
            e.stopPropagation();
            userProfileMenu.style.display = 'none';
            if (window.firebaseAuth) {
                window.firebaseAuth.signOut();
                localStorage.removeItem('google_access_token');
            }
        });
    }
}

// === ЛОГИКА ОКНА НАСТРОЕК ===
const settingsModal = document.getElementById('settingsModal');
const btnSettingsClose = document.getElementById('btnSettingsClose');
const settingsProfileAvatar = document.getElementById('settingsProfileAvatar');
const settingsProfileName = document.getElementById('settingsProfileName');
const settingsEmailText = document.getElementById('settingsEmailText');
const btnSettingsChangePassword = document.getElementById('btnSettingsChangePassword');

// Всплывающее уведомление о выполнении задачи (Toast)
let lastCompletedTaskId = null;
let lastCreatedRepeatingTaskId = null;
let toastTimeout = null;

function showCompletionToast(taskId, createdNewTaskId = null, nextDateFormatted = null) {
    lastCompletedTaskId = taskId;
    lastCreatedRepeatingTaskId = createdNewTaskId;
    const toast = document.getElementById('taskCompletionToast');
    if (!toast) return;

    const subtextEl = document.getElementById('toastSubtext');
    if (subtextEl) {
        if (nextDateFormatted) {
            subtextEl.textContent = `Следующий раз: ${nextDateFormatted}`;
            subtextEl.style.display = 'block';
        } else {
            subtextEl.style.display = 'none';
        }
    }

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toast.style.display = 'flex';
    // Принудительный reflow для плавной анимации
    toast.offsetHeight;
    toast.classList.add('show');

    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (!toast.classList.contains('show')) {
                toast.style.display = 'none';
            }
        }, 350);
    }, 5000);
}

// Кнопка отмены выполнения в уведомлении (Undo)
const btnToastUndo = document.getElementById('btnToastUndo');
if (btnToastUndo) {
    btnToastUndo.addEventListener('click', async () => {
        if (lastCompletedTaskId && currentUid) {
            try {
                // Восстанавливаем оригинальную задачу и удаляем следующий повтор параллельно
                const promises = [
                    updateDoc(doc(db, 'users', currentUid, 'tasks', lastCompletedTaskId), {
                        completed: false,
                        deleted: false,
                        deletedAt: null
                    })
                ];

                if (lastCreatedRepeatingTaskId) {
                    promises.push(deleteDoc(doc(db, 'users', currentUid, 'tasks', lastCreatedRepeatingTaskId)));
                    lastCreatedRepeatingTaskId = null;
                }

                await Promise.all(promises);

                const toast = document.getElementById('taskCompletionToast');
                if (toast) {
                    toast.classList.remove('show');
                    setTimeout(() => {
                        if (!toast.classList.contains('show')) {
                            toast.style.display = 'none';
                        }
                    }, 350);
                }
            } catch (err) {
                console.error("Ошибка при отмене выполнения задачи:", err);
            }
        }
    });
}

function openSettingsModal() {
    if (!settingsModal) return;
    settingsModal.style.display = 'flex';

    // Подставляем реальные данные текущего пользователя
    if (window.currentUser) {
        if (settingsProfileName) settingsProfileName.textContent = window.currentUser.displayName || 'Пользователь';
        if (settingsEmailText) settingsEmailText.textContent = window.currentUser.email || '—';
        if (settingsProfileAvatar) {
            settingsProfileAvatar.src = window.currentUser.photoURL || 'https://i.ibb.co/Z6vRKK9x/0000000.jpg';
        }
    }

    // Подставляем значение настройки удаления выполненных задач
    const deleteCompletedPref = localStorage.getItem('todo_pref_delete_completed') === 'true';
    const deleteCompletedCheckbox = document.getElementById('prefDeleteCompleted');
    if (deleteCompletedCheckbox) {
        deleteCompletedCheckbox.checked = deleteCompletedPref;
    }

    // Подставляем значение настройки добавления новых задач
    const addTaskPositionPref = localStorage.getItem('todo_pref_add_task_position') || 'top';
    const addTaskPositionSelect = document.getElementById('prefAddTaskPosition');
    if (addTaskPositionSelect) {
        addTaskPositionSelect.value = addTaskPositionPref;
    }

    // Подсвечиваем сохраненную карточку настройки счетчиков
    const currentCountersPref = localStorage.getItem('todo_show_sidebar_counters') || 'show';
    const cardShow = document.getElementById('pref-counters-show');
    const cardHide = document.getElementById('pref-counters-hide');
    if (cardShow && cardHide) {
        cardShow.classList.remove('selected');
        cardHide.classList.remove('selected');
        if (currentCountersPref === 'hide') {
            cardHide.classList.add('selected');
        } else {
            cardShow.classList.add('selected');
        }
    }
}

function closeSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }
}

if (btnSettingsClose) {
    btnSettingsClose.addEventListener('click', closeSettingsModal);
}

if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });
}

// Добавим обработку клавиши Escape для закрытия настроек
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeSettingsModal();
    }
});

// Клик по заглушке изменения пароля
if (btnSettingsChangePassword) {
    btnSettingsChangePassword.addEventListener('click', () => {
        alert("Функция изменения пароля находится в разработке.");
    });
}

// Переключение вкладок в настройках
const settingsMenuItems = document.querySelectorAll('.settings-menu-item');
settingsMenuItems.forEach(item => {
    item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (!tab) return;

        settingsMenuItems.forEach(btn => btn.classList.remove('active'));
        item.classList.add('active');

        const tabPanes = document.querySelectorAll('.settings-tab-pane');
        tabPanes.forEach(pane => {
            pane.style.display = 'none';
            pane.classList.remove('active');
        });

        const targetPane = document.getElementById(`tab-${tab}`);
        if (targetPane) {
            targetPane.style.display = 'block';
            targetPane.classList.add('active');
        }
    });
});

// Управление настройкой отображения счетчиков
const prefCountersShow = document.getElementById('pref-counters-show');
const prefCountersHide = document.getElementById('pref-counters-hide');

function updateCountersPreference(value) {
    localStorage.setItem('todo_show_sidebar_counters', value);
    if (prefCountersShow && prefCountersHide) {
        prefCountersShow.classList.remove('selected');
        prefCountersHide.classList.remove('selected');
        if (value === 'hide') {
            prefCountersHide.classList.add('selected');
        } else {
            prefCountersShow.classList.add('selected');
        }
    }
    // Перерендериваем списки, чтобы скрыть/показать счетчики
    if (typeof renderTasks === 'function') renderTasks();
    if (typeof renderProjects === 'function') renderProjects();
}

if (prefCountersShow) {
    prefCountersShow.addEventListener('click', () => updateCountersPreference('show'));
}
if (prefCountersHide) {
    prefCountersHide.addEventListener('click', () => updateCountersPreference('hide'));
}

const prefDeleteCompleted = document.getElementById('prefDeleteCompleted');
if (prefDeleteCompleted) {
    prefDeleteCompleted.addEventListener('change', (e) => {
        localStorage.setItem('todo_pref_delete_completed', e.target.checked ? 'true' : 'false');
    });
}

const prefAddTaskPosition = document.getElementById('prefAddTaskPosition');
if (prefAddTaskPosition) {
    prefAddTaskPosition.addEventListener('change', (e) => {
        localStorage.setItem('todo_pref_add_task_position', e.target.value);
    });
}


// Сайдбар: восстановление свернутого состояния на ПК
const todoContentEl = document.querySelector('.todo-content');
let isSidebarCollapsed = localStorage.getItem('todo_sidebar_collapsed') === 'true';

const applySidebarCollapsedState = () => {
    if (window.innerWidth > 768) {
        if (isSidebarCollapsed) {
            todoSidebar.classList.add('collapsed');
            if (todoContentEl) todoContentEl.classList.add('sidebar-collapsed');
        } else {
            todoSidebar.classList.remove('collapsed');
            if (todoContentEl) todoContentEl.classList.remove('sidebar-collapsed');
        }
        todoSidebar.classList.remove('mobile-open');
        sidebarOverlay.classList.remove('active');
    } else {
        todoSidebar.classList.remove('collapsed');
        if (todoContentEl) todoContentEl.classList.remove('sidebar-collapsed');
    }
};

applySidebarCollapsedState();
window.addEventListener('resize', () => {
    applySidebarCollapsedState();
    updateBackButtonVisibility();
});

// Управление сайдбаром (мобильное и десктопное)
let toggleSidebar;
if (contentSidebarToggle && todoSidebar && sidebarOverlay) {
    toggleSidebar = () => {
        if (window.innerWidth <= 768) {
            todoSidebar.classList.toggle('mobile-open');
            sidebarOverlay.classList.toggle('active');
            if (typeof updateMobileBottomNavActiveState === 'function') {
                updateMobileBottomNavActiveState();
            }
            if (typeof updateMobileFabVisibility === 'function') {
                updateMobileFabVisibility();
            }
        } else {
            isSidebarCollapsed = !isSidebarCollapsed;
            localStorage.setItem('todo_sidebar_collapsed', isSidebarCollapsed);
            applySidebarCollapsedState();
        }
    };

    contentSidebarToggle.addEventListener('click', toggleSidebar);
    if (sidebarCloseToggle) {
        sidebarCloseToggle.addEventListener('click', toggleSidebar);
    }
    sidebarOverlay.addEventListener('click', toggleSidebar);

    // Добавляем обработчик для мобильной кнопки "Обзор"
    const mobileNavMore = document.getElementById('mobileNavMore');
    if (mobileNavMore) {
        mobileNavMore.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleSidebar();
        });
    }

    // Добавляем обработчик для кнопки "Назад" у проектов и корзины
    const contentBackBtn = document.getElementById('contentBackBtn');
    if (contentBackBtn) {
        contentBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (todoSidebar && !todoSidebar.classList.contains('mobile-open')) {
                toggleSidebar();
            }
        });
    }
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
        if (completedClearBtn) completedClearBtn.style.display = 'none';
    } else {
        completedToggle.classList.remove('collapsed');
        completedTasksContainer.classList.remove('collapsed');
        if (completedClearBtn) completedClearBtn.style.display = 'block';
    }
}

// Обработчик очистки выполненных задач
if (completedClearBtn) {
    completedClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentDisplayCompletedTasks.length === 0) return;

        showCustomConfirm(
            "Очистить выполненные?",
            `Вы действительно хотите переместить все выполненные задачи (${currentDisplayCompletedTasks.length}) в корзину?`,
            "Очистить",
            async () => {
                try {
                    const batch = writeBatch(db);
                    currentDisplayCompletedTasks.forEach(t => {
                        batch.update(doc(db, 'users', currentUid, 'tasks', t.id), {
                            deleted: true,
                            deletedAt: serverTimestamp()
                        });
                    });
                    await batch.commit();
                } catch (err) {
                    console.error("Ошибка при очистке выполненных задач:", err);
                }
            }
        );
    });
}

// Функция роутинга (обработки URL хэшей)
function updateBrowserTitle() {
    let title = 'Все задачи';
    if (currentRoute === 'inbox') {
        title = 'Входящие';
    } else if (currentRoute === 'today') {
        title = 'Сегодня';
    } else if (currentRoute === 'tomorrow') {
        title = 'Завтра';
    } else if (currentRoute === 'trash') {
        title = 'Корзина';
    } else if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        const proj = projectsList.find(p => p.id === projectId);
        title = proj ? proj.name : 'Проект';
    }
    document.title = title;
}

// Функция роутинга (обработки URL хэшей)
function handleRoute() {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'today') {
        currentRoute = 'today';
    } else if (hash === 'tomorrow') {
        currentRoute = 'tomorrow';
    } else if (hash === 'trash') {
        currentRoute = 'trash';
    } else if (hash.startsWith('project/')) {
        const projectId = hash.split('/')[1];
        if (!projectId) {
            currentRoute = 'inbox';
            history.replaceState(null, null, '#inbox');
        } else {
            currentRoute = hash;
        }
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
    const menuTomorrow = document.getElementById('menuTomorrow');
    const menuTrash = document.getElementById('menuTrash');

    if (menuInbox) {
        if (currentRoute === 'inbox') menuInbox.classList.add('active');
        else menuInbox.classList.remove('active');
    }
    if (menuToday) {
        if (currentRoute === 'today') menuToday.classList.add('active');
        else menuToday.classList.remove('active');
    }
    if (menuTomorrow) {
        if (currentRoute === 'tomorrow') menuTomorrow.classList.add('active');
        else menuTomorrow.classList.remove('active');
    }
    if (menuTrash) {
        if (currentRoute === 'trash') menuTrash.classList.add('active');
        else menuTrash.classList.remove('active');
    }

    // Обновляем подсветку для проектов
    renderProjects();

    const titleEl = document.querySelector('.list-title');

    if (currentRoute === 'today') {
        if (titleEl) titleEl.textContent = 'Сегодня';
    } else if (currentRoute === 'tomorrow') {
        if (titleEl) titleEl.textContent = 'Завтра';
    } else if (currentRoute === 'trash') {
        if (titleEl) titleEl.textContent = 'Корзина';
    } else if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        const proj = projectsList.find(p => p.id === projectId);
        if (titleEl) titleEl.textContent = proj ? proj.name : 'Проект';
    } else {
        if (titleEl) titleEl.textContent = 'Входящие';
    }

    updateBrowserTitle();

    // Закрываем боковое меню на мобильных после клика
    if (todoSidebar && todoSidebar.classList.contains('mobile-open')) {
        todoSidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        setAddTaskProject(projectId);
    } else {
        setAddTaskProject(null);
    }

    setDueDate(getDefaultDueDate());
    setPriority(0); // сброс приоритета при смене вкладки
    updateMobileBottomNavActiveState();
    updateBackButtonVisibility();
    if (typeof updateMobileFabVisibility === 'function') {
        updateMobileFabVisibility();
    }
    renderTasks();
}

function updateBackButtonVisibility() {
    const contentBackBtn = document.getElementById('contentBackBtn');
    if (!contentBackBtn) return;
    if (window.innerWidth <= 768 && (currentRoute === 'trash' || currentRoute === 'tomorrow' || currentRoute.startsWith('project/'))) {
        contentBackBtn.style.display = 'inline-flex';
    } else {
        contentBackBtn.style.display = 'none';
    }
}

function updateMobileBottomNavActiveState() {
    const mobileNavToday = document.getElementById('mobileNavToday');
    const mobileNavInbox = document.getElementById('mobileNavInbox');
    const mobileNavMore = document.getElementById('mobileNavMore');

    if (!mobileNavToday || !mobileNavInbox || !mobileNavMore) return;

    mobileNavToday.classList.remove('active');
    mobileNavInbox.classList.remove('active');
    mobileNavMore.classList.remove('active');

    if (todoSidebar && todoSidebar.classList.contains('mobile-open')) {
        mobileNavMore.classList.add('active');
    } else if (currentRoute === 'today') {
        mobileNavToday.classList.add('active');
    } else if (currentRoute === 'inbox') {
        mobileNavInbox.classList.add('active');
    } else {
        mobileNavMore.classList.add('active');
    }
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
        startProjectsForUser(currentUid);
        startSectionsForUser(currentUid);
        handleRoute();
    } else {
        // Скрываем интерфейс
        if (todoMainLayout) todoMainLayout.style.setProperty('display', 'none', 'important');
        if (authRequiredState) authRequiredState.style.display = 'block';
        if (sidebarName) sidebarName.textContent = "Войти";
        if (sidebarAvatar) sidebarAvatar.style.display = 'none';

        stopTodoForUser();
        stopProjectsForUser();
        stopSectionsForUser();
    }
});

// Загрузка данных пользователя
function startTodoForUser(uid) {
    if (unsubscribeTasks) unsubscribeTasks();

    const q = query(collection(db, 'users', uid, 'tasks'), orderBy('createdAt', 'desc'));

    unsubscribeTasks = onSnapshot(q, (snapshot) => {
        allTasks = [];
        const now = Date.now();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // Автоматическое удаление навсегда через 30 дней
            if (data.deleted === true && data.deletedAt) {
                try {
                    const delTime = data.deletedAt.toDate().getTime();
                    if (now - delTime > THIRTY_DAYS_MS) {
                        deleteDoc(doc(db, 'users', uid, 'tasks', docSnap.id));
                        return; // Пропускаем добавление в локальный список
                    }
                } catch (e) {
                    console.error("Ошибка автоудаления из корзины:", e);
                }
            }

            allTasks.push({
                id: docSnap.id,
                ...data
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
async function handleAddTask() {
    const titleText = taskTitleInput.value.trim();
    if (!titleText || titleText.length > 500 || !currentUid) return;

    // Сохраняем значения для БД перед сбросом
    const dueDateForDb = selectedDueDate;
    const dueTimeForDb = selectedDueTime || null;
    const dueRepeatForDb = selectedDueRepeat || null;
    const projectIdForDb = addTaskSelectedProjectId;
    const priorityForDb = selectedPriority || 0;

    btnAddTask.disabled = true;

    // Вычисляем order, чтобы новая задача вставала в начало или конец списка
    const addTaskPositionPref = localStorage.getItem('todo_pref_add_task_position') || 'top';
    let newOrder = 0;
    if (addTaskPositionPref === 'bottom') {
        let maxOrder = 0;
        allTasks.forEach(t => {
            if (!t.completed && !t.deleted) {
                const isSameProject = (projectIdForDb && t.projectId === projectIdForDb) || (!projectIdForDb && !t.projectId);
                if (isSameProject && t.order !== undefined) {
                    if (t.order > maxOrder) {
                        maxOrder = t.order;
                    }
                }
            }
        });
        newOrder = maxOrder + 1;
    } else {
        let minOrder = 0;
        allTasks.forEach(t => {
            if (!t.completed && !t.deleted) {
                const isSameProject = (projectIdForDb && t.projectId === projectIdForDb) || (!projectIdForDb && !t.projectId);
                if (isSameProject && t.order !== undefined) {
                    if (t.order < minOrder) {
                        minOrder = t.order;
                    }
                }
            }
        });
        newOrder = minOrder - 1;
    }

    try {
        await addDoc(collection(db, 'users', currentUid, 'tasks'), {
            title: titleText,
            completed: false,
            dueDate: dueDateForDb,
            dueTime: dueTimeForDb,
            dueRepeat: dueRepeatForDb,
            projectId: projectIdForDb,
            priority: priorityForDb,
            order: newOrder,
            createdAt: serverTimestamp()
        });

        taskTitleInput.value = '';
        selectedDueTime = null;
        selectedDueRepeat = null;
        setDueDate(getDefaultDueDate());
        setPriority(0);
        
        if (currentRoute.startsWith('project/')) {
            const projectId = currentRoute.split('/')[1];
            setAddTaskProject(projectId);
        } else {
            setAddTaskProject(null);
        }

        taskTitleInput.style.height = 'auto';
        updateAddFormCharCount();
    } catch (err) {
        console.error("Не удалось добавить задачу:", err);
    } finally {
        btnAddTask.disabled = false;
    }
}
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
            const form = document.querySelector('.add-task-form');
            taskTitleInput.value = '';
            taskTitleInput.blur();
            if (form) {
                form.classList.remove('expanded');
            }
            taskTitleInput.placeholder = '+ Добавить задачу';
            setDueDate(getDefaultDueDate());
            setPriority(0);
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

// Удаление задачи (перемещение в Корзину)
async function deleteTask(taskId) {
    if (!currentUid || !taskId) return;
    try {
        const promises = [];
        promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
            deleted: true,
            deletedAt: serverTimestamp()
        }));

        // Каскадное перемещение подзадач в Корзину
        const subtasks = allTasks.filter(t => t.parentId === taskId && !t.deleted);
        subtasks.forEach(sub => {
            promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', sub.id), {
                deleted: true,
                deletedAt: serverTimestamp()
            }));
        });

        await Promise.all(promises);
    } catch (err) {
        console.error("Ошибка перемещения задачи в корзину:", err);
    }
}

// Дублирование задачи (копирование со всеми свойствами и подзадачами)
async function duplicateTask(task) {
    if (!currentUid || !task) return;
    try {
        const dupTask = {
            title: task.title,
            completed: false,
            dueDate: task.dueDate || null,
            dueTime: task.dueTime || null,
            dueRepeat: task.dueRepeat || null,
            projectId: task.projectId || null,
            priority: task.priority || 0,
            order: (task.order || 0) + 0.001,
            createdAt: serverTimestamp()
        };
        if (task.parentId) {
            dupTask.parentId = task.parentId;
        }

        const docRef = await addDoc(collection(db, 'users', currentUid, 'tasks'), dupTask);
        const newTaskId = docRef.id;

        // Дублируем подзадачи (только для родительских задач)
        if (!task.parentId) {
            const subtasks = allTasks.filter(t => t.parentId === task.id && !t.deleted);
            for (const sub of subtasks) {
                await addDoc(collection(db, 'users', currentUid, 'tasks'), {
                    title: sub.title,
                    completed: false,
                    dueDate: sub.dueDate || null,
                    dueTime: sub.dueTime || null,
                    dueRepeat: sub.dueRepeat || null,
                    projectId: sub.projectId || null,
                    priority: sub.priority || 0,
                    order: sub.order || 0,
                    parentId: newTaskId,
                    createdAt: serverTimestamp()
                });
            }
        }
    } catch (err) {
        console.error("Ошибка дублирования задачи:", err);
    }
}

// Восстановление задачи из Корзины
async function restoreTask(taskId) {
    if (!currentUid || !taskId) return;
    try {
        const promises = [];
        promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
            deleted: false,
            deletedAt: null
        }));

        // Каскадное восстановление подзадач
        const subtasks = allTasks.filter(t => t.parentId === taskId && t.deleted);
        subtasks.forEach(sub => {
            promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', sub.id), {
                deleted: false,
                deletedAt: null
            }));
        });

        await Promise.all(promises);
    } catch (err) {
        console.error("Ошибка восстановления задачи:", err);
    }
}

// Удаление задачи навсегда
async function deleteTaskPermanently(taskId) {
    if (!currentUid || !taskId) return;
    try {
        const promises = [];
        promises.push(deleteDoc(doc(db, 'users', currentUid, 'tasks', taskId)));

        // Каскадное удаление подзадач навсегда
        const subtasks = allTasks.filter(t => t.parentId === taskId);
        subtasks.forEach(sub => {
            promises.push(deleteDoc(doc(db, 'users', currentUid, 'tasks', sub.id)));
        });

        await Promise.all(promises);
    } catch (err) {
        console.error("Ошибка удаления задачи навсегда:", err);
    }
}

// Очистить корзину полностью
function emptyTrash() {
    if (!currentUid) return;
    showCustomConfirm(
        "Очистить корзину?",
        "Все задачи в корзине будут удалены безвозвратно. Это действие нельзя отменить.",
        "Очистить",
        async () => {
            const deletedTasks = allTasks.filter(t => t.deleted);
            if (deletedTasks.length === 0) return;
            try {
                const batch = writeBatch(db);
                deletedTasks.forEach(task => {
                    batch.delete(doc(db, 'users', currentUid, 'tasks', task.id));
                });
                await batch.commit();
            } catch (err) {
                console.error("Ошибка при очистке корзины:", err);
            }
        }
    );
}

let customConfirmCallback = null;

// Универсальная логика модального окна подтверждения
function showCustomConfirm(title, desc, actionText, onConfirm) {
    const modal = document.getElementById('confirmDeleteModal');
    const titleEl = modal.querySelector('.confirm-modal-title');
    const descEl = modal.querySelector('.confirm-modal-desc');
    const btnConfirm = document.getElementById('btnConfirmDeleteCoform');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.innerHTML = desc;
    if (btnConfirm) btnConfirm.textContent = actionText;

    customConfirmCallback = onConfirm;
    if (modal) modal.style.display = 'flex';
}

function hideCustomConfirm() {
    customConfirmCallback = null;
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) modal.style.display = 'none';
}

if (btnConfirmDeleteCancel) {
    btnConfirmDeleteCancel.addEventListener('click', hideCustomConfirm);
}

if (btnConfirmDeleteCoform) {
    btnConfirmDeleteCoform.addEventListener('click', () => {
        if (customConfirmCallback) {
            customConfirmCallback();
        }
        hideCustomConfirm();
    });
}

if (confirmDeleteModal) {
    confirmDeleteModal.addEventListener('click', (e) => {
        if (e.target === confirmDeleteModal) {
            hideCustomConfirm();
        }
    });
}

const pendingCompletions = new Set();

// Переключение выполнения задачи
async function toggleTaskCompleted(taskId, currentStatus) {
    if (!currentUid || !taskId) return;
    if (pendingCompletions.has(taskId)) return;
    
    pendingCompletions.add(taskId);
    try {
        const task = allTasks.find(t => t.id === taskId);
        const promises = [];

        const todayStr = getLocalDateString(new Date());

        // 1. Подготавливаем обновление текущей задачи
        const deleteCompletedPref = localStorage.getItem('todo_pref_delete_completed') === 'true';
        let updatePromise;
        if (!currentStatus && deleteCompletedPref) {
            updatePromise = updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
                deleted: true,
                deletedAt: serverTimestamp(),
                completed: true,
                completedDate: todayStr
            });
        } else {
            updatePromise = updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
                completed: !currentStatus,
                completedDate: !currentStatus ? todayStr : null
            });
        }
        promises.push(updatePromise);

        // 1.1. Каскадное выполнение подзадач при завершении родительской задачи
        if (!currentStatus) {
            const subtasksToUpdate = allTasks.filter(t => t.parentId === taskId && !t.deleted && !t.completed);
            subtasksToUpdate.forEach(subtask => {
                let subPromise;
                if (deleteCompletedPref) {
                    subPromise = updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                        deleted: true,
                        deletedAt: serverTimestamp(),
                        completed: true,
                        completedDate: todayStr
                    });
                } else {
                    subPromise = updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                        completed: true,
                        completedDate: todayStr
                    });
                }
                promises.push(subPromise);
            });
        }

        // 2. Подготавливаем создание следующей повторяющейся задачи
        let addPromise = null;
        let nextDateFormatted = null;
        if (!currentStatus && task && task.dueRepeat && task.dueDate) {
            const nextDateStr = calculateNextDueDate(task.dueDate, task.dueRepeat);
            if (nextDateStr) {
                nextDateFormatted = formatDueDateDisplay(nextDateStr, task.dueTime || null, null);
                addPromise = addDoc(collection(db, 'users', currentUid, 'tasks'), {
                    title: task.title,
                    completed: false,
                    dueDate: nextDateStr,
                    dueTime: task.dueTime || null,
                    dueRepeat: task.dueRepeat,
                    projectId: task.projectId || null,
                    order: task.order !== undefined ? task.order : 0,
                    createdAt: task.createdAt || new Date()
                });
                promises.push(addPromise);
            }
        }

        // Выполняем операции параллельно
        const results = await Promise.all(promises);

        if (!currentStatus) {
            let createdNewTaskId = null;
            if (addPromise) {
                const addResult = results[promises.indexOf(addPromise)];
                if (addResult && addResult.id) {
                    createdNewTaskId = addResult.id;
                }
            }
            showCompletionToast(taskId, createdNewTaskId, nextDateFormatted);
        }
    } catch (err) {
        console.error("Ошибка обновления задачи:", err);
    } finally {
        pendingCompletions.delete(taskId);
    }
}

function createDropdownHtml() {
    return `
        <div class="due-date-dropdown" style="display: none;">
            <div class="due-main-view" style="display: flex; flex-direction: column; width: 100%;">
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

            <!-- Выбор времени -->
            <div class="due-time-view" style="display: none; flex-direction: column; gap: 10px; width: 100%;">
                <div class="time-view-header" style="display: flex; align-items: center; gap: 8px;">
                    <button class="time-back-btn" type="button" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 8px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                    <div class="time-input-container" style="display: flex; align-items: center; background: var(--hover-bg); border: 1px solid var(--border); border-radius: 10px; padding: 4px 8px; flex: 1; gap: 6px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#4285f4" stroke-width="2.5" width="14" height="14" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <input type="text" class="time-picker-input" value="00:00" placeholder="00:00" style="background: transparent; border: none; outline: none; color: var(--text); font-family: inherit; font-size: 14px; width: 100%; font-weight: 600; padding: 0;">
                        <button class="time-clear-btn" type="button" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; font-size: 16px; padding: 0 2px; line-height: 1;">&times;</button>
                    </div>
                </div>
                <div class="time-picker-list" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;">
                    <!-- Будет заполнено динамически -->
                </div>
            </div>

            <!-- Выбор повтора -->
            <div class="due-repeat-view" style="display: none; flex-direction: column; gap: 10px; width: 100%;">
                <div class="repeat-view-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <button class="repeat-back-btn" type="button" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 8px;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                    <span style="font-weight: 700; font-size: 0.95rem; color: var(--text);">Повторять задачу</span>
                </div>
                <div class="repeat-picker-list" style="display: flex; flex-direction: column; gap: 2px;">
                    <!-- Будет заполнено динамически -->
                </div>
            </div>
        </div>
    `;
}

function initCalendarForWrapper(wrapperEl, activeDate, activeTime, activeRepeat, onSelect) {
    let localSelectedDate = activeDate;
    let localSelectedTime = activeTime;
    let localSelectedRepeat = activeRepeat;
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

    // setup nested time / repeat views
    setupNestedViews(
        dropdown,
        () => localSelectedDate,
        (dateStr) => {
            localSelectedDate = dateStr;
        },
        () => localSelectedTime,
        (timeStr) => {
            localSelectedTime = timeStr;
        },
        () => localSelectedRepeat,
        (repeatStr) => {
            localSelectedRepeat = repeatStr;
        },
        () => {
            updateDate(localSelectedDate);
        }
    );

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
        const mainView = dropdown.querySelector('.due-main-view');
        const timeView = dropdown.querySelector('.due-time-view');
        const repeatView = dropdown.querySelector('.due-repeat-view');
        if (mainView) mainView.style.display = 'flex';
        if (timeView) timeView.style.display = 'none';
        if (repeatView) repeatView.style.display = 'none';
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
            localSelectedTime = null;
            localSelectedRepeat = null;
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
        onSelect(localSelectedDate, localSelectedTime, localSelectedRepeat);

        if (!localSelectedDate) {
            textLabel.textContent = 'Срок';
            if (clearIcon) clearIcon.style.display = 'none';
            btn.classList.remove('active');
        } else {
            textLabel.textContent = formatDueDateDisplay(dateStr, localSelectedTime, localSelectedRepeat);
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
    let editSelectedDueTime = task.dueTime || null;
    let editSelectedDueRepeat = task.dueRepeat || null;
    let editSelectedProjectId = task.projectId || null;
    let editSelectedPriority = task.priority || 0;

    const editContainer = document.createElement('div');
    editContainer.className = 'edit-task-container';

    editContainer.innerHTML = `
        <textarea class="task-input edit-title-input" placeholder="Что бы вы хотели сделать?" rows="1" style="height: auto;"></textarea>
        <div class="char-limit-warning edit-char-limit">Лимит названия задачи: 0 / 500</div>
        <div class="form-actions" style="margin-top: 14px;">
            <div class="form-actions-left" style="display: flex; gap: 8px; align-items: center; justify-content: flex-start; flex-wrap: wrap;">
                <div class="due-date-wrapper">
                    <button class="btn-due-date ${editSelectedDueDate ? 'active' : ''}" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        <span class="due-date-text">${formatDueDateDisplay(editSelectedDueDate, editSelectedDueTime, editSelectedDueRepeat)}</span>
                        <span class="clear-due-icon" style="display: ${editSelectedDueDate ? 'inline-flex' : 'none'};" title="Очистить">&times;</span>
                    </button>
                </div>
                <div class="edit-task-project-wrapper add-task-project-wrapper" style="position: relative; display: inline-block;">
                    <button class="btn-due-date" type="button" style="font-weight: 700;">
                        <span class="project-icon" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; margin-right: 4px;">
                        </span>
                        <span class="project-text">Входящие</span>
                    </button>
                    <div class="due-date-dropdown project-dropdown" style="display: none; width: 220px; max-height: 300px; overflow-y: auto;">
                        <!-- Сюда будут рендериться проекты динамически -->
                    </div>
                </div>
                
                <div class="edit-task-priority-wrapper priority-wrapper" style="position: relative; display: inline-block;">
                    <button class="btn-due-date" type="button" style="font-weight: 700;">
                        <span class="priority-icon-wrapper" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; margin-right: 4px; color: #808080;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </span>
                        <span class="priority-text">Приоритет</span>
                    </button>
                    <div class="due-date-dropdown priority-dropdown" style="display: none; width: 170px; flex-direction: column; gap: 2px; padding: 4px;">
                        <button class="priority-opt-btn dropdown-item" type="button" data-priority="3">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #dc2626;">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                            </svg>
                            <span style="flex-grow: 1;">Приоритет 1</span>
                            <span class="priority-check" style="display: none; color: #dc2626; font-weight: bold;">✓</span>
                        </button>
                        <button class="priority-opt-btn dropdown-item" type="button" data-priority="2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #d97706;">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                            </svg>
                            <span style="flex-grow: 1;">Приоритет 2</span>
                            <span class="priority-check" style="display: none; color: #d97706; font-weight: bold;">✓</span>
                        </button>
                        <button class="priority-opt-btn dropdown-item" type="button" data-priority="1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #2563eb;">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                            </svg>
                            <span style="flex-grow: 1;">Приоритет 3</span>
                            <span class="priority-check" style="display: none; color: #2563eb; font-weight: bold;">✓</span>
                        </button>
                        <button class="priority-opt-btn dropdown-item" type="button" data-priority="0">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #808080;">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                            <span style="flex-grow: 1;">Приоритет 4</span>
                            <span class="priority-check" style="display: none; color: #dc2626; font-weight: bold;">✓</span>
                        </button>
                    </div>
                </div>
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

    // Инициализируем календарь с поддержкой времени и повтора
    initCalendarForWrapper(wrapper, editSelectedDueDate, editSelectedDueTime, editSelectedDueRepeat, (dateStr, timeStr, repeatStr) => {
        editSelectedDueDate = dateStr;
        editSelectedDueTime = timeStr;
        editSelectedDueRepeat = repeatStr;
    });

    // Инициализируем выбор проекта для редактирования
    const editProjectWrapper = editContainer.querySelector('.edit-task-project-wrapper');
    const editProjectBtn = editProjectWrapper.querySelector('.btn-due-date');
    const editProjectIcon = editProjectWrapper.querySelector('.project-icon');
    const editProjectText = editProjectWrapper.querySelector('.project-text');
    const editProjectDropdown = editProjectWrapper.querySelector('.project-dropdown');

    const updateEditProjectDisplay = (projId) => {
        if (!projId) {
            editProjectText.textContent = 'Входящие';
            editProjectIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                </svg>
            `;
        } else {
            const project = projectsList.find(p => p.id === projId);
            if (project) {
                editProjectText.textContent = project.name;
                if (project.iconUrl) {
                    editProjectIcon.innerHTML = `<img src="${project.iconUrl}" style="width: 14px; height: 14px; object-fit: contain; border-radius: 2px;">`;
                } else {
                    editProjectIcon.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;">
                            <line x1="4" y1="9" x2="20" y2="9"></line>
                            <line x1="4" y1="15" x2="20" y2="15"></line>
                            <line x1="10" y1="3" x2="8" y2="21"></line>
                            <line x1="16" y1="3" x2="14" y2="21"></line>
                        </svg>
                    `;
                }
            } else {
                editProjectText.textContent = 'Входящие';
                editProjectIcon.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: block;">
                        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                    </svg>
                `;
            }
        }
    };

    const renderEditProjectDropdown = () => {
        editProjectDropdown.innerHTML = '';

        // 1. Входящие (Inbox)
        const isInboxSelected = editSelectedProjectId === null;
        const inboxItem = document.createElement('button');
        inboxItem.className = 'dropdown-item';
        inboxItem.type = 'button';
        inboxItem.innerHTML = `
            <span class="dropdown-item-left">
                <span class="dropdown-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                </span>
                <span>Входящие</span>
            </span>
            ${isInboxSelected ? '<span class="dropdown-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
        `;
        inboxItem.addEventListener('click', (e) => {
            e.stopPropagation();
            editSelectedProjectId = null;
            updateEditProjectDisplay(null);
            editProjectDropdown.style.display = 'none';
        });
        editProjectDropdown.appendChild(inboxItem);

        // 2. Пользовательские проекты
        projectsList.forEach(project => {
            const isSelected = editSelectedProjectId === project.id;
            const projectItem = document.createElement('button');
            projectItem.className = 'dropdown-item';
            projectItem.type = 'button';

            const iconHtml = project.iconUrl ?
                `<img src="${project.iconUrl}">` :
                `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>`;

            projectItem.innerHTML = `
                <span class="dropdown-item-left">
                    <span class="dropdown-item-icon">
                        ${iconHtml}
                    </span>
                    <span>${escapeHtml(project.name)}</span>
                </span>
                ${isSelected ? '<span class="dropdown-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
            `;
            projectItem.addEventListener('click', (e) => {
                e.stopPropagation();
                editSelectedProjectId = project.id;
                updateEditProjectDisplay(project.id);
                editProjectDropdown.style.display = 'none';
            });
            editProjectDropdown.appendChild(projectItem);
        });
    };

    updateEditProjectDisplay(editSelectedProjectId);

    editProjectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (editProjectDropdown.style.display === 'none') {
            const calDropdown = editContainer.querySelector('.due-date-dropdown');
            const prioDropdown = editContainer.querySelector('.priority-dropdown');
            if (calDropdown) calDropdown.style.display = 'none';
            if (prioDropdown) prioDropdown.style.display = 'none';
            editProjectDropdown.style.display = 'flex';
            renderEditProjectDropdown();
        } else {
            editProjectDropdown.style.display = 'none';
        }
    });

    // Инициализируем выбор приоритета для редактирования
    const editPriorityWrapper = editContainer.querySelector('.edit-task-priority-wrapper');
    const editPriorityBtn = editPriorityWrapper.querySelector('.btn-due-date');
    const editPriorityIcon = editPriorityWrapper.querySelector('.priority-icon-wrapper');
    const editPriorityText = editPriorityWrapper.querySelector('.priority-text');
    const editPriorityDropdown = editPriorityWrapper.querySelector('.priority-dropdown');

    const updateEditPriorityDisplay = (val) => {
        if (val === 3) {
            editPriorityText.textContent = 'Приоритет 1';
            editPriorityIcon.style.color = '#dc2626';
            editPriorityIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15" stroke="#dc2626" stroke-width="2"></line>
                </svg>
            `;
        } else if (val === 2) {
            editPriorityText.textContent = 'Приоритет 2';
            editPriorityIcon.style.color = '#d97706';
            editPriorityIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15" stroke="#d97706" stroke-width="2"></line>
                </svg>
            `;
        } else if (val === 1) {
            editPriorityText.textContent = 'Приоритет 3';
            editPriorityIcon.style.color = '#2563eb';
            editPriorityIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15" stroke="#2563eb" stroke-width="2"></line>
                </svg>
            `;
        } else {
            editPriorityText.textContent = 'Приоритет';
            editPriorityIcon.style.color = '#808080';
            editPriorityIcon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15"></line>
                </svg>
            `;
        }

        editPriorityDropdown.querySelectorAll('.priority-opt-btn').forEach(btn => {
            const btnPrio = parseInt(btn.getAttribute('data-priority'));
            const check = btn.querySelector('.priority-check');
            if (check) {
                check.style.display = (btnPrio === val) ? 'inline' : 'none';
            }
        });
    };

    updateEditPriorityDisplay(editSelectedPriority);

    editPriorityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (editPriorityDropdown.style.display === 'none') {
            const calDropdown = editContainer.querySelector('.due-date-dropdown');
            const projDropdown = editContainer.querySelector('.project-dropdown');
            if (calDropdown) calDropdown.style.display = 'none';
            if (projDropdown) projDropdown.style.display = 'none';
            editPriorityDropdown.style.display = 'flex';
        } else {
            editPriorityDropdown.style.display = 'none';
        }
    });

    editPriorityDropdown.querySelectorAll('.priority-opt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            editSelectedPriority = parseInt(btn.getAttribute('data-priority'));
            updateEditPriorityDisplay(editSelectedPriority);
            editPriorityDropdown.style.display = 'none';
        });
    });

    const finishEdit = async () => {
        const newTitle = input.value.trim();
        if (!newTitle || newTitle.length > 500) return;

        taskItemEl.classList.remove('editing');
        editContainer.remove();

        const titleChanged = newTitle !== task.title;
        const dateChanged = editSelectedDueDate !== task.dueDate;
        const timeChanged = editSelectedDueTime !== (task.dueTime || null);
        const repeatChanged = editSelectedDueRepeat !== (task.dueRepeat || null);
        const projectChanged = editSelectedProjectId !== (task.projectId || null);
        const priorityChanged = editSelectedPriority !== (task.priority || 0);

        if (titleChanged || dateChanged || timeChanged || repeatChanged || projectChanged || priorityChanged) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                    title: newTitle,
                    dueDate: editSelectedDueDate,
                    dueTime: editSelectedDueTime,
                    dueRepeat: editSelectedDueRepeat,
                    projectId: editSelectedProjectId,
                    priority: editSelectedPriority
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

function isSectionCollapsed(sectionId) {
    try {
        const collapsedIds = JSON.parse(localStorage.getItem('todo_collapsed_sections') || '[]');
        return collapsedIds.includes(sectionId);
    } catch (e) {
        return false;
    }
}

function toggleSectionCollapsed(sectionId) {
    try {
        let collapsedIds = JSON.parse(localStorage.getItem('todo_collapsed_sections') || '[]');
        if (collapsedIds.includes(sectionId)) {
            collapsedIds = collapsedIds.filter(id => id !== sectionId);
        } else {
            collapsedIds.push(sectionId);
        }
        localStorage.setItem('todo_collapsed_sections', JSON.stringify(collapsedIds));
    } catch (e) {
        // ignore
    }
}

function renderTasksGroup(tasksGroup, containerEl) {
    const activeParentTasks = [];
    tasksGroup.forEach(t => {
        if (!t.parentId) {
            if (!activeParentTasks.some(p => p.id === t.id)) {
                activeParentTasks.push(t);
            }
        } else {
            const parent = allTasks.find(pt => pt.id === t.parentId && !pt.deleted);
            if (parent && !activeParentTasks.some(p => p.id === parent.id)) {
                activeParentTasks.push(parent);
            }
        }
    });

    // Sort parent tasks
    activeParentTasks.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : Date.now();
        const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : Date.now();
        return timeB - timeA;
    });

    activeParentTasks.forEach(task => {
        const el = createTaskRowElement(task);
        containerEl.appendChild(el);

        // Рендерим подзадачи родительской задачи (как активные, так и выполненные)
        const subtasks = allTasks.filter(t => t.parentId === task.id && !t.deleted);
        
        // Sort subtasks
        subtasks.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 0;
            const orderB = b.order !== undefined ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;
            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : Date.now();
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : Date.now();
            return timeB - timeA;
        });

        const isCollapsed = isParentTaskCollapsed(task.id);
        if (!isCollapsed) {
            subtasks.forEach(subtask => {
                const subEl = createTaskRowElement(subtask);
                containerEl.appendChild(subEl);
            });
        }
    });
}

// Отрендерить задачи в UI
function renderTasks() {
    const nonDeletedTasks = allTasks.filter(t => !t.deleted);
    const activeTasks = nonDeletedTasks.filter(t => !t.completed);
    const completedTasks = nonDeletedTasks.filter(t => t.completed);
    const trashTasks = allTasks.filter(t => t.deleted);

    // Вычисляем счетчики для сайдбара
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
    const tomorrowObj = new Date();
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth() + 1).padStart(2, '0')}-${String(tomorrowObj.getDate()).padStart(2, '0')}`;

    const isTodayTask = (t) => {
        return t.dueDate === todayStr;
    };
    const isTomorrowTask = (t) => {
        return t.dueDate === tomorrowStr;
    };

    const inboxActiveCount = activeTasks.filter(t => !t.projectId).length;
    const todayActiveCount = activeTasks.filter(isTodayTask).length;
    const tomorrowActiveCount = activeTasks.filter(isTomorrowTask).length;

    const showCounters = localStorage.getItem('todo_show_sidebar_counters') !== 'hide';

    if (inboxCounter) {
        inboxCounter.textContent = inboxActiveCount;
        inboxCounter.style.display = (showCounters && inboxActiveCount > 0) ? 'inline-block' : 'none';
    }
    if (todayCounter) {
        todayCounter.textContent = todayActiveCount;
        todayCounter.style.display = (showCounters && todayActiveCount > 0) ? 'inline-block' : 'none';
    }
    if (tomorrowCounter) {
        tomorrowCounter.textContent = tomorrowActiveCount;
        tomorrowCounter.style.display = (showCounters && tomorrowActiveCount > 0) ? 'inline-block' : 'none';
    }

    const trashCounter = document.getElementById('trashCounter');
    const trashActiveCount = trashTasks.length;
    if (trashCounter) {
        trashCounter.textContent = trashActiveCount;
        trashCounter.style.display = trashActiveCount > 0 ? 'inline-block' : 'none';
    }

    // Переключаем отображение баннера Корзины и формы быстрого добавления
    const trashNoticeBanner = document.getElementById('trashNoticeBanner');
    const addTaskFormEl = document.querySelector('.add-task-form');

    if (trashNoticeBanner) {
        trashNoticeBanner.style.display = currentRoute === 'trash' ? 'flex' : 'none';
    }
    if (addTaskFormEl) {
        addTaskFormEl.style.display = currentRoute === 'trash' ? 'none' : 'flex';
    }

    const projectHeaderActions = document.getElementById('projectHeaderActions');
    if (projectHeaderActions) {
        projectHeaderActions.style.display = (currentRoute.startsWith('project/') || currentRoute === 'today' || currentRoute === 'inbox') ? 'block' : 'none';
    }

    // Фильтруем задачи для отображения в зависимости от текущей вкладки (роута)
    let displayActiveTasks = [];
    let displayCompletedTasks = [];

    if (currentRoute === 'today') {
        displayActiveTasks = activeTasks.filter(isTodayTask);
        displayCompletedTasks = completedTasks.filter(isTodayTask);
    } else if (currentRoute === 'tomorrow') {
        displayActiveTasks = activeTasks.filter(isTomorrowTask);
        displayCompletedTasks = completedTasks.filter(isTomorrowTask);
    } else if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        displayActiveTasks = activeTasks.filter(t => t.projectId === projectId);
        displayCompletedTasks = completedTasks.filter(t => t.projectId === projectId);
    } else if (currentRoute === 'trash') {
        displayActiveTasks = trashTasks;
        displayCompletedTasks = [];
    } else { // inbox
        displayActiveTasks = activeTasks.filter(t => !t.projectId);
        displayCompletedTasks = completedTasks.filter(t => !t.projectId);
    }

    // Обновляем виджет прогресса на вкладке "Сегодня"
    const todayProgressWidget = document.getElementById('todayProgressWidget');
    if (todayProgressWidget) {
        if (currentRoute === 'today') {
            todayProgressWidget.style.display = 'block';
            const completedCount = displayCompletedTasks.length;
            const totalCount = displayActiveTasks.length + completedCount;
            const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
            
            let motivationText = 'Начните день! 🚀';
            if (totalCount === 0) {
                motivationText = 'Запланируйте день ✨';
            } else if (percent === 100) {
                motivationText = 'Все сделано! 🎉';
            } else if (percent >= 75) {
                motivationText = 'Почти готово! 💪';
            } else if (percent >= 50) {
                motivationText = 'Отличная работа! ✨';
            } else if (percent >= 25) {
                motivationText = 'Хорошее начало! 👍';
            }
            
            const widgetContent = todayProgressWidget.querySelector('.today-progress-widget');
            if (!widgetContent) {
                todayProgressWidget.innerHTML = `
                    <div class="today-progress-widget">
                        <div class="progress-circle-container">
                            <svg class="progress-svg" viewBox="0 0 36 36">
                                <path class="progress-bg-circle" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                                <path class="progress-fill-circle" id="todayProgressFillCircle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                            </svg>
                            <div class="progress-text-center" id="todayProgressText">0%</div>
                        </div>
                        <div class="progress-info">
                            <div class="progress-title">Прогресс на сегодня</div>
                            <div class="progress-subtitle" id="todayProgressSubtitle">Нет задач на сегодня</div>
                        </div>
                        <div class="progress-right">
                            <span class="progress-motivation" id="todayProgressMotivation">Начните день! 🚀</span>
                        </div>
                    </div>
                `;
            }
            
            setTimeout(() => {
                const fillCircle = document.getElementById('todayProgressFillCircle');
                const textCenter = document.getElementById('todayProgressText');
                const subtitle = document.getElementById('todayProgressSubtitle');
                const motivation = document.getElementById('todayProgressMotivation');
                
                if (fillCircle) {
                    if (percent === 0) {
                        fillCircle.style.display = 'none';
                    } else {
                        fillCircle.style.display = 'block';
                    }
                    fillCircle.setAttribute('stroke-dasharray', `${percent}, 100`);
                }
                if (textCenter) {
                    textCenter.textContent = `${percent}%`;
                }
                if (subtitle) {
                    subtitle.textContent = totalCount > 0 ? `Выполнено ${completedCount} из ${totalCount} задач` : 'Нет задач на сегодня';
                }
                if (motivation) {
                    motivation.textContent = motivationText;
                }
            }, 10);
        } else {
            todayProgressWidget.style.display = 'none';
            todayProgressWidget.innerHTML = '';
        }
    }

    // Сортируем задачи по полю 'order', а при равенстве или его отсутствии — по 'createdAt'
    const sortTasksByOrder = (tasks) => {
        tasks.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 0;
            const orderB = b.order !== undefined ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;

            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : Date.now();
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : Date.now();
            return timeB - timeA; // Новые вверху
        });
    };

    if (currentRoute !== 'trash') {
        sortTasksByOrder(displayActiveTasks);
        sortTasksByOrder(displayCompletedTasks);
    }

    // 1. РЕНДЕРИМ АКТИВНЫЕ ЗАДАЧИ
    activeTasksContainer.innerHTML = '';

    if (displayActiveTasks.length === 0) {
        if (currentRoute === 'trash') {
            activeTasksContainer.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <h3 class="empty-title">Корзина пуста</h3>
                    <p class="empty-text">Здесь будут отображаться удаленные задачи.</p>
                </div>
            `;
        } else {
            activeTasksContainer.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 640 640" fill="currentColor">
                        <path d="M155.8 96C123.9 96 96.9 119.4 92.4 150.9L64.6 345.2C64.2 348.2 64 351.2 64 354.3L64 480C64 515.3 92.7 544 128 544L512 544C547.3 544 576 515.3 576 480L576 354.3C576 351.3 575.8 348.2 575.4 345.2L547.6 150.9C543.1 119.4 516.1 96 484.2 96L155.8 96zM155.8 160L484.3 160L511.7 352L451.8 352C439.7 352 428.6 358.8 423.2 369.7L408.9 398.3C403.5 409.1 392.4 416 380.3 416L259.9 416C247.8 416 236.7 409.2 231.3 398.3L217 369.7C211.6 358.9 200.5 352 188.4 352L128.3 352L155.8 160z"/>
                    </svg>
                    <h3 class="empty-title">Все дела сделаны!</h3>
                    <p class="empty-text">Добавьте новую задачу выше, чтобы спланировать свой день.</p>
                </div>
            `;
        }
    } else {
        if (currentRoute === 'trash') {
            displayActiveTasks.forEach(task => {
                const el = createTaskRowElement(task);
                activeTasksContainer.appendChild(el);
            });

            // Добавляем футер с количеством элементов в Корзине
            const footerDiv = document.createElement('div');
            footerDiv.style.textAlign = 'center';
            footerDiv.style.marginTop = '24px';
            footerDiv.style.color = 'var(--text-secondary)';
            footerDiv.style.fontSize = '0.9rem';
            footerDiv.style.fontWeight = '500';
            footerDiv.textContent = `${displayActiveTasks.length} в корзине`;
            activeTasksContainer.appendChild(footerDiv);
        } else {
            if (currentRoute.startsWith('project/')) {
                const projectId = currentRoute.split('/')[1];
                const projectSections = sectionsList.filter(s => s.projectId === projectId);
                
                const unsectionedTasks = displayActiveTasks.filter(t => !t.sectionId || !projectSections.some(s => s.id === t.sectionId));
                
                // Render unsectioned tasks first
                const unsectionedContainer = document.createElement('div');
                unsectionedContainer.className = 'unsectioned-tasks-container';
                unsectionedContainer.style.minHeight = '20px';
                activeTasksContainer.appendChild(unsectionedContainer);
                renderTasksGroup(unsectionedTasks, unsectionedContainer);
                
                // Render each section
                projectSections.forEach(section => {
                    const sectionTasks = displayActiveTasks.filter(t => t.sectionId === section.id);
                    const isCollapsed = isSectionCollapsed(section.id);
                    
                    const sectionEl = document.createElement('div');
                    sectionEl.className = `project-section ${isCollapsed ? 'collapsed' : ''}`;
                    sectionEl.setAttribute('data-section-id', section.id);
                    
                    sectionEl.innerHTML = `
                        <div class="project-section-header">
                            <button class="section-drag-handle-btn" title="Перетащить раздел" type="button">
                                <svg viewBox="0 0 640 640" width="14" height="14" fill="currentColor">
                                    <path d="M288 104C288 81.9 270.1 64 248 64L200 64C177.9 64 160 81.9 160 104L160 152C160 174.1 177.9 192 200 192L248 192C270.1 192 288 174.1 288 152L288 104zM288 296C288 273.9 270.1 256 248 256L200 256C177.9 256 160 273.9 160 296L160 344C160 366.1 177.9 384 200 384L248 384C270.1 384 288 366.1 288 344L288 296zM160 488L160 536C160 558.1 177.9 576 200 576L248 576C270.1 576 288 558.1 288 536L288 488C288 465.9 270.1 448 248 448L200 448C177.9 448 160 465.9 160 488zM480 104C480 81.9 462.1 64 440 64L392 64C369.9 64 352 81.9 352 104L352 152C352 174.1 369.9 192 392 192L440 192C462.1 192 480 174.1 480 152L480 104zM352 296L352 344C352 366.1 369.9 384 392 384L440 384C462.1 384 480 366.1 480 344L480 296C480 273.9 462.1 256 440 256L392 256C369.9 256 352 273.9 352 296zM480 488C480 465.9 462.1 448 440 448L392 448C369.9 448 352 465.9 352 488L352 536C352 558.1 369.9 576 392 576L440 576C462.1 576 480 558.1 480 536L480 488z"/>
                                </svg>
                            </button>
                            <button class="section-collapse-btn" type="button" aria-label="Свернуть/развернуть раздел">
                                <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <span class="section-title-text">${escapeHtml(section.name)}</span>
                            <span class="section-count-badge">${sectionTasks.length}</span>
                            <div class="section-actions-wrapper" style="position: relative; margin-left: auto; display: flex; align-items: center; gap: 4px;">
                                <button class="section-actions-btn" title="Действия" type="button">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="1.5"></circle>
                                        <circle cx="12" cy="5" r="1.5"></circle>
                                        <circle cx="12" cy="19" r="1.5"></circle>
                                    </svg>
                                </button>
                                <div class="section-actions-dropdown" style="display: none; position: absolute; top: calc(100% + 4px); right: 0; background-color: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15); z-index: 1000; width: 170px; padding: 4px; box-sizing: border-box; flex-direction: column; gap: 2px;">
                                    <button class="dropdown-item btn-rename-section" type="button">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                        <span>Изменить</span>
                                    </button>

                                    ${(() => {
                                        if (projectsList.length === 0) return '';
                                        return `
                                        <div class="dropdown-submenu-container">
                                            <button class="dropdown-item btn-move-section-trigger" type="button">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; width: 14px; height: 14px; margin-right: 2px;">
                                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                                </svg>
                                                <span>Перенести в..</span>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: auto; color: var(--text-secondary); flex-shrink: 0;">
                                                    <polyline points="9 18 15 12 9 6"></polyline>
                                                </svg>
                                            </button>
                                            <div class="dropdown-submenu">
                                                ${projectsList.map(proj => {
                                                    const isCurrent = projectId === proj.id;
                                                    const iconHtml = proj.iconUrl ?
                                                        `<img src="${proj.iconUrl}" style="width: 14px; height: 14px; object-fit: contain; border-radius: 3px; flex-shrink: 0; margin-right: 0;">` :
                                                        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="flex-shrink: 0;">
                                                            <line x1="4" y1="9" x2="20" y2="9"></line>
                                                            <line x1="4" y1="15" x2="20" y2="15"></line>
                                                            <line x1="10" y1="3" x2="8" y2="21"></line>
                                                            <line x1="16" y1="3" x2="14" y2="21"></line>
                                                        </svg>`;
                                                    return `
                                                        <button class="dropdown-item btn-select-project-for-section ${isCurrent ? 'selected' : ''}" data-project-id="${proj.id}" type="button">
                                                            ${iconHtml}
                                                            <span>${escapeHtml(proj.name)}</span>
                                                            ${isCurrent ? `
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" style="margin-left: auto;">
                                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                                </svg>
                                                            ` : ''}
                                                        </button>
                                                    `;
                                                }).join('')}
                                            </div>
                                        </div>
                                        `;
                                    })()}

                                    <button class="dropdown-item btn-delete-section btn-delete" type="button" style="color: #ff4d4f;">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px; color: #ff4d4f;">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                        <span>Удалить</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="section-tasks-container" style="${isCollapsed ? 'display: none;' : ''}; min-height: 20px;"></div>
                    `;
                    activeTasksContainer.appendChild(sectionEl);
                    
                    const sectionTasksContainer = sectionEl.querySelector('.section-tasks-container');
                    renderTasksGroup(sectionTasks, sectionTasksContainer);
                    
                    const dragHandle = sectionEl.querySelector('.section-drag-handle-btn');
                    if (dragHandle) {
                        dragHandle.addEventListener('mousedown', () => {
                            sectionEl.setAttribute('draggable', 'true');
                        });
                        dragHandle.addEventListener('mouseup', () => {
                            sectionEl.removeAttribute('draggable');
                        });
                    }

                    const collapseBtn = sectionEl.querySelector('.section-collapse-btn');
                    collapseBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        toggleSectionCollapsed(section.id);
                        renderTasks();
                    });
                    
                    const actionsBtn = sectionEl.querySelector('.section-actions-btn');
                    const dropdown = sectionEl.querySelector('.section-actions-dropdown');
                    
                    const openSectionDropdown = (clickEvent = null) => {
                        const headerEl = sectionEl.querySelector('.project-section-header');
                        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
                        
                        if (isHidden) {
                            document.querySelectorAll('.section-actions-dropdown').forEach(d => {
                                d.style.display = 'none';
                                d.closest('.project-section-header')?.classList.remove('menu-open');
                            });
                            dropdown.style.display = 'flex';
                            headerEl?.classList.add('menu-open');
                            
                            if (clickEvent) {
                                dropdown.style.position = 'fixed';
                                let x = clickEvent.clientX;
                                let y = clickEvent.clientY;
                                
                                const menuWidth = 170;
                                const menuHeight = 120;
                                if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
                                if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
                                
                                dropdown.style.left = `${x}px`;
                                dropdown.style.top = `${y}px`;
                            } else {
                                dropdown.style.position = 'absolute';
                                dropdown.style.left = '';
                                dropdown.style.top = 'calc(100% + 4px)';
                            }
                        } else {
                            dropdown.style.display = 'none';
                            headerEl?.classList.remove('menu-open');
                        }
                    };

                    actionsBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        openSectionDropdown();
                    });

                    const headerEl = sectionEl.querySelector('.project-section-header');
                    headerEl.addEventListener('contextmenu', (ev) => {
                        if (window.matchMedia('(hover: hover)').matches) {
                            ev.preventDefault();
                            ev.stopPropagation();
                            openSectionDropdown(ev);
                        }
                    });

                    const btnMoveSectionTrigger = sectionEl.querySelector('.btn-move-section-trigger');
                    if (btnMoveSectionTrigger) {
                        btnMoveSectionTrigger.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            const submenu = btnMoveSectionTrigger.nextElementSibling;
                            if (submenu && submenu.classList.contains('dropdown-submenu')) {
                                const isHidden = getComputedStyle(submenu).display === 'none';
                                submenu.style.display = isHidden ? 'flex' : 'none';
                                const arrowIcon = btnMoveSectionTrigger.querySelector('svg:last-child');
                                if (arrowIcon) {
                                    arrowIcon.style.transform = isHidden ? 'rotate(90deg)' : 'none';
                                }
                            }
                        });
                    }

                    sectionEl.querySelectorAll('.btn-select-project-for-section').forEach(btn => {
                        btn.addEventListener('click', async (ev) => {
                            ev.stopPropagation();
                            dropdown.style.display = 'none';
                            const targetProjId = btn.getAttribute('data-project-id');
                            if (targetProjId) {
                                await moveSectionToProject(section.id, targetProjId);
                            }
                        });
                    });
                    
                    sectionEl.querySelector('.btn-rename-section').addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        dropdown.style.display = 'none';
                        renameSection(section.id);
                    });
                    sectionEl.querySelector('.btn-delete-section').addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        dropdown.style.display = 'none';
                        deleteSection(section.id);
                    });
                });
            } else {
                renderTasksGroup(displayActiveTasks, activeTasksContainer);
            }
        }
    }

    // 2. РЕНДЕРИМ ВЫПОЛНЕННЫЕ ЗАДАЧИ
    completedTasksContainer.innerHTML = '';
    currentDisplayCompletedTasks = displayCompletedTasks;

    let isCompletedHiddenForProject = false;
    if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        const project = projectsList.find(p => p.id === projectId);
        if (project && project.hideCompleted === true) {
            isCompletedHiddenForProject = true;
        }
    } else if (currentRoute === 'today' || currentRoute === 'inbox') {
        if (localStorage.getItem(`todo_hide_completed_${currentRoute}`) === 'true') {
            isCompletedHiddenForProject = true;
        }
    }

    if (displayCompletedTasks.length === 0 || isCompletedHiddenForProject) {
        if (completedSection) completedSection.style.display = 'none';
    } else {
        if (completedSection) completedSection.style.display = 'block';
        if (completedToggleText) completedToggleText.textContent = `Выполненные (${displayCompletedTasks.length})`;

        const completedParentTasks = [];
        displayCompletedTasks.forEach(t => {
            if (!t.parentId) {
                if (!completedParentTasks.some(p => p.id === t.id)) {
                    completedParentTasks.push(t);
                }
            } else {
                const parent = allTasks.find(pt => pt.id === t.parentId && !pt.deleted);
                if (parent && !completedParentTasks.some(p => p.id === parent.id)) {
                    completedParentTasks.push(parent);
                }
            }
        });

        sortTasksByOrder(completedParentTasks);

        completedParentTasks.forEach(task => {
            const el = createTaskRowElement(task);
            completedTasksContainer.appendChild(el);

            // Рендерим только выполненные подзадачи для выполненного родителя
            const subtasks = allTasks.filter(t => t.parentId === task.id && t.completed && !t.deleted);
            sortTasksByOrder(subtasks);

            const isCollapsed = isParentTaskCollapsed(task.id);
            if (!isCollapsed) {
                subtasks.forEach(subtask => {
                    const subEl = createTaskRowElement(subtask);
                    completedTasksContainer.appendChild(subEl);
                });
            }
        });

        updateCompletedToggleUI();
    }
    // Снимаем блокировку ховера после перестроения списка в DOM
    setTimeout(() => {
        if (activeTasksContainer) activeTasksContainer.classList.remove('disable-hover');
        if (completedTasksContainer) completedTasksContainer.classList.remove('disable-hover');
    }, 50);

    // Обновление виджета серии (Streak)
    if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        const project = projectsList.find(p => p.id === projectId);
        if (project) {
            syncProjectStreak(projectId);
            updateStreakWidget(project);
        } else {
            updateStreakWidget(null);
        }
    } else {
        updateStreakWidget(null);
    }

    renderProjects();
}

// Проверка свернутости родительской задачи
function isParentTaskCollapsed(taskId) {
    try {
        const collapsedIds = JSON.parse(localStorage.getItem('todo_collapsed_parent_tasks') || '[]');
        return collapsedIds.includes(taskId);
    } catch (e) {
        return false;
    }
}

// Переключение свернутости родительской задачи
function toggleParentTaskCollapsed(taskId) {
    try {
        let collapsedIds = JSON.parse(localStorage.getItem('todo_collapsed_parent_tasks') || '[]');
        if (collapsedIds.includes(taskId)) {
            collapsedIds = collapsedIds.filter(id => id !== taskId);
        } else {
            collapsedIds.push(taskId);
        }
        localStorage.setItem('todo_collapsed_parent_tasks', JSON.stringify(collapsedIds));
    } catch (e) {
        // ignore
    }
}

function createTaskRowElement(task) {
    const isSubtask = !!task.parentId;
    const hasSubtasks = !isSubtask && allTasks.some(t => t.parentId === task.id && !t.deleted);
    const isCollapsed = hasSubtasks && isParentTaskCollapsed(task.id);

    let dueLabel = '';
    if (task.dueDate) {
        dueLabel = formatDueDateDisplay(task.dueDate, task.dueTime, task.dueRepeat);
        if (currentRoute === 'today' || currentRoute === 'tomorrow') {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
            
            if (task.dueDate === todayStr || task.dueDate === tomorrowStr) {
                const project = projectsList.find(p => p.id === task.projectId);
                const projectName = project ? project.name : 'Входящие';
                dueLabel = dueLabel.replace('Сегодня', projectName).replace('Завтра', projectName);
            }
        }
    }

    const chevronHtml = hasSubtasks ? `
        <button class="task-collapse-btn ${isCollapsed ? 'collapsed' : ''}" type="button" aria-label="Свернуть/развернуть подзадачи" title="${isCollapsed ? 'Развернуть подзадачи' : 'Свернуть подзадачи'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </button>
    ` : '';

    const item = document.createElement('div');
    item.className = `task-item ${task.completed ? 'completed' : ''} priority-${task.priority || 0} ${isSubtask ? 'subtask' : ''}`;
    item.setAttribute('data-id', task.id);

    if (task.deleted) {
        item.innerHTML = `
            ${chevronHtml}
            <div class="checkbox-wrapper" style="opacity: 0.5; pointer-events: none;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" style="color: var(--text-secondary);">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </div>
            <div class="task-content" style="min-width: 0; flex: 1;">
                <span class="task-title-text" style="color: var(--text-secondary); pointer-events: none; text-decoration: ${task.completed ? 'line-through' : 'none'};">${formatTaskTitle(task.title)}</span>
            </div>
            ${task.dueDate ? `
                <span class="task-due-badge" style="opacity: 0.6; margin-left: auto;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align: middle; margin-right: 3px; display: inline-block;">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span style="vertical-align: middle;">${dueLabel}</span>
                    ${task.dueRepeat ? `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10" style="vertical-align: middle; margin-left: 4px; display: inline-block;">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                        </svg>
                    ` : ''}
                </span>
            ` : ''}
            <div class="task-actions" style="opacity: 1; display: flex; gap: 4px;">
                <button class="action-btn btn-restore" title="Восстановить">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                        <polyline points="1 4 1 10 7 10"></polyline>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                    </svg>
                </button>
                <button class="action-btn btn-delete-perm" title="Удалить навсегда">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;

        const btnRestore = item.querySelector('.btn-restore');
        const btnDeletePerm = item.querySelector('.btn-delete-perm');

        btnRestore.addEventListener('click', (e) => {
            e.stopPropagation();
            restoreTask(task.id);
        });

        btnDeletePerm.addEventListener('click', (e) => {
            e.stopPropagation();
            showCustomConfirm(
                "Удалить навсегда?",
                `Задача <strong>${escapeHtml(task.title)}</strong> будет удалена безвозвратно. Это действие нельзя отменить.`,
                "Удалить навсегда",
                () => {
                    deleteTaskPermanently(task.id);
                }
            );
        });

        return item;
    }

    item.innerHTML = `
        <button class="task-drag-handle" aria-label="Перетащить задачу" title="Перетащить">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                <path d="M288 104C288 81.9 270.1 64 248 64L200 64C177.9 64 160 81.9 160 104L160 152C160 174.1 177.9 192 200 192L248 192C270.1 192 288 174.1 288 152L288 104zM288 296C288 273.9 270.1 256 248 256L200 256C177.9 256 160 273.9 160 296L160 344C160 366.1 177.9 384 200 384L248 384C270.1 384 288 366.1 288 344L288 296zM160 488L160 536C160 558.1 177.9 576 200 576L248 576C270.1 576 288 558.1 288 536L288 488C288 465.9 270.1 448 248 448L200 448C177.9 448 160 465.9 160 488zM480 104C480 81.9 462.1 64 440 64L392 64C369.9 64 352 81.9 352 104L352 152C352 174.1 369.9 192 392 192L440 192C462.1 192 480 174.1 480 152L480 104zM352 296L352 344C352 366.1 369.9 384 392 384L440 384C462.1 384 480 366.1 480 344L480 296C480 273.9 462.1 256 440 256L392 256C369.9 256 352 273.9 352 296zM480 488C480 465.9 462.1 448 440 448L392 448C369.9 448 352 465.9 352 488L352 536C352 558.1 369.9 576 392 576L440 576C462.1 576 480 558.1 480 536L480 488z"/>
            </svg>
        </button>
        ${chevronHtml}
        <div class="checkbox-wrapper">
            <button class="custom-checkbox" aria-label="${task.completed ? 'Отметить невыполненной' : 'Отметить выполненной'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
        </div>
        <div class="task-content">
            <span class="task-title-text">${formatTaskTitle(task.title)}</span>
        </div>
        ${task.dueDate ? `
            <span class="task-due-badge ${isDateToday(task.dueDate) ? 'today' : (isDateOverdue(task.dueDate) ? 'overdue' : '')}" style="margin-left: auto;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align: middle; margin-right: 3px; display: inline-block;">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span style="vertical-align: middle;">${dueLabel}</span>
                ${task.dueRepeat ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10" style="vertical-align: middle; margin-left: 4px; display: inline-block;">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                    </svg>
                ` : ''}
            </span>
        ` : ''}
        <div class="task-actions">
            <button class="action-btn btn-more" title="Действия">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1.5"></circle>
                    <circle cx="12" cy="5" r="1.5"></circle>
                    <circle cx="12" cy="19" r="1.5"></circle>
                </svg>
            </button>
            <div class="task-actions-dropdown" style="display: none;">
                ${task.completed ? `
                <button class="dropdown-item btn-delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Удалить</span>
                </button>
                ` : `
                <button class="dropdown-item btn-edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Изменить</span>
                </button>
                
                ${!isSubtask ? `
                <button class="dropdown-item btn-add-subtask">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <span>Добавить подзадачу</span>
                </button>
                ` : ''}
                
                <div class="dropdown-divider"></div>
                
                <div class="dropdown-section dropdown-section-due">
                    <div class="dropdown-section-title">Срок</div>
                    <div class="due-options-row">
                        <button class="due-opt-btn btn-due-today" type="button" data-tooltip="Сегодня">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                                <text x="12" y="19" font-size="8.5" font-family="-apple-system, system-ui, sans-serif" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">${new Date().getDate()}</text>
                            </svg>
                        </button>
                        <button class="due-opt-btn btn-due-tomorrow" type="button" data-tooltip="Завтра">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="4"></circle>
                                <line x1="12" y1="1" x2="12" y2="4"></line>
                                <line x1="12" y1="20" x2="12" y2="23"></line>
                                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"></line>
                                <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"></line>
                                <line x1="1" y1="12" x2="4" y2="12"></line>
                                <line x1="20" y1="12" x2="23" y2="12"></line>
                                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"></line>
                                <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"></line>
                            </svg>
                        </button>
                        <button class="due-opt-btn btn-due-select" type="button" data-tooltip="Выбрать">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                                <rect x="6.5" y="12.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" stroke="none"></rect>
                                <rect x="11.25" y="12.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" stroke="none"></rect>
                                <rect x="16" y="12.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" stroke="none"></rect>
                                <rect x="6.5" y="16.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" stroke="none"></rect>
                                <rect x="11.25" y="16.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" stroke="none"></rect>
                                <rect x="16" y="16.5" width="1.5" height="1.5" rx="0.3" fill="currentColor" stroke="none"></rect>
                            </svg>
                            <input type="date" class="invisible-due-date-input" style="position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;">
                        </button>
                        <button class="due-opt-btn btn-due-none" type="button" data-tooltip="Без срока">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="9"></circle>
                                <line x1="5.64" y1="5.64" x2="18.36" y2="18.36"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="dropdown-divider"></div>
                
                <div class="dropdown-section dropdown-section-priority">
                    <div class="dropdown-section-title">Приоритет</div>
                    <div class="priority-options-row">
                        <button class="prio-opt-btn flag-red ${task.priority === 3 ? 'active' : ''}" type="button" data-priority="3" data-tooltip="Приоритет 1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                        <button class="prio-opt-btn flag-orange ${task.priority === 2 ? 'active' : ''}" type="button" data-priority="2" data-tooltip="Приоритет 2">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                        <button class="prio-opt-btn flag-blue ${task.priority === 1 ? 'active' : ''}" type="button" data-priority="1" data-tooltip="Приоритет 3">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                        <button class="prio-opt-btn flag-white ${task.priority === 0 || !task.priority ? 'active' : ''}" type="button" data-priority="0" data-tooltip="Приоритет 4">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="dropdown-divider"></div>
                
                ${!isSubtask ? `
                <div class="dropdown-submenu-container">
                    <button class="dropdown-item btn-move-project">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; width: 14px; height: 14px;">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>Перенести в..</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-left: auto; color: var(--text-secondary); flex-shrink: 0;">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                    <div class="dropdown-submenu">
                        <button class="dropdown-item btn-select-project ${!task.projectId ? 'selected' : ''}" data-project-id="">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                            </svg>
                            <span>Входящие</span>
                            ${!task.projectId ? `
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" style="margin-left: auto;">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            ` : ''}
                        </button>
                        ${projectsList.map(proj => {
                            const isCurrent = task.projectId === proj.id;
                            const iconHtml = proj.iconUrl ?
                                `<img src="${proj.iconUrl}" style="width: 14px; height: 14px; object-fit: contain; border-radius: 3px; flex-shrink: 0; margin-right: 0;">` :
                                `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="flex-shrink: 0;">
                                    <line x1="4" y1="9" x2="20" y2="9"></line>
                                    <line x1="4" y1="15" x2="20" y2="15"></line>
                                    <line x1="10" y1="3" x2="8" y2="21"></line>
                                    <line x1="16" y1="3" x2="14" y2="21"></line>
                                </svg>`;
                            return `
                                    <button class="dropdown-item btn-select-project ${isCurrent ? 'selected' : ''}" data-project-id="${proj.id}">
                                        ${iconHtml}
                                        <span>${escapeHtml(proj.name)}</span>
                                        ${isCurrent ? `
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" style="margin-left: auto;">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        ` : ''}
                                    </button>
                                `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}
                
                <button class="dropdown-item btn-duplicate-task">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Дублировать</span>
                </button>
                
                <div class="dropdown-divider"></div>
                
                <button class="dropdown-item btn-delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Удалить</span>
                </button>
                `}
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

        if (!task.completed) {
            const completedSound = new Audio('completed.mp3');
            completedSound.play().catch(err => console.log('Audio playback failed:', err));
        }

        toggleTaskCompleted(task.id, task.completed);
    });

    // Клик на три точки
    const openActionsDropdown = (clickEvent = null) => {
        // Закрываем другие открытые меню действий перед тем, как открыть это
        document.querySelectorAll('.task-item').forEach(taskItem => {
            if (taskItem !== item) {
                taskItem.classList.remove('menu-open');
                const dropdown = taskItem.querySelector('.task-actions-dropdown');
                if (dropdown) {
                    dropdown.style.display = 'none';
                    dropdown.style.position = '';
                    dropdown.style.left = '';
                    dropdown.style.top = '';
                }
            }
        });

        const isHidden = actionsDropdown.style.display === 'none';
        if (isHidden) {
            actionsDropdown.style.display = 'flex';
            item.classList.add('menu-open');

            // Если передан клик ПКМ, позиционируем меню на месте курсора
            if (clickEvent) {
                actionsDropdown.style.position = 'fixed';
                let x = clickEvent.clientX;
                let y = clickEvent.clientY;

                // Проверяем, чтобы меню не вылезало за пределы экрана
                const menuWidth = 230;
                const menuHeight = task.completed ? 80 : 340;
                if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
                if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

                actionsDropdown.style.left = `${x}px`;
                actionsDropdown.style.top = `${y}px`;
            } else {
                // Возвращаем дефолтное позиционирование от кнопки
                actionsDropdown.style.position = 'absolute';
                actionsDropdown.style.left = '';
                actionsDropdown.style.top = 'calc(100% + 4px)';
            }
        } else {
            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');
            actionsDropdown.style.position = '';
            actionsDropdown.style.left = '';
            actionsDropdown.style.top = '';
        }
    };

    btnMore.addEventListener('click', (e) => {
        e.stopPropagation();
        openActionsDropdown();
    });

    // Открытие меню по правому клику мыши (contextmenu) на десктопе
    item.addEventListener('contextmenu', (e) => {
        if (window.matchMedia('(hover: hover)').matches) {
            e.preventDefault();
            e.stopPropagation();
            openActionsDropdown(e);
        }
    });

    // Навешиваем новые обработчики для Срока и Приоритета
    if (!task.completed) {
        const btnDueToday = item.querySelector('.btn-due-today');
        const btnDueTomorrow = item.querySelector('.btn-due-tomorrow');
        const btnDueSelect = item.querySelector('.btn-due-select');
        const btnDueNone = item.querySelector('.btn-due-none');

        const tdyObj = new Date();
        const todayStr = `${tdyObj.getFullYear()}-${String(tdyObj.getMonth() + 1).padStart(2, '0')}-${String(tdyObj.getDate()).padStart(2, '0')}`;

        const tmwObj = new Date();
        tmwObj.setDate(tmwObj.getDate() + 1);
        const tomorrowStr = `${tmwObj.getFullYear()}-${String(tmwObj.getMonth() + 1).padStart(2, '0')}-${String(tmwObj.getDate()).padStart(2, '0')}`;

        if (btnDueToday) {
            btnDueToday.addEventListener('click', async (e) => {
                e.stopPropagation();
                actionsDropdown.style.display = 'none';
                item.classList.remove('menu-open');
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                        dueDate: todayStr
                    });
                } catch (err) {
                    console.error("Ошибка обновления даты:", err);
                }
            });
        }

        if (btnDueTomorrow) {
            btnDueTomorrow.addEventListener('click', async (e) => {
                e.stopPropagation();
                actionsDropdown.style.display = 'none';
                item.classList.remove('menu-open');
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                        dueDate: tomorrowStr
                    });
                } catch (err) {
                    console.error("Ошибка обновления даты:", err);
                }
            });
        }

        if (btnDueSelect) {
            const dateInput = btnDueSelect.querySelector('.invisible-due-date-input');
            if (dateInput) {
                btnDueSelect.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof dateInput.showPicker === 'function') {
                        dateInput.showPicker();
                    } else {
                        dateInput.click();
                    }
                });

                dateInput.addEventListener('change', async (e) => {
                    const newDate = e.target.value;
                    actionsDropdown.style.display = 'none';
                    item.classList.remove('menu-open');
                    if (newDate) {
                        try {
                            await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                                dueDate: newDate
                            });
                        } catch (err) {
                            console.error("Ошибка обновления даты:", err);
                        }
                    }
                });
            }
        }

        if (btnDueNone) {
            btnDueNone.addEventListener('click', async (e) => {
                e.stopPropagation();
                actionsDropdown.style.display = 'none';
                item.classList.remove('menu-open');
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                        dueDate: null,
                        dueTime: null,
                        dueRepeat: null
                    });
                } catch (err) {
                    console.error("Ошибка очистки даты:", err);
                }
            });
        }

        // Приоритеты
        item.querySelectorAll('.prio-opt-btn').forEach(prioBtn => {
            prioBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const priorityVal = parseInt(prioBtn.getAttribute('data-priority'), 10);
                actionsDropdown.style.display = 'none';
                item.classList.remove('menu-open');
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                        priority: priorityVal
                    });
                } catch (err) {
                    console.error("Ошибка обновления приоритета:", err);
                }
            });
        });
    }

    // Клик на Дублировать
    const btnDuplicate = item.querySelector('.btn-duplicate-task');
    if (btnDuplicate) {
        btnDuplicate.addEventListener('click', async (e) => {
            e.stopPropagation();
            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');
            await duplicateTask(task);
        });
    }

    // Клик на добавление подзадачи
    if (!isSubtask) {
        const btnAddSubtask = item.querySelector('.btn-add-subtask');
        if (btnAddSubtask) {
            btnAddSubtask.addEventListener('click', (e) => {
                e.stopPropagation();
                actionsDropdown.style.display = 'none';
                item.classList.remove('menu-open');
                showInlineSubtaskInput(item, task.id, task.projectId);
            });
        }
    }

    // Обработчик открытия подменю переноса проекта на телефонах
    const btnMoveProject = item.querySelector('.btn-move-project');
    if (btnMoveProject) {
        btnMoveProject.addEventListener('click', (e) => {
            e.stopPropagation();
            const submenu = btnMoveProject.nextElementSibling;
            if (submenu && submenu.classList.contains('dropdown-submenu')) {
                const isHidden = getComputedStyle(submenu).display === 'none';
                submenu.style.display = isHidden ? 'flex' : 'none';
                
                const arrowIcon = btnMoveProject.querySelector('svg:last-child');
                if (arrowIcon) {
                    arrowIcon.style.transform = isHidden ? 'rotate(90deg)' : 'none';
                }
            }
        });
    }

    // Клик на кнопку редактирования из меню
    if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');
            enableInlineEdit(item, task, titleSpan);
        });
    }

    // Двойной клик на текст задачи также переводит в режим редактирования
    if (!task.completed) {
        titleSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            enableInlineEdit(item, task, titleSpan);
        });
    }

    // Клик на удаление из меню
    btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        actionsDropdown.style.display = 'none';
        item.classList.remove('menu-open');
        showCustomConfirm(
            "Переместить в корзину?",
            `Задача <strong>${escapeHtml(task.title)}</strong> будет перемещена в корзину.`,
            "Удалить",
            () => {
                deleteTask(task.id);
            }
        );
    });

    // Обработчик выбора проекта в подменю
    item.querySelectorAll('.btn-select-project').forEach(projBtn => {
        projBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetProjId = projBtn.getAttribute('data-project-id') || null;

            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');

            if (targetProjId !== task.projectId) {
                // Локально обновляем проект у задачи в allTasks, чтобы рендер произошел мгновенно
                const localTask = allTasks.find(t => t.id === task.id);
                if (localTask) {
                    localTask.projectId = targetProjId;
                    localTask.order = 0;
                }
                renderProjects();
                renderTasks();

                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                        projectId: targetProjId,
                        order: 0 // Сбрасываем order, чтобы задача встала в начало нового списка
                    });
                } catch (err) {
                    console.error("Ошибка при переносе задачи в другой проект:", err);
                }
            }
        });
    });

    // Настройка активации draggable при взаимодействии с карточкой (drag-and-drop по всей площади)
    item.addEventListener('mousedown', (e) => {
        // Исключаем интерактивные элементы (за исключением самой иконки перетаскивания)
        if (e.target.closest('button:not(.task-drag-handle), input, textarea, a, .checkbox-wrapper, .custom-checkbox, .task-actions-dropdown')) {
            return;
        }
        item.setAttribute('draggable', 'true');
    });
    item.addEventListener('mouseup', () => {
        item.removeAttribute('draggable');
    });

    // Обработчик кнопки свертывания/развертывания подзадач
    if (hasSubtasks) {
        const collapseBtn = item.querySelector('.task-collapse-btn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleParentTaskCollapsed(task.id);
                renderTasks();
            });
        }
    }

    return item;
}

// Функция отображения инпута для создания новой подзадачи
function showInlineSubtaskInput(parentTaskEl, parentId, projectId) {
    // Проверяем, не открыт ли уже инпут подзадачи для этой задачи
    const nextSibling = parentTaskEl.nextSibling;
    if (nextSibling && nextSibling.classList && nextSibling.classList.contains('new-subtask-temp')) {
        const existingInput = nextSibling.querySelector('input');
        if (existingInput) existingInput.focus();
        return;
    }

    const tempRow = document.createElement('div');
    tempRow.className = 'new-subtask-temp';
    tempRow.innerHTML = `
        <div class="checkbox-wrapper" style="opacity: 0.5; pointer-events: none;">
            <div class="custom-checkbox"></div>
        </div>
        <input type="text" placeholder="Добавить подзадачу..." maxlength="500">
    `;

    // Вставляем инпут сразу после строки родительской задачи
    parentTaskEl.parentNode.insertBefore(tempRow, parentTaskEl.nextSibling);

    // Если родительская задача была свернута, развернем её
    if (isParentTaskCollapsed(parentId)) {
        toggleParentTaskCollapsed(parentId);
        renderTasks();
        
        // После перерендера DOM находим новую строку родителя и добавляем инпут
        setTimeout(() => {
            const newParentEl = document.querySelector(`.task-item[data-id="${parentId}"]`);
            if (newParentEl) {
                showInlineSubtaskInput(newParentEl, parentId, projectId);
            }
        }, 50);
        return;
    }

    const input = tempRow.querySelector('input');
    input.focus();

    let finished = false;
    async function saveSubtask() {
        if (finished) return;
        finished = true;
        
        const text = input.value.trim();
        tempRow.remove();

        if (text && text.length <= 500) {
            // Находим максимальный order среди существующих подзадач этого родителя
            const siblingSubtasks = allTasks.filter(t => t.parentId === parentId && !t.deleted);
            let newOrder = 0;
            if (siblingSubtasks.length > 0) {
                const maxOrder = Math.max(...siblingSubtasks.map(t => t.order !== undefined ? t.order : 0));
                newOrder = maxOrder + 1;
            }

            try {
                await addDoc(collection(db, 'users', currentUid, 'tasks'), {
                    title: text,
                    completed: false,
                    dueDate: null,
                    dueTime: null,
                    dueRepeat: null,
                    projectId: projectId || null,
                    priority: 0,
                    order: newOrder,
                    parentId: parentId,
                    createdAt: serverTimestamp()
                });
            } catch (err) {
                console.error("Ошибка при создании подзадачи:", err);
            }
        }
    }

    function cancelSubtask() {
        if (finished) return;
        finished = true;
        tempRow.remove();
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveSubtask();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelSubtask();
        }
    });

    input.addEventListener('blur', () => {
        // Задержка на случай, если фокус ушел из-за нажатия Enter
        setTimeout(() => {
            cancelSubtask();
        }, 150);
    });
}

// Вспомогательные функции для серии дней (Streak)
function getLocalDateString(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getYesterdayDateString(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
}

function getISOWeekString(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const year = d.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const week = Math.ceil((((d - startOfYear) / 86400000) + 1) / 7);
    return `${year}-W${week}`;
}

function getDayOfWeek(date) {
    return date.getDay() || 7;
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
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
}

// Функция форматирования названия задачи с поддержкой кликабельных ссылок
function formatTaskTitle(title) {
    if (!title) return '';
    const escaped = escapeHtml(title);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return escaped.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="task-title-link" onclick="event.stopPropagation();">${url}</a>`;
    });
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

// === ЛОГИКА ПРОЕКТОВ ===

function startProjectsForUser(uid) {
    if (unsubscribeProjects) unsubscribeProjects();

    const qProjects = query(collection(db, 'users', uid, 'projects'));

    unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
        projectsList = [];
        snapshot.forEach((docSnap) => {
            projectsList.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Сортируем проекты по order, а при равенстве или отсутствии — по createdAt
        projectsList.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 0;
            const orderB = b.order !== undefined ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;

            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return timeA - timeB; // Старые вверху (по возрастанию)
        });

        // Проверяем существование проекта на текущем роуте
        if (currentRoute.startsWith('project/')) {
            const projectId = currentRoute.split('/')[1];
            const exists = projectsList.some(p => p.id === projectId);
            if (!exists) {
                currentRoute = 'inbox';
                history.replaceState(null, null, '#inbox');
                setAddTaskProject(null);
            } else {
                setAddTaskProject(projectId);
                // Проект существует, обновляем заголовок в шапке и во вкладке браузера
                const proj = projectsList.find(p => p.id === projectId);
                const titleEl = document.querySelector('.list-title');
                if (titleEl && proj) {
                    titleEl.textContent = proj.name;
                }
                updateBrowserTitle();
            }
        } else {
            setAddTaskProject(addTaskSelectedProjectId);
        }

        renderProjects();
        renderTasks(); // Re-render to update counters in sidebar!
    }, (error) => {
        console.error("Ошибка при получении списка проектов:", error);
    });
}

function stopProjectsForUser() {
    if (unsubscribeProjects) {
        unsubscribeProjects();
        unsubscribeProjects = null;
    }
    projectsList = [];
    if (projectsListContainer) projectsListContainer.innerHTML = '';
}

function startSectionsForUser(uid) {
    if (unsubscribeSections) unsubscribeSections();

    const qSections = query(collection(db, 'users', uid, 'sections'));

    unsubscribeSections = onSnapshot(qSections, (snapshot) => {
        sectionsList = [];
        snapshot.forEach((docSnap) => {
            sectionsList.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Sort sections by order
        sectionsList.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 0;
            const orderB = b.order !== undefined ? b.order : 0;
            return orderA - orderB;
        });

        renderTasks();
    }, (error) => {
        console.error("Ошибка при получении списка разделов:", error);
    });
}

function stopSectionsForUser() {
    if (unsubscribeSections) {
        unsubscribeSections();
        unsubscribeSections = null;
    }
    sectionsList = [];
}

function renderProjects() {
    if (!projectsListContainer) return;
    projectsListContainer.innerHTML = '';

    projectsList.forEach(project => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'project-item-container';

        const projectHash = `project/${project.id}`;
        const isActive = currentRoute === projectHash;

        // Calculate task count for this project
        const projectTaskCount = allTasks.filter(t => !t.deleted && !t.completed && t.projectId === project.id).length;

        const iconHtml = project.iconUrl ?
            `<img src="${project.iconUrl}" style="width: 16px; height: 16px; object-fit: contain; border-radius: 4px; flex-shrink: 0;">` :
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="9" x2="20" y2="9"></line>
                <line x1="4" y1="15" x2="20" y2="15"></line>
                <line x1="10" y1="3" x2="8" y2="21"></line>
                <line x1="16" y1="3" x2="14" y2="21"></line>
            </svg>`;

        const showCounters = localStorage.getItem('todo_show_sidebar_counters') !== 'hide';
        const hideProjectCount = project.hideCount === true;

        itemContainer.innerHTML = `
            <a href="#${projectHash}" class="menu-item ${isActive ? 'active' : ''}">
                <span class="menu-item-left">
                    <span class="menu-icon">
                        ${iconHtml}
                    </span>
                    <span>${escapeHtml(project.name)}</span>
                </span>
                <span class="menu-counter" style="${(showCounters && !hideProjectCount && projectTaskCount > 0) ? '' : 'display:none'}">${projectTaskCount}</span>
            </a>
            <button class="project-actions-btn" data-id="${project.id}" title="Действия">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3"/>
                </svg>
            </button>
        `;

        // Add project actions listener
        const actionsBtn = itemContainer.querySelector('.project-actions-btn');
        actionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showProjectContextMenu(e, project.id, project.name, itemContainer);
        });

        // Открытие меню проектов по правому клику (ПКМ) на десктопе
        itemContainer.addEventListener('contextmenu', (e) => {
            if (window.matchMedia('(hover: hover)').matches) {
                e.preventDefault();
                e.stopPropagation();
                showProjectContextMenu(e, project.id, project.name, itemContainer);
            }
        });

        // Drag and Drop активация через иконку
        const menuIcon = itemContainer.querySelector('.menu-icon');
        if (menuIcon) {
            menuIcon.addEventListener('mousedown', () => {
                itemContainer.setAttribute('draggable', 'true');
            });
            menuIcon.addEventListener('mouseup', () => {
                itemContainer.removeAttribute('draggable');
            });
        }

        projectsListContainer.appendChild(itemContainer);
    });
}

async function deleteProject(projectId) {
    if (!currentUid || !projectId) return;
    try {
        await deleteDoc(doc(db, 'users', currentUid, 'projects', projectId));

        // Перемещаем задачи этого проекта в Корзину
        const tasksToTrash = allTasks.filter(t => t.projectId === projectId);
        for (const task of tasksToTrash) {
            await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                deleted: true,
                deletedAt: serverTimestamp(),
                projectId: null // Сбрасываем ID проекта, чтобы при восстановлении они попадали во Входящие
            });
        }

        // Redirect to Inbox if viewing the deleted project
        if (currentRoute === `project/${projectId}`) {
            window.location.hash = '#inbox';
        }
    } catch (err) {
        console.error("Ошибка при удалении проекта:", err);
    }
}

// Привязка событий проектов (создание нового проекта без кнопок, как в bookmarks.html)
if (btnAddProject) {
    btnAddProject.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUid) {
            const sidebarUser = document.querySelector('.sidebar-user');
            if (sidebarUser && typeof window.openAuthModal === 'function') {
                window.openAuthModal(sidebarUser);
            }
            return;
        }

        // Если уже открыто поле ввода, не создаем еще одно
        if (projectsListContainer.querySelector('.new-project-temp')) {
            const tempInput = projectsListContainer.querySelector('.project-inline-input');
            if (tempInput) tempInput.focus();
            return;
        }

        const itemContainer = document.createElement('div');
        itemContainer.className = 'project-item-container new-project-temp';

        itemContainer.innerHTML = `
            <div class="menu-item active" style="padding: 8px 12px; margin: 2px 0; border-radius: 8px; display: flex; align-items: center; width: 100%; box-sizing: border-box;">
                <span class="menu-item-left" style="width: 100%; display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <span class="menu-icon" style="opacity: 0.85; flex-shrink: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="flex-shrink: 0;">
                            <line x1="4" y1="9" x2="20" y2="9"></line>
                            <line x1="4" y1="15" x2="20" y2="15"></line>
                            <line x1="10" y1="3" x2="8" y2="21"></line>
                            <line x1="16" y1="3" x2="14" y2="21"></line>
                        </svg>
                    </span>
                    <input type="text" class="project-inline-input" placeholder="Новый проект..." maxlength="50" style="background: transparent; border: none; outline: none; color: var(--text); font-family: inherit; font-size: 16px; width: 100%; padding: 0;">
                </span>
            </div>
        `;

        projectsListContainer.appendChild(itemContainer);

        const input = itemContainer.querySelector('.project-inline-input');
        input.focus();

        let finished = false;
        async function saveProject() {
            if (finished) return;
            finished = true;
            const nameText = input.value.trim();
            if (nameText && nameText.length <= 50) {
                try {
                    await addDoc(collection(db, 'users', currentUid, 'projects'), {
                        name: nameText,
                        createdAt: serverTimestamp()
                    });
                } catch (err) {
                    console.error("Не удалось добавить проект:", err);
                    itemContainer.remove();
                }
            } else {
                itemContainer.remove();
            }
        }

        input.addEventListener('blur', saveProject);
        input.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                input.blur();
            } else if (ev.key === 'Escape') {
                finished = true;
                itemContainer.remove();
            }
        });
        input.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
    });
}

// === ЛОГИКА РАЗДЕЛОВ (ДОБАВЛЕНИЕ, ПЕРЕИМЕНОВАНИЕ, УДАЛЕНИЕ, ПЕРЕНОС) ===
const projectHeaderMoreBtn = document.getElementById('projectHeaderMoreBtn');
const projectHeaderDropdown = document.getElementById('projectHeaderDropdown');

if (projectHeaderMoreBtn && projectHeaderDropdown) {
    projectHeaderMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (projectHeaderDropdown.style.display === 'none' || projectHeaderDropdown.style.display === '') {
            renderProjectHeaderDropdown();
            projectHeaderDropdown.style.display = 'flex';
        } else {
            projectHeaderDropdown.style.display = 'none';
        }
    });
}

function addSectionForCurrentProject() {
    if (projectHeaderDropdown) projectHeaderDropdown.style.display = 'none';
    
    if (!currentRoute.startsWith('project/')) return;
    const projectId = currentRoute.split('/')[1];

    // Если уже открыто поле ввода нового раздела, не создаем еще одно
    if (activeTasksContainer.querySelector('.new-section-temp')) {
        const tempInput = activeTasksContainer.querySelector('.section-inline-input');
        if (tempInput) tempInput.focus();
        return;
    }

    const tempSectionEl = document.createElement('div');
    tempSectionEl.className = 'project-section new-section-temp';
    tempSectionEl.innerHTML = `
        <div class="project-section-header" style="padding-left: 0;">
            <button class="section-collapse-btn" type="button" style="margin-left: 0;">
                <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
            <input type="text" class="section-inline-input" placeholder="Название раздела..." maxlength="50" style="background: transparent; border: 1px solid var(--accent); outline: none; color: var(--text); font-family: inherit; font-size: 0.95rem; font-weight: 600; padding: 2px 4px; border-radius: 4px; width: 200px;">
        </div>
    `;
    activeTasksContainer.appendChild(tempSectionEl);
    const input = tempSectionEl.querySelector('.section-inline-input');
    input.focus();

    let finished = false;
    async function saveSection() {
        if (finished) return;
        finished = true;
        const nameText = input.value.trim();
        if (nameText && nameText.length <= 50) {
            try {
                const projectSections = sectionsList.filter(s => s.projectId === projectId);
                const maxOrder = projectSections.reduce((max, s) => Math.max(max, s.order !== undefined ? s.order : 0), 0);
                
                await addDoc(collection(db, 'users', currentUid, 'sections'), {
                    name: nameText,
                    projectId: projectId,
                    order: maxOrder + 1,
                    createdAt: serverTimestamp()
                });
            } catch (err) {
                console.error("Не удалось добавить раздел:", err);
                tempSectionEl.remove();
            }
        } else {
            tempSectionEl.remove();
        }
    }

    input.addEventListener('blur', saveSection);
    input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') {
            ev.preventDefault();
            input.blur();
        } else if (ev.key === 'Escape') {
            finished = true;
            tempSectionEl.remove();
        }
    });
    input.addEventListener('click', (ev) => {
        ev.stopPropagation();
    });
}

function renderProjectHeaderDropdown() {
    if (!projectHeaderDropdown) return;

    if (currentRoute === 'today' || currentRoute === 'inbox') {
        const key = `todo_hide_completed_${currentRoute}`;
        const isCompletedHidden = localStorage.getItem(key) === 'true';

        projectHeaderDropdown.innerHTML = `
            <button class="dropdown-item" id="btnProjectToggleCompleted" style="display: flex; align-items: center; width: 100%; padding: 8px 12px; border: none; background: transparent; color: var(--text); border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: background-color 0.15s;">
                ${isCompletedHidden ? `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>Показать выполненные</span>
                ` : `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                    <span>Скрыть выполненные</span>
                `}
            </button>
        `;

        document.getElementById('btnProjectToggleCompleted').addEventListener('click', (e) => {
            e.stopPropagation();
            projectHeaderDropdown.style.display = 'none';
            localStorage.setItem(key, isCompletedHidden ? 'false' : 'true');
            renderTasks();
        });
        return;
    }

    if (!currentRoute.startsWith('project/')) return;
    const projectId = currentRoute.split('/')[1];
    const project = projectsList.find(p => p.id === projectId);
    if (!project) return;

    const isCompletedHidden = project.hideCompleted === true;

    projectHeaderDropdown.innerHTML = `
        <button class="dropdown-item" id="btnProjectAddSection" style="display: flex; align-items: center; width: 100%; padding: 8px 12px; border: none; background: transparent; color: var(--text); border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: background-color 0.15s;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px; flex-shrink: 0;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Добавить раздел</span>
        </button>
        <button class="dropdown-item" id="btnProjectToggleCompleted" style="display: flex; align-items: center; width: 100%; padding: 8px 12px; border: none; background: transparent; color: var(--text); border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: background-color 0.15s;">
            ${isCompletedHidden ? `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>Показать выполненные</span>
            ` : `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <span>Скрыть выполненные</span>
            `}
        </button>
        <button class="dropdown-item" id="btnProjectRename" style="display: flex; align-items: center; width: 100%; padding: 8px 12px; border: none; background: transparent; color: var(--text); border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: background-color 0.15s;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Переименовать</span>
        </button>
        <div class="dropdown-divider"></div>
        <button class="dropdown-item btn-delete" id="btnProjectDelete" style="display: flex; align-items: center; width: 100%; padding: 8px 12px; border: none; background: transparent; color: #ef4444; border-radius: 8px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: background-color 0.15s;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0; color: #ef4444;">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Удалить проект</span>
        </button>
    `;

    // Bind listeners
    document.getElementById('btnProjectAddSection').addEventListener('click', (e) => {
        e.stopPropagation();
        addSectionForCurrentProject();
    });

    document.getElementById('btnProjectToggleCompleted').addEventListener('click', async (e) => {
        e.stopPropagation();
        projectHeaderDropdown.style.display = 'none';
        try {
            await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                hideCompleted: !isCompletedHidden
            });
        } catch (err) {
            console.error("Ошибка при изменении видимости выполненных задач:", err);
        }
    });

    document.getElementById('btnProjectRename').addEventListener('click', (e) => {
        e.stopPropagation();
        projectHeaderDropdown.style.display = 'none';
        const itemContainer = document.querySelector(`.project-actions-btn[data-id="${projectId}"]`)?.closest('.project-item-container');
        if (itemContainer) {
            enableProjectInlineEdit(itemContainer, projectId, project.name);
        } else {
            const newName = prompt("Введите новое название проекта:", project.name);
            if (newName && newName.trim() && newName.trim() !== project.name) {
                updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                    name: newName.trim()
                }).then(() => {
                    const titleEl = document.querySelector('.list-title');
                    if (titleEl) titleEl.textContent = newName.trim();
                }).catch(err => {
                    console.error("Ошибка переименования проекта:", err);
                });
            }
        }
    });

    document.getElementById('btnProjectDelete').addEventListener('click', (e) => {
        e.stopPropagation();
        projectHeaderDropdown.style.display = 'none';
        showCustomConfirm(
            "Удалить проект?",
            `Вы действительно хотите удалить проект <strong>${escapeHtml(project.name)}</strong>? Все входящие в него задачи будут перемещены в корзину.`,
            "Удалить",
            () => {
                deleteProject(projectId);
            }
        );
    });
}

function renameSection(sectionId) {
    enableSectionInlineEdit(sectionId);
}

function enableSectionInlineEdit(sectionId) {
    const sectionEl = document.querySelector(`.project-section[data-section-id="${sectionId}"]`);
    if (!sectionEl) return;
    const titleSpan = sectionEl.querySelector('.section-title-text');
    if (!titleSpan) return;

    const section = sectionsList.find(s => s.id === sectionId);
    if (!section) return;

    const oldName = section.name;
    titleSpan.innerHTML = `<input type="text" class="inline-section-edit-input" value="${escapeHtml(oldName)}" maxlength="50" style="background: transparent; border: 1px solid var(--accent); outline: none; color: var(--text); font-family: inherit; font-size: 0.95rem; font-weight: 600; padding: 2px 4px; border-radius: 4px; width: 100%; box-sizing: border-box;">`;
    const input = titleSpan.querySelector('input');
    input.focus();
    input.select();

    let finished = false;

    async function commitSave() {
        if (finished) return;
        finished = true;
        const newVal = input.value.trim();

        if (newVal && newVal !== oldName) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'sections', sectionId), {
                    name: newVal
                });
            } catch (err) {
                console.error("Ошибка при переименовании раздела:", err);
                titleSpan.textContent = oldName;
            }
        } else {
            titleSpan.textContent = oldName;
        }
    }

    input.addEventListener('blur', commitSave);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            commitSave();
        } else if (e.key === 'Escape') {
            finished = true;
            titleSpan.textContent = oldName;
        }
    });
    input.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

async function deleteSection(sectionId) {
    if (!currentUid) return;
    showCustomConfirm(
        "Удалить раздел?",
        "Вы действительно хотите удалить этот раздел? Задачи этого раздела останутся в проекте, но потеряют с ним связь.",
        "Удалить",
        async () => {
            try {
                const tasksToUpdate = allTasks.filter(t => t.sectionId === sectionId && !t.deleted);
                const promises = tasksToUpdate.map(t => updateDoc(doc(db, 'users', currentUid, 'tasks', t.id), { sectionId: null }));
                await Promise.all(promises);
                
                await deleteDoc(doc(db, 'users', currentUid, 'sections', sectionId));
            } catch (err) {
                console.error("Не удалось удалить раздел:", err);
            }
        }
    );
}

async function moveSectionToProject(sectionId, targetProjectId) {
    if (!currentUid || !sectionId || !targetProjectId) return;
    try {
        await updateDoc(doc(db, 'users', currentUid, 'sections', sectionId), {
            projectId: targetProjectId
        });
        
        const tasksToMove = allTasks.filter(t => t.sectionId === sectionId && !t.deleted);
        const promises = tasksToMove.map(t => updateDoc(doc(db, 'users', currentUid, 'tasks', t.id), {
            projectId: targetProjectId
        }));
        await Promise.all(promises);
    } catch (err) {
        console.error("Не удалось перенести раздел:", err);
    }
}

// Ресайзер боковой панели
function initSidebarResizer() {
    const resizer = document.getElementById('sidebarResizer');
    const sidebar = document.getElementById('todoSidebar');
    if (!resizer || !sidebar) return;

    let isResizing = false;
    let currentWidth = 240;

    const savedWidth = localStorage.getItem('todo_sidebar_width');
    if (savedWidth) {
        currentWidth = parseInt(savedWidth, 10);
        document.documentElement.style.setProperty('--sidebar-width', currentWidth + 'px');
    }

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        resizer.classList.add('resizing');
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
            resizer.classList.remove('resizing');
            localStorage.setItem('todo_sidebar_width', currentWidth + 'px');
        }
    });
}

// Привязка событий Корзины и Инициализация ресайзера
const btnEmptyTrash = document.getElementById('btnEmptyTrash');
if (btnEmptyTrash) {
    btnEmptyTrash.addEventListener('click', emptyTrash);
}

initSidebarResizer();

// Функция инициализации Drag and Drop для сортировки задач
function initDragAndDrop() {
    let draggingElement = null;
    let placeholder = null;
    let draggingSection = null;
    let sectionPlaceholder = null;

    const containers = [activeTasksContainer, completedTasksContainer];

    containers.forEach(container => {
        if (!container) return;

        container.addEventListener('dragstart', (e) => {
            // Check if we are dragging a section first
            const sectionItem = e.target.closest('.project-section');
            if (sectionItem && sectionItem.getAttribute('draggable') === 'true') {
                draggingSection = sectionItem;
                draggingSection.classList.add('dragging');
                
                // Create section placeholder
                sectionPlaceholder = document.createElement('div');
                sectionPlaceholder.className = 'section-drag-placeholder';
                sectionPlaceholder.style.height = `${draggingSection.offsetHeight}px`;

                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggingSection.getAttribute('data-section-id'));

                setTimeout(() => {
                    if (draggingSection) {
                        draggingSection.style.display = 'none';
                    }
                }, 0);
                return;
            }

            // Otherwise, dragging a task item
            const taskItem = e.target.closest('.task-item');
            if (!taskItem || taskItem.classList.contains('editing') || currentRoute === 'trash') {
                e.preventDefault();
                return;
            }
            draggingElement = taskItem;
            taskItem.classList.add('dragging');
            container.classList.add('drag-active');
            
            // Create task placeholder
            placeholder = document.createElement('div');
            placeholder.className = 'drag-placeholder';
            placeholder.style.height = `${draggingElement.offsetHeight}px`;

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', taskItem.getAttribute('data-id'));

            setTimeout(() => {
                if (draggingElement) {
                    draggingElement.style.display = 'none';
                }
            }, 0);
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();

            // Handle Section dragging
            if (draggingSection && sectionPlaceholder) {
                const sections = [...container.querySelectorAll('.project-section:not(.dragging)')];
                const afterSection = sections.reduce((closest, child) => {
                    const box = child.getBoundingClientRect();
                    const offset = e.clientY - (box.top + box.height / 2);
                    if (offset < 0 && offset > closest.offset) {
                        return { offset: offset, element: child };
                    } else {
                        return closest;
                    }
                }, { offset: Number.NEGATIVE_INFINITY }).element;

                if (afterSection) {
                    container.insertBefore(sectionPlaceholder, afterSection);
                } else {
                    container.appendChild(sectionPlaceholder);
                }
                return;
            }

            // Handle Task dragging
            if (!draggingElement || !placeholder) return;

            let targetContainer = container;
            if (container === activeTasksContainer && currentRoute.startsWith('project/')) {
                // Determine which section or unsectioned container the cursor is hovering over
                targetContainer = e.target.closest('.unsectioned-tasks-container, .section-tasks-container');
                if (!targetContainer) {
                    const sectHeader = e.target.closest('.project-section-header');
                    if (sectHeader) {
                        targetContainer = sectHeader.nextElementSibling;
                    }
                }
                if (!targetContainer) {
                    // Fallback to closest sub-container by vertical coordinate
                    const subContainers = [...activeTasksContainer.querySelectorAll('.unsectioned-tasks-container, .section-tasks-container')];
                    if (subContainers.length > 0) {
                        let closestContainer = subContainers[0];
                        let minDistance = Number.MAX_VALUE;
                        subContainers.forEach(c => {
                            const rect = c.getBoundingClientRect();
                            const dist = Math.abs(e.clientY - (rect.top + rect.height / 2));
                            if (dist < minDistance) {
                                minDistance = dist;
                                closestContainer = c;
                            }
                        });
                        targetContainer = closestContainer;
                    }
                }
            }

            if (targetContainer) {
                const afterElement = getDragAfterElement(targetContainer, e.clientY);
                if (afterElement) {
                    targetContainer.insertBefore(placeholder, afterElement);
                } else {
                    targetContainer.appendChild(placeholder);
                }
            }
        });

        container.addEventListener('dragleave', (e) => {
            // No action needed
        });

        container.addEventListener('dragend', (e) => {
            if (draggingSection) {
                draggingSection.style.display = '';
                draggingSection.classList.remove('dragging');
                draggingSection.removeAttribute('draggable');
            }
            if (sectionPlaceholder && sectionPlaceholder.parentNode) {
                sectionPlaceholder.remove();
            }
            sectionPlaceholder = null;
            draggingSection = null;

            if (draggingElement) {
                draggingElement.style.display = '';
                draggingElement.classList.remove('dragging');
                draggingElement.removeAttribute('draggable');
            }
            if (placeholder && placeholder.parentNode) {
                placeholder.remove();
            }
            placeholder = null;
            container.classList.remove('drag-active');
            draggingElement = null;
        });

        container.addEventListener('drop', async (e) => {
            e.preventDefault();

            // Handle Section drop
            if (draggingSection && sectionPlaceholder) {
                let prevSect = null;
                let curr = sectionPlaceholder.previousElementSibling;
                while (curr) {
                    if (curr.classList.contains('project-section') && curr !== draggingSection) {
                        prevSect = curr;
                        break;
                    }
                    curr = curr.previousElementSibling;
                }

                let nextSect = null;
                curr = sectionPlaceholder.nextElementSibling;
                while (curr) {
                    if (curr.classList.contains('project-section') && curr !== draggingSection) {
                        nextSect = curr;
                        break;
                    }
                    curr = curr.nextElementSibling;
                }

                sectionPlaceholder.remove();
                sectionPlaceholder = null;

                if (draggingSection) {
                    draggingSection.style.display = '';
                    draggingSection.classList.remove('dragging');
                    draggingSection.removeAttribute('draggable');
                }

                const sectionId = draggingSection.getAttribute('data-section-id');
                const prevSectId = prevSect ? prevSect.getAttribute('data-section-id') : null;
                const nextSectId = nextSect ? nextSect.getAttribute('data-section-id') : null;

                const prevSectionData = sectionsList.find(s => s.id === prevSectId);
                const nextSectionData = sectionsList.find(s => s.id === nextSectId);

                let newOrder = 0;
                if (!prevSectionData && !nextSectionData) {
                    newOrder = 0;
                } else if (!prevSectionData) {
                    newOrder = (nextSectionData.order !== undefined ? nextSectionData.order : 0) - 1000;
                } else if (!nextSectionData) {
                    newOrder = (prevSectionData.order !== undefined ? prevSectionData.order : 0) + 1000;
                } else {
                    const prevOrder = prevSectionData.order !== undefined ? prevSectionData.order : 0;
                    const nextOrder = nextSectionData.order !== undefined ? nextSectionData.order : 0;
                    newOrder = (prevOrder + nextOrder) / 2;
                }

                if (currentUid && sectionId) {
                    try {
                        await updateDoc(doc(db, 'users', currentUid, 'sections', sectionId), {
                            order: newOrder
                        });
                    } catch (err) {
                        console.error("Ошибка при перемещении раздела:", err);
                    }
                }
                draggingSection = null;
                return;
            }

            // Handle Task drop
            if (!draggingElement || !placeholder) return;

            const parentContainer = placeholder.parentNode;
            const prevElement = placeholder.previousElementSibling;
            const nextElement = placeholder.nextElementSibling;

            placeholder.remove();
            placeholder = null;
            
            if (draggingElement) {
                draggingElement.style.display = '';
                draggingElement.classList.remove('dragging');
            }

            const taskId = draggingElement.getAttribute('data-id');
            const task = allTasks.find(t => t.id === taskId);
            if (!task) {
                draggingElement = null;
                return;
            }

            // Determine section ID based on parent container
            let targetSectionId = null;
            if (parentContainer && parentContainer.classList.contains('section-tasks-container')) {
                const sectEl = parentContainer.closest('.project-section');
                if (sectEl) {
                    targetSectionId = sectEl.getAttribute('data-section-id') || null;
                }
            }

            // 1. Determine targetParentId based on adjacent items inside the same parent container
            let targetParentId = null;
            if (prevElement) {
                const prevTaskId = prevElement.getAttribute('data-id');
                const prevTask = allTasks.find(t => t.id === prevTaskId);
                if (prevTask) {
                    if (prevElement.classList.contains('subtask')) {
                        targetParentId = prevTask.parentId || null;
                    } else {
                        if (nextElement && nextElement.classList.contains('subtask')) {
                            const nextTaskId = nextElement.getAttribute('data-id');
                            const nextTask = allTasks.find(t => t.id === nextTaskId);
                            if (nextTask && nextTask.parentId === prevTask.id) {
                                targetParentId = prevTask.id;
                            }
                        } else {
                            targetParentId = null;
                        }
                    }
                }
            } else {
                targetParentId = null;
            }

            const findSiblingTask = (startNode, direction, parentId) => {
                let curr = direction === 'up' ? startNode.previousElementSibling : startNode.nextElementSibling;
                while (curr) {
                    if (curr.classList.contains('task-item') && curr !== draggingElement) {
                        const id = curr.getAttribute('data-id');
                        const t = allTasks.find(item => item.id === id);
                        if (t) {
                            const pId = t.parentId || null;
                            if (pId === parentId) {
                                return t;
                            }
                        }
                    }
                    curr = direction === 'up' ? curr.previousElementSibling : curr.nextElementSibling;
                }
                return null;
            };

            const tempNode = document.createElement('div');
            if (nextElement) {
                parentContainer.insertBefore(tempNode, nextElement);
            } else {
                parentContainer.appendChild(tempNode);
            }

            const prevSibling = findSiblingTask(tempNode, 'up', targetParentId);
            const nextSibling = findSiblingTask(tempNode, 'down', targetParentId);
            tempNode.remove();

            let newOrder = 0;
            if (!prevSibling && !nextSibling) {
                newOrder = 0;
            } else if (!prevSibling) {
                newOrder = (nextSibling.order !== undefined ? nextSibling.order : 0) - 1000;
            } else if (!nextSibling) {
                newOrder = (prevSibling.order !== undefined ? prevSibling.order : 0) + 1000;
            } else {
                const prevOrder = prevSibling.order !== undefined ? prevSibling.order : 0;
                const nextOrder = nextSibling.order !== undefined ? nextSibling.order : 0;
                newOrder = (prevOrder + nextOrder) / 2;
            }

            const updateFields = {
                order: newOrder,
                parentId: targetParentId,
                sectionId: targetSectionId
            };

            if (targetParentId) {
                const parentTask = allTasks.find(t => t.id === targetParentId);
                if (parentTask) {
                    updateFields.projectId = parentTask.projectId || null;
                    updateFields.sectionId = parentTask.sectionId || null;
                }
            }

            if (currentUid && taskId) {
                try {
                    const promises = [];
                    promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), updateFields));

                    if (targetParentId) {
                        const subtasks = allTasks.filter(t => t.parentId === taskId && !t.deleted);
                        subtasks.forEach(sub => {
                            promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', sub.id), {
                                parentId: targetParentId,
                                projectId: updateFields.projectId || null,
                                sectionId: updateFields.sectionId || null
                            }));
                        });
                    }

                    await Promise.all(promises);
                } catch (err) {
                    console.error("Ошибка при перетаскивании и переупорядочивании задач:", err);
                }
            }
            draggingElement = null;
        });
    });
}

function getDragAfterElement(container, y) {
    const dragElements = [...container.querySelectorAll('.task-item:not(.dragging)')];

    return dragElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - (box.top + box.height / 2);
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

initDragAndDrop();

// Отображение контекстного меню проекта
function showProjectContextMenu(e, projectId, projectName, itemContainer) {
    if (activeContextMenu) activeContextMenu.remove();

    const project = projectsList.find(p => p.id === projectId);
    const isCountHidden = project && project.hideCount === true;

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.innerHTML = `
        <div class="ctx-item" id="ctx-change-icon-project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            <span>Сменить иконку</span>
        </div>
        <div class="ctx-item" id="ctx-rename-project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Переименовать</span>
        </div>
        <div class="ctx-item" id="ctx-toggle-count-project">
            ${isCountHidden ? `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>Показать количество</span>
            ` : `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
                <span>Скрыть количество</span>
            `}
        </div>
        <div class="ctx-item danger" id="ctx-delete-project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>Удалить</span>
        </div>
    `;

    document.body.appendChild(menu);
    activeContextMenu = menu;

    // Позиционирование меню. Если событие contextmenu (ПКМ), позиционируем на месте курсора
    let x = 0;
    let y = 0;

    if (e.clientX && e.clientY && e.type === 'contextmenu') {
        x = e.clientX;
        y = e.clientY + window.scrollY;

        // Предотвращение выхода за границы окна
        if (x + 150 > window.innerWidth) {
            x = window.innerWidth - 160;
        }
        if (x < 10) x = 10;
    } else {
        // Позиционирование относительно кнопки трех точек
        const rect = e.currentTarget.getBoundingClientRect();
        x = rect.left - 130;
        y = rect.bottom + window.scrollY + 4;

        if (x + 150 > window.innerWidth) {
            x = window.innerWidth - 160;
        }
        if (x < 10) x = 10;
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Обработчик переключения видимости счетчика проекта
    menu.querySelector('#ctx-toggle-count-project').addEventListener('click', async (evt) => {
        evt.stopPropagation();
        menu.remove();
        activeContextMenu = null;
        try {
            await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                hideCount: !isCountHidden
            });
        } catch (err) {
            console.error("Ошибка при переключении видимости счетчика проекта:", err);
        }
    });

    // Обработчик удаления проекта
    menu.querySelector('#ctx-delete-project').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        activeContextMenu = null;
        showCustomConfirm(
            "Удалить проект?",
            `Вы действительно хотите удалить проект <strong>${escapeHtml(projectName)}</strong>? Все входящие в него задачи будут перемещены в корзину.`,
            "Удалить",
            () => {
                deleteProject(projectId);
            }
        );
    });

    // Обработчик переименования проекта
    menu.querySelector('#ctx-rename-project').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        activeContextMenu = null;
        enableProjectInlineEdit(itemContainer, projectId, projectName);
    });

    // Обработчик изменения иконки проекта
    menu.querySelector('#ctx-change-icon-project').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        activeContextMenu = null;
        showProjectIconModal(projectId, projectName);
    });
}

// Модальное окно для выбора и загрузки кастомной иконки проекта
function showProjectIconModal(projectId, projectName) {
    const project = projectsList.find(p => p.id === projectId);
    const currentIconUrl = project ? project.iconUrl : null;

    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';

    overlay.innerHTML = `
        <div class="confirm-box" style="width: 360px; padding: 24px;">
            <div class="confirm-title" style="font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Иконка проекта
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
                            <line x1="4" y1="9" x2="20" y2="9"></line>
                            <line x1="4" y1="15" x2="20" y2="15"></line>
                            <line x1="10" y1="3" x2="8" y2="21"></line>
                            <line x1="16" y1="3" x2="14" y2="21"></line>
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
                await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                    iconUrl: null
                });
            } catch (err) {
                console.error("Error removing icon:", err);
                alert("Не удалось удалить иконку.");
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
                            await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                                iconUrl: url
                            });
                            
                            // Close modal successfully
                            overlay.remove();
                            document.removeEventListener('paste', handlePaste);
                        } else {
                            throw new Error('Upload failed');
                        }
                    } catch (err) {
                        console.error('Error uploading project icon:', err);
                        alert('Не удалось загрузить иконку. Попробуйте еще раз.');
                        
                        // Reset Dropzone UI
                        dropzone.style.pointerEvents = 'auto';
                        selectFileBtn.style.pointerEvents = 'auto';
                        selectFileBtn.innerText = 'Выбрать файл...';
                        if (deleteIconBtn) deleteIconBtn.style.display = 'block';
                        
                        dropzone.querySelector('.dropzone-preview').innerHTML = currentIconUrl ? 
                            `<img src="${currentIconUrl}" style="width: 48px; height: 48px; object-fit: contain; border-radius: 8px;">` :
                            `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;">
                                <line x1="4" y1="9" x2="20" y2="9"></line>
                                <line x1="4" y1="15" x2="20" y2="15"></line>
                                <line x1="10" y1="3" x2="8" y2="21"></line>
                                <line x1="16" y1="3" x2="14" y2="21"></line>
                            </svg>`;
                        dropzone.querySelector('.dropzone-text').innerText = 'Кликните для выбора файла или перетащите его сюда';
                    }
                }, 'image/png');
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
}

// Inline-редактирование имени проекта в боковой панели
function enableProjectInlineEdit(itemContainer, projectId, oldName) {
    const labelSpan = itemContainer.querySelector('.menu-item span.menu-item-left span:not(.menu-icon)');
    if (!labelSpan) return;

    // Сохраняем имя во избежание сбросов
    const oldVal = oldName;

    labelSpan.innerHTML = `<input type="text" class="inline-project-edit-input" value="${escapeHtml(oldVal)}" maxlength="50">`;
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
                await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                    name: newVal
                });

                // Динамически меняем заголовок списка, если он открыт сейчас
                if (currentRoute === `project/${projectId}`) {
                    const titleEl = document.querySelector('.list-title');
                    if (titleEl) titleEl.textContent = newVal;
                }
            } catch (err) {
                console.error("Ошибка при изменении названия проекта:", err);
                labelSpan.textContent = oldVal;
            }
        } else {
            labelSpan.textContent = oldVal;
        }
    }

    input.addEventListener('blur', commitSave);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            commitSave();
        } else if (e.key === 'Escape') {
            finished = true;
            labelSpan.textContent = oldVal;
        }
    });
}

// Инициализация Drag and Drop для проектов в боковой панели
function initProjectsDragAndDrop() {
    let draggingProject = null;
    let placeholder = null;

    if (!projectsListContainer) return;

    projectsListContainer.addEventListener('dragstart', (e) => {
        const projectItem = e.target.closest('.project-item-container');
        if (!projectItem) {
            e.preventDefault();
            return;
        }
        draggingProject = projectItem;
        projectItem.classList.add('dragging');
        
        // Создаем плейсхолдер
        placeholder = document.createElement('div');
        placeholder.className = 'project-drag-placeholder';
        placeholder.style.height = `${draggingProject.offsetHeight}px`;

        e.dataTransfer.effectAllowed = 'move';
        const actionsBtn = projectItem.querySelector('.project-actions-btn');
        if (actionsBtn) {
            e.dataTransfer.setData('text/plain', actionsBtn.getAttribute('data-id'));
        }

        // Скрываем исходный элемент, чтобы он не дублировался в списке
        setTimeout(() => {
            if (draggingProject) {
                draggingProject.style.display = 'none';
            }
        }, 0);
    });

    projectsListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggingProject || !placeholder) return;

        const afterElement = getDragAfterProject(projectsListContainer, e.clientY);
        if (afterElement) {
            projectsListContainer.insertBefore(placeholder, afterElement);
        } else {
            projectsListContainer.appendChild(placeholder);
        }
    });

    projectsListContainer.addEventListener('dragleave', (e) => {
        // Больше не нужно сбрасывать классы
    });

    projectsListContainer.addEventListener('dragend', (e) => {
        if (draggingProject) {
            draggingProject.style.display = '';
            draggingProject.classList.remove('dragging');
        }
        if (placeholder && placeholder.parentNode) {
            placeholder.remove();
        }
        placeholder = null;
        draggingProject = null;
    });

    projectsListContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggingProject || !placeholder) return;

        const nextElement = placeholder.nextElementSibling;
        placeholder.remove();
        placeholder = null;
        
        if (draggingProject) {
            draggingProject.style.display = '';
            draggingProject.classList.remove('dragging');
        }

        const actionsBtn = draggingProject.querySelector('.project-actions-btn');
        if (!actionsBtn) return;
        const projectId = actionsBtn.getAttribute('data-id');

        const projectItems = Array.from(projectsListContainer.querySelectorAll('.project-item-container'));
        const draggingIndex = projectItems.indexOf(draggingProject);
        
        let targetIndex;
        if (!nextElement) {
            targetIndex = projectItems.length - 1;
        } else {
            let nextIndex = projectItems.indexOf(nextElement);
            if (draggingIndex < nextIndex) {
                targetIndex = nextIndex - 1;
            } else {
                targetIndex = nextIndex;
            }
        }

        // Копируем текущий список для расчета order
        let currentProjects = [...projectsList];

        const movingProj = currentProjects.find(p => p.id === projectId);
        if (!movingProj) return;

        const movingProjIndex = currentProjects.indexOf(movingProj);
        currentProjects.splice(movingProjIndex, 1);
        currentProjects.splice(targetIndex, 0, movingProj);

        // Вычисляем новый order
        let newOrder = 0;
        if (currentProjects.length === 1) {
            newOrder = 0;
        } else if (targetIndex === 0) {
            const nextProj = currentProjects[1];
            const nextOrder = nextProj.order !== undefined ? nextProj.order : 0;
            newOrder = nextOrder - 1000;
        } else if (targetIndex === currentProjects.length - 1) {
            const prevProj = currentProjects[currentProjects.length - 2];
            const prevOrder = prevProj.order !== undefined ? prevProj.order : 0;
            newOrder = prevOrder + 1000;
        } else {
            const prevProj = currentProjects[targetIndex - 1];
            const nextProj = currentProjects[targetIndex + 1];
            const prevOrder = prevProj.order !== undefined ? prevProj.order : 0;
            const nextOrder = nextProj.order !== undefined ? nextProj.order : 0;
            newOrder = (prevOrder + nextOrder) / 2;
        }

        // Обновляем в Firebase
        if (currentUid && projectId) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                    order: newOrder
                });
            } catch (err) {
                console.error("Ошибка обновления порядка проектов:", err);
            }
        }
        draggingProject = null;
    });
}

function getDragAfterProject(container, y) {
    const dragElements = [...container.querySelectorAll('.project-item-container:not(.dragging)')];

    return dragElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - (box.top + box.height / 2);
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

initProjectsDragAndDrop();

// Инициализация Long Press Touch перетаскивания для мобильных
function initTouchDragAndDrop() {
    let touchStartTimer = null;
    let touchDraggingElement = null;
    let touchDragType = null; // 'task', 'section' или 'project'
    let startY = 0;
    let startX = 0;
    let placeholder = null;

    const removePassiveListeners = () => {
        window.removeEventListener('touchmove', handleTouchMovePassive);
        window.removeEventListener('touchend', handleTouchEndPassive);
        window.removeEventListener('touchcancel', handleTouchEndPassive);
    };

    const handleTouchMovePassive = (e) => {
        const touch = e.touches[0];
        if (Math.abs(touch.clientY - startY) > 10 || Math.abs(touch.clientX - startX) > 10) {
            if (touchStartTimer) {
                clearTimeout(touchStartTimer);
                touchStartTimer = null;
            }
            removePassiveListeners();
        }
    };

    const handleTouchEndPassive = () => {
        if (touchStartTimer) {
            clearTimeout(touchStartTimer);
            touchStartTimer = null;
        }
        removePassiveListeners();
    };

    const resetTouchState = () => {
        if (touchStartTimer) {
            clearTimeout(touchStartTimer);
            touchStartTimer = null;
        }
        removePassiveListeners();
        window.removeEventListener('touchmove', handleTouchMoveActive);
        window.removeEventListener('touchend', handleTouchEndActive);
        window.removeEventListener('touchcancel', resetTouchState);

        if (touchDraggingElement) {
            touchDraggingElement.classList.remove('dragging');
            touchDraggingElement.removeAttribute('draggable');
            if (touchDraggingElement._preventSelection) {
                window.removeEventListener('selectstart', touchDraggingElement._preventSelection, { capture: true });
                window.removeEventListener('contextmenu', touchDraggingElement._preventSelection, { capture: true });
                delete touchDraggingElement._preventSelection;
            }
        }
        if (placeholder && placeholder.parentNode) {
            placeholder.remove();
        }
        placeholder = null;
        touchDraggingElement = null;
        touchDragType = null;
    };

    const handleTouchStart = (e, type) => {
        if (e.touches.length > 1) return;
        const touch = e.touches[0];
        startY = touch.clientY;
        startX = touch.clientX;

        let targetEl = null;
        if (type === 'task') {
            targetEl = e.target.closest('.task-item');
        } else if (type === 'project') {
            targetEl = e.target.closest('.project-item-container');
        } else if (type === 'section') {
            const header = e.target.closest('.project-section-header');
            if (header) {
                targetEl = header.closest('.project-section');
            }
        }

        if (!targetEl || targetEl.classList.contains('editing') || currentRoute === 'trash') return;

        // Отключаем выделение текста при длительном тапе
        const preventSelection = (evt) => {
            evt.preventDefault();
        };

        // Добавляем временные пассивные слушатели для отслеживания сдвига
        window.addEventListener('touchmove', handleTouchMovePassive, { passive: true });
        window.addEventListener('touchend', handleTouchEndPassive, { passive: true });
        window.addEventListener('touchcancel', handleTouchEndPassive, { passive: true });

        // Таймер для Long Press (300 мс для более быстрого отклика)
        touchStartTimer = setTimeout(() => {
            removePassiveListeners();

            touchDraggingElement = targetEl;
            touchDragType = type;
            touchDraggingElement.classList.add('dragging');
            touchDraggingElement.setAttribute('draggable', 'true');

            // Добавляем временный слушатель для отмены выделения текста и контекстного меню
            window.addEventListener('selectstart', preventSelection, { capture: true });
            window.addEventListener('contextmenu', preventSelection, { capture: true });
            touchDraggingElement._preventSelection = preventSelection;

            // Регистрируем активные слушатели для самого процесса перетаскивания
            window.addEventListener('touchmove', handleTouchMoveActive, { passive: false });
            window.addEventListener('touchend', handleTouchEndActive, { passive: true });
            window.addEventListener('touchcancel', resetTouchState, { passive: true });

            // Легкая вибрация, если поддерживается устройством
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 300);
    };

    const handleTouchMoveActive = (e) => {
        if (!touchDraggingElement) return;

        // Предотвращаем скролл экрана во время переноса
        e.preventDefault();

        const touch = e.touches[0];
        let container = touchDraggingElement.parentNode;

        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 
                touchDragType === 'task' ? 'drag-placeholder' : 
                touchDragType === 'section' ? 'section-drag-placeholder' : 
                'project-drag-placeholder';
            placeholder.style.height = `${touchDraggingElement.offsetHeight}px`;
        }

        if (touchDragType === 'task') {
            const origDisplay = touchDraggingElement.style.display;
            touchDraggingElement.style.display = 'none';
            let origPlacDisplay = '';
            if (placeholder) {
                origPlacDisplay = placeholder.style.display;
                placeholder.style.display = 'none';
            }
            
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            
            touchDraggingElement.style.display = origDisplay;
            if (placeholder) {
                placeholder.style.display = origPlacDisplay;
            }

            if (targetEl) {
                const subContainer = targetEl.closest('.unsectioned-tasks-container, .section-tasks-container');
                if (subContainer) {
                    container = subContainer;
                } else {
                    const sectHeader = targetEl.closest('.project-section-header');
                    if (sectHeader && sectHeader.nextElementSibling) {
                        container = sectHeader.nextElementSibling;
                    }
                }
            }

            const afterElement = getDragAfterElement(container, touch.clientY);
            if (afterElement) {
                container.insertBefore(placeholder, afterElement);
            } else {
                container.appendChild(placeholder);
            }
        } else if (touchDragType === 'section') {
            const afterElement = getDragAfterSection(container, touch.clientY);
            if (afterElement) {
                container.insertBefore(placeholder, afterElement);
            } else {
                container.appendChild(placeholder);
            }
        } else {
            const afterElement = getDragAfterProject(container, touch.clientY);
            if (afterElement) {
                container.insertBefore(placeholder, afterElement);
            } else {
                container.appendChild(placeholder);
            }
        }
    };

    const getDragAfterSection = (container, y) => {
        const dragElements = [...container.querySelectorAll('.project-section:not(.dragging)')];

        return dragElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - (box.top + box.height / 2);
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    };

    const handleTouchEndActive = async (e) => {
        if (touchStartTimer) {
            clearTimeout(touchStartTimer);
            touchStartTimer = null;
        }

        if (!touchDraggingElement || !placeholder) {
            resetTouchState();
            return;
        }

        const parentContainer = placeholder.parentNode;
        const prevElement = placeholder.previousElementSibling;
        const nextElement = placeholder.nextElementSibling;
        const draggingEl = touchDraggingElement;
        const dragType = touchDragType;

        resetTouchState();

        if (dragType === 'task') {
            const taskId = draggingEl.getAttribute('data-id');
            const task = allTasks.find(t => t.id === taskId);
            if (!task) return;

            // Determine section ID based on parent container
            let targetSectionId = null;
            if (parentContainer && parentContainer.classList.contains('section-tasks-container')) {
                const sectEl = parentContainer.closest('.project-section');
                if (sectEl) {
                    targetSectionId = sectEl.getAttribute('data-section-id') || null;
                }
            }

            // Determine targetParentId based on adjacent items inside the same parent container
            let targetParentId = null;
            if (prevElement) {
                const prevTaskId = prevElement.getAttribute('data-id');
                const prevTask = allTasks.find(t => t.id === prevTaskId);
                if (prevTask) {
                    if (prevElement.classList.contains('subtask')) {
                        targetParentId = prevTask.parentId || null;
                    } else {
                        if (nextElement && nextElement.classList.contains('subtask')) {
                            const nextTaskId = nextElement.getAttribute('data-id');
                            const nextTask = allTasks.find(t => t.id === nextTaskId);
                            if (nextTask && nextTask.parentId === prevTask.id) {
                                targetParentId = prevTask.id;
                            }
                        } else {
                            targetParentId = null;
                        }
                    }
                }
            } else {
                targetParentId = null;
            }

            const findSiblingTask = (startNode, direction, parentId) => {
                let curr = direction === 'up' ? startNode.previousElementSibling : startNode.nextElementSibling;
                while (curr) {
                    if (curr.classList.contains('task-item') && curr !== draggingEl) {
                        const id = curr.getAttribute('data-id');
                        const t = allTasks.find(item => item.id === id);
                        if (t) {
                            const pId = t.parentId || null;
                            if (pId === parentId) {
                                    return t;
                            }
                        }
                    }
                    curr = direction === 'up' ? curr.previousElementSibling : curr.nextElementSibling;
                }
                return null;
            };

            const tempNode = document.createElement('div');
            if (nextElement) {
                parentContainer.insertBefore(tempNode, nextElement);
            } else {
                parentContainer.appendChild(tempNode);
            }

            const prevSibling = findSiblingTask(tempNode, 'up', targetParentId);
            const nextSibling = findSiblingTask(tempNode, 'down', targetParentId);
            tempNode.remove();

            let newOrder = 0;
            if (!prevSibling && !nextSibling) {
                newOrder = 0;
            } else if (!prevSibling) {
                newOrder = (nextSibling.order !== undefined ? nextSibling.order : 0) - 1000;
            } else if (!nextSibling) {
                newOrder = (prevSibling.order !== undefined ? prevSibling.order : 0) + 1000;
            } else {
                const prevOrder = prevSibling.order !== undefined ? prevSibling.order : 0;
                const nextOrder = nextSibling.order !== undefined ? nextSibling.order : 0;
                newOrder = (prevOrder + nextOrder) / 2;
            }

            const updateFields = {
                order: newOrder,
                parentId: targetParentId,
                sectionId: targetSectionId
            };

            if (targetParentId) {
                const parentTask = allTasks.find(t => t.id === targetParentId);
                if (parentTask) {
                    updateFields.projectId = parentTask.projectId || null;
                    updateFields.sectionId = parentTask.sectionId || null;
                }
            }

            if (currentUid && taskId) {
                try {
                    const promises = [];
                    promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), updateFields));

                    if (targetParentId) {
                        const subtasks = allTasks.filter(t => t.parentId === taskId && !t.deleted);
                        subtasks.forEach(sub => {
                            promises.push(updateDoc(doc(db, 'users', currentUid, 'tasks', sub.id), {
                                parentId: targetParentId,
                                projectId: updateFields.projectId || null,
                                sectionId: updateFields.sectionId || null
                            }));
                        });
                    }

                    await Promise.all(promises);
                } catch (err) {
                    console.error("Ошибка при touch-перетаскивании задач:", err);
                }
            }
        } else if (dragType === 'section') {
            const sectionId = draggingEl.getAttribute('data-section-id');
            const sectionItems = Array.from(activeTasksContainer.querySelectorAll('.project-section'));
            const draggingIndex = sectionItems.indexOf(draggingEl);
            
            let targetIndex;
            if (!nextElement) {
                targetIndex = sectionItems.length - 1;
            } else {
                let nextIndex = sectionItems.indexOf(nextElement);
                if (draggingIndex < nextIndex) {
                    targetIndex = nextIndex - 1;
                } else {
                    targetIndex = nextIndex;
                }
            }

            const projectId = currentRoute.split('/')[1];
            const currentSections = sectionsList.filter(s => s.projectId === projectId);
            
            currentSections.sort((a, b) => (a.order !== undefined ? a.order : 0) - (b.order !== undefined ? b.order : 0));
            
            const movingSect = currentSections.find(s => s.id === sectionId);
            if (!movingSect) return;

            const movingSectIndex = currentSections.indexOf(movingSect);
            currentSections.splice(movingSectIndex, 1);
            currentSections.splice(targetIndex, 0, movingSect);

            let newOrder = 0;
            if (currentSections.length === 1) {
                newOrder = 0;
            } else if (targetIndex === 0) {
                const nextSect = currentSections[1];
                const nextOrder = nextSect.order !== undefined ? nextSect.order : 0;
                newOrder = nextOrder - 1000;
            } else if (targetIndex === currentSections.length - 1) {
                const prevSect = currentSections[currentSections.length - 2];
                const prevOrder = prevSect.order !== undefined ? prevSect.order : 0;
                newOrder = prevOrder + 1000;
            } else {
                const prevSect = currentSections[targetIndex - 1];
                const nextSect = currentSections[targetIndex + 1];
                const prevOrder = prevSect.order !== undefined ? prevSect.order : 0;
                const nextOrder = nextSect.order !== undefined ? nextSect.order : 0;
                newOrder = (prevOrder + nextOrder) / 2;
            }

            if (currentUid && sectionId) {
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'sections', sectionId), {
                        order: newOrder
                    });
                } catch (err) {
                    console.error("Ошибка при touch-обновлении порядка разделов:", err);
                }
            }
        } else if (dragType === 'project') {
            const actionsBtn = draggingEl.querySelector('.project-actions-btn');
            if (!actionsBtn) return;
            const projectId = actionsBtn.getAttribute('data-id');

            const projectItems = Array.from(projectsListContainer.querySelectorAll('.project-item-container'));
            const draggingIndex = projectItems.indexOf(draggingEl);
            
            let targetIndex;
            if (!nextElement) {
                targetIndex = projectItems.length - 1;
            } else {
                let nextIndex = projectItems.indexOf(nextElement);
                if (draggingIndex < nextIndex) {
                    targetIndex = nextIndex - 1;
                } else {
                    targetIndex = nextIndex;
                }
            }

            let currentProjects = [...projectsList];
            const movingProj = currentProjects.find(p => p.id === projectId);
            if (!movingProj) return;

            const movingProjIndex = currentProjects.indexOf(movingProj);
            currentProjects.splice(movingProjIndex, 1);
            currentProjects.splice(targetIndex, 0, movingProj);

            let newOrder = 0;
            if (currentProjects.length === 1) {
                newOrder = 0;
            } else if (targetIndex === 0) {
                const nextProj = currentProjects[1];
                const nextOrder = nextProj.order !== undefined ? nextProj.order : 0;
                newOrder = nextOrder - 1000;
            } else if (targetIndex === currentProjects.length - 1) {
                const prevProj = currentProjects[currentProjects.length - 2];
                const prevOrder = prevProj.order !== undefined ? prevProj.order : 0;
                newOrder = prevOrder + 1000;
            } else {
                const prevProj = currentProjects[targetIndex - 1];
                const nextProj = currentProjects[targetIndex + 1];
                const prevOrder = prevProj.order !== undefined ? prevProj.order : 0;
                const nextOrder = nextProj.order !== undefined ? nextProj.order : 0;
                newOrder = (prevOrder + nextOrder) / 2;
            }

            if (currentUid && projectId) {
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                        order: newOrder
                    });
                } catch (err) {
                    console.error("Ошибка при touch-обновлении порядка проектов:", err);
                }
            }
        }
    };

    // Слушатели событий на контейнеры для тасков (только touchstart, который passive по умолчанию)
    [activeTasksContainer, completedTasksContainer].forEach(container => {
        if (!container) return;
        container.addEventListener('touchstart', (e) => {
            if (e.target.closest('.project-section-header')) {
                handleTouchStart(e, 'section');
            } else {
                handleTouchStart(e, 'task');
            }
        }, { passive: true });
    });

    // Слушатели для проектов в боковой панели (только touchstart)
    if (projectsListContainer) {
        projectsListContainer.addEventListener('touchstart', (e) => handleTouchStart(e, 'project'), { passive: true });
    }
}

initTouchDragAndDrop();

// Обработчики кликов по элементам меню для закрытия сайдбара на телефонах (даже если хэш не изменился)
if (todoSidebar) {
    todoSidebar.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.menu-item') || e.target.closest('a');
        if (menuItem) {
            if (todoSidebar.classList.contains('mobile-open')) {
                todoSidebar.classList.remove('mobile-open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
                if (typeof updateMobileBottomNavActiveState === 'function') {
                    updateMobileBottomNavActiveState();
                }
                if (typeof updateMobileFabVisibility === 'function') {
                    updateMobileFabVisibility();
                }
            }
        }
    });
}

// Обработчик для нижнего меню на мобильных: закрытие сайдбара при нажатии на активную вкладку
const mobileBottomNavEl = document.getElementById('mobileBottomNav');
if (mobileBottomNavEl) {
    mobileBottomNavEl.addEventListener('click', (e) => {
        const navItem = e.target.closest('.mobile-nav-item');
        if (navItem && navItem.id !== 'mobileNavMore') {
            if (todoSidebar && todoSidebar.classList.contains('mobile-open')) {
                todoSidebar.classList.remove('mobile-open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
                if (typeof updateMobileBottomNavActiveState === 'function') {
                    updateMobileBottomNavActiveState();
                }
                if (typeof updateMobileFabVisibility === 'function') {
                    updateMobileFabVisibility();
                }
            }
        }
    });
}

// --- ЛОГИКА ДЛЯ МОБИЛЬНОГО БОТОМ-ШИТа И FAB ---
function adjustAddTaskFormLocation() {
    const addTaskForm = document.querySelector('.add-task-form');
    const activeTasksContainer = document.getElementById('activeTasksContainer');
    if (activeTasksContainer && addTaskForm && addTaskForm.parentNode !== activeTasksContainer.parentNode) {
        activeTasksContainer.parentNode.insertBefore(addTaskForm, activeTasksContainer);
    }
}

adjustAddTaskFormLocation();
window.addEventListener('resize', adjustAddTaskFormLocation);

// === ЛОГИКА СЕРИИ ДНЕЙ (STREAK WIDGET) ===

function calculateProjectStreak(projectId) {
    const todayStr = getLocalDateString(new Date());
    const yesterdayStr = getYesterdayDateString(new Date());
    const currentWeekStr = getISOWeekString(new Date());

    // Выбираем все выполненные задачи проекта (включая удаленные, если у них есть completedDate)
    const projectCompletedTasks = allTasks.filter(t => 
        t.projectId === projectId && 
        t.completed && 
        t.completedDate
    );

    // Извлекаем уникальные даты выполнения, сортируем по возрастанию
    const dates = [...new Set(projectCompletedTasks.map(t => t.completedDate))].sort();

    let streakCount = 0;
    let lastStreakDate = null;

    if (dates.length > 0) {
        const hasToday = dates.includes(todayStr);
        const hasYesterday = dates.includes(yesterdayStr);

        if (hasToday || hasYesterday) {
            lastStreakDate = hasToday ? todayStr : yesterdayStr;
            streakCount = 1;

            // Считаем назад от lastStreakDate
            let checkDate = new Date(lastStreakDate);
            while (true) {
                checkDate.setDate(checkDate.getDate() - 1);
                const checkDateStr = getLocalDateString(checkDate);
                if (dates.includes(checkDateStr)) {
                    streakCount++;
                } else {
                    break;
                }
            }
        }
    }

    // Рассчитываем дни недели для текущей недели (1 = Пн, ..., 7 = Вс)
    const completedDaysThisWeek = [];
    const today = new Date();
    const dayOfWeek = getDayOfWeek(today);

    // Понедельник текущей недели
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek - 1));

    for (let i = 0; i < 7; i++) {
        const weekDay = new Date(monday);
        weekDay.setDate(monday.getDate() + i);
        const weekDayStr = getLocalDateString(weekDay);

        if (dates.includes(weekDayStr)) {
            completedDaysThisWeek.push(i + 1);
        }
    }

    const completedToday = dates.includes(todayStr);

    return {
        streakCount,
        lastStreakDate: lastStreakDate || "",
        completedDaysThisWeek,
        completedToday,
        streakWeek: currentWeekStr
    };
}

async function syncProjectStreak(projectId) {
    if (!currentUid || !projectId) return;
    const project = projectsList.find(p => p.id === projectId);
    if (!project) return;

    const calc = calculateProjectStreak(projectId);

    // Сравниваем с текущими данными проекта, чтобы избежать бесконечных записей
    if (project.streakCount !== calc.streakCount ||
        project.lastStreakDate !== calc.lastStreakDate ||
        project.streakWeek !== calc.streakWeek ||
        project.completedToday !== calc.completedToday ||
        JSON.stringify(project.completedDaysThisWeek || []) !== JSON.stringify(calc.completedDaysThisWeek)) {
        
        try {
            await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                streakCount: calc.streakCount,
                lastStreakDate: calc.lastStreakDate,
                streakWeek: calc.streakWeek,
                completedToday: calc.completedToday,
                completedDaysThisWeek: calc.completedDaysThisWeek
            });
        } catch (err) {
            console.error("Ошибка при синхронизации серии проекта:", err);
        }
    }
}

let currentAnimateRequest = null;
function animateStreakCounter(target) {
    const el = document.getElementById('streakNumber');
    if (!el) return;

    if (currentAnimateRequest) {
        cancelAnimationFrame(currentAnimateRequest);
    }

    const currentVal = parseInt(el.textContent, 10) || 0;
    if (currentVal === target) {
        el.textContent = target;
        return;
    }

    const duration = 800;
    const startTime = performance.now();

    function animate(time) {
        const progress = Math.min((time - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(currentVal + eased * (target - currentVal));
        el.textContent = current;

        if (progress < 1) {
            currentAnimateRequest = requestAnimationFrame(animate);
        } else {
            el.textContent = target;
        }
    }
    currentAnimateRequest = requestAnimationFrame(animate);
}

function updateStreakWidget(project) {
    const widget = document.getElementById('streakWidget');
    const divider = document.getElementById('streakDivider');
    if (!widget) return;

    if (!project) {
        widget.style.display = 'none';
        if (divider) divider.style.display = 'none';
        return;
    }

    widget.style.display = 'block';
    if (divider) divider.style.display = 'block';

    const titleEl = document.getElementById('streakTitle');
    if (titleEl) {
        if (project && project.name) {
            titleEl.innerHTML = `Серия дней <span style="font-weight: 400; opacity: 0.8; font-size: 0.85em;">(${escapeHtml(project.name)})</span>`;
        } else {
            titleEl.textContent = 'Серия дней';
        }
    }

    const streakCount = project.streakCount || 0;
    animateStreakCounter(streakCount);

    const completedDays = project.completedDaysThisWeek || [];

    const daysGrid = document.getElementById('streakDaysGrid');
    if (daysGrid) {
        const daysLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        daysGrid.innerHTML = daysLabels.map((label, index) => {
            const dayNum = index + 1;
            const isDone = completedDays.includes(dayNum);
            return `
                <div class="streak-day">
                    <span>${label}</span>
                    <div class="streak-circle ${isDone ? 'done' : 'empty'}"></div>
                </div>
            `;
        }).join('');
    }
}

