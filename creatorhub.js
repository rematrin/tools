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

// DOM Элементы
const videosListContainer = document.getElementById("videosListContainer");
const videoSearch = document.getElementById("videoSearch");
const filterButtons = document.querySelectorAll(".tab-btn");

// DOM Элементы детального вида
const detailSidebar = document.getElementById("detailSidebar");
const detailImage = document.getElementById("detailImage");
const detailTitle = document.getElementById("detailTitle");
const detailStatusDot = document.getElementById("detailStatusDot");
const detailStatusText = document.getElementById("detailStatusText");

const detailTabButtons = document.querySelectorAll(".detail-tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

// Элементы вкладок
const infoDescription = document.getElementById("infoDescription");
const infoTags = document.getElementById("infoTags");
const infoDate = document.getElementById("infoDate");
const infoLink = document.getElementById("infoLink");
const infoPlaylist = document.getElementById("infoPlaylist");
const notesTextareas = document.querySelectorAll(".notes-textarea");
const filesList = document.getElementById("filesList");
const checklistContainers = document.querySelectorAll(".checklist-items");
const checklistProgresses = document.querySelectorAll(".checklist-progress");

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

    // Сохранение заметок при изменении (для всех полей)
    notesTextareas.forEach(textarea => {
        textarea.addEventListener("input", (e) => {
            if (selectedVideo) {
                selectedVideo.notes = e.target.value;
                // Синхронизируем все текстовые поля заметок на разных вкладках
                notesTextareas.forEach(t => {
                    if (t !== e.target) t.value = e.target.value;
                });
            }
        });
    });
});

// Функция рендеринга списка
function renderVideosList() {
    videosListContainer.innerHTML = "";

    const filtered = videos.filter(v => {
        const matchesSearch = v.title.toLowerCase().includes(searchQuery);
        const matchesFilter = currentFilter === "all" || v.status === currentFilter;
        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        videosListContainer.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--ch-text-gray);">Видео не найдены</div>`;
        return;
    }

    filtered.forEach(v => {
        const card = document.createElement("div");
        card.className = `video-card ${selectedVideo && selectedVideo.id === v.id ? 'active' : ''}`;
        card.dataset.id = v.id;
        
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

        card.addEventListener("click", (e) => {
            // Предотвращаем клик если нажата кнопка опций
            if (e.target.closest(".video-options-btn")) {
                return;
            }
            selectVideoItem(v.id);
        });

        // Двойной клик для переименования
        card.addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();
            enableInlineRename(card, v.id, v.title);
        });

        // Правый клик (контекстное меню)
        card.addEventListener("contextmenu", (e) => {
            showVideoMenu(e, v.id);
        });

        // Кнопка опций (три точки)
        const optionsBtn = card.querySelector(".video-options-btn");
        if (optionsBtn) {
            optionsBtn.addEventListener("click", (e) => {
                showVideoMenu(e, v.id, optionsBtn);
            });
        }

        videosListContainer.appendChild(card);
    });
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
    
    // Статус
    detailStatusText.textContent = selectedVideo.statusText;
    detailStatusDot.className = `status-dot ${selectedVideo.status}`;

    // Вкладка: Информация
    infoDescription.textContent = selectedVideo.description;
    
    infoTags.innerHTML = selectedVideo.tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('') + 
                         `<button class="btn-add-tag">+</button>`;
    
    infoDate.textContent = selectedVideo.dateLabel;
    infoLink.href = `https://${selectedVideo.link}`;
    infoLink.querySelector("span").textContent = selectedVideo.link;
    infoPlaylist.textContent = selectedVideo.playlist;

    // Вкладка: Заметки
    notesTextareas.forEach(textarea => {
        textarea.value = selectedVideo.notes;
    });

    // Вкладка: Файлы
    renderFiles();

    // Вкладка: Задачи (Чек-лист)
    renderChecklist();
}

// Рендер файлов
function renderFiles() {
    filesList.innerHTML = "";
    if (!selectedVideo.files || selectedVideo.files.length === 0) {
        filesList.innerHTML = `<div class="empty-state-tab">Файлы отсутствуют</div>`;
        return;
    }

    selectedVideo.files.forEach(f => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.padding = "8px 12px";
        item.style.border = "1px solid var(--ch-border)";
        item.style.borderRadius = "8px";
        item.style.marginBottom = "8px";
        item.style.fontSize = "0.85rem";
        item.style.background = "var(--ch-bg)";

        item.innerHTML = `
            <span style="font-weight: 500;">${f.name}</span>
            <span style="color: var(--ch-text-gray);">${f.size}</span>
        `;
        filesList.appendChild(item);
    });
}

