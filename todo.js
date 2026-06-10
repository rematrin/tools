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
let activeContextMenu = null;

let projectsList = [];
let unsubscribeProjects = null;

const btnAddProject = document.getElementById('btnAddProject');
const projectAddForm = document.getElementById('projectAddForm');
const projectNewNameInput = document.getElementById('projectNewNameInput');
const btnCancelProject = document.getElementById('btnCancelProject');
const btnSaveProject = document.getElementById('btnSaveProject');
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
    return null;
};

let selectedDueDate = getDefaultDueDate(); // Хранит выбранную дату в формате YYYY-MM-DD
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

const contentSidebarToggle = document.getElementById('contentSidebarToggle');
const sidebarCloseToggle = document.getElementById('sidebarCloseToggle');
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
            setDueDate(getDefaultDueDate()); // сбрасываем выбранную дату к дефолтной для текущего раздела
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

    // 4. Закрытие контекстного меню проектов при клике вне
    if (activeContextMenu && !e.target.closest('.project-actions-btn') && !e.target.closest('.custom-context-menu')) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }

    // 5. Закрытие меню пользователя при клике вне
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
    today.setHours(0, 0, 0, 0);
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
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal(sidebarUser);
            }
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
window.addEventListener('resize', applySidebarCollapsedState);

// Управление сайдбаром (мобильное и десктопное)
if (contentSidebarToggle && todoSidebar && sidebarOverlay) {
    const toggleSidebar = () => {
        if (window.innerWidth <= 768) {
            todoSidebar.classList.toggle('mobile-open');
            sidebarOverlay.classList.toggle('active');
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
    const menuTrash = document.getElementById('menuTrash');

    if (menuInbox) {
        if (currentRoute === 'inbox') menuInbox.classList.add('active');
        else menuInbox.classList.remove('active');
    }
    if (menuToday) {
        if (currentRoute === 'today') menuToday.classList.add('active');
        else menuToday.classList.remove('active');
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
    } else if (currentRoute === 'trash') {
        if (titleEl) titleEl.textContent = 'Корзина';
    } else if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        const proj = projectsList.find(p => p.id === projectId);
        if (titleEl) titleEl.textContent = proj ? proj.name : 'Проект';
    } else {
        if (titleEl) titleEl.textContent = 'Входящие';
    }

    // Закрываем боковое меню на мобильных после клика
    if (todoSidebar && todoSidebar.classList.contains('mobile-open')) {
        todoSidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    setDueDate(getDefaultDueDate());
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
        startProjectsForUser(currentUid);
        handleRoute();
    } else {
        // Скрываем интерфейс
        if (todoMainLayout) todoMainLayout.style.setProperty('display', 'none', 'important');
        if (authRequiredState) authRequiredState.style.display = 'block';
        if (sidebarName) sidebarName.textContent = "Войти";
        if (sidebarAvatar) sidebarAvatar.style.display = 'none';

        stopTodoForUser();
        stopProjectsForUser();
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

// Добавление задачи
async function handleAddTask() {
    const titleText = taskTitleInput.value.trim();
    if (!titleText || titleText.length > 500 || !currentUid) return;

    // Блокируем кнопку на время добавления
    btnAddTask.disabled = true;

    let targetProjectId = null;
    if (currentRoute.startsWith('project/')) {
        targetProjectId = currentRoute.split('/')[1];
    }

    try {
        await addDoc(collection(db, 'users', currentUid, 'tasks'), {
            title: titleText,
            completed: false,
            dueDate: selectedDueDate,
            projectId: targetProjectId,
            createdAt: serverTimestamp()
        });
        taskTitleInput.value = '';
        setDueDate(getDefaultDueDate());
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
            setDueDate(getDefaultDueDate());
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
        await updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
            deleted: true,
            deletedAt: serverTimestamp()
        });
    } catch (err) {
        console.error("Ошибка перемещения задачи в корзину:", err);
    }
}

// Восстановление задачи из Корзины
async function restoreTask(taskId) {
    if (!currentUid || !taskId) return;
    try {
        await updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
            deleted: false,
            deletedAt: null
        });
    } catch (err) {
        console.error("Ошибка восстановления задачи:", err);
    }
}

