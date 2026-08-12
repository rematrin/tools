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
    serverTimestamp,
    where,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Изначальные данные видео
const initialVideos = [];

let videos = [...initialVideos];
let selectedVideo = null;
let currentFilter = "idea";
let searchQuery = "";
let currentMenuRoute = "videos"; // "videos" | "trash"
let isDeletePermanentMode = false;
let currentViewMode = localStorage.getItem("creatorhub_view_mode") || "list";

// Переменные для интеграции с todo.html
let youtubeProjectId = null;
let videoSectionId = null;
let unsubscribeTasks = null;
let unsubscribeProjects = null;
let unsubscribeSections = null;
let projectsList = [];
let sectionsList = [];
let chTasksCompletedCollapsed = localStorage.getItem("ch_tasks_completed_collapsed") === "true";

// Переменные для редактирования задачи в CreatorHub
let currentEditingTask = null;
let chTaskEditModalSelectedPriority = 0;
let currentTasksList = [];

const SHORTS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="16" height="16" baseProfile="basic" style="vertical-align: middle; margin-right: 6px; flex-shrink: 0; display: inline-block;"><path fill="#ff3d00" d="M29.103,2.631c4.217-2.198,9.438-0.597,11.658,3.577c2.22,4.173,0.6,9.337-3.617,11.534l-3.468,1.823	c2.987,0.109,5.836,1.75,7.328,4.555c2.22,4.173,0.604,9.337-3.617,11.534L18.897,45.37c-4.217,2.198-9.438,0.597-11.658-3.577	s-0.6-9.337,3.617-11.534l3.468-1.823c-2.987-0.109-5.836-1.75-7.328-4.555c-2.22-4.173-0.6-9.337,3.617-11.534	C10.612,12.346,29.103,2.631,29.103,2.631z M19.122,17.12l11.192,6.91l-11.192,6.877C19.122,30.907,19.122,17.12,19.122,17.12z"/><path fill="#fff" d="M19.122,17.12v13.787l11.192-6.877L19.122,17.12z"/></svg>`;

function formatVideoTitle(title) {
    if (!title) return "";
    if (title.startsWith("* ")) {
        return title.slice(2);
    }
    return title;
}

// --- YOUTUBE API HELPER FUNCTIONS ---
const YOUTUBE_API_KEY = "AIzaSyCeQA2-I2pGKQwStB1TN8NQOQcKdgqc7_0";

function parseYouTubeId(url) {
    if (!url) return null;
    try {
        const u = new URL(url.trim());
        if (u.hostname.endsWith('youtu.be')) return u.pathname.split('/')[1] || null;
        if (u.searchParams.get('v')) return u.searchParams.get('v');
        if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
        if (u.pathname.startsWith('/embed/'))  return u.pathname.split('/')[2] || null;
        return null;
    } catch {
        const match = url.trim().match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtu\.be\/embed\/|youtu\.be\/shorts\/)([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[m]);
}

async function fetchYouTubeVideoInfo(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("API request failed");
    const data = await res.json();
    if (!data.items || data.items.length === 0) throw new Error("Video not found");
    const snippet = data.items[0].snippet;
    return {
        title: snippet.title,
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    };
}

async function getYouTubeCardData(videoId) {
    try {
        return await fetchYouTubeVideoInfo(videoId);
    } catch (e) {
        console.warn("Failed to fetch YouTube info, using fallback:", e);
        return {
            title: "YouTube Video",
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
    }
}

function ensureEditableSiblings(element, container) {
    if (!element.parentNode) return;
    // Проверяем следующий сиблинг (только если его вообще нет)
    if (!element.nextSibling) {
        const nextBlock = document.createElement("div");
        nextBlock.innerHTML = "<br>";
        element.parentNode.appendChild(nextBlock);
    }
    // Проверяем предыдущий сиблинг (только если его вообще нет)
    if (!element.previousSibling) {
        const prevBlock = document.createElement("div");
        prevBlock.innerHTML = "<br>";
        element.parentNode.insertBefore(prevBlock, element);
    }
}

function normalizeEditorContent(container) {
    if (!container) return;
    const blocks = container.querySelectorAll('.yt-link-card, .references-separator');
    blocks.forEach(block => {
        ensureEditableSiblings(block, container);
        // Добавляем кнопку удаления для карточек, если её нет
        if (block.classList.contains('yt-link-card') && !block.querySelector('.yt-link-card-delete')) {
            const btn = document.createElement('button');
            btn.className = 'yt-link-card-delete';
            btn.title = 'Удалить';
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            block.insertBefore(btn, block.firstChild);
        }
    });
}

function focusOnBlock(block) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(block, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

function focusAtEndOfBlock(block) {
    const selection = window.getSelection();
    const range = document.createRange();
    
    let lastNode = block;
    while (lastNode.lastChild) {
        lastNode = lastNode.lastChild;
    }
    
    if (lastNode.nodeType === Node.TEXT_NODE) {
        range.setStart(lastNode, lastNode.length);
        range.setEnd(lastNode, lastNode.length);
    } else {
        range.selectNodeContents(lastNode);
        range.collapse(false);
    }
    
    selection.removeAllRanges();
    selection.addRange(range);
}

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
const videoButtonsContainer = document.getElementById("videoButtonsContainer");
const settingVideoLink = document.getElementById("settingVideoLink");
const btnOpenStudio = document.getElementById("btnOpenStudio");

// Новые динамические элементы кнопок
const btnOpenGlobalButtons = document.getElementById("btnOpenGlobalButtons");
const globalButtonsModal = document.getElementById("globalButtonsModal");
const btnGlobalButtonsCloseX = document.getElementById("btnGlobalButtonsCloseX");
const btnGlobalButtonsClose = document.getElementById("btnGlobalButtonsClose");
const btnCreateGlobalButton = document.getElementById("btnCreateGlobalButton");
const globalButtonsListContainer = document.getElementById("globalButtonsListContainer");
const btnSelectButtonToAdd = document.getElementById("btnSelectButtonToAdd");
const dropdownAddButtonOptions = document.getElementById("dropdownAddButtonOptions");
const selectedVideoButtonsContainer = document.getElementById("selectedVideoButtonsContainer");

// Элементы модального окна удаления ссылки из описания
const confirmDeleteLinkModal = document.getElementById("confirmDeleteLinkModal");
const btnConfirmDeleteLinkCancel = document.getElementById("btnConfirmDeleteLinkCancel");
const btnConfirmDeleteLinkConfirm = document.getElementById("btnConfirmDeleteLinkConfirm");
let cardToDelete = null;

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

let currentFiltersList = []; // Array of { id: string, prop: string, op: string, val: string }

function loadFiltersForCurrentFilter() {
    try {
        const stored = localStorage.getItem(`creatorhub_adv_filters_${currentFilter}`);
        currentFiltersList = stored ? JSON.parse(stored) : [];
    } catch (e) {
        currentFiltersList = [];
    }
    updateFilterButtonState();
}

function saveFiltersForCurrentFilter() {
    localStorage.setItem(`creatorhub_adv_filters_${currentFilter}`, JSON.stringify(currentFiltersList));
}

function updateFilterButtonState() {
    const btnFilterList = document.getElementById("btnFilterList");
    if (btnFilterList) {
        if (currentFiltersList.length > 0) {
            btnFilterList.classList.add("active");
        } else {
            btnFilterList.classList.remove("active");
        }
    }
}

function getFilteredVideos() {
    return videos.filter(v => {
        const matchesSearch = v.title.toLowerCase().includes(searchQuery);
        
        let matchesTab = false;
        if (currentMenuRoute === "trash") {
            matchesTab = v.deleted === true;
        } else {
            const matchesFilter = currentFilter === "all" || v.status === currentFilter;
            matchesTab = matchesFilter && !v.deleted;
        }

        if (!matchesSearch || !matchesTab) {
            return false;
        }

        // Apply advanced rules filters
        for (const rule of currentFiltersList) {
            if (rule.active === false) {
                continue;
            }
            const isShorts = !!(v.title && v.title.startsWith('* '));
            const videoTags = v.tags || [];

            if (rule.prop === "format") {
                const targetVal = rule.val; // "shorts" or "regular"
                const videoVal = isShorts ? "shorts" : "regular";

                if (rule.op === "eq") {
                    if (videoVal !== targetVal) return false;
                } else if (rule.op === "neq") {
                    if (videoVal === targetVal) return false;
                }
            } else if (rule.prop === "tags") {
                if (rule.op === "contains") {
                    if (!videoTags.includes(rule.val)) return false;
                } else if (rule.op === "not_contains") {
                    if (videoTags.includes(rule.val)) return false;
                } else if (rule.op === "is_empty") {
                    if (videoTags.length > 0) return false;
                } else if (rule.op === "is_not_empty") {
                    if (videoTags.length === 0) return false;
                }
            }
        }

        return true;
    });
}

function saveSortForCurrentFilter(sortVal) {
    localStorage.setItem(getSortKey(), sortVal);
}

function renderFilterDropdown() {
    const filterDropdown = document.getElementById("filterDropdown");
    if (!filterDropdown) return;

    // Get all unique tags of videos in the current tab/filter
    const tabVideos = videos.filter(v => {
        if (currentMenuRoute === "trash") {
            return v.deleted === true;
        } else {
            const matchesFilter = currentFilter === "all" || v.status === currentFilter;
            return matchesFilter && !v.deleted;
        }
    });

    const uniqueTags = [];
    tabVideos.forEach(v => {
        if (v.tags && Array.isArray(v.tags)) {
            v.tags.forEach(tag => {
                const trimmed = tag.trim();
                if (trimmed && !uniqueTags.includes(trimmed)) {
                    uniqueTags.push(trimmed);
                }
            });
        }
    });
    uniqueTags.sort((a, b) => a.localeCompare(b));

    // HTML template
    let html = `
        <div class="filter-rules-container" id="filterRulesContainer">
    `;

    if (currentFiltersList.length === 0) {
        html += `
            <div style="font-size: 0.8rem; color: var(--ch-text-gray); padding: 8px; text-align: center;">
                Нет активных фильтров
            </div>
        `;
    } else {
        currentFiltersList.forEach((rule, index) => {
            html += `
                <div class="filter-rule-row" data-index="${index}" style="${rule.active === false ? 'opacity: 0.55;' : ''}">
                    <!-- Включение/выключение -->
                    <input type="checkbox" class="filter-rule-active-checkbox" ${rule.active !== false ? "checked" : ""} title="Включить/выключить фильтр" style="cursor: pointer; accent-color: var(--ch-purple); margin: 0; flex-shrink: 0; width: 14px; height: 14px;">
                    
                    <!-- Свойство -->
                    <select class="filter-rule-select select-prop" style="flex: 1.2;">
                        <option value="format" ${rule.prop === "format" ? "selected" : ""}>Формат</option>
                        <option value="tags" ${rule.prop === "tags" ? "selected" : ""}>Теги</option>
                    </select>
                    
                    <!-- Оператор -->
                    <select class="filter-rule-select select-op" style="flex: 1.5;">
            `;

            if (rule.prop === "format") {
                html += `
                    <option value="eq" ${rule.op === "eq" ? "selected" : ""}>равен</option>
                    <option value="neq" ${rule.op === "neq" ? "selected" : ""}>не равен</option>
                `;
            } else {
                html += `
                    <option value="contains" ${rule.op === "contains" ? "selected" : ""}>содержит</option>
                    <option value="not_contains" ${rule.op === "not_contains" ? "selected" : ""}>не содержит</option>
                    <option value="is_empty" ${rule.op === "is_empty" ? "selected" : ""}>пустой</option>
                    <option value="is_not_empty" ${rule.op === "is_not_empty" ? "selected" : ""}>не пустой</option>
                `;
            }

            html += `
                    </select>
                    
                    <!-- Значение -->
            `;

            const showVal = rule.op !== "is_empty" && rule.op !== "is_not_empty";
            if (showVal) {
                html += `
                    <select class="filter-rule-select select-val" style="flex: 1.8;">
                `;

                if (rule.prop === "format") {
                    html += `
                        <option value="shorts" ${rule.val === "shorts" ? "selected" : ""}>Shorts</option>
                        <option value="regular" ${rule.val === "regular" ? "selected" : ""}>Длинное видео</option>
                    `;
                } else {
                    if (uniqueTags.length === 0) {
                        html += `<option value="">(нет тегов)</option>`;
                    } else {
                        uniqueTags.forEach(tag => {
                            html += `<option value="${escapeHtml(tag)}" ${rule.val === tag ? "selected" : ""}>${escapeHtml(tag)}</option>`;
                        });
                    }
                }

                html += `
                    </select>
                `;
            } else {
                html += `
                    <div style="flex: 1.8;"></div>
                `;
            }

            html += `
                    <button class="btn-remove-rule" title="Удалить правило">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `;
        });
    }

    html += `
        </div>
        <div class="filter-dropdown-actions">
            <button class="btn-add-rule-btn" id="btnAddFilterRule">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Добавить фильтр
            </button>
            ${currentFiltersList.length > 0 ? `
                <button class="btn-clear-rules-btn" id="btnClearFilterRules">Сбросить все</button>
            ` : ""}
        </div>
    `;

    filterDropdown.innerHTML = html;

    // Add event listeners for dynamic changes
    const rows = filterDropdown.querySelectorAll(".filter-rule-row");
    rows.forEach(row => {
        const index = parseInt(row.dataset.index, 10);
        const rule = currentFiltersList[index];

        const toggleActive = row.querySelector(".filter-rule-active-checkbox");
        const selectProp = row.querySelector(".select-prop");
        const selectOp = row.querySelector(".select-op");
        const selectVal = row.querySelector(".select-val");
        const btnRemove = row.querySelector(".btn-remove-rule");

        toggleActive.addEventListener("change", (e) => {
            rule.active = e.target.checked;
            saveFiltersForCurrentFilter();
            updateFilterButtonState();
            renderVideosList();
            renderFilterDropdown();
        });

        selectProp.addEventListener("change", (e) => {
            const nextProp = e.target.value;
            rule.prop = nextProp;
            // Set defaults when property changes
            if (nextProp === "format") {
                rule.op = "eq";
                rule.val = "shorts";
            } else {
                rule.op = "contains";
                rule.val = uniqueTags.length > 0 ? uniqueTags[0] : "";
            }
            saveFiltersForCurrentFilter();
            updateFilterButtonState();
            renderVideosList();
            renderFilterDropdown();
        });

        if (selectOp) {
            selectOp.addEventListener("change", (e) => {
                const nextOp = e.target.value;
                rule.op = nextOp;
                // If operator became empty/not_empty, clear value
                if (nextOp === "is_empty" || nextOp === "is_not_empty") {
                    rule.val = "";
                } else if (!rule.val) {
                    if (rule.prop === "format") {
                        rule.val = "shorts";
                    } else {
                        rule.val = uniqueTags.length > 0 ? uniqueTags[0] : "";
                    }
                }
                saveFiltersForCurrentFilter();
                updateFilterButtonState();
                renderVideosList();
                renderFilterDropdown();
            });
        }

        if (selectVal) {
            selectVal.addEventListener("change", (e) => {
                rule.val = e.target.value;
                saveFiltersForCurrentFilter();
                updateFilterButtonState();
                renderVideosList();
            });
        }

        btnRemove.addEventListener("click", () => {
            currentFiltersList.splice(index, 1);
            saveFiltersForCurrentFilter();
            updateFilterButtonState();
            renderVideosList();
            renderFilterDropdown();
        });
    });

    const btnAddFilterRule = filterDropdown.querySelector("#btnAddFilterRule");
    btnAddFilterRule.addEventListener("click", () => {
        // Add default rule: tags is not empty, active: true
        currentFiltersList.push({
            id: Math.random().toString(36).substr(2, 9),
            prop: "tags",
            op: "is_not_empty",
            val: "",
            active: true
        });
        saveFiltersForCurrentFilter();
        updateFilterButtonState();
        renderVideosList();
        renderFilterDropdown();
    });

    const btnClearFilterRules = filterDropdown.querySelector("#btnClearFilterRules");
    if (btnClearFilterRules) {
        btnClearFilterRules.addEventListener("click", () => {
            currentFiltersList = [];
            saveFiltersForCurrentFilter();
            updateFilterButtonState();
            renderVideosList();
            renderFilterDropdown();
        });
    }
}

// Инициализация
document.addEventListener("DOMContentLoaded", () => {
    if (typeof loadTagConfigs === "function") {
        loadTagConfigs();
    }
    loadGlobalButtons();
    if (typeof initVideoDetailMobileBottomSheet === "function") {
        initVideoDetailMobileBottomSheet();
    }
    
    window.addEventListener("hashchange", handleHashRoute);
    handleHashRoute();

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
        updateCarouselScrollArrows();
    });

    const btnCarouselNext = document.getElementById("btnCarouselNext");
    if (btnCarouselNext) {
        btnCarouselNext.addEventListener("click", () => {
            const carousel = document.getElementById("videoButtonsContainer");
            if (carousel) {
                carousel.scrollBy({ left: 120, behavior: "smooth" });
            }
        });
    }
    const btnCarouselPrev = document.getElementById("btnCarouselPrev");
    if (btnCarouselPrev) {
        btnCarouselPrev.addEventListener("click", () => {
            const carousel = document.getElementById("videoButtonsContainer");
            if (carousel) {
                carousel.scrollBy({ left: -120, behavior: "smooth" });
            }
        });
    }
    const carouselEl = document.getElementById("videoButtonsContainer");
    if (carouselEl) {
        carouselEl.addEventListener("scroll", updateCarouselScrollArrows);
    }
    // Сортировка списка
    if (btnSortList) {
        btnSortList.addEventListener("click", (e) => {
            e.stopPropagation();
            if (sortDropdown.style.display === "none" || !sortDropdown.style.display) {
                // Adjust position dynamically depending on screen placement
                const btnRect = btnSortList.getBoundingClientRect();
                if (btnRect.left < window.innerWidth / 2) {
                    sortDropdown.style.left = "0";
                    sortDropdown.style.right = "auto";
                } else {
                    sortDropdown.style.left = "auto";
                    sortDropdown.style.right = "0";
                }
                sortDropdown.style.display = "flex";
                if (filterDropdown) filterDropdown.style.display = "none";
            } else {
                sortDropdown.style.display = "none";
            }
        });
    }

    // Фильтры списка
    const btnFilterList = document.getElementById("btnFilterList");
    const filterDropdown = document.getElementById("filterDropdown");
    
    if (btnFilterList) {
        btnFilterList.addEventListener("click", (e) => {
            e.stopPropagation();
            if (filterDropdown.style.display === "none" || !filterDropdown.style.display) {
                // Adjust position dynamically depending on screen placement
                const btnRect = btnFilterList.getBoundingClientRect();
                if (btnRect.left < window.innerWidth / 2) {
                    filterDropdown.style.left = "0";
                    filterDropdown.style.right = "auto";
                } else {
                    filterDropdown.style.left = "auto";
                    filterDropdown.style.right = "0";
                }
                renderFilterDropdown();
                filterDropdown.style.display = "flex";
                if (sortDropdown) sortDropdown.style.display = "none";
            } else {
                filterDropdown.style.display = "none";
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

    // Закрытие дропдауна сортировки и фильтрации при клике вне их
    document.addEventListener("click", (e) => {
        if (sortDropdown && btnSortList && !btnSortList.contains(e.target) && !sortDropdown.contains(e.target)) {
            if (document.body.contains(e.target)) {
                sortDropdown.style.display = "none";
            }
        }
        if (filterDropdown && btnFilterList && !btnFilterList.contains(e.target) && !filterDropdown.contains(e.target)) {
            if (document.body.contains(e.target)) {
                filterDropdown.style.display = "none";
            }
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



    // Слушатели поиска и фильтров
    videoSearch.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderVideosList();
    });

    filterButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const filterVal = btn.dataset.filter;
            if (currentFilter !== filterVal) {
                window.location.hash = filterVal;
            }
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
            updateSidebarStatusPill(newStatus);
            updateDetailThumbnailPlaceholder();

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

    // Клик по заголовку в сайдбаре для быстрого редактирования
    if (detailTitle) {
        detailTitle.addEventListener("click", () => {
            if (!selectedVideo) return;
            if (detailTitle.getAttribute("contenteditable") === "true") return; // уже редактируется

            const oldTitle = selectedVideo.title || "";
            detailTitle.textContent = oldTitle;
            detailTitle.setAttribute("contenteditable", "true");
            detailTitle.focus();

            // Выделяем весь текст в contenteditable
            const range = document.createRange();
            range.selectNodeContents(detailTitle);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            let committed = false;
            async function commitRename() {
                if (committed) return;
                committed = true;

                detailTitle.removeAttribute("contenteditable");
                const newTitle = detailTitle.textContent.trim() || oldTitle;
                detailTitle.innerHTML = formatVideoTitle(newTitle);

                if (newTitle !== oldTitle) {
                    selectedVideo.title = newTitle;
                    
                    if (currentUid) {
                        try {
                            await updateDoc(doc(db, "users", currentUid, "videos", selectedVideo.id), {
                                title: newTitle
                            });
                        } catch (err) {
                            console.error("Ошибка при обновлении названия в Firestore:", err);
                        }
                    } else {
                        const v = videos.find(video => video.id === selectedVideo.id);
                        if (v) {
                            v.title = newTitle;
                            localStorage.setItem("local_videos", JSON.stringify(videos));
                            renderVideosList();
                        }
                    }
                }
            }

            // Используем { once: true } чтобы избежать дублирования
            detailTitle.addEventListener("blur", commitRename, { once: true });
            
            detailTitle.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault(); // Запрещаем перенос строки
                    detailTitle.blur();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    detailTitle.innerHTML = formatVideoTitle(oldTitle);
                    detailTitle.blur();
                }
            });
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

    // Кнопка очистки даты публикации
    const btnClearDueDate = document.getElementById("btnClearDueDate");
    if (btnClearDueDate) {
        btnClearDueDate.addEventListener("click", (e) => {
            e.stopPropagation();
            clearDueDate();
        });
    }

    // Скрытие календаря при клике в любое другое место
    document.addEventListener("click", (e) => {
        if (dueDateDropdown && btnDueDate && !btnDueDate.contains(e.target) && !dueDateDropdown.contains(e.target) && (!btnClearDueDate || !btnClearDueDate.contains(e.target))) {
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

    if (referencesContent) {
        // Сохранение референсов при изменении
        referencesContent.addEventListener("input", () => {
            if (!selectedVideo) return;
            normalizeEditorContent(referencesContent);
            selectedVideo.references = referencesContent.innerHTML;
            saveVideoData("references", selectedVideo.references);
        });

        // Замена дефисов на сепаратор при нажатии Enter, защита от удаления при Backspace и навигация ArrowUp/ArrowDown
        referencesContent.addEventListener("keydown", (e) => {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            
            if (range.startContainer === referencesContent) return;
            
            // Находим элемент строки — непосредственного потомка referencesContent
            let lineElement = range.startContainer;
            while (lineElement && lineElement.parentNode && lineElement.parentNode !== referencesContent) {
                lineElement = lineElement.parentNode;
            }
            
            if (!lineElement) return;

            if (e.key === "Enter") {
                const blockText = lineElement.textContent || "";
                const cleanText = blockText.replace(/\u200B/g, '').trim();
                
                // Проверяем, состоит ли строка ровно из 2 или более знаков "-"
                if (/^--+$/.test(cleanText)) {
                    e.preventDefault();
                    
                    // Создаем минималистичный сепаратор
                    const hr = document.createElement("hr");
                    hr.setAttribute("contenteditable", "false");
                    hr.className = "references-separator";
                    
                    referencesContent.replaceChild(hr, lineElement);
                    
                    // Обеспечиваем наличие редактируемых блоков вокруг сепаратора
                    ensureEditableSiblings(hr, referencesContent);
                    
                    // Переносим курсор в новый блок после сепаратора
                    if (hr.nextSibling) {
                        focusOnBlock(hr.nextSibling);
                    }
                    
                    // Инициируем сохранение изменений
                    referencesContent.dispatchEvent(new Event("input"));
                }
            } else if (e.key === "Backspace") {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    // Проверяем, стоит ли курсор в самом начале строки (offset === 0)
                    if (range.startOffset === 0) {
                        const prev = lineElement.previousSibling;
                        // Если предыдущий элемент — плашка видео
                        if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.classList.contains("yt-link-card")) {
                            e.preventDefault();
                            
                            const blockText = lineElement.textContent || "";
                            const cleanText = blockText.replace(/\u200B/g, '').trim();
                            
                            // Если строка пустая, удаляем её и переносим курсор выше плашки
                            if (cleanText === "") {
                                let target = prev.previousSibling;
                                while (target && target.nodeType === Node.ELEMENT_NODE && target.getAttribute("contenteditable") === "false") {
                                    target = target.previousSibling;
                                }
                                
                                lineElement.parentNode.removeChild(lineElement);
                                
                                if (target) {
                                    focusAtEndOfBlock(target);
                                }
                                
                                referencesContent.dispatchEvent(new Event("input"));
                            } else {
                                // Если строка не пустая, просто переносим фокус перед видео
                                let target = prev.previousSibling;
                                while (target && target.nodeType === Node.ELEMENT_NODE && target.getAttribute("contenteditable") === "false") {
                                    target = target.previousSibling;
                                }
                                if (target) {
                                    focusAtEndOfBlock(target);
                                }
                            }
                        } else if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.classList.contains("references-separator")) {
                            // Для сепараторов сохраняем стандартное удаление и поведение переноса
                            const blockText = lineElement.textContent || "";
                            const cleanText = blockText.replace(/\u200B/g, '').trim();
                            
                            if (cleanText === "") {
                                e.preventDefault();
                                let target = prev.previousSibling;
                                while (target && target.nodeType === Node.ELEMENT_NODE && target.getAttribute("contenteditable") === "false") {
                                    target = target.previousSibling;
                                }
                                
                                lineElement.parentNode.removeChild(lineElement);
                                
                                if (target) {
                                    focusAtEndOfBlock(target);
                                }
                                
                                referencesContent.dispatchEvent(new Event("input"));
                            }
                        }
                    }
                }
            } else if (e.key === "ArrowDown") {
                let next = lineElement.nextSibling;
                // Если следующий элемент — нередактируемый блок (или последовательность блоков)
                if (next && next.nodeType === Node.ELEMENT_NODE && next.getAttribute("contenteditable") === "false") {
                    e.preventDefault();
                    
                    // Ищем первый редактируемый блок после нередактируемых элементов
                    let target = next;
                    while (target && target.nodeType === Node.ELEMENT_NODE && target.getAttribute("contenteditable") === "false") {
                        target = target.nextSibling;
                    }
                    
                    if (!target) {
                        // Если в конце ничего нет, создаем пустую редактируемую строку
                        target = document.createElement("div");
                        target.innerHTML = "<br>";
                        referencesContent.appendChild(target);
                    }
                    
                    focusOnBlock(target);
                }
            } else if (e.key === "ArrowUp") {
                let prev = lineElement.previousSibling;
                // Если предыдущий элемент — нередактируемый блок (или последовательность блоков)
                if (prev && prev.nodeType === Node.ELEMENT_NODE && prev.getAttribute("contenteditable") === "false") {
                    e.preventDefault();
                    
                    // Ищем первый редактируемый блок перед нередактируемыми элементами
                    let target = prev;
                    while (target && target.nodeType === Node.ELEMENT_NODE && target.getAttribute("contenteditable") === "false") {
                        target = target.previousSibling;
                    }
                    
                    if (!target) {
                        // Если в начале ничего нет, создаем пустую редактируемую строку
                        target = document.createElement("div");
                        target.innerHTML = "<br>";
                        referencesContent.insertBefore(target, prev);
                    }
                    
                    focusAtEndOfBlock(target);
                }
            }
        });

        // Просмотр картинок в полный размер (лайтбокс) при клике, а также переход по ссылкам
        referencesContent.addEventListener("click", (e) => {
            const deleteBtn = e.target.closest(".yt-link-card-delete");
            if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                const card = deleteBtn.closest(".yt-link-card");
                if (card) {
                    cardToDelete = card;
                    const videoTitle = card.querySelector(".yt-link-card-title")?.textContent || "видео";
                    document.getElementById("confirmDeleteLinkTitle").innerText = "Удалить ссылку?";
                    document.getElementById("confirmDeleteLinkDesc").innerHTML = `Вы действительно хотите удалить ссылку на видео <strong style="color: var(--ch-text-dark);">${escapeHtml(videoTitle)}</strong> из описания?`;
                    if (confirmDeleteLinkModal) {
                        confirmDeleteLinkModal.style.display = "flex";
                    }
                }
                return;
            }

            const cardLink = e.target.closest(".yt-link-card");
            if (cardLink) {
                e.preventDefault();
                window.open(cardLink.href, "_blank");
                return;
            }

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
            const text = clipboardData.getData("text/plain") || "";
            const trimmedText = text.trim();
            const isSingleUrl = /^https?:\/\/[^\s]+$/.test(trimmedText);
            const youtubeId = isSingleUrl ? parseYouTubeId(trimmedText) : null;

            if (youtubeId) {
                const tempId = "yt-card-loading-" + Date.now();
                const loadingHtml = `<span id="${tempId}" class="yt-card-loading-placeholder" style="color: var(--ch-text-gray); font-style: italic;">Загрузка превью видео...</span>`;
                document.execCommand("insertHTML", false, loadingHtml);
                
                const originalUrl = trimmedText;

                getYouTubeCardData(youtubeId).then(data => {
                    const placeholder = document.getElementById(tempId);
                    if (placeholder) {
                        const card = document.createElement("a");
                        card.href = originalUrl;
                        card.target = "_blank";
                        card.contentEditable = "false";
                        card.className = "yt-link-card";
                        
                        card.innerHTML = `
                            <img class="yt-link-card-thumbnail" src="${data.thumbnail}" alt="Thumbnail">
                            <div class="yt-link-card-info">
                                <div class="yt-link-card-title">${escapeHtml(data.title)}</div>
                                <div class="yt-link-card-url">${escapeHtml(originalUrl)}</div>
                            </div>
                        `;
                        
                        // Находим элемент строки — непосредственного потомка referencesContent
                        let lineElement = placeholder;
                        while (lineElement && lineElement.parentNode && lineElement.parentNode !== referencesContent) {
                            lineElement = lineElement.parentNode;
                        }
                        
                        const lineText = lineElement ? lineElement.textContent.replace(/\u200B/g, '').trim() : "";
                        const placeholderText = placeholder.textContent.replace(/\u200B/g, '').trim();
                        
                        if (lineElement && lineText === placeholderText) {
                            // Если плейсхолдер — единственное содержимое строки, заменяем всю строку
                            referencesContent.replaceChild(card, lineElement);
                        } else {
                            // Иначе заменяем только плейсхолдер
                            placeholder.parentNode.replaceChild(card, placeholder);
                        }
                        
                        // Обеспечиваем наличие редактируемых блоков вокруг плашки
                        ensureEditableSiblings(card, referencesContent);
                        
                        // Переносим фокус на блок после плашки
                        if (card.nextSibling) {
                            focusOnBlock(card.nextSibling);
                        }
                        
                        // Сохраняем изменения
                        selectedVideo.references = referencesContent.innerHTML;
                        saveVideoData("references", selectedVideo.references);
                    }
                });
                return;
            }

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



    // Сохранение ссылки на Видео в настройках
    if (settingVideoLink) {
        settingVideoLink.addEventListener("input", (e) => {
            if (!selectedVideo) return;
            const newLink = e.target.value;
            selectedVideo.videoLink = newLink;
            saveVideoData("videoLink", newLink);
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

    // Маршрутизация по хэшу и навигация удалены, так как всё перенесено на одну страницу

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

    // Инициализация модального окна редактирования задач CreatorHub
    initChTaskEditModal();

    // Клавиатурная навигация по списку видео стрелочками (вверх/вниз, для сетки также влево/вправо)
    let activeNavigationPanel = 'list'; // 'list' или 'sidebar'

    document.addEventListener('click', (e) => {
        if (e.target.closest('#detailSidebar')) {
            activeNavigationPanel = 'sidebar';
        } else {
            activeNavigationPanel = 'list';
        }
    });

    document.addEventListener('keydown', (e) => {
        // Пропускаем, если фокус на редактируемых текстовых полях/элементах
        const activeEl = document.activeElement;
        if (activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable ||
            activeEl.closest('[contenteditable="true"]')
        )) {
            return;
        }

        // Пропускаем, если открыто какое-либо модальное окно или dropdown меню опций
        const isModalOpen = Array.from(document.querySelectorAll('.confirm-modal-overlay, .settings-modal-overlay'))
            .some(modal => modal.style.display !== 'none');
        if (isModalOpen) return;

        const actionsDropdown = document.getElementById("videoActionsDropdown");
        if (actionsDropdown && actionsDropdown.style.display !== "none") return;

        const sortDropdown = document.getElementById("sortDropdown");
        const periodDropdown = document.getElementById("periodDropdown");
        if (sortDropdown && sortDropdown.style.display === "flex") return;
        if (periodDropdown && periodDropdown.style.display === "flex") return;

        const isArrowUp = e.key === 'ArrowUp';
        const isArrowDown = e.key === 'ArrowDown';
        const isArrowLeft = e.key === 'ArrowLeft';
        const isArrowRight = e.key === 'ArrowRight';

        if (!isArrowUp && !isArrowDown && !isArrowLeft && !isArrowRight) {
            return;
        }

        // Работает только если активная панель - это список видео слева
        if (activeNavigationPanel !== 'list') {
            return;
        }

        const container = document.getElementById("videosListContainer");
        if (!container) return;

        const cards = Array.from(container.querySelectorAll('.video-card'));
        if (cards.length === 0) return;

        // Блокируем стандартную прокрутку страницы от стрелок
        e.preventDefault();

        let currentIndex = cards.findIndex(card => card.classList.contains('active'));
        let nextCard = null;

        if (currentViewMode === 'grid') {
            if (isArrowRight) {
                const nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, cards.length - 1);
                nextCard = cards[nextIndex];
            } else if (isArrowLeft) {
                const prevIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
                nextCard = cards[prevIndex];
            } else if (isArrowDown || isArrowUp) {
                if (currentIndex === -1) {
                    nextCard = cards[0];
                } else {
                    const activeCard = cards[currentIndex];
                    const activeRect = activeCard.getBoundingClientRect();
                    const activeCenterX = activeRect.left + activeRect.width / 2;

                    if (isArrowDown) {
                        const candidates = cards.filter(card => {
                            const rect = card.getBoundingClientRect();
                            return rect.top >= activeRect.bottom - 10;
                        });
                        if (candidates.length > 0) {
                            const minTop = Math.min(...candidates.map(c => c.getBoundingClientRect().top));
                            const rowCandidates = candidates.filter(c => Math.abs(c.getBoundingClientRect().top - minTop) < 15);
                            let bestCard = rowCandidates[0];
                            let minDiffX = Math.abs((bestCard.getBoundingClientRect().left + bestCard.getBoundingClientRect().width / 2) - activeCenterX);
                            for (const c of rowCandidates) {
                                const cRect = c.getBoundingClientRect();
                                const cCenterX = cRect.left + cRect.width / 2;
                                const diffX = Math.abs(cCenterX - activeCenterX);
                                if (diffX < minDiffX) {
                                    minDiffX = diffX;
                                    bestCard = c;
                                }
                            }
                            nextCard = bestCard;
                        }
                    } else if (isArrowUp) {
                        const candidates = cards.filter(card => {
                            const rect = card.getBoundingClientRect();
                            return rect.bottom <= activeRect.top + 10;
                        });
                        if (candidates.length > 0) {
                            const maxBottom = Math.max(...candidates.map(c => c.getBoundingClientRect().bottom));
                            const rowCandidates = candidates.filter(c => Math.abs(c.getBoundingClientRect().bottom - maxBottom) < 15);
                            let bestCard = rowCandidates[0];
                            let minDiffX = Math.abs((bestCard.getBoundingClientRect().left + bestCard.getBoundingClientRect().width / 2) - activeCenterX);
                            for (const c of rowCandidates) {
                                const cRect = c.getBoundingClientRect();
                                const cCenterX = cRect.left + cRect.width / 2;
                                const diffX = Math.abs(cCenterX - activeCenterX);
                                if (diffX < minDiffX) {
                                    minDiffX = diffX;
                                    bestCard = c;
                                }
                            }
                            nextCard = bestCard;
                        }
                    }
                }
            }
        } else {
            // Обычный список (list view) - переходим по вертикали
            if (isArrowDown) {
                const nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, cards.length - 1);
                nextCard = cards[nextIndex];
            } else if (isArrowUp) {
                const prevIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
                nextCard = cards[prevIndex];
            }
        }

        if (nextCard) {
            const nextId = nextCard.dataset.id;
            selectVideoItem(nextId);
            nextCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
});

function handleHashRoute() {
    const hash = window.location.hash.replace("#", "");
    const validFilters = ["idea", "in_progress", "editing", "published", "trash"];
    
    if (validFilters.includes(hash)) {
        currentFilter = hash;
    } else {
        currentFilter = "idea";
        window.location.hash = "idea";
        return;
    }
    
    currentMenuRoute = (currentFilter === "trash" ? "trash" : "videos");
    
    // Update button states
    filterButtons.forEach(btn => {
        if (btn.dataset.filter === currentFilter) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    // Восстанавливаем сохраненный вид (список/сетка) для текущей вкладки
    const savedTabMode = localStorage.getItem(`creatorhub_view_mode_${currentFilter}`) || localStorage.getItem("creatorhub_view_mode") || "list";
    currentViewMode = savedTabMode;
    
    loadSortForCurrentFilter();
    loadFiltersForCurrentFilter();
    updateViewForRoute();
}

// Функция обновления интерфейса в зависимости от текущего фильтра
function updateViewForRoute() {
    const trashNoticeBanner = document.getElementById("trashNoticeBanner");
    const sectionTitle = document.querySelector(".videos-section h2");
    const mainContent = document.querySelector(".main-content");
    const detailSidebarResizer = document.getElementById("detailSidebarResizer");
    const detailSidebar = document.getElementById("detailSidebar");

    if (mainContent) mainContent.style.display = "flex";
    if (detailSidebarResizer) {
        detailSidebarResizer.style.display = window.innerWidth <= 900 ? "none" : "block";
    }
    if (detailSidebar) {
        detailSidebar.style.display = window.innerWidth <= 900 ? "none" : "flex";
    }

    if (currentFilter === "trash") {
        if (trashNoticeBanner) trashNoticeBanner.style.display = "flex";
        if (sectionTitle) {
            sectionTitle.innerHTML = `Корзина`;
        }
    } else {
        if (trashNoticeBanner) trashNoticeBanner.style.display = "none";
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
    const filtered = getFilteredVideos();
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
    } else if (currentSort === "tagCountDesc") {
        videos.sort((a, b) => {
            const countA = (a.tags && Array.isArray(a.tags)) ? a.tags.length : 0;
            const countB = (b.tags && Array.isArray(b.tags)) ? b.tags.length : 0;
            return countB - countA;
        });
    } else if (currentSort === "tagCountAsc") {
        videos.sort((a, b) => {
            const countA = (a.tags && Array.isArray(a.tags)) ? a.tags.length : 0;
            const countB = (b.tags && Array.isArray(b.tags)) ? b.tags.length : 0;
            return countA - countB;
        });
    } else if (currentSort === "tagAlphabeticalAZ") {
        videos.sort((a, b) => {
            const tagA = (a.tags && Array.isArray(a.tags) && a.tags.length > 0) ? a.tags[0].toLowerCase() : "";
            const tagB = (b.tags && Array.isArray(b.tags) && b.tags.length > 0) ? b.tags[0].toLowerCase() : "";
            if (!tagA && !tagB) return 0;
            if (!tagA) return 1;
            if (!tagB) return -1;
            return tagA.localeCompare(tagB);
        });
    } else if (currentSort === "tagAlphabeticalZA") {
        videos.sort((a, b) => {
            const tagA = (a.tags && Array.isArray(a.tags) && a.tags.length > 0) ? a.tags[0].toLowerCase() : "";
            const tagB = (b.tags && Array.isArray(b.tags) && b.tags.length > 0) ? b.tags[0].toLowerCase() : "";
            if (!tagA && !tagB) return 0;
            if (!tagA) return 1;
            if (!tagB) return -1;
            return tagB.localeCompare(tagA);
        });
    }

    // Обновляем статистические счетчики
    updateStatsCounters();
    updateTabCounts();

    const filtered = getFilteredVideos();

    if (filtered.length === 0) {
        videosListContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--ch-text-gray); grid-column: 1 / -1; width: 100%;">Видео не найдены</div>`;
        return;
    }

    function createVideoCard(v) {
        const card = document.createElement("div");
        card.className = `video-card ${selectedVideo && selectedVideo.id === v.id ? 'active' : ''} ${(v.title && v.title.startsWith('* ')) ? 'is-shorts' : ''}`;
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
        
        let fallbackThumbnailSrc = 'idea-bulb-128x128.png';
        const ytId = parseYouTubeId(v.videoLink);
        if (ytId) {
            fallbackThumbnailSrc = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
        }

        const isIdeaPlaceholder = (v.status || "idea") === "idea" && (!v.thumbnail || v.thumbnail.includes("placehold.co"));
        const thumbnailHtml = isIdeaPlaceholder ? `
            <div class="video-thumbnail-placeholder idea-placeholder">
                <img src="idea-bulb-128x128.png" alt="Идея" class="idea-bulb-icon" draggable="false">
            </div>
        ` : `
            <img src="${v.thumbnail}" alt="Превью" class="video-thumbnail-mini" draggable="false" onerror="this.onerror=null; this.src='${fallbackThumbnailSrc}';">
        `;
        
        if (v.deleted) {
            card.innerHTML = `
                <div class="video-card-left">
                    <div class="video-thumbnail-container">
                        <div class="video-thumbnail-inner">
                            ${thumbnailHtml}
                            ${(v.title && v.title.startsWith('* ')) ? `<div class="shorts-badge">${SHORTS_ICON_SVG}</div>` : ''}
                        </div>
                    </div>
                    <div class="video-info-block">
                        <h4 class="video-title">${formatVideoTitle(v.title)}</h4>
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
                    <div class="video-thumbnail-container">
                        <div class="video-thumbnail-inner">
                            ${thumbnailHtml}
                            ${(v.title && v.title.startsWith('* ')) ? `<div class="shorts-badge">${SHORTS_ICON_SVG}</div>` : ''}
                        </div>
                    </div>
                    <div class="video-info-block">
                        <h4 class="video-title">${formatVideoTitle(v.title)}</h4>
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
                        ${(() => {
                            const formattedDate = formatDateToRussian(v.publishDate);
                            return formattedDate && formattedDate !== "не запланировано" ? `<span class="video-date">${formattedDate}</span>` : "";
                        })()}
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
                renameVideoInSidebar(v.id);
            });

            // Правый клик (контекстное меню)
            card.addEventListener("contextmenu", (e) => {
                showVideoMenu(e, v.id);
            });
        }

        return card;
    }

    if (currentFilter === "all" && currentMenuRoute !== "trash") {
        const statuses = [
            { id: "idea", label: "Идеи" },
            { id: "in_progress", label: "Черновик" },
            { id: "editing", label: "В процессе" },
            { id: "published", label: "Опубликовано" }
        ];

        statuses.forEach(statusObj => {
            const statusFiltered = filtered.filter(v => (v.status || "idea") === statusObj.id);
            if (statusFiltered.length > 0) {
                const header = document.createElement("div");
                header.className = "video-group-title";
                header.textContent = statusObj.label;
                videosListContainer.appendChild(header);

                statusFiltered.forEach(v => {
                    videosListContainer.appendChild(createVideoCard(v));
                });
            }
        });
    } else {
        filtered.forEach(v => {
            videosListContainer.appendChild(createVideoCard(v));
        });
    }

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
    
    updateDetailThumbnailPlaceholder();
    
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
                Картинка видео
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
                    `<button class="confirm-btn-delete" id="btn-delete-icon" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Удалить картинку</button>` : 
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

    // Обновляем класс shorts для обложки в сайдбаре
    const detailThumbnailWrapper = document.querySelector(".detail-thumbnail-wrapper");
    const detailShortsBadge = document.getElementById("detailShortsBadge");
    if (detailThumbnailWrapper) {
        if (selectedVideo.title && selectedVideo.title.startsWith("* ")) {
            detailThumbnailWrapper.classList.add("is-shorts");
            if (detailShortsBadge) {
                detailShortsBadge.innerHTML = SHORTS_ICON_SVG;
                detailShortsBadge.style.display = "flex";
            }
        } else {
            detailThumbnailWrapper.classList.remove("is-shorts");
            if (detailShortsBadge) {
                detailShortsBadge.style.display = "none";
                detailShortsBadge.innerHTML = "";
            }
        }
    }

    // Заполнение детального вида
    updateDetailThumbnailPlaceholder();
    detailTitle.innerHTML = formatVideoTitle(selectedVideo.title);
    
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
    updateSidebarStatusPill(selectedVideo.status || "idea");

    // Вкладка: Информация
    if (infoDescription && document.activeElement !== infoDescription) {
        infoDescription.value = selectedVideo.description || "";
    }
    if (infoDescriptionViewer) {
        updateDescriptionViewer(selectedVideo.description);
        if (infoDescription) infoDescription.style.display = "none";
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
    const btnClearDueDate = document.getElementById("btnClearDueDate");
    if (btnClearDueDate) {
        btnClearDueDate.style.display = selectedVideo.publishDate ? "flex" : "none";
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
        normalizeEditorContent(referencesContent);
    }

    // Вкладка: Настройки
    if (settingVideoLink && document.activeElement !== settingVideoLink) {
        settingVideoLink.value = selectedVideo.videoLink || "";
    }

    migrateVideosData(videos);
    renderSelectedVideoButtons();

    // Обновляем состояние кнопок
    updateNotionButtonState();

    if (typeof initTooltips === "function") {
        initTooltips();
    }

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

    if (currentUid) {
        ensureVideoSection(selectedVideo);
    } else {
        renderLocalTasks();
    }
}

function updateDetailThumbnailPlaceholder() {
    if (!selectedVideo) return;
    const detailImage = document.getElementById("detailImage");
    const detailImagePlaceholder = document.getElementById("detailImagePlaceholder");
    
    const isDetailIdeaPlaceholder = (selectedVideo.status || "idea") === "idea" && (!selectedVideo.thumbnail || selectedVideo.thumbnail.includes("placehold.co"));
    
    if (isDetailIdeaPlaceholder) {
        if (detailImage) detailImage.style.display = "none";
        if (detailImagePlaceholder) detailImagePlaceholder.style.display = "flex";
    } else {
        if (detailImage) {
            detailImage.style.display = "block";
            detailImage.src = selectedVideo.thumbnail;
            detailImage.onerror = () => {
                detailImage.onerror = null;
                const ytId = parseYouTubeId(selectedVideo.videoLink);
                if (ytId) {
                    detailImage.src = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
                } else {
                    detailImage.style.display = "none";
                    if (detailImagePlaceholder) detailImagePlaceholder.style.display = "flex";
                }
            };
        }
        if (detailImagePlaceholder) detailImagePlaceholder.style.display = "none";
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
        // Загрузка глобальных кнопок пользователя из Firestore
        getDoc(doc(db, 'users', currentUid)).then((docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();
                if (userData && userData.globalButtons && Array.isArray(userData.globalButtons)) {
                    userData.globalButtons.forEach(fireBtn => {
                        const localIdx = globalButtons.findIndex(b => b.id === fireBtn.id);
                        if (localIdx >= 0) {
                            globalButtons[localIdx].name = fireBtn.name;
                        } else {
                            globalButtons.push(fireBtn);
                        }
                    });
                    localStorage.setItem("creatorhub_global_buttons", JSON.stringify(globalButtons));
                    recoverMissingGlobalButtons();
                    renderSelectedVideoButtons();
                    updateNotionButtonState();
                } else {
                    updateDoc(doc(db, "users", currentUid), {
                        globalButtons: globalButtons
                    }).catch(err => console.error("Error seeding Firestore globalButtons:", err));
                }
            }
        }).catch((err) => {
            console.error("Error loading global buttons from Firestore:", err);
        });

        // Подписка на проекты
        const qProj = query(collection(db, 'users', currentUid, 'projects'));
        if (unsubscribeProjects) unsubscribeProjects();
        unsubscribeProjects = onSnapshot(qProj, (snapshot) => {
            projectsList = [];
            snapshot.forEach(docSnap => {
                projectsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            const ytProj = projectsList.find(p => p.name && p.name.toLowerCase() === 'youtube');
            if (ytProj) {
                youtubeProjectId = ytProj.id;
            }
        });

        // Подписка на разделы
        const qSec = query(collection(db, 'users', currentUid, 'sections'));
        if (unsubscribeSections) unsubscribeSections();
        unsubscribeSections = onSnapshot(qSec, (snapshot) => {
            sectionsList = [];
            snapshot.forEach(docSnap => {
                sectionsList.push({ id: docSnap.id, ...docSnap.data() });
            });
            if (selectedVideo) {
                ensureVideoSection(selectedVideo);
            }
        });

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
            
            const filtered = getFilteredVideos();
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
        if (unsubscribeProjects) { unsubscribeProjects(); unsubscribeProjects = null; }
        if (unsubscribeSections) { unsubscribeSections(); unsubscribeSections = null; }
        if (unsubscribeTasks) { unsubscribeTasks(); unsubscribeTasks = null; }
        youtubeProjectId = null;
        videoSectionId = null;
        projectsList = [];
        sectionsList = [];
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
        
        const filtered = getFilteredVideos();
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
    
    const detailThumbnailWrapper = document.querySelector(".detail-thumbnail-wrapper");
    if (detailThumbnailWrapper) {
        detailThumbnailWrapper.classList.remove("is-shorts");
    }
    const detailShortsBadge = document.getElementById("detailShortsBadge");
    if (detailShortsBadge) {
        detailShortsBadge.style.display = "none";
        detailShortsBadge.innerHTML = "";
    }

    const btnChangeThumbnail = document.getElementById("btnChangeThumbnail");
    if (btnChangeThumbnail) {
        btnChangeThumbnail.style.display = "none";
    }
    if (detailStatusSelect) {
        detailStatusSelect.value = "idea";
    }
    detailStatusDot.className = "status-dot";
    updateSidebarStatusPill("idea");
    if (infoDescription) infoDescription.value = "";
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
    const btnClearDueDate = document.getElementById("btnClearDueDate");
    if (btnClearDueDate) {
        btnClearDueDate.style.display = "none";
    }
    if (referencesContent) referencesContent.innerHTML = "";
    if (settingVideoLink) settingVideoLink.value = "";
    renderSelectedVideoButtons();
    updateNotionButtonState();

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
    if (unsubscribeTasks) {
        unsubscribeTasks();
        unsubscribeTasks = null;
    }
}

// === Создание нового видео ===
async function addVideo() {
    const minOrder = videos.length > 0 ? Math.min(...videos.map(v => v.order || 0)) : 0;
    const defaultStatus = currentFilter !== "all" ? currentFilter : "idea";
    let statusText = "Идея";
    if (defaultStatus === "in_progress") statusText = "Черновик";
    else if (defaultStatus === "editing") statusText = "В процессе";
    else if (defaultStatus === "published") statusText = "Опубликовано";

    const newVideoData = {
        title: "Новое видео",
        status: defaultStatus,
        statusText: statusText,
        tags: [],
        date: "не запланировано",
        dateLabel: "не запланировано",
        publishDate: "",
        order: minOrder - 1000,
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
            renameVideoInSidebar(docRef.id);
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
        renameVideoInSidebar(id);
    }
}

// === Переименование видео в сайдбаре ===
function renameVideoInSidebar(id) {
    selectVideoItem(id);
    setTimeout(() => {
        if (detailTitle) {
            detailTitle.click();
        }
    }, 150);
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
        renameVideoInSidebar(activeMenuVideoId);
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

// Обработчики для модального окна подтверждения удаления ссылки/карточки из описания
if (confirmDeleteLinkModal) {
    btnConfirmDeleteLinkCancel.addEventListener("click", () => {
        confirmDeleteLinkModal.style.display = "none";
        cardToDelete = null;
    });

    btnConfirmDeleteLinkConfirm.addEventListener("click", () => {
        if (cardToDelete) {
            const parent = cardToDelete.parentNode;
            cardToDelete.parentNode.removeChild(cardToDelete);
            
            // Если после удаления карточки родительский блок остался пустым, нормализуем его
            if (parent && parent.textContent.trim() === "" && parent.innerHTML.trim() === "") {
                parent.innerHTML = "<br>";
            }
            
            normalizeEditorContent(referencesContent);
            
            selectedVideo.references = referencesContent.innerHTML;
            saveVideoData("references", selectedVideo.references);
        }
        confirmDeleteLinkModal.style.display = "none";
        cardToDelete = null;
    });

    confirmDeleteLinkModal.addEventListener("click", (e) => {
        if (e.target === confirmDeleteLinkModal) {
            confirmDeleteLinkModal.style.display = "none";
            cardToDelete = null;
        }
    });
}

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
            updateSidebarStatusPill(newStatus);
            updateDetailThumbnailPlaceholder();
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

function getYouTubeId(url) {
    if (!url) return null;
    try {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return match[2];
        }
    } catch (e) {
        console.error(e);
    }
    return null;
}

// === ГЛОБАЛЬНАЯ БАЗА ПОЛЬЗОВАТЕЛЬСКИХ КНОПОК ===
let globalButtons = [];

function loadGlobalButtons() {
    try {
        const stored = localStorage.getItem("creatorhub_global_buttons");
        if (stored) {
            globalButtons = JSON.parse(stored);
        } else {
            // Seed default buttons
            globalButtons = [
                { id: "gb_notion", name: "Notion" },
                { id: "gb_board", name: "Доска" },
                { id: "gb_script", name: "Сценарий" },
                { id: "gb_figma", name: "Figma" }
            ];
            saveGlobalButtons();
        }

        // Self-healing: recover any missing global buttons referenced in videos
        recoverMissingGlobalButtons();

    } catch (e) {
        console.error("Error loading global buttons", e);
    }
}

function recoverMissingGlobalButtons() {
    let changed = false;
    if (Array.isArray(videos)) {
        videos.forEach(v => {
            if (v.buttons && Array.isArray(v.buttons)) {
                v.buttons.forEach(vb => {
                    const exists = globalButtons.some(gb => gb.id === vb.buttonId);
                    if (!exists) {
                        let name = "Кнопка";
                        if (vb.buttonId === "gb_notion") name = "Notion";
                        else if (vb.buttonId === "gb_board") name = "Доска";
                        else if (vb.buttonId === "gb_script") name = "Сценарий";
                        else if (vb.buttonId === "gb_figma") name = "Figma";
                        else {
                            const cleanId = vb.buttonId.replace("gb_", "");
                            name = cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
                        }
                        globalButtons.push({
                            id: vb.buttonId,
                            name: name
                        });
                        changed = true;
                    }
                });
            }
        });
    }
    if (changed) {
        saveGlobalButtons();
    }
}

function saveGlobalButtons() {
    try {
        localStorage.setItem("creatorhub_global_buttons", JSON.stringify(globalButtons));
        if (currentUid && db) {
            updateDoc(doc(db, "users", currentUid), {
                globalButtons: globalButtons
            }).catch(err => {
                console.error("Error saving global buttons to Firestore:", err);
            });
        }
    } catch (e) {
        console.error("Error saving global buttons", e);
    }
}

// Migration logic for legacy videos (Notion and Board)
function migrateVideosData(videosList) {
    if (!videosList) return;
    loadGlobalButtons(); // Ensure global buttons are loaded
    let migratedAny = false;
    let globalButtonsChanged = false;

    videosList.forEach((video) => {
        if (!video.buttons) {
            video.buttons = [];
            let changed = false;

            if (video.notionLink && video.notionLink.trim() !== "") {
                let notionBtn = globalButtons.find(b => b.name.toLowerCase() === "notion" || b.id === "gb_notion");
                if (!notionBtn) {
                    notionBtn = { id: "gb_notion", name: "Notion" };
                    globalButtons.push(notionBtn);
                    globalButtonsChanged = true;
                }
                video.buttons.push({ buttonId: notionBtn.id, url: video.notionLink });
                changed = true;
            }

            if (video.boardLink && video.boardLink.trim() !== "") {
                let boardBtn = globalButtons.find(b => b.name.toLowerCase() === "доска" || b.id === "gb_board");
                if (!boardBtn) {
                    boardBtn = { id: "gb_board", name: "Доска" };
                    globalButtons.push(boardBtn);
                    globalButtonsChanged = true;
                }
                video.buttons.push({ buttonId: boardBtn.id, url: video.boardLink });
                changed = true;
            }

            if (changed) {
                migratedAny = true;
                if (currentUid) {
                    try {
                        updateDoc(doc(db, "users", currentUid, "videos", video.id), {
                            buttons: video.buttons
                        });
                    } catch (err) {
                        console.error("Migration Firestore error for video " + video.id, err);
                    }
                }
            }
        }
    });

    if (globalButtonsChanged) {
        saveGlobalButtons();
    }

    if (migratedAny && !currentUid) {
        localStorage.setItem("local_videos", JSON.stringify(videosList));
    }
}


// Render dynamic buttons for the selected video inside Settings
function renderSelectedVideoButtons() {
    if (!selectedVideoButtonsContainer) return;

    if (!selectedVideo) {
        selectedVideoButtonsContainer.innerHTML = "";
        return;
    }

    // Guard: if user is currently typing in one of these inputs, do not re-render and lose focus
    const activeEl = document.activeElement;
    if (activeEl && activeEl.classList.contains("video-button-url-input") && selectedVideoButtonsContainer.contains(activeEl)) {
        const row = activeEl.closest(".video-button-row");
        if (row && selectedVideo && selectedVideo.buttons) {
            const buttonId = row.dataset.buttonId;
            const currentVidBtn = selectedVideo.buttons.find(b => b.buttonId === buttonId);
            if (currentVidBtn) {
                currentVidBtn.url = activeEl.value;
            }
        }
        return;
    }

    selectedVideoButtonsContainer.innerHTML = "";
    
    if (!selectedVideo.buttons) {
        selectedVideo.buttons = [];
    }

    selectedVideo.buttons.forEach((vidBtn, idx) => {
        const globalBtn = globalButtons.find(b => b.id === vidBtn.buttonId);
        if (!globalBtn) return; // Skip if button was deleted globally

        const row = document.createElement("div");
        row.className = "video-button-row";
        row.style.marginTop = idx > 0 ? "8px" : "0";
        row.dataset.buttonId = vidBtn.buttonId;

        row.innerHTML = `
            <div class="video-button-name-label" title="${globalBtn.name}">${globalBtn.name}</div>
            <input type="text" class="video-button-url-input" placeholder="Введите ссылку для ${globalBtn.name}..." value="${vidBtn.url || ''}" autocomplete="off">
            <button class="video-button-remove-btn" type="button" title="Убрать из видео">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;

        const urlInput = row.querySelector(".video-button-url-input");
        urlInput.addEventListener("input", (e) => {
            if (selectedVideo && selectedVideo.buttons) {
                const currentVidBtn = selectedVideo.buttons.find(b => b.buttonId === vidBtn.buttonId);
                if (currentVidBtn) {
                    currentVidBtn.url = e.target.value;
                }
                saveVideoData("buttons", selectedVideo.buttons);
            }
            updateNotionButtonState(); // Update Info tab links
        });

        const removeBtn = row.querySelector(".video-button-remove-btn");
        removeBtn.addEventListener("click", () => {
            selectedVideo.buttons = selectedVideo.buttons.filter(b => b.buttonId !== vidBtn.buttonId);
            saveVideoData("buttons", selectedVideo.buttons);
            renderSelectedVideoButtons();
            updateNotionButtonState(); // Update Info tab links
        });

        selectedVideoButtonsContainer.appendChild(row);
    });
}

