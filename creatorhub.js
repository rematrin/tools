// creatorhub.js
import {
    getFirestore,
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Изначальные данные видео
const initialVideos = [];

let videos = [...initialVideos];
let selectedVideo = null;
let currentFilter = "all";
let searchQuery = "";
let currentMenuRoute = "videos"; // "videos" | "trash"
let isDeletePermanentMode = false;
let currentViewMode = localStorage.getItem("creatorhub_view_mode") || "list";

// DOM Элементы
const videosListContainer = document.getElementById("videosListContainer");
const videoSearch = document.getElementById("videoSearch");
const filterButtons = document.querySelectorAll(".tab-btn");

// DOM Элементы детального вида
const detailSidebar = document.getElementById("detailSidebar");
const detailImage = document.getElementById("detailImage");
const detailTitle = document.getElementById("detailTitle");
const detailStatusDot = document.getElementById("detailStatusDot");
const detailStatusSelect = document.getElementById("detailStatusSelect");

const detailTabButtons = document.querySelectorAll(".detail-tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

// Элементы вкладок
const infoDescription = document.getElementById("infoDescription");
const infoDescriptionViewer = document.getElementById("infoDescriptionViewer");
const infoTags = document.getElementById("infoTags");
const infoDate = document.getElementById("infoDate");
const infoCreatedDate = document.getElementById("infoCreatedDate");
const referencesContent = document.getElementById("referencesContent");
const settingNotionLink = document.getElementById("settingNotionLink");
const btnOpenNotion = document.getElementById("btnOpenNotion");

// Элементы календаря в настройках
const btnDueDate = document.getElementById("btnDueDate");
const dueDateDropdown = document.getElementById("dueDateDropdown");
const calendarMonthYear = document.getElementById("calendarMonthYear");
const calendarDaysGrid = document.getElementById("calendarDaysGrid");
const calPrevMonth = document.getElementById("calPrevMonth");
const calCurrentMonth = document.getElementById("calCurrentMonth");
const calNextMonth = document.getElementById("calNextMonth");
const dueDateBtnText = document.getElementById("dueDateBtnText");
const btnSortList = document.getElementById("btnSortList");
const sortDropdown = document.getElementById("sortDropdown");

let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let selectedDueDate = ""; // В формате YYYY-MM-DD
let calendarViewDate = new Date();
const cvMonthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];
let currentSort = "manual";
let statsPeriodDays = localStorage.getItem("creatorhub_stats_period") || "28";
if (statsPeriodDays !== "all" && statsPeriodDays !== "ytd") {
    statsPeriodDays = parseInt(statsPeriodDays, 10);
}

function getSortKey() {
    return `creatorhub_sort_${currentFilter}`;
}

function loadSortForCurrentFilter() {
    currentSort = localStorage.getItem(getSortKey()) || "manual";
    
    // Update active state on sort button
    if (btnSortList) {
        if (currentSort !== "manual") {
            btnSortList.classList.add("active");
        } else {
            btnSortList.classList.remove("active");
        }
    }
    
    // Update selected checkmarks in dropdown
    if (sortDropdown) {
        const items = sortDropdown.querySelectorAll(".sort-dropdown-item");
        items.forEach(item => {
            if (item.dataset.sort === currentSort) {
                item.classList.add("selected");
            } else {
                item.classList.remove("selected");
            }
        });
    }
}

function saveSortForCurrentFilter(sortVal) {
    localStorage.setItem(getSortKey(), sortVal);
}

// Инициализация
document.addEventListener("DOMContentLoaded", () => {
    if (typeof loadTagConfigs === "function") {
        loadTagConfigs();
    }
    if (typeof initVideoDetailMobileBottomSheet === "function") {
        initVideoDetailMobileBottomSheet();
    }

    // Восстанавливаем десктопное отображение при масштабировании экрана
    window.addEventListener("resize", () => {
        const overlay = document.getElementById("detailSidebarOverlay");
        if (window.innerWidth > 900) {
            if (overlay) overlay.style.display = "none";
            if (detailSidebar) {
                detailSidebar.classList.remove("active", "expanded", "collapsed");
                detailSidebar.style.transform = "";
                
                // Отображаем сайдбар только если выбран соответствующий маршрут
                if (currentMenuRoute === "videos" || currentMenuRoute === "trash") {
                    detailSidebar.style.display = "flex";
                    if (detailSidebarResizer) detailSidebarResizer.style.display = "block";
                } else {
                    detailSidebar.style.display = "none";
                    if (detailSidebarResizer) detailSidebarResizer.style.display = "none";
                }
            }
            
            const sidebarOverlay = document.getElementById("sidebarOverlay");
            const sidebar = document.querySelector(".sidebar");
            if (sidebarOverlay) sidebarOverlay.classList.remove("active");
            if (sidebar) {
                sidebar.classList.remove("active");
                sidebar.style.display = "flex";
            }
        } else {
            if (detailSidebarResizer) detailSidebarResizer.style.display = "none";
            if (detailSidebar && !detailSidebar.classList.contains("active")) {
                detailSidebar.style.display = "none";
            }
        }
    });
    // Сортировка списка
    if (btnSortList) {
        btnSortList.addEventListener("click", (e) => {
            e.stopPropagation();
            if (sortDropdown.style.display === "none" || !sortDropdown.style.display) {
                sortDropdown.style.display = "flex";
            } else {
                sortDropdown.style.display = "none";
            }
        });
    }

    // Переключение режимов отображения (список/сетка)
    const btnListView = document.getElementById("btnListView");
    const btnGridView = document.getElementById("btnGridView");
    if (btnListView) {
        btnListView.addEventListener("click", () => {
            setViewMode("list");
        });
    }
    if (btnGridView) {
        btnGridView.addEventListener("click", () => {
            setViewMode("grid");
        });
    }

    // Закрытие дропдауна сортировки при клике вне его
    document.addEventListener("click", (e) => {
        if (sortDropdown && !btnSortList.contains(e.target) && !sortDropdown.contains(e.target)) {
            sortDropdown.style.display = "none";
        }
    });

    // Выбор периода статистики
    const btnPeriodSelect = document.getElementById("btnPeriodSelect");
    const periodDropdown = document.getElementById("periodDropdown");
    const periodSelectText = document.getElementById("periodSelectText");
    const periodOptYtd = document.getElementById("periodOptYtd");

    if (periodOptYtd) {
        periodOptYtd.textContent = `С 1 янв. ${new Date().getFullYear()}`;
    }

    if (btnPeriodSelect) {
        btnPeriodSelect.addEventListener("click", (e) => {
            e.stopPropagation();
            if (periodDropdown.style.display === "none" || !periodDropdown.style.display) {
                periodDropdown.style.display = "flex";
            } else {
                periodDropdown.style.display = "none";
            }
        });
    }

    document.addEventListener("click", (e) => {
        if (periodDropdown && !btnPeriodSelect.contains(e.target) && !periodDropdown.contains(e.target)) {
            periodDropdown.style.display = "none";
        }
    });

    if (periodDropdown) {
        const items = periodDropdown.querySelectorAll(".period-dropdown-item");
        items.forEach(item => {
            const daysVal = item.dataset.days === "all" ? "all" : (item.dataset.days === "ytd" ? "ytd" : parseInt(item.dataset.days, 10));
            if (daysVal === statsPeriodDays) {
                item.classList.add("selected");
                if (periodSelectText) {
                    periodSelectText.textContent = item.textContent;
                }
            } else {
                item.classList.remove("selected");
            }

            item.addEventListener("click", (e) => {
                e.stopPropagation();
                statsPeriodDays = daysVal;
                localStorage.setItem("creatorhub_stats_period", statsPeriodDays);

                items.forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");

                if (periodSelectText) {
                    periodSelectText.textContent = item.textContent;
                }
                periodDropdown.style.display = "none";
                updateStatsCounters();
            });
        });
    }

    loadSortForCurrentFilter();

    if (sortDropdown) {
        const items = sortDropdown.querySelectorAll(".sort-dropdown-item");
        items.forEach(item => {
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                currentSort = item.dataset.sort;
                saveSortForCurrentFilter(currentSort);
                
                items.forEach(i => i.classList.remove("selected"));
                item.classList.add("selected");
                
                if (currentSort !== "manual") {
                    btnSortList.classList.add("active");
                } else {
                    btnSortList.classList.remove("active");
                }
                
                sortDropdown.style.display = "none";
                renderVideosList();
            });
        });
    }
    // Случайное приветствие
    const subtitles = [
        "Давай сделаем сегодня что-то крутое.",
        "Вот что происходит с твоим контентом сегодня."
    ];
    const welcomeSubtitle = document.getElementById("welcomeSubtitle");
    if (welcomeSubtitle) {
        welcomeSubtitle.textContent = subtitles[Math.floor(Math.random() * subtitles.length)];
    }

    renderVideosList();
    
    // Выбираем первое видео по умолчанию (отключено по запросу пользователя)

    // Слушатель добавления видео
    const btnAddVideo = document.querySelector(".btn-add-video");
    if (btnAddVideo) {
        btnAddVideo.addEventListener("click", (e) => {
            e.stopPropagation();
            addVideo();
        });
    }

    // Слушатели поиска и фильтров
    videoSearch.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderVideosList();
    });

    filterButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const filterVal = btn.dataset.filter;
            if (currentFilter === filterVal) {
                btn.classList.remove("active");
                currentFilter = "all";
            } else {
                filterButtons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                currentFilter = filterVal;
            }
            loadSortForCurrentFilter();
            renderVideosList();
        });
    });

    // Слушатели переключения детальных вкладок
    detailTabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            detailTabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const activeTab = btn.dataset.tab;
            tabPanes.forEach(pane => {
                pane.classList.remove("active");
                if (pane.id === `pane-${activeTab}`) {
                    pane.classList.add("active");
                }
            });
        });
    });

    // Слушатель выбора статуса справа
    if (detailStatusSelect) {
        detailStatusSelect.addEventListener("change", async (e) => {
            if (!selectedVideo) return;
            const newStatus = e.target.value;
            let statusText = "Идея";
            if (newStatus === "in_progress") statusText = "Черновик";
            else if (newStatus === "editing") statusText = "В процессе";
            else if (newStatus === "published") statusText = "Опубликовано";
            
            selectedVideo.status = newStatus;
            selectedVideo.statusText = statusText;
            
            // Обновляем цвет точки статуса и класс селекта
            detailStatusDot.className = `status-dot ${newStatus}`;
            if (detailStatusSelect) {
                detailStatusSelect.className = `status-select ${newStatus}`;
            }

            if (currentUid) {
                try {
                    await updateDoc(doc(db, "users", currentUid, "videos", selectedVideo.id), {
                        status: newStatus,
                        statusText: statusText
                    });
                } catch (err) {
                    console.error("Ошибка при обновлении статуса в Firestore:", err);
                }
            } else {
                localStorage.setItem("local_videos", JSON.stringify(videos));
                renderVideosList();
            }
        });
    }

    // Показ/скрытие календаря публикации в настройках
    if (btnDueDate) {
        btnDueDate.addEventListener("click", (e) => {
            e.stopPropagation();
            if (dueDateDropdown.style.display === "none") {
                dueDateDropdown.style.display = "block";
                
                // Умное позиционирование календаря (сверху/снизу в зависимости от свободного места)
                const rect = btnDueDate.getBoundingClientRect();
                const dropdownHeight = 310;
                const spaceBelow = window.innerHeight - rect.bottom;
                
                if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
                    dueDateDropdown.style.top = "auto";
                    dueDateDropdown.style.bottom = "calc(100% + 6px)";
                } else {
                    dueDateDropdown.style.top = "calc(100% + 6px)";
                    dueDateDropdown.style.bottom = "auto";
                }
                
                renderCalendarGrid();
            } else {
                dueDateDropdown.style.display = "none";
            }
        });
    }

    // Скрытие календаря при клике в любое другое место
    document.addEventListener("click", (e) => {
        if (dueDateDropdown && !btnDueDate.contains(e.target) && !dueDateDropdown.contains(e.target)) {
            dueDateDropdown.style.display = "none";
        }
    });

    // Навигация по месяцам календаря
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

    // Сохранение описания при изменении и логика переключения Viewer/Textarea
    if (infoDescriptionViewer && infoDescription) {
        infoDescriptionViewer.addEventListener("click", (e) => {
            if (e.target.tagName === "A") {
                return; // Разрешаем переход по ссылке
            }
            infoDescriptionViewer.style.display = "none";
            infoDescription.style.display = "block";
            infoDescription.focus();
        });

        infoDescription.addEventListener("blur", async () => {
            infoDescription.style.display = "none";
            infoDescriptionViewer.style.display = "block";
            
            const newDesc = infoDescription.value;
            if (!selectedVideo) return;
            selectedVideo.description = newDesc;
            updateDescriptionViewer(newDesc);
            
            if (currentUid) {
                try {
                    await updateDoc(doc(db, "users", currentUid, "videos", selectedVideo.id), {
                        description: newDesc
                    });
                } catch (err) {
                    console.error("Ошибка при сохранении описания в Firestore:", err);
                }
            } else {
                localStorage.setItem("local_videos", JSON.stringify(videos));
            }
        });
    }

    // Просмотр обложки в полный размер (лайтбокс) при клике
    if (detailImage) {
        detailImage.addEventListener("click", () => {
            if (selectedVideo && selectedVideo.thumbnail) {
                openImageLightbox(selectedVideo.thumbnail);
            }
        });
    }

    // Сохранение референсов при изменении
    if (referencesContent) {
        referencesContent.addEventListener("input", () => {
            if (!selectedVideo) return;
            selectedVideo.references = referencesContent.innerHTML;
            saveVideoData("references", selectedVideo.references);
        });

        // Просмотр картинок в полный размер (лайтбокс) при клике, а также переход по ссылкам
        referencesContent.addEventListener("click", (e) => {
            if (e.target.tagName === "IMG") {
                openImageLightbox(e.target.src);
            } else if (e.target.tagName === "A") {
                e.preventDefault();
                window.open(e.target.href, "_blank");
            }
        });

        // Обработка вставки из буфера обмена (картинки + ссылки)
        referencesContent.addEventListener("paste", async (e) => {
            e.preventDefault();
            const clipboardData = e.clipboardData || window.clipboardData;

            // 1. Проверяем файлы (изображения)
            if (clipboardData.files && clipboardData.files.length > 0) {
                for (let i = 0; i < clipboardData.files.length; i++) {
                    const file = clipboardData.files[i];
                    if (file.type.startsWith("image/")) {
                        // Показываем индикатор загрузки
                        const loadingImgId = "loading_" + Date.now();
                        const placeholderImg = `<img id="${loadingImgId}" src="https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3h0Y3J1bW05ZWp2MnJrMGgydTh1czZrcTVqN2g3Y3pxbmZkZGs1byZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3oEjI6SIIHBdRxXI40/giphy.gif" style="width: 50px; height: 50px; display: block;" alt="Загрузка...">`;
                        document.execCommand("insertHTML", false, placeholderImg);

                        const reader = new FileReader();
                        reader.onload = async (evt) => {
                            try {
                                const uploadedUrl = await uploadToImgBB(evt.target.result);
                                const loadingEl = document.getElementById(loadingImgId);
                                if (loadingEl) {
                                    loadingEl.src = uploadedUrl;
                                    loadingEl.removeAttribute("id");
                                    loadingEl.style.width = "";
                                    loadingEl.style.height = "";
                                }
                                selectedVideo.references = referencesContent.innerHTML;
                                saveVideoData("references", selectedVideo.references);
                            } catch (err) {
                                console.error("Ошибка загрузки картинки референса:", err);
                                const loadingEl = document.getElementById(loadingImgId);
                                if (loadingEl) loadingEl.remove();
                                alert("Не удалось загрузить изображение референса.");
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                }
                return;
            }

            // 2. Обрабатываем текст и автолинкуем
            const text = clipboardData.getData("text/plain");
            if (text) {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                let htmlText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                
                if (urlRegex.test(text)) {
                    htmlText = htmlText.replace(urlRegex, (url) => {
                        return `<a href="${url}" target="_blank">${url}</a>`;
                    });
                }
                
                document.execCommand("insertHTML", false, htmlText);
                selectedVideo.references = referencesContent.innerHTML;
                saveVideoData("references", selectedVideo.references);
            }
        });
    }

    // Сохранение ссылки Notion в настройках
    if (settingNotionLink) {
        settingNotionLink.addEventListener("input", (e) => {
            if (!selectedVideo) return;
            const newLink = e.target.value;
            selectedVideo.notionLink = newLink;
            saveVideoData("notionLink", newLink);
            updateNotionButtonState();
        });
    }

    // Логика изменения обложки видео (вызов модального окна)
    const btnChangeThumbnail = document.getElementById("btnChangeThumbnail");
    if (btnChangeThumbnail) {
        btnChangeThumbnail.addEventListener("click", (e) => {
            e.stopPropagation();
            openThumbnailModal();
        });
    }

    // Слушатели бокового меню навигации
    // Функция обработки маршрутизации по хэшу URL
    function handleRoute() {
        const hash = window.location.hash.replace('#', '') || 'home';
        const sidebarMenuItems = document.querySelectorAll(".sidebar-menu .menu-item");
        sidebarMenuItems.forEach(mi => mi.classList.remove("active"));
        
        const mobileNavItems = document.querySelectorAll(".mobile-bottom-nav .mobile-nav-item");
        mobileNavItems.forEach(mi => mi.classList.remove("active"));

        if (hash === 'trash') {
            currentMenuRoute = "trash";
            const item = document.getElementById("menuTrash");
            if (item) item.classList.add("active");
            
            const mobMore = document.getElementById("mobileNavMore");
            if (mobMore) mobMore.classList.add("active");
        } else if (hash === 'calendar') {
            currentMenuRoute = "calendar";
            const item = document.getElementById("menuCalendar");
            if (item) item.classList.add("active");
            
            const mobCal = document.getElementById("mobileNavCalendar");
            if (mobCal) mobCal.classList.add("active");
        } else if (hash === 'tasks') {
            currentMenuRoute = "tasks";
            const item = document.getElementById("menuTasks");
            if (item) item.classList.add("active");
            
            const mobTasks = document.getElementById("mobileNavTasks");
            if (mobTasks) mobTasks.classList.add("active");
        } else {
            currentMenuRoute = "videos";
            const item = document.getElementById("menuHome");
            if (item) item.classList.add("active");
            
            const mobHome = document.getElementById("mobileNavHome");
            if (mobHome) mobHome.classList.add("active");
        }
        updateViewForRoute();
    }

    // Слушатели бокового меню навигации
    const sidebarMenuItems = document.querySelectorAll(".sidebar-menu .menu-item");
    const sidebar = document.querySelector(".sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    sidebarMenuItems.forEach(item => {
        if (item.id === "menuSettings") return; // Настройки обрабатываются отдельно как модалка
        item.addEventListener("click", (e) => {
            e.preventDefault();
            if (sidebar) sidebar.classList.remove("active");
            if (sidebarOverlay) sidebarOverlay.classList.remove("active");

            if (item.id === "menuTrash") {
                window.location.hash = "trash";
            } else if (item.id === "menuCalendar") {
                window.location.hash = "calendar";
            } else if (item.id === "menuTasks") {
                window.location.hash = "tasks";
            } else {
                window.location.hash = "home";
            }
        });
    });

    // Слушатели мобильной нижней навигации
    const mobHome = document.getElementById("mobileNavHome");
    const mobTasks = document.getElementById("mobileNavTasks");
    const mobCalendar = document.getElementById("mobileNavCalendar");
    const mobMore = document.getElementById("mobileNavMore");

    if (mobHome) {
        mobHome.addEventListener("click", () => {
            window.location.hash = "home";
        });
    }
    if (mobTasks) {
        mobTasks.addEventListener("click", () => {
            window.location.hash = "tasks";
        });
    }
    if (mobCalendar) {
        mobCalendar.addEventListener("click", () => {
            window.location.hash = "calendar";
        });
    }
    if (mobMore) {
        mobMore.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.innerWidth <= 900) {
                if (sidebar && sidebarOverlay) {
                    const isActive = sidebar.classList.contains("active");
                    if (isActive) {
                        sidebar.classList.remove("active");
                        sidebarOverlay.classList.remove("active");
                    } else {
                        sidebar.classList.add("active");
                        sidebarOverlay.classList.add("active");
                    }
                }
            }
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", () => {
            if (sidebar) sidebar.classList.remove("active");
            sidebarOverlay.classList.remove("active");
        });
    }

    window.addEventListener("hashchange", handleRoute);
    handleRoute(); // Вызываем один раз при инициализации

    // Календарь на странице (навигация)
    const btnCalPrev = document.getElementById("btnCalPrev");
    const btnCalToday = document.getElementById("btnCalToday");
    const btnCalNext = document.getElementById("btnCalNext");

    if (btnCalPrev) {
        btnCalPrev.addEventListener("click", () => {
            calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
            renderCalendarView();
        });
    }
    if (btnCalToday) {
        btnCalToday.addEventListener("click", () => {
            calendarViewDate = new Date();
            renderCalendarView();
        });
    }
    if (btnCalNext) {
        btnCalNext.addEventListener("click", () => {
            calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
            renderCalendarView();
        });
    }

    // Слушатель кнопки очистки корзины
    const btnEmptyTrash = document.getElementById("btnEmptyTrash");
    if (btnEmptyTrash) {
        btnEmptyTrash.addEventListener("click", () => {
            const deletedVideos = videos.filter(v => v.deleted);
            if (deletedVideos.length === 0) return;
            
            isDeletePermanentMode = true;
            activeMenuVideoId = "all_trash";
            
            confirmDeleteVideoTitle.textContent = "Корзина";
            const modalDesc = document.querySelector("#confirmDeleteVideoModal .confirm-modal-desc");
            if (modalDesc) {
                modalDesc.innerHTML = `Все видео в корзине будут удалены безвозвратно. Это действие нельзя отменить.`;
            }
            confirmDeleteVideoModal.style.display = "flex";
        });
    }

    // Скрытие дропдауна тегов при клике вне его
    document.addEventListener("click", (e) => {
        const dropdown = document.querySelector(".tag-dropdown");
        const btnAddTag = document.getElementById("btnAddTag");
        if (dropdown && !dropdown.contains(e.target) && (!btnAddTag || !btnAddTag.contains(e.target))) {
            dropdown.style.display = "none";
        }
    });

    // Перемещаем меню действий видео в .main-content для корректного скролла
    const mainContentEl = document.querySelector(".main-content");
    const videoActionsDropdownEl = document.getElementById("videoActionsDropdown");
    if (mainContentEl && videoActionsDropdownEl) {
        mainContentEl.appendChild(videoActionsDropdownEl);
    }

    // Инициализация ресайзера правого сайдбара
    initDetailSidebarResizer();

    // Инициализация тултипов
    if (typeof initTooltips === "function") {
        initTooltips();
    }

    // Инициализация Drag and Drop
    initDragAndDrop();
    initTouchDragAndDrop();
});

