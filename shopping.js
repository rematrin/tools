// shopping.js - Логика игрового низкополигонального списка покупок и базы товаров

(function () {
    // Единственная заглушка для низкополигональных 3D продуктов
    const PLACEHOLDER_IMG = 'img/lowpoly-food.svg';

    // 5 часов до автоочистки купленных товаров (купленные исчезают через 5 часов после покупки)
    const AUTO_CLEANUP_HOURS_MS = 5 * 60 * 60 * 1000;

    // Демонстрационные товары для списка покупок в режиме #test
    const DEMO_ITEMS = [
        { id: 'demo_1', name: 'Молоко', completed: false, createdAt: 1000 },
        { id: 'demo_2', name: 'Хлеб', completed: false, createdAt: 2000 },
        { id: 'demo_3', name: 'Яйца', completed: false, createdAt: 3000 },
        { id: 'demo_4', name: 'Яблоки', completed: false, createdAt: 4000 },
        { id: 'demo_5', name: 'Сыр', completed: false, createdAt: 5000 },
        { id: 'demo_6', name: 'Бананы', completed: false, createdAt: 6000 },
        { id: 'demo_7', name: 'Помидоры', completed: true, completedAt: Date.now() - 3600000, createdAt: 7000 }
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
            btnExitTestMode: document.getElementById('btnExitTestMode'),

            // Стандартное модальное окно добавления товара в базу
            productModalOverlay: document.getElementById('productModalOverlay'),
            btnProductModalClose: document.getElementById('btnProductModalClose'),
            catalogProdNameInput: document.getElementById('catalogProdNameInput'),
            productDropzone: document.getElementById('productDropzone'),
            dropzonePreview: document.getElementById('dropzonePreview'),
            dropzoneText: document.getElementById('dropzoneText'),
            productFileInput: document.getElementById('productFileInput'),
            btnProductSelectFile: document.getElementById('btnProductSelectFile'),
            tabProductFile: document.getElementById('tabProductFile'),
            tabProductUrl: document.getElementById('tabProductUrl'),
            productUrlInput: document.getElementById('productUrlInput'),
            urlPreviewWrap: document.getElementById('urlPreviewWrap'),
            urlPreviewImg: document.getElementById('urlPreviewImg'),
            btnSaveCatalogProduct: document.getElementById('btnSaveCatalogProduct'),
            btnCancelCatalogProduct: document.getElementById('btnCancelCatalogProduct')
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

            const prodImg = prod.imageUrl || PLACEHOLDER_IMG;

            if (currentViewMode === 'grid') {
                // Вид сетки (квадраты 1:1)
                return `
                    <div class="product-catalog-card" data-id="${prod.id}" data-name="${escapeHtml(prod.name)}">
                        <div class="card-img-wrap">
                            <img src="${prodImg}" alt="${escapeHtml(prod.name)}" class="card-img" draggable="false">
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
                                <img src="${prodImg}" alt="${escapeHtml(prod.name)}" class="card-img" draggable="false">
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

                const nameLower = name.toLowerCase();

                // 1. Если товар уже активен (в некупленных) — при повторном клике убираем его из списка покупок
                const activeIndex = shoppingItems.findIndex(i => i.name.toLowerCase() === nameLower && !i.completed);
                if (activeIndex !== -1) {
                    const removed = shoppingItems.splice(activeIndex, 1)[0];
                    saveLocalCache();
                    renderCatalog();
                    if (currentMainTab === 'shoppingList') renderItems();

                    if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.deleteDoc === 'function') {
                        try {
                            const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', removed.id);
                            window.deleteDoc(itemRef);
                        } catch (e) {}
                    }
                    return;
                }

                // 2. Если товар есть в купленных — НЕ дублируем, а перемещаем из купленных обратно в некупленные (наверх)!
                const boughtIndex = shoppingItems.findIndex(i => i.name.toLowerCase() === nameLower && i.completed);
                if (boughtIndex !== -1) {
                    const item = shoppingItems[boughtIndex];
                    item.completed = false;
                    item.completedAt = null;
                    item.createdAt = Date.now();

                    // Переносим в начало списка покупок
                    shoppingItems.splice(boughtIndex, 1);
                    shoppingItems.unshift(item);

                    saveLocalCache();
                    renderCatalog();
                    if (currentMainTab === 'shoppingList') renderItems();

                    if (!isTestMode() && currentUid && window.db && typeof window.updateDoc === 'function' && typeof window.doc === 'function') {
                        try {
                            const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                            window.updateDoc(itemRef, {
                                completed: false,
                                completedAt: null,
                                createdAt: item.createdAt,
                                updatedAt: Date.now()
                            });
                        } catch (e) {}
                    }
                    return;
                }

                // 3. Если товара вообще нет в списке покупок — создаем новый
                const prodObj = userProducts.find(p => p.name.toLowerCase() === nameLower);
                const newItem = {
                    id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                    name: name,
                    imageUrl: prodObj && prodObj.imageUrl ? prodObj.imageUrl : null,
                    completed: false,
                    createdAt: Date.now()
                };

                shoppingItems.unshift(newItem);
                saveLocalCache();
                renderCatalog();
                if (currentMainTab === 'shoppingList') renderItems();

                if (!isTestMode() && currentUid && window.db && typeof window.setDoc === 'function' && typeof window.doc === 'function') {
                    try {
                        const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', newItem.id);
                        window.setDoc(itemRef, {
                            name: name,
                            imageUrl: newItem.imageUrl || null,
                            completed: false,
                            completedAt: null,
                            createdAt: newItem.createdAt,
                            updatedAt: Date.now()
                        }).catch(() => {});
                    } catch (e) {}
                }
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

    // === АВТООЧИСТКА КУПЛЕННЫХ ТОВАРОВ СПУСТЯ 5 ЧАСОВ ПОСЛЕ ПОКУПКИ ===
    function cleanupExpiredBoughtItems() {
        const now = Date.now();
        const expiredIds = [];

        shoppingItems = shoppingItems.filter(item => {
            if (item.completed && item.completedAt) {
                const elapsed = now - item.completedAt;
                if (elapsed >= AUTO_CLEANUP_HOURS_MS) {
                    expiredIds.push(item.id);
                    return false; // удаляем из списка покупок
                }
            }
            return true;
        });

        if (expiredIds.length > 0) {
            saveLocalCache();

            // Удаляем из Firebase Firestore (только из shopping_items, база товаров shopping_products остается нетронутой)
            if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.deleteDoc === 'function') {
                expiredIds.forEach(id => {
                    try {
                        const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', id);
                        window.deleteDoc(itemRef);
                    } catch (e) {
                        console.warn('[Shopping] Ошибка автоочистки товара в Firebase:', e);
                    }
                });
            }
        }
    }

    // === РЕНДЕР КАРТОЧЕК СПИСКА ПОКУПОК ===
    function renderItems() {
        cleanupExpiredBoughtItems();

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
        const itemImg = item.imageUrl || PLACEHOLDER_IMG;

        if (currentViewMode === 'grid') {
            // Режим сетки 1:1 (квадрат)
            return `
                <div class="shopping-card ${checkedClass}" data-id="${item.id}">
                    <div class="card-img-wrap">
                        <img src="${itemImg}" alt="${escapeHtml(item.name)}" class="card-img" draggable="false">
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
                        <img src="${itemImg}" alt="${escapeHtml(item.name)}" class="card-img" draggable="false">
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
        item.completedAt = newStatus ? Date.now() : null;
        item.updatedAt = Date.now();

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
        if (currentMainTab === 'myProducts') renderCatalog();

        if (isTestMode()) return;

        // Если авторизован в Firebase
        if (currentUid && window.db && typeof window.updateDoc === 'function' && typeof window.doc === 'function') {
            try {
                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                window.updateDoc(itemRef, {
                    completed: newStatus,
                    completedAt: item.completedAt,
                    updatedAt: Date.now()
                });
            } catch (e) {
                console.warn('[Shopping] Ошибка обновления в Firebase:', e);
            }
        }

        saveLocalCache();
    }

    // === ОБРАБОТКА И СЖАТИЕ ИЗОБРАЖЕНИЯ В CANVAS В 256x256 WEBP ===
    function processImageToWebpBlob(file, maxSide = 256) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = maxSide;
                    canvas.height = maxSide;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, maxSide, maxSide);

                    // Центрируем и масштабируем объект под квадрат 256x256
                    const scale = Math.min(maxSide / img.width, maxSide / img.height);
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);
                    const x = Math.round((maxSide - w) / 2);
                    const y = Math.round((maxSide - h) / 2);

                    ctx.drawImage(img, x, y, w, h);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve({ blob, dataUrl: canvas.toDataURL('image/webp', 0.85) });
                        } else {
                            canvas.toBlob((pngBlob) => {
                                resolve({ blob: pngBlob, dataUrl: canvas.toDataURL('image/png') });
                            }, 'image/png');
                        }
                    }, 'image/webp', 0.85);
                };
                img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
            reader.readAsDataURL(file);
        });
    }

    // === ЗАГРУЗКА НА IMGBB (ЕДИНЫЙ СТАНДАРТ) ===
    async function uploadToImgBB(blobOrBase64) {
        const API_KEY = 'fbd88ce7045582e4c4176c67de93ceee';
        const formData = new FormData();
        if (typeof blobOrBase64 === 'string') {
            const clean = blobOrBase64.includes(',') ? blobOrBase64.split(',')[1] : blobOrBase64;
            formData.append('image', clean);
        } else {
            formData.append('image', blobOrBase64);
        }

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data && data.success && data.data && data.data.url) {
            return data.data.url;
        }
        throw new Error(data && data.error ? data.error.message : 'Ошибка загрузки на ImgBB');
    }

    // Добавление нового товара в список покупок (без дублирования: если уже был в купленных — перемещает в некупленные)
    function handleAddItem(name, imageUrl = null) {
        if (!name || !name.trim()) return;
        const cleanName = name.trim();
        const cleanLower = cleanName.toLowerCase();

        // 1. Проверяем, есть ли уже такой товар в списке покупок
        const existingIndex = shoppingItems.findIndex(i => i.name.toLowerCase() === cleanLower);
        if (existingIndex !== -1) {
            const existing = shoppingItems[existingIndex];
            // Если он в купленных — перемещаем в некупленные (наверх)!
            if (existing.completed) {
                existing.completed = false;
                existing.completedAt = null;
                existing.createdAt = Date.now();
                if (imageUrl) existing.imageUrl = imageUrl;

                // Перемещаем в начало массива
                shoppingItems.splice(existingIndex, 1);
                shoppingItems.unshift(existing);

                renderItems();
                if (currentMainTab === 'myProducts') renderCatalog();
                saveLocalCache();

                if (!isTestMode() && currentUid && window.db && typeof window.updateDoc === 'function' && typeof window.doc === 'function') {
                    try {
                        const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', existing.id);
                        window.updateDoc(itemRef, {
                            completed: false,
                            completedAt: null,
                            createdAt: existing.createdAt,
                            updatedAt: Date.now()
                        });
                    } catch (e) {}
                }
                return existing;
            } else {
                // Уже в активных — обновляем изображение, если передано, не дублируем
                if (imageUrl && !existing.imageUrl) {
                    existing.imageUrl = imageUrl;
                    saveLocalCache();
                }
                renderItems();
                return existing;
            }
        }

        // 2. Если товара еще нет в списке покупок — создаем новый
        if (!imageUrl) {
            const matched = userProducts.find(p => p.name.toLowerCase() === cleanLower);
            if (matched && matched.imageUrl) {
                imageUrl = matched.imageUrl;
            }
        }

        const newItem = {
            id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: cleanName,
            imageUrl: imageUrl || null,
            completed: false,
            createdAt: Date.now()
        };

        shoppingItems.unshift(newItem);
        renderItems();
        if (currentMainTab === 'myProducts') renderCatalog();

        if (isTestMode()) return newItem;

        saveLocalCache();

        if (currentUid && window.db && typeof window.setDoc === 'function' && typeof window.doc === 'function') {
            try {
                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', newItem.id);
                window.setDoc(itemRef, {
                    name: cleanName,
                    imageUrl: imageUrl || null,
                    completed: false,
                    completedAt: null,
                    createdAt: newItem.createdAt,
                    updatedAt: Date.now()
                }).catch(e => console.warn('[Shopping] Ошибка сохранения в Firebase:', e));
            } catch (e) {
                console.warn('[Shopping] Ошибка добавления в Firebase:', e);
            }
        }
        return newItem;
    }

    // Добавление нового типа товара в базу (каталог «Мои товары»)
    function handleAddCatalogProduct(name, imageUrl = null) {
        if (!name || !name.trim()) return;
        const cleanName = name.trim();

        // Проверяем, есть ли уже такой товар в каталоге
        const existing = userProducts.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
        if (existing) {
            if (imageUrl) {
                existing.imageUrl = imageUrl;
                saveLocalCache();
            }
            // Добавляем его в список покупок
            handleAddItem(existing.name, existing.imageUrl);
            renderCatalog();
            return;
        }

        const newProd = {
            id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: cleanName,
            category: 'other',
            imageUrl: imageUrl || null,
            createdAt: Date.now()
        };

        userProducts.unshift(newProd);
        saveLocalCache();
        renderCatalog();

        // Также сразу добавляем новый товар в список покупок с картинкой
        handleAddItem(newProd.name, newProd.imageUrl);

        if (isTestMode()) return;

        if (currentUid && window.db && typeof window.setDoc === 'function' && typeof window.doc === 'function') {
            try {
                const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', newProd.id);
                window.setDoc(prodRef, {
                    name: cleanName,
                    category: 'other',
                    imageUrl: imageUrl || null,
                    createdAt: newProd.createdAt,
                    updatedAt: Date.now()
                }).catch(e => console.warn('[Shopping] Ошибка сохранения товара в Firebase:', e));
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
            cleanupExpiredBoughtItems();

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
            // Фильтруем битые элементы без названия
            shoppingItems = shoppingItems.filter(i => i && i.name && typeof i.name === 'string' && i.name.trim().length > 0);
            cleanupExpiredBoughtItems();
        } catch (e) {
            shoppingItems = [];
        }

        try {
            const cachedProds = localStorage.getItem('shopping_products_cache');
            userProducts = cachedProds ? JSON.parse(cachedProds) : [];
            // Фильтруем битые элементы без названия
            userProducts = userProducts.filter(p => p && p.name && typeof p.name === 'string' && p.name.trim().length > 0);
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
                        const data = docSnap.data();
                        if (data && data.name && typeof data.name === 'string' && data.name.trim().length > 0) {
                            loaded.push({ id: docSnap.id, ...data });
                        } else {
                            // Очищаем пустые/битые документы в Firestore
                            if (typeof window.deleteDoc === 'function') {
                                window.deleteDoc(docSnap.ref).catch(() => {});
                            }
                        }
                    });

                    // Если в облаке пока пусто, а в локальном кэше есть товары — сохраняем их в облако
                    if (loaded.length === 0 && shoppingItems.length > 0) {
                        shoppingItems.forEach(item => {
                            if (item && item.name && item.name.trim()) {
                                const docRef = window.doc(window.db, 'users', uid, 'shopping_items', item.id);
                                window.setDoc(docRef, item).catch(() => {});
                            }
                        });
                    } else {
                        loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                        shoppingItems = loaded;
                        cleanupExpiredBoughtItems();
                        saveLocalCache();
                    }

                    if (currentMainTab === 'shoppingList') renderItems();
                }, (err) => {
                    console.error('[Shopping] Ошибка подписки Firestore:', err);
                });

                const prodsColRef = window.collection(window.db, 'users', uid, 'shopping_products');
                unsubProducts = window.onSnapshot(prodsColRef, (snapshot) => {
                    if (isTestMode()) return;
                    const loaded = [];
                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data && data.name && typeof data.name === 'string' && data.name.trim().length > 0) {
                            loaded.push({ id: docSnap.id, ...data });
                        } else {
                            if (typeof window.deleteDoc === 'function') {
                                window.deleteDoc(docSnap.ref).catch(() => {});
                            }
                        }
                    });

                    // Если в облаке пока пусто, а в локальной базе есть товары — сохраняем их в облако
                    if (loaded.length === 0 && userProducts.length > 0) {
                        userProducts.forEach(prod => {
                            if (prod && prod.name && prod.name.trim()) {
                                const docRef = window.doc(window.db, 'users', uid, 'shopping_products', prod.id);
                                window.setDoc(docRef, prod).catch(() => {});
                            }
                        });
                    } else if (loaded.length > 0) {
                        loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                        userProducts = loaded;
                        saveLocalCache();
                    }

                    if (currentMainTab === 'myProducts') renderCatalog();
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

        // Состояние загрузки изображения для модалки базы товаров
        let currentUploadedImageUrl = null;
        let currentUploadTab = 'file';

        // 1. Быстрая шторка добавления товара в список покупок
        function openAddModal() {
            if (!els.addModalOverlay) return;
            if (els.modalItemInput) {
                els.modalItemInput.value = '';
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
                handleAddItem(val);
                closeAddModal();
            }
        }

        // 2. Стандартное модальное окно добавления товара в базу (файл, drag & drop, вставка, ссылка)
        function openProductModal() {
            const currentEls = getEls();
            if (!currentEls.productModalOverlay) return;

            currentUploadedImageUrl = null;
            currentUploadTab = 'file';

            if (currentEls.catalogProdNameInput) currentEls.catalogProdNameInput.value = '';
            if (currentEls.productUrlInput) currentEls.productUrlInput.value = '';
            if (currentEls.urlPreviewWrap) currentEls.urlPreviewWrap.style.display = 'none';

            // Сброс дропзоны
            if (currentEls.dropzonePreview) {
                currentEls.dropzonePreview.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
                `;
            }
            if (currentEls.dropzoneText) {
                currentEls.dropzoneText.textContent = 'Кликните для выбора файла или перетащите его сюда';
            }

            switchUploadTab('file');

            document.body.classList.add('add-modal-open');
            currentEls.productModalOverlay.style.display = 'flex';
            currentEls.productModalOverlay.classList.add('open');
            setTimeout(() => {
                if (currentEls.catalogProdNameInput) currentEls.catalogProdNameInput.focus();
            }, 100);
        }

        function closeProductModal() {
            const currentEls = getEls();
            if (currentEls.productModalOverlay) {
                currentEls.productModalOverlay.style.display = 'none';
                currentEls.productModalOverlay.classList.remove('open');
            }
            document.body.classList.remove('add-modal-open');
        }

        function switchUploadTab(tab) {
            currentUploadTab = tab;
            const currentEls = getEls();
            if (!currentEls.productModalOverlay) return;

            currentEls.productModalOverlay.querySelectorAll('.product-tab-btn').forEach(btn => {
                if (btn.getAttribute('data-tab') === tab) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            if (tab === 'file') {
                if (currentEls.tabProductFile) currentEls.tabProductFile.style.display = 'flex';
                if (currentEls.tabProductUrl) currentEls.tabProductUrl.style.display = 'none';
            } else {
                if (currentEls.tabProductFile) currentEls.tabProductFile.style.display = 'none';
                if (currentEls.tabProductUrl) currentEls.tabProductUrl.style.display = 'flex';
                if (currentEls.productUrlInput) {
                    setTimeout(() => currentEls.productUrlInput.focus(), 80);
                }
            }
        }

        // Обработка загруженного файла (сжатие в WebP 256x256 и отправка на ImgBB)
        async function handleImageFile(file) {
            if (!file || !file.type.startsWith('image/')) return;
            const currentEls = getEls();

            if (currentEls.dropzonePreview) {
                currentEls.dropzonePreview.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite; color: var(--purple-primary);">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-dasharray="32" stroke-dashoffset="8" fill="none" opacity="0.3"></circle>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
                    </svg>
                `;
            }
            if (currentEls.dropzoneText) currentEls.dropzoneText.textContent = 'Сжатие в 256x256 WebP...';
            if (currentEls.btnSaveCatalogProduct) currentEls.btnSaveCatalogProduct.disabled = true;

            try {
                // 1. Конвертируем в 256x256 WebP
                const { blob, dataUrl } = await processImageToWebpBlob(file, 256);
                currentUploadedImageUrl = dataUrl;

                if (currentEls.dropzoneText) currentEls.dropzoneText.textContent = 'Отправка на ImgBB...';

                // 2. Отправляем на ImgBB
                try {
                    const imgbbUrl = await uploadToImgBB(blob);
                    currentUploadedImageUrl = imgbbUrl;
                } catch (netErr) {
                    console.warn('[Shopping] Не удалось отправить на ImgBB, сохранено локально:', netErr);
                }

                if (currentEls.dropzonePreview) {
                    currentEls.dropzonePreview.innerHTML = `<img src="${currentUploadedImageUrl}" alt="Превью" style="width: 100%; height: 100%; object-fit: contain;">`;
                }
                if (currentEls.dropzoneText) currentEls.dropzoneText.textContent = 'Изображение готово (256x256 WebP)';
            } catch (err) {
                console.error('[Shopping] Ошибка обработки изображения:', err);
                if (currentEls.dropzoneText) currentEls.dropzoneText.textContent = 'Ошибка загрузки файла';
            } finally {
                if (currentEls.btnSaveCatalogProduct) currentEls.btnSaveCatalogProduct.disabled = false;
            }
        }

        // Клик по круглому плюсу (FAB)
        if (els.btnOpenAddModal) {
            els.btnOpenAddModal.onclick = () => {
                if (currentMainTab === 'myProducts') {
                    openProductModal();
                } else {
                    openAddModal();
                }
            };
        }

        // Слушатели шторки списка покупок
        if (els.addModalOverlay) {
            els.addModalOverlay.onclick = (e) => {
                if (e.target === els.addModalOverlay) closeAddModal();
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

        // Слушатели модалки базы товаров («Мои товары»)
        if (els.btnProductModalClose) els.btnProductModalClose.onclick = closeProductModal;
        if (els.btnCancelCatalogProduct) els.btnCancelCatalogProduct.onclick = closeProductModal;
        if (els.productModalOverlay) {
            els.productModalOverlay.onclick = (e) => {
                if (e.target === els.productModalOverlay) closeProductModal();
            };
        }

        if (els.productModalOverlay) {
            els.productModalOverlay.querySelectorAll('.product-tab-btn').forEach(btn => {
                btn.onclick = () => switchUploadTab(btn.getAttribute('data-tab'));
            });
        }

        if (els.btnProductSelectFile && els.productFileInput) {
            els.btnProductSelectFile.onclick = () => els.productFileInput.click();
        }
        if (els.productDropzone && els.productFileInput) {
            els.productDropzone.onclick = () => els.productFileInput.click();
            els.productDropzone.ondragover = (e) => {
                e.preventDefault();
                els.productDropzone.classList.add('dragover');
            };
            els.productDropzone.ondragleave = () => {
                els.productDropzone.classList.remove('dragover');
            };
            els.productDropzone.ondrop = (e) => {
                e.preventDefault();
                els.productDropzone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) handleImageFile(file);
            };
        }
        if (els.productFileInput) {
            els.productFileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) handleImageFile(file);
            };
        }

        // Вставка изображения из буфера обмена (Ctrl + V / Cmd + V)
        window.addEventListener('paste', (e) => {
            const currentEls = getEls();
            if (!currentEls.productModalOverlay || currentEls.productModalOverlay.style.display === 'none') return;
            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type && item.type.indexOf('image') === 0) {
                    const file = item.getAsFile();
                    if (file) {
                        switchUploadTab('file');
                        handleImageFile(file);
                    }
                    break;
                }
            }
        });

        // Живое превью по ссылке
        if (els.productUrlInput) {
            els.productUrlInput.oninput = () => {
                const url = els.productUrlInput.value.trim();
                if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) {
                    if (els.urlPreviewWrap && els.urlPreviewImg) {
                        els.urlPreviewImg.src = url;
                        els.urlPreviewWrap.style.display = 'flex';
                    }
                } else {
                    if (els.urlPreviewWrap) els.urlPreviewWrap.style.display = 'none';
                }
            };
            els.productUrlInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (els.btnSaveCatalogProduct) els.btnSaveCatalogProduct.click();
                }
            };
        }

        if (els.catalogProdNameInput) {
            els.catalogProdNameInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (els.btnSaveCatalogProduct) els.btnSaveCatalogProduct.click();
                }
            };
        }

        // Сохранить товар в базу
        if (els.btnSaveCatalogProduct) {
            els.btnSaveCatalogProduct.onclick = () => {
                const name = els.catalogProdNameInput ? els.catalogProdNameInput.value.trim() : '';
                if (!name) {
                    if (els.catalogProdNameInput) els.catalogProdNameInput.focus();
                    return;
                }

                let finalImg = currentUploadedImageUrl;
                if (currentUploadTab === 'url' && els.productUrlInput && els.productUrlInput.value.trim()) {
                    finalImg = els.productUrlInput.value.trim();
                }

                handleAddCatalogProduct(name, finalImg);
                closeProductModal();
            };
        }

        // Закрытие по Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.body.classList.contains('add-modal-open')) {
                closeAddModal();
                closeProductModal();
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

        // Фоновая периодическая проверка автоочистки купленных товаров (каждые 60 сек)
        setInterval(() => {
            cleanupExpiredBoughtItems();
            if (currentMainTab === 'shoppingList') renderItems();
        }, 60000);
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