// Render dynamic dropdown options to add buttons to current video
function renderAddButtonDropdown() {
    if (!dropdownAddButtonOptions) return;
    dropdownAddButtonOptions.innerHTML = "";

    if (!selectedVideo) return;
    if (!selectedVideo.buttons) selectedVideo.buttons = [];

    const availableButtons = globalButtons.filter(gb => {
        return !selectedVideo.buttons.some(vb => vb.buttonId === gb.id);
    });

    if (availableButtons.length === 0) {
        dropdownAddButtonOptions.innerHTML = `<div style="padding: 8px 12px; font-size: 0.82rem; color: var(--ch-text-gray); text-align: center;">Нет доступных кнопок</div>`;
        return;
    }

    availableButtons.forEach(btn => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "add-button-dropdown-item";
        item.textContent = btn.name;
        
        item.addEventListener("click", () => {
            selectedVideo.buttons.push({
                buttonId: btn.id,
                url: ""
            });
            saveVideoData("buttons", selectedVideo.buttons);
            renderSelectedVideoButtons();
            dropdownAddButtonOptions.style.display = "none";
            updateNotionButtonState();
        });

        dropdownAddButtonOptions.appendChild(item);
    });
}

// Setup Event Listeners for Add Button Dropdown
if (btnSelectButtonToAdd) {
    btnSelectButtonToAdd.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdownAddButtonOptions.style.display === "flex") {
            dropdownAddButtonOptions.style.display = "none";
        } else {
            renderAddButtonDropdown();
            dropdownAddButtonOptions.style.display = "flex";
        }
    });
}