// Функция обновления интерфейса в зависимости от текущего маршрута меню
function updateViewForRoute() {
    const statsGrid = document.querySelector(".stats-grid");
    const welcomeHeader = document.querySelector(".welcome-header");
    const trashNoticeBanner = document.getElementById("trashNoticeBanner");
    const sectionTitle = document.querySelector(".videos-section h2");
    const filtersTabs = document.querySelector(".filters-tabs");
    const sortWrapper = document.querySelector(".sort-wrapper");

    const mainContent = document.querySelector(".main-content");
    const calendarViewContainer = document.getElementById("calendarViewContainer");
    const detailSidebarResizer = document.getElementById("detailSidebarResizer");
    const detailSidebar = document.getElementById("detailSidebar");

    const tasksViewContainer = document.getElementById("tasksViewContainer");

    if (currentMenuRoute === "calendar") {
        if (mainContent) mainContent.style.display = "none";
        if (detailSidebarResizer) detailSidebarResizer.style.display = "none";
        if (detailSidebar) detailSidebar.style.display = "none";
        if (tasksViewContainer) tasksViewContainer.style.display = "none";
        if (calendarViewContainer) {
            calendarViewContainer.style.display = "flex";
            renderCalendarView();
        }
        return;
    }

    if (currentMenuRoute === "tasks") {
        if (mainContent) mainContent.style.display = "none";
        if (detailSidebarResizer) detailSidebarResizer.style.display = "none";
        if (detailSidebar) detailSidebar.style.display = "none";
        if (calendarViewContainer) calendarViewContainer.style.display = "none";
        if (tasksViewContainer) {
            tasksViewContainer.style.display = "block";
        }
        return;
    }

    if (calendarViewContainer) calendarViewContainer.style.display = "none";
    if (tasksViewContainer) tasksViewContainer.style.display = "none";
    if (mainContent) mainContent.style.display = "flex";
    if (detailSidebarResizer) {
        detailSidebarResizer.style.display = window.innerWidth <= 900 ? "none" : "block";
    }
    if (detailSidebar) {
        detailSidebar.style.display = window.innerWidth <= 900 ? "none" : "flex";
    }

    if (currentMenuRoute === "trash") {
        if (statsGrid) statsGrid.style.display = "none";
        if (welcomeHeader) welcomeHeader.style.display = "none";
        if (trashNoticeBanner) trashNoticeBanner.style.display = "flex";
        if (filtersTabs) filtersTabs.style.display = "none";
        if (sortWrapper) sortWrapper.style.display = "none";
        if (sectionTitle) {
            sectionTitle.innerHTML = `Корзина`;
        }
    } else {
        if (statsGrid) statsGrid.style.display = "grid";
        if (welcomeHeader) welcomeHeader.style.display = "flex";
        if (trashNoticeBanner) trashNoticeBanner.style.display = "none";
        if (filtersTabs) filtersTabs.style.display = "flex";
        if (sortWrapper) sortWrapper.style.display = "inline-flex";
        if (sectionTitle) {
            sectionTitle.innerHTML = `Мои видео <button class="btn-add-video" title="Добавить видео">+</button>`;
            const btnAddVideo = sectionTitle.querySelector(".btn-add-video");
            if (btnAddVideo) {
                btnAddVideo.addEventListener("click", (e) => {
                    e.stopPropagation();
                    addVideo();
                });
            }
        }
    }
    renderVideosList();
    
    // Выбираем первое подходящее видео по умолчанию
    const filtered = videos.filter(v => {
        const matchesSearch = v.title.toLowerCase().includes(searchQuery);
        if (currentMenuRoute === "trash") {
            return matchesSearch && v.deleted === true;
        } else {
            const matchesFilter = currentFilter === "all" || v.status === currentFilter;
            return matchesSearch && matchesFilter && !v.deleted;
        }
    });
    if (filtered.length > 0) {
        if (selectedVideo && filtered.some(v => v.id === selectedVideo.id)) {
            selectVideoItem(selectedVideo.id);
        } else {
            selectedVideo = null;
            clearDetailSidebar();
        }
    } else {
        selectedVideo = null;
        clearDetailSidebar();
    }
}

