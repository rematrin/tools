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
let countdownsList = [];
let unsubscribeCountdowns = null;
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
let selectedDueEndDate = null; // Хранит выбранную конечную дату
let selectedDueEndTime = null; // Хранит выбранное конечное время
let calendarTargetTask = null; // Текущая редактируемая задача/подзадача для кастомного календаря
let tempSelectedDueDate = null;
let tempSelectedDueTime = null;
let tempSelectedDueRepeat = null;
let tempSelectedDueEndDate = null;
let tempSelectedDueEndTime = null;
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-11
let selectedPriority = 0; // Приоритет новой задачи по умолчанию

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

            // Adjust position for mobile
            if (window.innerWidth <= 768) {
                const rect = addTaskForm.getBoundingClientRect();
                priorityDropdown.style.top = `${rect.bottom + 12}px`;
            } else {
                priorityDropdown.style.top = '';
            }
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
        () => tempSelectedDueDate,
        (dateStr) => {
            tempSelectedDueDate = dateStr;
            if (dueDateDropdown.updateRepeatListOnDateChange) {
                dueDateDropdown.updateRepeatListOnDateChange();
            }
        },
        () => tempSelectedDueTime,
        (timeStr) => { tempSelectedDueTime = timeStr; },
        () => tempSelectedDueRepeat,
        (repeatStr) => { tempSelectedDueRepeat = repeatStr; },
        () => tempSelectedDueEndDate,
        (dateStr) => { tempSelectedDueEndDate = dateStr; },
        () => tempSelectedDueEndTime,
        (timeStr) => { tempSelectedDueEndTime = timeStr; },
        async () => {
            if (calendarTargetTask) {
                calendarTargetTask.dueDate = tempSelectedDueDate;
                calendarTargetTask.dueTime = tempSelectedDueTime;
                calendarTargetTask.dueRepeat = tempSelectedDueRepeat;
                calendarTargetTask.dueEndDate = tempSelectedDueEndDate;
                calendarTargetTask.dueEndTime = tempSelectedDueEndTime;
                if (currentUid && calendarTargetTask.id) {
                    try {
                        await updateDoc(doc(db, 'users', currentUid, 'tasks', calendarTargetTask.id), {
                            dueDate: calendarTargetTask.dueDate || null,
                            dueTime: calendarTargetTask.dueTime || null,
                            dueRepeat: calendarTargetTask.dueRepeat || null,
                            dueEndDate: calendarTargetTask.dueEndDate || null,
                            dueEndTime: calendarTargetTask.dueEndTime || null
                        });
                    } catch (err) {
                        console.error("Ошибка обновления даты задачи:", err);
                    }
                }
                closeDueDateDropdown();
 
                // Close all actions menus
                document.querySelectorAll('.task-actions-dropdown, .modal-subtask-item .task-actions-dropdown').forEach(dd => {
                    dd.style.display = 'none';
                    dd.style.position = '';
                    dd.style.left = '';
                    dd.style.top = '';
                    dd.style.bottom = '';
                });
                document.querySelectorAll('.task-item, .modal-subtask-item').forEach(el => {
                    el.classList.remove('menu-open');
                });
            } else {
                setDueDate(tempSelectedDueDate, tempSelectedDueTime, tempSelectedDueRepeat, tempSelectedDueEndDate, tempSelectedDueEndTime);
                closeDueDateDropdown();
            }
        },
        () => {
            closeDueDateDropdown();
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

            calendarTargetTask = null;

            openDueDateDropdown();

            dueDateDropdown.style.position = 'fixed';
            const rect = btnDueDate.getBoundingClientRect();
            let x = rect.left;
            let y = rect.bottom + 8;

            const menuWidth = 710;
            const menuHeight = 380;
            if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
            if (y + menuHeight > window.innerHeight) y = rect.top - menuHeight - 8;
            if (x < 10) x = 10;
            if (y < 10) y = 10;

            dueDateDropdown.style.left = `${x}px`;
            dueDateDropdown.style.top = `${y}px`;
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

            // Adjust position for mobile
            if (window.innerWidth <= 768) {
                const rect = addTaskForm.getBoundingClientRect();
                addTaskProjectDropdown.style.top = `${rect.bottom + 12}px`;
            } else {
                addTaskProjectDropdown.style.top = '';
            }
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
            if (dropdown.contains(e.target)) return;
            if (dropdown.id === 'dueDateDropdown') {
                if (e.target.closest('#btnDueDate') || e.target.closest('.btn-due-select')) {
                    return;
                }
            }
            const wrapper = dropdown.closest('.due-date-wrapper') || dropdown.closest('.add-task-project-wrapper') || dropdown.closest('.priority-wrapper');
            if (!wrapper || !wrapper.contains(e.target)) {
                if (dropdown.id === 'dueDateDropdown') {
                    closeDueDateDropdown();
                } else {
                    if (typeof dropdown.onCancelCallback === 'function') {
                        dropdown.onCancelCallback();
                    } else {
                        dropdown.style.display = 'none';
                        const overlay = dropdown.parentElement;
                        if (overlay && overlay.classList.contains('due-modal-overlay')) {
                            overlay.style.display = 'none';
                        }
                    }
                }
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
            if (e.target.closest('#dueDateDropdown')) {
                return;
            }
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

// Умное позиционирование подменю проектов (чтобы не вылезало за границы экрана)
document.addEventListener('mouseenter', (e) => {
    if (window.innerWidth <= 768) return;
    // Реагируем только на событие входа в сам контейнер подменю (а не в его дочерние элементы)
    if (!e.target.classList || !e.target.classList.contains('dropdown-submenu-container')) return;

    const container = e.target;
    const submenu = container.querySelector('.dropdown-submenu');
    if (!submenu) return;

    // Сбрасываем стили
    submenu.style.top = '';
    submenu.style.bottom = '';
    submenu.style.left = '';
    submenu.style.right = '';

    const rect = container.getBoundingClientRect();
    const submenuHeight = Math.max(submenu.offsetHeight, submenu.childElementCount * 36);
    const submenuWidth = submenu.offsetWidth || 180;

    // Вертикальное позиционирование
    const spaceBelow = window.innerHeight - rect.top;
    const spaceAbove = rect.bottom;
    if (spaceBelow < submenuHeight && spaceAbove > spaceBelow) {
        submenu.style.top = 'auto';
        submenu.style.bottom = '-4px';
    } else {
        submenu.style.top = '-4px';
        submenu.style.bottom = 'auto';
    }

    // Горизонтальное позиционирование (влево/вправо)
    const spaceRight = window.innerWidth - rect.right;
    if (spaceRight < submenuWidth && rect.left > submenuWidth) {
        submenu.style.left = 'auto';
        submenu.style.right = 'calc(100% + 4px)';
    } else {
        submenu.style.left = 'calc(100% + 4px)';
        submenu.style.right = 'auto';
    }
}, true);

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
    const overlay = document.getElementById('dueModalOverlay');
    if (overlay) overlay.style.display = 'flex';
    dueDateDropdown.style.display = 'flex';
    dueDateDropdown.style.position = 'relative';
    dueDateDropdown.style.left = '';
    dueDateDropdown.style.top = '';

    if (calendarTargetTask) {
        tempSelectedDueDate = calendarTargetTask.dueDate || null;
        tempSelectedDueTime = calendarTargetTask.dueTime || null;
        tempSelectedDueRepeat = calendarTargetTask.dueRepeat || null;
        tempSelectedDueEndDate = calendarTargetTask.dueEndDate || null;
        tempSelectedDueEndTime = calendarTargetTask.dueEndTime || null;
    } else {
        tempSelectedDueDate = selectedDueDate || null;
        tempSelectedDueTime = selectedDueTime || null;
        tempSelectedDueRepeat = selectedDueRepeat || null;
        tempSelectedDueEndDate = selectedDueEndDate || null;
        tempSelectedDueEndTime = selectedDueEndTime || null;
    }

    initQuickOptionsText();
    renderCalendarGrid();
    if (typeof dueDateDropdown.initUI === 'function') {
        dueDateDropdown.initUI();
    }
}

function closeDueDateDropdown() {
    const overlay = document.getElementById('dueModalOverlay');
    if (overlay) overlay.style.display = 'none';
    dueDateDropdown.style.display = 'none';
    calendarTargetTask = null;
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

        let dateStr = null;
        if (targetDate) {
            dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        }

        tempSelectedDueDate = dateStr;
        if (dueDateDropdown.updateRepeatListOnDateChange) {
            dueDateDropdown.updateRepeatListOnDateChange();
        }
        if (dueDateDropdown.initUI) {
            dueDateDropdown.initUI();
        }
        renderCalendarGrid();
    });
});

// Установка выбранного срока
function setDueDate(dateStr, timeStr = undefined, repeatStr = undefined, endDateStr = undefined, endTimeStr = undefined) {
    selectedDueDate = dateStr;
    if (timeStr !== undefined) selectedDueTime = timeStr;
    if (repeatStr !== undefined) selectedDueRepeat = repeatStr;
    if (endDateStr !== undefined) selectedDueEndDate = endDateStr;
    if (endTimeStr !== undefined) selectedDueEndTime = endTimeStr;

    if (!selectedDueDate) {
        selectedDueTime = null;
        selectedDueRepeat = null;
        selectedDueEndDate = null;
        selectedDueEndTime = null;
        if (dueDateBtnText) dueDateBtnText.textContent = 'Срок';
        if (btnClearDueDate) btnClearDueDate.style.display = 'none';
        if (btnDueDate) btnDueDate.classList.remove('active');
    } else {
        const label = formatDueDateDisplay(selectedDueDate, selectedDueTime, selectedDueRepeat, selectedDueEndDate, selectedDueEndTime);
        if (dueDateBtnText) dueDateBtnText.textContent = label;
        if (btnClearDueDate) btnClearDueDate.style.display = 'inline-flex';
        if (btnDueDate) btnDueDate.classList.add('active');
    }
    
    if (dueDateDropdown && typeof dueDateDropdown.initUI === 'function') {
        tempSelectedDueDate = selectedDueDate;
        tempSelectedDueTime = selectedDueTime;
        tempSelectedDueRepeat = selectedDueRepeat;
        tempSelectedDueEndDate = selectedDueEndDate;
        tempSelectedDueEndTime = selectedDueEndTime;
        dueDateDropdown.initUI();
        renderCalendarGrid();
    }
}