document.addEventListener("click", (e) => {
    if (dropdownAddButtonOptions && !dropdownAddButtonOptions.contains(e.target) && e.target !== btnSelectButtonToAdd) {
        dropdownAddButtonOptions.style.display = "none";
    }
});

// Setup Event Listeners for Global Buttons Modal
if (btnOpenGlobalButtons) {
    btnOpenGlobalButtons.addEventListener("click", () => {
        loadGlobalButtons();
        renderGlobalButtonsList();
        if (globalButtonsModal) globalButtonsModal.style.display = "flex";
    });
}

const closeGlobalButtonsModal = () => {
    if (globalButtonsModal) globalButtonsModal.style.display = "none";
};
if (btnGlobalButtonsCloseX) btnGlobalButtonsCloseX.addEventListener("click", closeGlobalButtonsModal);
if (btnGlobalButtonsClose) btnGlobalButtonsClose.addEventListener("click", closeGlobalButtonsModal);

if (btnCreateGlobalButton) {
    btnCreateGlobalButton.addEventListener("click", () => {
        const createRow = document.getElementById("createGlobalButtonRow");
        if (createRow) {
            createRow.style.display = "flex";
            const input = createRow.querySelector("#inputNewGlobalButtonName");
            if (input) input.focus();
        }
    });
}