// Функция обновления счетчиков статистики
function updateStatsCounters() {
    const activeVideos = videos.filter(v => !v.deleted);
    const countIdeas = activeVideos.filter(v => v.status === "idea").length;
    const countInProgress = activeVideos.filter(v => v.status === "in_progress").length;
    const countEditing = activeVideos.filter(v => v.status === "editing").length;
    const countPublished = activeVideos.filter(v => {
        if (!v.publishDate) return false;
        const targetTimestamp = new Date(v.publishDate).getTime();
        if (isNaN(targetTimestamp)) return false;
        const now = Date.now();
        if (statsPeriodDays === "all") {
            return targetTimestamp <= now;
        } else if (statsPeriodDays === "ytd") {
            const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
            return targetTimestamp >= startOfYear && targetTimestamp <= now;
        } else {
            const periodMs = statsPeriodDays * 24 * 60 * 60 * 1000;
            return (now - targetTimestamp <= periodMs) && targetTimestamp <= now;
        }
    }).length;

    // Динамический подсчет изменений на основе периода
    const now = Date.now();
    const calculateChange = (status) => {
        let count = 0;
        activeVideos.forEach(v => {
            if (v.status !== status) return;
            let targetTimestamp = null;
            if (status === "published") {
                if (v.publishDate) {
                    targetTimestamp = new Date(v.publishDate).getTime();
                } else {
                    targetTimestamp = null;
                }
            } else {
                if (v.createdTime) {
                    targetTimestamp = v.createdTime;
                } else if (v.createdAt) {
                    if (v.createdAt.toDate && typeof v.createdAt.toDate === "function") {
                        targetTimestamp = v.createdAt.toDate().getTime();
                    } else {
                        targetTimestamp = new Date(v.createdAt).getTime();
                    }
                }
            }
            if (targetTimestamp) {
                if (statsPeriodDays === "all") {
                    if (targetTimestamp <= now) {
                        count++;
                    }
                } else if (statsPeriodDays === "ytd") {
                    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
                    if (targetTimestamp >= startOfYear && targetTimestamp <= now) {
                        count++;
                    }
                } else {
                    const periodMs = statsPeriodDays * 24 * 60 * 60 * 1000;
                    if (now - targetTimestamp <= periodMs && targetTimestamp <= now) {
                        count++;
                    }
                }
            }
        });
        return count;
    };

    const ideasChange = calculateChange("idea");
    const inProgressChange = calculateChange("in_progress");
    const editingChange = calculateChange("editing");
    const publishedChange = calculateChange("published");

    const ideasCard = document.querySelector(".stat-card.ideas .number");
    const workCard = document.querySelector(".stat-card.work .number");
    const editCard = document.querySelector(".stat-card.edit .number");
    const publishedCard = document.querySelector(".stat-card.published .number");

    if (ideasCard) ideasCard.textContent = `+${ideasChange}`;
    if (workCard) workCard.textContent = `+${inProgressChange}`;
    if (editCard) editCard.textContent = `+${editingChange}`;
    if (publishedCard) publishedCard.textContent = `+${publishedChange}`;

    const formatChangeText = () => {
        if (statsPeriodDays === "all") {
            return "за все время";
        } else if (statsPeriodDays === "ytd") {
            return `с 1 янв. ${new Date().getFullYear()}`;
        } else if (statsPeriodDays === 7) {
            return "за неделю";
        } else {
            return `за последние ${statsPeriodDays} дней`;
        }
    };

    const ideasChangeEl = document.querySelector(".stat-card.ideas .change");
    const workChangeEl = document.querySelector(".stat-card.work .change");
    const editChangeEl = document.querySelector(".stat-card.edit .change");
    const publishedChangeEl = document.querySelector(".stat-card.published .change");

    if (ideasChangeEl) ideasChangeEl.textContent = formatChangeText();
    if (workChangeEl) workChangeEl.textContent = formatChangeText();
    if (editChangeEl) editChangeEl.textContent = formatChangeText();
    if (publishedChangeEl) publishedChangeEl.textContent = formatChangeText();
}

// Функция рендеринга списка
function renderVideosList() {
    videosListContainer.innerHTML = "";
    
    // Сортируем видео по выбранному критерию
    if (currentSort === "manual") {
        videos.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 0;
            const orderB = b.order !== undefined ? b.order : 0;
            if (orderA !== orderB) return orderA - orderB;
            return String(a.id).localeCompare(String(b.id));
        });
    } else if (currentSort === "pubDateNew") {
        videos.sort((a, b) => {
            const pA = a.publishDate || "";
            const pB = b.publishDate || "";
            if (!pA && !pB) return 0;
            if (!pA) return 1;
            if (!pB) return -1;
            return pB.localeCompare(pA);
        });
    } else if (currentSort === "pubDateOld") {
        videos.sort((a, b) => {
            const pA = a.publishDate || "";
            const pB = b.publishDate || "";
            if (!pA && !pB) return 0;
            if (!pA) return 1;
            if (!pB) return -1;
            return pA.localeCompare(pB);
        });
    } else if (currentSort === "createdDateNew") {
        videos.sort((a, b) => {
            const tA = a.createdTime || (a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0);
            const tB = b.createdTime || (b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0);
            return tB - tA;
        });
    } else if (currentSort === "createdDateOld") {
        videos.sort((a, b) => {
            const tA = a.createdTime || (a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0);
            const tB = b.createdTime || (b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0);
            return tA - tB;
        });
    } else if (currentSort === "alphabeticalAZ") {
        videos.sort((a, b) => {
            return (a.title || "").localeCompare(b.title || "");
        });
    } else if (currentSort === "alphabeticalZA") {
        videos.sort((a, b) => {
            return (b.title || "").localeCompare(a.title || "");
        });
    }

    // Обновляем статистические счетчики
    updateStatsCounters();
    updateTabCounts();

    const filtered = videos.filter(v => {
        const matchesSearch = v.title.toLowerCase().includes(searchQuery);
        if (currentMenuRoute === "trash") {
            return matchesSearch && v.deleted === true;
        } else {
            const matchesFilter = currentFilter === "all" || v.status === currentFilter;
            return matchesSearch && matchesFilter && !v.deleted;
        }
    });

    if (filtered.length === 0) {
        videosListContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--ch-text-gray);">Видео не найдены</div>`;
        return;
    }

    filtered.forEach(v => {
        const card = document.createElement("div");
        card.className = `video-card ${selectedVideo && selectedVideo.id === v.id ? 'active' : ''}`;
        card.dataset.id = v.id;

        // Настройка активации draggable при взаимодействии (для десктопа)
        if (!v.deleted && currentSort === "manual") {
            card.addEventListener('mousedown', (e) => {
                if (e.target.closest('button, input, textarea, a, select')) {
                    return;
                }
                card.setAttribute('draggable', 'true');
            });
            card.addEventListener('mouseup', () => {
                card.removeAttribute('draggable');
            });
        }
        
        if (v.deleted) {
            card.innerHTML = `
                <div class="video-card-left">
                    <img src="${v.thumbnail}" alt="Превью" class="video-thumbnail-mini">
                    <div class="video-info-block">
                        <h4 class="video-title">${v.title}</h4>
                        <div class="video-meta-tags">
                            ${v.tags.map(tag => `<span class="meta-tag ${typeof getTagColorClass === 'function' ? getTagColorClass(tag) : ''}">${tag}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="video-card-right" style="gap: 12px; align-items: center; flex-direction: row; display: flex;">
                    <button class="btn-restore" title="Восстановить" style="background: none; border: none; color: var(--ch-purple); cursor: pointer; padding: 6px 12px; font-size: 0.85rem; font-weight: 600; transition: opacity 0.2s;">
                        Восстановить
                    </button>
                    <button class="btn-delete-perm" title="Удалить навсегда" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 6px 12px; font-size: 0.85rem; font-weight: 600; transition: opacity 0.2s;">
                        Удалить навсегда
                    </button>
                </div>
            `;
            
            // Восстановление
            card.querySelector(".btn-restore").addEventListener("click", (e) => {
                e.stopPropagation();
                restoreVideo(v.id);
            });
            
            // Удаление навсегда
            card.querySelector(".btn-delete-perm").addEventListener("click", (e) => {
                e.stopPropagation();
                confirmDeletePermanently(v.id);
            });
        } else {
            card.innerHTML = `
                <div class="video-card-left">
                    <img src="${v.thumbnail}" alt="Превью" class="video-thumbnail-mini">
                    <div class="video-info-block">
                        <h4 class="video-title">${v.title}</h4>
                        <div class="video-meta-tags">
                            ${v.tags.map(tag => `<span class="meta-tag ${typeof getTagColorClass === 'function' ? getTagColorClass(tag) : ''}">${tag}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="video-card-right">
                    <div class="video-status-date-block">
                        ${(() => {
                            let displayStatusText = v.statusText || "Идея";
                            if (v.status === "in_progress") displayStatusText = "Черновик";
                            else if (v.status === "editing") displayStatusText = "В процессе";
                            return `<span class="status-badge ${v.status}">${displayStatusText}</span>`;
                        })()}
                        <span class="video-date">${formatDateToRussian(v.publishDate)}</span>
                    </div>
                    <button class="video-options-btn" title="Опции">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                        </svg>
                    </button>
                </div>
            `;

            // Кнопка опций (три точки)
            const optionsBtn = card.querySelector(".video-options-btn");
            if (optionsBtn) {
                optionsBtn.addEventListener("click", (e) => {
                    showVideoMenu(e, v.id, optionsBtn);
                });
            }
        }

        card.addEventListener("click", (e) => {
            if (e.target.closest(".video-options-btn") || e.target.closest(".btn-restore") || e.target.closest(".btn-delete-perm")) {
                return;
            }
            selectVideoItem(v.id);
        });

        // Двойной клик для переименования (только для недеструктурированных видео)
        if (!v.deleted) {
            card.addEventListener("dblclick", (e) => {
                e.preventDefault();
                e.stopPropagation();
                enableInlineRename(card, v.id, v.title);
            });

            // Правый клик (контекстное меню)
            card.addEventListener("contextmenu", (e) => {
                showVideoMenu(e, v.id);
            });
        }

        videosListContainer.appendChild(card);
    });

    if (typeof setViewMode === "function") {
        setViewMode(currentViewMode);
    }
}

// Вспомогательные функции изменения обложки
async function uploadToImgBB(base64Image) {
    const API_KEY = 'fbd88ce7045582e4c4176c67de93ceee';
    const cleanBase64 = base64Image.split(',')[1];
    const formData = new FormData();
    formData.append('image', cleanBase64);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
        method: 'POST',
        body: formData
    });
    const result = await response.json();
    if (result.success) return result.data.url; else throw new Error('ImgBB Upload Failed');
}