// Форматирование даты для кнопки и карточек
function formatDueDateDisplay(dateStr, timeStr = null, repeatStr = null, endDateStr = null, endTimeStr = null) {
    if (!dateStr) return 'Срок';

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const formatDatePart = (dStr) => {
        if (dStr === todayStr) return 'Сегодня';
        if (dStr === tomorrowStr) return 'Завтра';
        if (dStr === yesterdayStr) return 'Вчера';
        const [year, month, day] = dStr.split('-');
        const monthsRuShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        let l = `${parseInt(day, 10)} ${monthsRuShort[parseInt(month, 10) - 1]}`;
        if (parseInt(year, 10) !== today.getFullYear()) {
            l += ` ${year}`;
        }
        return l;
    };

    let label = formatDatePart(dateStr);

    if (timeStr) {
        if (endTimeStr) {
            if (!endDateStr || endDateStr === dateStr) {
                label += ` в ${timeStr}-${endTimeStr}`;
            } else {
                label += ` в ${timeStr} - ${formatDatePart(endDateStr)} в ${endTimeStr}`;
            }
        } else {
            label += ` в ${timeStr}`;
        }
    } else if (endDateStr && endDateStr !== dateStr) {
        label += ` - ${formatDatePart(endDateStr)}`;
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
    switch (dayIndex) {
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

    switch (repeatCode) {
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

    switch (repeatCode) {
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

function setupNestedViews(dropdownEl, getSelectedDate, setSelectedDate, getSelectedTime, setSelectedTime, getSelectedRepeat, setSelectedRepeat, getSelectedEndDate, setSelectedEndDate, getSelectedEndTime, setSelectedEndTime, onDone, onCancel) {
    dropdownEl.onDoneCallback = onDone;
    dropdownEl.onCancelCallback = onCancel;

    // Close on overlay backdrop click
    const overlay = dropdownEl.parentElement;
    if (overlay && overlay.classList.contains('due-modal-overlay')) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                e.stopPropagation();
                if (typeof onCancel === 'function') onCancel();
            }
        });
    }

    const timeCheckbox = dropdownEl.querySelector('.due-time-checkbox');
    const repeatCheckbox = dropdownEl.querySelector('.due-repeat-checkbox');
    const timeInputsWrapper = dropdownEl.querySelector('.due-time-inputs-wrapper');
    const repeatOptionsBlock = dropdownEl.querySelector('.due-repeat-options-block');

    const startTimeBtn = dropdownEl.querySelector('.start-time-btn');
    const endTimeBtn = dropdownEl.querySelector('.end-time-btn');
    const endTimeCheckbox = dropdownEl.querySelector('.end-time-active-checkbox');
    const customTimeDropdown = dropdownEl.querySelector('.custom-time-dropdown');
    const repeatPickerList = dropdownEl.querySelector('.repeat-picker-list');

    // Helper functions for time offsets
    const minToTimeStr = (min) => {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const formatDurationHours = (h) => {
        if (h === 1) return '1 час';
        if (h % 1 === 0) {
            if (h >= 2 && h <= 4) return `${h} часа`;
            return `${h} часов`;
        }
        return `${h} часа`;
    };

    const getEndTimeOptions = (startStr) => {
        const [sh, sm] = startStr.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const opts = [];
        
        const shortOffsets = [15, 30, 45];
        shortOffsets.forEach(off => {
            const targetMin = startMin + off;
            if (targetMin <= 23 * 60 + 59) {
                opts.push({
                    time: minToTimeStr(targetMin),
                    label: `${off} минут`
                });
            }
        });
        
        for (let h = 1; h <= 24; h += 0.5) {
            const off = h * 60;
            const targetMin = startMin + off;
            if (targetMin <= 23 * 60 + 59) {
                opts.push({
                    time: minToTimeStr(targetMin),
                    label: formatDurationHours(h)
                });
            } else {
                const maxMin = 23 * 60 + 59;
                if (opts.length > 0 && opts[opts.length - 1].time !== '23:59' && startMin < maxMin) {
                    opts.push({
                        time: '23:59',
                        label: 'до конца дня'
                    });
                }
                break;
            }
        }
        return opts;
    };

    // Save & Cancel buttons in the footer
    const btnSave = dropdownEl.querySelector('.due-btn-save');
    const btnCancel = dropdownEl.querySelector('.due-btn-cancel');

    if (btnSave) {
        btnSave.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof onDone === 'function') onDone();
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof onCancel === 'function') onCancel();
        });
    }

    // Time Checkbox Toggle
    if (timeCheckbox) {
        timeCheckbox.addEventListener('change', (e) => {
            const active = e.target.checked;
            if (active) {
                if (timeInputsWrapper) timeInputsWrapper.style.display = 'flex';
                const start = getSelectedTime() || '08:00';
                setSelectedTime(start);
                const endActive = !!getSelectedEndTime();
                if (endActive) {
                    setSelectedEndDate(getSelectedDate() || getTodayString());
                    setSelectedEndTime(getSelectedEndTime() || '09:00');
                }
            } else {
                if (timeInputsWrapper) timeInputsWrapper.style.display = 'none';
                if (customTimeDropdown) customTimeDropdown.style.display = 'none';
                setSelectedTime(null);
                setSelectedEndDate(null);
                setSelectedEndTime(null);
            }
            dropdownEl.initUI();
        });
    }

    // End Time Checkbox Toggle
    if (endTimeCheckbox) {
        endTimeCheckbox.addEventListener('change', (e) => {
            const active = e.target.checked;
            if (active) {
                const start = getSelectedTime() || '08:00';
                let end = getSelectedEndTime() || '09:00';
                const [sh, sm] = start.split(':').map(Number);
                const [eh, em] = end.split(':').map(Number);
                if (eh * 60 + em <= sh * 60 + sm) {
                    let targetH = sh + 1;
                    if (targetH >= 24) targetH = 23;
                    let targetM = sm;
                    if (sh === 23) targetM = 59;
                    end = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;
                }
                setSelectedEndDate(getSelectedDate() || getTodayString());
                setSelectedEndTime(end);
            } else {
                setSelectedEndDate(null);
                setSelectedEndTime(null);
            }
            dropdownEl.initUI();
        });
    }

    // Start Time Button Click
    if (startTimeBtn) {
        startTimeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!customTimeDropdown) return;
            customTimeDropdown.innerHTML = '';
            customTimeDropdown.classList.remove('align-right');
            customTimeDropdown.classList.add('align-left');
            customTimeDropdown.style.display = 'flex';

            const startTimeVal = getSelectedTime() || '08:00';

            for (let h = 0; h < 24; h++) {
                for (let m = 0; m < 60; m += 30) {
                    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    const isSelected = startTimeVal === timeStr;
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = `custom-time-dropdown-item ${isSelected ? 'selected' : ''}`;
                    item.innerHTML = `
                        <span>${timeStr}</span>
                        <span></span>
                        <span class="item-checkmark-wrap">${isSelected ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</span>
                    `;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        setSelectedTime(timeStr);
                        startTimeBtn.value = timeStr;
                        
                        // If end time is active, ensure it is after start time
                        const endActive = !!getSelectedEndTime();
                        if (endActive) {
                            const endTimeVal = getSelectedEndTime() || '09:00';
                            const [nsh, nsm] = timeStr.split(':').map(Number);
                            const [neh, nem] = endTimeVal.split(':').map(Number);
                            if (neh * 60 + nem <= nsh * 60 + nsm) {
                                let targetH = nsh + 1;
                                if (targetH >= 24) targetH = 23;
                                let targetM = nsm;
                                if (nsh === 23) targetM = 59;
                                const newEnd = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;
                                setSelectedEndTime(newEnd);
                                if (endTimeBtn) endTimeBtn.value = newEnd;
                            }
                        }
                        
                        customTimeDropdown.style.display = 'none';
                        dropdownEl.initUI();
                    });
                    customTimeDropdown.appendChild(item);
                }
            }

            setTimeout(() => {
                const sel = customTimeDropdown.querySelector('.selected');
                if (sel) {
                    customTimeDropdown.scrollTop = sel.offsetTop - customTimeDropdown.offsetTop - 10;
                }
            }, 10);
        });

        const onStartInput = () => {
            if (startTimeBtn.value) {
                setSelectedTime(startTimeBtn.value);
                // If end time is active, ensure it is after start time
                const endActive = !!getSelectedEndTime();
                if (endActive) {
                    const endTimeVal = getSelectedEndTime() || '09:00';
                    const [nsh, nsm] = startTimeBtn.value.split(':').map(Number);
                    const [neh, nem] = endTimeVal.split(':').map(Number);
                    if (neh * 60 + nem <= nsh * 60 + nsm) {
                        let targetH = nsh + 1;
                        if (targetH >= 24) targetH = 23;
                        let targetM = nsm;
                        if (nsh === 23) targetM = 59;
                        const newEnd = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;
                        setSelectedEndTime(newEnd);
                        if (endTimeBtn) endTimeBtn.value = newEnd;
                    }
                }
            }
        };
        startTimeBtn.addEventListener('input', onStartInput);
        startTimeBtn.addEventListener('change', onStartInput);
    }

    // End Time Button Click
    if (endTimeBtn) {
        endTimeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!customTimeDropdown) return;
            customTimeDropdown.innerHTML = '';
            customTimeDropdown.classList.remove('align-left');
            customTimeDropdown.classList.add('align-right');
            customTimeDropdown.style.display = 'flex';

            const startTimeVal = getSelectedTime() || '08:00';
            const endTimeVal = getSelectedEndTime() || '09:00';
            const opts = getEndTimeOptions(startTimeVal);

            opts.forEach(opt => {
                const isSelected = endTimeVal === opt.time;
                const item = document.createElement('button');
                item.type = 'button';
                item.className = `custom-time-dropdown-item ${isSelected ? 'selected' : ''}`;
                item.innerHTML = `
                    <span>${opt.time}</span>
                    <span class="item-duration-label">${opt.label}</span>
                    <span class="item-checkmark-wrap">${isSelected ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</span>
                `;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setSelectedEndTime(opt.time);
                    endTimeBtn.value = opt.time;
                    setSelectedEndDate(getSelectedDate() || getTodayString());
                    customTimeDropdown.style.display = 'none';
                    dropdownEl.initUI();
                });
                customTimeDropdown.appendChild(item);
            });

            setTimeout(() => {
                const sel = customTimeDropdown.querySelector('.selected');
                if (sel) {
                    customTimeDropdown.scrollTop = sel.offsetTop - customTimeDropdown.offsetTop - 10;
                }
            }, 10);
        });

        const onEndInput = () => {
            if (endTimeBtn.value) {
                setSelectedEndTime(endTimeBtn.value);
                setSelectedEndDate(getSelectedDate() || getTodayString());
            }
        };
        endTimeBtn.addEventListener('input', onEndInput);
        endTimeBtn.addEventListener('change', onEndInput);
    }

    // Close custom time dropdown if clicking elsewhere inside the time/repeat column
    const timeRepeatCol = dropdownEl.querySelector('.due-column-time-repeat');
    if (timeRepeatCol) {
        timeRepeatCol.addEventListener('click', () => {
            if (customTimeDropdown) customTimeDropdown.style.display = 'none';
        });
    }

    // Repeat Checkbox Toggle
    if (repeatCheckbox) {
        repeatCheckbox.addEventListener('change', (e) => {
            const active = e.target.checked;
            if (active) {
                if (repeatOptionsBlock) repeatOptionsBlock.style.display = 'block';
                if (!getSelectedDate()) {
                    setSelectedDate(getTodayString());
                }
                if (!getSelectedRepeat()) {
                    setSelectedRepeat('daily');
                }
            } else {
                if (repeatOptionsBlock) repeatOptionsBlock.style.display = 'none';
                setSelectedRepeat(null);
            }
            dropdownEl.initUI();
        });
    }

    function getTodayString() {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    // Render repeat list options
    function renderRepeatList() {
        if (!repeatPickerList) return;
        repeatPickerList.innerHTML = '';

        const currentRepeatVal = getSelectedRepeat();

        // Добавляем опцию "Не повторять" первой в списке
        const noRepeatSelected = !currentRepeatVal;
        const noRepeatItem = document.createElement('button');
        noRepeatItem.type = 'button';
        noRepeatItem.className = `repeat-select-item ${noRepeatSelected ? 'selected' : ''}`;
        noRepeatItem.innerHTML = `
            <span>Не повторять</span>
            ${noRepeatSelected ? '<span class="repeat-select-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
        `;
        noRepeatItem.addEventListener('click', (e) => {
            e.stopPropagation();
            setSelectedRepeat(null);
            dropdownEl.initUI();
        });
        repeatPickerList.appendChild(noRepeatItem);

        const options = getRepeatOptions(getSelectedDate());

        options.forEach(opt => {
            const isSelected = currentRepeatVal === opt.id;
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `repeat-select-item ${isSelected ? 'selected' : ''}`;
            item.innerHTML = `
                <span>${opt.text}</span>
                ${isSelected ? '<span class="repeat-select-item-checkmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="10" height="10"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ''}
            `;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!getSelectedDate()) {
                    setSelectedDate(getTodayString());
                }
                setSelectedRepeat(opt.id);
                dropdownEl.initUI();
            });

            repeatPickerList.appendChild(item);
        });
    }

    // Bind public update helpers on the dropdown element
    dropdownEl.updateRepeatListOnDateChange = () => {
        renderRepeatList();
    };

    dropdownEl.initUI = () => {
        const hasTime = !!getSelectedTime();
        const hasRepeat = !!getSelectedRepeat();

        if (timeCheckbox) {
            timeCheckbox.checked = hasTime;
        }
        
        // Поля времени и чекбокс всегда видны (display: flex / block), 
        // но их активность зависит от состояния чекбокса
        if (startTimeBtn) {
            const startVal = getSelectedTime() || '08:00';
            if (startTimeBtn.value !== startVal) {
                startTimeBtn.value = startVal;
            }
            if (hasTime) {
                startTimeBtn.classList.remove('disabled');
                startTimeBtn.removeAttribute('disabled');
            } else {
                startTimeBtn.classList.add('disabled');
                startTimeBtn.setAttribute('disabled', 'true');
            }
        }
        
        const endTimeActive = !!getSelectedEndTime();
        if (endTimeCheckbox) {
            endTimeCheckbox.checked = endTimeActive;
            if (hasTime) {
                endTimeCheckbox.removeAttribute('disabled');
            } else {
                endTimeCheckbox.setAttribute('disabled', 'true');
            }
        }

        if (endTimeBtn) {
            const endVal = getSelectedEndTime() || '09:00';
            if (endTimeBtn.value !== endVal) {
                endTimeBtn.value = endVal;
            }
            if (hasTime && endTimeActive) {
                endTimeBtn.classList.remove('disabled');
                endTimeBtn.removeAttribute('disabled');
            } else {
                endTimeBtn.classList.add('disabled');
                endTimeBtn.setAttribute('disabled', 'true');
            }
        }
        
        if (customTimeDropdown) {
            customTimeDropdown.style.display = 'none';
        }

        renderRepeatList();
    };
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

    const activeSelectedDate = tempSelectedDueDate;
    if (activeSelectedDate === dateStr) {
        cell.classList.add('selected');
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (todayStr === dateStr) {
        cell.classList.add('today');
    }

    cell.addEventListener('click', (e) => {
        e.stopPropagation();
        tempSelectedDueDate = dateStr;
        if (dueDateDropdown.updateRepeatListOnDateChange) {
            dueDateDropdown.updateRepeatListOnDateChange();
        }
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
            <button class="user-menu-item" id="btnUserMenuPomodoro">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M12 9.5C13.3807 9.5 14.5 10.6193 14.5 12 14.5 13.3807 13.3807 14.5 12 14.5 10.6193 14.5 9.5 13.3807 9.5 12 9.5 10.6193 10.6193 9.5 12 9.5ZM12 2C17.5228 2 22 6.47715 22 12 22 17.5228 17.5228 22 12 22 6.47715 22 2 17.5228 2 12 2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12 4 16.4183 7.58172 20 12 20 16.4183 20 20 16.4183 20 12 20 7.58172 16.4183 4 12 4Z"></path>
                </svg>
                <span>Помодоро</span>
            </button>
            <button class="user-menu-item" id="btnUserMenuCountdown">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>Обратный отсчет</span>
            </button>
            <button class="user-menu-item" id="btnUserMenuTrash">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Корзина</span>
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
const btnUserMenuPomodoro = document.getElementById('btnUserMenuPomodoro');
const btnUserMenuCountdown = document.getElementById('btnUserMenuCountdown');
const btnUserMenuTrash = document.getElementById('btnUserMenuTrash');
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

    if (btnUserMenuPomodoro) {
        btnUserMenuPomodoro.addEventListener('click', (e) => {
            e.stopPropagation();
            userProfileMenu.style.display = 'none';
            window.location.hash = '#pomodoro';
        });
    }

    if (btnUserMenuCountdown) {
        btnUserMenuCountdown.addEventListener('click', (e) => {
            e.stopPropagation();
            userProfileMenu.style.display = 'none';
            window.location.hash = '#countdown';
        });
    }

    if (btnUserMenuTrash) {
        btnUserMenuTrash.addEventListener('click', (e) => {
            e.stopPropagation();
            userProfileMenu.style.display = 'none';
            window.location.hash = '#trash';
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

    if (typeof updateGCalSettingsUI === 'function') {
        updateGCalSettingsUI();
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
            if (tab === 'calendars' && typeof updateGCalSettingsUI === 'function') {
                updateGCalSettingsUI();
            }
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
    } else if (currentRoute === 'pomodoro') {
        title = 'Помодоро';
    } else if (currentRoute === 'countdown') {
        title = 'Обратный отсчет';
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
    } else if (hash === 'pomodoro') {
        currentRoute = 'pomodoro';
    } else if (hash === 'countdown') {
        currentRoute = 'countdown';
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
    } else if (currentRoute === 'pomodoro') {
        if (titleEl) titleEl.textContent = 'Помодоро';
    } else if (currentRoute === 'countdown') {
        if (titleEl) titleEl.textContent = 'Обратный отсчет';
    } else if (currentRoute.startsWith('project/')) {
        const projectId = currentRoute.split('/')[1];
        const proj = projectsList.find(p => p.id === projectId);
        if (titleEl) titleEl.textContent = proj ? proj.name : 'Проект';
    } else {
        if (titleEl) titleEl.textContent = 'Входящие';
    }

    updateBrowserTitle();
    renderTasks();

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

        loadGCalConfig().then(() => {
            updateGCalSettingsUI();
            startTodoForUser(currentUid);
            startProjectsForUser(currentUid);
            startSectionsForUser(currentUid);
            startCountdownsForUser(currentUid);
            handleRoute();
        });
    } else {
        // Скрываем интерфейс
        if (todoMainLayout) todoMainLayout.style.setProperty('display', 'none', 'important');
        if (authRequiredState) authRequiredState.style.display = 'block';
        if (sidebarName) sidebarName.textContent = "Войти";
        if (sidebarAvatar) sidebarAvatar.style.display = 'none';

        stopTodoForUser();
        stopProjectsForUser();
        stopSectionsForUser();
        stopCountdownsForUser();
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

        // Синхронизация изменений с Google Календарем
        snapshot.docChanges().forEach((change) => {
            const docData = change.doc.data();
            const task = { id: change.doc.id, ...docData };

            if (change.type === "added" || change.type === "modified") {
                if (typeof handleTaskSync === 'function') {
                    handleTaskSync(task);
                }
            } else if (change.type === "removed") {
                if (typeof handleTaskDelete === 'function') {
                    handleTaskDelete(task);
                }
            }
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
    const dueEndDateForDb = selectedDueEndDate || null;
    const dueEndTimeForDb = selectedDueEndTime || null;
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
            dueEndDate: dueEndDateForDb,
            dueEndTime: dueEndTimeForDb,
            projectId: projectIdForDb,
            priority: priorityForDb,
            order: newOrder,
            createdAt: serverTimestamp()
        });

        taskTitleInput.value = '';
        selectedDueTime = null;
        selectedDueRepeat = null;
        selectedDueEndDate = null;
        selectedDueEndTime = null;
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
            sectionId: task.sectionId || null,
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
                    sectionId: task.sectionId || null,
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
    const task = allTasks.find(t => t.id === taskId);
    if (task && task.title && task.title.startsWith('* ')) return;
    if (pendingCompletions.has(taskId)) return;

    pendingCompletions.add(taskId);
    try {
        const task = allTasks.find(t => t.id === taskId);
        const promises = [];

        const todayStr = getLocalDateString(new Date());

        // 1. Подготавливаем обновление текущей задачи
        const deleteCompletedPref = localStorage.getItem('todo_pref_delete_completed') === 'true';
        let updatePromise;
        const taskFields = {
            completed: !currentStatus,
            completedDate: !currentStatus ? todayStr : null
        };

        if (!currentStatus && task && (task.estPomos !== undefined || task.inPomodoro)) {
            const finalAct = task.actPomos || 0;
            taskFields.estPomos = finalAct;
            task.estPomos = finalAct;
        }

        if (!currentStatus && deleteCompletedPref) {
            taskFields.deleted = true;
            taskFields.deletedAt = serverTimestamp();
            taskFields.completed = true;
        }

        updatePromise = updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), taskFields);
        promises.push(updatePromise);

        // 1.1. Каскадное выполнение подзадач при завершении родительской задачи
        if (!currentStatus) {
            const subtasksToUpdate = allTasks.filter(t => t.parentId === taskId && !t.deleted && !t.completed && !(t.title && t.title.startsWith('* ')));
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
                let nextEndDateStr = null;
                if (task.dueEndDate) {
                    const diffMs = new Date(task.dueEndDate) - new Date(task.dueDate);
                    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                    const nextEndDateObj = new Date(nextDateStr);
                    nextEndDateObj.setDate(nextEndDateObj.getDate() + diffDays);
                    nextEndDateStr = `${nextEndDateObj.getFullYear()}-${String(nextEndDateObj.getMonth() + 1).padStart(2, '0')}-${String(nextEndDateObj.getDate()).padStart(2, '0')}`;
                }
                nextDateFormatted = formatDueDateDisplay(nextDateStr, task.dueTime || null, null, nextEndDateStr, task.dueEndTime || null);
                addPromise = addDoc(collection(db, 'users', currentUid, 'tasks'), {
                    title: task.title,
                    completed: false,
                    dueDate: nextDateStr,
                    dueTime: task.dueTime || null,
                    dueRepeat: task.dueRepeat,
                    dueEndDate: nextEndDateStr,
                    dueEndTime: task.dueEndTime || null,
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
        <div class="due-modal-overlay" style="display: none;">
            <div class="due-date-dropdown new-modal-layout" style="display: none; position: relative !important; margin: 0 !important; z-index: 2000;">
            <!-- Колонка 1: Дата -->
            <div class="due-column due-column-date">
                <div class="due-quick-options">
                    <button class="quick-opt-btn" type="button" data-date="today">
                        <span class="quick-opt-left">
                            <span class="quick-opt-icon" style="color: #22c55e;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            </span>
                            <span>Сегодня</span>
                        </span>
                        <span class="quick-opt-day-name">Вс</span>
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
                        <span class="quick-opt-day-name">Пн</span>
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
            </div>
            
            <div class="due-vertical-divider"></div>
            
            <!-- Колонка 2: Время и Повтор -->
            <div class="due-column due-column-time-repeat">
                <!-- Время -->
                <div class="due-row-time-trigger">
                    <div class="due-checkbox-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="margin-right: 4px; vertical-align: middle; color: var(--text-secondary);">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span>Время</span>
                    </div>
                </div>
                
                <!-- Поля ввода времени (всегда видны) -->
                <div class="due-time-inputs-wrapper" style="display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-left: 0;">
                    <input type="checkbox" class="due-time-checkbox" style="margin-right: 2px;">
                    <input class="pill-btn start-time-btn" type="time" value="08:00">
                    <span class="time-dash">—</span>
                    <input class="pill-btn end-time-btn disabled" type="time" value="09:00" disabled>
                    <input type="checkbox" class="end-time-active-checkbox" style="margin-left: 4px;">
                </div>
                
                <!-- Кастомный выпадающий список времени -->
                <div class="custom-time-dropdown" style="display: none;"></div>
                
                <div class="due-divider" style="margin: 12px 0;"></div>

                <!-- Повтор -->
                <div class="due-row-repeat-trigger">
                    <div class="due-checkbox-label">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="margin-right: 4px; vertical-align: middle; color: var(--text-secondary);">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                        </svg>
                        <span>Повтор</span>
                    </div>
                </div>
                
                <!-- Повторять задачу (всегда видно) -->
                <div class="due-repeat-options-block" style="display: block; margin-top: 10px;">
                    <div class="repeat-picker-list" style="display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto;">
                        <!-- Будет заполнено динамически -->
                    </div>
                </div>

                <!-- Подвал с кнопками Отмена и Сохранить внутри правой колонки -->
                <div class="due-modal-footer">
                    <button class="due-btn-cancel" type="button">Отмена</button>
                    <button class="due-btn-save" type="button">Сохранить</button>
                </div>
            </div>
        </div>
    </div>
    `;
}

function initCalendarForWrapper(wrapperEl, activeDate, activeTime, activeRepeat, onSelect, activeEndDate = null, activeEndTime = null) {
    let localSelectedDate = activeDate;
    let localSelectedTime = activeTime;
    let localSelectedRepeat = activeRepeat;
    let localSelectedEndDate = activeEndDate;
    let localSelectedEndTime = activeEndTime;

    let originalDate = activeDate;
    let originalTime = activeTime;
    let originalRepeat = activeRepeat;
    let originalEndDate = activeEndDate;
    let originalEndTime = activeEndTime;
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
            if (dropdown.updateRepeatListOnDateChange) dropdown.updateRepeatListOnDateChange();
        },
        () => localSelectedTime,
        (timeStr) => { localSelectedTime = timeStr; },
        () => localSelectedRepeat,
        (repeatStr) => { localSelectedRepeat = repeatStr; },
        () => localSelectedEndDate,
        (dateStr) => { localSelectedEndDate = dateStr; },
        () => localSelectedEndTime,
        (timeStr) => { localSelectedEndTime = timeStr; },
        () => {
            if (!localSelectedDate) {
                textLabel.textContent = 'Срок';
                if (clearIcon) clearIcon.style.display = 'none';
                btn.classList.remove('active');
            } else {
                textLabel.textContent = formatDueDateDisplay(localSelectedDate, localSelectedTime, localSelectedRepeat, localSelectedEndDate, localSelectedEndTime);
                if (clearIcon) clearIcon.style.display = 'inline-flex';
                btn.classList.add('active');
            }
            onSelect(localSelectedDate, localSelectedTime, localSelectedRepeat, localSelectedEndDate, localSelectedEndTime);
            closeDropdown();
        },
        () => {
            localSelectedDate = originalDate;
            localSelectedTime = originalTime;
            localSelectedRepeat = originalRepeat;
            localSelectedEndDate = originalEndDate;
            localSelectedEndTime = originalEndTime;
            renderGrid();
            closeDropdown();
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
        const overlay = dropdown.parentElement;
        if (overlay && overlay.classList.contains('due-modal-overlay')) {
            overlay.style.display = 'flex';
        }
        dropdown.style.display = 'flex';
        renderGrid();
        if (typeof dropdown.initUI === 'function') {
            dropdown.initUI();
        }
        if (typeof updateModalOverflow === 'function') updateModalOverflow();
    };

    const closeDropdown = () => {
        const overlay = dropdown.parentElement;
        if (overlay && overlay.classList.contains('due-modal-overlay')) {
            overlay.style.display = 'none';
        }
        dropdown.style.display = 'none';
        if (typeof updateModalOverflow === 'function') updateModalOverflow();
    };

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.style.display === 'none') {
                // Закрываем другие выпадающие списки
                document.querySelectorAll('.due-date-dropdown').forEach(dd => {
                    if (dd !== dropdown && !dd.contains(e.target)) dd.style.display = 'none';
                });
                openDropdown();
            } else {
                closeDropdown();
            }
        });
    }

    if (clearIcon) {
        clearIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            localSelectedTime = null;
            localSelectedRepeat = null;
            localSelectedEndDate = null;
            localSelectedEndTime = null;
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
            renderGrid();
        });
    });

    // Навигация
    const prevBtn = dropdown.querySelector('.cal-prev-month');
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            localMonth--;
            if (localMonth < 0) {
                localMonth = 11;
                localYear--;
            }
            renderGrid();
        });
    }
    const nextBtn = dropdown.querySelector('.cal-next-month');
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            localMonth++;
            if (localMonth > 11) {
                localMonth = 0;
                localYear++;
            }
            renderGrid();
        });
    }
    const currBtn = dropdown.querySelector('.cal-current-month');
    if (currBtn) {
        currBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            localYear = new Date().getFullYear();
            localMonth = new Date().getMonth();
            renderGrid();
        });
    }

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

        if (!isCurrentMonth) {
            cell.classList.add('other-month');
        }

        const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        if (localSelectedDate === dateStr) {
            cell.classList.add('selected');
        }

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
        if (dropdown.updateRepeatListOnDateChange) dropdown.updateRepeatListOnDateChange();
        if (dropdown.initUI) dropdown.initUI();
    }

    return {
        updateState: (date, time, repeat, endDate = null, endTime = null) => {
            localSelectedDate = date;
            localSelectedTime = time;
            localSelectedRepeat = repeat;
            localSelectedEndDate = endDate;
            localSelectedEndTime = endTime;
            originalDate = date;
            originalTime = time;
            originalRepeat = repeat;
            originalEndDate = endDate;
            originalEndTime = endTime;
            if (date) {
                localYear = parseInt(date.split('-')[0], 10);
                localMonth = parseInt(date.split('-')[1], 10) - 1;
            } else {
                localYear = new Date().getFullYear();
                localMonth = new Date().getMonth();
            }
            if (!localSelectedDate) {
                textLabel.textContent = 'Срок';
                if (clearIcon) clearIcon.style.display = 'none';
                btn.classList.remove('active');
            } else {
                textLabel.textContent = formatDueDateDisplay(localSelectedDate, localSelectedTime, localSelectedRepeat, localSelectedEndDate, localSelectedEndTime);
                if (clearIcon) clearIcon.style.display = 'inline-flex';
                btn.classList.add('active');
            }
            if (typeof dropdown.initUI === 'function') {
                dropdown.initUI();
            }
        }
    };
}

// Переименование задачи (Карточка редактирования)
function enableInlineEdit(taskItemEl, task, titleSpan) {
    if (taskItemEl.classList.contains('editing')) return;

    taskItemEl.classList.add('editing');

    let editSelectedDueDate = task.dueDate;
    let editSelectedDueTime = task.dueTime || null;
    let editSelectedDueRepeat = task.dueRepeat || null;
    let editSelectedDueEndDate = task.dueEndDate || null;
    let editSelectedDueEndTime = task.dueEndTime || null;
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
                        <span class="due-date-text">${formatDueDateDisplay(editSelectedDueDate, editSelectedDueTime, editSelectedDueRepeat, editSelectedDueEndDate, editSelectedDueEndTime)}</span>
                        <span class="clear-due-icon" style="display: ${editSelectedDueDate ? 'inline-flex' : 'none'};" title="Очистить">&times;</span>
                    </button>
                </div>
                ${!task.parentId ? `
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
                ` : ''}
                
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
    initCalendarForWrapper(wrapper, editSelectedDueDate, editSelectedDueTime, editSelectedDueRepeat, (dateStr, timeStr, repeatStr, endDateStr, endTimeStr) => {
        editSelectedDueDate = dateStr;
        editSelectedDueTime = timeStr;
        editSelectedDueRepeat = repeatStr;
        editSelectedDueEndDate = endDateStr;
        editSelectedDueEndTime = endTimeStr;
    }, editSelectedDueEndDate, editSelectedDueEndTime);

    // Инициализируем выбор проекта для редактирования
    const editProjectWrapper = editContainer.querySelector('.edit-task-project-wrapper');
    if (editProjectWrapper) {
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
    }

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
        const endDateChanged = editSelectedDueEndDate !== (task.dueEndDate || null);
        const endTimeChanged = editSelectedDueEndTime !== (task.dueEndTime || null);
        const projectChanged = editSelectedProjectId !== (task.projectId || null);
        const priorityChanged = editSelectedPriority !== (task.priority || 0);

        if (titleChanged || dateChanged || timeChanged || repeatChanged || endDateChanged || endTimeChanged || projectChanged || priorityChanged) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                    title: newTitle,
                    dueDate: editSelectedDueDate,
                    dueTime: editSelectedDueTime,
                    dueRepeat: editSelectedDueRepeat,
                    dueEndDate: editSelectedDueEndDate,
                    dueEndTime: editSelectedDueEndTime,
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

        // Рендерим подзадачи родительской задачи (только активные на главном экране)
        const subtasks = allTasks.filter(t => t.parentId === task.id && !t.deleted && !t.completed);

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
    // Устанавливаем класс роута на body
    document.body.classList.remove('route-today', 'route-tomorrow', 'route-inbox', 'route-trash', 'route-pomodoro', 'route-countdown');
    if (currentRoute === 'today') {
        document.body.classList.add('route-today');
    } else if (currentRoute === 'tomorrow') {
        document.body.classList.add('route-tomorrow');
    } else if (currentRoute === 'trash') {
        document.body.classList.add('route-trash');
    } else if (currentRoute === 'inbox') {
        document.body.classList.add('route-inbox');
    } else if (currentRoute === 'pomodoro') {
        document.body.classList.add('route-pomodoro');
    } else if (currentRoute === 'countdown') {
        document.body.classList.add('route-countdown');
    }

    const pomoContainerLocal = document.getElementById('pomodoroContainer');
    if (pomoContainerLocal) {
        pomoContainerLocal.style.display = currentRoute === 'pomodoro' ? 'flex' : 'none';
        if (currentRoute === 'pomodoro') {
            if (typeof updatePomoActiveTaskUI === 'function') {
                updatePomoActiveTaskUI();
            }
        }
    }

    const countdownContainer = document.getElementById('countdownContainer');
    const countdownHeaderActions = document.getElementById('countdownHeaderActions');
    if (countdownContainer) {
        countdownContainer.style.display = currentRoute === 'countdown' ? 'flex' : 'none';
        if (currentRoute === 'countdown') {
            renderCountdowns();
        }
    }
    if (countdownHeaderActions) {
        countdownHeaderActions.style.display = currentRoute === 'countdown' ? 'flex' : 'none';
    }

    if (activeTasksContainer) {
        activeTasksContainer.style.display = (currentRoute === 'pomodoro' || currentRoute === 'countdown') ? 'none' : 'block';
    }
    const gcalBannerLocal = document.getElementById('gcalEventsBanner');
    if (gcalBannerLocal && (currentRoute === 'pomodoro' || currentRoute === 'countdown')) {
        gcalBannerLocal.style.display = 'none';
    }

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
        addTaskFormEl.style.display = (currentRoute === 'trash' || currentRoute === 'pomodoro' || currentRoute === 'countdown') ? 'none' : 'flex';
    }

    const projectHeaderActions = document.getElementById('projectHeaderActions');
    if (projectHeaderActions) {
        projectHeaderActions.style.display = (currentRoute === 'pomodoro' || currentRoute === 'countdown') ? 'none' : ((currentRoute.startsWith('project/') || currentRoute === 'today' || currentRoute === 'inbox') ? 'block' : 'none');
    }

    // Фильтруем задачи для отображения в зависимости от текущей вкладки (роута)
    let displayActiveTasks = [];
    let displayCompletedTasks = [];

    renderCountdownEventsBanner();

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
    } else if (currentRoute === 'pomodoro' || currentRoute === 'countdown') {
        displayActiveTasks = [];
        displayCompletedTasks = [];
    } else { // inbox
        displayActiveTasks = activeTasks.filter(t => !t.projectId);
        displayCompletedTasks = completedTasks.filter(t => !t.projectId);
    }

    // Выполненные подзадачи скрываются из главного экрана
    displayCompletedTasks = displayCompletedTasks.filter(t => !t.parentId);

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
                        <div class="progress-left">
                            <div class="progress-circle-container">
                                <svg class="progress-svg" viewBox="0 0 36 36">
                                    <path class="progress-bg-circle" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                                    <path class="progress-fill-circle" id="todayProgressFillCircle" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                                </svg>
                                <div class="progress-text-center" id="todayProgressText">0%</div>
                                <div class="progress-confetti-wrapper" style="display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 220px; height: 220px; pointer-events: none; z-index: 10;"></div>
                            </div>
                            <div class="progress-info">
                                <div class="progress-title">Прогресс на сегодня</div>
                                <div class="progress-subtitle" id="todayProgressSubtitle">Нет задач на сегодня</div>
                            </div>
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
                const confettiWrapper = todayProgressWidget.querySelector('.progress-confetti-wrapper');

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
                if (confettiWrapper) {
                    if (percent === 100 && totalCount > 0) {
                        if (!confettiWrapper.querySelector('dotlottie-wc')) {
                            confettiWrapper.innerHTML = `<dotlottie-wc src="https://lottie.host/b80d2982-26dd-4374-94b4-1fc4148ebb2c/IN4nSJrRKy.lottie" style="width: 220px; height: 220px; display: block;" autoplay></dotlottie-wc>`;
                        }
                        confettiWrapper.style.display = 'block';
                    } else {
                        confettiWrapper.style.display = 'none';
                        confettiWrapper.innerHTML = '';
                    }
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
                            if (window.innerWidth > 768) return;
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
                if (currentRoute === 'today') {
                    const overdueActiveTasks = activeTasks.filter(t => t.dueDate && t.dueDate < todayStr);
                    sortTasksByOrder(overdueActiveTasks);

                    if (overdueActiveTasks.length > 0) {
                        // Render overdue section
                        const isOverdueCollapsed = localStorage.getItem('todo_today_overdue_collapsed') === 'true';
                        const overdueSectionEl = document.createElement('div');
                        overdueSectionEl.className = `project-section today-overdue-section ${isOverdueCollapsed ? 'collapsed' : ''}`;
                        overdueSectionEl.style.marginTop = '20px';
                        overdueSectionEl.innerHTML = `
                            <div class="project-section-header" style="cursor: pointer;">
                                <button class="section-collapse-btn" type="button" aria-label="Свернуть/развернуть раздел">
                                    <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                <span class="section-title-text" style="font-weight: 600;">Просрочено</span>
                                <span style="color: var(--text-secondary); font-size: 0.9rem; font-weight: normal; margin-left: 2px;">${overdueActiveTasks.length}</span>
                            </div>
                            <div class="section-tasks-container" style="${isOverdueCollapsed ? 'display: none;' : ''}; min-height: 20px;"></div>
                        `;
                        activeTasksContainer.appendChild(overdueSectionEl);

                        const overdueContainer = overdueSectionEl.querySelector('.section-tasks-container');
                        overdueActiveTasks.forEach(task => {
                            const el = createTaskRowElement(task);
                            overdueContainer.appendChild(el);
                        });

                        overdueSectionEl.querySelector('.project-section-header').addEventListener('click', () => {
                            const collapsed = localStorage.getItem('todo_today_overdue_collapsed') === 'true';
                            localStorage.setItem('todo_today_overdue_collapsed', !collapsed);
                            renderTasks();
                        });

                        // Render today section
                        const isTodayCollapsed = localStorage.getItem('todo_today_current_collapsed') === 'true';
                        const todaySectionEl = document.createElement('div');
                        todaySectionEl.className = `project-section today-current-section ${isTodayCollapsed ? 'collapsed' : ''}`;
                        todaySectionEl.style.marginTop = '20px';
                        todaySectionEl.innerHTML = `
                            <div class="project-section-header" style="cursor: pointer;">
                                <button class="section-collapse-btn" type="button" aria-label="Свернуть/развернуть раздел">
                                    <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>
                                <span class="section-title-text" style="font-weight: 600;">Сегодня</span>
                                <span style="color: var(--text-secondary); font-size: 0.9rem; font-weight: normal; margin-left: 2px;">${displayActiveTasks.length}</span>
                            </div>
                            <div class="section-tasks-container" style="${isTodayCollapsed ? 'display: none;' : ''}; min-height: 20px;"></div>
                        `;
                        activeTasksContainer.appendChild(todaySectionEl);

                        const todayContainer = todaySectionEl.querySelector('.section-tasks-container');
                        displayActiveTasks.forEach(task => {
                            const el = createTaskRowElement(task);
                            todayContainer.appendChild(el);
                        });

                        todaySectionEl.querySelector('.project-section-header').addEventListener('click', () => {
                            const collapsed = localStorage.getItem('todo_today_current_collapsed') === 'true';
                            localStorage.setItem('todo_today_current_collapsed', !collapsed);
                            renderTasks();
                        });
                    } else {
                        // Render standard list without headers
                        displayActiveTasks.forEach(task => {
                            const el = createTaskRowElement(task);
                            activeTasksContainer.appendChild(el);
                        });
                    }
                } else if (currentRoute === 'tomorrow') {
                    displayActiveTasks.forEach(task => {
                        const el = createTaskRowElement(task);
                        activeTasksContainer.appendChild(el);
                    });
                } else {
                    renderTasksGroup(displayActiveTasks, activeTasksContainer);
                }
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

    if (currentRoute === 'pomodoro' || currentRoute === 'countdown') {
        if (completedSection) completedSection.style.display = 'none';
    } else if (displayCompletedTasks.length === 0 || isCompletedHiddenForProject) {
        if (completedSection) completedSection.style.display = 'none';
    } else {
        if (completedSection) completedSection.style.display = 'block';
        if (completedToggleText) completedToggleText.textContent = `Выполненные (${displayCompletedTasks.length})`;

        if (currentRoute === 'today' || currentRoute === 'tomorrow') {
            displayCompletedTasks.forEach(task => {
                const el = createTaskRowElement(task);
                completedTasksContainer.appendChild(el);
            });
        } else {
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

                // Выполненные подзадачи скрыты из главного экрана
                const subtasks = [];
                sortTasksByOrder(subtasks);

                const isCollapsed = isParentTaskCollapsed(task.id);
                if (!isCollapsed) {
                    subtasks.forEach(subtask => {
                        const subEl = createTaskRowElement(subtask);
                        completedTasksContainer.appendChild(subEl);
                    });
                }
            });
        }

        updateCompletedToggleUI();
    }
    // Снимаем блокировку ховера после перестроения списка в DOM
    setTimeout(() => {
        if (activeTasksContainer) activeTasksContainer.classList.remove('disable-hover');
        if (completedTasksContainer) completedTasksContainer.classList.remove('disable-hover');
    }, 50);

    renderProjects();
    syncModalIfOpen();

    // Обновление баннера Google Календаря
    if (typeof fetchAndRenderGCalEvents === 'function') {
        fetchAndRenderGCalEvents();
    }
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
    if (task.isCountdown) {
        const item = document.createElement('div');
        item.className = `task-item priority-0`;
        item.setAttribute('data-id', task.id);
        
        item.innerHTML = `
            <div class="checkbox-wrapper" style="pointer-events: none; margin-left: 8px;">
                <span style="font-size: 15px; margin-right: 4px; display: inline-block; vertical-align: middle;">${task.icon || '⏳'}</span>
            </div>
            <div class="task-content">
                <span class="task-title-text">${formatTaskTitle(task.title)}</span>
            </div>
            <span class="task-due-badge" style="opacity: 0.6; margin-left: auto; margin-right: 8px;">
                <span style="vertical-align: middle;">Обратный отсчет</span>
            </span>
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
                        <span>Изменить</span>
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
        
        item.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn') || e.target.closest('.task-actions-dropdown')) {
                return;
            }
            window.location.hash = '#countdown';
        });

        const btnMore = item.querySelector('.btn-more');
        const actionsDropdown = item.querySelector('.task-actions-dropdown');

        const openActionsDropdown = (ev = null) => {
            document.querySelectorAll('.task-actions-dropdown').forEach(d => {
                if (d !== actionsDropdown) d.style.display = 'none';
            });
            document.querySelectorAll('.task-item').forEach(ti => {
                if (ti !== item) ti.classList.remove('menu-open');
            });

            if (actionsDropdown.style.display === 'none' || actionsDropdown.style.display === '') {
                actionsDropdown.style.display = 'block';
                item.classList.add('menu-open');
                
                if (ev) {
                    const rect = item.getBoundingClientRect();
                    const x = ev.clientX - rect.left;
                    const y = ev.clientY - rect.top;
                    actionsDropdown.style.left = `${x}px`;
                    actionsDropdown.style.top = `${y}px`;
                } else {
                    actionsDropdown.style.left = '';
                    actionsDropdown.style.top = '';
                }
            } else {
                actionsDropdown.style.display = 'none';
                item.classList.remove('menu-open');
            }
        };

        btnMore.addEventListener('click', (e) => {
            e.stopPropagation();
            openActionsDropdown();
        });

        item.addEventListener('contextmenu', (e) => {
            if (window.matchMedia('(hover: hover)').matches) {
                e.preventDefault();
                e.stopPropagation();
                openActionsDropdown(e);
            }
        });

        actionsDropdown.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');
            openCountdownModal(task);
        });

        actionsDropdown.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');
            showCustomConfirm(
                'Удалить событие?',
                `Вы действительно хотите удалить обратный отсчет <strong>${escapeHtml(task.title)}</strong>?`,
                'Удалить',
                async () => {
                    try {
                        await deleteDoc(doc(db, 'users', currentUid, 'countdowns', task.id));
                    } catch (err) {
                        console.error("Ошибка при удалении обратного отсчета:", err);
                    }
                }
            );
        });

        return item;
    }

    const isSubtask = !!task.parentId;
    const hasSubtasks = !isSubtask && allTasks.some(t => t.parentId === task.id && !t.deleted && !t.completed);
    const isCollapsed = hasSubtasks && isParentTaskCollapsed(task.id);

    let dueLabel = '';
    if (task.dueDate) {
        dueLabel = formatDueDateDisplay(task.dueDate, task.dueTime, task.dueRepeat, task.dueEndDate, task.dueEndTime);
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

    const project = task.projectId ? projectsList.find(p => p.id === task.projectId) : null;

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
        <div class="checkbox-wrapper" style="${(task.title && task.title.startsWith('* ')) ? 'display: none;' : ''}">
            <button class="custom-checkbox" aria-label="${task.completed ? 'Отметить невыполненной' : 'Отметить выполненной'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
        </div>
        <div class="task-content">
            <span class="task-title-text">${formatTaskTitle(task.title)}</span>
        </div>
        ${task.dueDate ? (() => {
            let isProj = false;
            if (task.dueDate && (currentRoute === 'today' || currentRoute === 'tomorrow')) {
                const tdy = new Date();
                const tdyS = tdy.getFullYear() + '-' + String(tdy.getMonth() + 1).padStart(2, '0') + '-' + String(tdy.getDate()).padStart(2, '0');
                const tmr = new Date();
                tmr.setDate(tmr.getDate() + 1);
                const tmrS = tmr.getFullYear() + '-' + String(tmr.getMonth() + 1).padStart(2, '0') + '-' + String(tmr.getDate()).padStart(2, '0');
                if (task.dueDate === tdyS || task.dueDate === tmrS) {
                    isProj = true;
                }
            }
            let bStyle = 'style="margin-left: auto;"';
            if (isProj) {
                if (project && project.color) {
                    bStyle = `style="color: ${project.color} !important; border-color: ${hexToRgba(project.color, 0.15)} !important; background-color: ${hexToRgba(project.color, 0.08)} !important; margin-left: auto;"`;
                } else {
                    bStyle = `style="color: #71717a !important; border-color: rgba(113, 113, 122, 0.15) !important; background-color: rgba(113, 113, 122, 0.08) !important; margin-left: auto;"`;
                }
            }
            return `
            <span class="task-due-badge ${isDateToday(task.dueDate) ? 'today' : (isDateOverdue(task.dueDate) ? 'overdue' : '')}" ${bStyle}>
                ${!isProj ? `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align: middle; margin-right: 3px; display: inline-block;">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ` : ''}
                <span style="vertical-align: middle;">${dueLabel}</span>
                ${task.dueRepeat ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10" style="vertical-align: middle; margin-left: 4px; display: inline-block;">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                    </svg>
                ` : ''}
            </span>
            `;
        })() : ''}
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

                <button class="dropdown-item btn-toggle-pomodoro">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="margin-right: 2.5px;" width="14" height="14">
                        <path d="M12 9.5C13.3807 9.5 14.5 10.6193 14.5 12 14.5 13.3807 13.3807 14.5 12 14.5 10.6193 14.5 9.5 13.3807 9.5 12 9.5 10.6193 10.6193 9.5 12 9.5ZM12 2C17.5228 2 22 6.47715 22 12 22 17.5228 17.5228 22 12 22 6.47715 22 2 17.5228 2 12 2 6.47715 6.47715 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12 4 16.4183 7.58172 20 12 20 16.4183 20 20 16.4183 20 12 20 7.58172 16.4183 4 12 4Z"></path>
                    </svg>
                    <span>${task.inPomodoro ? 'Удалить из Помодоро' : 'Добавить в Помодоро'}</span>
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
        if (task.title && task.title.startsWith('* ')) return;

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
            btnDueSelect.addEventListener('click', (e) => {
                e.stopPropagation();
                actionsDropdown.style.display = 'none';
                item.classList.remove('menu-open');

                calendarTargetTask = {
                    id: task.id,
                    dueDate: task.dueDate || null,
                    dueTime: task.dueTime || null,
                    dueRepeat: task.dueRepeat || null,
                    dueEndDate: task.dueEndDate || null,
                    dueEndTime: task.dueEndTime || null
                };

                openDueDateDropdown();
            });
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
                        dueRepeat: null,
                        dueEndDate: null,
                        dueEndTime: null
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
            if (window.innerWidth > 768) return;
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

    const btnTogglePomodoro = item.querySelector('.btn-toggle-pomodoro');
    if (btnTogglePomodoro) {
        btnTogglePomodoro.addEventListener('click', async (e) => {
            e.stopPropagation();
            actionsDropdown.style.display = 'none';
            item.classList.remove('menu-open');
            
            const newInPomo = !task.inPomodoro;
            task.inPomodoro = newInPomo;
            
            const localTask = allTasks.find(t => t.id === task.id);
            if (localTask) localTask.inPomodoro = newInPomo;
            
            if (newInPomo && !pomoActiveTaskId) {
                pomoActiveTaskId = task.id;
            } else if (!newInPomo && pomoActiveTaskId === task.id) {
                pomoActiveTaskId = null;
            }
            
            renderTasks();
            
            try {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                    inPomodoro: newInPomo
                });
            } catch (err) {
                console.error("Ошибка при обновлении статуса Помодоро:", err);
            }
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

    // Клик на саму задачу открывает модалку деталей
    item.addEventListener('click', (e) => {
        if (e.target.closest('button, input, textarea, a, .checkbox-wrapper, .custom-checkbox, .task-actions-dropdown, .task-drag-handle, .new-subtask-temp')) {
            return;
        }
        if (item.classList.contains('editing')) {
            return;
        }
        openTaskDetailsModal(task.id);
    });

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

            const parentTask = allTasks.find(t => t.id === parentId);
            const parentSectionId = parentTask ? (parentTask.sectionId || null) : null;

            try {
                await addDoc(collection(db, 'users', currentUid, 'tasks'), {
                    title: text,
                    completed: false,
                    dueDate: null,
                    dueTime: null,
                    dueRepeat: null,
                    projectId: projectId || null,
                    sectionId: parentSectionId,
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

// Вспомогательные функции для работы с датами
function getLocalDateString(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    let displayTitle = title;
    if (displayTitle.startsWith('* ')) {
        displayTitle = displayTitle.slice(2);
    }
    const escaped = escapeHtml(displayTitle);
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

            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : Date.now();
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : Date.now();
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

function startCountdownsForUser(uid) {
    if (unsubscribeCountdowns) unsubscribeCountdowns();

    const qCountdowns = query(collection(db, 'users', uid, 'countdowns'));

    unsubscribeCountdowns = onSnapshot(qCountdowns, (snapshot) => {
        const newCountdownsList = [];
        snapshot.forEach((docSnap) => {
            newCountdownsList.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Detect deletions by comparing old countdownsList with newCountdownsList
        countdownsList.forEach(oldCd => {
            const stillExists = newCountdownsList.some(newCd => newCd.id === oldCd.id);
            if (!stillExists) {
                handleCountdownDelete(oldCd);
            }
        });

        countdownsList = newCountdownsList;

        countdownsList.sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
            }
            return new Date(a.targetDate) - new Date(b.targetDate);
        });

        // Trigger sync for all current countdowns
        countdownsList.forEach(cd => {
            handleCountdownSync(cd);
        });

        if (currentRoute === 'countdown') {
            renderCountdowns();
        }
        if (typeof renderCountdownEventsBanner === 'function') {
            renderCountdownEventsBanner();
        }
    }, (error) => {
        console.error("Ошибка при получении списка обратных отсчетов:", error);
    });
}

function stopCountdownsForUser() {
    if (unsubscribeCountdowns) {
        unsubscribeCountdowns();
        unsubscribeCountdowns = null;
    }
    countdownsList = [];
    const grid = document.getElementById('countdownGrid');
    if (grid) grid.innerHTML = '';
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
                <span style="display: flex; align-items: center; gap: 8px;">
                    ${project.color ? `<span class="project-color-dot" style="background-color: ${project.color};"></span>` : ''}
                    <span class="menu-counter" style="${(showCounters && !hideProjectCount && projectTaskCount > 0) ? '' : 'display:none'}">${projectTaskCount}</span>
                </span>
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
                    let maxOrder = 0;
                    if (projectsList.length > 0) {
                        maxOrder = Math.max(...projectsList.map(p => p.order !== undefined ? p.order : 0));
                    }
                    await addDoc(collection(db, 'users', currentUid, 'projects'), {
                        name: nameText,
                        order: maxOrder + 1000,
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
            <button class="dropdown-item" id="btnProjectToggleCompleted">
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
        <button class="dropdown-item" id="btnProjectAddSection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px; flex-shrink: 0;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Добавить раздел</span>
        </button>
        <button class="dropdown-item" id="btnProjectRename">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Переименовать</span>
        </button>
        <button class="dropdown-item" id="btnProjectChangeColor">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="5" fill="currentColor"></circle></svg>
            <span>Изменить цвет</span>
        </button>
        <button class="dropdown-item" id="btnProjectToggleCompleted">
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
        <div class="dropdown-divider"></div>
        <button class="dropdown-item btn-delete" id="btnProjectDelete">
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

    document.getElementById('btnProjectRename').addEventListener('click', (e) => {
        e.stopPropagation();
        projectHeaderDropdown.style.display = 'none';
        enableHeaderProjectInlineEdit(projectId, project.name);
    });

    document.getElementById('btnProjectChangeColor').addEventListener('click', (e) => {
        e.stopPropagation();
        projectHeaderDropdown.style.display = 'none';
        showProjectColorModal(projectId);
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

function enableHeaderProjectInlineEdit(projectId, oldName) {
    const titleEl = document.querySelector('.list-title');
    if (!titleEl) return;

    const oldVal = oldName;
    titleEl.innerHTML = `<input type="text" class="inline-header-project-edit-input" value="${escapeHtml(oldVal)}" maxlength="50">`;
    const input = titleEl.querySelector('input');
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
                titleEl.textContent = newVal;
                updateBrowserTitle();
            } catch (err) {
                console.error("Ошибка при изменении названия проекта:", err);
                titleEl.textContent = oldVal;
            }
        } else {
            titleEl.textContent = oldVal;
        }
    }

    input.addEventListener('blur', commitSave);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            commitSave();
        } else if (e.key === 'Escape') {
            finished = true;
            titleEl.textContent = oldVal;
        }
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

    const containers = [activeTasksContainer, completedTasksContainer, document.getElementById('pomoTasksList')];

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
            if (container === activeTasksContainer && (currentRoute.startsWith('project/') || (currentRoute === 'today' && activeTasksContainer.querySelector('.section-tasks-container')))) {
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

            if (currentRoute === 'today' && parentContainer) {
                const sectEl = parentContainer.closest('.project-section');
                if (sectEl && sectEl.classList.contains('today-current-section')) {
                    const today = new Date();
                    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                    updateFields.dueDate = todayStr;
                    const task = allTasks.find(t => t.id === taskId);
                    if (task) {
                        task.dueDate = todayStr;
                    }
                }
            }

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
        <div class="ctx-item" id="ctx-change-color-project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="5" fill="currentColor"></circle></svg>
            <span>Изменить цвет</span>
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

    // Обработчик изменения цвета проекта
    menu.querySelector('#ctx-change-color-project').addEventListener('click', (evt) => {
        evt.stopPropagation();
        menu.remove();
        activeContextMenu = null;
        showProjectColorModal(projectId);
    });

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
        reader.onload = function (evt) {
            const img = new Image();
            img.onload = function () {
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


function hexToRgba(hex, alpha = 1) {
    if (!hex) return '';
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    let r, g, b;
    let i = Math.floor(h / 60);
    let f = h / 60 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function hexToHsv(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h;
    if (d === 0) h = 0;
    else if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else if (max === b) h = (r - g) / d + 4;
    h = Math.round(h * 60);

    const s = Math.round(max === 0 ? 0 : (d / max) * 100);
    const v = Math.round(max * 100);
    return { h, s, v };
}

function showProjectColorModal(projectId) {
    const project = projectsList.find(p => p.id === projectId);
    if (!project) return;

    let selectedColor = project.color || null;
    const presets = [
        '#dc2626',
        '#f97316',
        '#eab308',
        '#84cc16',
        '#22c55e',
        '#3b82f6',
        '#8b5cf6'
    ];

    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';
    overlay.style.zIndex = '1050';

    overlay.innerHTML = '<div class="confirm-box" style="width: 380px; padding: 24px; border-radius: 16px; position: relative;">' +
        '<div class="confirm-title" style="font-size: 18px; margin-bottom: 20px; font-weight: 600; text-align: center;">Изменить цвет</div>' +
        '<div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">' +
        '<span style="font-size: 14px; font-weight: 500; color: var(--text-secondary);">Цвет списка</span>' +
        '<div class="color-presets-container" style="display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;">' +
        '<div class="color-circle no-color ' + (!selectedColor ? 'active' : '') + '" data-color="" style="--active-color: #d1d5db;"></div>' +
        presets.map(color => '<div class="color-circle ' + (selectedColor === color ? 'active' : '') + '" data-color="' + color + '" style="background-color: ' + color + '; --active-color: ' + color + ';"></div>').join('') +
        '<div class="color-circle custom-color-btn ' + (selectedColor && !presets.includes(selectedColor) ? 'active' : '') + '" id="custom-color-trigger" style="--active-color: ' + (selectedColor && !presets.includes(selectedColor) ? selectedColor : '#3b82f6') + ';"></div>' +
        '</div>' +
        '</div>' +
        '<div style="display: flex; justify-content: flex-end; gap: 12px;">' +
        '<button class="confirm-btn-secondary" id="btn-cancel-color" style="margin: 0; padding: 10px 20px; border-radius: 10px; background: var(--card-bg); border: 1px solid var(--border); color: var(--text);">Отмена</button>' +
        '<button class="confirm-btn-primary" id="btn-save-color" style="margin: 0; padding: 10px 20px; border-radius: 10px; background: #3b82f6; border: none; color: #fff;">Сохранить</button>' +
        '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    const presetCircles = overlay.querySelectorAll('.color-circle:not(.custom-color-btn)');
    const customColorTrigger = overlay.querySelector('#custom-color-trigger');
    const saveBtn = overlay.querySelector('#btn-save-color');
    const cancelBtn = overlay.querySelector('#btn-cancel-color');
    const modalBox = overlay.querySelector('.confirm-box');

    let customColorPopover = null;
    let tempCustomColor = selectedColor && !presets.includes(selectedColor) ? selectedColor : '#ff0000';

    function updateActiveState(activeCircle) {
        overlay.querySelectorAll('.color-circle').forEach(c => c.classList.remove('active'));
        activeCircle.classList.add('active');
        if (activeCircle === customColorTrigger) {
            customColorTrigger.style.setProperty('--active-color', tempCustomColor);
            selectedColor = tempCustomColor;
        } else {
            selectedColor = activeCircle.getAttribute('data-color') || null;
        }
    }

    presetCircles.forEach(circle => {
        circle.addEventListener('click', () => {
            if (customColorPopover) {
                customColorPopover.remove();
                customColorPopover = null;
            }
            updateActiveState(circle);
        });
    });

    customColorTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (customColorPopover) {
            customColorPopover.remove();
            customColorPopover = null;
            return;
        }

        customColorPopover = document.createElement('div');
        customColorPopover.className = 'custom-color-picker-popover';
        customColorPopover.style.position = 'fixed';
        customColorPopover.style.background = 'var(--card-bg)';
        customColorPopover.style.border = '1px solid var(--border)';
        customColorPopover.style.borderRadius = '16px';
        customColorPopover.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.15)';
        customColorPopover.style.width = '220px';
        customColorPopover.style.padding = '12px';
        customColorPopover.style.display = 'flex';
        customColorPopover.style.flexDirection = 'column';
        customColorPopover.style.gap = '10px';
        customColorPopover.style.zIndex = '1100';

        const rect = modalBox.getBoundingClientRect();
        let left = rect.right + 12;
        let top = rect.top;
        if (left + 240 > window.innerWidth) {
            left = Math.max(10, rect.left + (rect.width - 220) / 2);
            top = rect.bottom + 12;
            if (top + 280 > window.innerHeight) {
                top = Math.max(10, rect.top - 290);
            }
        }

        customColorPopover.style.left = left + 'px';
        customColorPopover.style.top = top + 'px';

        customColorPopover.innerHTML = '<div class="sv-canvas" style="width: 100%; height: 120px; border-radius: 8px; position: relative; cursor: crosshair; overflow: hidden;">' +
            '<div style="position: absolute; inset: 0; background: linear-gradient(to right, #fff, transparent);"></div>' +
            '<div style="position: absolute; inset: 0; background: linear-gradient(to top, #000, transparent);"></div>' +
            '<div class="sv-handle" style="position: absolute; width: 8px; height: 8px; border: 1.5px solid #fff; border-radius: 50%; box-shadow: 0 0 2px rgba(0,0,0,0.5); transform: translate(-50%, -50%); pointer-events: none;"></div>' +
            '</div>' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
            '<div class="color-preview-circle" style="width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0, 0, 0, 0.1);"></div>' +
            '<input type="range" class="hue-slider" min="0" max="360" value="0" style="flex-grow: 1; margin: 0;">' +
            '</div>' +
            '<div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">' +
            '<input type="text" class="hex-input" style="width: 100%; text-align: center; border: 1px solid var(--border); border-radius: 6px; padding: 4px; font-size: 12px; font-family: monospace; background: var(--hover-bg); color: var(--text);">' +
            '<span style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">HEX</span>' +
            '</div>' +
            '<div style="display: flex; justify-content: space-between; gap: 6px;">' +
            '<button class="picker-btn-cancel" style="flex: 1; padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text); font-size: 12px; cursor: pointer;">Отмена</button>' +
            '<button class="picker-btn-save" style="flex: 1; padding: 6px; border-radius: 6px; border: none; background: #3b82f6; color: #fff; font-size: 12px; cursor: pointer;">Сохранить</button>' +
            '</div>';

        document.body.appendChild(customColorPopover);

        const popHsv = hexToHsv(tempCustomColor);
        let curHue = popHsv.h;
        let curSat = popHsv.s;
        let curVal = popHsv.v;

        const svCanvas = customColorPopover.querySelector('.sv-canvas');
        const svHandle = customColorPopover.querySelector('.sv-handle');
        const previewCircle = customColorPopover.querySelector('.color-preview-circle');
        const hueSlider = customColorPopover.querySelector('.hue-slider');
        const hexInput = customColorPopover.querySelector('.hex-input');

        hueSlider.value = curHue;

        function updatePickerUI() {
            svCanvas.style.backgroundColor = 'hsl(' + curHue + ', 100%, 50%)';
            svHandle.style.left = curSat + '%';
            svHandle.style.top = (100 - curVal) + '%';

            const rgb = hsvToRgb(curHue, curSat, curVal);
            const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

            previewCircle.style.backgroundColor = hex;
            if (document.activeElement !== hexInput) {
                hexInput.value = hex;
            }
        }

        function updateSVFromEvent(evt) {
            const rect = svCanvas.getBoundingClientRect();
            let x = evt.clientX - rect.left;
            let y = evt.clientY - rect.top;
            x = Math.max(0, Math.min(rect.width, x));
            y = Math.max(0, Math.min(rect.height, y));
            curSat = Math.round((x / rect.width) * 100);
            curVal = Math.round((1 - y / rect.height) * 100);
            updatePickerUI();
        }

        function onMouseDown(evt) {
            updateSVFromEvent(evt);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
        function onMouseMove(evt) {
            updateSVFromEvent(evt);
        }
        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        svCanvas.addEventListener('mousedown', onMouseDown);

        hueSlider.addEventListener('input', (evt) => {
            curHue = parseInt(evt.target.value);
            updatePickerUI();
        });

        hexInput.addEventListener('input', (evt) => {
            const val = evt.target.value;
            if (/^#[0-9A-F]{6}$/i.test(val)) {
                const hsv = hexToHsv(val);
                curHue = hsv.h;
                curSat = hsv.s;
                curVal = hsv.v;
                hueSlider.value = curHue;
                updatePickerUI();
            }
        });

        customColorPopover.querySelector('.picker-btn-save').addEventListener('click', (evt) => {
            evt.stopPropagation();
            const rgb = hsvToRgb(curHue, curSat, curVal);
            tempCustomColor = rgbToHex(rgb.r, rgb.g, rgb.b);
            updateActiveState(customColorTrigger);
            customColorPopover.remove();
            customColorPopover = null;
        });

        customColorPopover.querySelector('.picker-btn-cancel').addEventListener('click', (evt) => {
            evt.stopPropagation();
            customColorPopover.remove();
            customColorPopover = null;
        });

        customColorPopover.addEventListener('click', (evt) => {
            evt.stopPropagation();
        });

        updatePickerUI();
    });

    saveBtn.addEventListener('click', async () => {
        if (customColorPopover) customColorPopover.remove();
        overlay.remove();

        try {
            await updateDoc(doc(db, 'users', currentUid, 'projects', projectId), {
                color: selectedColor
            });
        } catch (err) {
            console.error("Ошибка при сохранении цвета проекта:", err);
            alert("Не удалось изменить цвет проекта.");
        }
    });

    cancelBtn.addEventListener('click', () => {
        if (customColorPopover) customColorPopover.remove();
        overlay.remove();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            if (customColorPopover) customColorPopover.remove();
            overlay.remove();
        }
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

            if (currentRoute === 'today' && parentContainer) {
                const sectEl = parentContainer.closest('.project-section');
                if (sectEl && sectEl.classList.contains('today-current-section')) {
                    const today = new Date();
                    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                    updateFields.dueDate = todayStr;
                    const task = allTasks.find(t => t.id === taskId);
                    if (task) {
                        task.dueDate = todayStr;
                    }
                }
            }

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


// --- ЛОГИКА ДЛЯ МОДАЛЬНОГО ОКНА ДЕТАЛЕЙ ЗАДАЧИ ---
let currentModalTaskId = null;
let isModalSubtasksCollapsed = false;
let modalCalendarInstance = null;

let modalSubtaskSelectedDate = null;
let modalSubtaskSelectedTime = null;
let modalSubtaskSelectedRepeat = null;
let modalSubtaskSelectedEndDate = null;
let modalSubtaskSelectedEndTime = null;
let modalSubtaskSelectedPriority = 0;
let subtaskCalendarInstance = null;

function ensureSubtaskCalendarInitialized() {
    if (subtaskCalendarInstance) return;
    const wrapper = document.getElementById('modalSubtaskDueWrapper');
    if (wrapper) {
        subtaskCalendarInstance = initCalendarForWrapper(
            wrapper,
            null,
            null,
            null,
            (dateStr, timeStr, repeatStr, endDateStr, endTimeStr) => {
                modalSubtaskSelectedDate = dateStr;
                modalSubtaskSelectedTime = timeStr;
                modalSubtaskSelectedRepeat = repeatStr;
                modalSubtaskSelectedEndDate = endDateStr;
                modalSubtaskSelectedEndTime = endTimeStr;
            }
        );
    }
}

function updateSubtaskPriorityUI(prio) {
    const textLabel = document.getElementById('modalSubtaskPriorityText');
    const iconWrapper = document.getElementById('modalSubtaskPriorityIcon');
    if (textLabel) textLabel.textContent = prio > 0 ? `Приоритет ${4 - prio}` : 'Приоритет';

    if (iconWrapper) {
        let flagColor = '#808080';
        let fill = 'none';
        if (prio === 3) { flagColor = '#dc2626'; fill = 'currentColor'; }
        else if (prio === 2) { flagColor = '#d97706'; fill = 'currentColor'; }
        else if (prio === 1) { flagColor = '#2563eb'; fill = 'currentColor'; }

        iconWrapper.style.color = flagColor;
        const svg = iconWrapper.querySelector('svg');
        if (svg) {
            svg.setAttribute('fill', fill);
            svg.style.color = flagColor;
        }
    }
}

function closeModalDueDropdown() {
    const dropdown = document.querySelector('#modalDueSelector .due-date-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function ensureModalCalendarInitialized() {
    if (modalCalendarInstance) return;
    const modalDueSelector = document.getElementById('modalDueSelector');
    if (modalDueSelector) {
        modalCalendarInstance = initCalendarForWrapper(
            modalDueSelector,
            null,
            null,
            null,
            async (dateStr, timeStr, repeatStr, endDateStr, endTimeStr) => {
                if (currentModalTaskId) {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', currentModalTaskId), {
                        dueDate: dateStr,
                        dueTime: timeStr,
                        dueRepeat: repeatStr,
                        dueEndDate: endDateStr,
                        dueEndTime: endTimeStr
                    });
                }
            }
        );
    }
}

const taskDetailsModal = document.getElementById('taskDetailsModal');
const btnTaskDetailsClose = document.getElementById('btnTaskDetailsClose');
const modalTaskCheckbox = document.querySelector('.modal-task-checkbox');
const modalTaskTitle = document.getElementById('modalTaskTitle');
const modalSubtasksToggle = document.getElementById('modalSubtasksToggle');
const modalSubtasksCounter = document.getElementById('modalSubtasksCounter');
const modalSubtasksList = document.getElementById('modalSubtasksList');
const btnModalAddSubtask = document.getElementById('btnModalAddSubtask');
const modalNewSubtaskContainer = document.getElementById('modalNewSubtaskContainer');
const modalNewSubtaskTitle = document.getElementById('modalNewSubtaskTitle');
const btnModalSaveSubtask = document.getElementById('btnModalSaveSubtask');
const btnModalCancelSubtask = document.getElementById('btnModalCancelSubtask');
const modalProjectBtn = document.getElementById('modalProjectBtn');
const modalProjectName = document.getElementById('modalProjectName');
const modalProjectDropdown = document.getElementById('modalProjectDropdown');
const modalDueBtn = document.getElementById('modalDueBtn');
const modalDueText = document.getElementById('modalDueText');
const modalPriorityBtn = document.getElementById('modalPriorityBtn');
const modalPriorityText = document.getElementById('modalPriorityText');
const modalPriorityIcon = document.getElementById('modalPriorityIcon');
const modalPriorityDropdown = document.getElementById('modalPriorityDropdown');

function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function openTaskDetailsModal(taskId) {
    let task = allTasks.find(t => t.id === taskId);
    if (!task) return;

    // Если это подзадача, открываем основную задачу (родительскую)
    if (task.parentId) {
        const parentTask = allTasks.find(t => t.id === task.parentId);
        if (parentTask) {
            task = parentTask;
            taskId = parentTask.id;
        }
    }

    currentModalTaskId = taskId;

    if (taskDetailsModal) {
        taskDetailsModal.style.display = 'flex';
        const card = taskDetailsModal.querySelector('.task-details-modal-card');
        if (card) {
            card.classList.remove('expanded');
            card.classList.add('collapsed');
            card.style.transform = ''; // reset inline drag transform
        }
        // Force reflow
        taskDetailsModal.offsetHeight;
        taskDetailsModal.classList.add('active');
    }

    if (btnModalAddSubtask) btnModalAddSubtask.style.display = 'inline-flex';
    if (modalNewSubtaskContainer) modalNewSubtaskContainer.style.display = 'none';
    if (modalNewSubtaskTitle) modalNewSubtaskTitle.value = '';

    if (modalProjectDropdown) modalProjectDropdown.style.display = 'none';
    closeModalDueDropdown();
    if (modalPriorityDropdown) modalPriorityDropdown.style.display = 'none';

    updateModalUI(task);
}

function closeTaskDetailsModal() {
    currentModalTaskId = null;
    if (taskDetailsModal) {
        taskDetailsModal.classList.remove('active');
        const card = taskDetailsModal.querySelector('.task-details-modal-card');
        if (card) {
            card.classList.remove('expanded', 'collapsed');
            card.style.transform = ''; // reset inline drag transform
        }
        setTimeout(() => {
            if (currentModalTaskId === null) {
                taskDetailsModal.style.display = 'none';
            }
        }, 300);
    }
}

// === ЖЕСТЫ ДЛЯ МОБИЛЬНОЙ ВЕРСИИ ДЕТАЛЕЙ ЗАДАЧИ (BOTTOM SHEET) ===
function initMobileBottomSheet() {
    if (!taskDetailsModal) return;
    const card = taskDetailsModal.querySelector('.task-details-modal-card');
    const dragHandleContainer = taskDetailsModal.querySelector('.task-details-drag-handle-container');
    const mainContent = taskDetailsModal.querySelector('.task-details-main-content');

    if (!card || !dragHandleContainer) return;

    let startY = 0;
    let currentY = 0;
    let startTranslateY = 0;
    let isDragging = false;

    function onTouchStart(e) {
        if (window.innerWidth > 768) return; // Only mobile

        const isHandle = e.target.closest('.task-details-drag-handle-container') || e.target.closest('.task-details-title-row');
        const isMainContent = e.target.closest('.task-details-main-content');

        if (!isHandle && isMainContent && mainContent.scrollTop > 0) {
            return;
        }

        startY = e.touches[0].clientY;
        currentY = startY;

        if (card.classList.contains('expanded')) {
            startTranslateY = 0;
        } else {
            startTranslateY = window.innerHeight * 0.40;
        }

        isDragging = true;
        card.style.transition = 'none';
    }

    function onTouchMove(e) {
        if (!isDragging) return;

        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;

        let newTranslateY = startTranslateY + deltaY;

        if (newTranslateY < 0) {
            newTranslateY = newTranslateY * 0.3; // Rubber-band effect
        }

        card.style.transform = `translateY(${newTranslateY}px)`;

        if (newTranslateY > window.innerHeight * 0.40) {
            const progress = Math.max(0, Math.min(1, (newTranslateY - window.innerHeight * 0.40) / (window.innerHeight * 0.52)));
            taskDetailsModal.style.backgroundColor = `rgba(0, 0, 0, ${0.45 * (1 - progress)})`;
        }
    }

    function onTouchEnd(e) {
        if (!isDragging) return;
        isDragging = false;

        card.style.transition = '';
        taskDetailsModal.style.backgroundColor = '';

        const deltaY = currentY - startY;
        const viewportHeight = window.innerHeight;

        if (startTranslateY === 0) {
            if (deltaY > 100) {
                if (deltaY > viewportHeight * 0.35) {
                    closeTaskDetailsModal();
                } else {
                    card.classList.remove('expanded');
                    card.classList.add('collapsed');
                    card.style.transform = '';
                }
            } else {
                card.classList.add('expanded');
                card.classList.remove('collapsed');
                card.style.transform = '';
            }
        } else {
            if (deltaY < -60) {
                card.classList.add('expanded');
                card.classList.remove('collapsed');
                card.style.transform = '';
            } else if (deltaY > 100) {
                closeTaskDetailsModal();
            } else {
                card.classList.remove('expanded');
                card.classList.add('collapsed');
                card.style.transform = '';
            }
        }
    }

    dragHandleContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    dragHandleContainer.addEventListener('touchmove', onTouchMove, { passive: true });
    dragHandleContainer.addEventListener('touchend', onTouchEnd);

    const titleRow = taskDetailsModal.querySelector('.task-details-title-row');
    if (titleRow) {
        titleRow.addEventListener('touchstart', onTouchStart, { passive: true });
        titleRow.addEventListener('touchmove', onTouchMove, { passive: true });
        titleRow.addEventListener('touchend', onTouchEnd);
    }
}

function syncModalIfOpen() {
    if (taskDetailsModal && taskDetailsModal.style.display === 'flex' && currentModalTaskId) {
        const activeTask = allTasks.find(t => t.id === currentModalTaskId);
        if (activeTask) {
            updateModalUI(activeTask);
        } else {
            closeTaskDetailsModal();
        }
    }
}

function updateModalUI(task) {
    const titleRow = document.querySelector('.task-details-title-row');

    if (titleRow && modalTaskCheckbox) {
        const checkboxWrapper = modalTaskCheckbox.closest('.checkbox-wrapper');
        const startsWithStar = task.title && task.title.startsWith('* ');
        if (startsWithStar) {
            if (checkboxWrapper) checkboxWrapper.style.display = 'none';
        } else {
            if (checkboxWrapper) checkboxWrapper.style.display = 'flex';
        }
        if (task.completed) {
            titleRow.classList.add('completed');
            modalTaskCheckbox.setAttribute('aria-label', 'Отметить невыполненной');
        } else {
            titleRow.classList.remove('completed');
            modalTaskCheckbox.setAttribute('aria-label', 'Отметить выполненной');
        }
    }

    if (modalTaskTitle && document.activeElement !== modalTaskTitle) {
        const hasAsterisk = task.title && task.title.startsWith('* ');
        modalTaskTitle.value = hasAsterisk ? task.title.slice(2) : (task.title || '');
        autoResizeTextarea(modalTaskTitle);
    }

    if (modalProjectName) {
        if (task.projectId) {
            const project = projectsList.find(p => p.id === task.projectId);
            modalProjectName.textContent = project ? project.name : 'Входящие';
        } else {
            modalProjectName.textContent = 'Входящие';
        }
    }

    ensureModalCalendarInitialized();
    if (modalCalendarInstance) {
        modalCalendarInstance.updateState(task.dueDate || null, task.dueTime || null, task.dueRepeat || null, task.dueEndDate || null, task.dueEndTime || null);
    }

    if (modalPriorityText && modalPriorityIcon) {
        const prio = task.priority || 0;
        modalPriorityText.textContent = `Приоритет ${4 - prio}`;

        let flagColor = '#808080';
        let fill = 'none';
        if (prio === 3) { flagColor = '#dc2626'; fill = 'currentColor'; }
        else if (prio === 2) { flagColor = '#d97706'; fill = 'currentColor'; }
        else if (prio === 1) { flagColor = '#2563eb'; fill = 'currentColor'; }

        modalPriorityIcon.style.color = flagColor;
        modalPriorityIcon.setAttribute('fill', fill);
    }

    renderModalSubtasks(task);
}

function updateModalOverflow() {
    const mainContent = document.querySelector('.task-details-main-content');
    if (!mainContent) return;
    const hasVisibleDropdown = Array.from(mainContent.querySelectorAll('.due-date-dropdown, .priority-dropdown, .task-actions-dropdown'))
        .some(dd => dd.style.display && dd.style.display !== 'none');
    if (hasVisibleDropdown) {
        mainContent.classList.add('has-open-dropdown');
    } else {
        mainContent.classList.remove('has-open-dropdown');
    }
}

function createSubtaskElement(subtask) {
    const itemEl = document.createElement('div');
    itemEl.className = `modal-subtask-item ${subtask.completed ? 'completed' : ''} priority-${subtask.priority || 0}`;

    // Генерируем плашку срока, если она установлена
    let dueHtml = '';
    if (subtask.dueDate) {
        const isToday = isDateToday(subtask.dueDate);
        const isOverdue = isDateOverdue(subtask.dueDate);
        const badgeClass = isToday ? 'today' : (isOverdue ? 'overdue' : '');
        const label = formatDueDateDisplay(subtask.dueDate, subtask.dueTime || null, subtask.dueRepeat || null, subtask.dueEndDate || null, subtask.dueEndTime || null);

        dueHtml = `
            <span class="task-due-badge ${badgeClass}" style="margin-left: auto; margin-right: 8px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="vertical-align: middle; margin-right: 3px; display: inline-block;">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span style="vertical-align: middle;">${label}</span>
                ${subtask.dueRepeat ? `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10" style="vertical-align: middle; margin-left: 4px; display: inline-block;">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                    </svg>
                ` : ''}
            </span>
        `;
    }

    const hasAsterisk = subtask.title && subtask.title.startsWith('* ');
    const displayTitle = hasAsterisk ? subtask.title.slice(2) : subtask.title;
    itemEl.innerHTML = `
        <div class="checkbox-wrapper" style="${hasAsterisk ? 'display: none;' : ''}">
            <button class="custom-checkbox modal-subtask-checkbox" aria-label="${subtask.completed ? 'Отметить невыполненной' : 'Отметить выполненной'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
        </div>
        <input type="text" class="modal-subtask-title" value="${escapeHtml(displayTitle)}" style="flex-grow: 1; min-width: 0; margin-right: 8px;">
        ${dueHtml}
        <div class="task-actions" style="position: relative; margin-left: ${subtask.dueDate ? '0' : 'auto'};">
            <button class="action-btn btn-more" title="Действия">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1.5"></circle>
                    <circle cx="12" cy="5" r="1.5"></circle>
                    <circle cx="12" cy="19" r="1.5"></circle>
                </svg>
            </button>
            <div class="task-actions-dropdown" style="display: none; position: absolute; right: 0; top: calc(100% + 4px); z-index: 1000; width: 230px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 6px; flex-direction: column; gap: 2px; box-sizing: border-box;">
                ${subtask.completed ? `
                <button class="dropdown-item btn-delete-subtask">
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
                        <button class="prio-opt-btn flag-red ${subtask.priority === 3 ? 'active' : ''}" type="button" data-priority="3" data-tooltip="Приоритет 1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                        <button class="prio-opt-btn flag-orange ${subtask.priority === 2 ? 'active' : ''}" type="button" data-priority="2" data-tooltip="Приоритет 2">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                        <button class="prio-opt-btn flag-blue ${subtask.priority === 1 ? 'active' : ''}" type="button" data-priority="1" data-tooltip="Приоритет 3">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="currentColor"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                        <button class="prio-opt-btn flag-white ${subtask.priority === 0 || !subtask.priority ? 'active' : ''}" type="button" data-priority="0" data-tooltip="Приоритет 4">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                                <line x1="4" y1="22" x2="4" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="dropdown-divider"></div>
                
                <button class="dropdown-item btn-duplicate-task">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 2px;">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Дублировать</span>
                </button>
                
                <div class="dropdown-divider"></div>
                
                <button class="dropdown-item btn-delete-subtask">
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

    const chk = itemEl.querySelector('.modal-subtask-checkbox');
    if (chk) {
        chk.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (subtask.title && subtask.title.startsWith('* ')) return;
            if (!subtask.completed) {
                const completedSound = new Audio('completed.mp3');
                completedSound.play().catch(err => console.log('Audio play error:', err));
            }
            await toggleTaskCompleted(subtask.id, subtask.completed);
        });
    }

    const titleInput = itemEl.querySelector('.modal-subtask-title');
    if (titleInput) {
        titleInput.addEventListener('focus', () => {
            if (subtask.title && subtask.title.startsWith('* ')) {
                titleInput.value = subtask.title;
            }
        });
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleInput.blur();
            }
        });
        titleInput.addEventListener('blur', async () => {
            const newTitle = titleInput.value.trim();
            if (newTitle && newTitle !== subtask.title) {
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                        title: newTitle
                    });
                } catch (err) {
                    console.error("Ошибка при обновлении подзадачи:", err);
                }
            } else {
                const hasAsteriskNow = subtask.title && subtask.title.startsWith('* ');
                titleInput.value = hasAsteriskNow ? subtask.title.slice(2) : (subtask.title || '');
            }
        });
    }

    const btnMore = itemEl.querySelector('.btn-more');
    const actionsDropdown = itemEl.querySelector('.task-actions-dropdown');

    const openSubtaskActionsDropdown = (clickEvent = null) => {
        // Закрываем все остальные меню
        document.querySelectorAll('.due-date-dropdown, .priority-dropdown, .project-dropdown, .task-actions-dropdown').forEach(dd => {
            if (dd !== actionsDropdown) dd.style.display = 'none';
        });
        document.querySelectorAll('.modal-subtask-item').forEach(subItem => {
            if (subItem !== itemEl) subItem.classList.remove('menu-open');
        });

        const isHidden = actionsDropdown.style.display === 'none';
        if (isHidden || clickEvent) {
            actionsDropdown.style.display = 'flex';
            itemEl.classList.add('menu-open');

            if (clickEvent) {
                actionsDropdown.style.position = 'fixed';
                let x = clickEvent.clientX;
                let y = clickEvent.clientY;

                const menuWidth = 230;
                const menuHeight = subtask.completed ? 80 : 260;
                if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
                if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

                actionsDropdown.style.left = `${x}px`;
                actionsDropdown.style.top = `${y}px`;
                actionsDropdown.style.bottom = 'auto';
            } else {
                actionsDropdown.style.position = 'absolute';
                actionsDropdown.style.left = '';

                const rect = btnMore.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const dropdownHeight = subtask.completed ? 80 : 260;
                if (spaceBelow < dropdownHeight) {
                    actionsDropdown.style.top = 'auto';
                    actionsDropdown.style.bottom = 'calc(100% + 4px)';
                } else {
                    actionsDropdown.style.top = 'calc(100% + 4px)';
                    actionsDropdown.style.bottom = 'auto';
                }
            }
        } else {
            actionsDropdown.style.display = 'none';
            itemEl.classList.remove('menu-open');
            actionsDropdown.style.position = '';
            actionsDropdown.style.left = '';
            actionsDropdown.style.top = '';
            actionsDropdown.style.bottom = '';
        }
        updateModalOverflow();
    };

    if (btnMore && actionsDropdown) {
        btnMore.addEventListener('click', (e) => {
            e.stopPropagation();
            openSubtaskActionsDropdown();
        });
    }

    itemEl.addEventListener('contextmenu', (e) => {
        if (window.matchMedia('(hover: hover)').matches) {
            e.preventDefault();
            e.stopPropagation();
            openSubtaskActionsDropdown(e);
        }
    });

    if (!subtask.completed) {
        // Due Date selectors inside subtask actions dropdown
        const btnDueToday = itemEl.querySelector('.btn-due-today');
        const btnDueTomorrow = itemEl.querySelector('.btn-due-tomorrow');
        const btnDueSelect = itemEl.querySelector('.btn-due-select');
        const btnDueNone = itemEl.querySelector('.btn-due-none');

        const tdyObj = new Date();
        const todayStr = `${tdyObj.getFullYear()}-${String(tdyObj.getMonth() + 1).padStart(2, '0')}-${String(tdyObj.getDate()).padStart(2, '0')}`;

        const tmwObj = new Date();
        tmwObj.setDate(tmwObj.getDate() + 1);
        const tomorrowStr = `${tmwObj.getFullYear()}-${String(tmwObj.getMonth() + 1).padStart(2, '0')}-${String(tmwObj.getDate()).padStart(2, '0')}`;

        if (btnDueToday) {
            btnDueToday.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (actionsDropdown) actionsDropdown.style.display = 'none';
                itemEl.classList.remove('menu-open');
                updateModalOverflow();
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                        dueDate: todayStr
                    });
                } catch (err) {
                    console.error("Ошибка обновления даты подзадачи:", err);
                }
            });
        }

        if (btnDueTomorrow) {
            btnDueTomorrow.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (actionsDropdown) actionsDropdown.style.display = 'none';
                itemEl.classList.remove('menu-open');
                updateModalOverflow();
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                        dueDate: tomorrowStr
                    });
                } catch (err) {
                    console.error("Ошибка обновления даты подзадачи:", err);
                }
            });
        }

        if (btnDueSelect) {
            btnDueSelect.addEventListener('click', (e) => {
                e.stopPropagation();
                if (actionsDropdown) actionsDropdown.style.display = 'none';
                itemEl.classList.remove('menu-open');
                updateModalOverflow();

                calendarTargetTask = {
                    id: subtask.id,
                    dueDate: subtask.dueDate || null,
                    dueTime: subtask.dueTime || null,
                    dueRepeat: subtask.dueRepeat || null,
                    dueEndDate: subtask.dueEndDate || null,
                    dueEndTime: subtask.dueEndTime || null
                };

                openDueDateDropdown();
            });
        }

        if (btnDueNone) {
            btnDueNone.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (actionsDropdown) actionsDropdown.style.display = 'none';
                itemEl.classList.remove('menu-open');
                updateModalOverflow();
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                        dueDate: null,
                        dueTime: null,
                        dueRepeat: null,
                        dueEndDate: null,
                        dueEndTime: null
                    });
                } catch (err) {
                    console.error("Ошибка очистки даты подзадачи:", err);
                }
            });
        }

        // Priority flags inside subtask actions dropdown
        itemEl.querySelectorAll('.prio-opt-btn').forEach(prioBtn => {
            prioBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const priorityVal = parseInt(prioBtn.getAttribute('data-priority'), 10);
                if (actionsDropdown) actionsDropdown.style.display = 'none';
                itemEl.classList.remove('menu-open');
                updateModalOverflow();
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                        priority: priorityVal
                    });
                } catch (err) {
                    console.error("Ошибка обновления приоритета подзадачи:", err);
                }
            });
        });
    }

    const btnEdit = itemEl.querySelector('.btn-edit');
    if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            if (actionsDropdown) actionsDropdown.style.display = 'none';
            itemEl.classList.remove('menu-open');
            updateModalOverflow();
            if (titleInput) {
                titleInput.focus();
                titleInput.select();
            }
        });
    }

    const btnDuplicate = itemEl.querySelector('.btn-duplicate-task');
    if (btnDuplicate) {
        btnDuplicate.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (actionsDropdown) actionsDropdown.style.display = 'none';
            itemEl.classList.remove('menu-open');
            updateModalOverflow();
            await duplicateTask(subtask);
        });
    }

    const btnDeleteSubtask = itemEl.querySelector('.btn-delete-subtask');
    if (btnDeleteSubtask) {
        btnDeleteSubtask.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (actionsDropdown) actionsDropdown.style.display = 'none';
            itemEl.classList.remove('menu-open');
            updateModalOverflow();
            try {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', subtask.id), {
                    deleted: true,
                    deletedAt: serverTimestamp()
                });
            } catch (err) {
                console.error("Ошибка удаления подзадачи:", err);
            }
        });
    }
    return itemEl;
}