// Render Global Buttons list inside the database manager modal
function renderGlobalButtonsList() {
    if (!globalButtonsListContainer) return;
    globalButtonsListContainer.innerHTML = "";

    // Add Creation Row first (hidden by default)
    const createRow = document.createElement("div");
    createRow.id = "createGlobalButtonRow";
    createRow.style.display = "none";
    createRow.style.padding = "12px 16px";
    createRow.style.borderBottom = "1px solid var(--ch-border)";
    createRow.style.alignItems = "center";
    createRow.style.gap = "10px";
    createRow.style.background = "var(--ch-bg)";
    createRow.innerHTML = `
        <input type="text" id="inputNewGlobalButtonName" placeholder="Название кнопки (например, Figma)..." style="flex-grow: 1; border: 1px solid var(--ch-border); border-radius: 8px; padding: 6px 12px; font-family: inherit; font-size: 0.9rem; background: var(--ch-card-bg); color: var(--ch-text-dark); outline: none;">
        <button id="btnSaveNewGlobalButton" style="background: var(--ch-purple); color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 0.85rem; font-weight: 500; cursor: pointer;">Сохранить</button>
        <button id="btnCancelNewGlobalButton" style="background: none; border: 1px solid var(--ch-border); color: var(--ch-text-dark); border-radius: 6px; padding: 6px 12px; font-size: 0.85rem; cursor: pointer;">Отмена</button>
    `;

    const saveNewBtn = createRow.querySelector("#btnSaveNewGlobalButton");
    const cancelNewBtn = createRow.querySelector("#btnCancelNewGlobalButton");
    const newNameInput = createRow.querySelector("#inputNewGlobalButtonName");

    const saveAction = () => {
        const nameVal = newNameInput.value.trim();
        if (!nameVal) return;
        
        if (globalButtons.some(b => b.name.toLowerCase() === nameVal.toLowerCase())) {
            alert("Кнопка с таким названием уже существует!");
            return;
        }

        const newBtn = {
            id: "gb_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            name: nameVal
        };

        globalButtons.push(newBtn);
        saveGlobalButtons();
        renderGlobalButtonsList();
        renderSelectedVideoButtons(); // Update settings list view immediately
    };

    saveNewBtn.addEventListener("click", saveAction);
    newNameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") saveAction();
    });

    cancelNewBtn.addEventListener("click", () => {
        createRow.style.display = "none";
        newNameInput.value = "";
    });

    globalButtonsListContainer.appendChild(createRow);

    if (globalButtons.length === 0) {
        const emptyMsg = document.createElement("div");
        emptyMsg.style.padding = "20px";
        emptyMsg.style.textAlign = "center";
        emptyMsg.style.color = "var(--ch-text-gray)";
        emptyMsg.style.fontSize = "0.9rem";
        emptyMsg.textContent = "Нет созданных кнопок";
        globalButtonsListContainer.appendChild(emptyMsg);
        return;
    }

    globalButtons.forEach(btn => {
        const count = videos.reduce((acc, v) => {
            if (v.buttons && v.buttons.some(vb => vb.buttonId === btn.id)) {
                return acc + 1;
            }
            return acc;
        }, 0);

        const item = document.createElement("div");
        item.className = "global-button-item";
        item.dataset.id = btn.id;

        item.innerHTML = `
            <div class="button-item-view-mode" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <span class="button-item-name" style="font-size: 0.95rem; color: var(--ch-text-dark); font-weight: 500;">
                    ${btn.name} 
                    <span style="font-size: 0.8rem; color: var(--ch-text-gray); font-weight: 400; margin-left: 8px;">(использовано в ${count} видео)</span>
                </span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn-edit-global-button" style="background: none; border: none; cursor: pointer; color: var(--ch-text-gray); padding: 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" title="Редактировать">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-delete-global-button" style="background: none; border: none; cursor: pointer; color: var(--ch-text-gray); padding: 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" title="Удалить">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="button-item-edit-mode" style="display: none; align-items: center; gap: 10px; width: 100%;">
                <input type="text" class="input-edit-global-button-name" value="${btn.name}" style="flex-grow: 1; border: 1px solid var(--ch-border); border-radius: 8px; padding: 6px 12px; font-family: inherit; font-size: 0.9rem; background: var(--ch-bg); color: var(--ch-text-dark); outline: none;">
                <button class="btn-save-edit-global-button" style="background: var(--ch-purple); color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 0.85rem; font-weight: 500; cursor: pointer;">Сохранить</button>
                <button class="btn-cancel-edit-global-button" style="background: none; border: 1px solid var(--ch-border); color: var(--ch-text-dark); border-radius: 6px; padding: 6px 12px; font-size: 0.85rem; cursor: pointer;">Отмена</button>
            </div>
        `;

        const viewModeDiv = item.querySelector(".button-item-view-mode");
        const editModeDiv = item.querySelector(".button-item-edit-mode");
        const editInput = item.querySelector(".input-edit-global-button-name");
        
        item.querySelector(".btn-edit-global-button").addEventListener("click", () => {
            viewModeDiv.style.display = "none";
            editModeDiv.style.display = "flex";
            editInput.focus();
        });

        item.querySelector(".btn-cancel-edit-global-button").addEventListener("click", () => {
            viewModeDiv.style.display = "flex";
            editModeDiv.style.display = "none";
            editInput.value = btn.name;
        });

        const saveEditAction = () => {
            const newName = editInput.value.trim();
            if (!newName) return;
            if (newName.toLowerCase() !== btn.name.toLowerCase() && globalButtons.some(b => b.name.toLowerCase() === newName.toLowerCase())) {
                alert("Кнопка с таким названием уже существует!");
                return;
            }

            btn.name = newName;
            saveGlobalButtons();
            
            renderGlobalButtonsList();
            renderSelectedVideoButtons();
            updateNotionButtonState();
        };

        item.querySelector(".btn-save-edit-global-button").addEventListener("click", saveEditAction);
        editInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") saveEditAction();
        });

        item.querySelector(".btn-delete-global-button").addEventListener("click", () => {
            if (confirm(`Удалить кнопку "${btn.name}" из глобальной базы? Она также исчезнет из настроек и вкладок "Информация" во всех видео.`)) {
                globalButtons = globalButtons.filter(b => b.id !== btn.id);
                saveGlobalButtons();

                videos.forEach(v => {
                    if (v.buttons) {
                        const origLen = v.buttons.length;
                        v.buttons = v.buttons.filter(vb => vb.buttonId !== btn.id);
                        if (v.buttons.length !== origLen) {
                            if (currentUid) {
                                try {
                                    updateDoc(doc(db, "users", currentUid, "videos", v.id), {
                                        buttons: v.buttons
                                    });
                                } catch (e) {
                                    console.error("Firestore sync error", e);
                                }
                            }
                        }
                    }
                });

                if (!currentUid) {
                    localStorage.setItem("local_videos", JSON.stringify(videos));
                }

                renderGlobalButtonsList();
                renderSelectedVideoButtons();
                updateNotionButtonState();
            }
        });

        globalButtonsListContainer.appendChild(item);
    });
}