async function updateVideoThumbnail(imageUrl) {
    if (!selectedVideo) return;
    selectedVideo.thumbnail = imageUrl;
    
    const detailImage = document.getElementById("detailImage");
    if (detailImage) detailImage.src = imageUrl;
    
    if (currentUid) {
        try {
            await updateDoc(doc(db, "users", currentUid, "videos", selectedVideo.id), {
                thumbnail: imageUrl
            });
        } catch (err) {
            console.error("Ошибка при обновлении обложки в Firestore:", err);
        }
    } else {
        localStorage.setItem("local_videos", JSON.stringify(videos));
        renderVideosList();
    }
}

// Модальное окно изменения обложки с вкладками (Из файла / По ссылке)
function openThumbnailModal() {
    if (!selectedVideo) return;
    
    const currentIconUrl = selectedVideo.thumbnail;
    const overlay = document.createElement('div');
    overlay.className = 'custom-confirm-overlay';

    overlay.innerHTML = `
        <div class="confirm-box thumbnail-confirm-box" style="padding: 24px;">
            <div class="confirm-title" style="font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Обложка видео
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload" style="opacity: 0.6; color: var(--ch-text-gray);"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
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
                
                <input type="text" id="modal-url-input" class="video-title-input" placeholder="https://site.com/image.png" autocomplete="off" style="width: 100%; margin-bottom: 16px; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid var(--ch-border); background: var(--ch-bg);">
            </div>

            <!-- Скрытый инпут для выбора файла -->
            <input type="file" id="modalIconFileInput" accept="image/*" style="display: none;">

            <!-- Общие действия -->
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: auto; flex-shrink: 0;">
                <button class="confirm-btn-primary" id="btn-select-file" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Выбрать файл...</button>
                <button class="confirm-btn-primary" id="btn-load-link" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%; display: none;">Сохранить</button>
                
                ${currentIconUrl && !currentIconUrl.includes("placehold.co") ? 
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
                    await updateVideoThumbnail(hostedUrl);
                    cleanup();
                } catch (e) {
                    console.error(e);
                    alert("Не удалось сохранить изображение.");
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
                        await updateVideoThumbnail(hostedUrl);
                        cleanup();
                    } catch (e) {
                        console.error(e);
                        alert("Не удалось сохранить изображение.");
                        setLoadingState(false);
                    }
                };
                directImg.onerror = () => {
                    alert("Не удалось загрузить изображение по указанной ссылке.");
                    setLoadingState(false);
                };
                directImg.src = urlVal;
            };

            img.src = proxyUrl;
        } catch (err) {
            console.error(err);
            alert("Ошибка загрузки.");
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
            
            dropzone.querySelector('.dropzone-preview').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload-icon lucide-upload" style="opacity: 0.6; color: var(--ch-text-gray);"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>`;
            dropzone.querySelector('.dropzone-text').innerText = 'Кликните для выбора файла или перетащите его сюда';
        }
    }

    function cleanup() {
        overlay.remove();
        document.removeEventListener('paste', handlePaste);
    }

    // 5. Delete Cover with custom confirmation modal
    if (deleteIconBtn) {
        deleteIconBtn.addEventListener('click', async () => {
            const confirmOverlay = document.createElement('div');
            confirmOverlay.className = 'confirm-modal-overlay';
            confirmOverlay.style.zIndex = '10002';
            
            confirmOverlay.innerHTML = `
                <div class="confirm-modal-card">
                    <h3 class="confirm-modal-title">Удалить обложку?</h3>
                    <p class="confirm-modal-desc">Вы точно хотите удалить обложку? Это вернет стандартное изображение.</p>
                    <div class="confirm-modal-actions">
                        <button class="confirm-btn-cancel" id="btn-cancel-delete-cover">Отмена</button>
                        <button class="confirm-btn-danger" id="btn-confirm-delete-cover">Удалить</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(confirmOverlay);
            confirmOverlay.style.display = 'flex';
            
            confirmOverlay.querySelector('#btn-cancel-delete-cover').onclick = () => {
                confirmOverlay.remove();
            };
            
            confirmOverlay.querySelector('#btn-confirm-delete-cover').onclick = async () => {
                confirmOverlay.remove();
                cleanup();
                const defaultPlaceholder = "https://placehold.co/600x338/e2e8f0/475569?text=New+Video";
                await updateVideoThumbnail(defaultPlaceholder);
            };
            
            confirmOverlay.addEventListener('click', (e) => {
                if (e.target === confirmOverlay) {
                    confirmOverlay.remove();
                }
            });
        });
    }

    // 6. Cancel / Close
    closeBtn.addEventListener('click', cleanup);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            cleanup();
        }
    });

    // Upload & Process
    async function processAndUpload(file) {
        setLoadingState(true);
        const reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                const hostedUrl = await uploadToImgBB(evt.target.result);
                await updateVideoThumbnail(hostedUrl);
                cleanup();
            } catch (err) {
                console.error(err);
                alert("Не удалось загрузить изображение.");
                setLoadingState(false);
            }
        };
        reader.readAsDataURL(file);
    }
}

// Функция выбора видео
function selectVideoItem(id) {
    selectedVideo = videos.find(v => v.id === id);
    
    // Обновляем класс active в списке
    document.querySelectorAll(".video-card").forEach(card => {
        if (card.dataset.id === id) {
            card.classList.add("active");
        } else {
            card.classList.remove("active");
        }
    });

    if (!selectedVideo) return;

    // Заполнение детального вида
    detailImage.src = selectedVideo.thumbnail;
    detailTitle.textContent = selectedVideo.title;
    
    const btnChangeThumbnail = document.getElementById("btnChangeThumbnail");
    if (btnChangeThumbnail) {
        btnChangeThumbnail.style.display = "block";
    }
    
    // Статус
    if (detailStatusSelect) {
        detailStatusSelect.value = selectedVideo.status || "idea";
        detailStatusSelect.className = `status-select ${selectedVideo.status || "idea"}`;
    }
    detailStatusDot.className = `status-dot ${selectedVideo.status || "idea"}`;

    // Вкладка: Информация
    if (infoDescription && document.activeElement !== infoDescription) {
        infoDescription.value = selectedVideo.description || "";
    }
    if (infoDescriptionViewer) {
        updateDescriptionViewer(selectedVideo.description);
        infoDescription.style.display = "none";
        infoDescriptionViewer.style.display = "block";
    }
    
    renderTags();
    
    const pubDateFormatted = formatDateToRussian(selectedVideo.publishDate);
    if (infoDate) {
        infoDate.textContent = pubDateFormatted;
    }
    selectedDueDate = selectedVideo.publishDate || "";
    if (dueDateBtnText) {
        dueDateBtnText.textContent = pubDateFormatted !== "не запланировано" ? pubDateFormatted : "Выбрать дату";
    }

    if (infoCreatedDate) {
        let createdTimestamp = null;
        if (selectedVideo.createdTime) {
            createdTimestamp = selectedVideo.createdTime;
        } else if (selectedVideo.createdAt) {
            if (selectedVideo.createdAt.toDate && typeof selectedVideo.createdAt.toDate === "function") {
                createdTimestamp = selectedVideo.createdAt.toDate().getTime();
            } else {
                createdTimestamp = new Date(selectedVideo.createdAt).getTime();
            }
        }
        infoCreatedDate.textContent = formatCreatedDate(createdTimestamp);
    }

    if (selectedVideo.publishDate) {
        const parts = selectedVideo.publishDate.split('-');
        if (parts.length === 3) {
            calendarYear = parseInt(parts[0], 10);
            calendarMonth = parseInt(parts[1], 10) - 1;
        }
    } else {
        calendarYear = new Date().getFullYear();
        calendarMonth = new Date().getMonth();
    }

    // Вкладка: Референсы
    if (referencesContent && document.activeElement !== referencesContent) {
        referencesContent.innerHTML = selectedVideo.references || "";
    }

    // Вкладка: Настройки
    if (settingNotionLink && document.activeElement !== settingNotionLink) {
        settingNotionLink.value = selectedVideo.notionLink || "";
    }

    // Обновляем состояние кнопки Notion
    updateNotionButtonState();

    // Показываем контент, скрываем заглушку
    const emptyStateEl = document.getElementById("detailSidebarEmptyState");
    const contentWrapperEl = document.getElementById("detailSidebarContentWrapper");
    if (emptyStateEl) emptyStateEl.style.display = "none";
    if (contentWrapperEl) contentWrapperEl.style.display = "block";

    if (window.innerWidth <= 900) {
        openDetailSidebarMobile();
    } else {
        if (detailSidebar) {
            detailSidebar.style.display = "flex";
        }
        if (detailSidebarResizer) {
            detailSidebarResizer.style.display = "block";
        }
    }
}

// Функция рендера файлов удалена так как вкладка файлы заменена на референсы

// Функция рендера чек-листа удалена, так как чек-лист скрыт/удален по запросу пользователя

// === Firebase Auth & Firestore Sync ===
let currentUid = null;
let unsubscribeVideos = null;
let db = null;

window.addEventListener('authChanged', (e) => {
    const user = e.detail.user;
    currentUid = user ? user.uid : null;
    db = window.db || getFirestore();

    if (currentUid) {
        // Подписка на коллекцию видео в Firestore
        const q = query(collection(db, "users", currentUid, "videos"), orderBy("createdAt", "asc"));
        if (unsubscribeVideos) unsubscribeVideos();
        unsubscribeVideos = onSnapshot(q, (snapshot) => {
            videos = [];
            const now = Date.now();
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                
                // Автоматическое удаление навсегда через 30 дней
                if (data.deleted === true && data.deletedAt) {
                    try {
                        let delTime;
                        if (typeof data.deletedAt.toDate === "function") {
                            delTime = data.deletedAt.toDate().getTime();
                        } else {
                            delTime = new Date(data.deletedAt).getTime();
                        }
                        if (now - delTime > THIRTY_DAYS_MS) {
                            deleteDoc(doc(db, "users", currentUid, "videos", docSnap.id));
                            return; // Пропускаем
                        }
                    } catch (e) {
                        console.error("Ошибка автоудаления из корзины:", e);
                    }
                }

                videos.push({
                    id: docSnap.id,
                    ...data
                });
            });
            
            renderVideosList();
            
            // Выбираем первое видео по умолчанию или восстанавливаем выбранное
            const filtered = videos.filter(v => {
                const matchesSearch = v.title.toLowerCase().includes(searchQuery);
                if (currentMenuRoute === "trash") {
                    return matchesSearch && v.deleted === true;
                } else {
                    const matchesFilter = currentFilter === "all" || v.status === currentFilter;
                    return matchesSearch && matchesFilter && !v.deleted;
                }
            });
            if (filtered.length > 0) {
                if (selectedVideo && filtered.some(v => v.id === selectedVideo.id)) {
                    selectVideoItem(selectedVideo.id);
                } else {
                    selectedVideo = null;
                    clearDetailSidebar();
                }
            } else {
                selectedVideo = null;
                clearDetailSidebar();
            }
        });
    } else {
        if (unsubscribeVideos) {
            unsubscribeVideos();
            unsubscribeVideos = null;
        }
        // Загрузка локальных данных с автоудалением
        let localData = JSON.parse(localStorage.getItem("local_videos")) || [];
        const now = Date.now();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        let needsSave = false;

        videos = localData.filter(v => {
            if (v.deleted === true && v.deletedAt) {
                if (now - v.deletedAt > THIRTY_DAYS_MS) {
                    needsSave = true;
                    return false;
                }
            }
            return true;
        });

        if (needsSave) {
            localStorage.setItem("local_videos", JSON.stringify(videos));
        }

        if (videos.length === 0) {
            videos = [...initialVideos];
        }
        
        renderVideosList();
        
        const filtered = videos.filter(v => {
            const matchesSearch = v.title.toLowerCase().includes(searchQuery);
            if (currentMenuRoute === "trash") {
                return matchesSearch && v.deleted === true;
            } else {
                const matchesFilter = currentFilter === "all" || v.status === currentFilter;
                return matchesSearch && matchesFilter && !v.deleted;
            }
        });
        if (filtered.length > 0) {
            if (selectedVideo && filtered.some(v => v.id === selectedVideo.id)) {
                selectVideoItem(selectedVideo.id);
            } else {
                selectedVideo = null;
                clearDetailSidebar();
            }
        } else {
            clearDetailSidebar();
        }
    }
    
    // Welcome Greeting Name
    const welcomeUserName = document.getElementById('welcomeUserName');
    if (welcomeUserName) {
        welcomeUserName.textContent = user ? (user.displayName || "Пользователь") : "Max";
    }

    // Settings Profile Card
    const settingsProfileAvatar = document.getElementById('settingsProfileAvatar');
    const settingsProfileName = document.getElementById('settingsProfileName');
    const settingsEmailText = document.getElementById('settingsEmailText');

    if (settingsProfileName) {
        settingsProfileName.textContent = user ? (user.displayName || "Пользователь") : "Max";
    }
    if (settingsEmailText) {
        settingsEmailText.textContent = user ? user.email : "--";
    }
    if (settingsProfileAvatar) {
        if (user && user.photoURL) {
            settingsProfileAvatar.src = user.photoURL;
        } else {
            const letter = (user && user.displayName) ? user.displayName[0] : "U";
            settingsProfileAvatar.src = `https://via.placeholder.com/64/CCCCCC/FFFFFF?text=${letter}`;
        }
    }
});