function renderModalSubtasks(task) {
    if (!modalSubtasksList || !modalSubtasksCounter || !modalSubtasksToggle) return;

    modalSubtasksList.innerHTML = '';

    const subtasks = allTasks.filter(t => t.parentId === task.id && !t.deleted);
    subtasks.sort((a, b) => (a.order || 0) - (b.order || 0));

    const completedCount = subtasks.filter(s => s.completed).length;
    modalSubtasksCounter.textContent = `${completedCount}/${subtasks.length}`;

    const chevronIcon = modalSubtasksToggle.querySelector('.chevron-icon');

    if (subtasks.length === 0) {
        modalSubtasksToggle.style.display = 'none';
        modalSubtasksList.style.display = 'flex';

        const addRow = document.createElement('div');
        addRow.style.padding = '4px 0';
        addRow.appendChild(btnModalAddSubtask);
        addRow.appendChild(modalNewSubtaskContainer);
        modalSubtasksList.appendChild(addRow);
        return;
    }

    modalSubtasksToggle.style.display = 'flex';

    if (isModalSubtasksCollapsed) {
        modalSubtasksList.style.display = 'none';
        if (chevronIcon) chevronIcon.style.transform = 'rotate(-90deg)';
        return;
    }

    modalSubtasksList.style.display = 'flex';
    if (chevronIcon) chevronIcon.style.transform = 'rotate(0deg)';

    // Split subtasks: active vs completed
    const activeSubs = subtasks.filter(s => !s.completed);
    const completedSubs = subtasks.filter(s => s.completed);

    // 1. Render active subtasks
    activeSubs.forEach(sub => {
        modalSubtasksList.appendChild(createSubtaskElement(sub));
    });

    // 2. Render Add Subtask trigger/container row directly in the middle!
    const addRow = document.createElement('div');
    addRow.style.padding = '4px 0';
    addRow.appendChild(btnModalAddSubtask);
    addRow.appendChild(modalNewSubtaskContainer);
    modalSubtasksList.appendChild(addRow);

    // 3. Render completed subtasks below the add form
    completedSubs.forEach(sub => {
        modalSubtasksList.appendChild(createSubtaskElement(sub));
    });
}



