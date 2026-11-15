// notion-levels.js - Интеграция базы данных Notion «Уровни» в виде календаря (Режим Неделя / Месяц)

(function () {
    'use strict';

    // Конфигурация прокси
    const PRIMARY_PROXY_URL = 'https://us-central1-tools-c98fd.cloudfunctions.net/notionProxy';

    // Состояние
    const state = {
        enabled: localStorage.getItem('todo_pref_notion_enabled') === 'true',
        token: localStorage.getItem('todo_pref_notion_token') || '',
        databaseId: localStorage.getItem('todo_pref_notion_db_id') || '',
        databaseTitle: 'Уровни',
        schema: {
            titleProp: null,
            dateProp: null,
            categoryProp: null,
            categoryType: 'select',
            categories: [] // [{ name, color }]
        },
        viewDate: new Date(),
        pages: [], // страницы текущего периода
        editingPage: null,
        cachedRange: {
            start: null,
            end: null
        }
    };

    // Месяцы на русском
    const MONTH_NAMES = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    const MONTH_NAMES_GENITIVE = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];

    const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    // Утилита для извлечения clean database ID из ссылки или строки
    function extractDatabaseId(input) {
        if (!input) return '';
        const trimmed = input.trim();
        const urlMatch = trimmed.match(/(?:notion\.so|notion\.site|app\.notion\.com)\/(?:p\/)?([a-zA-Z0-9]{32})/i) ||
            trimmed.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) ||
            trimmed.match(/([a-zA-Z0-9]{32})/);

        if (urlMatch && urlMatch[1]) {
            return urlMatch[1].replace(/-/g, '');
        }
        return trimmed.replace(/-/g, '');
    }

    // Форматирование даты в YYYY-MM-DD
    function formatDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Вычисление диапазона текущей недели (Пн — Вс)
    function getWeekRange(refDate) {
        const d = new Date(refDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Понедельник
        const monday = new Date(d);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        return { monday, sunday };
    }

    // Вызов Notion API через Cloud Function
    async function callNotionProxy(endpoint, method = 'POST', body = null) {
        if (!state.token) {
            throw new Error('Токен Notion не указан. Зайдите в Настройки -> Уровни (Notion).');
        }

        const payload = {
            token: state.token.trim(),
            endpoint,
            method,
            body
        };

        let response;
        try {
            response = await fetch(PRIMARY_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (netErr) {
            console.error('Ошибка сетевого запроса к прокси Notion:', netErr);
            throw new Error('Не удалось подключиться к серверу прокси. Проверьте интернет.');
        }

        if (response.status === 404) {
            throw new Error('Функция notionProxy еще не развернута в Firebase.');
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const msg = data.error?.message || data.message || data.error || `HTTP ${response.status}`;
            throw new Error(msg);
        }

        return data;
    }

    // Загрузка схемы базы данных (свойства, типы, опции категорий)
    async function fetchDatabaseSchema() {
        if (!state.databaseId) {
            throw new Error('ID базы данных Notion не указан.');
        }

        const db = await callNotionProxy(`databases/${state.databaseId}`, 'GET');

        if (db.title && db.title.length > 0) {
            state.databaseTitle = db.title.map(t => t.plain_text).join('') || 'Уровни';
        }

        let titleProp = null;
        let dateProp = null;
        let categoryProp = null;
        let categoryType = 'multi_select';
        let categories = [];

        if (db.properties) {
            const propKeys = Object.keys(db.properties);
            const preferredTagKey = propKeys.find(k => /^(tags|теги|категория|tag|category)$/i.test(k));

            for (const [propName, prop] of Object.entries(db.properties)) {
                if (prop.type === 'title' && !titleProp) {
                    titleProp = propName;
                } else if (prop.type === 'date' && !dateProp) {
                    dateProp = propName;
                } else if ((prop.type === 'select' || prop.type === 'multi_select')) {
                    if (!categoryProp || propName === preferredTagKey) {
                        categoryProp = propName;
                        categoryType = prop.type;
                        const opts = prop.select?.options || prop.multi_select?.options || [];
                        categories = opts.map(o => ({ name: o.name, color: o.color || 'default' }));
                    }
                }
            }
        }

        state.schema = {
            titleProp: titleProp || 'Name',
            dateProp: dateProp || 'Date',
            categoryProp: categoryProp || 'Tags',
            categoryType,
            categories
        };

        return { db, schema: state.schema };
    }

    // Проверка, покрыт ли текущий видимый период (неделя) кэшем
    function isPeriodCoveredByCache() {
        if (!state.cachedRange.start || !state.cachedRange.end || state.pages.length === 0) {
            return false;
        }

        const { monday, sunday } = getWeekRange(state.viewDate);
        const neededStart = formatDateKey(monday);
        const neededEnd = formatDateKey(sunday);

        return neededStart >= state.cachedRange.start && neededEnd <= state.cachedRange.end;
    }

    // Запрос записей из базы данных (загружает сразу диапазон: от 2 месяцев назад до 3 недель вперед)
    async function fetchDatabasePages(force = false) {
        if (!force && isPeriodCoveredByCache()) {
            return state.pages;
        }

        // Вычисляем диапазон загрузки с запасом: 2 месяца назад и 3 недели вперед
        const dStart = new Date(state.viewDate);
        dStart.setMonth(dStart.getMonth() - 2);
        dStart.setDate(1);

        const dEnd = new Date(state.viewDate);
        dEnd.setDate(dEnd.getDate() + 21);

        const startDate = formatDateKey(dStart);
        const endDate = formatDateKey(dEnd);

        let hasMore = true;
        let startCursor = undefined;
        const allResults = [];
        let iterations = 0;

        while (hasMore && iterations < 5) { // до 500 записей
            iterations++;
            const queryBody = {
                page_size: 100,
                start_cursor: startCursor,
                sorts: state.schema.dateProp ? [
                    {
                        property: state.schema.dateProp,
                        direction: 'ascending'
                    }
                ] : []
            };

            // Фильтрация по дате
            if (state.schema.dateProp && startDate && endDate) {
                queryBody.filter = {
                    and: [
                        {
                            property: state.schema.dateProp,
                            date: { on_or_after: startDate }
                        },
                        {
                            property: state.schema.dateProp,
                            date: { on_or_before: endDate }
                        }
                    ]
                };
            }

            const result = await callNotionProxy(`databases/${state.databaseId}/query`, 'POST', queryBody);
            if (result.results && result.results.length > 0) {
                allResults.push(...result.results);
            }
            hasMore = Boolean(result.has_more);
            startCursor = result.next_cursor;
        }

        state.cachedRange.start = startDate;
        state.cachedRange.end = endDate;
        state.pages = allResults;
        return state.pages;
    }

    // Создание новой карточки в Notion
    async function createPage(title, dateStr, categoryName) {
        const { titleProp, dateProp, categoryProp, categoryType } = state.schema;

        const properties = {};

        if (titleProp) {
            properties[titleProp] = {
                title: [{ text: { content: title.trim() } }]
            };
        }

        if (dateProp && dateStr) {
            properties[dateProp] = {
                date: { start: dateStr }
            };
        }

        if (categoryProp && categoryName) {
            if (categoryType === 'multi_select') {
                properties[categoryProp] = {
                    multi_select: [{ name: categoryName }]
                };
            } else {
                properties[categoryProp] = {
                    select: { name: categoryName }
                };
            }
        }

        const body = {
            parent: { database_id: state.databaseId },
            properties
        };

        return await callNotionProxy('pages', 'POST', body);
    }

    // Обновление карточки в Notion
    async function updatePage(pageId, title, dateStr, categoryName) {
        const { titleProp, dateProp, categoryProp, categoryType } = state.schema;

        const properties = {};

        if (titleProp) {
            properties[titleProp] = {
                title: [{ text: { content: title.trim() } }]
            };
        }

        if (dateProp) {
            properties[dateProp] = {
                date: dateStr ? { start: dateStr } : null
            };
        }

        if (categoryProp) {
            if (categoryType === 'multi_select') {
                properties[categoryProp] = {
                    multi_select: categoryName ? [{ name: categoryName }] : []
                };
            } else {
                properties[categoryProp] = {
                    select: categoryName ? { name: categoryName } : null
                };
            }
        }

        return await callNotionProxy(`pages/${pageId}`, 'PATCH', { properties });
    }

    // Архивирование (удаление) карточки
    async function deletePage(pageId) {
        return await callNotionProxy(`pages/${pageId}`, 'PATCH', { archived: true });
    }

    // Извлечение данных из страницы Notion
    function parsePageData(page) {
        const { titleProp, dateProp, categoryProp } = state.schema;
        const props = page.properties || {};

        let title = 'Без названия';
        if (titleProp && props[titleProp]) {
            const titleArr = props[titleProp].title || [];
            title = titleArr.map(t => t.plain_text).join('') || 'Без названия';
        }

        let dateStr = null;
        if (dateProp && props[dateProp] && props[dateProp].date) {
            dateStr = props[dateProp].date.start ? props[dateProp].date.start.split('T')[0] : null;
        }

        let categories = [];
        if (categoryProp && props[categoryProp]) {
            const p = props[categoryProp];
            if (p.select && p.select.name) {
                categories.push({ name: p.select.name, color: p.select.color || 'default' });
            } else if (p.multi_select && p.multi_select.length > 0) {
                categories = p.multi_select.map(item => ({ name: item.name, color: item.color || 'default' }));
            }
        }

        return {
            id: page.id,
            title,
            date: dateStr,
            category: categories.length > 0 ? categories[0].name : null,
            categories,
            raw: page
        };
    }

    // =========================================================
    // Отрисовка календаря (Режим: Неделя)
    // =========================================================
    function renderCalendar() {
        const gridEl = document.getElementById('levelsGrid');
        const periodTitleEl = document.getElementById('levelsCurrentPeriod');
        const dbPillEl = document.getElementById('levelsDbPill');

        if (!gridEl || !periodTitleEl) return;

        if (dbPillEl) {
            dbPillEl.textContent = state.databaseTitle || 'Уровни';
        }

        const today = new Date();
        const todayStr = formatDateKey(today);

        // Группировка распарсенных карточек по дате
        const cardsByDate = {};
        for (const page of state.pages) {
            const item = parsePageData(page);
            if (item.date) {
                if (!cardsByDate[item.date]) cardsByDate[item.date] = [];
                cardsByDate[item.date].push(item);
            }
        }

        gridEl.innerHTML = '';
        gridEl.classList.add('week-mode');

        const { monday, sunday } = getWeekRange(state.viewDate);

        // Заголовок недели: "9 — 15 ноября 2026"
        const monM = monday.getMonth();
        const sunM = sunday.getMonth();
        if (monM === sunM) {
            periodTitleEl.textContent = `${monday.getDate()} — ${sunday.getDate()} ${MONTH_NAMES_GENITIVE[monM]} ${monday.getFullYear()}`;
        } else {
            periodTitleEl.textContent = `${monday.getDate()} ${MONTH_NAMES_GENITIVE[monM]} — ${sunday.getDate()} ${MONTH_NAMES_GENITIVE[sunM]} ${sunday.getFullYear()}`;
        }

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(monday);
            dayDate.setDate(monday.getDate() + i);
            const dateStr = formatDateKey(dayDate);
            const isToday = dateStr === todayStr;
            const isWeekend = i === 5 || i === 6; // Суббота (5) и Воскресенье (6)
            const weekdayName = WEEKDAYS_SHORT[i];
            const dayNum = dayDate.getDate();

            const cell = createWeekColumnCell(weekdayName, dayNum, dateStr, isToday, isWeekend, cardsByDate[dateStr] || []);
            gridEl.appendChild(cell);
        }
    }

    // Создание колонки для режима "Неделя" (точно как на скриншоте Notion)
    function createWeekColumnCell(weekdayName, dayNum, dateStr, isToday, isWeekend, cards) {
        const cell = document.createElement('div');
        cell.className = `levels-day-cell${isToday ? ' is-today' : ''}${isWeekend ? ' is-weekend' : ''}`;
        cell.dataset.date = dateStr;

        const header = document.createElement('div');
        header.className = 'levels-day-header';

        const titleWrap = document.createElement('div');
        titleWrap.className = 'levels-day-title-wrap';

        const weekdayLabel = document.createElement('span');
        weekdayLabel.className = 'levels-day-weekday-name';
        weekdayLabel.textContent = weekdayName;
        titleWrap.appendChild(weekdayLabel);

        const num = document.createElement('div');
        num.className = 'levels-day-num';
        num.textContent = dayNum;
        titleWrap.appendChild(num);

        header.appendChild(titleWrap);

        const addBtn = document.createElement('button');
        addBtn.className = 'levels-day-quick-add';
        addBtn.type = 'button';
        addBtn.title = 'Добавить запись';
        addBtn.innerHTML = '+';
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCardModal(null, dateStr);
        });
        header.appendChild(addBtn);

        cell.appendChild(header);

        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'levels-day-cards';

        for (const card of cards) {
            cardsContainer.appendChild(createCardElement(card, dateStr));
        }

        cell.appendChild(cardsContainer);
        return cell;
    }

    // Элемент карточки задачи
    function createCardElement(card, dateStr) {
        const cardEl = document.createElement('div');
        cardEl.className = 'levels-card';
        cardEl.dataset.id = card.id;

        const titleEl = document.createElement('div');
        titleEl.className = 'levels-card-title';
        titleEl.textContent = card.title;
        cardEl.appendChild(titleEl);

        if (card.categories && card.categories.length > 0) {
            const tagsWrap = document.createElement('div');
            tagsWrap.style.display = 'flex';
            tagsWrap.style.flexWrap = 'wrap';
            tagsWrap.style.gap = '4px';

            for (const cat of card.categories) {
                const tagEl = document.createElement('div');
                tagEl.className = `levels-card-tag notion-tag-${cat.color || 'default'}`;
                tagEl.textContent = cat.name;
                tagsWrap.appendChild(tagEl);
            }
            cardEl.appendChild(tagsWrap);
        }

        cardEl.addEventListener('click', (e) => {
            e.stopPropagation();
            openCardModal(card, dateStr);
        });

        return cardEl;
    }

    // =========================================================
    // Карточка (Создание / Редактирование)
    // =========================================================
    function renderCustomCategorySelect(selectedCategoryName = '') {
        const trigger = document.getElementById('levelsCardCategoryTrigger');
        const display = document.getElementById('levelsCardCategoryDisplay');
        const dropdown = document.getElementById('levelsCardCategoryDropdown');
        const optionsContainer = document.getElementById('levelsCardCategoryOptions');
        const hiddenInput = document.getElementById('levelsCardCategorySelect');
        const searchInput = document.getElementById('levelsCardCategorySearch');

        if (!trigger || !optionsContainer || !hiddenInput) return;

        hiddenInput.value = selectedCategoryName || '';

        function updateDisplay(catName) {
            if (!catName) {
                display.innerHTML = '<span class="levels-card-tag notion-tag-default" style="opacity: 0.65;">(Без категории)</span>';
            } else {
                const found = (state.schema.categories || []).find(c => c.name === catName);
                const color = found ? found.color : 'default';
                display.innerHTML = `<span class="levels-card-tag notion-tag-${color}">${catName}</span>`;
            }
        }

        updateDisplay(selectedCategoryName);

        function buildOptions() {
            optionsContainer.innerHTML = '';

            // Опция "Без категории"
            const noneOpt = document.createElement('div');
            noneOpt.className = `notion-select-option${!hiddenInput.value ? ' selected' : ''}`;
            noneOpt.innerHTML = '<span class="levels-card-tag notion-tag-default" style="opacity: 0.65;">(Без категории)</span>';
            noneOpt.addEventListener('click', (e) => {
                e.stopPropagation();
                hiddenInput.value = '';
                updateDisplay('');
                closeDropdown();
            });
            optionsContainer.appendChild(noneOpt);

            for (const cat of (state.schema.categories || [])) {
                const opt = document.createElement('div');
                opt.className = `notion-select-option${hiddenInput.value === cat.name ? ' selected' : ''}`;
                opt.innerHTML = `<span class="levels-card-tag notion-tag-${cat.color || 'default'}">${cat.name}</span>`;

                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hiddenInput.value = cat.name;
                    updateDisplay(cat.name);
                    closeDropdown();
                });

                optionsContainer.appendChild(opt);
            }
        }

        buildOptions();

        function openDropdown() {
            dropdown.style.display = 'flex';
            trigger.classList.add('active');
        }

        function closeDropdown() {
            dropdown.style.display = 'none';
            trigger.classList.remove('active');
        }

        trigger.onclick = (e) => {
            e.stopPropagation();
            if (dropdown.style.display === 'flex') {
                closeDropdown();
            } else {
                openDropdown();
            }
        };

        const handleOutsideClick = (e) => {
            if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                closeDropdown();
                document.removeEventListener('click', handleOutsideClick);
            }
        };
        document.addEventListener('click', handleOutsideClick);
    }

    function openCardModal(card = null, defaultDateStr = '') {
        state.editingPage = card;

        const modalEl = document.getElementById('levelsCardModal');
        const titleInput = document.getElementById('levelsCardTitleInput');
        const dateInput = document.getElementById('levelsCardDateInput');
        const deleteBtn = document.getElementById('btnLevelsCardDelete');
        const modalTitle = document.getElementById('levelsCardModalTitle');

        if (!modalEl) return;

        const initialCategory = card ? (card.category || '') : '';
        renderCustomCategorySelect(initialCategory);

        if (card) {
            modalTitle.textContent = 'Редактировать запись';
            titleInput.value = card.title || '';
            dateInput.value = card.date || defaultDateStr || '';
            if (deleteBtn) deleteBtn.style.display = 'block';
        } else {
            modalTitle.textContent = 'Новая запись в Notion';
            titleInput.value = '';
            dateInput.value = defaultDateStr || formatDateKey(new Date());
            if (deleteBtn) deleteBtn.style.display = 'none';
        }

        modalEl.style.display = 'flex';
        setTimeout(() => titleInput.focus(), 50);
    }

    function closeCardModal() {
        const modalEl = document.getElementById('levelsCardModal');
        const dropdown = document.getElementById('levelsCardCategoryDropdown');
        const trigger = document.getElementById('levelsCardCategoryTrigger');
        if (dropdown) dropdown.style.display = 'none';
        if (trigger) trigger.classList.remove('active');
        if (modalEl) modalEl.style.display = 'none';
        state.editingPage = null;
    }

    async function handleSaveCard() {
        const titleInput = document.getElementById('levelsCardTitleInput');
        const dateInput = document.getElementById('levelsCardDateInput');
        const categorySelect = document.getElementById('levelsCardCategorySelect');
        const saveBtn = document.getElementById('btnLevelsCardSave');

        const title = titleInput.value.trim();
        if (!title) {
            titleInput.focus();
            return;
        }

        const dateStr = dateInput.value;
        const category = categorySelect.value;

        showLoader(true, 'Сохранение в Notion...');
        saveBtn.disabled = true;

        try {
            if (state.editingPage) {
                await updatePage(state.editingPage.id, title, dateStr, category);
            } else {
                await createPage(title, dateStr, category);
            }
            closeCardModal();
            await refreshLevels(true);
        } catch (err) {
            alert('Ошибка сохранения в Notion: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            showLoader(false);
        }
    }

    async function handleDeleteCard() {
        if (!state.editingPage) return;
        if (!confirm('Вы уверены, что хотите удалить эту запись из Notion?')) return;

        showLoader(true, 'Удаление из Notion...');
        try {
            await deletePage(state.editingPage.id);
            closeCardModal();
            await refreshLevels(true);
        } catch (err) {
            alert('Ошибка удаления: ' + err.message);
        } finally {
            showLoader(false);
        }
    }

    // Лоадер в календаре
    function showLoader(show, text = 'Получаем записи из Notion...') {
        const loader = document.getElementById('levelsLoader');
        const loaderText = document.getElementById('levelsLoaderText');
        if (!loader) return;

        if (show) {
            if (loaderText) loaderText.textContent = text;
            loader.style.display = 'flex';
        } else {
            loader.style.display = 'none';
        }
    }

    // Загрузка и обновление данных календаря
    async function refreshLevels(force = false) {
        if (!force && isPeriodCoveredByCache()) {
            renderCalendar();
            return;
        }

        showLoader(true, 'Получаем записи из Notion...');
        try {
            await fetchDatabaseSchema();
            await fetchDatabasePages(force);
            renderCalendar();
        } catch (err) {
            console.error('Ошибка загрузки Уровней:', err);
            const gridEl = document.getElementById('levelsGrid');
            if (gridEl) {
                gridEl.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: var(--text-secondary);">
                        <p style="font-size: 1rem; color: #ef4444; font-weight: 600; margin-bottom: 8px;">Не удалось загрузить данные из Notion</p>
                        <p style="font-size: 0.85rem; max-width: 500px; margin: 0 auto 16px;">${err.message}</p>
                        <button class="notion-btn-primary" id="btnLevelsRetry" type="button">Попробовать снова</button>
                    </div>
                `;
                const retryBtn = document.getElementById('btnLevelsRetry');
                if (retryBtn) retryBtn.addEventListener('click', () => refreshLevels(true));
            }
        } finally {
            showLoader(false);
        }
    }

    // Открытие модального окна «Уровни»
    function openLevelsModal() {
        const modal = document.getElementById('levelsModal');
        if (!modal) return;

        const userMenu = document.getElementById('userProfileMenu');
        if (userMenu) userMenu.style.display = 'none';

        modal.style.display = 'flex';
        refreshLevels();
    }

    function closeLevelsModal() {
        const modal = document.getElementById('levelsModal');
        if (modal) modal.style.display = 'none';
    }

    // Обновление видимости кнопки в меню профиля
    function updateMenuVisibility() {
        const menuBtn = document.getElementById('btnUserMenuLevels');
        if (menuBtn) {
            menuBtn.style.display = state.enabled ? 'flex' : 'none';
        }
    }

    // Сохранение настроек в Firestore (если пользователь авторизован)
    async function syncSettingsToFirestore() {
        try {
            const auth = window.firebaseAuth || (window.firebase && window.firebase.auth ? window.firebase.auth() : null);
            const user = auth ? auth.currentUser : null;
            if (user && window.firebaseDb) {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const userRef = doc(window.firebaseDb, "users", user.uid);
                await setDoc(userRef, {
                    notion_config: {
                        enabled: state.enabled,
                        token: state.token,
                        database_id: state.databaseId
                    }
                }, { merge: true });
                console.log('Настройки Notion успешно синхронизированы в Firestore.');
            }
        } catch (e) {
            console.warn('Не удалось синхронизировать настройки Notion в Firestore:', e);
        }
    }

    // Загрузка настроек из Firestore
    async function loadSettingsFromFirestore(user) {
        if (!user || !window.firebaseDb) return;
        try {
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const userRef = doc(window.firebaseDb, "users", user.uid);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.notion_config) {
                    const cfg = data.notion_config;
                    if (cfg.token) {
                        state.token = cfg.token;
                        localStorage.setItem('todo_pref_notion_token', cfg.token);
                    }
                    if (cfg.database_id) {
                        state.databaseId = cfg.database_id;
                        localStorage.setItem('todo_pref_notion_db_id', cfg.database_id);
                    }
                    if (cfg.enabled !== undefined) {
                        state.enabled = Boolean(cfg.enabled);
                        localStorage.setItem('todo_pref_notion_enabled', state.enabled ? 'true' : 'false');
                    }
                    syncUIFromState();
                    updateMenuVisibility();
                }
            }
        } catch (e) {
            console.warn('Не удалось загрузить настройки Notion из Firestore:', e);
        }
    }

    function syncUIFromState() {
        const toggle = document.getElementById('prefNotionEnabled');
        const tokenInput = document.getElementById('prefNotionToken');
        const dbInput = document.getElementById('prefNotionDbId');

        if (toggle) toggle.checked = state.enabled;
        if (tokenInput && !tokenInput.value) tokenInput.value = state.token;
        if (dbInput && !dbInput.value) dbInput.value = state.databaseId;
    }

    // Инициализация событий и привязка к DOM
    function init() {
        syncUIFromState();
        updateMenuVisibility();

        // 1. Кнопка «Уровни» в выпадающем меню пользователя
        const userLevelsBtn = document.getElementById('btnUserMenuLevels');
        if (userLevelsBtn) {
            userLevelsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openLevelsModal();
            });
        }

        // 2. Закрытие модального окна Уровней
        const closeLevelsBtn = document.getElementById('btnLevelsClose');
        if (closeLevelsBtn) {
            closeLevelsBtn.addEventListener('click', closeLevelsModal);
        }
        const levelsOverlay = document.getElementById('levelsModal');
        if (levelsOverlay) {
            levelsOverlay.addEventListener('click', (e) => {
                if (e.target === levelsOverlay) closeLevelsModal();
            });
        }

        // 3. Кнопки навигации по неделям
        const prevBtn = document.getElementById('btnLevelsPrev');
        if (prevBtn) {
            prevBtn.addEventListener('click', async () => {
                state.viewDate.setDate(state.viewDate.getDate() - 7);
                renderCalendar();
                await refreshLevels(false);
            });
        }

        const nextBtn = document.getElementById('btnLevelsNext');
        if (nextBtn) {
            nextBtn.addEventListener('click', async () => {
                state.viewDate.setDate(state.viewDate.getDate() + 7);
                renderCalendar();
                await refreshLevels(false);
            });
        }

        const todayBtn = document.getElementById('btnLevelsToday');
        if (todayBtn) {
            todayBtn.addEventListener('click', async () => {
                state.viewDate = new Date();
                renderCalendar();
                await refreshLevels(false);
            });
        }

        // 4. Модалка карточки (сохранить, удалить, отмена)
        const saveCardBtn = document.getElementById('btnLevelsCardSave');
        if (saveCardBtn) saveCardBtn.addEventListener('click', handleSaveCard);

        const deleteCardBtn = document.getElementById('btnLevelsCardDelete');
        if (deleteCardBtn) deleteCardBtn.addEventListener('click', handleDeleteCard);

        const cancelCardBtn = document.getElementById('btnLevelsCardCancel');
        if (cancelCardBtn) cancelCardBtn.addEventListener('click', closeCardModal);

        const cardModalOverlay = document.getElementById('levelsCardModal');
        if (cardModalOverlay) {
            cardModalOverlay.addEventListener('click', (e) => {
                if (e.target === cardModalOverlay) closeCardModal();
            });
        }

        // 7. Настройки Notion
        const toggleEnabled = document.getElementById('prefNotionEnabled');
        if (toggleEnabled) {
            toggleEnabled.addEventListener('change', (e) => {
                state.enabled = e.target.checked;
                localStorage.setItem('todo_pref_notion_enabled', state.enabled ? 'true' : 'false');
                updateMenuVisibility();
                syncSettingsToFirestore();
            });
        }

        const btnSaveSettings = document.getElementById('btnNotionSaveSettings');
        const statusBox = document.getElementById('notionSettingsStatus');

        if (btnSaveSettings) {
            btnSaveSettings.addEventListener('click', async () => {
                const tokenInput = document.getElementById('prefNotionToken');
                const dbInput = document.getElementById('prefNotionDbId');

                const rawToken = tokenInput.value.trim();
                const rawDb = dbInput.value.trim();

                if (!rawToken) {
                    showStatus('Пожалуйста, введите токен интеграции Notion (ntn_... или secret_...).', 'error');
                    return;
                }

                const cleanDbId = extractDatabaseId(rawDb);
                if (!cleanDbId) {
                    showStatus('Пожалуйста, введите ссылку на базу данных Notion или её ID.', 'error');
                    return;
                }

                state.token = rawToken;
                state.databaseId = cleanDbId;

                showStatus('Проверка подключения к Notion...', 'loading');
                btnSaveSettings.disabled = true;

                try {
                    const { schema } = await fetchDatabaseSchema();

                    localStorage.setItem('todo_pref_notion_token', state.token);
                    localStorage.setItem('todo_pref_notion_db_id', state.databaseId);

                    state.enabled = true;
                    localStorage.setItem('todo_pref_notion_enabled', 'true');
                    if (toggleEnabled) toggleEnabled.checked = true;
                    updateMenuVisibility();

                    await syncSettingsToFirestore();

                    const dbTitle = state.databaseTitle || 'Уровни';
                    const tagsCount = schema.categories.length;
                    showStatus(`Успешно подключено к базе «${dbTitle}»! Найдено тегов/категорий: ${tagsCount}. Раздел «Уровни» активирован.`, 'success');
                } catch (err) {
                    console.error('Ошибка проверки Notion:', err);
                    showStatus(`Ошибка подключения: ${err.message}`, 'error');
                } finally {
                    btnSaveSettings.disabled = false;
                }
            });
        }

        function showStatus(text, type) {
            if (!statusBox) return;
            statusBox.className = `notion-status-box ${type}`;
            statusBox.style.display = 'flex';
            statusBox.textContent = text;
        }

        // Подписка на авторизацию Firebase
        window.addEventListener('authChanged', (e) => {
            if (e.detail && e.detail.user) {
                loadSettingsFromFirestore(e.detail.user);
            }
        });

        if (window.currentUser) {
            loadSettingsFromFirestore(window.currentUser);
        }
    }

    // Экспорт в глобальный scope
    window.NotionLevels = {
        open: openLevelsModal,
        close: closeLevelsModal,
        refresh: refreshLevels,
        state
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