// Рендер чек-листа
function renderChecklist() {
    checklistContainers.forEach(container => {
        container.innerHTML = "";
    });

    if (!selectedVideo.checklist || selectedVideo.checklist.length === 0) {
        checklistContainers.forEach(container => {
            container.innerHTML = `<div class="empty-state-tab">Задачи отсутствуют</div>`;
        });
        checklistProgresses.forEach(prog => {
            prog.textContent = "0/0";
        });
        return;
    }

    let checkedCount = 0;
    
    // Создаем элементы чек-листа
    selectedVideo.checklist.forEach((item, index) => {
        if (item.checked) checkedCount++;
    });

    // Рендерим чек-лист во все контейнеры (и в Инфо, и во вкладку Задачи)
    checklistContainers.forEach(container => {
        selectedVideo.checklist.forEach((item, index) => {
            const div = document.createElement("div");
            div.className = `checklist-item ${item.checked ? 'checked' : ''}`;
            div.innerHTML = `
                <div class="checklist-checkbox">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <span class="checklist-text">${item.text}</span>
            `;

            div.addEventListener("click", () => {
                item.checked = !item.checked;
                renderChecklist();
            });

            container.appendChild(div);
        });
    });

    checklistProgresses.forEach(prog => {
        prog.textContent = `${checkedCount}/${selectedVideo.checklist.length}`;
    });
}

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
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                videos.push({
                    id: docSnap.id,
                    ...data
                });
            });
            
            renderVideosList();
            
            // Выбираем первое видео по умолчанию или восстанавливаем выбранное
            if (videos.length > 0) {
                if (!selectedVideo || !videos.some(v => v.id === selectedVideo.id)) {
                    selectVideoItem(videos[0].id);
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
        // Загрузка локальных данных
        videos = JSON.parse(localStorage.getItem("local_videos")) || [];
        if (videos.length === 0) {
            videos = [...initialVideos];
        }
        renderVideosList();
        if (videos.length > 0) {
            selectVideoItem(videos[0].id);
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
    detailStatusText.textContent = "--";
    detailStatusDot.className = "status-dot";
    infoDescription.textContent = "Описание видео появится здесь при выборе.";
    infoTags.innerHTML = "";
    infoDate.textContent = "--";
    infoLink.href = "#";
    infoLink.querySelector("span").textContent = "ссылка";
    infoPlaylist.textContent = "--";
    notesTextareas.forEach(textarea => {
        textarea.value = "";
    });
    filesList.innerHTML = `<div class="empty-state-tab">Файлы отсутствуют</div>`;
    checklistContainers.forEach(container => {
        container.innerHTML = `<div class="empty-state-tab">Задачи отсутствуют</div>`;
    });
    checklistProgresses.forEach(prog => {
        prog.textContent = "0/0";
    });
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
        
        const menuWidth = 180;
        const menuHeight = 100;
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

document.getElementById("btnVideoDelete").addEventListener("click", (e) => {
    e.stopPropagation();
    videoActionsDropdown.style.display = "none";
    if (activeMenuVideoId) {
        const video = videos.find(v => v.id === activeMenuVideoId);
        if (video) {
            confirmDeleteVideoTitle.textContent = video.title;
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
        if (currentUid) {
            try {
                await deleteDoc(doc(db, "users", currentUid, "videos", activeMenuVideoId));
            } catch (err) {
                console.error("Ошибка при удалении видео из Firestore:", err);
            }
        } else {
            videos = videos.filter(v => v.id !== activeMenuVideoId);
            localStorage.setItem("local_videos", JSON.stringify(videos));
            renderVideosList();
            if (videos.length > 0) {
                selectVideoItem(videos[0].id);
            } else {
                selectedVideo = null;
                clearDetailSidebar();
            }
        }
    }
});

confirmDeleteVideoModal.addEventListener("click", (e) => {
    if (e.target === confirmDeleteVideoModal) {
        confirmDeleteVideoModal.style.display = "none";
    }
});

