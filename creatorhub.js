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
const initialVideos = [
    {
        id: "1",
        title: "ИИ сделал ремейк Симпсонов",
        status: "published", // "idea" | "in_progress" | "editing" | "published" | "archive"
        statusText: "Опубликовано",
        tags: ["ИИ", "Эксперимент"],
        date: "19 мая 2024",
        dateLabel: "19 мая 2024",
        thumbnail: "https://placehold.co/600x338/5c6bc0/ffffff?text=Simpsons+AI+Remake",
        description: "Полностью пересоздал несколько сцен Симпсонов с помощью нейросетей. Сравнение оригинала и результата.",
        playlist: "ИИ эксперименты",
        link: "youtu.be/ai-simpsons-remake",
        notes: "Нужно добавить примеры с более ранних сезонов и сделать акцент на деталях окружения.\n\nИспользовал: Midjourney, Runway, ElevenLabs",
        checklist: [
            { text: "Написать сценарий", checked: true },
            { text: "Сделать озвучку", checked: true },
            { text: "Смонтировать видео", checked: true },
            { text: "Создать превью", checked: false }
        ],
        files: [
            { name: "Сценарий_Симпсоны.docx", size: "24 КБ" },
            { name: "Озвучка_Mid.mp3", size: "4.2 МБ" }
        ]
    },
    {
        id: "2",
        title: "Что если YouTube существовал в древности",
        status: "editing",
        statusText: "На монтаже",
        tags: ["История", "Юмор"],
        date: "Изменено вчера",
        dateLabel: "Изменено вчера",
        thumbnail: "https://placehold.co/600x338/f57c00/ffffff?text=Ancient+YouTube",
        description: "Шутливый ролик про то, как выглядели бы каналы древнеримских блогеров, спартанские стримы и обзоры на колесницы.",
        playlist: "Исторические гипотезы",
        link: "youtu.be/ancient-youtube",
        notes: "Добавить больше звуков толпы и амфитеатра на задний план. Сделать отсылки к известным римским деятелям.",
        checklist: [
            { text: "Написать шутки для сценария", checked: true },
            { text: "Записать видеоряд", checked: true },
            { text: "Озвучить Цезаря", checked: false },
            { text: "Подобрать музыку", checked: false }
        ],
        files: [
            { name: "Римский_блог_сценарий.docx", size: "18 КБ" }
        ]
    },
    {
        id: "3",
        title: "Как я использую ИИ для создания видео",
        status: "in_progress",
        statusText: "В работе",
        tags: ["ИИ", "Процесс"],
        date: "Изменено 2 дня назад",
        dateLabel: "Изменено 2 дня назад",
        thumbnail: "https://placehold.co/600x338/0288d1/ffffff?text=AI+Video+Workflow",
        description: "Подробный разбор моего рабочего процесса: от генерации идеи до финального монтажа с использованием нейросетей.",
        playlist: "Полезное",
        link: "youtu.be/ai-workflow",
        notes: "Сделать акцент на бесплатные альтернативы платным нейросетям.",
        checklist: [
            { text: "Собрать список инструментов", checked: true },
            { text: "Записать скринкаст работы в Photoshop AI", checked: false },
            { text: "Сделать структуру видео", checked: false }
        ],
        files: []
    },
    {
        id: "4",
        title: "Все виды пропаганды в истории",
        status: "idea",
        statusText: "Идея",
        tags: ["История", "Исследование"],
        date: "Создано 5 дней назад",
        dateLabel: "Создано 5 дней назад",
        thumbnail: "https://placehold.co/600x338/7e57c2/ffffff?text=History+of+Propaganda",
        description: "Большой разбор методов влияния на общественное мнение от Древнего Египта до наших дней.",
        playlist: "Длинные видео",
        link: "youtu.be/history-propaganda",
        notes: "Нужен нейтральный и объективный тон. Изучить плакаты Первой и Второй мировых войн.",
        checklist: [
            { text: "Найти исторические материалы", checked: true },
            { text: "Написать план сценария", checked: false },
            { text: "Подобрать архивные фото", checked: false }
        ],
        files: []
    },
    {
        id: "5",
        title: "Почему космос нас пугает",
        status: "idea",
        statusText: "Идея",
        tags: ["Космос", "Психология"],
        date: "Создано 6 дней назад",
        dateLabel: "Создано 6 дней назад",
        thumbnail: "https://placehold.co/600x338/455a64/ffffff?text=Scary+Space",
        description: "Эссе о космическом страхе (космофобии), масштабах Вселенной и о том, почему неизвестность манит и пугает одновременно.",
        playlist: "Эссе",
        link: "youtu.be/space-fear",
        notes: "Использовать эмбиент музыку для нагнетания атмосферы.",
        checklist: [
            { text: "Набросать мысли", checked: true },
            { text: "Найти красивые футажи NASA", checked: false }
        ],
        files: []
    },
    {
        id: "6",
        title: "Будущее YouTube через 10 лет",
        status: "published",
        statusText: "Опубликовано",
        tags: ["YouTube", "Будущее"],
        date: "7 мая 2024",
        dateLabel: "7 мая 2024",
        thumbnail: "https://placehold.co/600x338/43a047/ffffff?text=Future+of+YouTube",
        description: "Каким будет видеохостинг в 2034 году? Будет ли VR-стриминг, ИИ-блогеры и новые форматы монетизации.",
        playlist: "Будущее",
        link: "youtu.be/youtube-future",
        notes: "Интересно посмотреть, насколько прогнозы совпадут с реальностью через годы.",
        checklist: [
            { text: "Сценарий", checked: true },
            { text: "Озвучка", checked: true },
            { text: "Монтаж", checked: true },
            { text: "Превью", checked: true }
        ],
        files: [
            { name: "Превью_10лет.png", size: "1.8 МБ" }
        ]
    }
];