if (btnTaskDetailsClose) {
    btnTaskDetailsClose.addEventListener('click', closeTaskDetailsModal);
}
if (taskDetailsModal) {
    taskDetailsModal.addEventListener('click', (e) => {
        if (e.target === taskDetailsModal) {
            closeTaskDetailsModal();
        }
    });

    // Инициализация жестов для bottom sheet на мобильных устройствах
    initMobileBottomSheet();
}

if (modalTaskCheckbox) {
    modalTaskCheckbox.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentTask = allTasks.find(t => t.id === currentModalTaskId);
        if (!currentTask) return;
        if (currentTask.title && currentTask.title.startsWith('* ')) return;
        if (!currentTask.completed) {
            const completedSound = new Audio('completed.mp3');
            completedSound.play().catch(err => console.log('Audio playback failed:', err));
        }
        await toggleTaskCompleted(currentTask.id, currentTask.completed);
    });
}

if (modalTaskTitle) {
    modalTaskTitle.addEventListener('focus', () => {
        const currentTask = allTasks.find(t => t.id === currentModalTaskId);
        if (currentTask && currentTask.title && currentTask.title.startsWith('* ')) {
            modalTaskTitle.value = currentTask.title;
        }
    });
    modalTaskTitle.addEventListener('input', () => {
        autoResizeTextarea(modalTaskTitle);
    });
    modalTaskTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            modalTaskTitle.blur();
        }
    });
    modalTaskTitle.addEventListener('blur', async () => {
        const newTitle = modalTaskTitle.value.trim();
        const currentTask = allTasks.find(t => t.id === currentModalTaskId);
        if (currentTask && newTitle && newTitle !== currentTask.title) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', currentTask.id), {
                    title: newTitle
                });
            } catch (err) {
                console.error("Ошибка при сохранении названия:", err);
            }
        } else if (currentTask) {
            const hasAsteriskNow = currentTask.title && currentTask.title.startsWith('* ');
            modalTaskTitle.value = hasAsteriskNow ? currentTask.title.slice(2) : (currentTask.title || '');
            autoResizeTextarea(modalTaskTitle);
        }
    });
}