// Helper to update status pill badge on the sidebar header
function updateSidebarStatusPill(status) {
    const btn = document.getElementById("btnSidebarStatus");
    const dot = document.getElementById("detailStatusDot");
    const text = document.getElementById("detailStatusText");
    if (!btn) return;

    let bgColor = "rgba(99, 102, 241, 0.08)";
    let textColor = "var(--ch-purple)";
    let dotColor = "var(--ch-purple)";
    let textLabel = "Идея";

    if (status === "in_progress") {
        bgColor = "rgba(245, 158, 11, 0.08)";
        textColor = "#d97706";
        dotColor = "#f59e0b";
        textLabel = "Черновик";
    } else if (status === "editing") {
        bgColor = "rgba(59, 130, 246, 0.08)";
        textColor = "#2563eb";
        dotColor = "#3b82f6";
        textLabel = "В процессе";
    } else if (status === "published") {
        bgColor = "rgba(16, 185, 129, 0.08)";
        textColor = "#059669";
        dotColor = "#10b981";
        textLabel = "Опубликовано";
    }

    btn.style.backgroundColor = bgColor;
    btn.style.color = textColor;
    if (dot) dot.style.backgroundColor = dotColor;
    if (text) text.textContent = textLabel;
}

// Brand icons helper for links carousel cards
function getBrandIcon(name) {
    const lowercase = name.toLowerCase();
    if (lowercase.includes("notion")) {
        return `<img src="https://upload.wikimedia.org/wikipedia/commons/e/e9/Notion-logo.svg" width="16" height="16" style="display: block;">`;
    }
    if (lowercase.includes("chatgpt")) {
        return `<img src="https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg" width="16" height="16" style="display: block;">`;
    }
    if (lowercase.includes("figma")) {
        return `<img src="https://upload.wikimedia.org/wikipedia/commons/3/33/Figma-logo.svg" width="12" height="16" style="display: block;">`;
    }
    if (lowercase.includes("youtube") || lowercase.includes("studio") || lowercase.includes("ютуб")) {
        return `<img src="https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg" width="18" height="16" style="display: block;">`;
    }
    if (lowercase.includes("docs") || lowercase.includes("документ")) {
        return `📄`;
    }
    if (lowercase.includes("сценарий") || lowercase.includes("script")) {
        return `📝`;
    }
    if (lowercase.includes("доска") || lowercase.includes("board")) {
        return `📋`;
    }
    if (lowercase.includes("таблица")) {
        return `📊`;
    }
    if (lowercase.includes("съемк")) {
        return `📷`;
    }
    return `🔗`;
}

