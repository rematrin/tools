// shopping.js - Логика игрового низкополигонального списка покупок и базы товаров

(function () {
    // Единственная заглушка для низкополигональных 3D продуктов
    const PLACEHOLDER_IMG = 'img/lowpoly-food.svg';

    // Демонстрационные товары для списка покупок в режиме #test
    const DEMO_ITEMS = [
        { id: 'demo_1', name: 'Молоко', completed: false, createdAt: 1000 },
        { id: 'demo_2', name: 'Хлеб', completed: false, createdAt: 2000 },
        { id: 'demo_3', name: 'Яйца', completed: false, createdAt: 3000 },
        { id: 'demo_4', name: 'Яблоки', completed: false, createdAt: 4000 },
        { id: 'demo_5', name: 'Сыр', completed: false, createdAt: 5000 },
        { id: 'demo_6', name: 'Бананы', completed: false, createdAt: 6000 },
        { id: 'demo_7', name: 'Помидоры', completed: true, createdAt: 7000 }
    ];

    // Демонстрационная база товаров пользователя («Мои товары») для режима #test
    const DEMO_CATALOG_PRODUCTS = [
        { id: 'prod_1', name: 'Молоко', category: 'dairy' },
        { id: 'prod_2', name: 'Хлеб', category: 'other' },
        { id: 'prod_3', name: 'Яйца', category: 'other' },
        { id: 'prod_4', name: 'Яблоки', category: 'fruits' },
        { id: 'prod_5', name: 'Сыр', category: 'dairy' },
        { id: 'prod_6', name: 'Бананы', category: 'fruits' },
        { id: 'prod_7', name: 'Помидоры', category: 'vegetables' },
        { id: 'prod_8', name: 'Вода', category: 'other' },
        { id: 'prod_9', name: 'Огурцы', category: 'vegetables' },
        { id: 'prod_10', name: 'Брокколи', category: 'vegetables' }
    ];

    // Глобальное состояние
    let shoppingItems = [];
    let userProducts = [];
    let currentUid = null;
    let unsubItems = null;
    let unsubProducts = null;

    let currentMainTab = 'shoppingList'; // 'shoppingList' или 'myProducts'
    let currentCategoryFilter = 'all';  // 'all', 'vegetables', 'fruits', 'dairy'
    let currentViewMode = localStorage.getItem('shopping_view_mode') || 'list';

    function isTestMode() {
        const hash = (window.location.hash || '').toLowerCase();
        const search = (window.location.search || '').toLowerCase();
        return hash.includes('test') || search.includes('test');
    }

    // Получение DOM-элементов
    function getEls() {
        return {
            mainTabsNav: document.getElementById('mainTabsNav'),
            tabsSliderIndicator: document.getElementById('tabsSliderIndicator'),
            tabShoppingList: document.getElementById('tabShoppingList'),
            tabMyProducts: document.getElementById('tabMyProducts'),
            screenShoppingList: document.getElementById('screenShoppingList'),
            screenMyProducts: document.getElementById('screenMyProducts'),
            catalogFilters: document.getElementById('catalogFilters'),
            catalogProductsGrid: document.getElementById('catalogProductsGrid'),
            viewTogglePill: document.getElementById('viewTogglePill'),
            btnViewList: document.getElementById('btnViewList'),
            btnViewGrid: document.getElementById('btnViewGrid'),
            activeItemsList: document.getElementById('activeItemsList'),
            boughtItemsList: document.getElementById('boughtItemsList'),
            boughtSection: document.getElementById('boughtSection'),
            boughtToggleHeader: document.getElementById('boughtToggleHeader'),
            emptyState: document.getElementById('emptyState'),
            testModeBanner: document.getElementById('testModeBanner'),
            bottomAction: document.getElementById('btnOpenAddModal'),
            btnOpenAddModal: document.getElementById('btnOpenAddModal'),
            addModalOverlay: document.getElementById('addModalOverlay'),
            modalSheetTitle: document.querySelector('.sheet-title'),
            modalItemInput: document.getElementById('modalItemInput'),
            btnConfirmAdd: document.getElementById('btnConfirmAdd'),
            btnExitTestMode: document.getElementById('btnExitTestMode')
        };
    }

    // === ПЕРЕКЛЮЧЕНИЕ ГЛАВНЫХ ВКЛАДОК («СПИСОК ПОКУПОК» / «МОИ ТОВАРЫ») ===
    function setMainTab(tab) {
        currentMainTab = tab;
        const els = getEls();
        if (!els.tabShoppingList || !els.tabMyProducts) return;

        // Плавное перемещение ползунка (0% или 100%)
        if (els.tabsSliderIndicator) {
            els.tabsSliderIndicator.style.transform = (tab === 'myProducts') ? 'translateX(100%)' : 'translateX(0%)';
        }

        if (tab === 'myProducts') {
            els.tabMyProducts.classList.add('active');
            els.tabMyProducts.setAttribute('aria-selected', 'true');
            els.tabShoppingList.classList.remove('active');
            els.tabShoppingList.setAttribute('aria-selected', 'false');

            if (els.screenShoppingList) els.screenShoppingList.style.display = 'none';
            if (els.screenMyProducts) els.screenMyProducts.style.display = 'flex';
            if (els.viewTogglePill) els.viewTogglePill.style.display = 'inline-flex';

            // В настоящем режиме фильтры категорий скрыты — они отображаются только в тестовом режиме (#test)
            if (els.catalogFilters) {
                els.catalogFilters.style.display = isTestMode() ? 'flex' : 'none';
            }

            renderCatalog();
        } else {
            els.tabShoppingList.classList.add('active');
            els.tabShoppingList.setAttribute('aria-selected', 'true');
            els.tabMyProducts.classList.remove('active');
            els.tabMyProducts.setAttribute('aria-selected', 'false');

            if (els.screenShoppingList) els.screenShoppingList.style.display = 'flex';
            if (els.screenMyProducts) els.screenMyProducts.style.display = 'none';
            if (els.viewTogglePill) els.viewTogglePill.style.display = 'inline-flex';

            renderItems();
        }
    }

    // === ИНТЕРАКТИВНЫЙ ЖЕСТ СВАЙПА / ПЕРЕТАСКИВАНИЯ ПОЛЗУНКА ПАЛЬЦЕМ (КАК В TODO.HTML) ===
    function initTabsDragGesture() {
        const els = getEls();
        const nav = els.mainTabsNav;
        const indicator = els.tabsSliderIndicator;
        if (!nav || !indicator) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let hasMoved = false;
        let rect = null;

        function updateHoveredTab(index) {
            if (index === 1) {
                els.tabMyProducts.classList.add('active');
                els.tabShoppingList.classList.remove('active');
            } else {
                els.tabShoppingList.classList.add('active');
                els.tabMyProducts.classList.remove('active');
            }
        }

        function onPointerDown(e) {
            if (e.type === 'pointerdown' && e.pointerType === 'touch') return;
            if (e.button && e.button !== 0) return;

            rect = nav.getBoundingClientRect();
            if (!rect || !rect.width) return;

            isDragging = true;
            hasMoved = false;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;
            currentX = clientX;
        }

        function onPointerMove(e) {
            if (!isDragging) return;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const deltaX = Math.abs(clientX - startX);
            const deltaY = Math.abs(clientY - startY);

            if (!hasMoved) {
                if (deltaX > 6 && deltaX > deltaY) {
                    hasMoved = true;
                    indicator.classList.add('dragging');
                } else if (deltaY > 6) {
                    isDragging = false;
                    return;
                }
            }

            if (hasMoved) {
                if (e.cancelable) e.preventDefault();

                currentX = clientX;
                const touchX = currentX - rect.left;
                // Ползунок занимает 50% ширины
                let fraction = (touchX - (rect.width / 4)) / (rect.width / 2);
                fraction = Math.max(0, Math.min(1, fraction));

                indicator.style.transform = `translateX(${fraction * 100}%)`;

                const hoveredIndex = fraction >= 0.5 ? 1 : 0;
                updateHoveredTab(hoveredIndex);
            }
        }

        function onPointerEnd(e) {
            if (!isDragging) return;
            isDragging = false;

            if (!hasMoved) {
                // Обычный клик: нативный обработчик клика переключит вкладку
                return;
            }

            indicator.classList.remove('dragging');

            if (!rect || !rect.width) {
                setMainTab(currentMainTab);
                return;
            }

            const touchX = currentX - rect.left;
            const targetTab = touchX >= (rect.width / 2) ? 'myProducts' : 'shoppingList';
            setMainTab(targetTab);

            // Предотвращаем случайное срабатывание click после драга
            const preventClick = (clickEvent) => {
                clickEvent.preventDefault();
                clickEvent.stopPropagation();
                window.removeEventListener('click', preventClick, true);
            };
            window.addEventListener('click', preventClick, true);
            setTimeout(() => window.removeEventListener('click', preventClick, true), 100);
        }

        nav.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerEnd);
        window.addEventListener('touchcancel', onPointerEnd);

        nav.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerEnd);
    }

    // === РЕНДЕР КАТАЛОГА («МОИ ТОВАРЫ») ===
    function renderCatalog() {
        const els = getEls();
        if (!els.catalogProductsGrid) return;

        if (userProducts.length === 0) {
            els.catalogProductsGrid.innerHTML = `
                <div class="empty-game-state" style="display: flex; margin-top: 40px; width: 100%; grid-column: 1 / -1;">
                    <img src="${PLACEHOLDER_IMG}" alt="Пусто" class="empty-game-icon">
                    <h2 class="empty-game-title">База товаров пуста</h2>
                    <p class="empty-game-desc">Нажмите на плюс внизу, чтобы добавить первый товар в базу</p>
                </div>
            `;
            return;
        }

        let items = userProducts;
        if (currentCategoryFilter !== 'all') {
            items = items.filter(p => p.category === currentCategoryFilter);
        }

        if (items.length === 0) {
            els.catalogProductsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; width: 100%; text-align: center; padding: 40px 10px; color: var(--text-muted); font-size: 0.95rem;">
                    В этой категории нет товаров
                </div>
            `;
            return;
        }

        els.catalogProductsGrid.innerHTML = items.map(prod => {
            // Проверяем, добавлен ли уже этот товар в список покупок (активный)
            const isAlreadyAdded = shoppingItems.some(i => i.name.toLowerCase() === prod.name.toLowerCase() && !i.completed);

            const actionBtnHtml = `
                <button class="btn-product-add ${isAlreadyAdded ? 'is-added' : ''}" type="button" aria-label="${isAlreadyAdded ? 'Уже в списке' : 'Добавить в список'}">
                    ${isAlreadyAdded ? `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    ` : `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    `}
                </button>
            `;

            if (currentViewMode === 'grid') {
                // Вид сетки (квадраты 1:1)
                return `
                    <div class="product-catalog-card" data-id="${prod.id}" data-name="${escapeHtml(prod.name)}">
                        <div class="card-img-wrap">
                            <img src="${PLACEHOLDER_IMG}" alt="${escapeHtml(prod.name)}" class="card-img" draggable="false">
                        </div>
                        <div class="card-bottom-row">
                            <span class="card-title">${escapeHtml(prod.name)}</span>
                            ${actionBtnHtml}
                        </div>
                    </div>
                `;
            } else {
                // Вид списка (картинка слева, название в центре, кнопка справа как на скриншоте)
                return `
                    <div class="product-catalog-card" data-id="${prod.id}" data-name="${escapeHtml(prod.name)}">
                        <div class="card-left">
                            <div class="card-img-wrap">
                                <img src="${PLACEHOLDER_IMG}" alt="${escapeHtml(prod.name)}" class="card-img" draggable="false">
                            </div>
                            <span class="card-title">${escapeHtml(prod.name)}</span>
                        </div>
                        ${actionBtnHtml}
                    </div>
                `;
            }
        }).join('');

        // Клики по кнопкам добавления в каталог
        els.catalogProductsGrid.querySelectorAll('.btn-product-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.product-catalog-card');
                if (!card) return;
                const name = card.getAttribute('data-name');
                if (!name) return;

                // Проверяем наличие
                const existingIndex = shoppingItems.findIndex(i => i.name.toLowerCase() === name.toLowerCase() && !i.completed);
                if (existingIndex !== -1) {
                    // Если уже был — убираем из списка при повторном клике (переключатель)
                    shoppingItems.splice(existingIndex, 1);
                } else {
                    // Добавляем в список покупок
                    shoppingItems.unshift({
                        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        name: name,
                        completed: false,
                        createdAt: Date.now()
                    });
                }

                saveLocalCache();
                renderCatalog(); // Перерисовываем статус кнопки
            });
        });
    }

    // === ПЕРЕКЛЮЧЕНИЕ РЕЖИМА СЕТКА / СПИСОК (ДЛЯ ОБОИХ ЭКРАНОВ) ===
    function setViewMode(mode) {
        currentViewMode = mode;
        try {
            localStorage.setItem('shopping_view_mode', mode);
        } catch (e) {}

        const els = getEls();
        if (!els.btnViewList || !els.btnViewGrid) return;

        if (mode === 'grid') {
            els.btnViewGrid.classList.add('active');
            els.btnViewGrid.setAttribute('aria-selected', 'true');
            els.btnViewList.classList.remove('active');
            els.btnViewList.setAttribute('aria-selected', 'false');

            if (els.activeItemsList) {
                els.activeItemsList.classList.remove('view-list');
                els.activeItemsList.classList.add('view-grid');
            }
            if (els.boughtItemsList) {
                els.boughtItemsList.classList.remove('view-list');
                els.boughtItemsList.classList.add('view-grid');
            }
            if (els.catalogProductsGrid) {
                els.catalogProductsGrid.classList.remove('view-list');
                els.catalogProductsGrid.classList.add('view-grid');
            }
        } else {
            els.btnViewList.classList.add('active');
            els.btnViewList.setAttribute('aria-selected', 'true');
            els.btnViewGrid.classList.remove('active');
            els.btnViewGrid.setAttribute('aria-selected', 'false');

            if (els.activeItemsList) {
                els.activeItemsList.classList.remove('view-grid');
                els.activeItemsList.classList.add('view-list');
            }
            if (els.boughtItemsList) {
                els.boughtItemsList.classList.remove('view-grid');
                els.boughtItemsList.classList.add('view-list');
            }
            if (els.catalogProductsGrid) {
                els.catalogProductsGrid.classList.remove('view-grid');
                els.catalogProductsGrid.classList.add('view-list');
            }
        }

        if (currentMainTab === 'myProducts') {
            renderCatalog();
        } else {
            renderItems();
        }
    }

    // === РЕНДЕР КАРТОЧЕК СПИСКА ПОКУПОК ===
    function renderItems() {
        const els = getEls();
        if (!els.activeItemsList || !els.boughtItemsList) return;

        const active = shoppingItems.filter(i => !i.completed);
        const bought = shoppingItems.filter(i => i.completed);

        // Если товаров вообще нет (в обычном режиме) — показываем пустое состояние
        if (shoppingItems.length === 0) {
            if (els.emptyState) els.emptyState.style.display = 'flex';
            els.activeItemsList.innerHTML = '';
            els.boughtItemsList.innerHTML = '';
            if (els.boughtSection) els.boughtSection.style.display = 'none';
            return;
        } else {
            if (els.emptyState) els.emptyState.style.display = 'none';
        }

        // Рендер активных товаров
        els.activeItemsList.innerHTML = active.map(item => renderCard(item, false)).join('');

        // Рендер купленных товаров (улетают вниз)
        if (bought.length > 0) {
            if (els.boughtSection) els.boughtSection.style.display = 'block';
            els.boughtItemsList.innerHTML = bought.map(item => renderCard(item, true)).join('');
        } else {
            if (els.boughtSection) els.boughtSection.style.display = 'none';
            els.boughtItemsList.innerHTML = '';
        }

        // Привязываем клик ТОЛЬКО по галочке (чекбоксу)
        attachCheckboxEvents();
    }

    // Генерация HTML карточки в списке покупок
    function renderCard(item, isChecked) {
        const checkedClass = isChecked ? 'is-checked' : '';

        if (currentViewMode === 'grid') {
            // Режим сетки 1:1 (квадрат)
            return `
                <div class="shopping-card ${checkedClass}" data-id="${item.id}">
                    <div class="card-img-wrap">
                        <img src="${PLACEHOLDER_IMG}" alt="${escapeHtml(item.name)}" class="card-img" draggable="false">
                    </div>
                    <div class="card-bottom-row">
                        <button class="game-checkbox" data-action="toggle" type="button" aria-label="${isChecked ? 'Снять отметку' : 'Куплено'}">
                            <svg viewBox="0 0 24 24" fill="none">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                        <span class="card-title">${escapeHtml(item.name)}</span>
                    </div>
                </div>
            `;
        } else {
            // Режим списка
            return `
                <div class="shopping-card ${checkedClass}" data-id="${item.id}">
                    <div class="card-left">
                        <button class="game-checkbox" data-action="toggle" type="button" aria-label="${isChecked ? 'Снять отметку' : 'Куплено'}">
                            <svg viewBox="0 0 24 24" fill="none">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </button>
                        <span class="card-title">${escapeHtml(item.name)}</span>
                    </div>
                    <div class="card-img-wrap">
                        <img src="${PLACEHOLDER_IMG}" alt="${escapeHtml(item.name)}" class="card-img" draggable="false">
                    </div>
                </div>
            `;
        }
    }

    // Клик ТОЛЬКО по галочке (чекбоксу) в обоих режимах
    function attachCheckboxEvents() {
        document.querySelectorAll('.game-checkbox').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Не всплывает на карточку
                const card = btn.closest('.shopping-card');
                if (!card) return;
                const id = card.getAttribute('data-id');
                const item = shoppingItems.find(i => i.id === id);
                if (item) {
                    handleCheckboxClick(item, card);
                }
            });
        });
    }

    // Обработка клика с сочной анимацией установки галочки и задержкой перед переносом вниз
    function handleCheckboxClick(item, cardEl) {
        if (cardEl.classList.contains('is-completing') || cardEl.classList.contains('is-disappearing')) {
            return;
        }

        if (!item.completed) {
            // 1. Моментально ставим галочку с визуальным эффектом прямо на глазах у пользователя
            cardEl.classList.add('is-completing');

            // 2. Звук покупки
            const completedSound = new Audio('completed.mp3');
            completedSound.play().catch(err => console.log('Audio playback failed:', err));

            // 3. Держим карточку с видимой установленной галочкой 450мс
            setTimeout(() => {
                // 4. Запускаем анимацию улетания вниз (200мс)
                cardEl.classList.add('is-disappearing');

                setTimeout(() => {
                    toggleItemStatus(item, true);
                }, 200);
            }, 450);
        } else {
            // Снятие отметки из купленных: сразу возвращаем наверх
            toggleItemStatus(item, false);
        }
    }

    // Всплывающее уведомление о покупке товара (Toast, идентично todo.js)
    let lastCompletedItemId = null;
    let toastTimeout = null;

    function showCompletionToast(itemId) {
        lastCompletedItemId = itemId;
        const toast = document.getElementById('itemCompletionToast');
        if (!toast) return;

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

    // Смена статуса: куплен / не куплен (улетает вниз в «Купленные» или обратно)
    function toggleItemStatus(item, soundAlreadyPlayed = false) {
        const newStatus = !item.completed;
        item.completed = newStatus;

        // Если товар только что отмечен как купленный
        if (newStatus) {
            if (!soundAlreadyPlayed) {
                const completedSound = new Audio('completed.mp3');
                completedSound.play().catch(err => console.log('Audio playback failed:', err));
            }
            showCompletionToast(item.id);
        } else {
            // Если сняли отметку — скрываем тост
            const toast = document.getElementById('itemCompletionToast');
            if (toast) {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (!toast.classList.contains('show')) toast.style.display = 'none';
                }, 350);
            }
        }

        // Мгновенный оптимистичный рендер без задержек
        renderItems();

        if (isTestMode()) return;

        // Если авторизован в Firebase
        if (currentUid && window.db && typeof window.updateDoc === 'function' && typeof window.doc === 'function') {
            try {
                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                window.updateDoc(itemRef, {
                    completed: newStatus,
                    completedAt: newStatus ? Date.now() : null,
                    updatedAt: Date.now()
                });
            } catch (e) {
                console.warn('[Shopping] Ошибка обновления в Firebase:', e);
            }
        }

        saveLocalCache();
    }

    // Добавление нового товара из модалки
    function handleAddItem(name) {
        if (!name || !name.trim()) return;
        const cleanName = name.trim();

        const newItem = {
            id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: cleanName,
            completed: false,
            createdAt: Date.now()
        };

        shoppingItems.unshift(newItem);
        renderItems();

        if (isTestMode()) return;

        saveLocalCache();

        if (currentUid && window.db && typeof window.collection === 'function' && typeof window.setDoc === 'function') {
            try {
                const colRef = window.collection(window.db, 'users', currentUid, 'shopping_items');
                if (typeof window.addDoc === 'function') {
                    window.addDoc(colRef, {
                        name: cleanName,
                        completed: false,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    }).then(docRef => {
                        newItem.id = docRef.id;
                    });
                }
            } catch (e) {
                console.warn('[Shopping] Ошибка добавления в Firebase:', e);
            }
        }
    }

    // Добавление нового типа товара в базу (каталог «Мои товары»)
    function handleAddCatalogProduct(name) {
        if (!name || !name.trim()) return;
        const cleanName = name.trim();

        // Проверяем, есть ли уже такой товар в каталоге
        const existing = userProducts.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
        if (existing) {
            // Если уже есть в базе — добавляем его в список покупок
            handleAddItem(existing.name);
            return;
        }

        const newProd = {
            id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: cleanName,
            category: 'other',
            createdAt: Date.now()
        };

        userProducts.unshift(newProd);
        renderCatalog();

        if (isTestMode()) return;

        saveLocalCache();

        if (currentUid && window.db && typeof window.collection === 'function' && typeof window.addDoc === 'function') {
            try {
                const colRef = window.collection(window.db, 'users', currentUid, 'shopping_products');
                window.addDoc(colRef, {
                    name: cleanName,
                    category: 'other',
                    createdAt: Date.now()
                }).then(docRef => {
                    newProd.id = docRef.id;
                });
            } catch (e) {
                console.warn('[Shopping] Ошибка добавления товара в базу Firebase:', e);
            }
        }
    }

    // === ЗАГРУЗКА ДАННЫХ И ТЕСТОВЫЙ РЕЖИМ #test ===
    function loadItems() {
        const els = getEls();

        if (isTestMode()) {
            // Заполняем демонстрационными товарами по макетам
            shoppingItems = JSON.parse(JSON.stringify(DEMO_ITEMS));
            userProducts = JSON.parse(JSON.stringify(DEMO_CATALOG_PRODUCTS));

            if (els.testModeBanner) els.testModeBanner.style.display = 'inline-flex';
            if (els.catalogFilters) els.catalogFilters.style.display = 'flex';

            if (currentMainTab === 'myProducts') {
                renderCatalog();
            } else {
                renderItems();
            }
            return;
        }

        if (els.testModeBanner) els.testModeBanner.style.display = 'none';
        // В настоящем режиме фильтры категорий скрыты
        if (els.catalogFilters) els.catalogFilters.style.display = 'none';

        try {
            const cached = localStorage.getItem('shopping_items_cache');
            shoppingItems = cached ? JSON.parse(cached) : [];
        } catch (e) {
            shoppingItems = [];
        }

        try {
            const cachedProds = localStorage.getItem('shopping_products_cache');
            userProducts = cachedProds ? JSON.parse(cachedProds) : [];
        } catch (e) {
            userProducts = [];
        }

        if (currentMainTab === 'myProducts') {
            renderCatalog();
        } else {
            renderItems();
        }
    }

    function saveLocalCache() {
        if (isTestMode()) return;
        try {
            localStorage.setItem('shopping_items_cache', JSON.stringify(shoppingItems));
            localStorage.setItem('shopping_products_cache', JSON.stringify(userProducts));
        } catch (e) {}
    }

    // === СЛУШАТЕЛЬ FIREBASE ===
    function setupFirestore(uid) {
        if (!uid || !window.db || isTestMode()) return;
        if (unsubItems) unsubItems();
        if (unsubProducts) unsubProducts();

        try {
            if (typeof window.collection === 'function' && typeof window.onSnapshot === 'function') {
                const itemsColRef = window.collection(window.db, 'users', uid, 'shopping_items');
                unsubItems = window.onSnapshot(itemsColRef, (snapshot) => {
                    if (isTestMode()) return;
                    const loaded = [];
                    snapshot.forEach(docSnap => {
                        loaded.push({ id: docSnap.id, ...docSnap.data() });
                    });
                    loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    shoppingItems = loaded;
                    saveLocalCache();
                    if (currentMainTab === 'shoppingList') renderItems();
                }, (err) => {
                    console.error('[Shopping] Ошибка подписки Firestore:', err);
                });

                const prodsColRef = window.collection(window.db, 'users', uid, 'shopping_products');
                unsubProducts = window.onSnapshot(prodsColRef, (snapshot) => {
                    if (isTestMode()) return;
                    const loaded = [];
                    snapshot.forEach(docSnap => {
                        loaded.push({ id: docSnap.id, ...docSnap.data() });
                    });
                    if (loaded.length > 0) {
                        loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                        userProducts = loaded;
                        saveLocalCache();
                        if (currentMainTab === 'myProducts') renderCatalog();
                    }
                }, (err) => {
                    console.error('[Shopping] Ошибка подписки на базу товаров Firestore:', err);
                });
            }
        } catch (e) {
            console.warn('[Shopping] Firebase недоступен:', e);
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // === ИНИЦИАЛИЗАЦИЯ И СЛУШАТЕЛИ ===
    function init() {
        const els = getEls();

        // Главные вкладки («Список покупок» / «Мои товары»)
        if (els.tabShoppingList) {
            els.tabShoppingList.onclick = () => setMainTab('shoppingList');
        }
        if (els.tabMyProducts) {
            els.tabMyProducts.onclick = () => setMainTab('myProducts');
        }

        // Фильтры категорий во вкладке «Мои товары»
        if (els.catalogFilters) {
            els.catalogFilters.querySelectorAll('.filter-pill').forEach(btn => {
                btn.onclick = () => {
                    els.catalogFilters.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentCategoryFilter = btn.getAttribute('data-cat') || 'all';
                    renderCatalog();
                };
            });
        }

        // Переключатель вида (Список / Сетка)
        if (els.btnViewList) {
            els.btnViewList.onclick = () => setViewMode('list');
        }
        if (els.btnViewGrid) {
            els.btnViewGrid.onclick = () => setViewMode('grid');
        }

        // Сворачивание секции купленных
        if (els.boughtToggleHeader) {
            els.boughtToggleHeader.onclick = () => {
                if (els.boughtSection) {
                    els.boughtSection.classList.toggle('collapsed');
                }
            };
        }

        // Модалка добавления товара (работает и для списка покупок, и для добавления товара в базу)
        function openAddModal() {
            if (!els.addModalOverlay) return;
            if (currentMainTab === 'myProducts') {
                if (els.modalSheetTitle) els.modalSheetTitle.textContent = 'Новый товар в базу';
                if (els.modalItemInput) {
                    els.modalItemInput.placeholder = 'Например: Авокадо...';
                    els.modalItemInput.value = '';
                }
                if (els.btnConfirmAdd) els.btnConfirmAdd.textContent = 'Сохранить в базу';
            } else {
                if (els.modalSheetTitle) els.modalSheetTitle.textContent = 'Новый товар в список';
                if (els.modalItemInput) {
                    els.modalItemInput.placeholder = 'Название товара...';
                    els.modalItemInput.value = '';
                }
                if (els.btnConfirmAdd) els.btnConfirmAdd.textContent = 'Добавить в список';
            }

            document.body.classList.add('add-modal-open');
            els.addModalOverlay.classList.add('open');
            setTimeout(() => {
                if (els.modalItemInput) els.modalItemInput.focus();
            }, 100);
        }

        function closeAddModal() {
            if (els.addModalOverlay) {
                els.addModalOverlay.classList.remove('open');
            }
            document.body.classList.remove('add-modal-open');
        }

        function submitAddModal() {
            const val = els.modalItemInput ? els.modalItemInput.value : '';
            if (val && val.trim()) {
                if (currentMainTab === 'myProducts') {
                    handleAddCatalogProduct(val);
                } else {
                    handleAddItem(val);
                }
                closeAddModal();
            }
        }

        if (els.btnOpenAddModal) {
            els.btnOpenAddModal.onclick = openAddModal;
        }

        if (els.addModalOverlay) {
            els.addModalOverlay.onclick = (e) => {
                if (e.target === els.addModalOverlay) {
                    closeAddModal();
                }
            };
        }

        if (els.btnConfirmAdd) {
            els.btnConfirmAdd.onclick = submitAddModal;
        }

        if (els.modalItemInput) {
            els.modalItemInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitAddModal();
                }
            };
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('add-modal-open')) {
                closeAddModal();
            }
        });

        if (els.btnExitTestMode) {
            els.btnExitTestMode.onclick = (e) => {
                e.preventDefault();
                history.replaceState(null, null, window.location.pathname);
                loadItems();
            };
        }

        // Кнопка отмены покупки в уведомлении (Undo, как в todo.js)
        const btnToastUndo = document.getElementById('btnToastUndo');
        if (btnToastUndo) {
            btnToastUndo.onclick = () => {
                if (lastCompletedItemId) {
                    const item = shoppingItems.find(i => i.id === lastCompletedItemId);
                    if (item && item.completed) {
                        item.completed = false;
                        renderItems();
                        saveLocalCache();

                        if (!isTestMode() && currentUid && window.db && typeof window.updateDoc === 'function' && typeof window.doc === 'function') {
                            try {
                                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                                window.updateDoc(itemRef, {
                                    completed: false,
                                    completedAt: null,
                                    updatedAt: Date.now()
                                });
                            } catch (e) {}
                        }
                    }
                }

                const toast = document.getElementById('itemCompletionToast');
                if (toast) {
                    toast.classList.remove('show');
                    setTimeout(() => {
                        if (!toast.classList.contains('show')) {
                            toast.style.display = 'none';
                        }
                    }, 350);
                }
            };
        }

        setViewMode(currentViewMode);
        setMainTab('shoppingList');
        initTabsDragGesture();
        loadItems();
    }

    // Слушатели смены hash
    window.addEventListener('hashchange', () => {
        loadItems();
    });

    // Слушатель смены пользователя
    window.addEventListener('authChanged', (e) => {
        const user = e.detail && e.detail.user;
        if (user) {
            currentUid = user.uid;
            setupFirestore(currentUid);
        } else {
            currentUid = null;
            if (unsubItems) unsubItems();
            if (unsubProducts) unsubProducts();
            loadItems();
        }
    });

    // Безопасный запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.ShoppingApp = {
        loadItems,
        setViewMode,
        setMainTab,
        getItems: () => shoppingItems,
        getCatalog: () => userProducts,
        toggleItemStatus
    };
})();