if (modalSubtasksToggle) {
    modalSubtasksToggle.addEventListener('click', () => {
        isModalSubtasksCollapsed = !isModalSubtasksCollapsed;
        const currentTask = allTasks.find(t => t.id === currentModalTaskId);
        if (currentTask) {
            renderModalSubtasks(currentTask);
        }
    });
}

if (btnModalAddSubtask) {
    btnModalAddSubtask.addEventListener('click', () => {
        btnModalAddSubtask.style.display = 'none';
        if (modalNewSubtaskContainer) {
            modalNewSubtaskContainer.style.display = 'flex';
        }

        // Reset subtask form state
        modalSubtaskSelectedDate = null;
        modalSubtaskSelectedTime = null;
        modalSubtaskSelectedRepeat = null;
        modalSubtaskSelectedEndDate = null;
        modalSubtaskSelectedEndTime = null;
        modalSubtaskSelectedPriority = 0;

        if (modalNewSubtaskTitle) {
            modalNewSubtaskTitle.value = '';
            modalNewSubtaskTitle.style.height = 'auto';
            modalNewSubtaskTitle.focus();
        }

        ensureSubtaskCalendarInitialized();
        if (subtaskCalendarInstance) {
            subtaskCalendarInstance.updateState(null, null, null, null, null);
        }
        updateSubtaskPriorityUI(0);
    });
}

if (btnModalCancelSubtask) {
    btnModalCancelSubtask.addEventListener('click', () => {
        if (btnModalAddSubtask) btnModalAddSubtask.style.display = 'inline-flex';
        if (modalNewSubtaskContainer) modalNewSubtaskContainer.style.display = 'none';
    });
}

const saveModalSubtask = async () => {
    if (!modalNewSubtaskTitle) return;
    const text = modalNewSubtaskTitle.value.trim();
    if (text) {
        const parentId = currentModalTaskId;
        const parentTask = allTasks.find(t => t.id === parentId);
        if (!parentTask) return;

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
                dueDate: modalSubtaskSelectedDate || null,
                dueTime: modalSubtaskSelectedTime || null,
                dueRepeat: modalSubtaskSelectedRepeat || null,
                dueEndDate: modalSubtaskSelectedEndDate || null,
                dueEndTime: modalSubtaskSelectedEndTime || null,
                projectId: parentTask.projectId || null,
                sectionId: parentTask.sectionId || null,
                priority: modalSubtaskSelectedPriority,
                order: newOrder,
                parentId: parentId,
                createdAt: serverTimestamp()
            });

            // Reset for next subtask
            modalSubtaskSelectedDate = null;
            modalSubtaskSelectedTime = null;
            modalSubtaskSelectedRepeat = null;
            modalSubtaskSelectedEndDate = null;
            modalSubtaskSelectedEndTime = null;
            modalSubtaskSelectedPriority = 0;

            modalNewSubtaskTitle.value = '';
            modalNewSubtaskTitle.style.height = 'auto';
            modalNewSubtaskTitle.focus();

            if (subtaskCalendarInstance) {
                subtaskCalendarInstance.updateState(null, null, null, null, null);
            }
            updateSubtaskPriorityUI(0);
        } catch (err) {
            console.error("Ошибка добавления подзадачи:", err);
        }
    } else {
        if (btnModalAddSubtask) btnModalAddSubtask.style.display = 'inline-flex';
        if (modalNewSubtaskContainer) modalNewSubtaskContainer.style.display = 'none';
    }
};

if (btnModalSaveSubtask) {
    btnModalSaveSubtask.addEventListener('click', saveModalSubtask);
}

if (modalNewSubtaskTitle) {
    modalNewSubtaskTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveModalSubtask();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            if (btnModalAddSubtask) btnModalAddSubtask.style.display = 'inline-flex';
            if (modalNewSubtaskContainer) modalNewSubtaskContainer.style.display = 'none';
        }
    });

    // Auto-resize textarea as user types
    modalNewSubtaskTitle.addEventListener('input', () => {
        modalNewSubtaskTitle.style.height = 'auto';
        modalNewSubtaskTitle.style.height = modalNewSubtaskTitle.scrollHeight + 'px';
    });
}

// Subtask priority dropdown handlers
const btnModalSubtaskPriority = document.getElementById('btnModalSubtaskPriority');
const modalSubtaskPriorityDropdown = document.getElementById('modalSubtaskPriorityDropdown');

if (btnModalSubtaskPriority) {
    btnModalSubtaskPriority.addEventListener('click', (e) => {
        e.stopPropagation();
        closeModalDueDropdown();
        // Hide subtask calendar dropdown too if open
        const subtaskCalDropdown = document.querySelector('#modalSubtaskDueWrapper .due-date-dropdown');
        if (subtaskCalDropdown) subtaskCalDropdown.style.display = 'none';

        if (modalSubtaskPriorityDropdown) {
            const isHidden = modalSubtaskPriorityDropdown.style.display === 'none';
            if (isHidden) {
                // Close other dropdowns globally
                document.querySelectorAll('.due-date-dropdown, .priority-dropdown, .project-dropdown, .task-actions-dropdown').forEach(d => {
                    if (d !== modalSubtaskPriorityDropdown) d.style.display = 'none';
                });
                modalSubtaskPriorityDropdown.style.display = 'flex';
                modalSubtaskPriorityDropdown.style.flexDirection = 'column';

                modalSubtaskPriorityDropdown.innerHTML = `
                    <button class="priority-opt-btn dropdown-item" data-priority="3" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #dc2626; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 1</span>
                        <span class="priority-check" style="${modalSubtaskSelectedPriority === 3 ? '' : 'display: none;'} color: #dc2626; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                    <button class="priority-opt-btn dropdown-item" data-priority="2" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #d97706; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 2</span>
                        <span class="priority-check" style="${modalSubtaskSelectedPriority === 2 ? '' : 'display: none;'} color: #d97706; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                    <button class="priority-opt-btn dropdown-item" data-priority="1" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #2563eb; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 3</span>
                        <span class="priority-check" style="${modalSubtaskSelectedPriority === 1 ? '' : 'display: none;'} color: #2563eb; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                    <button class="priority-opt-btn dropdown-item" data-priority="0" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #808080; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 4</span>
                        <span class="priority-check" style="${modalSubtaskSelectedPriority === 0 ? '' : 'display: none;'} color: #808080; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                `;

                modalSubtaskPriorityDropdown.querySelectorAll('.priority-opt-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        modalSubtaskPriorityDropdown.style.display = 'none';
                        const prio = parseInt(btn.getAttribute('data-priority'), 10);
                        modalSubtaskSelectedPriority = prio;
                        updateSubtaskPriorityUI(prio);
                    });
                });
            } else {
                modalSubtaskPriorityDropdown.style.display = 'none';
            }
        }
    });
}

if (modalProjectBtn) {
    modalProjectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeModalDueDropdown();
        if (modalPriorityDropdown) modalPriorityDropdown.style.display = 'none';

        if (modalProjectDropdown) {
            const isHidden = modalProjectDropdown.style.display === 'none';
            if (isHidden) {
                modalProjectDropdown.style.display = 'flex';
                const currentTask = allTasks.find(t => t.id === currentModalTaskId);
                if (!currentTask) return;

                let html = `
                    <button class="dropdown-item ${!currentTask.projectId ? 'selected' : ''}" data-project-id="" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                        </svg>
                        <span style="flex-grow: 1;">Входящие</span>
                    </button>
                `;

                projectsList.forEach(proj => {
                    const isCurrent = currentTask.projectId === proj.id;
                    const iconHtml = proj.iconUrl ?
                        `<img src="${proj.iconUrl}" style="width: 14px; height: 14px; object-fit: contain; border-radius: 3px;">` :
                        `<span style="font-weight: bold; color: var(--text-secondary);">#</span>`;
                    html += `
                        <button class="dropdown-item ${isCurrent ? 'selected' : ''}" data-project-id="${proj.id}" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                            ${iconHtml}
                            <span style="flex-grow: 1;">${escapeHtml(proj.name)}</span>
                        </button>
                    `;
                });

                modalProjectDropdown.innerHTML = html;

                modalProjectDropdown.querySelectorAll('.dropdown-item').forEach(item => {
                    item.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        modalProjectDropdown.style.display = 'none';
                        const targetProjId = item.getAttribute('data-project-id') || null;

                        try {
                            await updateDoc(doc(db, 'users', currentUid, 'tasks', currentModalTaskId), {
                                projectId: targetProjId,
                                order: 0
                            });

                            const subtasks = allTasks.filter(t => t.parentId === currentModalTaskId);
                            for (const sub of subtasks) {
                                await updateDoc(doc(db, 'users', currentUid, 'tasks', sub.id), {
                                    projectId: targetProjId
                                });
                            }
                        } catch (err) {
                            console.error("Ошибка смены проекта в модалке:", err);
                        }
                    });
                });
            } else {
                modalProjectDropdown.style.display = 'none';
            }
        }
    });
}

if (modalPriorityBtn) {
    modalPriorityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (modalProjectDropdown) modalProjectDropdown.style.display = 'none';
        closeModalDueDropdown();

        if (modalPriorityDropdown) {
            const isHidden = modalPriorityDropdown.style.display === 'none';
            if (isHidden) {
                modalPriorityDropdown.style.display = 'flex';
                modalPriorityDropdown.style.flexDirection = 'column';

                const task = allTasks.find(t => t.id === currentModalTaskId);
                const currentPrio = task ? (task.priority || 0) : 0;

                modalPriorityDropdown.innerHTML = `
                    <button class="priority-opt-btn dropdown-item" data-priority="3" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #dc2626; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 1</span>
                        <span class="priority-check" style="${currentPrio === 3 ? '' : 'display: none;'} color: #dc2626; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                    <button class="priority-opt-btn dropdown-item" data-priority="2" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #d97706; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 2</span>
                        <span class="priority-check" style="${currentPrio === 2 ? '' : 'display: none;'} color: #d97706; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                    <button class="priority-opt-btn dropdown-item" data-priority="1" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="color: #2563eb; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" stroke-width="2"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 3</span>
                        <span class="priority-check" style="${currentPrio === 1 ? '' : 'display: none;'} color: #2563eb; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                    <button class="priority-opt-btn dropdown-item" data-priority="0" style="display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 8px 12px; cursor: pointer; text-align: left; color: var(--text);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #808080; flex-shrink: 0;">
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                            <line x1="4" y1="22" x2="4" y2="15"></line>
                        </svg>
                        <span style="flex-grow: 1;">Приоритет 4</span>
                        <span class="priority-check" style="${currentPrio === 0 ? '' : 'display: none;'} color: #808080; font-weight: bold; margin-left: auto;">✓</span>
                    </button>
                `;

                modalPriorityDropdown.querySelectorAll('.priority-opt-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        modalPriorityDropdown.style.display = 'none';
                        const prio = parseInt(btn.getAttribute('data-priority'), 10);
                        await updateDoc(doc(db, 'users', currentUid, 'tasks', currentModalTaskId), { priority: prio });
                    });
                });
            } else {
                modalPriorityDropdown.style.display = 'none';
            }
        }
    });
}

document.addEventListener('click', (e) => {
    if (taskDetailsModal && taskDetailsModal.style.display === 'flex') {
        if (modalProjectDropdown && !e.target.closest('.sidebar-project-selector')) {
            modalProjectDropdown.style.display = 'none';
        }
        if (!e.target.closest('.sidebar-due-selector')) {
            closeModalDueDropdown();
        }
        if (modalPriorityDropdown && !e.target.closest('.sidebar-priority-selector')) {
            modalPriorityDropdown.style.display = 'none';
        }

        // Скрытие выпадающих меню для добавления подзадачи при клике вовне
        if (!e.target.closest('#modalSubtaskDueWrapper')) {
            const subtaskCalDropdown = document.querySelector('#modalSubtaskDueWrapper .due-date-dropdown');
            if (subtaskCalDropdown) subtaskCalDropdown.style.display = 'none';
        }
        const subtaskPrioDropdown = document.getElementById('modalSubtaskPriorityDropdown');
        if (subtaskPrioDropdown && !e.target.closest('#modalSubtaskPriorityWrapper')) {
            subtaskPrioDropdown.style.display = 'none';
        }

        // Скрытие выпадающих меню действий для списка подзадач
        if (!e.target.closest('.modal-subtask-item .task-actions') && !e.target.closest('#dueDateDropdown')) {
            document.querySelectorAll('.modal-subtask-item .task-actions-dropdown').forEach(dd => {
                dd.style.display = 'none';
                dd.style.position = '';
                dd.style.left = '';
                dd.style.top = '';
                dd.style.bottom = '';
            });
            document.querySelectorAll('.modal-subtask-item').forEach(item => {
                item.classList.remove('menu-open');
            });
        }

        updateModalOverflow();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && taskDetailsModal && taskDetailsModal.style.display === 'flex') {
        closeTaskDetailsModal();
    }
});

// === GOOGLE CALENDAR CONTROLLER ===
let gcalMappings = {};
let gcalDefaultTag = "gcal";
let gcalShowEvents = localStorage.getItem('gcal_show_events') !== 'false'; // default true
let gcalSyncTasks = localStorage.getItem('gcal_sync_tasks') !== 'false'; // default true
let gcalSyncAllDay = localStorage.getItem('gcal_sync_allday') !== 'false'; // default true
let gcalHiddenCalendars = [];
try {
    gcalHiddenCalendars = JSON.parse(localStorage.getItem('gcal_hidden_calendars')) || [];
} catch (e) {
    gcalHiddenCalendars = [];
}
let gcalCachedEvents = [];
let gcalCachedDate = null;
let gcalLastFetchTime = 0;
let gcalIsFetching = false;
const syncingTasks = new Set();

function updateGCalSettingsUI() {
    const emailEl = document.getElementById('gcalUserEmail');
    const connectBtn = document.getElementById('btnGCalConnect');
    const statusBadge = document.getElementById('gcalStatusBadge');
    const syncBtnNow = document.getElementById('btnGCalSyncNow');
    const syncTip = document.getElementById('gcalSyncTip');
    const optionsSection = document.getElementById('gcalOptionsSection');

    const token = localStorage.getItem('google_calendar_access_token');
    const expiry = parseInt(localStorage.getItem('google_calendar_token_expiry') || '0');
    const isExpired = token && (Date.now() + 300 * 1000 > expiry);

    if (token) {
        if (emailEl) {
            if (isExpired) {
                emailEl.textContent = 'Сессия истекла. Требуется войти заново.';
            } else {
                emailEl.textContent = window.currentUser ? window.currentUser.email : 'Подключено';
            }
        }
        if (statusBadge) {
            if (isExpired) {
                statusBadge.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" style="vertical-align: middle;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span style="color: #ef4444; font-weight: 500;">Истек токен</span>
                `;
            } else {
                statusBadge.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" style="vertical-align: middle;">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span style="color: #22c55e; font-weight: 500;">Подключено</span>
                `;
            }
        }
        if (connectBtn) {
            if (isExpired) {
                connectBtn.textContent = 'Войти заново';
                connectBtn.classList.remove('disconnect');
            } else {
                connectBtn.textContent = 'Отключить';
                connectBtn.classList.add('disconnect');
            }
        }
        if (syncBtnNow) syncBtnNow.style.display = isExpired ? 'none' : 'inline-block';
        if (syncTip) syncTip.style.display = isExpired ? 'none' : 'block';
        if (optionsSection) optionsSection.style.display = 'grid';

        // Load checkbox values
        const chkShowEvents = document.getElementById('prefGCalShowEvents');
        if (chkShowEvents) chkShowEvents.checked = gcalShowEvents;

        // Render visible/hidden calendars list
        const calendarsContainer = document.getElementById('gcalCalendarsContainer');
        if (calendarsContainer) {
            calendarsContainer.style.display = gcalShowEvents ? 'flex' : 'none';
        }

        if (typeof window.GCalendarService !== 'undefined') {
            if (isExpired) {
                const container = document.getElementById('gcalCalendarsContainer');
                if (container) {
                    container.innerHTML = '<div style="font-size:0.85rem; color:var(--text-secondary); padding:8px 0;">Сессия Google Календаря истекла. Для загрузки списка календарей нажмите "Войти заново".</div>';
                }
            } else {
                window.GCalendarService.fetchCalendars().then(calendars => {
                    renderGCalCalendarsList(calendars);
                }).catch(err => {
                    console.error("Error loading calendars for settings list:", err);
                    const container = document.getElementById('gcalCalendarsContainer');
                    if (container) {
                        container.innerHTML = '<div style="font-size:0.85rem; color:var(--text-secondary); padding:8px 0;">Не удалось загрузить список календарей.</div>';
                    }
                });
            }
        }
    } else {
        if (emailEl) emailEl.textContent = 'Не подключено';
        if (statusBadge) statusBadge.innerHTML = '';
        if (connectBtn) {
            connectBtn.textContent = 'Подключить';
            connectBtn.classList.remove('disconnect');
        }
        if (syncBtnNow) syncBtnNow.style.display = 'none';
        if (syncTip) syncTip.style.display = 'none';
        if (optionsSection) optionsSection.style.display = 'none';
    }
}

function renderGCalCalendarsList(calendars) {
    const container = document.getElementById('gcalCalendarsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!calendars || calendars.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--text-secondary); padding:8px 0;">Календари не найдены</div>';
        return;
    }

    calendars.forEach(cal => {
        const isHidden = gcalHiddenCalendars.includes(cal.id);
        const item = document.createElement('div');
        item.className = 'gcal-calendar-item';
        const color = cal.backgroundColor || '#4285F4';

        item.innerHTML = `
            <div class="gcal-calendar-left">
                <div class="gcal-color-pill" style="background-color: ${color};"></div>
                <div class="gcal-calendar-name">${escapeHtml(cal.summary || 'Без названия')}</div>
            </div>
            <button class="gcal-visibility-btn" data-id="${cal.id}" aria-label="Показать/скрыть">
                ${isHidden ? `
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                ` : `
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                `}
            </button>
        `;

        item.querySelector('.gcal-visibility-btn').addEventListener('click', async () => {
            const calId = cal.id;
            const index = gcalHiddenCalendars.indexOf(calId);
            if (index > -1) {
                gcalHiddenCalendars.splice(index, 1);
            } else {
                gcalHiddenCalendars.push(calId);
            }

            localStorage.setItem('gcal_hidden_calendars', JSON.stringify(gcalHiddenCalendars));
            if (currentUid) {
                await window.setDoc(window.doc(db, "users", currentUid), {
                    gcal_hidden_calendars: gcalHiddenCalendars
                }, { merge: true });
            }

            renderGCalCalendarsList(calendars);

            gcalLastFetchTime = 0;
            fetchAndRenderGCalEvents(true);
        });

        container.appendChild(item);
    });
}

async function loadGCalConfig() {
    if (!currentUid) return;
    try {
        const userDoc = await window.getDoc(window.doc(db, "users", currentUid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            gcalMappings = data.gcal_mappings || {};
            gcalDefaultTag = data.gcal_default_tag || "gcal";
            gcalShowEvents = data.gcal_show_events !== false;
            gcalSyncTasks = data.gcal_sync_tasks !== false;
            gcalSyncAllDay = data.gcal_sync_allday !== false;
            gcalHiddenCalendars = data.gcal_hidden_calendars || [];

            localStorage.setItem('gcal_show_events', gcalShowEvents);
            localStorage.setItem('gcal_sync_tasks', gcalSyncTasks);
            localStorage.setItem('gcal_sync_allday', gcalSyncAllDay);
            localStorage.setItem('gcal_hidden_calendars', JSON.stringify(gcalHiddenCalendars));

            if (data.google_calendar_access_token) {
                localStorage.setItem('google_calendar_access_token', data.google_calendar_access_token);
            }
            if (data.google_calendar_token_expiry) {
                localStorage.setItem('google_calendar_token_expiry', data.google_calendar_token_expiry);
            }
            if (data.google_calendar_refresh_token) {
                localStorage.setItem('google_calendar_refresh_token', data.google_calendar_refresh_token);
            }
        } else {
            gcalMappings = {};
            gcalDefaultTag = "gcal";
        }
    } catch (e) {
        console.error("Ошибка при загрузке связей Google Календаря:", e);
    }
}

async function saveGCalConfig() {
    if (!currentUid) return;
    try {
        await window.setDoc(window.doc(db, "users", currentUid), {
            gcal_mappings: gcalMappings,
            gcal_default_tag: gcalDefaultTag,
            gcal_show_events: gcalShowEvents,
            gcal_sync_tasks: gcalSyncTasks,
            gcal_sync_allday: gcalSyncAllDay,
            gcal_hidden_calendars: gcalHiddenCalendars
        }, { merge: true });
    } catch (e) {
        console.error("Ошибка при сохранении связей Google Календаря:", e);
    }
}

// Открытие модального окна связей
const gcalIntegrationModal = document.getElementById('gcalIntegrationModal');
const btnGCalSetupSync = document.getElementById('btnGCalSetupSync');
const btnGCalModalClose = document.getElementById('btnGCalModalClose');
const btnGCalModalCancel = document.getElementById('btnGCalModalCancel');
const btnGCalModalSave = document.getElementById('btnGCalModalSave');
const gcalLocalProjectDropdown = document.getElementById('gcalLocalProjectDropdown');
const gcalRemoteCalendarDropdown = document.getElementById('gcalRemoteCalendarDropdown');
const btnGCalLocalProject = document.getElementById('btnGCalLocalProject');
const btnGCalRemoteCalendar = document.getElementById('btnGCalRemoteCalendar');
const menuGCalLocalProject = document.getElementById('menuGCalLocalProject');
const menuGCalRemoteCalendar = document.getElementById('menuGCalRemoteCalendar');
const gcalMappingsList = document.getElementById('gcalMappingsList');

let selectedLocalProjectId = 'all';
let selectedRemoteCalendarId = '';

// Помощник переключения выпадающих списков
function toggleDropdownMenu(menu) {
    const isShowing = menu.classList.contains('show');
    // Закрываем все кастомные списки
    if (menuGCalLocalProject) menuGCalLocalProject.classList.remove('show');
    if (menuGCalRemoteCalendar) menuGCalRemoteCalendar.classList.remove('show');

    if (!isShowing) {
        menu.classList.add('show');
    }
}

// Закрытие при клике вовне
document.addEventListener('click', (e) => {
    if (!e.target.closest('#gcalLocalProjectDropdown') && menuGCalLocalProject) {
        menuGCalLocalProject.classList.remove('show');
    }
    if (!e.target.closest('#gcalRemoteCalendarDropdown') && menuGCalRemoteCalendar) {
        menuGCalRemoteCalendar.classList.remove('show');
    }
});

if (btnGCalLocalProject) {
    btnGCalLocalProject.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdownMenu(menuGCalLocalProject);
    });
}

if (btnGCalRemoteCalendar) {
    btnGCalRemoteCalendar.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdownMenu(menuGCalRemoteCalendar);
    });
}

if (btnGCalSetupSync) {
    btnGCalSetupSync.addEventListener('click', async () => {
        if (btnGCalSetupSync.classList.contains('disabled')) return;

        btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = 'Загрузка календарей...';
        selectedRemoteCalendarId = '';

        gcalIntegrationModal.style.display = 'flex';

        // Заполняем списки локальных проектов
        selectedLocalProjectId = 'all';
        btnGCalLocalProject.querySelector('.trigger-text').textContent = 'Все';
        populateLocalProjectsDropdown();

        // Загружаем календари из Google
        try {
            const calendars = await window.GCalendarService.fetchCalendars();
            populateRemoteCalendarsDropdown(calendars);
        } catch (err) {
            console.error("Ошибка при получении реальных календарей:", err);
            alert("Ошибка Google Calendar API:\n" + err.message + "\n\nПожалуйста, убедитесь, что в консоли Google Cloud включен API Google Календаря для этого проекта.");
            btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = 'Ошибка загрузки';
        }

        renderActiveMappings();
    });
}