// Click on logo to open profile menu (AuthModal)
const sidebarLogo = document.getElementById('sidebarLogo');
if (sidebarLogo) {
    sidebarLogo.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.openAuthModal === 'function') {
            window.openAuthModal(sidebarLogo);
        } else {
            console.warn("Auth widget not loaded yet");
        }
    });
}

// === Settings Modal Logic ===
const settingsModal = document.getElementById('settingsModal');
const menuSettings = document.getElementById('menuSettings');
const btnSettingsClose = document.getElementById('btnSettingsClose');

function openSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'flex';
        switchSettingsTab('account');
    }
}

function closeSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }
}

function switchSettingsTab(tabName) {
    const tabs = document.querySelectorAll('#settingsModal .settings-menu-item');
    const panes = document.querySelectorAll('#settingsModal .settings-tab-pane');
    
    tabs.forEach(tab => {
        if (tab.getAttribute('data-tab') === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    panes.forEach(pane => {
        if (pane.id === `tab-${tabName}`) {
            pane.style.display = 'block';
        } else {
            pane.style.display = 'none';
        }
    });
}

if (menuSettings) {
    menuSettings.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sidebar = document.querySelector(".sidebar");
        const sidebarOverlay = document.getElementById("sidebarOverlay");
        if (sidebar) sidebar.classList.remove("active");
        if (sidebarOverlay) sidebarOverlay.classList.remove("active");
        openSettingsModal();
    });
}

if (btnSettingsClose) {
    btnSettingsClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSettingsModal();
    });
}

if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });

    // Tab buttons click handling
    const tabBtns = settingsModal.querySelectorAll('.settings-menu-item');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tabName = btn.getAttribute('data-tab');
            switchSettingsTab(tabName);
        });
    });
}

// === Очистка сайдбара деталей ===
function clearDetailSidebar() {
    detailImage.src = "https://placehold.co/600x338?text=Select+Video";
    detailTitle.textContent = "Выберите видео из списка";
    const btnChangeThumbnail = document.getElementById("btnChangeThumbnail");
    if (btnChangeThumbnail) {
        btnChangeThumbnail.style.display = "none";
    }
    if (detailStatusSelect) {
        detailStatusSelect.value = "idea";
    }
    detailStatusDot.className = "status-dot";
    infoDescription.value = "";
    if (infoDescriptionViewer) {
        infoDescriptionViewer.innerHTML = "";
    }
    infoTags.innerHTML = "";
    if (infoDate) {
        infoDate.textContent = "не запланировано";
    }
    if (infoCreatedDate) {
        infoCreatedDate.textContent = "--";
    }
    selectedDueDate = "";
    if (dueDateBtnText) {
        dueDateBtnText.textContent = "Выбрать дату";
    }
    if (referencesContent) referencesContent.innerHTML = "";
    if (settingNotionLink) settingNotionLink.value = "";
    if (btnOpenNotion) {
        btnOpenNotion.classList.add("disabled");
        btnOpenNotion.href = "#";
    }

    // Снимаем выделение со всех карточек видео
    document.querySelectorAll(".video-card").forEach(card => {
        card.classList.remove("active");
    });

    // Переключаем видимость заглушки / контента
    const emptyStateEl = document.getElementById("detailSidebarEmptyState");
    const contentWrapperEl = document.getElementById("detailSidebarContentWrapper");
    if (window.innerWidth > 900) {
        if (emptyStateEl) emptyStateEl.style.display = "flex";
        if (contentWrapperEl) contentWrapperEl.style.display = "none";
    } else {
        if (emptyStateEl) emptyStateEl.style.display = "none";
        if (contentWrapperEl) contentWrapperEl.style.display = "block";
    }
}

// === Создание нового видео ===
async function addVideo() {
    const maxOrder = videos.length > 0 ? Math.max(...videos.map(v => v.order || 0)) : 0;
    const defaultStatus = currentFilter !== "all" ? currentFilter : "idea";
    let statusText = "Идея";
    if (defaultStatus === "in_progress") statusText = "Черновик";
    else if (defaultStatus === "editing") statusText = "В процессе";
    else if (defaultStatus === "published") statusText = "Опубликовано";

    const newVideoData = {
        title: "Новое видео",
        status: defaultStatus,
        statusText: statusText,
        tags: ["Проект"],
        date: "не запланировано",
        dateLabel: "не запланировано",
        publishDate: "",
        order: maxOrder + 1000,
        thumbnail: "https://placehold.co/600x338/e2e8f0/475569?text=New+Video",
        description: "",
        playlist: "",
        link: "",
        notes: "",
        checklist: [],
        files: []
    };

    if (currentUid) {
        try {
            const docRef = await addDoc(collection(db, "users", currentUid, "videos"), {
                ...newVideoData,
                createdAt: serverTimestamp()
            });
            // Выбираем созданное видео
            selectVideoItem(docRef.id);
            // Активируем инлайн-переименование
            setTimeout(() => {
                const card = document.querySelector(`.video-card[data-id="${docRef.id}"]`);
                if (card) {
                    enableInlineRename(card, docRef.id, newVideoData.title);
                }
            }, 100);
        } catch (err) {
            console.error("Ошибка при создании видео в Firestore:", err);
        }
    } else {
        // Локальный режим
        const id = "local_" + Date.now();
        const localVideo = { id, ...newVideoData, createdAt: Date.now() };
        videos.push(localVideo);
        localStorage.setItem("local_videos", JSON.stringify(videos));
        renderVideosList();
        selectVideoItem(id);
        setTimeout(() => {
            const card = document.querySelector(`.video-card[data-id="${id}"]`);
            if (card) {
                enableInlineRename(card, id, localVideo.title);
            }
        }, 100);
    }
}

// === Инлайн переименование видео ===
function enableInlineRename(cardEl, id, oldTitle) {
    if (cardEl.classList.contains("editing")) return;
    cardEl.classList.add("editing");

    const infoBlock = cardEl.querySelector(".video-info-block");
    if (!infoBlock) return;

    infoBlock.innerHTML = `<input type="text" class="video-title-input" value="${oldTitle.replace(/"/g, '&quot;')}" maxlength="100">`;
    const input = infoBlock.querySelector(".video-title-input");
    input.focus();
    input.select();

    let committed = false;

    async function commitRename() {
        if (committed) return;
        committed = true;
        
        const newTitle = input.value.trim() || oldTitle;
        cardEl.classList.remove("editing");

        // Восстанавливаем нормальный вид списка
        renderVideosList();

        if (newTitle !== oldTitle) {
            if (currentUid) {
                try {
                    await updateDoc(doc(db, "users", currentUid, "videos", id), {
                        title: newTitle
                    });
                } catch (err) {
                    console.error("Ошибка при обновлении названия в Firestore:", err);
                }
            } else {
                const v = videos.find(video => video.id === id);
                if (v) {
                    v.title = newTitle;
                    localStorage.setItem("local_videos", JSON.stringify(videos));
                    renderVideosList();
                    if (selectedVideo && selectedVideo.id === id) {
                        selectVideoItem(id);
                    }
                }
            }
        }
    }

    input.addEventListener("blur", commitRename);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            commitRename();
        } else if (e.key === "Escape") {
            input.value = oldTitle;
            commitRename();
        }
    });
}

// === Управление меню действий видео ===
const videoActionsDropdown = document.getElementById("videoActionsDropdown");
let activeMenuVideoId = null;