let videos = [...initialVideos];
let selectedVideo = null;
let currentFilter = "all";
let searchQuery = "";
let currentMenuRoute = "videos"; // "videos" | "trash"
let isDeletePermanentMode = false;

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
const infoTags = document.getElementById("infoTags");
const infoDate = document.getElementById("infoDate");
const infoLink = document.getElementById("infoLink");
const infoPlaylist = document.getElementById("infoPlaylist");
const referencesContent = document.getElementById("referencesContent");
const settingNotionLink = document.getElementById("settingNotionLink");
const btnOpenNotion = document.getElementById("btnOpenNotion");

// Инициализация
document.addEventListener("DOMContentLoaded", () => {
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
    
    // Выбираем первое видео по умолчанию
    if (videos.length > 0) {
        selectVideoItem(videos[0].id);
    }

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
            filterButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
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
            if (newStatus === "in_progress") statusText = "В работе";
            else if (newStatus === "editing") statusText = "На монтаже";
            else if (newStatus === "published") statusText = "Опубликовано";
            else if (newStatus === "archive") statusText = "Архив";
            
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

    // Сохранение описания при изменении
    if (infoDescription) {
        infoDescription.addEventListener("input", async (e) => {
            if (!selectedVideo) return;
            const newDesc = e.target.value;
            selectedVideo.description = newDesc;
            
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

    // Сохранение референсов при изменении
    if (referencesContent) {
        referencesContent.addEventListener("input", () => {
            if (!selectedVideo) return;
            selectedVideo.references = referencesContent.innerHTML;
            saveVideoData("references", selectedVideo.references);
        });

        // Просмотр картинок в полный размер (лайтбокс) при клике
        referencesContent.addEventListener("click", (e) => {
            if (e.target.tagName === "IMG") {
                openImageLightbox(e.target.src);
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
    const sidebarMenuItems = document.querySelectorAll(".sidebar-menu .menu-item");
    sidebarMenuItems.forEach(item => {
        if (item.id === "menuSettings") return; // Настройки обрабатываются отдельно как модалка
        item.addEventListener("click", (e) => {
            e.preventDefault();
            sidebarMenuItems.forEach(mi => mi.classList.remove("active"));
            item.classList.add("active");
            if (item.id === "menuTrash") {
                currentMenuRoute = "trash";
            } else {
                currentMenuRoute = "videos";
            }
            updateViewForRoute();
        });
    });

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

    // Инициализация ресайзера правого сайдбара
    initDetailSidebarResizer();
});

// Функция обновления интерфейса в зависимости от текущего маршрута меню
function updateViewForRoute() {
    const statsGrid = document.querySelector(".stats-grid");
    const welcomeHeader = document.querySelector(".welcome-header");
    const trashNoticeBanner = document.getElementById("trashNoticeBanner");
    const sectionTitle = document.querySelector(".videos-section h2");
    const filtersTabs = document.querySelector(".filters-tabs");

    if (currentMenuRoute === "trash") {
        if (statsGrid) statsGrid.style.display = "none";
        if (welcomeHeader) welcomeHeader.style.display = "none";
        if (trashNoticeBanner) trashNoticeBanner.style.display = "flex";
        if (filtersTabs) filtersTabs.style.display = "none";
        if (sectionTitle) {
            sectionTitle.innerHTML = `Корзина`;
        }
    } else {
        if (statsGrid) statsGrid.style.display = "grid";
        if (welcomeHeader) welcomeHeader.style.display = "block";
        if (trashNoticeBanner) trashNoticeBanner.style.display = "none";
        if (filtersTabs) filtersTabs.style.display = "flex";
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
        if (!selectedVideo || !filtered.some(v => v.id === selectedVideo.id)) {
            selectVideoItem(filtered[0].id);
        } else {
            selectVideoItem(selectedVideo.id);
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
    const countPublished = activeVideos.filter(v => v.status === "published").length;

    const ideasCard = document.querySelector(".stat-card.ideas .number");
    const workCard = document.querySelector(".stat-card.work .number");
    const editCard = document.querySelector(".stat-card.edit .number");
    const publishedCard = document.querySelector(".stat-card.published .number");

    if (ideasCard) ideasCard.textContent = countIdeas;
    if (workCard) workCard.textContent = countInProgress;
    if (editCard) editCard.textContent = countEditing;
    if (publishedCard) publishedCard.textContent = countPublished;
}

// Функция рендеринга списка
function renderVideosList() {
    videosListContainer.innerHTML = "";
    
    // Обновляем статистические счетчики
    updateStatsCounters();

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
        
        if (v.deleted) {
            card.innerHTML = `
                <div class="video-card-left">
                    <img src="${v.thumbnail}" alt="Превью" class="video-thumbnail-mini">
                    <div class="video-info-block">
                        <h4 class="video-title">${v.title}</h4>
                        <div class="video-meta-tags">
                            ${v.tags.map(tag => `<span class="meta-tag">${tag}</span>`).join('')}
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
                            ${v.tags.map(tag => `<span class="meta-tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="video-card-right">
                    <div class="video-status-date-block">
                        <span class="status-badge ${v.status}">${v.statusText}</span>
                        <span class="video-date">${v.date}</span>
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
    
    infoTags.innerHTML = selectedVideo.tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('') + 
                         `<button class="btn-add-tag">+</button>`;
    
    infoDate.textContent = selectedVideo.dateLabel;
    infoLink.href = `https://${selectedVideo.link}`;
    infoLink.querySelector("span").textContent = selectedVideo.link;
    infoPlaylist.textContent = selectedVideo.playlist;

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
                if (!selectedVideo || !filtered.some(v => v.id === selectedVideo.id)) {
                    selectVideoItem(filtered[0].id);
                } else {
                    selectVideoItem(selectedVideo.id);
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
            selectVideoItem(filtered[0].id);
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
    const btnChangeThumbnail = document.getElementById("btnChangeThumbnail");
    if (btnChangeThumbnail) {
        btnChangeThumbnail.style.display = "none";
    }
    if (detailStatusSelect) {
        detailStatusSelect.value = "idea";
    }
    detailStatusDot.className = "status-dot";
    infoDescription.value = "";
    infoTags.innerHTML = "";
    infoDate.textContent = "--";
    infoLink.href = "#";
    infoLink.querySelector("span").textContent = "ссылка";
    infoPlaylist.textContent = "--";
    if (referencesContent) referencesContent.innerHTML = "";
    if (settingNotionLink) settingNotionLink.value = "";
    if (btnOpenNotion) {
        btnOpenNotion.classList.add("disabled");
        btnOpenNotion.href = "#";
    }
}

// === Создание нового видео ===
async function addVideo() {
    const newVideoData = {
        title: "Новое видео",
        status: "idea",
        statusText: "Идея",
        tags: ["Проект"],
        date: "Создано сегодня",
        dateLabel: "Создано сегодня",
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

    // Позиционируем меню
    if (triggerEl && (!e.clientX || e.type !== "contextmenu")) {
        const rect = triggerEl.getBoundingClientRect();
        videoActionsDropdown.style.position = "fixed";
        videoActionsDropdown.style.left = `${rect.left - 150}px`;
        videoActionsDropdown.style.top = `${rect.bottom + 6}px`;
    } else {
        videoActionsDropdown.style.position = "fixed";
        let x = e.clientX;
        let y = e.clientY;
        
        const menuWidth = 200;
        const menuHeight = 180;
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

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
        if (newStatus === "in_progress") statusText = "В работе";
        else if (newStatus === "editing") statusText = "На монтаже";
        else if (newStatus === "published") statusText = "Опубликовано";
        else if (newStatus === "archive") statusText = "Архив";
        
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