const btnGCalSetupShowEvents = document.getElementById('btnGCalSetupShowEvents');
const gcalShowEventsModal = document.getElementById('gcalShowEventsModal');
const btnGCalShowEventsModalClose = document.getElementById('btnGCalShowEventsModalClose');
const btnGCalShowEventsModalSave = document.getElementById('btnGCalShowEventsModalSave');

function closeGCalShowEventsModal() {
    if (gcalShowEventsModal) gcalShowEventsModal.style.display = 'none';
}

if (btnGCalSetupShowEvents && gcalShowEventsModal) {
    btnGCalSetupShowEvents.addEventListener('click', () => {
        gcalShowEventsModal.style.display = 'flex';
        updateGCalSettingsUI();
    });
}

if (btnGCalShowEventsModalClose) btnGCalShowEventsModalClose.addEventListener('click', closeGCalShowEventsModal);
if (btnGCalShowEventsModalSave) btnGCalShowEventsModalSave.addEventListener('click', closeGCalShowEventsModal);

function populateLocalProjectsDropdown() {
    if (!menuGCalLocalProject) return;
    menuGCalLocalProject.innerHTML = '';

    // Вариант 1: Все
    const optAll = document.createElement('button');
    optAll.type = 'button';
    optAll.className = 'gcal-dropdown-item' + (selectedLocalProjectId === 'all' ? ' selected' : '');
    optAll.textContent = 'Все';
    optAll.addEventListener('click', () => {
        selectedLocalProjectId = 'all';
        btnGCalLocalProject.querySelector('.trigger-text').textContent = 'Все';
        menuGCalLocalProject.classList.remove('show');
        populateLocalProjectsDropdown();
    });
    menuGCalLocalProject.appendChild(optAll);

    // Вариант 2: Входящие
    const optInbox = document.createElement('button');
    optInbox.type = 'button';
    optInbox.className = 'gcal-dropdown-item' + (selectedLocalProjectId === 'inbox' ? ' selected' : '');
    optInbox.textContent = 'Входящие';
    optInbox.addEventListener('click', () => {
        selectedLocalProjectId = 'inbox';
        btnGCalLocalProject.querySelector('.trigger-text').textContent = 'Входящие';
        menuGCalLocalProject.classList.remove('show');
        populateLocalProjectsDropdown();
    });
    menuGCalLocalProject.appendChild(optInbox);

    // Вариант 3: Обратный отсчет
    const optCountdown = document.createElement('button');
    optCountdown.type = 'button';
    optCountdown.className = 'gcal-dropdown-item' + (selectedLocalProjectId === 'countdown' ? ' selected' : '');
    optCountdown.textContent = 'Обратный отсчет';
    optCountdown.addEventListener('click', () => {
        selectedLocalProjectId = 'countdown';
        btnGCalLocalProject.querySelector('.trigger-text').textContent = 'Обратный отсчет';
        menuGCalLocalProject.classList.remove('show');
        populateLocalProjectsDropdown();
    });
    menuGCalLocalProject.appendChild(optCountdown);

    // Все остальные кастомные проекты
    projectsList.forEach(p => {
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'gcal-dropdown-item' + (selectedLocalProjectId === p.id ? ' selected' : '');
        opt.textContent = p.name;
        opt.addEventListener('click', () => {
            selectedLocalProjectId = p.id;
            btnGCalLocalProject.querySelector('.trigger-text').textContent = p.name;
            menuGCalLocalProject.classList.remove('show');
            populateLocalProjectsDropdown();
        });
        menuGCalLocalProject.appendChild(opt);
    });
}

function populateRemoteCalendarsDropdown(calendars) {
    if (!menuGCalRemoteCalendar) return;
    menuGCalRemoteCalendar.innerHTML = '';

    if (calendars.length > 0) {
        if (!selectedRemoteCalendarId) {
            selectedRemoteCalendarId = calendars[0].id;
            btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = calendars[0].summary;
        }

        calendars.forEach(c => {
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'gcal-dropdown-item' + (selectedRemoteCalendarId === c.id ? ' selected' : '');
            opt.textContent = c.summary;
            opt.addEventListener('click', () => {
                selectedRemoteCalendarId = c.id;
                btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = c.summary;
                menuGCalRemoteCalendar.classList.remove('show');
                populateRemoteCalendarsDropdown(calendars);
            });
            menuGCalRemoteCalendar.appendChild(opt);
        });
    } else {
        btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = 'Календари отсутствуют';
    }

    // Кнопка создания нового календаря
    const optNew = document.createElement('button');
    optNew.type = 'button';
    optNew.className = 'gcal-dropdown-item';
    optNew.style.color = 'var(--accent)';
    optNew.style.fontWeight = 'bold';
    optNew.textContent = '+ Добавить календарь';
    optNew.addEventListener('click', async () => {
        menuGCalRemoteCalendar.classList.remove('show');
        const name = prompt("Введите название нового календаря:", "Todoist");
        if (name) {
            try {
                btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = 'Создание...';
                let newCal;
                try {
                    newCal = await window.GCalendarService.createCalendar(name);
                } catch (apiErr) {
                    console.warn("Не удалось создать календарь по API, создаем локальную заглушку:", apiErr);
                    newCal = { id: 'mock_' + Date.now(), summary: name };
                }

                selectedRemoteCalendarId = newCal.id;
                btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = newCal.summary;

                calendars.push(newCal);
                populateRemoteCalendarsDropdown(calendars);
            } catch (e) {
                alert("Не удалось создать календарь: " + e.message);
                btnGCalRemoteCalendar.querySelector('.trigger-text').textContent = 'Выберите календарь...';
            }
        }
    });
    menuGCalRemoteCalendar.appendChild(optNew);
}

function renderActiveMappings() {
    if (!gcalMappingsList) return;
    gcalMappingsList.innerHTML = '';

    const keys = Object.keys(gcalMappings);
    if (keys.length === 0) {
        gcalMappingsList.innerHTML = '<div class="gcal-no-mappings">Нет активных синхронизаций</div>';
        return;
    }

    keys.forEach(projId => {
        const calId = gcalMappings[projId];
        let projName = '';
        if (projId === 'all') {
            projName = 'Все';
        } else if (projId === 'inbox') {
            projName = 'Входящие';
        } else {
            projName = (projectsList.find(p => p.id === projId)?.name || 'Неизвестный проект');
        }

        const item = document.createElement('div');
        item.className = 'gcal-mapping-item';
        item.innerHTML = `
            <div class="gcal-mapping-details">
                <span>${escapeHtml(projName)}</span>
                <span class="gcal-mapping-arrow">⇄</span>
                <span style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(calId)}</span>
            </div>
            <button class="gcal-mapping-delete" data-project="${projId}" title="Удалить привязку">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        item.querySelector('.gcal-mapping-delete').addEventListener('click', async (e) => {
            const pId = e.currentTarget.getAttribute('data-project');

            if (!confirm("Вы действительно хотите удалить эту синхронизацию? Все задачи этого проекта будут удалены из Google Календаря.")) {
                return;
            }

            const tasksToClear = allTasks.filter(t => (pId === 'all' || (pId === 'inbox' ? !t.projectId : t.projectId === pId)) && t.gcal_event_id);
            for (const task of tasksToClear) {
                try {
                    await window.GCalendarService.deleteTaskFromGoogle(task.gcal_event_id, task.gcal_calendar_id || calId);
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                        gcal_event_id: null,
                        gcal_calendar_id: null
                    });
                } catch (err) {
                    console.error("Ошибка удаления события при снятии привязки:", err);
                }
            }

            delete gcalMappings[pId];
            await saveGCalConfig();
            renderActiveMappings();
        });

        gcalMappingsList.appendChild(item);
    });
}

function closeGCalModal() {
    if (gcalIntegrationModal) gcalIntegrationModal.style.display = 'none';
}

if (btnGCalModalClose) btnGCalModalClose.addEventListener('click', closeGCalModal);
if (btnGCalModalCancel) btnGCalModalCancel.addEventListener('click', closeGCalModal);

if (btnGCalModalSave) {
    btnGCalModalSave.addEventListener('click', async () => {
        const localProj = selectedLocalProjectId;
        const remoteCal = selectedRemoteCalendarId;

        if (!localProj || !remoteCal) {
            alert("Пожалуйста, выберите проект и календарь.");
            return;
        }

        gcalMappings[localProj] = remoteCal;

        await saveGCalConfig();
        renderActiveMappings();

        syncAllTasksForProject(localProj);

        closeGCalModal();
    });
}

async function syncAllTasksForProject(projectId) {
    const calendarId = gcalMappings[projectId];
    if (!calendarId) return;

    const tasksToSync = allTasks.filter(t =>
        !t.deleted &&
        !t.completed &&
        (projectId === 'all' ? true : (projectId === 'inbox' ? !t.projectId : t.projectId === projectId))
    );

    for (const task of tasksToSync) {
        if (syncingTasks.has(task.id)) continue;
        syncingTasks.add(task.id);

        try {
            const currentTaskHash = `${task.title || ''}|${task.dueDate || ''}|${task.dueTime || ''}|${task.dueRepeat || ''}|${task.dueEndDate || ''}|${task.dueEndTime || ''}|${task.completed}|${task.description || ''}`;
            const eventId = await window.GCalendarService.syncTaskToGoogle(task, calendarId);
            if (eventId) {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                    gcal_event_id: eventId,
                    gcal_calendar_id: calendarId,
                    gcal_last_sync_hash: currentTaskHash
                });
            }
        } catch (err) {
            console.error(`Ошибка синхронизации задачи ${task.id}:`, err);
        } finally {
            syncingTasks.delete(task.id);
        }
    }
}

async function handleTaskSync(task) {
    if (!currentUid) return;

    // Предотвращаем одновременную повторную синхронизацию одной и той же задачи в этой вкладке
    if (syncingTasks.has(task.id)) return;

    // Проверка межвкладочного лока в localStorage (действует 15 секунд)
    const lockKey = `gcal_sync_lock_${task.id}`;
    const activeLock = localStorage.getItem(lockKey);
    if (activeLock && Date.now() - parseInt(activeLock) < 15000) {
        return;
    }

    const token = localStorage.getItem('google_calendar_access_token');
    if (!token) return;

    if (!gcalSyncTasks) return;

    // Сначала проверяем общую синхронизацию ("all"), затем точечную
    const mappedCalendarId = gcalMappings['all'] || gcalMappings[task.projectId || 'inbox'];

    const isAllDay = !task.dueTime;
    const shouldHaveEvent = !task.completed && !task.deleted && task.dueDate && mappedCalendarId && (!isAllDay || gcalSyncAllDay);
    const currentTaskHash = `${task.title || ''}|${task.dueDate || ''}|${task.dueTime || ''}|${task.dueRepeat || ''}|${task.dueEndDate || ''}|${task.dueEndTime || ''}|${task.completed}|${task.description || ''}`;

    if (shouldHaveEvent) {
        // Если уже есть корректная привязка и данные не изменились — ничего не делаем
        if (task.gcal_event_id && task.gcal_calendar_id === mappedCalendarId && task.gcal_last_sync_hash === currentTaskHash) {
            return;
        }

        syncingTasks.add(task.id);
        localStorage.setItem(lockKey, Date.now().toString());

        try {
            if (task.gcal_event_id && task.gcal_calendar_id && task.gcal_calendar_id !== mappedCalendarId) {
                try {
                    await window.GCalendarService.deleteTaskFromGoogle(task.gcal_event_id, task.gcal_calendar_id);
                } catch (e) {
                    console.error("Ошибка удаления старого события:", e);
                }
                task.gcal_event_id = null;
            }

            const eventId = await window.GCalendarService.syncTaskToGoogle(task, mappedCalendarId);
            if (eventId) {
                await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                    gcal_event_id: eventId,
                    gcal_calendar_id: mappedCalendarId,
                    gcal_last_sync_hash: currentTaskHash
                });
            }
        } catch (err) {
            console.error("Ошибка при синхронизации задачи с Google:", err);
        } finally {
            syncingTasks.delete(task.id);
            localStorage.removeItem(lockKey);
        }
    } else {
        if (task.gcal_event_id && task.gcal_calendar_id) {
            syncingTasks.add(task.id);
            localStorage.setItem(lockKey, Date.now().toString());
            try {
                await window.GCalendarService.deleteTaskFromGoogle(task.gcal_event_id, task.gcal_calendar_id);
                await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                    gcal_event_id: null,
                    gcal_calendar_id: null,
                    gcal_last_sync_hash: null
                });
            } catch (err) {
                console.error("Ошибка при удалении события из Google:", err);
            } finally {
                syncingTasks.delete(task.id);
                localStorage.removeItem(lockKey);
            }
        }
    }
}

async function handleTaskDelete(task) {
    if (task.gcal_event_id && task.gcal_calendar_id) {
        try {
            await window.GCalendarService.deleteTaskFromGoogle(task.gcal_event_id, task.gcal_calendar_id);
        } catch (err) {
            console.error("Ошибка при удалении события при удалении задачи:", err);
        }
    }
}

// === FETCH AND RENDER GCAL EVENTS ON BANNERS ===

async function fetchAndRenderGCalEvents(force = false, allowInteractive = false) {
    const banner = document.getElementById('gcalEventsBanner');
    if (!banner) return;

    const token = localStorage.getItem('google_calendar_access_token');
    const showEvents = localStorage.getItem('gcal_show_events') !== 'false';

    if (!token || !showEvents || (currentRoute !== 'today' && currentRoute !== 'tomorrow')) {
        banner.style.display = 'none';
        return;
    }

    const now = Date.now();
    const isCacheValid = !force &&
        (now - gcalLastFetchTime < 60 * 1000) &&
        (gcalCachedDate === currentRoute) &&
        gcalCachedEvents.length > 0;

    if (isCacheValid) {
        renderGCalEventsBanner(gcalCachedEvents);
        return;
    }

    if (gcalCachedDate !== currentRoute) {
        banner.style.display = 'none';
        gcalCachedEvents = [];
    }

    if (gcalIsFetching) return;
    gcalIsFetching = true;

    try {
        const calendars = await window.GCalendarService.fetchCalendars(allowInteractive);
        const visibleCalendars = calendars.filter(c => !gcalHiddenCalendars.includes(c.id));

        if (visibleCalendars.length === 0) {
            gcalCachedEvents = [];
            gcalCachedDate = currentRoute;
            gcalLastFetchTime = Date.now();
            renderGCalEventsBanner([]);
            return;
        }

        const targetDate = new Date();
        if (currentRoute === 'tomorrow') {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

        const timeMin = startOfDay.toISOString();
        const timeMax = endOfDay.toISOString();

        const fetchPromises = visibleCalendars.map(async (cal) => {
            try {
                const events = await window.GCalendarService.fetchEventsForRange(cal.id, timeMin, timeMax, allowInteractive);
                return events.map(e => ({
                    ...e,
                    calendarColor: cal.backgroundColor || '#4285F4',
                    calendarName: cal.summary
                }));
            } catch (err) {
                console.error(`Error fetching events for calendar ${cal.summary}:`, err);
                return [];
            }
        });

        const results = await Promise.all(fetchPromises);
        const allEvents = results.flat();

        allEvents.sort((a, b) => {
            const aIsAllDay = !a.start.dateTime;
            const bIsAllDay = !b.start.dateTime;

            if (aIsAllDay && !bIsAllDay) return -1;
            if (!aIsAllDay && bIsAllDay) return 1;

            if (!aIsAllDay && !bIsAllDay) {
                return new Date(a.start.dateTime) - new Date(b.start.dateTime);
            }

            return a.summary.localeCompare(b.summary);
        });

        gcalCachedEvents = allEvents;
        gcalCachedDate = currentRoute;
        gcalLastFetchTime = Date.now();

        renderGCalEventsBanner(allEvents);
    } catch (err) {
        console.error("Error fetching calendar events:", err);
        const listEl = document.getElementById('gcalBannerEventsList');
        const toggleBtn = document.getElementById('btnGCalBannerToggle');
        if (banner && listEl) {
            if (err.message === 'CALENDAR_TOKEN_EXPIRED') {
                banner.style.display = 'block';
                listEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 0.85rem; padding: 4px 8px; color: var(--text-secondary);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-secondary)" stroke-width="2" style="flex-shrink:0;">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <span>Сессия Google Календаря истекла.</span>
                        </div>
                        <button id="btnGCalBannerReconnect" class="gcal-reconnect-link-btn" 
                                style="background: none; border: none; color: #4285F4; font-weight: 600; cursor: pointer; padding: 0 4px; font-size: 0.85rem; text-decoration: underline;">
                            Войти заново
                        </button>
                    </div>
                `;
                const reconnectBtn = document.getElementById('btnGCalBannerReconnect');
                if (reconnectBtn) {
                    reconnectBtn.addEventListener('click', async () => {
                        try {
                            const newToken = await window.connectGoogleCalendar(true);
                            if (newToken) {
                                await loadGCalConfig();
                                updateGCalSettingsUI();
                                fetchAndRenderGCalEvents(true, true);
                            }
                        } catch (e) {
                            console.error("Ошибка при подключении из баннера:", e);
                        }
                    });
                }
                if (toggleBtn) toggleBtn.style.display = 'none';
            } else {
                banner.style.display = 'none';
            }
        }
    } finally {
        gcalIsFetching = false;
    }
}

function renderGCalEventsBanner(events) {
    const banner = document.getElementById('gcalEventsBanner');
    const listEl = document.getElementById('gcalBannerEventsList');
    const toggleBtn = document.getElementById('btnGCalBannerToggle');

    if (!banner) return;

    if (!events || events.length === 0) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'block';

    const isCollapsed = localStorage.getItem('gcal_banner_collapsed') === 'true';
    if (isCollapsed && events.length > 1) {
        banner.classList.add('collapsed');
    } else {
        banner.classList.remove('collapsed');
    }

    if (toggleBtn) {
        toggleBtn.style.display = events.length > 1 ? 'flex' : 'none';
    }

    if (listEl) {
        listEl.innerHTML = '';

        if (isCollapsed && events.length > 1) {
            // Свернутое состояние: показываем цветные полосочки всех событий и заголовок первого + "и еще N"
            const row = document.createElement('div');
            row.className = 'gcal-event-row';
            row.style.display = 'flex';
            row.style.alignItems = 'center';

            // Контейнер с цветными полосками side-by-side
            let barsHtml = `<div style="display: flex; gap: 2px; align-items: center; flex-shrink: 0; margin-right: 6px;">`;
            events.forEach(e => {
                barsHtml += `<div class="gcal-event-bar" style="background-color: ${e.calendarColor};"></div>`;
            });
            barsHtml += `</div>`;

            // Текст: первый ивент + сколько еще
            const firstEvent = events[0];
            let firstTimeText = '';
            if (firstEvent.start.dateTime) {
                const start = new Date(firstEvent.start.dateTime);
                const end = new Date(firstEvent.end.dateTime);
                const startH = String(start.getHours()).padStart(2, '0');
                const startM = String(start.getMinutes()).padStart(2, '0');
                const endH = String(end.getHours()).padStart(2, '0');
                const endM = String(end.getMinutes()).padStart(2, '0');
                firstTimeText = `${startH}:${startM}-${endH}:${endM} `;
            }

            const titleText = escapeHtml(firstEvent.summary || 'Без названия');
            const suffix = ` и еще ${events.length - 1}..`;

            row.innerHTML = `
                ${barsHtml}
                <span class="gcal-event-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: calc(100% - 24px);">
                    ${firstTimeText ? `<span class="gcal-event-time" style="margin-right: 4px;">${firstTimeText}</span>` : ''}${titleText}${suffix}
                </span>
            `;
            listEl.appendChild(row);
        } else {
            // Развернутое состояние или 1 событие
            events.forEach(e => {
                const row = document.createElement('div');
                row.className = 'gcal-event-row';

                let timeText = '';
                if (e.start.dateTime) {
                    const start = new Date(e.start.dateTime);
                    const end = new Date(e.end.dateTime);
                    const startH = String(start.getHours()).padStart(2, '0');
                    const startM = String(start.getMinutes()).padStart(2, '0');
                    const endH = String(end.getHours()).padStart(2, '0');
                    const endM = String(end.getMinutes()).padStart(2, '0');
                    timeText = `${startH}:${startM}-${endH}:${endM}`;
                }

                row.innerHTML = `
                    <div class="gcal-event-bar" style="background-color: ${e.calendarColor};"></div>
                    ${timeText ? `<span class="gcal-event-time">${timeText}</span>` : ''}
                    <span class="gcal-event-title">${escapeHtml(e.summary || 'Без названия')}</span>
                `;
                listEl.appendChild(row);
            });
        }
    }
}

// Привязка клика по кнопке сворачивания баннера
const btnGCalBannerToggle = document.getElementById('btnGCalBannerToggle');
if (btnGCalBannerToggle) {
    btnGCalBannerToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = localStorage.getItem('gcal_banner_collapsed') === 'true';
        localStorage.setItem('gcal_banner_collapsed', !isCollapsed);
        renderGCalEventsBanner(gcalCachedEvents);
    });
}

// Привязка кнопок управления календарями в настройках
const btnGCalConnect = document.getElementById('btnGCalConnect');
if (btnGCalConnect) {
    btnGCalConnect.addEventListener('click', async () => {
        const token = localStorage.getItem('google_calendar_access_token');
        const expiry = parseInt(localStorage.getItem('google_calendar_token_expiry') || '0');
        const isExpired = token && (Date.now() + 300 * 1000 > expiry);

        // Если токен есть и он НЕ истек — отключаем календарь.
        // Если он истек — предлагаем авторизоваться заново (так как кнопка показывает "Войти заново").
        if (token && !isExpired) {
            localStorage.removeItem('google_calendar_access_token');
            localStorage.removeItem('google_calendar_refresh_token');
            localStorage.removeItem('google_calendar_token_expiry');
            localStorage.removeItem('gcal_hidden_calendars');

            if (currentUid) {
                await window.setDoc(window.doc(db, "users", currentUid), {
                    google_calendar_access_token: null,
                    google_calendar_refresh_token: null,
                    google_calendar_token_expiry: null,
                    gcal_mappings: {},
                    gcal_hidden_calendars: []
                }, { merge: true });
            }

            gcalMappings = {};
            gcalHiddenCalendars = [];
            updateGCalSettingsUI();

            gcalLastFetchTime = 0;
            fetchAndRenderGCalEvents(true);
        } else {
            try {
                const newToken = await window.connectGoogleCalendar(true);
                if (newToken) {
                    await loadGCalConfig();
                    updateGCalSettingsUI();
                    fetchAndRenderGCalEvents(true, true);
                }
            } catch (e) {
                console.error("Ошибка подключения/обновления календаря:", e);
            }
        }
    });
}

const btnGCalSyncNow = document.getElementById('btnGCalSyncNow');
if (btnGCalSyncNow) {
    btnGCalSyncNow.addEventListener('click', () => {
        gcalLastFetchTime = 0;
        updateGCalSettingsUI();
        fetchAndRenderGCalEvents(true, true);
    });
}

// Привязка переключателей настроек
const prefGCalShowEvents = document.getElementById('prefGCalShowEvents');
if (prefGCalShowEvents) {
    prefGCalShowEvents.addEventListener('change', async (e) => {
        gcalShowEvents = e.target.checked;
        localStorage.setItem('gcal_show_events', gcalShowEvents);
        if (currentUid) {
            await window.setDoc(window.doc(db, "users", currentUid), {
                gcal_show_events: gcalShowEvents
            }, { merge: true });
        }
        const calendarsContainer = document.getElementById('gcalCalendarsContainer');
        if (calendarsContainer) {
            calendarsContainer.style.display = gcalShowEvents ? 'flex' : 'none';
        }
        gcalLastFetchTime = 0;
        fetchAndRenderGCalEvents(true);
    });
}

window.addEventListener('googleCalendarTokenChanged', () => {
    updateGCalSettingsUI();
});

// === ЛОГИКА ТАЙМЕРА ПОМОДОРО (ИЗ POMODORO.HTML) ===
let pomoAudioCtx = null;
function pomoPlayBeep() {
    try {
        if (!pomoAudioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                pomoAudioCtx = new AudioContextClass();
            }
        }
        if (pomoAudioCtx) {
            if (pomoAudioCtx.state === 'suspended') pomoAudioCtx.resume();
            function createOscillator(timeOffset) {
                const osc = pomoAudioCtx.createOscillator();
                const gain = pomoAudioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, pomoAudioCtx.currentTime + timeOffset);
                osc.frequency.exponentialRampToValueAtTime(300, pomoAudioCtx.currentTime + timeOffset + 0.3);
                gain.gain.setValueAtTime(1, pomoAudioCtx.currentTime + timeOffset);
                gain.gain.exponentialRampToValueAtTime(0.01, pomoAudioCtx.currentTime + timeOffset + 0.3);
                osc.connect(gain);
                gain.connect(pomoAudioCtx.destination);
                osc.start(pomoAudioCtx.currentTime + timeOffset);
                osc.stop(pomoAudioCtx.currentTime + timeOffset + 0.3);
            }
            createOscillator(0);
            createOscillator(0.4);
        }
    } catch (e) {
        console.warn("Web Audio API is not supported or blocked:", e);
    }
}

const POMO_MODES = {
    pomodoro: { time: 25 * 60, color: '#ba4949' },
    shortBreak: { time: 5 * 60, color: '#38858a' },
    longBreak: { time: 15 * 60, color: '#397097' }
};

let pomoCurrentMode = 'pomodoro';
let pomoTimeLeft = POMO_MODES[pomoCurrentMode].time;
let pomoTimerInterval = null;
let pomoIsRunning = false;
let pomoCompletedCount = 0;