function showVideoMenu(e, videoId, triggerEl = null) {
    e.preventDefault();
    e.stopPropagation();

    activeMenuVideoId = videoId;
    videoActionsDropdown.style.display = "flex";

    // Подсвечиваем текущий статус видео в меню
    const video = videos.find(v => v.id === videoId);
    if (video) {
        const currentStatus = video.status || "idea";
        const statusBtns = videoActionsDropdown.querySelectorAll(".status-opt-btn");
        statusBtns.forEach(btn => {
            if (btn.dataset.status === currentStatus) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }

    // Позиционируем меню относительно .main-content
    const mainContent = document.querySelector(".main-content");
    const contentRect = mainContent ? mainContent.getBoundingClientRect() : { left: 0, top: 0 };
    const scrollLeft = mainContent ? mainContent.scrollLeft : 0;
    const scrollTop = mainContent ? mainContent.scrollTop : 0;

    if (triggerEl && (!e.clientX || e.type !== "contextmenu")) {
        const rect = triggerEl.getBoundingClientRect();
        videoActionsDropdown.style.position = "absolute";
        videoActionsDropdown.style.left = `${rect.left - contentRect.left + scrollLeft - 150}px`;
        videoActionsDropdown.style.top = `${rect.bottom - contentRect.top + scrollTop + 6}px`;
    } else {
        videoActionsDropdown.style.position = "absolute";
        let x = e.clientX - contentRect.left + scrollLeft;
        let y = e.clientY - contentRect.top + scrollTop;
        
        const menuWidth = 200;
        const menuHeight = 180;
        if (mainContent) {
            if (x + menuWidth > mainContent.scrollWidth) {
                x = mainContent.scrollWidth - menuWidth - 10;
            }
            if (e.clientY + menuHeight > window.innerHeight) {
                y = y - menuHeight;
            }
        }

        videoActionsDropdown.style.left = `${x}px`;
        videoActionsDropdown.style.top = `${y}px`;
    }
}

// Закрытие меню по клику в любом месте
document.addEventListener("click", (e) => {
    if (videoActionsDropdown && !e.target.closest(".video-options-btn") && !videoActionsDropdown.contains(e.target)) {
        videoActionsDropdown.style.display = "none";
    }
});

document.addEventListener("contextmenu", (e) => {
    if (videoActionsDropdown && !e.target.closest(".video-card") && !videoActionsDropdown.contains(e.target)) {
        videoActionsDropdown.style.display = "none";
    }
});

// Слушатели меню действий
document.getElementById("btnVideoRename").addEventListener("click", (e) => {
    e.stopPropagation();
    videoActionsDropdown.style.display = "none";
    if (activeMenuVideoId) {
        const card = document.querySelector(`.video-card[data-id="${activeMenuVideoId}"]`);
        const video = videos.find(v => v.id === activeMenuVideoId);
        if (card && video) {
            enableInlineRename(card, activeMenuVideoId, video.title);
        }
    }
});

const confirmDeleteVideoModal = document.getElementById("confirmDeleteVideoModal");
const confirmDeleteVideoTitle = document.getElementById("confirmDeleteVideoTitle");
const btnConfirmDeleteVideoCancel = document.getElementById("btnConfirmDeleteVideoCancel");
const btnConfirmDeleteVideoConfirm = document.getElementById("btnConfirmDeleteVideoConfirm");

// Функция восстановления видео
async function restoreVideo(id) {
    if (currentUid) {
        try {
            await updateDoc(doc(db, "users", currentUid, "videos", id), {
                deleted: false,
                deletedAt: null
            });
        } catch (err) {
            console.error("Ошибка при восстановлении видео в Firestore:", err);
        }
    } else {
        const v = videos.find(video => video.id === id);
        if (v) {
            v.deleted = false;
            v.deletedAt = null;
            localStorage.setItem("local_videos", JSON.stringify(videos));
            updateViewForRoute();
        }
    }
}

// Функция подтверждения удаления навсегда
function confirmDeletePermanently(id) {
    const video = videos.find(v => v.id === id);
    if (!video) return;

    isDeletePermanentMode = true;
    activeMenuVideoId = id;

    confirmDeleteVideoTitle.textContent = video.title;
    const modalDesc = document.querySelector("#confirmDeleteVideoModal .confirm-modal-desc");
    if (modalDesc) {
        modalDesc.innerHTML = `Видео <strong>${video.title}</strong> будет удалено безвозвратно. Это действие нельзя отменить.`;
    }
    confirmDeleteVideoModal.style.display = "flex";
}

document.getElementById("btnVideoDelete").addEventListener("click", (e) => {
    e.stopPropagation();
    videoActionsDropdown.style.display = "none";
    if (activeMenuVideoId) {
        const video = videos.find(v => v.id === activeMenuVideoId);
        if (video) {
            isDeletePermanentMode = false;
            confirmDeleteVideoTitle.textContent = video.title;
            const modalDesc = document.querySelector("#confirmDeleteVideoModal .confirm-modal-desc");
            if (modalDesc) {
                modalDesc.innerHTML = `Видео <strong>${video.title}</strong> будет перемещено в корзину.`;
            }
            confirmDeleteVideoModal.style.display = "flex";
        }
    }
});

btnConfirmDeleteVideoCancel.addEventListener("click", () => {
    confirmDeleteVideoModal.style.display = "none";
});

btnConfirmDeleteVideoConfirm.addEventListener("click", async () => {
    confirmDeleteVideoModal.style.display = "none";
    if (activeMenuVideoId) {
        if (isDeletePermanentMode) {
            if (activeMenuVideoId === "all_trash") {
                const deletedVideos = videos.filter(v => v.deleted);
                if (currentUid) {
                    try {
                        const deletePromises = deletedVideos.map(v => 
                            deleteDoc(doc(db, "users", currentUid, "videos", v.id))
                        );
                        await Promise.all(deletePromises);
                    } catch (err) {
                        console.error("Ошибка при очистке корзины в Firestore:", err);
                    }
                } else {
                    videos = videos.filter(v => !v.deleted);
                    localStorage.setItem("local_videos", JSON.stringify(videos));
                    updateViewForRoute();
                }
            } else {
                if (currentUid) {
                    try {
                        await deleteDoc(doc(db, "users", currentUid, "videos", activeMenuVideoId));
                    } catch (err) {
                        console.error("Ошибка при удалении видео из Firestore:", err);
                    }
                } else {
                    videos = videos.filter(v => v.id !== activeMenuVideoId);
                    localStorage.setItem("local_videos", JSON.stringify(videos));
                    updateViewForRoute();
                }
            }
        } else {
            // Мягкое удаление (в корзину)
            if (currentUid) {
                try {
                    await updateDoc(doc(db, "users", currentUid, "videos", activeMenuVideoId), {
                        deleted: true,
                        deletedAt: serverTimestamp()
                    });
                } catch (err) {
                    console.error("Ошибка при перемещении видео в корзину:", err);
                }
            } else {
                const v = videos.find(video => video.id === activeMenuVideoId);
                if (v) {
                    v.deleted = true;
                    v.deletedAt = Date.now();
                    localStorage.setItem("local_videos", JSON.stringify(videos));
                    updateViewForRoute();
                }
            }
        }
    }
});

confirmDeleteVideoModal.addEventListener("click", (e) => {
    if (e.target === confirmDeleteVideoModal) {
        confirmDeleteVideoModal.style.display = "none";
    }
});

// === ЛОГИКА РЕЗАЙЗЕРА ПРАВОГО САЙДБАРА ===
function initDetailSidebarResizer() {
    const resizer = document.getElementById("detailSidebarResizer");
    const sidebar = document.getElementById("detailSidebar");
    if (!resizer || !sidebar) return;

    let isResizing = false;
    let currentWidth = 380;

    const savedWidth = localStorage.getItem("creatorhub_detail_sidebar_width");
    if (savedWidth) {
        currentWidth = parseInt(savedWidth, 10);
        document.documentElement.style.setProperty("--detail-sidebar-width", currentWidth + "px");
    }

    resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        resizer.classList.add("resizing");
    });

    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        let newWidth = window.innerWidth - e.clientX;
        if (newWidth < 300) newWidth = 300;
        if (newWidth > 600) newWidth = 600;
        currentWidth = newWidth;
        document.documentElement.style.setProperty("--detail-sidebar-width", currentWidth + "px");
    });

    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            resizer.classList.remove("resizing");
            localStorage.setItem("creatorhub_detail_sidebar_width", currentWidth + "px");
        }
    });
}

// === ОБРАБОТЧИКИ КНОПОК СТАТУСА В КОНТЕКСТНОМ МЕНЮ ===
const statusOptButtons = videoActionsDropdown.querySelectorAll(".status-opt-btn");
statusOptButtons.forEach(btn => {
    btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        videoActionsDropdown.style.display = "none";
        
        if (!activeMenuVideoId) return;
        const newStatus = btn.dataset.status;
        let statusText = "Идея";
        if (newStatus === "in_progress") statusText = "Черновик";
        else if (newStatus === "editing") statusText = "В процессе";
        else if (newStatus === "published") statusText = "Опубликовано";
        
        // Обновляем статус в массиве
        const video = videos.find(v => v.id === activeMenuVideoId);
        if (video) {
            video.status = newStatus;
            video.statusText = statusText;
        }
        
        // Если это выбранное видео, обновляем правую панель
        if (selectedVideo && selectedVideo.id === activeMenuVideoId) {
            selectedVideo.status = newStatus;
            selectedVideo.statusText = statusText;
            if (detailStatusSelect) {
                detailStatusSelect.value = newStatus;
                detailStatusSelect.className = `status-select ${newStatus}`;
            }
            detailStatusDot.className = `status-dot ${newStatus}`;
        }
        
        if (currentUid) {
            try {
                await updateDoc(doc(db, "users", currentUid, "videos", activeMenuVideoId), {
                    status: newStatus,
                    statusText: statusText
                });
            } catch (err) {
                console.error("Ошибка при обновлении статуса из меню в Firestore:", err);
            }
        } else {
            localStorage.setItem("local_videos", JSON.stringify(videos));
            renderVideosList();
        }
    });
});

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ СИНХРОНИЗАЦИИ ДАННЫХ И КНОПОК ===
async function saveVideoData(field, value) {
    if (!selectedVideo) return;
    if (currentUid) {
        try {
            await updateDoc(doc(db, "users", currentUid, "videos", selectedVideo.id), {
                [field]: value
            });
        } catch (err) {
            console.error(`Ошибка при сохранении поля ${field} в Firestore:`, err);
        }
    } else {
        localStorage.setItem("local_videos", JSON.stringify(videos));
    }
}

function updateNotionButtonState() {
    if (!btnOpenNotion) return;
    if (selectedVideo && selectedVideo.notionLink && selectedVideo.notionLink.trim() !== "") {
        btnOpenNotion.classList.remove("disabled");
        btnOpenNotion.href = selectedVideo.notionLink;
    } else {
        btnOpenNotion.classList.add("disabled");
        btnOpenNotion.href = "#";
    }
}

function openImageLightbox(src) {
    const overlay = document.createElement("div");
    overlay.className = "image-lightbox-overlay";
    overlay.innerHTML = `<img src="${src}" class="image-lightbox-img">`;
    document.body.appendChild(overlay);
    
    overlay.offsetWidth; // trigger reflow
    overlay.classList.add("active");
    
    const close = () => {
        overlay.classList.remove("active");
        setTimeout(() => overlay.remove(), 200);
    };
    
    overlay.addEventListener("click", close);
    overlay.querySelector(".image-lightbox-img").addEventListener("click", (e) => {
        e.stopPropagation();
    });
}

// === РЕНДЕРИНГ КАЛЕНДАРЯ НА СТРАНИЦЕ ===
function renderCalendarView() {
    const daysContainer = document.getElementById("calendarViewDaysGrid");
    const monthTitle = document.getElementById("calendarViewMonthTitle");
    if (!daysContainer || !monthTitle) return;

    daysContainer.innerHTML = "";

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    monthTitle.textContent = `${cvMonthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    const totalDays = lastDay.getDate();
    const prevLastDay = new Date(year, month, 0).getDate();

    const today = new Date();

    const createDayElement = (number, otherMonth = false, isToday = false) => {
        const dayEl = document.createElement("div");
        dayEl.className = "cv-day";

        if (otherMonth) dayEl.classList.add("cv-other-month");
        if (isToday) dayEl.classList.add("cv-today");

        dayEl.innerHTML = `
            <div class="cv-day-number">${number}</div>
            ${!otherMonth && number % 6 === 0 ? `<div class="cv-event">Задача / событие</div>` : ""}
        `;
        daysContainer.appendChild(dayEl);
    };

    let cellsDrawn = 0;
    for (let i = startDay; i > 0; i--) {
        createDayElement(prevLastDay - i + 1, true);
        cellsDrawn++;
    }

    for (let day = 1; day <= totalDays; day++) {
        if (cellsDrawn >= 35) break;
        const isToday =
            day === today.getDate() &&
            month === today.getMonth() &&
            year === today.getFullYear();

        createDayElement(day, false, isToday);
        cellsDrawn++;
    }

    const remainingCells = Math.max(0, 35 - cellsDrawn);
    for (let day = 1; day <= remainingCells; day++) {
        createDayElement(day, true);
    }
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И DRAG-AND-DROP ===

function formatDateToRussian(dateString) {
    if (!dateString || dateString === "Без даты" || dateString === "не запланировано") return "не запланировано";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "не запланировано";
    
    const months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря"
    ];
    
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} ${month} ${year}`;
}

function formatCreatedDate(timestamp) {
    if (!timestamp) return "--";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "--";

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1, d2) => 
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

    if (isSameDay(date, today)) {
        return "сегодня";
    } else if (isSameDay(date, yesterday)) {
        return "вчера";
    } else {
        return formatDateToRussian(date);
    }
}

// Рендеринг календарной сетки в настройках
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

        // Предыдущий месяц
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

        // Следующий месяц
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

async function setDueDate(dateStr) {
    if (!selectedVideo) return;
    
    selectedDueDate = dateStr;
    selectedVideo.publishDate = dateStr;
    
    const formattedDate = formatDateToRussian(dateStr);
    selectedVideo.date = formattedDate;
    selectedVideo.dateLabel = formattedDate;
    
    // Обновляем текст на кнопке настроек
    if (dueDateBtnText) {
        dueDateBtnText.textContent = formattedDate;
    }
    // Обновляем статичный текст на вкладке Информация
    if (infoDate) {
        infoDate.textContent = formattedDate;
    }

    if (currentUid) {
        try {
            await updateDoc(doc(db, "users", currentUid, "videos", selectedVideo.id), {
                publishDate: dateStr,
                date: formattedDate,
                dateLabel: formattedDate
            });
        } catch (err) {
            console.error("Ошибка при сохранении даты публикации в Firestore:", err);
        }
    } else {
        localStorage.setItem("local_videos", JSON.stringify(videos));
        renderVideosList();
    }
    
    if (dueDateDropdown) {
        dueDateDropdown.style.display = "none";
    }
}

function updateDescriptionViewer(text) {
    if (!infoDescriptionViewer) return;
    if (!text) {
        infoDescriptionViewer.innerHTML = `<span style="color: var(--ch-text-gray); font-style: italic;">Нажмите, чтобы добавить описание...</span>`;
        return;
    }
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" style="color: var(--ch-purple); text-decoration: underline; font-weight: 500;">${url}</a>`;
    });
    infoDescriptionViewer.innerHTML = html;
}