// Update scroll state and arrow visibility for carousel
function updateCarouselScrollArrows() {
    const carousel = document.getElementById("videoButtonsContainer");
    const nextBtn = document.getElementById("btnCarouselNext");
    const prevBtn = document.getElementById("btnCarouselPrev");
    const fadeOverlay = document.querySelector(".carousel-fade-overlay");
    const fadeOverlayLeft = document.querySelector(".carousel-fade-overlay-left");
    if (!carousel) return;

    setTimeout(() => {
        const hasOverflow = carousel.scrollWidth > carousel.clientWidth;
        if (hasOverflow) {
            // Left scroll state
            if (carousel.scrollLeft > 5) {
                if (prevBtn) { prevBtn.style.display = "flex"; prevBtn.style.opacity = "1"; }
                if (fadeOverlayLeft) fadeOverlayLeft.style.opacity = "1";
            } else {
                if (prevBtn) { prevBtn.style.display = "none"; prevBtn.style.opacity = "0"; }
                if (fadeOverlayLeft) fadeOverlayLeft.style.opacity = "0";
            }

            // Right scroll state
            const isAtEnd = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 5;
            if (!isAtEnd) {
                if (nextBtn) { nextBtn.style.display = "flex"; nextBtn.style.opacity = "1"; }
                if (fadeOverlay) fadeOverlay.style.opacity = "1";
            } else {
                if (nextBtn) { nextBtn.style.display = "none"; nextBtn.style.opacity = "0"; }
                if (fadeOverlay) fadeOverlay.style.opacity = "0";
            }
        } else {
            if (prevBtn) { prevBtn.style.display = "none"; prevBtn.style.opacity = "0"; }
            if (fadeOverlayLeft) fadeOverlayLeft.style.opacity = "0";
            if (nextBtn) { nextBtn.style.display = "none"; nextBtn.style.opacity = "0"; }
            if (fadeOverlay) fadeOverlay.style.opacity = "0";
        }
    }, 50);
}