let pomoTasks = [];
let pomoActiveTaskId = null;

// Находим элементы на странице
const pomoTimeDisplay = document.getElementById('time-display');
const pomoStartBtn = document.getElementById('start-btn');
const pomoSkipBtn = document.getElementById('skip-btn');
const pomoTaskListEl = document.getElementById('task-list');
const pomoTaskForm = document.getElementById('task-form');
const pomoTaskInput = document.getElementById('task-input');
const pomoEstInput = document.getElementById('est-input');
const pomoAddTaskBtn = document.getElementById('add-task-btn');
const pomoCurrentTaskDisplay = document.getElementById('current-task-display');

function savePomoState() {
    localStorage.setItem('todo_pomo_mode', pomoCurrentMode);
    localStorage.setItem('todo_pomo_is_running', pomoIsRunning);
    localStorage.setItem('todo_pomo_time_left', pomoTimeLeft);
    localStorage.setItem('todo_pomo_completed_count', pomoCompletedCount);
    if (pomoIsRunning) {
        localStorage.setItem('todo_pomo_target_timestamp', Date.now() + pomoTimeLeft * 1000);
    } else {
        localStorage.removeItem('todo_pomo_target_timestamp');
    }
}

function loadPomoState() {
    const savedMode = localStorage.getItem('todo_pomo_mode');
    if (savedMode) {
        if (savedMode === 'focus') {
            pomoCurrentMode = 'pomodoro';
        } else if (POMO_MODES[savedMode]) {
            pomoCurrentMode = savedMode;
        } else {
            pomoCurrentMode = 'pomodoro';
        }
    }

    const savedCompletedCount = localStorage.getItem('todo_pomo_completed_count');
    if (savedCompletedCount) {
        pomoCompletedCount = parseInt(savedCompletedCount, 10) || 0;
    }

    const savedIsRunning = localStorage.getItem('todo_pomo_is_running') === 'true';
    const savedTimeLeftStr = localStorage.getItem('todo_pomo_time_left');
    
    if (savedIsRunning) {
        const savedTarget = localStorage.getItem('todo_pomo_target_timestamp');
        if (savedTarget) {
            const diff = Math.round((parseInt(savedTarget) - Date.now()) / 1000);
            if (diff > 0) {
                pomoTimeLeft = diff;
                pomoIsRunning = true;
            } else {
                pomoTimeLeft = POMO_MODES[pomoCurrentMode].time;
                pomoIsRunning = false;
            }
        } else {
            pomoTimeLeft = savedTimeLeftStr ? parseInt(savedTimeLeftStr) : POMO_MODES[pomoCurrentMode].time;
            pomoIsRunning = false;
        }
    } else {
        pomoTimeLeft = savedTimeLeftStr ? parseInt(savedTimeLeftStr) : POMO_MODES[pomoCurrentMode].time;
        pomoIsRunning = false;
    }
}

function pomoUpdateDisplay() {
    const minutes = Math.floor(pomoTimeLeft / 60).toString().padStart(2, '0');
    const seconds = (pomoTimeLeft % 60).toString().padStart(2, '0');
    if (pomoTimeDisplay) pomoTimeDisplay.textContent = `${minutes}:${seconds}`;
    if (currentRoute === 'pomodoro') {
        document.title = `${minutes}:${seconds} - Помодоро`;
    }
}

function pomoUpdateActiveTaskNameDisplay() {
    const activeTaskNameEl = document.getElementById('pomo-active-task-name');
    if (!activeTaskNameEl) return;
    
    const activeTask = allTasks.find(t => t.id === pomoActiveTaskId && !t.deleted);
    if (activeTask) {
        activeTaskNameEl.textContent = activeTask.title || '';
        activeTaskNameEl.style.display = 'block';
    } else {
        activeTaskNameEl.textContent = '';
        activeTaskNameEl.style.display = 'none';
    }
}

function pomoSetMode(mode) {
    clearInterval(pomoTimerInterval);
    pomoIsRunning = false;
    pomoCurrentMode = mode;
    pomoTimeLeft = POMO_MODES[pomoCurrentMode].time;
    
    const container = document.getElementById('pomodoroContainer');
    if (container) container.style.backgroundColor = '';
    const timerCard = container ? container.querySelector('.timer-container') : null;
    if (timerCard) timerCard.style.backgroundColor = POMO_MODES[pomoCurrentMode].color;
    if (pomoStartBtn) {
        pomoStartBtn.style.color = POMO_MODES[pomoCurrentMode].color;
        pomoStartBtn.textContent = 'СТАРТ';
        pomoStartBtn.classList.remove('active-press');
    }
    if (pomoSkipBtn) pomoSkipBtn.style.display = 'none';
    
    document.querySelectorAll('#pomodoroContainer .tabs button').forEach(btn => btn.classList.remove('active'));
    const activeTabBtn = document.getElementById(`btn-${mode === 'shortBreak' ? 'short' : mode === 'longBreak' ? 'long' : 'pomodoro'}`);
    if (activeTabBtn) activeTabBtn.classList.add('active');
    
    pomoUpdateDisplay();
    pomoUpdateActiveTaskNameDisplay();
    pomoUpdateStats();
    savePomoState();
}

function pomoToggleTimer() {
    if (pomoAudioCtx && pomoAudioCtx.state === 'suspended') pomoAudioCtx.resume();

    if (pomoIsRunning) {
        clearInterval(pomoTimerInterval);
        pomoIsRunning = false;
        if (pomoStartBtn) {
            pomoStartBtn.textContent = 'СТАРТ';
            pomoStartBtn.classList.remove('active-press');
        }
        if (pomoSkipBtn) pomoSkipBtn.style.display = 'none';
        savePomoState();
    } else {
        pomoIsRunning = true;
        if (pomoStartBtn) {
            pomoStartBtn.textContent = 'ПАУЗА';
            pomoStartBtn.classList.add('active-press');
        }
        if (pomoSkipBtn) pomoSkipBtn.style.display = 'block';
        savePomoState();
        
        pomoTimerInterval = setInterval(() => {
            if (pomoTimeLeft > 0) {
                pomoTimeLeft--;
                pomoUpdateDisplay();
                savePomoState();
                pomoUpdateStats();
            } else {
                pomoHandleTimerComplete(false);
            }
        }, 1000);
    }
}

function pomoSkipTimer() {
    pomoHandleTimerComplete(true);
}

function pomoHandleTimerComplete(isSkip = false) {
    clearInterval(pomoTimerInterval);
    pomoIsRunning = false;
    
    const wasPomodoro = pomoCurrentMode === 'pomodoro';
    
    if (wasPomodoro && pomoActiveTaskId !== null) {
        const task = allTasks.find(t => t.id === pomoActiveTaskId && !t.deleted);
        if (task && !task.completed) {
            const newAct = (task.actPomos || 0) + 1;
            task.actPomos = newAct;
            if (currentUid) {
                updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), { actPomos: newAct })
                    .catch(err => console.error("Ошибка обновления actPomos:", err));
            }
        }
    }
    
    if (!isSkip) {
        pomoPlayBeep();
        setTimeout(() => alert("Время вышло!"), 50);
    }
    
    if (wasPomodoro) {
        pomoCompletedCount++;
        if (pomoCompletedCount > 0 && pomoCompletedCount % 4 === 0) {
            pomoSetMode('longBreak');
        } else {
            pomoSetMode('shortBreak');
        }
    } else {
        pomoSetMode('pomodoro');
    }
    
    pomoRenderTasks();
    pomoUpdateStats();
}

function pomoShowTaskForm() {
    if (pomoTaskForm) pomoTaskForm.style.display = 'block';
    if (pomoAddTaskBtn) pomoAddTaskBtn.style.display = 'none';
    if (pomoTaskInput) pomoTaskInput.focus();
}

function pomoHideTaskForm() {
    if (pomoTaskForm) pomoTaskForm.style.display = 'none';
    if (pomoAddTaskBtn) pomoAddTaskBtn.style.display = 'flex';
    if (pomoTaskInput) pomoTaskInput.value = '';
    if (pomoEstInput) pomoEstInput.value = '1';
}

function pomoSetActiveTask(id) {
    pomoActiveTaskId = id;
    pomoRenderTasks();
}

function pomoRenderTasks() {
    const listEl = document.getElementById('pomoTasksList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const pomoTasks = allTasks.filter(t => !t.deleted && t.inPomodoro);
    pomoTasks.sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 0;
        const orderB = b.order !== undefined ? b.order : 0;
        if (orderA !== orderB) return orderA - orderB;
        const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : Date.now();
        const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : Date.now();
        return timeB - timeA;
    });
    
    if (pomoActiveTaskId && !pomoTasks.some(t => t.id === pomoActiveTaskId)) {
        pomoActiveTaskId = null;
    }
    if (!pomoActiveTaskId && pomoTasks.length > 0) {
        pomoActiveTaskId = pomoTasks[0].id;
    }

    pomoUpdateActiveTaskNameDisplay();

    pomoTasks.forEach((task) => {
        const itemEl = createTaskRowElement(task);
        
        const isActive = task.id === pomoActiveTaskId;
        if (isActive) {
            itemEl.classList.add('active-task');
        }

        // Создаем кнопку-переключатель (буллит) выбора задачи для Помодоро
        const targetBtn = document.createElement('button');
        targetBtn.className = 'pomo-select-target-btn';
        targetBtn.title = isActive ? 'Текущая задача для фокуса' : 'Выбрать эту задачу для фокуса';
        targetBtn.style.background = 'none';
        targetBtn.style.border = 'none';
        targetBtn.style.cursor = 'pointer';
        targetBtn.style.padding = '4px';
        targetBtn.style.display = 'flex';
        targetBtn.style.alignItems = 'center';
        targetBtn.style.justifyContent = 'center';
        targetBtn.style.marginRight = '8px';
        targetBtn.style.marginLeft = 'auto';
        targetBtn.style.color = isActive ? 'var(--accent, #4b6bfb)' : 'var(--text-secondary, #818c99)';
        targetBtn.style.opacity = isActive ? '1' : '0.4';
        targetBtn.style.transition = 'opacity 0.2s, color 0.2s';

        if (isActive) {
            targetBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle>
                    <circle cx="12" cy="12" r="5"></circle>
                </svg>
            `;
        } else {
            targetBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                </svg>
            `;
            
            targetBtn.addEventListener('mouseenter', () => {
                targetBtn.style.opacity = '1';
                targetBtn.style.color = 'var(--accent, #4b6bfb)';
            });
            targetBtn.addEventListener('mouseleave', () => {
                targetBtn.style.opacity = '0.4';
                targetBtn.style.color = 'var(--text-secondary, #818c99)';
            });
        }

        targetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pomoActiveTaskId = task.id;
            pomoRenderTasks();
        });

        const countBadge = document.createElement('span');
        countBadge.className = 'pomo-task-count-badge';
        countBadge.style.marginRight = '12px';
        countBadge.style.fontFamily = "'Nunito', sans-serif";
        countBadge.style.fontSize = '14px';
        countBadge.style.fontWeight = '600';
        countBadge.style.cursor = 'pointer';
        countBadge.style.padding = '4px 8px';
        countBadge.style.borderRadius = '6px';
        countBadge.style.transition = 'background-color 0.2s';
        
        countBadge.addEventListener('mouseenter', () => {
            countBadge.style.backgroundColor = 'var(--hover-bg, rgba(0,0,0,0.05))';
        });
        countBadge.addEventListener('mouseleave', () => {
            countBadge.style.backgroundColor = 'transparent';
        });

        const hasEst = task.estPomos !== undefined && task.estPomos !== null;
        if (!hasEst) {
            countBadge.textContent = 'Настроить';
            countBadge.style.color = 'var(--accent, #4b6bfb)';
        } else {
            const act = task.actPomos || 0;
            const est = task.estPomos || 1;
            countBadge.textContent = `${act}/${est}`;
            countBadge.style.color = 'var(--text-secondary)';
        }

        countBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const currentAct = task.actPomos || 0;
            const currentEst = task.estPomos !== undefined && task.estPomos !== null ? task.estPomos : 1;
            const currentRem = Math.max(0, currentEst - currentAct);

            const overlay = document.createElement('div');
            overlay.className = 'due-modal-overlay';
            overlay.id = 'pomoSettingsModalOverlay';
            overlay.style.cssText = 'display: flex; align-items: center; justify-content: center; z-index: 10000; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);';

            overlay.innerHTML = `
                <div class="due-modal" style="width: 100%; max-width: 320px; background: var(--card-bg, #ffffff); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); box-sizing: border-box; font-family: 'Nunito', sans-serif; display: flex; flex-direction: column; gap: 16px; border: 1px solid var(--border, #e7e8ec);">
                    <div style="font-weight: 700; font-size: 18px; color: var(--text-primary, #000000); text-align: center;">Настройка Помодоро</div>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary, #818c99);">Выполнено:</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button id="pomoModalDecAct" style="background: var(--hover-bg, #f0f2f5); border: none; width: 28px; height: 28px; border-radius: 8px; font-weight: bold; cursor: pointer; color: var(--text-primary);">-</button>
                                <input id="pomoModalInputAct" type="number" value="${currentAct}" min="0" style="width: 44px; text-align: center; border: 1px solid var(--border, #e7e8ec); border-radius: 8px; padding: 4px; font-family: 'Nunito', sans-serif; font-size: 14px; font-weight: bold; color: var(--text-primary); background: transparent;">
                                <button id="pomoModalIncAct" style="background: var(--hover-bg, #f0f2f5); border: none; width: 28px; height: 28px; border-radius: 8px; font-weight: bold; cursor: pointer; color: var(--text-primary);">+</button>
                            </div>
                        </div>
                        
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary, #818c99);">Осталось:</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button id="pomoModalDecEst" style="background: var(--hover-bg, #f0f2f5); border: none; width: 28px; height: 28px; border-radius: 8px; font-weight: bold; cursor: pointer; color: var(--text-primary);">-</button>
                                <input id="pomoModalInputEst" type="number" value="${currentRem}" min="0" style="width: 44px; text-align: center; border: 1px solid var(--border, #e7e8ec); border-radius: 8px; padding: 4px; font-family: 'Nunito', sans-serif; font-size: 14px; font-weight: bold; color: var(--text-primary); background: transparent;">
                                <button id="pomoModalIncEst" style="background: var(--hover-bg, #f0f2f5); border: none; width: 28px; height: 28px; border-radius: 8px; font-weight: bold; cursor: pointer; color: var(--text-primary);">+</button>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px;">
                        <button id="pomoModalCancel" style="background: transparent; border: none; color: var(--text-secondary, #818c99); font-weight: 600; padding: 8px 16px; cursor: pointer; font-size: 14px;">Отмена</button>
                        <button id="pomoModalSave" style="background: var(--accent, #4b6bfb); border: none; color: white; font-weight: 600; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; box-shadow: 0 4px 10px rgba(75, 107, 251, 0.2);">Сохранить</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const inputAct = overlay.querySelector('#pomoModalInputAct');
            const inputEst = overlay.querySelector('#pomoModalInputEst');

            overlay.querySelector('#pomoModalDecAct').onclick = () => { inputAct.value = Math.max(0, parseInt(inputAct.value) - 1); };
            overlay.querySelector('#pomoModalIncAct').onclick = () => { inputAct.value = parseInt(inputAct.value) + 1; };
            overlay.querySelector('#pomoModalDecEst').onclick = () => { inputEst.value = Math.max(0, parseInt(inputEst.value) - 1); };
            overlay.querySelector('#pomoModalIncEst').onclick = () => { inputEst.value = parseInt(inputEst.value) + 1; };

            const closeModal = () => {
                overlay.remove();
            };

            overlay.querySelector('#pomoModalCancel').onclick = closeModal;
            overlay.onclick = (event) => {
                if (event.target === overlay) closeModal();
            };

            overlay.querySelector('#pomoModalSave').onclick = async () => {
                const act = Math.max(0, parseInt(inputAct.value) || 0);
                const rem = Math.max(0, parseInt(inputEst.value) || 0);
                
                let est = act + rem;
                if (est < 1) est = 1;

                task.actPomos = act;
                task.estPomos = est;

                const localTask = allTasks.find(t => t.id === task.id);
                if (localTask) {
                    localTask.actPomos = act;
                    localTask.estPomos = est;
                }

                pomoRenderTasks();
                closeModal();

                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                        actPomos: act,
                        estPomos: est
                    });
                } catch (err) {
                    console.error("Ошибка при обновлении лимитов Помодоро:", err);
                }
            };
        });

        const taskActions = itemEl.querySelector('.task-actions');
        if (taskActions) {
            itemEl.insertBefore(targetBtn, taskActions);
            itemEl.insertBefore(countBadge, taskActions);
        } else {
            itemEl.appendChild(targetBtn);
            itemEl.appendChild(countBadge);
        }

        listEl.appendChild(itemEl);
    });

    pomoUpdateStats();
}

function pomoUpdateStats() {
    const statsEl = document.getElementById('pomoBottomStats');
    if (!statsEl) return;

    const pomoTasks = allTasks.filter(t => !t.deleted && t.inPomodoro);
    let totalEst = 0;
    let totalAct = 0;
    pomoTasks.forEach(t => {
        totalAct += t.actPomos || 0;
        if (t.completed) {
            totalEst += t.actPomos || 0;
        } else {
            totalEst += t.estPomos || 1;
        }
    });

    const remainingPomos = Math.max(0, totalEst - totalAct);
    if (remainingPomos > 0) {
        let totalMinutesLeft = (remainingPomos - 1) * 30;
        if (pomoCurrentMode === 'pomodoro') {
            totalMinutesLeft += (pomoTimeLeft / 60) + 5;
        } else {
            totalMinutesLeft += (pomoTimeLeft / 60);
        }

        const finishTime = new Date(Date.now() + totalMinutesLeft * 60000);
        const hours = finishTime.getHours().toString().padStart(2, '0');
        const minutes = finishTime.getMinutes().toString().padStart(2, '0');
        const decimalHours = (totalMinutesLeft / 60).toFixed(1);

        statsEl.textContent = `Помидоры: ${totalAct}/${totalEst} Закончим в: ${hours}:${minutes} (${decimalHours}ч)`;
    } else {
        statsEl.textContent = `Помидоры: ${totalAct}/${totalEst}`;
    }
}

function startPomodoroForTask(task) {
    pomoSetActiveTask(task.id);
    window.location.hash = '#pomodoro';
    pomoSetMode('pomodoro');
}

function updatePomoActiveTaskUI() {
    pomoRenderTasks();
}

function initPomodoroEvents() {
    const focusBtn = document.getElementById('btn-pomodoro');
    const shortBtn = document.getElementById('btn-short');
    const longBtn = document.getElementById('btn-long');
    const startBtn = document.getElementById('start-btn');
    const skipBtn = document.getElementById('skip-btn');

    if (focusBtn) focusBtn.addEventListener('click', () => pomoSetMode('pomodoro'));
    if (shortBtn) shortBtn.addEventListener('click', () => pomoSetMode('shortBreak'));
    if (longBtn) longBtn.addEventListener('click', () => pomoSetMode('longBreak'));
    if (startBtn) startBtn.addEventListener('click', pomoToggleTimer);
    if (skipBtn) skipBtn.addEventListener('click', pomoSkipTimer);
}

function pomoRestoreTimer() {
    loadPomoState();
    
    const container = document.getElementById('pomodoroContainer');
    if (container) container.style.backgroundColor = '';
    const timerCard = container ? container.querySelector('.timer-container') : null;
    if (timerCard) timerCard.style.backgroundColor = POMO_MODES[pomoCurrentMode].color;
    
    document.querySelectorAll('#pomodoroContainer .tabs button').forEach(btn => btn.classList.remove('active'));
    const activeTabBtn = document.getElementById(`btn-${pomoCurrentMode === 'shortBreak' ? 'short' : pomoCurrentMode === 'longBreak' ? 'long' : 'pomodoro'}`);
    if (activeTabBtn) activeTabBtn.classList.add('active');

    pomoUpdateDisplay();
    pomoRenderTasks();

    const startBtn = document.getElementById('start-btn');
    if (pomoIsRunning) {
        if (startBtn) {
            startBtn.style.color = POMO_MODES[pomoCurrentMode].color;
            startBtn.textContent = 'ПАУЗА';
            startBtn.classList.add('active-press');
        }
        if (pomoSkipBtn) pomoSkipBtn.style.display = 'block';

        pomoTimerInterval = setInterval(() => {
            if (pomoTimeLeft > 0) {
                pomoTimeLeft--;
                pomoUpdateDisplay();
                savePomoState();
                pomoUpdateStats();
            } else {
                pomoHandleTimerComplete(false);
            }
        }, 1000);
    } else {
        if (startBtn) {
            startBtn.style.color = POMO_MODES[pomoCurrentMode].color;
            startBtn.textContent = 'СТАРТ';
            startBtn.classList.remove('active-press');
        }
    }
}

// Инициализация событий Помодоро
initPomodoroEvents();
pomoRestoreTimer();

// Экспортируем функции в глобальную область видимости
window.handleTaskSync = handleTaskSync;
window.handleTaskDelete = handleTaskDelete;
window.updateGCalSettingsUI = updateGCalSettingsUI;
window.loadGCalConfig = loadGCalConfig;
window.fetchAndRenderGCalEvents = fetchAndRenderGCalEvents;
window.startPomodoroForTask = startPomodoroForTask;
window.updatePomoActiveTaskUI = updatePomoActiveTaskUI;
window.initPomodoroEvents = initPomodoroEvents;
window.setPomoMode = pomoSetMode;

// === ЛОГИКА ОБРАТНОГО ОТСЧЕТА ===

function formatCountdownDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function isColorDark(hex) {
    if (!hex) return false;
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp < 155;
}

function calculateCountdownDiff(targetDateStr) {
    if (!targetDateStr) return { diff: 0, desc: '' };

    const [y, m, d] = targetDateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = targetDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const formatted = formatCountdownDate(targetDateStr);

    if (diffDays === 0) {
        return { diff: 0, display: 'Сегодня', desc: formatted };
    } else if (diffDays > 0) {
        return { diff: diffDays, display: String(diffDays), desc: `Дней до ${formatted}` };
    } else {
        return { diff: Math.abs(diffDays), display: String(Math.abs(diffDays)), desc: `Дней с ${formatted} прошло` };
    }
}

function renderCountdowns() {
    const grid = document.getElementById('countdownGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (countdownsList.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px; opacity: 0.5;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; color: var(--text-secondary);">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <div style="font-size: 16px; font-weight: 500; color: var(--text-primary);">Нет обратных отсчетов</div>
                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Нажмите на плюсик справа вверху, чтобы добавить</div>
            </div>
        `;
        return;
    }

    countdownsList.forEach(cd => {
        const { display, desc } = calculateCountdownDiff(cd.targetDate);
        const card = document.createElement('div');
        
        let inlineStyle = '';
        let themeClass = 'contrast-dark';
        
        if (cd.style === 'image') {
            const bgUrl = cd.bgUrl || 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=600&q=80';
            inlineStyle = `background-image: url('${bgUrl}');`;
            card.setAttribute('style', inlineStyle);
            card.className = `countdown-card theme-image ${themeClass}`;
        } else {
            const bgColor = cd.bgColor || '#ffffff';
            const isDark = isColorDark(bgColor);
            themeClass = isDark ? 'contrast-dark' : 'contrast-light';
            inlineStyle = `background-color: ${bgColor};`;
            card.setAttribute('style', inlineStyle);
            card.className = `countdown-card theme-color ${themeClass}`;
        }

        let overlayHtml = '';
        if (cd.style === 'image') {
            overlayHtml = `<div class="countdown-card-overlay"></div>`;
        }

        const digitColorStyle = (cd.style !== 'image' && cd.textColor) ? `style="color: ${cd.textColor};"` : '';

        card.innerHTML = `
            ${overlayHtml}
            <div class="countdown-actions">
                <button class="countdown-action-btn btn-edit" title="Редактировать">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="countdown-action-btn btn-delete" title="Удалить">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
            <div class="countdown-card-content">
                <div class="countdown-title">
                    <span>${cd.icon || '⏳'}</span>
                    <span>${cd.title}</span>
                </div>
                <div class="countdown-days" ${digitColorStyle}>${display}</div>
                <div class="countdown-desc">${desc}</div>
            </div>
        `;

        card.setAttribute('data-id', cd.id);
        card.setAttribute('draggable', 'true');

        // Attach listeners
        card.querySelector('.btn-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openCountdownModal(cd);
        });

        card.querySelector('.btn-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            showCustomConfirm(
                'Удалить событие?',
                `Вы действительно хотите удалить обратный отсчет <strong>${escapeHtml(cd.title)}</strong>?`,
                'Удалить',
                async () => {
                    try {
                        await deleteDoc(doc(db, 'users', currentUid, 'countdowns', cd.id));
                    } catch (err) {
                        console.error("Ошибка при удалении обратного отсчета:", err);
                    }
                }
            );
        });

        // HTML5 Drag & Drop for Desktop
        card.addEventListener('dragstart', (e) => {
            window.draggedCountdownCard = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            window.draggedCountdownCard = null;
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        card.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (window.draggedCountdownCard && window.draggedCountdownCard !== card) {
                card.classList.add('drag-over');
            }
        });

        card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
        });

        card.addEventListener('drop', async (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (window.draggedCountdownCard && window.draggedCountdownCard !== card) {
                const children = [...grid.children];
                const draggedIdx = children.indexOf(window.draggedCountdownCard);
                const targetIdx = children.indexOf(card);
                if (draggedIdx < targetIdx) {
                    grid.insertBefore(window.draggedCountdownCard, card.nextSibling);
                } else {
                    grid.insertBefore(window.draggedCountdownCard, card);
                }
                await saveCountdownsOrder();
            }
        });

        // Touch Long Press Drag & Drop for Mobile
        let touchStartTimer = null;
        card.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;
            const touch = e.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;
            
            let isDraggingActive = false;

            touchStartTimer = setTimeout(() => {
                isDraggingActive = true;
                card.classList.add('dragging');
                if (navigator.vibrate) navigator.vibrate(50);
            }, 400); // 400ms long press

            const touchMoveHandler = (ev) => {
                if (!isDraggingActive) {
                    const moveTouch = ev.touches[0];
                    if (Math.abs(moveTouch.clientX - startX) > 10 || Math.abs(moveTouch.clientY - startY) > 10) {
                        clearTimeout(touchStartTimer);
                    }
                } else {
                    // Prevent page scroll during drag
                    if (ev.cancelable) ev.preventDefault();
                    
                    const moveTouch = ev.touches[0];
                    const elementUnder = document.elementFromPoint(moveTouch.clientX, moveTouch.clientY);
                    const targetCard = elementUnder ? elementUnder.closest('.countdown-card') : null;
                    if (targetCard && targetCard !== card) {
                        const children = [...grid.children];
                        const activeIdx = children.indexOf(card);
                        const targetIdx = children.indexOf(targetCard);
                        if (activeIdx < targetIdx) {
                            grid.insertBefore(card, targetCard.nextSibling);
                        } else {
                            grid.insertBefore(card, targetCard);
                        }
                    }
                }
            };

            const touchEndHandler = async () => {
                clearTimeout(touchStartTimer);
                if (isDraggingActive) {
                    card.classList.remove('dragging');
                    await saveCountdownsOrder();
                }
                window.removeEventListener('touchmove', touchMoveHandler);
                window.removeEventListener('touchend', touchEndHandler);
            };

            window.addEventListener('touchmove', touchMoveHandler, { passive: false });
            window.addEventListener('touchend', touchEndHandler);
        }, { passive: true });

        grid.appendChild(card);
    });
}