function initDragAndDrop() {
    let draggingElement = null;
    let placeholder = null;

    videosListContainer.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.video-card');
        if (currentSort !== "manual" || !card || card.classList.contains('editing') || card.querySelector('.btn-restore')) {
            e.preventDefault();
            return;
        }
        draggingElement = card;
        card.classList.add('dragging');
        
        placeholder = document.createElement('div');
        placeholder.className = 'video-drag-placeholder';
        placeholder.style.height = `${draggingElement.offsetHeight}px`;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.getAttribute('data-id'));

        setTimeout(() => {
            if (draggingElement) {
                draggingElement.style.display = 'none';
            }
        }, 0);
    });

    videosListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggingElement || !placeholder) return;

        const afterElement = getDragAfterVideo(videosListContainer, e.clientY);
        if (afterElement) {
            videosListContainer.insertBefore(placeholder, afterElement);
        } else {
            videosListContainer.appendChild(placeholder);
        }
    });

    videosListContainer.addEventListener('dragend', (e) => {
        if (draggingElement) {
            draggingElement.style.display = '';
            draggingElement.classList.remove('dragging');
            draggingElement.removeAttribute('draggable');
        }
        if (placeholder && placeholder.parentNode) {
            placeholder.remove();
        }
        placeholder = null;
        draggingElement = null;
    });

    videosListContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggingElement || !placeholder) return;

        const prevElement = placeholder.previousElementSibling;
        const nextElement = placeholder.nextElementSibling;

        placeholder.remove();
        placeholder = null;
        
        if (draggingElement) {
            draggingElement.style.display = '';
            draggingElement.classList.remove('dragging');
        }

        const videoId = draggingElement.getAttribute('data-id');
        const video = videos.find(v => v.id === videoId);
        if (!video) {
            draggingElement = null;
            return;
        }

        const prevVideoId = prevElement ? prevElement.getAttribute('data-id') : null;
        const nextVideoId = nextElement ? nextElement.getAttribute('data-id') : null;

        const prevVideo = videos.find(v => v.id === prevVideoId);
        const nextVideo = videos.find(v => v.id === nextVideoId);

        let newOrder = 0;
        if (!prevVideo && !nextVideo) {
            newOrder = 0;
        } else if (!prevVideo) {
            newOrder = (nextVideo.order !== undefined ? nextVideo.order : 0) - 1000;
        } else if (!nextVideo) {
            newOrder = (prevVideo.order !== undefined ? prevVideo.order : 0) + 1000;
        } else {
            const prevOrder = prevVideo.order !== undefined ? prevVideo.order : 0;
            const nextOrder = nextVideo.order !== undefined ? nextVideo.order : 0;
            newOrder = (prevOrder + nextOrder) / 2;
        }

        video.order = newOrder;

        if (currentUid && videoId) {
            try {
                await updateDoc(doc(db, "users", currentUid, "videos", videoId), {
                    order: newOrder
                });
            } catch (err) {
                console.error("Ошибка при переупорядочивании видео:", err);
            }
        } else {
            localStorage.setItem("local_videos", JSON.stringify(videos));
            renderVideosList();
        }
        draggingElement = null;
    });
}

function getDragAfterVideo(container, y) {
    const dragElements = [...container.querySelectorAll('.video-card:not(.dragging):not(.video-drag-placeholder)')];

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

function initTouchDragAndDrop() {
    let touchStartTimer = null;
    let touchDraggingElement = null;
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
    };

    const handleTouchStart = (e) => {
        if (e.touches.length > 1) return;
        if (currentSort !== "manual") return;
        
        // Предотвращаем срабатывание драга, если кликнули на селект статуса или другие интерактивные элементы
        if (e.target.closest('button, input, textarea, a, select')) {
            return;
        }
        
        const touch = e.touches[0];
        startY = touch.clientY;
        startX = touch.clientX;

        const card = e.target.closest('.video-card');
        if (!card || card.classList.contains('editing') || card.querySelector('.btn-restore')) return;

        const preventSelection = (evt) => {
            evt.preventDefault();
        };

        window.addEventListener('touchmove', handleTouchMovePassive, { passive: true });
        window.addEventListener('touchend', handleTouchEndPassive, { passive: true });
        window.addEventListener('touchcancel', handleTouchEndPassive, { passive: true });

        touchStartTimer = setTimeout(() => {
            removePassiveListeners();

            touchDraggingElement = card;
            touchDraggingElement.classList.add('dragging');
            touchDraggingElement.setAttribute('draggable', 'true');

            window.addEventListener('selectstart', preventSelection, { capture: true });
            window.addEventListener('contextmenu', preventSelection, { capture: true });
            touchDraggingElement._preventSelection = preventSelection;

            window.addEventListener('touchmove', handleTouchMoveActive, { passive: false });
            window.addEventListener('touchend', handleTouchEndActive, { passive: true });
            window.addEventListener('touchcancel', resetTouchState, { passive: true });

            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 300);
    };

    const handleTouchMoveActive = (e) => {
        if (!touchDraggingElement) return;
        e.preventDefault();

        const touch = e.touches[0];
        
        if (!placeholder) {
            placeholder = document.createElement('div');
            placeholder.className = 'video-drag-placeholder';
            placeholder.style.height = `${touchDraggingElement.offsetHeight}px`;
        }

        const afterElement = getDragAfterVideo(videosListContainer, touch.clientY);
        if (afterElement) {
            videosListContainer.insertBefore(placeholder, afterElement);
        } else {
            videosListContainer.appendChild(placeholder);
        }
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

        const prevElement = placeholder.previousElementSibling;
        const nextElement = placeholder.nextElementSibling;
        const draggingEl = touchDraggingElement;

        resetTouchState();

        const videoId = draggingEl.getAttribute('data-id');
        const video = videos.find(v => v.id === videoId);
        if (!video) return;

        const prevVideoId = prevElement ? prevElement.getAttribute('data-id') : null;
        const nextVideoId = nextElement ? nextElement.getAttribute('data-id') : null;

        const prevVideo = videos.find(v => v.id === prevVideoId);
        const nextVideo = videos.find(v => v.id === nextVideoId);

        let newOrder = 0;
        if (!prevVideo && !nextVideo) {
            newOrder = 0;
        } else if (!prevVideo) {
            newOrder = (nextVideo.order !== undefined ? nextVideo.order : 0) - 1000;
        } else if (!nextVideo) {
            newOrder = (prevVideo.order !== undefined ? prevVideo.order : 0) + 1000;
        } else {
            const prevOrder = prevVideo.order !== undefined ? prevVideo.order : 0;
            const nextOrder = nextVideo.order !== undefined ? nextVideo.order : 0;
            newOrder = (prevOrder + nextOrder) / 2;
        }

        video.order = newOrder;

        if (currentUid && videoId) {
            try {
                await updateDoc(doc(db, "users", currentUid, "videos", videoId), {
                    order: newOrder
                });
            } catch (err) {
                console.error("Ошибка при touch-перетаскивании видео:", err);
            }
        } else {
            localStorage.setItem("local_videos", JSON.stringify(videos));
            renderVideosList();
        }
    };

    videosListContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
}

function updateTabCounts() {
    const activeVideos = videos.filter(v => !v.deleted);
    const countMap = {
        idea: activeVideos.filter(v => v.status === "idea").length,
        in_progress: activeVideos.filter(v => v.status === "in_progress").length,
        editing: activeVideos.filter(v => v.status === "editing").length,
        published: activeVideos.filter(v => v.status === "published").length
    };

    const tabLabels = {
        idea: "Идеи",
        in_progress: "Черновик",
        editing: "В процессе",
        published: "Опубликовано"
    };

    const tabBtns = document.querySelectorAll(".filters-tabs .tab-btn");
    tabBtns.forEach(btn => {
        const filterVal = btn.dataset.filter;
        if (tabLabels[filterVal] !== undefined) {
            btn.innerHTML = `${tabLabels[filterVal]} <span class="tab-count">${countMap[filterVal]}</span>`;
        }
    });
}

function renderTags() {
    if (!selectedVideo) {
        if (infoTags) infoTags.innerHTML = "";
        return;
    }
    const tagsList = selectedVideo.tags || [];
    infoTags.innerHTML = tagsList.map(tag => `
        <span class="tag-badge ${getTagColorClass(tag)}" data-tag="${tag}">${tag}<span class="btn-remove-tag" data-tag="${tag}">&times;</span></span>
    `).join('') + `<button class="btn-add-tag" id="btnAddTag">+</button>`;

    // Add event listeners to delete buttons
    infoTags.querySelectorAll(".btn-remove-tag").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const tagToRemove = btn.dataset.tag;
            removeTagFromVideo(tagToRemove);
        });
    });

    // Add event listener to plus button
    const btnAddTag = document.getElementById("btnAddTag");
    if (btnAddTag) {
        btnAddTag.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleTagsDropdown(e);
        });
    }
}

function removeTagFromVideo(tagToRemove) {
    if (!selectedVideo) return;
    const currentTags = selectedVideo.tags || [];
    const newTags = currentTags.filter(t => t !== tagToRemove);
    updateTagsState(newTags);
}

async function updateTagsState(newTags) {
    if (!selectedVideo) return;
    selectedVideo.tags = newTags;
    await saveVideoData("tags", newTags);
    renderVideosList();
    renderTags();
}

function getAllUniqueTags() {
    const allTagsSet = new Set();
    videos.forEach(v => {
        if (v.tags && Array.isArray(v.tags)) {
            v.tags.forEach(tag => {
                if (tag && tag.trim() !== "") {
                    allTagsSet.add(tag.trim());
                }
            });
        }
    });
    return Array.from(allTagsSet);
}

let tagConfigs = {};
let activeTagEdit = null;
const tagColorsList = ["purple", "blue", "green", "yellow", "orange", "red", "pink", "teal", "indigo", "gray"];

function loadTagConfigs() {
    try {
        const stored = localStorage.getItem("creatorhub_tag_configs");
        if (stored) {
            tagConfigs = JSON.parse(stored);
        }
    } catch (e) {
        console.error("Error loading tag configs", e);
    }
}

function saveTagConfigs() {
    try {
        localStorage.setItem("creatorhub_tag_configs", JSON.stringify(tagConfigs));
    } catch (e) {
        console.error("Error saving tag configs", e);
    }
}

function getTagColorClass(tag) {
    if (tagConfigs[tag] && tagConfigs[tag].color) {
        return `tag-color-${tagConfigs[tag].color}`;
    }
    return "tag-color-purple";
}

function toggleTagsDropdown(event) {
    let dropdown = infoTags.querySelector(".tag-dropdown");
    if (dropdown) {
        if (dropdown.style.display === "flex") {
            dropdown.style.display = "none";
        } else {
            dropdown.style.display = "flex";
            dropdown.querySelector(".tag-dropdown-search").value = "";
            dropdown.querySelector(".tag-dropdown-search").focus();
            activeTagEdit = null;
            renderDropdownList(dropdown);
        }
        return;
    }

    dropdown = document.createElement("div");
    dropdown.className = "tag-dropdown";
    dropdown.style.display = "flex";
    
    dropdown.innerHTML = `
        <input type="text" class="tag-dropdown-search" placeholder="Поиск или новый тег..." autocomplete="off">
        <div class="tag-dropdown-list"></div>
        <div class="tag-dropdown-create" style="display: none;">
            <button class="btn-create-tag"></button>
        </div>
    `;

    infoTags.appendChild(dropdown);

    dropdown.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    const searchInput = dropdown.querySelector(".tag-dropdown-search");
    searchInput.focus();

    searchInput.addEventListener("input", () => {
        renderDropdownList(dropdown);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const val = searchInput.value.trim();
            if (val) {
                const currentTags = selectedVideo.tags || [];
                if (!currentTags.includes(val)) {
                    updateTagsState([...currentTags, val]);
                }
                searchInput.value = "";
                renderDropdownList(dropdown);
            }
        }
    });

    renderDropdownList(dropdown);
}