// Render dynamic links in the header links carousel
function updateNotionButtonState() {
    if (!videoButtonsContainer) return;
    videoButtonsContainer.innerHTML = "";

    const activeButtons = [];

    if (selectedVideo) {
        if (selectedVideo.buttons) {
            selectedVideo.buttons.forEach(vidBtn => {
                if (vidBtn.url && vidBtn.url.trim() !== "") {
                    const globalBtn = globalButtons.find(b => b.id === vidBtn.buttonId);
                    if (globalBtn) {
                        const linkEl = document.createElement("a");
                        linkEl.href = vidBtn.url.trim();
                        linkEl.target = "_blank";
                        linkEl.className = "btn-notion-link";
                        linkEl.style.flexShrink = "0";
                        linkEl.style.whiteSpace = "nowrap";
                        linkEl.innerHTML = `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"
                                height="14" style="margin-right: 6px; vertical-align: middle;">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            ${globalBtn.name}
                        `;
                        activeButtons.push(linkEl);
                    }
                }
            });
        }

        if (selectedVideo.videoLink && selectedVideo.videoLink.trim() !== "") {
            const ytid = getYouTubeId(selectedVideo.videoLink);
            if (ytid) {
                const studioEl = document.createElement("a");
                studioEl.href = `https://studio.youtube.com/video/${ytid}/analytics/`;
                studioEl.target = "_blank";
                studioEl.className = "btn-notion-link";
                studioEl.style.flexShrink = "0";
                studioEl.style.whiteSpace = "nowrap";
                studioEl.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14"
                        height="14" style="margin-right: 6px; vertical-align: middle;">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    YouTube Studio
                `;
                activeButtons.push(studioEl);
            }
        }
    }

    activeButtons.forEach(btn => {
        videoButtonsContainer.appendChild(btn);
    });

    const wrapper = document.querySelector(".video-links-carousel-wrapper");
    if (wrapper) {
        wrapper.style.display = activeButtons.length > 0 ? "block" : "none";
    }
    
    updateCarouselScrollArrows();
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
    // Обновляем кнопку очистки
    const btnClearDueDate = document.getElementById("btnClearDueDate");
    if (btnClearDueDate) {
        btnClearDueDate.style.display = dateStr ? "flex" : "none";
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
    }
    
    renderVideosList();
    
    if (dueDateDropdown) {
        dueDateDropdown.style.display = "none";
    }
}

async function clearDueDate() {
    if (!selectedVideo) return;
    
    selectedDueDate = "";
    selectedVideo.publishDate = "";
    
    const formattedDate = "не запланировано";
    selectedVideo.date = formattedDate;
    selectedVideo.dateLabel = formattedDate;
    
    if (dueDateBtnText) {
        dueDateBtnText.textContent = "Выбрать дату";
    }
    if (infoDate) {
        infoDate.textContent = formattedDate;
    }
    
    const btnClearDueDate = document.getElementById("btnClearDueDate");
    if (btnClearDueDate) {
        btnClearDueDate.style.display = "none";
    }
    
    if (currentUid) {
        try {
            await updateDoc(doc(db, "users", currentUid, "videos", selectedVideo.id), {
                publishDate: "",
                date: formattedDate,
                dateLabel: formattedDate
            });
        } catch (err) {
            console.error("Ошибка при сохранении даты публикации в Firestore:", err);
        }
    } else {
        localStorage.setItem("local_videos", JSON.stringify(videos));
    }
    
    renderVideosList();
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

        const afterElement = getDragAfterVideo(videosListContainer, e.clientX, e.clientY);
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

    // --- DRAG AND DROP ДЛЯ ЗАДАЧ ---
    const activeTasksContainer = document.getElementById("chActiveTasksList");
    if (activeTasksContainer) {
        let taskDraggingElement = null;
        let taskPlaceholder = null;

        activeTasksContainer.addEventListener('dragstart', (e) => {
            const taskItem = e.target.closest('.ch-task-item');
            if (!taskItem || taskItem.classList.contains('completed')) {
                e.preventDefault();
                return;
            }
            taskDraggingElement = taskItem;
            taskItem.classList.add('dragging');

            taskPlaceholder = document.createElement('div');
            taskPlaceholder.className = 'task-drag-placeholder';
            taskPlaceholder.style.height = `${taskDraggingElement.offsetHeight}px`;

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', taskItem.getAttribute('data-id'));

            setTimeout(() => {
                if (taskDraggingElement) {
                    taskDraggingElement.style.display = 'none';
                }
            }, 0);
        });

        activeTasksContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!taskDraggingElement || !taskPlaceholder) return;

            const afterElement = getDragAfterTask(activeTasksContainer, e.clientY);
            if (afterElement) {
                activeTasksContainer.insertBefore(taskPlaceholder, afterElement);
            } else {
                activeTasksContainer.appendChild(taskPlaceholder);
            }
        });

        activeTasksContainer.addEventListener('dragend', () => {
            if (taskDraggingElement) {
                taskDraggingElement.style.display = '';
                taskDraggingElement.classList.remove('dragging');
                taskDraggingElement.removeAttribute('draggable');
            }
            if (taskPlaceholder && taskPlaceholder.parentNode) {
                taskPlaceholder.remove();
            }
            taskPlaceholder = null;
            taskDraggingElement = null;
        });

        activeTasksContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            if (!taskDraggingElement || !taskPlaceholder) return;

            const prevElement = taskPlaceholder.previousElementSibling;
            const nextElement = taskPlaceholder.nextElementSibling;

            taskPlaceholder.remove();
            taskPlaceholder = null;

            if (taskDraggingElement) {
                taskDraggingElement.style.display = '';
                taskDraggingElement.classList.remove('dragging');
            }

            const taskId = taskDraggingElement.getAttribute('data-id');
            const task = currentTasksList.find(t => t.id === taskId);
            if (!task) {
                taskDraggingElement = null;
                return;
            }

            const prevTaskId = prevElement ? prevElement.getAttribute('data-id') : null;
            const nextTaskId = nextElement ? nextElement.getAttribute('data-id') : null;

            const prevTask = currentTasksList.find(t => t.id === prevTaskId);
            const nextTask = currentTasksList.find(t => t.id === nextTaskId);

            let newOrder = 0;
            if (!prevTask && !nextTask) {
                newOrder = 0;
            } else if (!prevTask) {
                newOrder = (nextTask.order !== undefined ? nextTask.order : 0) - 1000;
            } else if (!nextTask) {
                newOrder = (prevTask.order !== undefined ? prevTask.order : 0) + 1000;
            } else {
                const prevOrder = prevTask.order !== undefined ? prevTask.order : 0;
                const nextOrder = nextTask.order !== undefined ? nextTask.order : 0;
                newOrder = (prevOrder + nextOrder) / 2;
            }

            task.order = newOrder;

            if (currentUid) {
                try {
                    await updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
                        order: newOrder
                    });
                } catch (err) {
                    console.error("Ошибка при переупорядочивании задачи в Firestore:", err);
                }
            } else {
                if (!selectedVideo) return;
                const localTasks = JSON.parse(localStorage.getItem(`local_tasks_${selectedVideo.id}`)) || [];
                const t = localTasks.find(item => item.id === taskId);
                if (t) {
                    t.order = newOrder;
                    localStorage.setItem(`local_tasks_${selectedVideo.id}`, JSON.stringify(localTasks));
                    renderLocalTasks();
                }
            }
            taskDraggingElement = null;
        });
    }
}

function getDragAfterVideo(container, x, y) {
    const dragElements = [...container.querySelectorAll('.video-card:not(.dragging):not(.video-drag-placeholder)')];
    if (dragElements.length === 0) return null;

    let closest = null;
    let minDistance = Infinity;

    dragElements.forEach(child => {
        const box = child.getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const distance = Math.hypot(x - centerX, y - centerY);

        if (distance < minDistance) {
            minDistance = distance;
            closest = { element: child, box: box, centerX: centerX, centerY: centerY };
        }
    });

    if (!closest) return null;

    const box = closest.box;
    if (y < box.top) {
        return closest.element;
    } else if (y > box.bottom) {
        return closest.element.nextElementSibling;
    } else {
        if (x < closest.centerX) {
            return closest.element;
        } else {
            return closest.element.nextElementSibling;
        }
    }
}

function getDragAfterTask(container, y) {
    const dragElements = [...container.querySelectorAll('.ch-task-item:not(.dragging):not(.task-drag-placeholder)')];
    if (dragElements.length === 0) return null;

    return dragElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
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

        const afterElement = getDragAfterVideo(videosListContainer, touch.clientX, touch.clientY);
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

    const tabIcons = {
        idea: `<svg class="tab-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M16,7a8.36,8.36,0,0,0-8,8,8.4,8.4,0,0,0,2.29,5.7A4.56,4.56,0,0,1,12,24a1,1,0,0,0,1,1h6a1,1,0,0,0,1-1,4.46,4.46,0,0,1,1.69-3.28A7.87,7.87,0,0,0,24,15a8.17,8.17,0,0,0-2.44-5.83A7.67,7.67,0,0,0,16,7Zm4.34,12.28A6.87,6.87,0,0,0,18.09,23H13.91a7,7,0,0,0-2.2-3.71A6.41,6.41,0,0,1,10,15a6.29,6.29,0,0,1,6-6,5.63,5.63,0,0,1,4.13,1.6A6.16,6.16,0,0,1,22,15,5.93,5.93,0,0,1,20.31,19.28Z"></path><path d="M19,26H13a1,1,0,0,0,0,2h6a1,1,0,0,0,0-2Z"></path><path d="M18,29H14a1,1,0,0,0,0,2h4a1,1,0,0,0,0-2Z"></path><path d="M16,5a1,1,0,0,0,1-1V2a1,1,0,0,0-2,0V4A1,1,0,0,0,16,5Z"></path><path d="M5,14H3a1,1,0,0,0,0,2H5a1,1,0,0,0,0-2Z"></path><path d="M29,14H27a1,1,0,0,0,0,2h2a1,1,0,0,0,0-2Z"></path><path d="M25.9,5.1a1,1,0,0,0-1.41,0L23.07,6.51a1,1,0,0,0,0,1.42,1,1,0,0,0,.71.29,1,1,0,0,0,.71-.29L25.9,6.51A1,1,0,0,0,25.9,5.1Z"></path><path d="M8.93,7.93a1,1,0,0,0,0-1.42L7.51,5.1A1,1,0,0,0,6.1,6.51L7.51,7.93a1,1,0,0,0,.71.29A1,1,0,0,0,8.93,7.93Z"></path></svg>`,
        in_progress: `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
        editing: `<svg class="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.296 3.464 3.02 3.956"></path><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"></path><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="m6.18 5.276 3.1 3.899"></path></svg>`,
        published: `<svg class="tab-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16" /><path d="m10.97 4.97-.02.022-3.473 4.425-2.093-2.094a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05" /></svg>`
    };

    const tabBtns = document.querySelectorAll(".filters-tabs .tab-btn");
    tabBtns.forEach(btn => {
        const filterVal = btn.dataset.filter;
        if (tabLabels[filterVal] !== undefined) {
            const iconHtml = tabIcons[filterVal] || "";
            btn.innerHTML = `${iconHtml}<span>${tabLabels[filterVal]}</span> <span class="tab-count">${countMap[filterVal]}</span>`;
        }
    });
}

function renderTags() {
    if (!selectedVideo) {
        if (infoTags) infoTags.innerHTML = "";
        return;
    }
    const tagsList = selectedVideo.tags || [];
    infoTags.innerHTML = tagsList.map(tag => {
        const displayTag = tag.startsWith("#") ? tag : "#" + tag;
        return `
            <span class="tag-badge ${getTagColorClass(tag)}" data-tag="${tag}">${displayTag}<span class="btn-remove-tag" data-tag="${tag}">&times;</span></span>
        `;
    }).join('') + `<button class="btn-add-tag" id="btnAddTag">+</button>`;

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
    renderFilterDropdown();
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
    if (tag) {
        let hash = 0;
        const tagStr = String(tag);
        for (let i = 0; i < tagStr.length; i++) {
            hash = tagStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % tagColorsList.length;
        return `tag-color-${tagColorsList[index]}`;
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
    if (typeof currentFilter !== "undefined") {
        localStorage.setItem(`creatorhub_view_mode_${currentFilter}`, mode);
    }
    
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

// === Интеграция задач Мои Задачи (todo.html) ===
async function getOrCreateYouTubeProjectAndSection(video) {
    if (!currentUid || !db || !video) return null;

    // 1. Убедимся, что проект "YouTube" существует в БД
    let projectId = youtubeProjectId;
    if (!projectId) {
        const ytProj = projectsList.find(p => p.name && p.name.toLowerCase() === 'youtube');
        if (ytProj) {
            projectId = ytProj.id;
            youtubeProjectId = projectId;
        } else {
            try {
                const docRef = await addDoc(collection(db, 'users', currentUid, 'projects'), {
                    name: 'YouTube',
                    createdAt: serverTimestamp(),
                    order: 0
                });
                projectId = docRef.id;
                youtubeProjectId = projectId;
            } catch (err) {
                console.error("Ошибка при создании проекта YouTube:", err);
                return null;
            }
        }
    }

    // 2. Убедимся, что раздел для видео существует
    let sectionId = videoSectionId;
    let sec = sectionsList.find(s => s.projectId === projectId && s.videoId === video.id);
    if (!sec) {
        const cleanTitle = formatVideoTitle(video.title);
        sec = sectionsList.find(s => s.projectId === projectId && s.name === cleanTitle && !s.videoId);
        if (sec) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'sections', sec.id), {
                    videoId: video.id
                });
                sectionId = sec.id;
                videoSectionId = sectionId;
            } catch (err) {
                console.error("Ошибка при привязке videoId к разделу:", err);
            }
        }
    } else {
        sectionId = sec.id;
        videoSectionId = sectionId;
    }

    if (!sec) {
        try {
            const cleanTitle = formatVideoTitle(video.title);
            const maxOrder = sectionsList
                .filter(s => s.projectId === projectId)
                .reduce((max, s) => Math.max(max, s.order !== undefined ? s.order : 0), 0);

            const docRef = await addDoc(collection(db, 'users', currentUid, 'sections'), {
                name: cleanTitle,
                projectId: projectId,
                videoId: video.id,
                order: maxOrder + 1,
                createdAt: serverTimestamp()
            });
            sectionId = docRef.id;
            videoSectionId = sectionId;
        } catch (err) {
            console.error("Ошибка при создании раздела для видео:", err);
            return null;
        }
    } else {
        const cleanTitle = formatVideoTitle(video.title);
        if (sec.name !== cleanTitle) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'sections', sec.id), {
                    name: cleanTitle
                });
            } catch (err) {
                console.error("Ошибка при обновлении названия раздела:", err);
            }
        }
    }

    return { projectId, sectionId };
}

async function ensureVideoSection(video) {
    if (!currentUid || !db || !video) return;
    
    // 1. Ищем ID проекта YouTube
    let projectId = youtubeProjectId;
    if (!projectId) {
        const ytProj = projectsList.find(p => p.name && p.name.toLowerCase() === 'youtube');
        if (ytProj) {
            projectId = ytProj.id;
            youtubeProjectId = projectId;
        }
    }

    if (!projectId) {
        videoSectionId = null;
        subscribeToTasks(null);
        return;
    }

    // 2. Ищем, существует ли раздел для этого видео
    let sec = sectionsList.find(s => s.projectId === projectId && s.videoId === video.id);
    if (!sec) {
        const cleanTitle = formatVideoTitle(video.title);
        sec = sectionsList.find(s => s.projectId === projectId && s.name === cleanTitle && !s.videoId);
        if (sec) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'sections', sec.id), {
                    videoId: video.id
                });
                videoSectionId = sec.id;
            } catch (err) {
                console.error("Ошибка при привязке videoId к разделу:", err);
            }
        }
    } else {
        videoSectionId = sec.id;
    }

    if (sec) {
        subscribeToTasks(sec.id);
        
        const cleanTitle = formatVideoTitle(video.title);
        if (sec.name !== cleanTitle) {
            try {
                await updateDoc(doc(db, 'users', currentUid, 'sections', sec.id), {
                    name: cleanTitle
                });
            } catch (err) {
                console.error("Ошибка при обновлении названия раздела:", err);
            }
        }
    } else {
        videoSectionId = null;
        subscribeToTasks(null);
    }
}