async function saveCountdownsOrder() {
    const grid = document.getElementById('countdownGrid');
    if (!grid) return;
    const cardEls = [...grid.querySelectorAll('.countdown-card')];
    const batchPromises = cardEls.map((cardEl, idx) => {
        const id = cardEl.getAttribute('data-id');
        if (id) {
            return updateDoc(doc(db, 'users', currentUid, 'countdowns', id), {
                order: idx
            });
        }
    });
    try {
        await Promise.all(batchPromises);
    } catch (err) {
        console.error("Ошибка сохранения порядка обратных отсчетов:", err);
    }
}

function openCountdownModal(countdown = null) {
    const existing = document.querySelector('.countdown-modal-overlay');
    if (existing) existing.remove();

    const isEdit = !!countdown;
    let selectedIcon = countdown ? (countdown.icon || '⏳') : '⏳';
    let selectedStyle = 'color';
    let bgColor = '#ffffff';
    let textColor = '#4b6bfb';
    let customBgUrl = '';
    let selectedDate = countdown ? countdown.targetDate : new Date().toISOString().split('T')[0];

    const defaultImage = 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=600&q=80';

    if (countdown) {
        if (countdown.style === 'image' || countdown.style === 'custom') {
            selectedStyle = 'image';
            customBgUrl = countdown.bgUrl || '';
        } else {
            selectedStyle = 'color';
            if (countdown.style === 'white') {
                bgColor = '#ffffff';
                textColor = '#4b6bfb';
            } else if (countdown.style === 'dark') {
                bgColor = '#2c3e50';
                textColor = '#ffffff';
            } else if (countdown.style === 'pink') {
                bgColor = '#f5b2b2';
                textColor = '#ffffff';
            } else {
                bgColor = countdown.bgColor || '#ffffff';
                textColor = countdown.textColor || '#4b6bfb';
            }
        }
    }

    const overlay = document.createElement('div');
    overlay.className = 'countdown-modal-overlay';
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const years = [];
    for (let y = currentYear - 5; y <= currentYear + 15; y++) {
        years.push(y);
    }
    const months = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

    const [curY, curM, curD] = selectedDate.split('-').map(Number);

    let dayOptions = '';
    for (let d = 1; d <= 31; d++) {
        dayOptions += `<option value="${d}" ${d === curD ? 'selected' : ''}>${d}</option>`;
    }
    let monthOptions = '';
    months.forEach((m, index) => {
        monthOptions += `<option value="${index + 1}" ${index + 1 === curM ? 'selected' : ''}>${m}</option>`;
    });
    let yearOptions = '';
    years.forEach(y => {
        yearOptions += `<option value="${y}" ${y === curY ? 'selected' : ''}>${y}</option>`;
    });

    overlay.innerHTML = `
        <div class="countdown-modal-card">
            <div class="countdown-modal-header">
                <span class="countdown-modal-title">${isEdit ? 'Редактировать' : 'Добавить'}</span>
                <button class="countdown-modal-close" id="btnCloseCountdownModal">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            
            <div class="countdown-modal-row">
                <div class="countdown-icon-select" id="btnCountdownIconSelect">
                    <span id="countdownSelectedIcon">${selectedIcon}</span>
                    <div class="countdown-icon-edit-badge">✎</div>
                </div>
                <div class="countdown-input-wrapper">
                    <input type="text" class="countdown-input" id="inputCountdownTitle" placeholder="Название" value="${countdown ? countdown.title : ''}" maxlength="40" autocomplete="off">
                    <svg class="countdown-input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                </div>
            </div>

            <div class="countdown-modal-row">
                <span class="countdown-label">Дата</span>
                <div class="countdown-date-picker">
                    <select id="selectCountdownDay">${dayOptions}</select>
                    <select id="selectCountdownMonth">${monthOptions}</select>
                    <select id="selectCountdownYear">${yearOptions}</select>
                </div>
            </div>

            <div>
                <span class="countdown-label" style="display: block; margin-bottom: 8px;">Стиль</span>
                <div class="countdown-style-options" id="styleOptionsContainer">
                    <div class="countdown-style-thumb thumb-color ${selectedStyle === 'color' ? 'selected' : ''}" data-style="color" style="background-color: ${bgColor};"></div>
                    <div class="countdown-style-thumb thumb-image ${selectedStyle === 'image' ? 'selected' : ''}" data-style="image" style="background-image: url('${customBgUrl || defaultImage}');"></div>
                </div>

                <div class="countdown-color-controls" id="countdownColorControls" style="display: ${selectedStyle === 'color' ? 'flex' : 'none'};">
                    <div class="countdown-color-row">
                        <span class="countdown-color-label">Фон</span>
                        <div class="countdown-color-picker-wrapper">
                            <div class="countdown-color-preset" style="background-color: #ffffff;" data-color="#ffffff"></div>
                            <div class="countdown-color-preset" style="background-color: #eef2f7;" data-color="#eef2f7"></div>
                            <div class="countdown-color-preset" style="background-color: #2c3e50;" data-color="#2c3e50"></div>
                            <div class="countdown-color-preset" style="background-color: #f5b2b2;" data-color="#f5b2b2"></div>
                            <div class="countdown-color-preset" style="background-color: #f59e0b;" data-color="#f59e0b"></div>
                            
                            <div class="countdown-color-picker-btn" id="btnBgColorPicker" style="background-image: conic-gradient(red, yellow, green, cyan, blue, magenta, red);"></div>
                            <input type="color" id="inputBgColor" class="countdown-color-input-hidden" value="${bgColor}">
                        </div>
                    </div>
                    <div class="countdown-color-row">
                        <span class="countdown-color-label">Число</span>
                        <div class="countdown-color-picker-wrapper">
                            <div class="countdown-color-preset" style="background-color: #4b6bfb;" data-color="#4b6bfb"></div>
                            <div class="countdown-color-preset" style="background-color: #ffffff;" data-color="#ffffff"></div>
                            <div class="countdown-color-preset" style="background-color: #ff5f56;" data-color="#ff5f56"></div>
                            <div class="countdown-color-preset" style="background-color: #1e1e1e;" data-color="#1e1e1e"></div>
                            
                            <div class="countdown-color-picker-btn" id="btnTextColorPicker" style="background-image: conic-gradient(red, yellow, green, cyan, blue, magenta, red);"></div>
                            <input type="color" id="inputTextColor" class="countdown-color-input-hidden" value="${textColor}">
                        </div>
                    </div>
                </div>

                <button class="countdown-upload-btn" id="btnCountdownUpload" style="margin-top: 10px; display: ${selectedStyle === 'image' ? 'block' : 'none'};">Загрузить изображение</button>
            </div>

            <div class="countdown-preview-wrapper">
                <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">Предпросмотр</span>
                <div class="countdown-card" id="countdownPreviewCard" style="width: 100%; pointer-events: none;">
                    <!-- Preview filled dynamically -->
                </div>
            </div>

            <div class="countdown-modal-footer">
                <button class="countdown-btn-cancel" id="btnCancelCountdown">Отмена</button>
                <button class="countdown-btn-ok" id="btnSaveCountdown">OK</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const inputTitle = overlay.querySelector('#inputCountdownTitle');
    const selectDay = overlay.querySelector('#selectCountdownDay');
    const selectMonth = overlay.querySelector('#selectCountdownMonth');
    const selectYear = overlay.querySelector('#selectCountdownYear');
    const btnIconSelect = overlay.querySelector('#btnCountdownIconSelect');
    const selectedIconEl = overlay.querySelector('#countdownSelectedIcon');
    const previewCard = overlay.querySelector('#countdownPreviewCard');
    const styleOptionsContainer = overlay.querySelector('#styleOptionsContainer');
    const colorControls = overlay.querySelector('#countdownColorControls');
    const btnUpload = overlay.querySelector('#btnCountdownUpload');
    const btnClose = overlay.querySelector('#btnCloseCountdownModal');
    const btnCancel = overlay.querySelector('#btnCancelCountdown');
    const btnSave = overlay.querySelector('#btnSaveCountdown');

    const inputBgColor = overlay.querySelector('#inputBgColor');
    const inputTextColor = overlay.querySelector('#inputTextColor');
    const btnBgColorPicker = overlay.querySelector('#btnBgColorPicker');
    const btnTextColorPicker = overlay.querySelector('#btnTextColorPicker');

    function updatePreview() {
        const title = inputTitle.value.trim() || 'Название';
        const d = String(selectDay.value).padStart(2, '0');
        const m = String(selectMonth.value).padStart(2, '0');
        const y = selectYear.value;
        const dateStr = `${y}-${m}-${d}`;
        const { display, desc } = calculateCountdownDiff(dateStr);

        previewCard.removeAttribute('style');

        let themeClass = 'contrast-dark';
        if (selectedStyle === 'image') {
            const bgUrl = customBgUrl || defaultImage;
            previewCard.className = `countdown-card theme-image ${themeClass}`;
            previewCard.setAttribute('style', `background-image: url('${bgUrl}');`);
        } else {
            const isDark = isColorDark(bgColor);
            themeClass = isDark ? 'contrast-dark' : 'contrast-light';
            previewCard.className = `countdown-card theme-color ${themeClass}`;
            previewCard.setAttribute('style', `background-color: ${bgColor};`);
        }

        let overlayHtml = '';
        if (selectedStyle === 'image') {
            overlayHtml = `<div class="countdown-card-overlay"></div>`;
        }

        const digitColorStyle = selectedStyle === 'color' ? `style="color: ${textColor};"` : '';

        previewCard.innerHTML = `
            ${overlayHtml}
            <div class="countdown-card-content">
                <div class="countdown-title">
                    <span>${selectedIcon}</span>
                    <span>${title}</span>
                </div>
                <div class="countdown-days" ${digitColorStyle}>${display}</div>
                <div class="countdown-desc">${desc}</div>
            </div>
        `;

        const thumbColor = styleOptionsContainer.querySelector('.thumb-color');
        const thumbImage = styleOptionsContainer.querySelector('.thumb-image');
        if (thumbColor) thumbColor.style.backgroundColor = bgColor;
        if (thumbImage) thumbImage.style.backgroundImage = `url('${customBgUrl || defaultImage}')`;
    }

    // Emoji Popover
    let activeEmojiPopover = null;
    btnIconSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeEmojiPopover) {
            activeEmojiPopover.remove();
            activeEmojiPopover = null;
            return;
        }

        const emojis = ['⏳', '🎂', '🍭', '✈️', '🎓', '🏆', '🏠', '🗓️', '💼', '🎉', '🌟', '❤️', '🎈', '🔔', '⚽', '🎯'];
        const popover = document.createElement('div');
        popover.className = 'emoji-popover';
        emojis.forEach(emo => {
            const item = document.createElement('div');
            item.className = 'emoji-popover-item';
            item.innerText = emo;
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                selectedIcon = emo;
                selectedIconEl.innerText = emo;
                popover.remove();
                activeEmojiPopover = null;
                updatePreview();
            });
            popover.appendChild(item);
        });

        btnIconSelect.appendChild(popover);
        activeEmojiPopover = popover;
    });

    document.addEventListener('click', () => {
        if (activeEmojiPopover) {
            activeEmojiPopover.remove();
            activeEmojiPopover = null;
        }
    });

    // Style selections
    styleOptionsContainer.addEventListener('click', (e) => {
        const thumb = e.target.closest('.countdown-style-thumb');
        if (!thumb) return;
        
        selectedStyle = thumb.getAttribute('data-style');
        styleOptionsContainer.querySelectorAll('.countdown-style-thumb').forEach(t => t.classList.remove('selected'));
        thumb.classList.add('selected');

        if (selectedStyle === 'image') {
            btnUpload.style.display = 'block';
            colorControls.style.display = 'none';
        } else {
            btnUpload.style.display = 'none';
            colorControls.style.display = 'flex';
        }
        updatePreview();
    });

    // Custom Color Pickers
    btnBgColorPicker.addEventListener('click', () => inputBgColor.click());
    inputBgColor.addEventListener('input', (e) => {
        bgColor = e.target.value;
        updatePreview();
    });

    btnTextColorPicker.addEventListener('click', () => inputTextColor.click());
    inputTextColor.addEventListener('input', (e) => {
        textColor = e.target.value;
        updatePreview();
    });

    // Preset color clicks
    overlay.querySelectorAll('.countdown-color-preset').forEach(preset => {
        preset.addEventListener('click', (e) => {
            const chosen = preset.getAttribute('data-color');
            const targetRow = preset.closest('.countdown-color-row');
            const label = targetRow.querySelector('.countdown-color-label').innerText;
            if (label === 'Фон') {
                bgColor = chosen;
                inputBgColor.value = chosen;
            } else {
                textColor = chosen;
                inputTextColor.value = chosen;
            }
            updatePreview();
        });
    });

    // Image Upload Click using creatorhub upload modal
    btnUpload.addEventListener('click', () => {
        openImageUploadModal((url) => {
            customBgUrl = url || '';
            selectedStyle = 'image';
            
            styleOptionsContainer.querySelectorAll('.countdown-style-thumb').forEach(t => t.classList.remove('selected'));
            const imageThumb = styleOptionsContainer.querySelector('.thumb-image');
            if (imageThumb) imageThumb.classList.add('selected');

            btnUpload.style.display = 'block';
            colorControls.style.display = 'none';
            updatePreview();
        }, customBgUrl);
    });

    inputTitle.addEventListener('input', updatePreview);
    selectDay.addEventListener('change', updatePreview);
    selectMonth.addEventListener('change', updatePreview);
    selectYear.addEventListener('change', updatePreview);

    const closeModal = () => {
        overlay.remove();
    };
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    btnSave.addEventListener('click', async () => {
        const title = inputTitle.value.trim();
        if (!title) {
            showCustomConfirm('Внимание', 'Пожалуйста, введите название события.', 'OK', () => {});
            return;
        }

        const d = String(selectDay.value).padStart(2, '0');
        const m = String(selectMonth.value).padStart(2, '0');
        const y = selectYear.value;
        const targetDateStr = `${y}-${m}-${d}`;

        const data = {
            title,
            targetDate: targetDateStr,
            icon: selectedIcon,
            style: selectedStyle,
            bgUrl: selectedStyle === 'image' ? (customBgUrl || defaultImage) : '',
            bgColor: selectedStyle === 'color' ? bgColor : '',
            textColor: selectedStyle === 'color' ? textColor : ''
        };

        try {
            if (isEdit) {
                await updateDoc(doc(db, 'users', currentUid, 'countdowns', countdown.id), data);
            } else {
                await addDoc(collection(db, 'users', currentUid, 'countdowns'), {
                    ...data,
                    createdAt: serverTimestamp()
                });
            }
            closeModal();
        } catch (err) {
            console.error("Ошибка при сохранении обратного отсчета:", err);
            showCustomConfirm('Ошибка', 'Не удалось сохранить. Попробуйте еще раз.', 'OK', () => {});
        }
    });

    updatePreview();
}

function initCountdownEvents() {
    const btnCountdownAdd = document.getElementById('btnCountdownAdd');
    if (btnCountdownAdd) {
        btnCountdownAdd.addEventListener('click', () => {
            openCountdownModal();
        });
    }
}

// Initialize countdown events
initCountdownEvents();
window.renderCountdowns = renderCountdowns;
window.openCountdownModal = openCountdownModal;

function openImageUploadModal(onUploadSuccess, currentIconUrl = '') {
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';

    overlay.innerHTML = `
        <div class="confirm-box thumbnail-confirm-box" style="padding: 24px;">
            <div class="confirm-title" style="font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Обложка
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload" style="opacity: 0.6; color: var(--text-secondary);"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
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
                
                <input type="text" id="modal-url-input" class="countdown-input" placeholder="https://site.com/image.png" autocomplete="off" style="width: 100%; margin-bottom: 16px; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-hover);">
            </div>

            <!-- Скрытый инпут для выбора файла -->
            <input type="file" id="modalIconFileInput" accept="image/*" style="display: none;">

            <!-- Общие действия -->
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: auto; flex-shrink: 0;">
                <button class="confirm-btn-primary" id="btn-select-file" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Выбрать файл...</button>
                <button class="confirm-btn-primary" id="btn-load-link" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%; display: none;">Сохранить</button>
                
                ${currentIconUrl ? 
                    `<button class="confirm-btn-delete" id="btn-delete-icon" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Удалить обложку</button>` : 
                    ''
                }
                
                <button class="confirm-btn-secondary" id="btn-close-icon-modal" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Отмена</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const dropzone = overlay.querySelector('#icon-dropzone');
    const fileInput = overlay.querySelector('#modalIconFileInput');
    const selectFileBtn = overlay.querySelector('#btn-select-file');
    const deleteIconBtn = overlay.querySelector('#btn-delete-icon');
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
                    showCustomConfirm('Ошибка', 'Не удалось сохранить изображение.', 'OK', () => {});
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
                        showCustomConfirm('Ошибка', 'Не удалось сохранить изображение.', 'OK', () => {});
                        setLoadingState(false);
                    }
                };
                directImg.onerror = () => {
                    showCustomConfirm('Ошибка', 'Не удалось загрузить изображение по указанной ссылке.', 'OK', () => {});
                    setLoadingState(false);
                };
                directImg.src = urlVal;
            };

            img.src = proxyUrl;
        } catch (err) {
            console.error(err);
            showCustomConfirm('Ошибка', 'Ошибка загрузки.', 'OK', () => {});
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
            if (deleteIconBtn) deleteIconBtn.style.display = 'none';
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
            if (deleteIconBtn) deleteIconBtn.style.display = 'block';
            dropzone.style.pointerEvents = 'auto';
            
            dropzone.querySelector('.dropzone-preview').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload" style="opacity: 0.6; color: var(--text-secondary);"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>`;
            dropzone.querySelector('.dropzone-text').innerText = 'Кликните для выбора файла или перетащите его сюда';
        }
    }

    function cleanup() {
        overlay.remove();
        document.removeEventListener('paste', handlePaste);
    }

    if (deleteIconBtn) {
        deleteIconBtn.addEventListener('click', () => {
            onUploadSuccess('');
            cleanup();
        });
    }

    closeBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup();
    });

    async function processAndUpload(file) {
        setLoadingState(true);
        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const img = new Image();
                img.onload = function() {
                    let width = img.width;
                    let height = img.height;
                    const maxSide = 600;

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
                                onUploadSuccess(data.data.url);
                                cleanup();
                            } else {
                                throw new Error('Upload failed');
                            }
                        } catch (err) {
                            console.error('Error uploading image:', err);
                            showCustomConfirm('Ошибка', 'Не удалось загрузить изображение.', 'OK', () => {});
                            setLoadingState(false);
                        }
                    }, 'image/jpeg', 0.85);
                };
                img.src = evt.target.result;
            } catch (err) {
                console.error(err);
                showCustomConfirm('Ошибка', 'Не удалось загрузить изображение.', 'OK', () => {});
                setLoadingState(false);
            }
        };
        reader.readAsDataURL(file);
    }
}

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

const syncingCountdowns = new Set();

async function handleCountdownSync(cd) {
    if (!currentUid) return;

    if (syncingCountdowns.has(cd.id)) return;

    const lockKey = `gcal_sync_lock_cd_${cd.id}`;
    const activeLock = localStorage.getItem(lockKey);
    if (activeLock && Date.now() - parseInt(activeLock) < 15000) {
        return;
    }

    const token = localStorage.getItem('google_calendar_access_token');
    if (!token) return;

    // Сначала проверяем общую синхронизацию ("all"), затем точечную
    const mappedCalendarId = gcalMappings['all'] || gcalMappings['countdown'];
    if (!mappedCalendarId) return;

    // Маппинг полей countdown в формат задачи для GCalendarService
    const taskObj = {
        title: `${cd.icon || '⏳'} ${cd.title}`,
        description: 'Обратный отсчет',
        dueDate: cd.targetDate,
        dueTime: null,
        gcal_event_id: cd.gcal_event_id || null,
        gcal_calendar_id: cd.gcal_calendar_id || null
    };

    const currentHash = `${taskObj.title}|${taskObj.dueDate}|${cd.style || ''}|${cd.bgColor || ''}`;

    const shouldHaveEvent = cd.targetDate && mappedCalendarId;

    if (shouldHaveEvent) {
        if (cd.gcal_event_id && cd.gcal_calendar_id === mappedCalendarId && cd.gcal_last_sync_hash === currentHash) {
            return;
        }

        syncingCountdowns.add(cd.id);
        localStorage.setItem(lockKey, Date.now().toString());

        try {
            if (cd.gcal_event_id && cd.gcal_calendar_id && cd.gcal_calendar_id !== mappedCalendarId) {
                try {
                    await window.GCalendarService.deleteTaskFromGoogle(cd.gcal_event_id, cd.gcal_calendar_id);
                } catch (e) {
                    console.error("Ошибка удаления старого события обратного отсчета:", e);
                }
                cd.gcal_event_id = null;
            }

            const eventId = await window.GCalendarService.syncTaskToGoogle(taskObj, mappedCalendarId);
            if (eventId) {
                await updateDoc(doc(db, 'users', currentUid, 'countdowns', cd.id), {
                    gcal_event_id: eventId,
                    gcal_calendar_id: mappedCalendarId,
                    gcal_last_sync_hash: currentHash
                });
            }
        } catch (err) {
            console.error("Ошибка при синхронизации обратного отсчета с Google:", err);
        } finally {
            syncingCountdowns.delete(cd.id);
            localStorage.removeItem(lockKey);
        }
    } else {
        if (cd.gcal_event_id && cd.gcal_calendar_id) {
            syncingCountdowns.add(cd.id);
            localStorage.setItem(lockKey, Date.now().toString());
            try {
                await window.GCalendarService.deleteTaskFromGoogle(cd.gcal_event_id, cd.gcal_calendar_id);
                await updateDoc(doc(db, 'users', currentUid, 'countdowns', cd.id), {
                    gcal_event_id: null,
                    gcal_calendar_id: null,
                    gcal_last_sync_hash: null
                });
            } catch (err) {
                console.error("Ошибка при удалении события обратного отсчета из Google:", err);
            } finally {
                syncingCountdowns.delete(cd.id);
                localStorage.removeItem(lockKey);
            }
        }
    }
}

async function handleCountdownDelete(cd) {
    if (cd.gcal_event_id && cd.gcal_calendar_id) {
        try {
            await window.GCalendarService.deleteTaskFromGoogle(cd.gcal_event_id, cd.gcal_calendar_id);
        } catch (err) {
            console.error("Ошибка при удалении события при удалении обратного отсчета:", err);
        }
    }
}

function renderCountdownEventsBanner() {
    const banner = document.getElementById('countdownEventsBanner');
    const listEl = document.getElementById('countdownBannerEventsList');
    if (!banner || !listEl) return;

    if (currentRoute !== 'today' && currentRoute !== 'tomorrow') {
        banner.style.display = 'none';
        return;
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const targetDateStr = currentRoute === 'today' ? todayStr : tomorrowStr;
    const matchedCDs = countdownsList.filter(cd => cd.targetDate === targetDateStr);

    if (matchedCDs.length === 0) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'block';
    listEl.innerHTML = '';

    matchedCDs.forEach(cd => {
        const row = document.createElement('div');
        row.className = 'gcal-event-row';
        row.style.cursor = 'pointer';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.padding = '4px 0';

        let barColor = '#4c6ef5';
        if (cd.style === 'color' && cd.bgColor) {
            barColor = cd.bgColor;
        } else if (cd.style === 'image') {
            barColor = '#ff5f56';
        }

        row.innerHTML = `
            <div class="gcal-event-bar" style="background-color: ${barColor}; height: 12px; width: 3px;"></div>
            <span class="gcal-event-time" style="color: ${cd.textColor || 'var(--text-secondary)'}; margin-right: 4px; display: inline-flex; align-items: center; justify-content: center;">${cd.icon || '⏳'}</span>
            <span class="gcal-event-title" style="font-weight: 500;">${cd.title} (Обратный отсчет)</span>
        `;

        row.addEventListener('click', () => {
            window.location.hash = '#countdown';
        });

        listEl.appendChild(row);
    });
}

window.renderCountdownEventsBanner = renderCountdownEventsBanner;