function renderDropdownList(dropdown) {
    const searchInput = dropdown.querySelector(".tag-dropdown-search");
    const query = searchInput.value.trim().toLowerCase();
    const listContainer = dropdown.querySelector(".tag-dropdown-list");
    const createContainer = dropdown.querySelector(".tag-dropdown-create");
    const createBtn = dropdown.querySelector(".btn-create-tag");

    listContainer.innerHTML = "";

    const uniqueTags = getAllUniqueTags();
    const currentTags = selectedVideo.tags || [];

    const filteredTags = uniqueTags.filter(tag => tag.toLowerCase().includes(query));

    filteredTags.forEach(tag => {
        const isSelected = currentTags.includes(tag);
        const itemWrapper = document.createElement("div");
        itemWrapper.className = "tag-dropdown-item-wrapper";

        const isEditingThis = activeTagEdit === tag;

        const item = document.createElement("div");
        item.className = `tag-dropdown-item${isSelected ? ' selected' : ''}`;
        item.innerHTML = `
            <span style="display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%;" class="${getTagColorClass(tag)}"></span>
                <span>${tag}</span>
            </span>
            <span style="display: flex; align-items: center; gap: 4px;">
                ${isSelected ? '<span style="font-size: 0.8rem; margin-right: 4px;">✓</span>' : ''}
                <button class="btn-edit-tag-inline" title="Редактировать тег">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                </button>
            </span>
        `;

        const btnEdit = item.querySelector(".btn-edit-tag-inline");
        btnEdit.addEventListener("click", (e) => {
            e.stopPropagation();
            activeTagEdit = isEditingThis ? null : tag;
            renderDropdownList(dropdown);
        });

        item.addEventListener("click", () => {
            if (isSelected) {
                updateTagsState(currentTags.filter(t => t !== tag));
            } else {
                updateTagsState([...currentTags, tag]);
            }
            searchInput.focus();
        });

        itemWrapper.appendChild(item);

        if (isEditingThis) {
            const editPanel = document.createElement("div");
            editPanel.className = "tag-edit-panel";
            
            const currentColor = tagConfigs[tag]?.color || "purple";

            editPanel.innerHTML = `
                <div class="tag-edit-title">Параметры тега</div>
                <input type="text" class="tag-edit-input" value="${tag}" placeholder="Название тега...">
                <div class="tag-color-picker">
                    ${tagColorsList.map(c => `
                        <div class="color-bubble tag-color-${c} ${currentColor === c ? 'selected' : ''}" data-color="${c}"></div>
                    `).join('')}
                </div>
                <div class="tag-edit-actions">
                    <button class="btn-tag-edit-delete" title="Удалить тег глобально">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span style="margin-left: 4px; font-size: 0.72rem;">Удалить</span>
                    </button>
                    <div class="tag-edit-actions-right">
                        <button class="btn-tag-edit-cancel">Отмена</button>
                        <button class="btn-tag-edit-save">ОК</button>
                    </div>
                </div>
            `;

            const bubbles = editPanel.querySelectorAll(".color-bubble");
            bubbles.forEach(b => {
                b.addEventListener("click", (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    bubbles.forEach(x => x.classList.remove("selected"));
                    b.classList.add("selected");
                });
            });

            editPanel.querySelector(".btn-tag-edit-cancel").addEventListener("click", () => {
                activeTagEdit = null;
                renderDropdownList(dropdown);
            });

            editPanel.querySelector(".btn-tag-edit-delete").addEventListener("click", async () => {
                if (confirm(`Удалить тег "${tag}" у всех видео?`)) {
                    activeTagEdit = null;
                    await deleteTagGlobally(tag);
                    renderDropdownList(dropdown);
                }
            });

            editPanel.querySelector(".btn-tag-edit-save").addEventListener("click", async () => {
                const newName = editPanel.querySelector(".tag-edit-input").value.trim();
                const selectedBubble = editPanel.querySelector(".color-bubble.selected");
                const newColor = selectedBubble ? selectedBubble.dataset.color : "purple";
                
                if (newName) {
                    activeTagEdit = null;
                    await renameAndColorTag(tag, newName, newColor);
                    renderDropdownList(dropdown);
                }
            });

            itemWrapper.appendChild(editPanel);
        }

        listContainer.appendChild(itemWrapper);
    });

    const inputVal = searchInput.value.trim();
    if (inputVal && !uniqueTags.some(t => t.toLowerCase() === inputVal.toLowerCase())) {
        createContainer.style.display = "flex";
        createBtn.textContent = `+ Создать тег "${inputVal}"`;
        const newBtn = createBtn.cloneNode(true);
        createBtn.parentNode.replaceChild(newBtn, createBtn);
        newBtn.addEventListener("click", () => {
            const currentTags = selectedVideo.tags || [];
            updateTagsState([...currentTags, inputVal]);
            searchInput.value = "";
            renderDropdownList(dropdown);
        });
    } else {
        createContainer.style.display = "none";
    }
}

async function renameAndColorTag(oldTag, newName, color) {
    if (!newName) return;
    delete tagConfigs[oldTag];
    tagConfigs[newName] = { color: color };
    saveTagConfigs();

    videos.forEach(v => {
        if (v.tags && Array.isArray(v.tags)) {
            const mapped = v.tags.map(t => t === oldTag ? newName : t);
            v.tags = Array.from(new Set(mapped));
        }
    });

    if (currentUid) {
        const promises = videos.map(async (v) => {
            try {
                await updateDoc(doc(db, "users", currentUid, "videos", v.id), {
                    tags: v.tags
                });
            } catch (err) {
                console.error("Error updating tag on video:", v.id, err);
            }
        });
        await Promise.all(promises);
    } else {
        localStorage.setItem("local_videos", JSON.stringify(videos));
    }
    renderVideosList();
    renderTags();
}

async function deleteTagGlobally(oldTag) {
    delete tagConfigs[oldTag];
    saveTagConfigs();

    videos.forEach(v => {
        if (v.tags && Array.isArray(v.tags)) {
            v.tags = v.tags.filter(t => t !== oldTag);
        }
    });

    if (currentUid) {
        const promises = videos.map(async (v) => {
            try {
                await updateDoc(doc(db, "users", currentUid, "videos", v.id), {
                    tags: v.tags
                });
            } catch (err) {
                console.error("Error deleting tag from video:", v.id, err);
            }
        });
        await Promise.all(promises);
    } else {
        localStorage.setItem("local_videos", JSON.stringify(videos));
    }
    renderVideosList();
    renderTags();
}

function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem("creatorhub_view_mode", mode);
    
    const container = document.getElementById("videosListContainer");
    const btnList = document.getElementById("btnListView");
    const btnGrid = document.getElementById("btnGridView");
    
    if (mode === "grid") {
        if (container) container.classList.add("grid-view");
        if (btnGrid) btnGrid.classList.add("active");
        if (btnList) btnList.classList.remove("active");
    } else {
        if (container) container.classList.remove("grid-view");
        if (btnList) btnList.classList.add("active");
        if (btnGrid) btnGrid.classList.remove("active");
    }
}

/* ================= TOOLTIPS SYSTEM ================= */
const tooltipEl = document.getElementById('customTooltip');
function initTooltips() {
    const elements = document.querySelectorAll('[data-tip]');
    elements.forEach(el => {
        if (!el.dataset.tooltipAttached) {
            el.dataset.tooltipAttached = "true";
            el.addEventListener('mouseenter', showTip);
            el.addEventListener('mouseleave', hideTip);
            el.addEventListener('click', hideTip);
        }
    });
}

function showTip(e) {
    if (!tooltipEl) return;
    const el = e.currentTarget;
    const text = el.getAttribute('data-tip');
    if (!text) return;
    
    tooltipEl.textContent = text;
    tooltipEl.classList.add('visible');
    
    const rect = el.getBoundingClientRect();
    
    // Position tooltip ABOVE the button
    let top = rect.top - tooltipEl.offsetHeight - 8;
    
    // Fallback to below if no space above
    if (top < 0) {
        top = rect.bottom + 8;
    }
    
    let left = rect.left + (rect.width / 2) - (tooltipEl.offsetWidth / 2);
    if (left < 10) left = 10;
    if (left + tooltipEl.offsetWidth > window.innerWidth) {
        left = window.innerWidth - tooltipEl.offsetWidth - 10;
    }
    
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
}

function hideTip() {
    if (tooltipEl) tooltipEl.classList.remove('visible');
}

// === MOBILE BOTTOM SHEET FOR VIDEO DETAILS ===
function openDetailSidebarMobile() {
    const overlay = document.getElementById("detailSidebarOverlay");
    if (!detailSidebar || !overlay) return;
    
    overlay.style.display = "block";
    detailSidebar.style.display = "flex";
    
    detailSidebar.classList.remove("collapsed");
    detailSidebar.classList.add("expanded");
    detailSidebar.style.transform = "";
    
    // Force reflow
    detailSidebar.offsetHeight;
    
    overlay.classList.add("active");
    detailSidebar.classList.add("active");
}

function closeDetailSidebarMobile() {
    const overlay = document.getElementById("detailSidebarOverlay");
    if (!detailSidebar || !overlay) return;
    
    overlay.classList.remove("active");
    detailSidebar.classList.remove("active", "expanded", "collapsed");
    detailSidebar.style.transform = "";
    
    setTimeout(() => {
        if (!detailSidebar.classList.contains("active")) {
            overlay.style.display = "none";
            detailSidebar.style.display = "none";
        }
    }, 300);
}

function initVideoDetailMobileBottomSheet() {
    const overlay = document.getElementById("detailSidebarOverlay");
    if (!detailSidebar || !overlay) return;
    
    const dragHandleContainer = detailSidebar.querySelector(".detail-sidebar-drag-handle-container");
    
    overlay.addEventListener("click", () => {
        if (window.innerWidth <= 900) {
            closeDetailSidebarMobile();
        }
    });
    
    if (!dragHandleContainer) return;
    
    let startY = 0;
    let currentY = 0;
    let startTranslateY = 0;
    let isDragging = false;
    
    function onTouchStart(e) {
        if (window.innerWidth > 900) return; // Only mobile
        
        const isHandle = e.target.closest(".detail-sidebar-drag-handle-container") || e.target.closest(".detail-title-block");
        
        if (!isHandle && detailSidebar.scrollTop > 0) {
            return;
        }
        
        startY = e.touches[0].clientY;
        currentY = startY;
        
        if (detailSidebar.classList.contains("expanded")) {
            startTranslateY = 0;
        } else {
            startTranslateY = window.innerHeight * 0.40;
        }
        
        isDragging = true;
        detailSidebar.style.transition = "none";
    }
    
    function onTouchMove(e) {
        if (!isDragging) return;
        
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        
        let newTranslateY = startTranslateY + deltaY;
        
        if (newTranslateY < 0) {
            newTranslateY = newTranslateY * 0.3; // Rubber-band
        }
        
        detailSidebar.style.transform = `translateY(${newTranslateY}px)`;
        
        if (newTranslateY > window.innerHeight * 0.40) {
            const progress = Math.max(0, Math.min(1, (newTranslateY - window.innerHeight * 0.40) / (window.innerHeight * 0.52)));
            overlay.style.backgroundColor = `rgba(0, 0, 0, ${0.45 * (1 - progress)})`;
        }
    }
    
    function onTouchEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        
        detailSidebar.style.transition = "";
        overlay.style.backgroundColor = "";
        
        const deltaY = currentY - startY;
        const viewportHeight = window.innerHeight;
        
        if (startTranslateY === 0) {
            if (deltaY > 100) {
                if (deltaY > viewportHeight * 0.35) {
                    closeDetailSidebarMobile();
                } else {
                    detailSidebar.classList.remove("expanded");
                    detailSidebar.classList.add("collapsed");
                    detailSidebar.style.transform = "";
                }
            } else {
                detailSidebar.classList.add("expanded");
                detailSidebar.classList.remove("collapsed");
                detailSidebar.style.transform = "";
            }
        } else {
            if (deltaY < -60) {
                detailSidebar.classList.add("expanded");
                detailSidebar.classList.remove("collapsed");
                detailSidebar.style.transform = "";
            } else if (deltaY > 100) {
                closeDetailSidebarMobile();
            } else {
                detailSidebar.classList.remove("expanded");
                detailSidebar.classList.add("collapsed");
                detailSidebar.style.transform = "";
            }
        }
    }
    
    dragHandleContainer.addEventListener("touchstart", onTouchStart, { passive: true });
    dragHandleContainer.addEventListener("touchmove", onTouchMove, { passive: true });
    dragHandleContainer.addEventListener("touchend", onTouchEnd);
    
    const titleBlock = detailSidebar.querySelector(".detail-title-block");
    if (titleBlock) {
        titleBlock.addEventListener("touchstart", onTouchStart, { passive: true });
        titleBlock.addEventListener("touchmove", onTouchMove, { passive: true });
        titleBlock.addEventListener("touchend", onTouchEnd);
    }
}