// Удаление задачи навсегда
async function deleteTaskPermanently(taskId) {
    if (!currentUid || !taskId) return;
    try {
        await deleteDoc(doc(db, 'users', currentUid, 'tasks', taskId));
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
            for (const task of deletedTasks) {
                await deleteDoc(doc(db, 'users', currentUid, 'tasks', task.id));
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

// Переключение выполнения задачи
async function toggleTaskCompleted(taskId, currentStatus) {
    if (!currentUid || !taskId) return;
    try {
        if (!currentStatus) {
            const completedSound = new Audio('completed.mp3');
            completedSound.play().catch(err => console.log('Audio playback failed:', err));
        }
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
    const nonDeletedTasks = allTasks.filter(t => !t.deleted);
    const activeTasks = nonDeletedTasks.filter(t => !t.completed);
    const completedTasks = nonDeletedTasks.filter(t => t.completed);
    const trashTasks = allTasks.filter(t => t.deleted);

    // Вычисляем счетчики для сайдбара
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

    const isTodayTask = (t) => {
        return t.dueDate === todayStr;
    };

    const inboxActiveCount = activeTasks.filter(t => !t.projectId).length;
    const todayActiveCount = activeTasks.filter(isTodayTask).length;

    if (inboxCounter) {
        inboxCounter.textContent = inboxActiveCount;
        inboxCounter.style.display = inboxActiveCount > 0 ? 'inline-block' : 'none';
    }
    if (todayCounter) {
        todayCounter.textContent = todayActiveCount;
        todayCounter.style.display = todayActiveCount > 0 ? 'inline-block' : 'none';
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

    // Фильтруем задачи для отображения в зависимости от текущей вкладки (роута)
    let displayActiveTasks = [];
    let displayCompletedTasks = [];

    if (currentRoute === 'today') {
        displayActiveTasks = activeTasks.filter(isTodayTask);
        displayCompletedTasks = completedTasks.filter(isTodayTask);
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

    // Сортируем задачи по полю 'order', а при равенстве или его отсутствии — по 'createdAt'
    const sortTasksByOrder = (tasks) => {
        tasks.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 0;
            const orderB = b.order !== undefined ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;

            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 14 14"></polyline>
                    </svg>
                    <h3 class="empty-title">Все дела сделаны!</h3>
                    <p class="empty-text">Добавьте новую задачу выше, чтобы спланировать свой день.</p>
                </div>
            `;
        }
    } else {
        displayActiveTasks.forEach(task => {
            const el = createTaskRowElement(task);
            activeTasksContainer.appendChild(el);
        });

        // Добавляем футер с количеством элементов в Корзине
        if (currentRoute === 'trash') {
            const footerDiv = document.createElement('div');
            footerDiv.style.textAlign = 'center';
            footerDiv.style.marginTop = '24px';
            footerDiv.style.color = 'var(--text-secondary)';
            footerDiv.style.fontSize = '0.9rem';
            footerDiv.style.fontWeight = '500';
            footerDiv.textContent = `${displayActiveTasks.length} в корзине`;
            activeTasksContainer.appendChild(footerDiv);
        }
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

    if (task.deleted) {
        item.innerHTML = `
            <div class="checkbox-wrapper" style="opacity: 0.5; pointer-events: none;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" style="color: var(--text-secondary);">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </div>
            <div class="task-content" style="min-width: 0; flex: 1;">
                <span class="task-title-text" style="color: var(--text-secondary); pointer-events: none; text-decoration: ${task.completed ? 'line-through' : 'none'};">${escapeHtml(task.title)}</span>
                ${task.dueDate ? `
                    <span class="task-due-badge" style="opacity: 0.6;">
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
                <div class="dropdown-submenu-container">
                    <button class="dropdown-item btn-move-project">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; width: 14px; height: 14px;">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>Переместить в..</span>
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
        return `
                                <button class="dropdown-item btn-select-project ${isCurrent ? 'selected' : ''}" data-project-id="${proj.id}">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                        <line x1="4" y1="9" x2="20" y2="9"></line>
                                        <line x1="4" y1="15" x2="20" y2="15"></line>
                                        <line x1="10" y1="3" x2="8" y2="21"></line>
                                        <line x1="16" y1="3" x2="14" y2="21"></line>
                                    </svg>
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
                const menuWidth = 170;
                const menuHeight = 120;
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
        showCustomConfirm(
            "Переместить в корзину?",
            `Задача <strong>${escapeHtml(task.title)}</strong> будет перемещена в корзину.`,
            "Удалить",
            () => {
                deleteTask(task.id);
            }
        );
    });

    // Обработчик для раскрытия подменю "Переместить в"
    // Обработчик для раскрытия подменю "Переместить в" (только для тач-устройств по клику)
    const btnMoveProject = item.querySelector('.btn-move-project');
    const submenu = item.querySelector('.dropdown-submenu');

    if (btnMoveProject && submenu) {
        btnMoveProject.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.matchMedia('(hover: none)').matches) {
                const isHidden = submenu.style.display === 'none';
                submenu.style.display = isHidden ? 'flex' : 'none';
            }
        });
    }

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
    item.addEventListener('touchstart', (e) => {
        if (e.target.closest('button:not(.task-drag-handle), input, textarea, a, .checkbox-wrapper, .custom-checkbox, .task-actions-dropdown')) {
            return;
        }
        item.setAttribute('draggable', 'true');
    }, { passive: true });
    item.addEventListener('touchend', () => {
        item.removeAttribute('draggable');
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
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
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
            }
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

function renderProjects() {
    if (!projectsListContainer) return;
    projectsListContainer.innerHTML = '';

    projectsList.forEach(project => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'project-item-container';

        const projectHash = `project/${project.id}`;
        const isActive = currentRoute === projectHash;

        // Calculate task count for this project
        const projectTaskCount = allTasks.filter(t => !t.completed && t.projectId === project.id).length;

        itemContainer.innerHTML = `
            <a href="#${projectHash}" class="menu-item ${isActive ? 'active' : ''}">
                <span class="menu-item-left">
                    <span class="menu-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="4" y1="9" x2="20" y2="9"></line>
                            <line x1="4" y1="15" x2="20" y2="15"></line>
                            <line x1="10" y1="3" x2="8" y2="21"></line>
                            <line x1="16" y1="3" x2="14" y2="21"></line>
                        </svg>
                    </span>
                    <span>${escapeHtml(project.name)}</span>
                </span>
                <span class="menu-counter" style="${projectTaskCount > 0 ? '' : 'display:none'}">${projectTaskCount}</span>
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
            menuIcon.addEventListener('touchstart', () => {
                itemContainer.setAttribute('draggable', 'true');
            });
            menuIcon.addEventListener('touchend', () => {
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

async function handleAddProject() {
    const nameText = projectNewNameInput.value.trim();
    if (!nameText || nameText.length > 50 || !currentUid) return;

    btnSaveProject.disabled = true;
    try {
        await addDoc(collection(db, 'users', currentUid, 'projects'), {
            name: nameText,
            createdAt: serverTimestamp()
        });
        projectNewNameInput.value = '';
        projectAddForm.style.display = 'none';
    } catch (err) {
        console.error("Не удалось добавить проект:", err);
    } finally {
        btnSaveProject.disabled = false;
    }
}

// Привязка событий проектов
if (btnAddProject) {
    btnAddProject.addEventListener('click', (e) => {
        e.stopPropagation();
        projectAddForm.style.display = projectAddForm.style.display === 'none' ? 'block' : 'none';
        if (projectAddForm.style.display === 'block') {
            projectNewNameInput.focus();
        }
    });
}

if (btnCancelProject) {
    btnCancelProject.addEventListener('click', (e) => {
        e.stopPropagation();
        projectNewNameInput.value = '';
        projectAddForm.style.display = 'none';
    });
}

if (btnSaveProject) {
    btnSaveProject.addEventListener('click', handleAddProject);
}

if (projectNewNameInput) {
    projectNewNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddProject();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            projectNewNameInput.value = '';
            projectAddForm.style.display = 'none';
        }
    });
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

    const containers = [activeTasksContainer, completedTasksContainer];

    containers.forEach(container => {
        if (!container) return;

        container.addEventListener('dragstart', (e) => {
            const taskItem = e.target.closest('.task-item');
            if (!taskItem || taskItem.classList.contains('editing') || currentRoute === 'trash') {
                e.preventDefault();
                return;
            }
            draggingElement = taskItem;
            taskItem.classList.add('dragging');
            container.classList.add('drag-active');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', taskItem.getAttribute('data-id'));
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggingElement) return;

            const taskItem = e.target.closest('.task-item');
            if (!taskItem || taskItem === draggingElement) return;

            // Разрешаем перетаскивание только внутри одного и того же контейнера
            if (taskItem.parentNode !== draggingElement.parentNode) return;

            const rect = taskItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            // Сбрасываем старые индикаторы
            container.querySelectorAll('.task-item').forEach(item => {
                item.classList.remove('drag-over-above', 'drag-over-below');
            });

            if (e.clientY < midpoint) {
                taskItem.classList.add('drag-over-above');
            } else {
                taskItem.classList.add('drag-over-below');
            }
        });

        container.addEventListener('dragleave', (e) => {
            const taskItem = e.target.closest('.task-item');
            if (taskItem) {
                taskItem.classList.remove('drag-over-above', 'drag-over-below');
            }
        });

        container.addEventListener('dragend', (e) => {
            if (draggingElement) {
                draggingElement.classList.remove('dragging');
                draggingElement.removeAttribute('draggable');
            }
            container.querySelectorAll('.task-item').forEach(item => {
                item.classList.remove('drag-over-above', 'drag-over-below');
                item.removeAttribute('draggable');
            });
            container.classList.remove('drag-active');
            draggingElement = null;
        });

        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            if (!draggingElement) return;

            const targetItem = e.target.closest('.task-item');
            if (!targetItem || targetItem === draggingElement) return;

            const isAbove = targetItem.classList.contains('drag-over-above');

            // Очищаем индикаторы
            targetItem.classList.remove('drag-over-above', 'drag-over-below');
            draggingElement.classList.remove('dragging');

            const taskId = draggingElement.getAttribute('data-id');

            // Вычисляем новый порядок на основе текущих отрендеренных элементов
            const taskItems = Array.from(container.querySelectorAll('.task-item'));
            const draggingIndex = taskItems.indexOf(draggingElement);
            let targetIndex = taskItems.indexOf(targetItem);

            taskItems.splice(draggingIndex, 1);

            if (!isAbove) {
                targetIndex = taskItems.indexOf(targetItem) + 1;
            } else {
                targetIndex = taskItems.indexOf(targetItem);
            }

            // Получаем задачи текущего списка, чтобы рассчитать их order
            let currentTasks = [];

            const activeTasks = allTasks.filter(t => !t.deleted && !t.completed);
            const completedTasks = allTasks.filter(t => !t.deleted && t.completed);
            const isCompletedContainer = container === completedTasksContainer;
            const targetTasksList = isCompletedContainer ? completedTasks : activeTasks;

            if (currentRoute === 'today') {
                const todayObj = new Date();
                const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
                currentTasks = targetTasksList.filter(t => t.dueDate === todayStr);
            } else if (currentRoute.startsWith('project/')) {
                const projectId = currentRoute.split('/')[1];
                currentTasks = targetTasksList.filter(t => t.projectId === projectId);
            } else { // inbox
                currentTasks = targetTasksList.filter(t => !t.projectId);
            }

            // Сортируем текущие задачи так же, как они отрендерены на экране
            currentTasks.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 0;
                const orderB = b.order !== undefined ? b.order : 0;
                if (orderA !== orderB) return orderA - orderB;
                const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
                const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
                return timeB - timeA;
            });

            // Находим перемещаемую задачу в массиве данных
            const movingTask = currentTasks.find(t => t.id === taskId);
            if (!movingTask) return;

            const movingTaskIndex = currentTasks.indexOf(movingTask);
            currentTasks.splice(movingTaskIndex, 1);
            currentTasks.splice(targetIndex, 0, movingTask);

            // Вычисляем новый order
            let newOrder = 0;
            if (currentTasks.length === 1) {
                newOrder = 0;
            } else if (targetIndex === 0) {
                const nextTask = currentTasks[1];
                const nextOrder = nextTask.order !== undefined ? nextTask.order : 0;
                newOrder = nextOrder - 1000;
            } else if (targetIndex === currentTasks.length - 1) {
                const prevTask = currentTasks[currentTasks.length - 2];
                const prevOrder = prevTask.order !== undefined ? prevTask.order : 0;
                newOrder = prevOrder + 1000;
            } else {
                const prevTask = currentTasks[targetIndex - 1];
                const nextTask = currentTasks[targetIndex + 1];
                const prevOrder = prevTask.order !== undefined ? prevTask.order : 0;
                const nextOrder = nextTask.order !== undefined ? nextTask.order : 0;
                newOrder = (prevOrder + nextOrder) / 2;
            }

            // Обновляем в Firebase
            if (currentUid && taskId) {
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
                        order: newOrder
                    });
                } catch (err) {
                    console.error("Ошибка обновления порядка задач:", err);
                }
            }
            draggingElement = null;
        });
    });
}

initDragAndDrop();

// Отображение контекстного меню проекта
function showProjectContextMenu(e, projectId, projectName, itemContainer) {
    if (activeContextMenu) activeContextMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    menu.innerHTML = `
        <div class="ctx-item" id="ctx-rename-project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Переименовать</span>
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

    if (!projectsListContainer) return;

    projectsListContainer.addEventListener('dragstart', (e) => {
        const projectItem = e.target.closest('.project-item-container');
        if (!projectItem) {
            e.preventDefault();
            return;
        }
        draggingProject = projectItem;
        projectItem.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Передаем ID проекта
        const actionsBtn = projectItem.querySelector('.project-actions-btn');
        if (actionsBtn) {
            e.dataTransfer.setData('text/plain', actionsBtn.getAttribute('data-id'));
        }
    });

    projectsListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggingProject) return;

        const projectItem = e.target.closest('.project-item-container');
        if (!projectItem || projectItem === draggingProject) return;

        const rect = projectItem.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        projectsListContainer.querySelectorAll('.project-item-container').forEach(item => {
            item.classList.remove('drag-over-above', 'drag-over-below');
        });

        if (e.clientY < midpoint) {
            projectItem.classList.add('drag-over-above');
        } else {
            projectItem.classList.add('drag-over-below');
        }
    });

    projectsListContainer.addEventListener('dragleave', (e) => {
        const projectItem = e.target.closest('.project-item-container');
        if (projectItem) {
            projectItem.classList.remove('drag-over-above', 'drag-over-below');
        }
    });

    projectsListContainer.addEventListener('dragend', (e) => {
        if (draggingProject) {
            draggingProject.classList.remove('dragging');
        }
        projectsListContainer.querySelectorAll('.project-item-container').forEach(item => {
            item.classList.remove('drag-over-above', 'drag-over-below');
        });
        draggingProject = null;
    });

    projectsListContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggingProject) return;

        const targetItem = e.target.closest('.project-item-container');
        if (!targetItem || targetItem === draggingProject) return;

        const isAbove = targetItem.classList.contains('drag-over-above');

        targetItem.classList.remove('drag-over-above', 'drag-over-below');
        draggingProject.classList.remove('dragging');

        const actionsBtn = draggingProject.querySelector('.project-actions-btn');
        if (!actionsBtn) return;
        const projectId = actionsBtn.getAttribute('data-id');

        const projectItems = Array.from(projectsListContainer.querySelectorAll('.project-item-container'));
        const draggingIndex = projectItems.indexOf(draggingProject);
        let targetIndex = projectItems.indexOf(targetItem);

        projectItems.splice(draggingIndex, 1);

        if (!isAbove) {
            targetIndex = projectItems.indexOf(targetItem) + 1;
        } else {
            targetIndex = projectItems.indexOf(targetItem);
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

initProjectsDragAndDrop();

// Инициализация Long Press Touch перетаскивания для мобильных
function initTouchDragAndDrop() {
    let touchStartTimer = null;
    let touchDraggingElement = null;
    let touchDragType = null; // 'task' или 'project'
    let startY = 0;
    let lastElementUnderTouch = null;

    const resetTouchState = () => {
        if (touchStartTimer) {
            clearTimeout(touchStartTimer);
            touchStartTimer = null;
        }
        if (touchDraggingElement) {
            touchDraggingElement.classList.remove('dragging');
            touchDraggingElement.removeAttribute('draggable');
            if (touchDraggingElement._preventSelection) {
                window.removeEventListener('selectstart', touchDraggingElement._preventSelection, { capture: true });
                window.removeEventListener('contextmenu', touchDraggingElement._preventSelection, { capture: true });
                delete touchDraggingElement._preventSelection;
            }
        }
        document.querySelectorAll('.task-item, .project-item-container').forEach(item => {
            item.classList.remove('drag-over-above', 'drag-over-below');
        });
        touchDraggingElement = null;
        touchDragType = null;
        lastElementUnderTouch = null;
    };

    const handleTouchStart = (e, type) => {
        if (e.touches.length > 1) return;
        const touch = e.touches[0];
        startY = touch.clientY;

        const targetEl = e.target.closest(type === 'task' ? '.task-item' : '.project-item-container');
        if (!targetEl || targetEl.classList.contains('editing') || currentRoute === 'trash') return;

        // Отключаем выделение текста при длительном тапе
        const preventSelection = (evt) => {
            evt.preventDefault();
        };

        // Таймер для Long Press (300 мс для более быстрого отклика)
        touchStartTimer = setTimeout(() => {
            touchDraggingElement = targetEl;
            touchDragType = type;
            touchDraggingElement.classList.add('dragging');
            touchDraggingElement.setAttribute('draggable', 'true');

            // Добавляем временный слушатель для отмены выделения текста и контекстного меню
            window.addEventListener('selectstart', preventSelection, { capture: true });
            window.addEventListener('contextmenu', preventSelection, { capture: true });
            touchDraggingElement._preventSelection = preventSelection;

            // Легкая вибрация, если поддерживается устройством
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 300);
    };

    const handleTouchMove = (e) => {
        if (!touchDraggingElement) {
            // Если палец сдвинулся до истечения 500мс, отменяем Long Press
            const touch = e.touches[0];
            if (Math.abs(touch.clientY - startY) > 10) {
                if (touchStartTimer) {
                    clearTimeout(touchStartTimer);
                    touchStartTimer = null;
                }
            }
            return;
        }

        // Предотвращаем скролл экрана во время переноса
        e.preventDefault();

        // Временно отключаем pointer-events на перетаскиваемом элементе, 
        // чтобы elementFromPoint возвращал элемент, находящийся ПОД ним.
        const originalPointerEvents = touchDraggingElement.style.pointerEvents;
        touchDraggingElement.style.pointerEvents = 'none';

        const touch = e.touches[0];
        const elemUnder = document.elementFromPoint(touch.clientX, touch.clientY);

        // Восстанавливаем pointer-events
        touchDraggingElement.style.pointerEvents = originalPointerEvents;

        if (!elemUnder) return;

        const selector = touchDragType === 'task' ? '.task-item' : '.project-item-container';
        const targetItem = elemUnder.closest(selector);

        // Сбрасываем старые классы подсветки
        document.querySelectorAll(selector).forEach(item => {
            if (item !== targetItem) {
                item.classList.remove('drag-over-above', 'drag-over-below');
            }
        });

        if (!targetItem || targetItem === touchDraggingElement) {
            lastElementUnderTouch = null;
            return;
        }

        // В рамках тасков разрешаем перетаскивание только внутри одного контейнера (активные/выполненные)
        if (touchDragType === 'task' && targetItem.parentNode !== touchDraggingElement.parentNode) {
            lastElementUnderTouch = null;
            return;
        }

        lastElementUnderTouch = targetItem;
        const rect = targetItem.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (touch.clientY < midpoint) {
            targetItem.classList.add('drag-over-above');
            targetItem.classList.remove('drag-over-below');
        } else {
            targetItem.classList.add('drag-over-below');
            targetItem.classList.remove('drag-over-above');
        }
    };

    const handleTouchEnd = async (e) => {
        if (touchStartTimer) {
            clearTimeout(touchStartTimer);
            touchStartTimer = null;
        }

        if (!touchDraggingElement || !lastElementUnderTouch) {
            resetTouchState();
            return;
        }

        const targetItem = lastElementUnderTouch;
        const isAbove = targetItem.classList.contains('drag-over-above');
        const draggingEl = touchDraggingElement;
        const dragType = touchDragType;

        resetTouchState();

        if (dragType === 'task') {
            const container = draggingEl.parentNode;
            const taskId = draggingEl.getAttribute('data-id');
            const taskItems = Array.from(container.querySelectorAll('.task-item'));
            const draggingIndex = taskItems.indexOf(draggingEl);
            let targetIndex = taskItems.indexOf(targetItem);

            taskItems.splice(draggingIndex, 1);
            if (!isAbove) {
                targetIndex = taskItems.indexOf(targetItem) + 1;
            } else {
                targetIndex = taskItems.indexOf(targetItem);
            }

            let currentTasks = [];
            const activeTasks = allTasks.filter(t => !t.deleted && !t.completed);
            const completedTasks = allTasks.filter(t => !t.deleted && t.completed);
            const isCompletedContainer = container === completedTasksContainer;
            const targetTasksList = isCompletedContainer ? completedTasks : activeTasks;

            if (currentRoute === 'today') {
                const todayObj = new Date();
                const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
                currentTasks = targetTasksList.filter(t => t.dueDate === todayStr);
            } else if (currentRoute.startsWith('project/')) {
                const projectId = currentRoute.split('/')[1];
                currentTasks = targetTasksList.filter(t => t.projectId === projectId);
            } else {
                currentTasks = targetTasksList.filter(t => !t.projectId);
            }

            currentTasks.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 0;
                const orderB = b.order !== undefined ? b.order : 0;
                if (orderA !== orderB) return orderA - orderB;
                const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
                const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
                return timeB - timeA;
            });

            const movingTask = currentTasks.find(t => t.id === taskId);
            if (!movingTask) return;

            const movingTaskIndex = currentTasks.indexOf(movingTask);
            currentTasks.splice(movingTaskIndex, 1);
            currentTasks.splice(targetIndex, 0, movingTask);

            let newOrder = 0;
            if (currentTasks.length === 1) {
                newOrder = 0;
            } else if (targetIndex === 0) {
                const nextTask = currentTasks[1];
                const nextOrder = nextTask.order !== undefined ? nextTask.order : 0;
                newOrder = nextOrder - 1000;
            } else if (targetIndex === currentTasks.length - 1) {
                const prevTask = currentTasks[currentTasks.length - 2];
                const prevOrder = prevTask.order !== undefined ? prevTask.order : 0;
                newOrder = prevOrder + 1000;
            } else {
                const prevTask = currentTasks[targetIndex - 1];
                const nextTask = currentTasks[targetIndex + 1];
                const prevOrder = prevTask.order !== undefined ? prevTask.order : 0;
                const nextOrder = nextTask.order !== undefined ? nextTask.order : 0;
                newOrder = (prevOrder + nextOrder) / 2;
            }

            if (currentUid && taskId) {
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
                        order: newOrder
                    });
                } catch (err) {
                    console.error("Ошибка при touch-обновлении порядка задач:", err);
                }
            }
        } else if (dragType === 'project') {
            const actionsBtn = draggingEl.querySelector('.project-actions-btn');
            if (!actionsBtn) return;
            const projectId = actionsBtn.getAttribute('data-id');

            const projectItems = Array.from(projectsListContainer.querySelectorAll('.project-item-container'));
            const draggingIndex = projectItems.indexOf(draggingEl);
            let targetIndex = projectItems.indexOf(targetItem);

            projectItems.splice(draggingIndex, 1);
            if (!isAbove) {
                targetIndex = projectItems.indexOf(targetItem) + 1;
            } else {
                targetIndex = projectItems.indexOf(targetItem);
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

    // Слушатели событий на контейнеры для тасков
    [activeTasksContainer, completedTasksContainer].forEach(container => {
        if (!container) return;
        container.addEventListener('touchstart', (e) => handleTouchStart(e, 'task'), { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });
        container.addEventListener('touchcancel', resetTouchState, { passive: true });
    });

    // Слушатели для проектов в боковой панели
    if (projectsListContainer) {
        projectsListContainer.addEventListener('touchstart', (e) => handleTouchStart(e, 'project'), { passive: true });
        projectsListContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        projectsListContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
        projectsListContainer.addEventListener('touchcancel', resetTouchState, { passive: true });
    }
}

initTouchDragAndDrop();