function subscribeToTasks(sectionId) {
    if (unsubscribeTasks) {
        unsubscribeTasks();
        unsubscribeTasks = null;
    }
    
    if (!currentUid || !sectionId) {
        if (!currentUid) {
            renderLocalTasks();
        } else {
            renderTasksUI([]);
        }
        return;
    }
    
    const qTasks = query(
        collection(db, 'users', currentUid, 'tasks'),
        where('projectId', '==', youtubeProjectId),
        where('sectionId', '==', sectionId)
    );
    
    unsubscribeTasks = onSnapshot(qTasks, async (snapshot) => {
        const tasksList = [];
        snapshot.forEach(docSnap => {
            tasksList.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Проверяем наличие не удаленных задач
        const nonDeletedTasks = tasksList.filter(t => !t.deleted);
        if (nonDeletedTasks.length === 0 && sectionId) {
            // Удаляем раздел, если не осталось активных/выполненных задач
            const secToDel = sectionId;
            if (videoSectionId === secToDel) {
                videoSectionId = null;
            }
            try {
                if (unsubscribeTasks) {
                    unsubscribeTasks();
                    unsubscribeTasks = null;
                }
                await deleteDoc(doc(db, 'users', currentUid, 'sections', secToDel));
            } catch (err) {
                console.error("Ошибка при удалении пустого раздела:", err);
            }
            renderTasksUI([]);
            return;
        }
        
        renderTasksUI(tasksList);
    }, (error) => {
        console.error("Ошибка при получении задач видео:", error);
    });
}

function renderTasksUI(tasksList) {
    currentTasksList = tasksList;
    const activeListEl = document.getElementById("chActiveTasksList");
    const completedListEl = document.getElementById("chCompletedTasksList");
    const completedHeader = document.getElementById("chCompletedHeader");
    const completedCountEl = document.getElementById("chCompletedCount");
    
    if (!activeListEl || !completedListEl) return;
    
    activeListEl.innerHTML = "";
    completedListEl.innerHTML = "";
    
    const activeTasks = tasksList.filter(t => !t.completed && !t.deleted);
    const completedTasks = tasksList.filter(t => t.completed && !t.deleted);
    
    if (activeTasks.length === 0) {
        activeListEl.innerHTML = `<div style="text-align: center; color: var(--ch-text-gray); padding: 20px 0; font-size: 0.9rem;">Нет активных задач</div>`;
    } else {
        // Сортируем задачи по order, затем по createdAt
        activeTasks.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : 0;
            const orderB = b.order !== undefined ? b.order : 0;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return timeA - timeB;
        });
        activeTasks.forEach(task => {
            activeListEl.appendChild(createTaskDOMElement(task));
        });
    }
    
    if (completedTasks.length > 0) {
        if (completedHeader) completedHeader.style.display = "block";
        if (completedCountEl) completedCountEl.textContent = completedTasks.length;
        
        completedTasks.sort((a, b) => {
            const timeA = a.completedAt ? (a.completedAt.toDate ? a.completedAt.toDate().getTime() : new Date(a.completedAt).getTime()) : 0;
            const timeB = b.completedAt ? (b.completedAt.toDate ? b.completedAt.toDate().getTime() : new Date(b.completedAt).getTime()) : 0;
            return timeB - timeA; // Недавно выполненные сверху
        });
        
        completedTasks.forEach(task => {
            completedListEl.appendChild(createTaskDOMElement(task));
        });
        
        if (chTasksCompletedCollapsed) {
            if (completedHeader) completedHeader.classList.add("collapsed");
            completedListEl.style.display = "none";
        } else {
            if (completedHeader) completedHeader.classList.remove("collapsed");
            completedListEl.style.display = "block";
        }
    } else {
        if (completedHeader) completedHeader.style.display = "none";
        completedListEl.style.display = "none";
    }
}

function createTaskDOMElement(task) {
    const item = document.createElement("div");
    item.className = `ch-task-item ${task.completed ? 'completed' : ''} priority-${task.priority || 0}`;
    item.setAttribute("data-id", task.id);

    const badgeHtml = getDueDateBadgeHtml(task.dueDate);

    item.innerHTML = `
        <button class="ch-task-checkbox" type="button" aria-label="Отметить задачу">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </button>
        <div class="ch-task-content">${escapeHTML(task.title)}</div>
        ${badgeHtml}
        <div class="ch-task-actions">
            <button class="ch-task-action-btn btn-edit-task" title="Редактировать задачу" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
        </div>
    `;
    
    // Клик по чекбоксу
    const checkbox = item.querySelector(".ch-task-checkbox");
    checkbox.addEventListener("click", async (e) => {
        e.stopPropagation();
        await toggleTaskCompleted(task);
    });
    
    // Клик по кнопке редактирования (открывает модалку)
    const btnEdit = item.querySelector(".btn-edit-task");
    btnEdit.addEventListener("click", (e) => {
        e.stopPropagation();
        openChTaskEditModal(task);
    });

    // Открытие модалки при клике на элемент задачи
    item.addEventListener("click", (e) => {
        if (!e.target.closest(".ch-task-checkbox") && !e.target.closest(".ch-task-actions")) {
            openChTaskEditModal(task);
        }
    });

    // Настройка активации draggable при взаимодействии (для десктопа)
    item.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, textarea, a, select')) {
            return;
        }
        item.setAttribute('draggable', 'true');
    });
    item.addEventListener('mouseup', () => {
        item.removeAttribute('draggable');
    });
    
    return item;
}

async function toggleTaskCompleted(task) {
    const nextState = !task.completed;
    if (currentUid) {
        try {
            await updateDoc(doc(db, 'users', currentUid, 'tasks', task.id), {
                completed: nextState,
                completedAt: nextState ? serverTimestamp() : null
            });
        } catch (err) {
            console.error("Ошибка при обновлении статуса задачи:", err);
        }
    } else {
        if (!selectedVideo) return;
        const localTasks = JSON.parse(localStorage.getItem(`local_tasks_${selectedVideo.id}`)) || [];
        const t = localTasks.find(item => item.id === task.id);
        if (t) {
            t.completed = nextState;
            t.completedAt = nextState ? Date.now() : null;
            localStorage.setItem(`local_tasks_${selectedVideo.id}`, JSON.stringify(localTasks));
            renderLocalTasks();
        }
    }
}

async function deleteTask(taskId) {
    if (currentUid) {
        try {
            await updateDoc(doc(db, 'users', currentUid, 'tasks', taskId), {
                deleted: true,
                deletedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Ошибка при удалении задачи:", err);
        }
    } else {
        if (!selectedVideo) return;
        let localTasks = JSON.parse(localStorage.getItem(`local_tasks_${selectedVideo.id}`)) || [];
        localTasks = localTasks.filter(item => item.id !== taskId);
        localStorage.setItem(`local_tasks_${selectedVideo.id}`, JSON.stringify(localTasks));
        renderLocalTasks();
    }
}

function renderLocalTasks() {
    if (!selectedVideo) return;
    const localTasks = JSON.parse(localStorage.getItem(`local_tasks_${selectedVideo.id}`)) || [];
    renderTasksUI(localTasks);
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

// Слушатели событий
const chAddTaskInput = document.getElementById("chAddTaskInput");
if (chAddTaskInput) {
    chAddTaskInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
            const title = chAddTaskInput.value.trim();
            if (!title) return;
            chAddTaskInput.value = "";

            if (currentUid) {
                const res = await getOrCreateYouTubeProjectAndSection(selectedVideo);
                if (!res) return;
                try {
                    await addDoc(collection(db, 'users', currentUid, 'tasks'), {
                        title: title,
                        completed: false,
                        projectId: res.projectId,
                        sectionId: res.sectionId,
                        priority: 0,
                        createdAt: serverTimestamp()
                    });
                } catch (err) {
                    console.error("Ошибка при добавлении задачи:", err);
                }
            } else {
                if (!selectedVideo) return;
                const localTasks = JSON.parse(localStorage.getItem(`local_tasks_${selectedVideo.id}`)) || [];
                localTasks.push({
                    id: "local_task_" + Date.now(),
                    title: title,
                    completed: false,
                    createdAt: Date.now()
                });
                localStorage.setItem(`local_tasks_${selectedVideo.id}`, JSON.stringify(localTasks));
                renderLocalTasks();
            }
        }
    });
}

const chToggleCompletedBtn = document.getElementById("chToggleCompletedBtn");
if (chToggleCompletedBtn) {
    chToggleCompletedBtn.addEventListener("click", () => {
        chTasksCompletedCollapsed = !chTasksCompletedCollapsed;
        localStorage.setItem("ch_tasks_completed_collapsed", chTasksCompletedCollapsed);
        
        const completedHeader = document.getElementById("chCompletedHeader");
        const completedListEl = document.getElementById("chCompletedTasksList");
        if (chTasksCompletedCollapsed) {
            if (completedHeader) completedHeader.classList.add("collapsed");
            if (completedListEl) completedListEl.style.display = "none";
        } else {
            if (completedHeader) completedHeader.classList.remove("collapsed");
            if (completedListEl) completedListEl.style.display = "block";
        }
    });
}

// === ЛОГИКА РЕДАКТИРОВАНИЯ ЗАДАЧ В CREATORHUB ===
function initChTaskEditModal() {
    const modal = document.getElementById("chTaskEditModal");
    const btnClose = document.getElementById("btnChTaskEditClose");
    const btnCancel = document.getElementById("btnChTaskEditCancel");
    const btnSave = document.getElementById("btnChTaskEditSave");
    const btnDelete = document.getElementById("btnChTaskEditDelete");
    const priorityButtons = document.querySelectorAll("#chTaskEditModal .priority-btn");

    if (!modal) return;

    // Выбор приоритета
    priorityButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const priorityVal = parseInt(btn.getAttribute("data-priority"), 10);
            chTaskEditModalSelectedPriority = priorityVal;
            
            priorityButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // Кнопка закрытия (крестик)
    if (btnClose) {
        btnClose.addEventListener("click", (e) => {
            e.stopPropagation();
            closeChTaskEditModal();
        });
    }

    // Кнопка Отмена
    if (btnCancel) {
        btnCancel.addEventListener("click", (e) => {
            e.stopPropagation();
            closeChTaskEditModal();
        });
    }

    // Кнопка Удалить
    if (btnDelete) {
        btnDelete.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (currentEditingTask) {
                if (confirm("Вы уверены, что хотите удалить эту задачу?")) {
                    await deleteTask(currentEditingTask.id);
                    closeChTaskEditModal();
                }
            }
        });
    }

    // Кнопка Сохранить
    if (btnSave) {
        btnSave.addEventListener("click", async (e) => {
            e.stopPropagation();
            await saveChTaskEditModal();
        });
    }

    // Клик по оверлею для закрытия
    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeChTaskEditModal();
        }
    });

    // Нажатие клавиши Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.style.display === "flex") {
            closeChTaskEditModal();
        }
    });
}

function openChTaskEditModal(task) {
    currentEditingTask = task;
    chTaskEditModalSelectedPriority = task.priority || 0;

    const modal = document.getElementById("chTaskEditModal");
    const titleInput = document.getElementById("chTaskEditTitle");
    const dueDateInput = document.getElementById("chTaskEditDueDate");
    const priorityButtons = document.querySelectorAll("#chTaskEditModal .priority-btn");

    if (!modal) return;

    // Заполняем поля
    if (titleInput) titleInput.value = task.title || "";
    if (dueDateInput) {
        dueDateInput.value = task.dueDate || "";
    }

    // Устанавливаем активный приоритет
    priorityButtons.forEach(b => {
        const val = parseInt(b.getAttribute("data-priority"), 10);
        if (val === chTaskEditModalSelectedPriority) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });

    modal.style.display = "flex";
}

function closeChTaskEditModal() {
    const modal = document.getElementById("chTaskEditModal");
    if (modal) {
        modal.style.display = "none";
    }
    currentEditingTask = null;
}

async function saveChTaskEditModal() {
    if (!currentEditingTask) return;

    const titleInput = document.getElementById("chTaskEditTitle");
    const dueDateInput = document.getElementById("chTaskEditDueDate");

    const newTitle = titleInput ? titleInput.value.trim() : "";
    const newDueDate = dueDateInput ? dueDateInput.value || null : null;
    const newPriority = chTaskEditModalSelectedPriority;

    if (!newTitle) {
        alert("Название задачи не может быть пустым!");
        return;
    }

    if (currentUid) {
        try {
            await updateDoc(doc(db, 'users', currentUid, 'tasks', currentEditingTask.id), {
                title: newTitle,
                dueDate: newDueDate,
                priority: newPriority
            });
        } catch (err) {
            console.error("Ошибка при обновлении задачи в Firestore:", err);
        }
    } else {
        if (!selectedVideo) return;
        const localTasks = JSON.parse(localStorage.getItem(`local_tasks_${selectedVideo.id}`)) || [];
        const t = localTasks.find(item => item.id === currentEditingTask.id);
        if (t) {
            t.title = newTitle;
            t.dueDate = newDueDate;
            t.priority = newPriority;
            localStorage.setItem(`local_tasks_${selectedVideo.id}`, JSON.stringify(localTasks));
            renderLocalTasks();
        }
    }

    closeChTaskEditModal();
}

// Вспомогательные функции для плашки срока задачи
function isDateOverdue(dueDateStr) {
    if (!dueDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = dueDateStr.split('-');
    const dueDate = new Date(year, month - 1, day);
    return dueDate < today;
}

function getDueDateBadgeHtml(dueDateStr) {
    if (!dueDateStr) return "";

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    let label = "";
    let badgeClass = "";

    if (dueDateStr === todayStr) {
        label = "Сегодня";
        badgeClass = "today";
    } else if (dueDateStr === tomorrowStr) {
        label = "Завтра";
        badgeClass = "tomorrow";
    } else if (dueDateStr === yesterdayStr) {
        label = "Вчера";
        badgeClass = "overdue";
    } else if (isDateOverdue(dueDateStr)) {
        const [year, month, day] = dueDateStr.split('-');
        const monthsRuShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        label = `${parseInt(day, 10)} ${monthsRuShort[parseInt(month, 10) - 1]}`;
        if (parseInt(year, 10) !== today.getFullYear()) {
            label += ` ${year}`;
        }
        badgeClass = "overdue";
    } else {
        const [year, month, day] = dueDateStr.split('-');
        const monthsRuShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        label = `${parseInt(day, 10)} ${monthsRuShort[parseInt(month, 10) - 1]}`;
        if (parseInt(year, 10) !== today.getFullYear()) {
            label += ` ${year}`;
        }
        badgeClass = "future";
    }

    return `
        <span class="ch-task-due-badge ${badgeClass}" style="margin-left: auto; margin-right: 8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" style="vertical-align: middle; margin-right: 3px; display: inline-block;">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span style="vertical-align: middle;">${label}</span>
        </span>
    `;
}


