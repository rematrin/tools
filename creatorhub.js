// creatorhub.js

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
