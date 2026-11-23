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
    let userCategories = [];
    let currentUid = null;
    let unsubItems = null;
    let unsubProducts = null;
    let unsubCategories = null;
    let editingCategoryForEmojiId = null;

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
            tabSettings: document.getElementById('tabSettings'),
            screenShoppingList: document.getElementById('screenShoppingList'),
            screenMyProducts: document.getElementById('screenMyProducts'),
            screenSettings: document.getElementById('screenSettings'),
            toggleListCropMode: document.getElementById('toggleListCropMode'),
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
            btnCancelCatalogProduct: document.getElementById('btnCancelCatalogProduct'),

            // Модальное окно просмотра / редактирования товара в базе (как в todo.html)
            productDetailsModal: document.getElementById('productDetailsModal'),
            productDetailsCard: document.getElementById('productDetailsCard'),
            productDetailsDragContainer: document.getElementById('productDetailsDragContainer'),
            btnProductDetailsClose: document.getElementById('btnProductDetailsClose'),
            btnProductDetailsMore: document.getElementById('btnProductDetailsMore'),
            productActionsDropdown: document.getElementById('productActionsDropdown'),
            btnEditImageFromModal: document.getElementById('btnEditImageFromModal'),
            btnDeleteProductFromModal: document.getElementById('btnDeleteProductFromModal'),
            modalProductTitleDisplay: document.getElementById('modalProductTitleDisplay'),
            modalProductTitleInput: document.getElementById('modalProductTitleInput'),
            productDetailsImageCard: document.getElementById('productDetailsImageCard'),
            modalProductImageDisplay: document.getElementById('modalProductImageDisplay'),
            btnEditProductImage: document.getElementById('btnEditProductImage'),

            // Окно редактирования изображения товара (замена / удаление)
            editImageModalOverlay: document.getElementById('editImageModalOverlay'),
            btnEditImageModalClose: document.getElementById('btnEditImageModalClose'),
            tabBtnEditFile: document.getElementById('tabBtnEditFile'),
            tabBtnEditUrl: document.getElementById('tabBtnEditUrl'),
            tabEditProductFile: document.getElementById('tabEditProductFile'),
            tabEditProductUrl: document.getElementById('tabEditProductUrl'),
            editProductDropzone: document.getElementById('editProductDropzone'),
            editDropzonePreview: document.getElementById('editDropzonePreview'),
            editDropzoneText: document.getElementById('editDropzoneText'),
            editProductFileInput: document.getElementById('editProductFileInput'),
            btnEditProductSelectFile: document.getElementById('btnEditProductSelectFile'),
            editProductUrlInput: document.getElementById('editProductUrlInput'),
            editUrlPreviewWrap: document.getElementById('editUrlPreviewWrap'),
            editUrlPreviewImg: document.getElementById('editUrlPreviewImg'),
            btnSaveEditedImage: document.getElementById('btnSaveEditedImage'),
            btnCancelEditedImage: document.getElementById('btnCancelEditedImage'),
            btnDeleteProductImage: document.getElementById('btnDeleteProductImage'),

            // Корзина и подтверждение удаления (как в todo.html)
            btnOpenTrashSettings: document.getElementById('btnOpenTrashSettings'),
            settingsTrashCountText: document.getElementById('settingsTrashCountText'),
            screenTrash: document.getElementById('screenTrash'),
            btnBackFromTrash: document.getElementById('btnBackFromTrash'),
            trashNoticeBanner: document.getElementById('trashNoticeBanner'),
            btnEmptyTrash: document.getElementById('btnEmptyTrash'),
            trashItemsList: document.getElementById('trashItemsList'),
            trashEmptyState: document.getElementById('trashEmptyState'),
            confirmDeleteModal: document.getElementById('confirmDeleteModal'),
            confirmModalTitle: document.getElementById('confirmModalTitle'),
            confirmModalDesc: document.getElementById('confirmModalDesc'),
            confirmModalItemTitle: document.getElementById('confirmModalItemTitle'),
            btnConfirmDeleteCancel: document.getElementById('btnConfirmDeleteCancel'),
            btnConfirmDeleteSubmit: document.getElementById('btnConfirmDeleteSubmit'),

            // Пользовательские категории в настройках
            settingsCategoriesList: document.getElementById('settingsCategoriesList'),
            settingsCategoriesCountText: document.getElementById('settingsCategoriesCountText'),
            btnOpenAddCategoryModal: document.getElementById('btnOpenAddCategoryModal'),
            categoryEmojiPickerModal: document.getElementById('categoryEmojiPickerModal'),
            btnCloseEmojiPickerModal: document.getElementById('btnCloseEmojiPickerModal'),
            btnSaveCategoryEmoji: document.getElementById('btnSaveCategoryEmoji'),
            categoryIconPreview: document.getElementById('categoryIconPreview'),
            categoryEmojiInput: document.getElementById('categoryEmojiInput')
        };
    }

    // === ПЕРЕКЛЮЧЕНИЕ ГЛАВНЫХ ВКЛАДОК («СПИСОК ПОКУПОК» / «МОИ ТОВАРЫ» / «НАСТРОЙКИ») ===
    function setMainTab(tab) {
        currentMainTab = tab;
        const els = getEls();
        if (!els.tabShoppingList || !els.tabMyProducts) return;

        if (tab === 'settings') {
            if (els.tabSettings) {
                els.tabSettings.classList.add('active');
                els.tabSettings.setAttribute('aria-selected', 'true');
            }
            els.tabShoppingList.classList.remove('active');
            els.tabShoppingList.setAttribute('aria-selected', 'false');
            els.tabMyProducts.classList.remove('active');
            els.tabMyProducts.setAttribute('aria-selected', 'false');

            // Скрываем ползунок в левой плашке
            if (els.tabsSliderIndicator) {
                els.tabsSliderIndicator.style.opacity = '0';
            }

            if (els.screenShoppingList) els.screenShoppingList.style.display = 'none';
            if (els.screenMyProducts) els.screenMyProducts.style.display = 'none';
            if (els.screenSettings) els.screenSettings.style.display = 'block';
            if (els.screenTrash) els.screenTrash.style.display = 'none';

            if (els.viewTogglePill) els.viewTogglePill.style.display = 'none';
            if (els.btnOpenAddModal) els.btnOpenAddModal.style.display = 'none';
            if (els.catalogFilters) els.catalogFilters.style.display = 'none';

            renderSettingsView();
            return;
        }

        // Возврат к табам слева
        if (els.tabSettings) {
            els.tabSettings.classList.remove('active');
            els.tabSettings.setAttribute('aria-selected', 'false');
        }

        if (els.screenSettings) els.screenSettings.style.display = 'none';
        if (els.screenTrash) els.screenTrash.style.display = 'none';

        // Восстанавливаем видимость ползунка и перемещаем его
        if (els.tabsSliderIndicator) {
            els.tabsSliderIndicator.style.opacity = '1';
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
            if (els.btnOpenAddModal) els.btnOpenAddModal.style.display = 'grid';

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
            if (els.btnOpenAddModal) els.btnOpenAddModal.style.display = 'none';

            renderItems();
        }
    }

    // Режим кропа картинок в списке (обычный или приближенный от края до края 100% по вертикали)
    function applyListCropMode(isEdge) {
        document.body.classList.toggle('list-crop-edge', !!isEdge);
        localStorage.setItem('shopping_list_crop_mode', isEdge ? 'edge' : 'default');
    }

    // Обновление состояния экрана настроек
    function renderSettingsView() {
        const els = getEls();

        // 1. Блок профиля
        const cachedUserStr = localStorage.getItem('todo_cached_user');
        let user = (window.firebaseAuth && window.firebaseAuth.currentUser) || window.currentUser;
        if (!user && cachedUserStr) {
            try { user = JSON.parse(cachedUserStr); } catch (e) {}
        }

        const avatarEl = document.getElementById('settingsUserAvatar');
        const nameEl = document.getElementById('settingsUserName');
        const logoutBtn = document.getElementById('btnSettingsLogout');
        const logoutBtnText = document.getElementById('settingsLogoutBtnText');

        if (user && (user.uid || user.email || user.displayName)) {
            if (nameEl) nameEl.textContent = user.displayName || user.email || 'Пользователь';
            if (avatarEl) {
                avatarEl.src = user.photoURL || 'https://i.ibb.co/Z6vRKK9x/0000000.jpg';
            }
            if (logoutBtn && logoutBtnText) {
                logoutBtn.classList.remove('login-mode');
                logoutBtnText.textContent = 'Выйти';
            }
        } else {
            if (nameEl) nameEl.textContent = 'Гость';
            if (avatarEl) {
                avatarEl.src = 'https://i.ibb.co/Z6vRKK9x/0000000.jpg';
            }
            if (logoutBtn && logoutBtnText) {
                logoutBtn.classList.add('login-mode');
                logoutBtnText.textContent = 'Войти';
            }
        }

        // 2. Тема оформления
        const currentTheme = localStorage.getItem('themeMode_shopping') || 'system';
        document.querySelectorAll('.theme-choice-btn').forEach(btn => {
            const mode = btn.dataset.themeMode;
            btn.classList.toggle('active', mode === currentTheme);
        });

        // 3. Тумблер режима кропа картинок
        if (els.toggleListCropMode) {
            els.toggleListCropMode.checked = (localStorage.getItem('shopping_list_crop_mode') === 'edge');
        }

        // 4. Счетчик корзины (удаленные товары)
        if (els.settingsTrashCountText) {
            const trashed = userProducts.filter(p => p.deleted);
            const count = trashed.length;
            const word = count === 1 ? 'товар' : ((count >= 2 && count <= 4) ? 'товара' : 'товаров');
            els.settingsTrashCountText.textContent = `${count} ${word}`;
        }

        // 5. Список пользовательских категорий
        renderCategoriesList();
    }

    // === УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЬСКИМИ КАТЕГОРИЯМИ В НАСТРОЙКАХ ===
    function getCategoryCountWord(count) {
        const c10 = count % 10;
        const c100 = count % 100;
        if (c100 >= 11 && c100 <= 19) return `${count} категорий`;
        if (c10 === 1) return `${count} категория`;
        if (c10 >= 2 && c10 <= 4) return `${count} категории`;
        return `${count} категорий`;
    }

    function renderCategoriesList() {
        const els = getEls();
        if (els.settingsCategoriesCountText) {
            els.settingsCategoriesCountText.textContent = getCategoryCountWord(userCategories.length);
        }
        if (!els.settingsCategoriesList) return;

        if (userCategories.length === 0) {
            els.settingsCategoriesList.innerHTML = `
                <div class="categories-empty-state">Категорий пока нет. Нажмите «Создать», чтобы добавить первую категорию.</div>
            `;
            return;
        }

        els.settingsCategoriesList.innerHTML = userCategories.map(cat => {
            const icon = cat.icon || '🏷️';
            return `
                <div class="settings-category-row" data-id="${cat.id}">
                    <button type="button" class="category-row-icon-btn" data-id="${cat.id}" title="Изменить иконку">
                        <span class="category-row-icon">${escapeHtml(icon)}</span>
                    </button>
                    <div class="category-row-name-wrap">
                        <input type="text" class="category-inline-name-input" data-id="${cat.id}" value="${escapeHtml(cat.name || '')}" placeholder="Название категории" maxlength="40" autocomplete="off">
                    </div>
                    <div class="category-row-actions">
                        <button type="button" class="btn-cat-action btn-cat-delete" data-id="${cat.id}" title="Удалить категорию">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Слушатели для каждой строки
        els.settingsCategoriesList.querySelectorAll('.settings-category-row').forEach(row => {
            const id = row.getAttribute('data-id');
            const iconBtn = row.querySelector('.category-row-icon-btn');
            const nameInput = row.querySelector('.category-inline-name-input');
            const deleteBtn = row.querySelector('.btn-cat-delete');

            if (iconBtn) {
                iconBtn.onclick = (e) => {
                    e.stopPropagation();
                    openEmojiPickerModal(id);
                };
            }

            if (nameInput) {
                const saveName = () => {
                    const val = nameInput.value.trim();
                    const cat = userCategories.find(c => String(c.id) === String(id));
                    if (cat && cat.name !== val) {
                        cat.name = val;
                        cat.updatedAt = Date.now();
                        saveLocalCache();
                        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.updateDoc === 'function') {
                            try {
                                const catRef = window.doc(window.db, 'users', currentUid, 'shopping_categories', String(cat.id));
                                window.updateDoc(catRef, {
                                    name: cat.name,
                                    updatedAt: cat.updatedAt
                                });
                            } catch (e) {
                                console.warn('[Shopping] Ошибка обновления категории в Firebase:', e);
                            }
                        }
                    }
                };

                nameInput.addEventListener('blur', saveName);
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        nameInput.blur();
                    }
                });
            }

            if (deleteBtn) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    handleDeleteCategory(id);
                };
            }
        });
    }

    function handleCreateCategoryInline() {
        const newCat = {
            id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: '',
            icon: '🏷️',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        userCategories.push(newCat);
        saveLocalCache();

        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
            try {
                const catRef = window.doc(window.db, 'users', currentUid, 'shopping_categories', newCat.id);
                window.setDoc(catRef, newCat);
            } catch (e) {
                console.warn('[Shopping] Ошибка сохранения категории в Firebase:', e);
            }
        }

        renderCategoriesList();

        // Автофокус на поле ввода новой категории
        const inputEl = document.querySelector(`.settings-category-row[data-id="${newCat.id}"] .category-inline-name-input`);
        if (inputEl) {
            inputEl.focus();
        }
    }

    function openEmojiPickerModal(catId) {
        const els = getEls();
        if (!els.categoryEmojiPickerModal) return;

        editingCategoryForEmojiId = catId;
        const cat = userCategories.find(c => String(c.id) === String(catId));
        const currentIcon = (cat ? cat.icon : '🏷️') || '🏷️';

        if (els.categoryEmojiInput) els.categoryEmojiInput.value = currentIcon;
        if (els.categoryIconPreview) els.categoryIconPreview.textContent = currentIcon;

        els.categoryEmojiPickerModal.style.display = 'flex';
        els.categoryEmojiPickerModal.offsetHeight;
        els.categoryEmojiPickerModal.classList.add('active');
        if (els.categoryEmojiInput) {
            setTimeout(() => {
                els.categoryEmojiInput.focus();
                els.categoryEmojiInput.select();
            }, 80);
        }
    }

    function closeEmojiPickerModal() {
        const els = getEls();
        if (!els.categoryEmojiPickerModal) return;
        els.categoryEmojiPickerModal.classList.remove('active');
        setTimeout(() => {
            if (!els.categoryEmojiPickerModal.classList.contains('active')) {
                els.categoryEmojiPickerModal.style.display = 'none';
            }
        }, 250);
        editingCategoryForEmojiId = null;
    }

    function applyEmojiToCategory(emoji) {
        if (!editingCategoryForEmojiId) {
            closeEmojiPickerModal();
            return;
        }
        const cat = userCategories.find(c => String(c.id) === String(editingCategoryForEmojiId));
        if (cat) {
            cat.icon = emoji || '🏷️';
            cat.updatedAt = Date.now();
            saveLocalCache();

            if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.updateDoc === 'function') {
                try {
                    const catRef = window.doc(window.db, 'users', currentUid, 'shopping_categories', String(cat.id));
                    window.updateDoc(catRef, {
                        icon: cat.icon,
                        updatedAt: cat.updatedAt
                    });
                } catch (e) {
                    console.warn('[Shopping] Ошибка обновления иконки категории в Firebase:', e);
                }
            }

            const rowIconEl = document.querySelector(`.settings-category-row[data-id="${cat.id}"] .category-row-icon`);
            if (rowIconEl) {
                rowIconEl.textContent = cat.icon;
            }
        }
        closeEmojiPickerModal();
    }

    function handleDeleteCategory(catId) {
        const cat = userCategories.find(c => String(c.id) === String(catId));
        if (!cat) return;

        const catName = cat.name ? `«${cat.name}»` : 'категорию';
        showCustomConfirm(
            `Удалить категорию?`,
            `Вы действительно хотите удалить ${catName}?`,
            `Удалить`,
            () => {
                userCategories = userCategories.filter(c => String(c.id) !== String(catId));
                saveLocalCache();
                renderCategoriesList();

                if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.deleteDoc === 'function') {
                    try {
                        const catRef = window.doc(window.db, 'users', currentUid, 'shopping_categories', String(catId));
                        window.deleteDoc(catRef);
                    } catch (e) {
                        console.warn('[Shopping] Ошибка удаления категории в Firebase:', e);
                    }
                }
            }
        );
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
                    indicator.style.opacity = '1';
                    if (els.tabSettings) {
                        els.tabSettings.classList.remove('active');
                        els.tabSettings.setAttribute('aria-selected', 'false');
                    }
                    if (els.screenSettings) els.screenSettings.style.display = 'none';
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

        const activeProducts = userProducts.filter(p => !p.deleted);

        if (activeProducts.length === 0) {
            els.catalogProductsGrid.innerHTML = `
                <div class="empty-game-state" style="display: flex; margin-top: 40px; width: 100%; grid-column: 1 / -1;">
                    <img src="${PLACEHOLDER_IMG}" alt="Пусто" class="empty-game-icon">
                    <h2 class="empty-game-title">База товаров пуста</h2>
                    <p class="empty-game-desc">Нажмите на плюс внизу, чтобы добавить первый товар в базу</p>
                </div>
            `;
            return;
        }

        let items = activeProducts;
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
                        } catch (e) { }
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
                        } catch (e) { }
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
                        }).catch(() => { });
                    } catch (e) { }
                }
            });
        });

        // Клики по карточке товара в каталоге для открытия деталей (как в todo.html)
        els.catalogProductsGrid.querySelectorAll('.product-catalog-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-product-add')) return;
                const id = card.getAttribute('data-id');
                const prod = userProducts.find(p => p.id === id);
                if (prod) {
                    openProductDetailsModal(prod);
                }
            });
        });
    }

    // === ПЕРЕКЛЮЧЕНИЕ РЕЖИМА СЕТКА / СПИСОК (ДЛЯ ОБОИХ ЭКРАНОВ) ===
    function setViewMode(mode) {
        currentViewMode = mode;
        try {
            localStorage.setItem('shopping_view_mode', mode);
        } catch (e) { }

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
                <div class="swipe-item-container" data-id="${item.id}">
                    <div class="swipe-delete-background" data-action="delete-item" aria-label="Удалить из списка">
                        <svg class="swipe-trash-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </div>
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

    // Всплывающее уведомление о покупке товара / действиях (Toast, идентично todo.js)
    let lastCompletedItemId = null;
    let toastTimeout = null;

    function showItemCompletedToast(data) {
        const toast = document.getElementById('itemCompletionToast');
        if (!toast) return;

        const textEl = toast.querySelector('.toast-text');
        const undoBtn = document.getElementById('btnToastUndo');

        if (typeof data === 'string') {
            if (textEl) textEl.textContent = data;
            if (undoBtn) undoBtn.style.display = 'none';
        } else if (data && data.name) {
            if (textEl) textEl.textContent = data.name;
            if (undoBtn) undoBtn.style.display = 'none';
        } else {
            if (textEl) textEl.textContent = 'Товар куплен';
            if (undoBtn) undoBtn.style.display = 'inline-flex';
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
        }, 4000);
    }

    function showCompletionToast(itemId) {
        lastDeletedShoppingItem = null;
        lastDeletedShoppingIndex = -1;
        lastCompletedItemId = itemId;
        showItemCompletedToast();
    }

    // Всплывающее уведомление об удалении товара из списка покупок (с возможностью Отменить)
    let lastDeletedShoppingItem = null;
    let lastDeletedShoppingIndex = -1;

    function showItemDeletedToast(itemName) {
        lastCompletedItemId = null;
        const toast = document.getElementById('itemCompletionToast');
        if (!toast) return;

        const textEl = toast.querySelector('.toast-text');
        const undoBtn = document.getElementById('btnToastUndo');

        if (textEl) {
            textEl.textContent = itemName ? `«${itemName}» удален из списка` : 'Товар удален из списка';
        }
        if (undoBtn) undoBtn.style.display = 'inline-flex';

        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }

        toast.style.display = 'flex';
        toast.offsetHeight;
        toast.classList.add('show');

        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (!toast.classList.contains('show')) {
                    toast.style.display = 'none';
                }
            }, 350);
        }, 4500);
    }

    // Удаление товара ТОЛЬКО из списка покупок (база товаров shopping_products не затрагивается!)
    function removeItemFromShoppingList(itemId) {
        let idx = shoppingItems.findIndex(i => String(i.id) === String(itemId));
        if (idx === -1) {
            idx = shoppingItems.findIndex(i => i.name === itemId);
        }
        if (idx === -1) return;

        const removedItem = shoppingItems[idx];
        lastDeletedShoppingItem = { ...removedItem };
        lastDeletedShoppingIndex = idx;
        lastCompletedItemId = null;

        // Удаляем из массива списка покупок
        shoppingItems.splice(idx, 1);
        saveLocalCache();

        renderItems();
        if (currentMainTab === 'myProducts') renderCatalog();

        // Удаляем только документ из коллекции shopping_items в Firestore
        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.deleteDoc === 'function') {
            try {
                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', String(removedItem.id));
                window.deleteDoc(itemRef);
            } catch (e) {
                console.warn('[Shopping] Ошибка удаления товара из списка в Firebase:', e);
            }
        }

        showItemDeletedToast(removedItem.name);
    }

    // Анимация вылета и схлопывания карточки при удалении свайпом
    function triggerItemDelete(container, itemId) {
        if (!container) return;
        const card = container.querySelector('.shopping-card');

        // 1. Вылет белой карточки влево за границу экрана
        if (card) {
            card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
            card.style.transform = 'translateX(-105%)';
        }

        // 2. Плавное схлопывание контейнера по высоте
        setTimeout(() => {
            container.style.transition = 'max-height 0.24s cubic-bezier(0.4, 0, 0.2, 1), margin 0.24s ease, opacity 0.2s ease, padding 0.24s ease';
            container.style.maxHeight = '0px';
            container.style.marginTop = '0px';
            container.style.marginBottom = '0px';
            container.style.paddingTop = '0px';
            container.style.paddingBottom = '0px';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';

            if (currentSwipedContainer === container) {
                currentSwipedContainer = null;
            }

            setTimeout(() => {
                removeItemFromShoppingList(itemId);
            }, 230);
        }, 120);
    }

    // === ЖЕСТ СВАЙПА ВЛЕВО ДЛЯ УДАЛЕНИЯ ИЗ СПИСКА ПОКУПОК ===
    let currentSwipedContainer = null;
    let swipeState = null;
    let closeCurrentSwipedFn = null;

    function initShoppingItemsSwipe() {
        if (window._shoppingSwipeInitialized) return;
        window._shoppingSwipeInitialized = true;

        function closeCurrentSwiped(animate = true) {
            if (!currentSwipedContainer) return;
            const c = currentSwipedContainer;
            currentSwipedContainer = null;
            const card = c.querySelector('.shopping-card');
            if (card) {
                if (animate) {
                    card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
                } else {
                    card.style.transition = 'none';
                }
                card.style.transform = 'translateX(0)';
            }
            c.classList.remove('is-open');
        }
        closeCurrentSwipedFn = closeCurrentSwiped;

        // Закрытие открытого свайпа при клике вне него
        document.addEventListener('click', (e) => {
            if (currentSwipedContainer && !currentSwipedContainer.contains(e.target)) {
                closeCurrentSwiped(true);
            }
        }, true);

        function onPointerStart(e) {
            if (window._isReorderDragging) return;
            if (e.type === 'mousedown' && e.button !== 0) return;

            // Не перехватываем клики по чекбоксу
            if (e.target.closest('.game-checkbox')) return;

            // Клик по красной кнопке удаления (иконке корзины)
            const deleteBtn = e.target.closest('.swipe-delete-background');
            if (deleteBtn) {
                const container = deleteBtn.closest('.swipe-item-container');
                if (container) {
                    const id = container.getAttribute('data-id');
                    e.preventDefault();
                    e.stopPropagation();
                    triggerItemDelete(container, id);
                }
                return;
            }

            const container = e.target.closest('.swipe-item-container');
            if (!container) return;

            const card = container.querySelector('.shopping-card');
            if (!card) return;
            if (card.classList.contains('is-completing') || card.classList.contains('is-disappearing')) return;

            // Если открыт другой элемент — закрываем его
            if (currentSwipedContainer && currentSwipedContainer !== container) {
                closeCurrentSwiped(true);
            }

            const isTouch = e.type.startsWith('touch');
            const point = isTouch ? e.touches[0] : e;
            const currentOffset = container.classList.contains('is-open') ? -74 : 0;

            swipeState = {
                container,
                card,
                id: container.getAttribute('data-id'),
                startX: point.clientX,
                startY: point.clientY,
                startTime: Date.now(),
                currentOffset,
                isLockedHorizontal: false,
                isLockedVertical: false,
                isTouch,
                moved: false,
                lastX: currentOffset
            };

            if (!isTouch) {
                window.addEventListener('mousemove', onPointerMove, { passive: false });
                window.addEventListener('mouseup', onPointerEnd, { passive: false });
            }
        }

        function onPointerMove(e) {
            if (window._isReorderDragging) {
                if (swipeState) swipeState = null;
                return;
            }
            if (!swipeState) return;

            const point = swipeState.isTouch ? e.touches[0] : e;
            if (!point) return;

            const deltaX = point.clientX - swipeState.startX;
            const deltaY = point.clientY - swipeState.startY;

            // Блокировка направления (вертикальный скролл vs горизонтальный свайп)
            if (!swipeState.isLockedHorizontal && !swipeState.isLockedVertical) {
                if (Math.abs(deltaY) > 6 && Math.abs(deltaY) >= Math.abs(deltaX)) {
                    swipeState.isLockedVertical = true;
                    return;
                } else if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
                    // Если карточка закрыта (currentOffset === 0) и тянут вправо (deltaX > 0) — строго запрещаем!
                    if (swipeState.currentOffset === 0 && deltaX > 0) {
                        return;
                    }
                    swipeState.isLockedHorizontal = true;
                    swipeState.card.style.transition = 'none';
                    swipeState.container.classList.add('is-swiping');
                } else {
                    return;
                }
            }

            if (swipeState.isLockedVertical) return;

            if (swipeState.isLockedHorizontal) {
                if (e.cancelable) e.preventDefault();
                swipeState.moved = true;

                let newX = swipeState.currentOffset + deltaX;

                // Движение вправо СТРОГО запрещено (нельзя уйти правее нуля)
                if (newX > 0) {
                    newX = 0;
                }

                // ПЕРВЫЙ СВАЙП (когда карточка была закрыта: currentOffset === 0):
                // Первый свайп короткий — открывает только позицию кнопки корзины (-74px)
                if (swipeState.currentOffset === 0) {
                    if (newX < -74) {
                        newX = -74 + (newX + 74) * 0.12;
                    }
                }

                swipeState.lastX = newX;
                swipeState.card.style.transform = `translateX(${newX}px)`;
            }
        }

        function onPointerEnd(e) {
            if (!swipeState) return;

            const state = swipeState;
            swipeState = null;

            if (!state.isTouch) {
                window.removeEventListener('mousemove', onPointerMove);
                window.removeEventListener('mouseup', onPointerEnd);
            }

            state.container.classList.remove('is-swiping');

            // Если не было горизонтального движения
            if (!state.isLockedHorizontal || !state.moved) {
                if (state.container.classList.contains('is-open')) {
                    closeCurrentSwiped(true);
                }
                return;
            }

            const point = state.isTouch ? (e.changedTouches ? e.changedTouches[0] : null) : e;
            const elapsed = Math.max(Date.now() - state.startTime, 1);
            const deltaX = point ? (point.clientX - state.startX) : (state.lastX - state.currentOffset);
            const velocityX = deltaX / elapsed;

            // ВЕТКА 1: Карточка УЖЕ была открыта (currentOffset < 0, то есть -74px)
            if (state.currentOffset < 0) {
                // Если пользователь продолжает свайпать влево (deltaX < -30 или velocityX < -0.28):
                // ВОТ ТЕПЕРЬ ОНА УЛЕТАЕТ ВЛЕВО И УДАЛЯЕТСЯ
                if (deltaX < -30 || (deltaX < -15 && velocityX < -0.28)) {
                    triggerItemDelete(state.container, state.id);
                    return;
                }

                // Если смахнул вправо обратно к 0
                if (deltaX > 25) {
                    state.card.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    state.card.style.transform = 'translateX(0)';
                    state.container.classList.remove('is-open');
                    if (currentSwipedContainer === state.container) {
                        currentSwipedContainer = null;
                    }
                    return;
                }

                // Иначе удерживаем в открытом положении -74px
                state.card.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
                state.card.style.transform = 'translateX(-74px)';
                state.container.classList.add('is-open');
                currentSwipedContainer = state.container;
                return;
            }

            // ВЕТКА 2: Карточка была закрыта (currentOffset === 0) — ПЕРВЫЙ СВАЙП
            // При первом свайпе карточка ТОЛЬКО открывает кнопку (-74px), но НЕ улетает
            if (state.lastX <= -25) {
                state.card.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
                state.card.style.transform = 'translateX(-74px)';
                state.container.classList.add('is-open');
                currentSwipedContainer = state.container;
                return;
            }

            // Если свайп был слишком слабым — закрываем обратно
            state.card.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
            state.card.style.transform = 'translateX(0)';
            state.container.classList.remove('is-open');
            if (currentSwipedContainer === state.container) {
                currentSwipedContainer = null;
            }
        }

        document.addEventListener('touchstart', onPointerStart, { passive: true });
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('touchend', onPointerEnd, { passive: true });
        document.addEventListener('touchcancel', onPointerEnd, { passive: true });
        document.addEventListener('mousedown', onPointerStart);
    }

    // === СИНХРОНИЗАЦИЯ ПОРЯДКА В FIRESTORE ===
    function syncShoppingItemsOrderToFirestore(items) {
        if (isTestMode() || !currentUid || !window.db || typeof window.setDoc !== 'function' || typeof window.doc !== 'function') return;
        items.forEach((item, index) => {
            try {
                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                window.setDoc(itemRef, { order: index, updatedAt: Date.now() }, { merge: true }).catch(() => { });
            } catch (e) { }
        });
    }

    function syncUserProductsOrderToFirestore(products) {
        if (isTestMode() || !currentUid || !window.db || typeof window.setDoc !== 'function' || typeof window.doc !== 'function') return;
        products.forEach((prod, index) => {
            try {
                const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', prod.id);
                window.setDoc(prodRef, { order: index, updatedAt: Date.now() }, { merge: true }).catch(() => { });
            } catch (e) { }
        });
    }

    // === DRAG & DROP ПЕРЕМЕЩЕНИЕ КАРТОЧЕК ПАЛЬЦЕМ / МЫШЬЮ (В СПИСКЕ И СЕТКЕ/ГАЛЕРЕЕ) ===
    function initReorderDragAndDrop() {
        let holdTimer = null;
        let isDragging = false;
        let hasMoved = false;
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let currentY = 0;
        let startClientX = 0;
        let startClientY = 0;
        let draggedItem = null;
        let placeholder = null;
        let container = null;
        let origRect = null;
        let autoScrollRaf = null;

        function getItemFromTarget(target) {
            if (!target) return null;
            if (target.closest('.game-checkbox, button, input, textarea, a, .swipe-delete-background, .btn-product-add')) {
                return null;
            }

            const activeList = document.getElementById('activeItemsList');
            const catalogGrid = document.getElementById('catalogProductsGrid');

            if (activeList && activeList.contains(target)) {
                if (activeList.classList.contains('view-list')) {
                    return target.closest('.swipe-item-container');
                } else {
                    return target.closest('.shopping-card');
                }
            }

            if (catalogGrid && catalogGrid.contains(target)) {
                return target.closest('.product-catalog-card');
            }

            return null;
        }

        function onPointerDown(e) {
            if (e.type === 'mousedown' && e.button !== 0) return;
            if (isDragging) return;

            const item = getItemFromTarget(e.target);
            if (!item) return;

            const parent = item.parentElement;
            if (!parent || parent.children.length <= 1) return;

            const point = e.touches ? e.touches[0] : e;
            startX = point.clientX;
            startY = point.clientY;
            currentX = startX;
            currentY = startY;
            hasMoved = false;

            clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
                startDrag(item, parent, point);
            }, 240);

            if (!e.touches) {
                window.addEventListener('mousemove', onPointerMove, { passive: false });
                window.addEventListener('mouseup', onPointerUp, { passive: false });
            }
        }

        function startDrag(item, parent, point) {
            isDragging = true;
            window._isReorderDragging = true;
            draggedItem = item;
            container = parent;

            if (typeof closeCurrentSwipedFn === 'function') {
                try { closeCurrentSwipedFn(false); } catch (err) { }
            }

            if (navigator.vibrate) {
                try { navigator.vibrate(28); } catch (err) { }
            }

            origRect = item.getBoundingClientRect();
            startClientX = point.clientX;
            startClientY = point.clientY;

            placeholder = document.createElement('div');
            placeholder.className = 'drag-placeholder';
            placeholder.style.width = `${origRect.width}px`;
            placeholder.style.height = `${origRect.height}px`;

            item.before(placeholder);

            item.classList.add('is-dragging-card');
            item.style.width = `${origRect.width}px`;
            item.style.height = `${origRect.height}px`;
            item.style.left = `${origRect.left}px`;
            item.style.top = `${origRect.top}px`;
            item.style.margin = '0';
            item.style.transform = 'translate3d(0, 0, 0) scale(1.04)';

            document.body.classList.add('is-reordering');
            startAutoScroll();
        }

        function onPointerMove(e) {
            const point = e.touches ? e.touches[0] : e;
            if (!point) return;

            currentX = point.clientX;
            currentY = point.clientY;

            if (!isDragging) {
                const dist = Math.hypot(currentX - startX, currentY - startY);
                if (dist > 7) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                return;
            }

            if (e.cancelable) e.preventDefault();

            hasMoved = true;
            const dx = currentX - startClientX;
            const dy = currentY - startClientY;
            draggedItem.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.04)`;

            checkReorderTarget(currentX, currentY);
        }

        function checkReorderTarget(x, y) {
            if (!placeholder || !container) return;

            const target = document.elementFromPoint(x, y);
            if (!target) return;

            let sibling = null;
            if (container.id === 'catalogProductsGrid') {
                sibling = target.closest('.product-catalog-card');
            } else if (container.id === 'activeItemsList') {
                if (container.classList.contains('view-list')) {
                    sibling = target.closest('.swipe-item-container');
                } else {
                    sibling = target.closest('.shopping-card');
                }
            } else {
                sibling = target.closest('.product-catalog-card') || target.closest('.swipe-item-container') || target.closest('.shopping-card');
            }

            if (!sibling || sibling === placeholder || sibling === draggedItem || !container.contains(sibling)) {
                return;
            }

            const rect = sibling.getBoundingClientRect();

            if (container.classList.contains('view-list')) {
                const middleY = rect.top + rect.height / 2;
                if (y < middleY) {
                    if (sibling.previousElementSibling !== placeholder) {
                        sibling.before(placeholder);
                    }
                } else {
                    if (sibling.nextElementSibling !== placeholder) {
                        sibling.after(placeholder);
                    }
                }
            } else {
                const all = Array.from(container.children).filter(el => el !== draggedItem);
                const pIdx = all.indexOf(placeholder);
                const sIdx = all.indexOf(sibling);
                const middleY = rect.top + rect.height / 2;

                if (pIdx < sIdx) {
                    if (x > rect.left + rect.width * 0.25 || y > middleY) {
                        sibling.after(placeholder);
                    }
                } else {
                    if (x < rect.right - rect.width * 0.25 || y < middleY) {
                        sibling.before(placeholder);
                    }
                }
            }
        }

        function startAutoScroll() {
            cancelAnimationFrame(autoScrollRaf);
            function loop() {
                if (!isDragging) return;
                const threshold = 80;
                const maxSpeed = 10;
                if (currentY < threshold) {
                    const ratio = (threshold - currentY) / threshold;
                    window.scrollBy(0, -Math.round(ratio * maxSpeed));
                } else if (currentY > window.innerHeight - threshold) {
                    const ratio = (currentY - (window.innerHeight - threshold)) / threshold;
                    window.scrollBy(0, Math.round(ratio * maxSpeed));
                }
                autoScrollRaf = requestAnimationFrame(loop);
            }
            autoScrollRaf = requestAnimationFrame(loop);
        }

        function onPointerUp(e) {
            clearTimeout(holdTimer);
            holdTimer = null;

            if (!e.touches) {
                window.removeEventListener('mousemove', onPointerMove);
                window.removeEventListener('mouseup', onPointerUp);
            }

            if (!isDragging) return;
            isDragging = false;
            cancelAnimationFrame(autoScrollRaf);

            if (!draggedItem || !placeholder) {
                cleanupDrag();
                return;
            }

            const pRect = placeholder.getBoundingClientRect();
            const targetDx = pRect.left - origRect.left;
            const targetDy = pRect.top - origRect.top;

            draggedItem.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)';
            draggedItem.style.transform = `translate3d(${targetDx}px, ${targetDy}px, 0) scale(1)`;

            setTimeout(() => {
                if (placeholder && placeholder.parentNode && draggedItem) {
                    placeholder.replaceWith(draggedItem);
                }
                cleanupDrag();
                finalizeReorder(container);
            }, 220);
        }

        function cleanupDrag() {
            if (draggedItem) {
                draggedItem.classList.remove('is-dragging-card');
                draggedItem.style.position = '';
                draggedItem.style.width = '';
                draggedItem.style.height = '';
                draggedItem.style.left = '';
                draggedItem.style.top = '';
                draggedItem.style.margin = '';
                draggedItem.style.transform = '';
                draggedItem.style.transition = '';
                draggedItem.style.zIndex = '';
            }
            if (placeholder && placeholder.parentNode) {
                placeholder.remove();
            }
            placeholder = null;
            draggedItem = null;
            document.body.classList.remove('is-reordering');

            if (hasMoved) {
                const preventClick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.removeEventListener('click', preventClick, true);
                };
                window.addEventListener('click', preventClick, true);
                setTimeout(() => window.removeEventListener('click', preventClick, true), 120);
            }

            setTimeout(() => {
                window._isReorderDragging = false;
            }, 150);
        }

        function finalizeReorder(targetContainer) {
            if (!targetContainer) return;

            if (navigator.vibrate) {
                try { navigator.vibrate(18); } catch (err) { }
            }

            const ids = Array.from(targetContainer.children)
                .map(c => c.getAttribute('data-id'))
                .filter(Boolean);

            if (targetContainer.id === 'activeItemsList') {
                const bought = shoppingItems.filter(i => i.completed);
                const activeMap = new Map(shoppingItems.filter(i => !i.completed).map(i => [i.id, i]));
                const newActive = [];

                ids.forEach((id, index) => {
                    const item = activeMap.get(id);
                    if (item) {
                        item.order = index;
                        newActive.push(item);
                        activeMap.delete(id);
                    }
                });

                activeMap.forEach((item) => {
                    item.order = newActive.length;
                    newActive.push(item);
                });

                shoppingItems = [...newActive, ...bought];
                saveLocalCache();
                syncShoppingItemsOrderToFirestore(newActive);
            } else if (targetContainer.id === 'catalogProductsGrid') {
                const prodMap = new Map(userProducts.map(p => [p.id, p]));
                const reorderedSublist = ids.map(id => prodMap.get(id)).filter(Boolean);

                if (ids.length >= userProducts.length) {
                    userProducts = reorderedSublist;
                } else {
                    // Если включен фильтр по категориям: заменяем только позиции отфильтрованных товаров
                    const idSet = new Set(ids);
                    let subIdx = 0;
                    userProducts = userProducts.map(p => {
                        if (idSet.has(p.id)) {
                            return reorderedSublist[subIdx++];
                        }
                        return p;
                    });
                }

                userProducts.forEach((p, idx) => {
                    p.order = idx;
                });

                saveLocalCache();
                syncUserProductsOrderToFirestore(userProducts);
            }
        }

        window.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerUp, { passive: false });
        window.addEventListener('touchcancel', onPointerUp, { passive: false });
        window.addEventListener('mousedown', onPointerDown);
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
                    } catch (e) { }
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
            shoppingItems.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                return (b.createdAt || 0) - (a.createdAt || 0);
            });
            cleanupExpiredBoughtItems();
        } catch (e) {
            shoppingItems = [];
        }

        try {
            const cachedProds = localStorage.getItem('shopping_products_cache');
            userProducts = cachedProds ? JSON.parse(cachedProds) : [];
            // Фильтруем битые элементы без названия
            userProducts = userProducts.filter(p => p && p.name && typeof p.name === 'string' && p.name.trim().length > 0);
            userProducts.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                return (b.createdAt || 0) - (a.createdAt || 0);
            });
            cleanupExpiredTrashProducts();
        } catch (e) {
            userProducts = [];
        }

        try {
            const cachedCats = localStorage.getItem('shopping_categories_cache');
            userCategories = cachedCats ? JSON.parse(cachedCats) : [];
            if (!Array.isArray(userCategories)) userCategories = [];
        } catch (e) {
            userCategories = [];
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
            localStorage.setItem('shopping_categories_cache', JSON.stringify(userCategories));
        } catch (e) { }
    }

    // === СЛУШАТЕЛЬ FIREBASE ===
    function setupFirestore(uid) {
        if (!uid || !window.db || isTestMode()) return;
        if (unsubItems) unsubItems();
        if (unsubProducts) unsubProducts();
        if (unsubCategories) unsubCategories();

        try {
            if (typeof window.collection === 'function' && typeof window.onSnapshot === 'function') {
                const itemsColRef = window.collection(window.db, 'users', uid, 'shopping_items');
                unsubItems = window.onSnapshot(itemsColRef, (snapshot) => {
                    if (isTestMode()) return;
                    const loaded = [];
                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data && data.name && typeof data.name === 'string' && data.name.trim().length > 0) {
                            loaded.push({ ...data, id: String(docSnap.id) });
                        } else {
                            // Очищаем пустые/битые документы в Firestore
                            if (typeof window.deleteDoc === 'function') {
                                window.deleteDoc(docSnap.ref).catch(() => { });
                            }
                        }
                    });

                    loaded.sort((a, b) => {
                        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                        if (a.order !== undefined) return -1;
                        if (b.order !== undefined) return 1;
                        return (b.createdAt || 0) - (a.createdAt || 0);
                    });
                    shoppingItems = loaded;
                    cleanupExpiredBoughtItems();
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
                        const data = docSnap.data();
                        if (data && data.name && typeof data.name === 'string' && data.name.trim().length > 0) {
                            loaded.push({ ...data, id: String(docSnap.id) });
                        } else {
                            if (typeof window.deleteDoc === 'function') {
                                window.deleteDoc(docSnap.ref).catch(() => { });
                            }
                        }
                    });

                    loaded.sort((a, b) => {
                        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
                        if (a.order !== undefined) return -1;
                        if (b.order !== undefined) return 1;
                        return (b.createdAt || 0) - (a.createdAt || 0);
                    });
                    userProducts = loaded;
                    cleanupExpiredTrashProducts();
                    saveLocalCache();

                    if (currentMainTab === 'myProducts') renderCatalog();
                }, (err) => {
                    console.error('[Shopping] Ошибка подписки на базу товаров Firestore:', err);
                });

                // Подписка на пользовательские категории в Firestore
                const catsColRef = window.collection(window.db, 'users', uid, 'shopping_categories');
                unsubCategories = window.onSnapshot(catsColRef, (snapshot) => {
                    if (isTestMode()) return;
                    const loaded = [];
                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data && typeof data === 'object') {
                            loaded.push({ ...data, id: String(docSnap.id), name: data.name || '', icon: data.icon || '🏷️' });
                        }
                    });

                    loaded.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                    userCategories = loaded;
                    saveLocalCache();

                    // Не перерендериваем если сейчас активен ввод в одном из инпутов категорий
                    const activeEl = document.activeElement;
                    const isEditingCategoryInput = activeEl && activeEl.classList && activeEl.classList.contains('category-inline-name-input');
                    if (currentMainTab === 'settings' && !isEditingCategoryInput) {
                        renderCategoriesList();
                    }
                }, (err) => {
                    console.error('[Shopping] Ошибка подписки на категории Firestore:', err);
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

    // === МОДАЛЬНОЕ ОКНО ПРОСМОТРА / РЕДАКТИРОВАНИЯ ТОВАРА В БАЗЕ (КАК В TODO) ===
    let currentDetailsProductId = null;

    function autoResizeModalInput(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    function openProductDetailsModal(prod) {
        if (!prod) return;
        currentDetailsProductId = prod.id;
        const els = getEls();
        if (!els.productDetailsModal) return;

        if (els.modalProductTitleDisplay) {
            els.modalProductTitleDisplay.textContent = prod.name;
            els.modalProductTitleDisplay.style.display = 'block';
        }
        if (els.modalProductTitleInput) {
            els.modalProductTitleInput.value = prod.name;
            els.modalProductTitleInput.style.display = 'none';
        }
        if (els.modalProductImageDisplay) {
            els.modalProductImageDisplay.src = prod.imageUrl || PLACEHOLDER_IMG;
            els.modalProductImageDisplay.alt = prod.name;
        }
        if (els.productActionsDropdown) {
            els.productActionsDropdown.style.display = 'none';
        }

        if (els.productDetailsCard) {
            els.productDetailsCard.style.transform = '';
            els.productDetailsCard.style.transition = '';
        }

        document.body.classList.add('add-modal-open');
        els.productDetailsModal.style.display = 'flex';
        els.productDetailsModal.offsetHeight; // reflow
        els.productDetailsModal.classList.add('active');
    }

    function closeProductDetailsModal() {
        const els = getEls();
        closeEditImageModal();
        if (!els.productDetailsModal) return;
        els.productDetailsModal.classList.remove('active');
        if (els.productActionsDropdown) {
            els.productActionsDropdown.style.display = 'none';
        }
        if (els.productDetailsCard) {
            els.productDetailsCard.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';
            els.productDetailsCard.style.transform = 'translateY(100%)';
            els.productDetailsCard.style.height = '';
        }
        setTimeout(() => {
            if (!els.productDetailsModal.classList.contains('active')) {
                els.productDetailsModal.style.display = 'none';
                if (els.productDetailsCard) {
                    els.productDetailsCard.style.transform = '';
                    els.productDetailsCard.style.transition = '';
                    els.productDetailsCard.style.height = '';
                }
            }
        }, 300);
        document.body.classList.remove('add-modal-open');
        currentDetailsProductId = null;
    }

    function saveProductDetailsTitle() {
        const els = getEls();
        if (!els.modalProductTitleInput || !currentDetailsProductId) return;
        const newName = els.modalProductTitleInput.value.trim();
        const prod = userProducts.find(p => p.id === currentDetailsProductId);

        if (prod && newName && newName !== prod.name) {
            const oldName = prod.name;
            prod.name = newName;
            prod.updatedAt = Date.now();

            let itemsChanged = false;
            shoppingItems.forEach(item => {
                if (item.name.toLowerCase() === oldName.toLowerCase()) {
                    item.name = newName;
                    item.updatedAt = Date.now();
                    itemsChanged = true;
                    if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
                        try {
                            const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                            window.setDoc(itemRef, { name: newName, updatedAt: item.updatedAt }, { merge: true });
                        } catch (e) { }
                    }
                }
            });

            saveLocalCache();
            renderCatalog();
            if (itemsChanged && currentMainTab === 'shoppingList') renderItems();

            if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
                try {
                    const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', prod.id);
                    window.setDoc(prodRef, { name: newName, updatedAt: prod.updatedAt }, { merge: true });
                } catch (e) {
                    console.warn('[Shopping] Ошибка обновления названия товара:', e);
                }
            }
        }

        const finalName = prod ? prod.name : newName;
        if (els.modalProductTitleDisplay) {
            els.modalProductTitleDisplay.textContent = finalName;
            els.modalProductTitleDisplay.style.display = 'block';
        }
        els.modalProductTitleInput.style.display = 'none';
    }

    // Универсальная логика модального окна подтверждения (как в todo.html)
    let customConfirmCallback = null;

    function showCustomConfirm(title, descHtml, actionText, onConfirm) {
        const els = getEls();
        if (!els.confirmDeleteModal) return;

        if (els.confirmModalTitle) els.confirmModalTitle.textContent = title;
        if (els.confirmModalDesc) els.confirmModalDesc.innerHTML = descHtml;
        if (els.btnConfirmDeleteSubmit) els.btnConfirmDeleteSubmit.textContent = actionText;

        customConfirmCallback = onConfirm;
        els.confirmDeleteModal.style.display = 'flex';
    }

    function hideCustomConfirm() {
        customConfirmCallback = null;
        const els = getEls();
        if (els.confirmDeleteModal) els.confirmDeleteModal.style.display = 'none';
    }

    // Перемещение товара в корзину (Soft delete)
    function moveProductToTrash(prodId) {
        const prod = userProducts.find(p => p.id === prodId);
        if (!prod) return;

        prod.deleted = true;
        prod.deletedAt = Date.now();
        prod.updatedAt = Date.now();

        saveLocalCache();
        renderCatalog();
        renderSettingsView();

        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
            try {
                const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', prod.id);
                window.setDoc(prodRef, {
                    deleted: true,
                    deletedAt: prod.deletedAt,
                    updatedAt: prod.updatedAt
                }, { merge: true }).catch(e => console.warn('[Shopping] Ошибка перемещения товара в корзину:', e));
            } catch (e) {
                console.warn('[Shopping] Ошибка сохранения в Firebase:', e);
            }
        }

        showItemCompletedToast({ name: `Товар «${prod.name}» перемещен в корзину` });
    }

    // Восстановление товара из корзины обратно в «Мои товары»
    function restoreProductFromTrash(prodId) {
        const prod = userProducts.find(p => p.id === prodId);
        if (!prod) return;

        prod.deleted = false;
        delete prod.deletedAt;
        prod.updatedAt = Date.now();

        saveLocalCache();
        renderCatalog();
        renderTrashView();
        renderSettingsView();

        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
            try {
                const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', prod.id);
                window.setDoc(prodRef, {
                    deleted: false,
                    deletedAt: null,
                    updatedAt: prod.updatedAt
                }, { merge: true }).catch(e => console.warn('[Shopping] Ошибка восстановления товара:', e));
            } catch (e) {
                console.warn('[Shopping] Ошибка сохранения в Firebase:', e);
            }
        }

        showItemCompletedToast({ name: `Товар «${prod.name}» восстановлен` });
    }

    // Окончательное удаление товара из корзины навсегда
    function deleteProductPermanently(prodId) {
        const idx = userProducts.findIndex(p => p.id === prodId);
        if (idx === -1) return;
        const removed = userProducts.splice(idx, 1)[0];

        saveLocalCache();
        renderCatalog();
        renderTrashView();
        renderSettingsView();

        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.deleteDoc === 'function') {
            try {
                const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', prodId);
                window.deleteDoc(prodRef).catch(e => console.warn('[Shopping] Ошибка безвозвратного удаления товара:', e));
            } catch (e) {
                console.warn('[Shopping] Ошибка удаления из Firebase:', e);
            }
        }

        showItemCompletedToast({ name: `Товар «${removed.name}» удален навсегда` });
    }

    // Очистить всю корзину навсегда
    function emptyTrash() {
        const trashed = userProducts.filter(p => p.deleted);
        if (trashed.length === 0) return;

        const trashedIds = trashed.map(p => p.id);
        userProducts = userProducts.filter(p => !p.deleted);

        saveLocalCache();
        renderCatalog();
        renderTrashView();
        renderSettingsView();

        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.deleteDoc === 'function') {
            trashedIds.forEach(id => {
                try {
                    const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', id);
                    window.deleteDoc(prodRef).catch(() => {});
                } catch (e) {}
            });
        }

        showItemCompletedToast({ name: 'Корзина полностью очищена' });
    }

    // Автоочистка корзины: удаление товаров, которые находятся в корзине дольше 30 дней
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    function cleanupExpiredTrashProducts() {
        const now = Date.now();
        const expiredIds = [];

        userProducts = userProducts.filter(prod => {
            if (prod.deleted && prod.deletedAt) {
                const elapsed = now - prod.deletedAt;
                if (elapsed >= THIRTY_DAYS_MS) {
                    expiredIds.push(prod.id);
                    return false;
                }
            }
            return true;
        });

        if (expiredIds.length > 0) {
            saveLocalCache();
            if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.deleteDoc === 'function') {
                expiredIds.forEach(id => {
                    try {
                        const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', id);
                        window.deleteDoc(prodRef).catch(() => {});
                    } catch (e) {}
                });
            }
        }
    }

    // Рендер экрана корзины
    function renderTrashView() {
        const els = getEls();
        if (!els.trashItemsList) return;

        cleanupExpiredTrashProducts();
        const trashed = userProducts.filter(p => p.deleted);

        if (trashed.length === 0) {
            els.trashItemsList.innerHTML = '';
            if (els.trashEmptyState) els.trashEmptyState.style.display = 'flex';
            if (els.trashNoticeBanner) els.trashNoticeBanner.style.display = 'none';
            return;
        }

        if (els.trashEmptyState) els.trashEmptyState.style.display = 'none';
        if (els.trashNoticeBanner) els.trashNoticeBanner.style.display = 'flex';

        const now = Date.now();
        els.trashItemsList.innerHTML = trashed.map(prod => {
            const prodImg = prod.imageUrl || PLACEHOLDER_IMG;
            const elapsedDays = Math.floor((now - (prod.deletedAt || now)) / (24 * 60 * 60 * 1000));
            const daysLeft = Math.max(1, 30 - elapsedDays);
            const daysWord = daysLeft === 1 ? 'день' : ((daysLeft >= 2 && daysLeft <= 4) ? 'дня' : 'дней');

            return `
                <div class="trash-item-card" data-id="${prod.id}">
                    <div class="trash-item-left">
                        <div class="trash-item-img-wrap">
                            <img src="${prodImg}" alt="${escapeHtml(prod.name)}" class="trash-item-img" draggable="false">
                        </div>
                        <div class="trash-item-info">
                            <span class="trash-item-title">${escapeHtml(prod.name)}</span>
                            <span class="trash-item-days">Осталось ${daysLeft} ${daysWord}</span>
                        </div>
                    </div>
                    <div class="trash-item-actions">
                        <button class="trash-action-btn btn-restore" type="button" title="Восстановить в Мои товары" data-action="restore">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" width="16" height="16">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                        </button>
                        <button class="trash-action-btn btn-delete-perm" type="button" title="Удалить навсегда" data-action="delete-perm">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Клики по кнопкам в карточках корзины
        els.trashItemsList.querySelectorAll('.trash-action-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const card = btn.closest('.trash-item-card');
                if (!card) return;
                const prodId = card.getAttribute('data-id');
                const action = btn.getAttribute('data-action');
                const prod = userProducts.find(p => p.id === prodId);
                if (!prod) return;

                if (action === 'restore') {
                    restoreProductFromTrash(prodId);
                } else if (action === 'delete-perm') {
                    showCustomConfirm(
                        "Удалить навсегда?",
                        `Товар <strong>${escapeHtml(prod.name)}</strong> будет удален навсегда без возможности восстановления.`,
                        "Удалить",
                        () => {
                            deleteProductPermanently(prodId);
                        }
                    );
                }
            };
        });
    }

    // Состояние загрузки изображения для модалки базы товаров
    let currentUploadedImageUrl = null;
    let currentUploadTab = 'file';

    // Стандартное модальное окно добавления товара в базу (файл, drag & drop, вставка, ссылка)
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

    // Модальное окно замены / удаления изображения товара
    let currentEditUploadedImageUrl = null;
    let currentEditUploadTab = 'file';

    function openEditImageModal() {
        if (!currentDetailsProductId) return;
        const prod = userProducts.find(p => p.id === currentDetailsProductId);
        if (!prod) return;

        const currentEls = getEls();
        if (!currentEls.editImageModalOverlay) return;

        currentEditUploadedImageUrl = prod.imageUrl || null;
        currentEditUploadTab = 'file';

        if (currentEls.editProductUrlInput) {
            currentEls.editProductUrlInput.value = prod.imageUrl || '';
        }

        if (currentEls.editUrlPreviewWrap && currentEls.editUrlPreviewImg) {
            if (prod.imageUrl) {
                currentEls.editUrlPreviewImg.src = prod.imageUrl;
                currentEls.editUrlPreviewWrap.style.display = 'flex';
            } else {
                currentEls.editUrlPreviewWrap.style.display = 'none';
            }
        }

        // Настройка дропзоны с текущим изображением
        if (currentEls.editDropzonePreview) {
            if (prod.imageUrl) {
                currentEls.editDropzonePreview.innerHTML = `<img src="${prod.imageUrl}" alt="Превью" style="width: 100%; height: 100%; object-fit: contain;">`;
            } else {
                currentEls.editDropzonePreview.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
                `;
            }
        }
        if (currentEls.editDropzoneText) {
            currentEls.editDropzoneText.textContent = prod.imageUrl
                ? 'Текущее изображение (кликните для замены)'
                : 'Кликните для выбора файла или перетащите его сюда';
        }

        // Кнопка удаления изображения
        if (currentEls.btnDeleteProductImage) {
            currentEls.btnDeleteProductImage.style.display = prod.imageUrl ? 'flex' : 'none';
        }

        switchEditUploadTab('file');

        currentEls.editImageModalOverlay.style.display = 'flex';
        currentEls.editImageModalOverlay.classList.add('open');
    }

    function closeEditImageModal() {
        const currentEls = getEls();
        if (currentEls.editImageModalOverlay) {
            currentEls.editImageModalOverlay.style.display = 'none';
            currentEls.editImageModalOverlay.classList.remove('open');
        }
    }

    function switchEditUploadTab(tab) {
        currentEditUploadTab = tab;
        const currentEls = getEls();
        if (!currentEls.editImageModalOverlay) return;

        if (currentEls.tabBtnEditFile) {
            currentEls.tabBtnEditFile.classList.toggle('active', tab === 'file');
        }
        if (currentEls.tabBtnEditUrl) {
            currentEls.tabBtnEditUrl.classList.toggle('active', tab === 'url');
        }

        if (tab === 'file') {
            if (currentEls.tabEditProductFile) currentEls.tabEditProductFile.style.display = 'flex';
            if (currentEls.tabEditProductUrl) currentEls.tabEditProductUrl.style.display = 'none';
        } else {
            if (currentEls.tabEditProductFile) currentEls.tabEditProductFile.style.display = 'none';
            if (currentEls.tabEditProductUrl) currentEls.tabEditProductUrl.style.display = 'flex';
            if (currentEls.editProductUrlInput) {
                setTimeout(() => currentEls.editProductUrlInput.focus(), 80);
            }
        }
    }

    async function handleEditImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const currentEls = getEls();

        if (currentEls.editDropzonePreview) {
            currentEls.editDropzonePreview.innerHTML = `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite; color: var(--purple-primary);">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-dasharray="32" stroke-dashoffset="8" fill="none" opacity="0.3"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
                </svg>
            `;
        }
        if (currentEls.editDropzoneText) currentEls.editDropzoneText.textContent = 'Сжатие в 256x256 WebP...';
        if (currentEls.btnSaveEditedImage) currentEls.btnSaveEditedImage.disabled = true;

        try {
            const { blob, dataUrl } = await processImageToWebpBlob(file, 256);
            currentEditUploadedImageUrl = dataUrl;

            if (currentEls.editDropzoneText) currentEls.editDropzoneText.textContent = 'Отправка на ImgBB...';

            try {
                const imgbbUrl = await uploadToImgBB(blob);
                currentEditUploadedImageUrl = imgbbUrl;
            } catch (netErr) {
                console.warn('[Shopping] Не удалось отправить на ImgBB, сохранено локально:', netErr);
            }

            if (currentEls.editDropzonePreview) {
                currentEls.editDropzonePreview.innerHTML = `<img src="${currentEditUploadedImageUrl}" alt="Превью" style="width: 100%; height: 100%; object-fit: contain;">`;
            }
            if (currentEls.editDropzoneText) currentEls.editDropzoneText.textContent = 'Изображение готово (256x256 WebP)';
            if (currentEls.btnDeleteProductImage) currentEls.btnDeleteProductImage.style.display = 'flex';
        } catch (err) {
            console.error('[Shopping] Ошибка обработки изображения:', err);
            if (currentEls.editDropzoneText) currentEls.editDropzoneText.textContent = 'Ошибка загрузки файла';
        } finally {
            if (currentEls.btnSaveEditedImage) currentEls.btnSaveEditedImage.disabled = false;
        }
    }

    function initProductDetailsDrag() {
        const els = getEls();
        const card = els.productDetailsCard;
        const container = els.productDetailsDragContainer;
        const overlay = els.productDetailsModal;
        if (!card || !overlay) return;

        let isDragging = false;
        let isPullingUp = false;
        let startY = 0;
        let startX = 0;
        let startHeight = 0;
        let currentY = 0;
        let lastY = 0;
        let lastTime = 0;
        let velocityY = 0;

        function onStart(e) {
            if (e.target.closest('#btnProductDetailsClose, #btnProductDetailsMore, .product-actions-dropdown, textarea, input, #btnEditProductImage, .product-details-edit-img-btn')) {
                return;
            }
            if (e.type === 'mousedown' && e.button !== 0) return;

            const touch = e.touches ? e.touches[0] : e;
            startY = touch.clientY;
            startX = touch.clientX;
            currentY = startY;
            lastY = startY;
            lastTime = Date.now();
            velocityY = 0;
            startHeight = card.getBoundingClientRect().height;
            isDragging = true;
            isPullingUp = false;

            card.classList.add('is-dragging');
            card.style.transition = 'none';
        }

        function onMove(e) {
            if (!isDragging) return;
            const touch = e.touches ? e.touches[0] : e;
            currentY = touch.clientY;
            const deltaX = touch.clientX - startX;
            const deltaY = currentY - startY;

            if (deltaY < 0) {
                // Тянем вверх: растягиваем карточку в высоту (нижний край остаётся прижат к низу экрана, пустоты нет)
                isPullingUp = true;
                if (e.cancelable) e.preventDefault();
                const overscroll = Math.abs(deltaY);
                const rubber = Math.round(overscroll * 0.45);
                card.style.transform = 'translateY(0px)';
                card.style.height = `${startHeight + rubber}px`;
            } else {
                // Тянем вниз: сдвигаем карточку вниз
                isPullingUp = false;
                if (e.cancelable) e.preventDefault();
                card.style.height = '';
                card.style.transform = `translateY(${deltaY}px)`;
            }

            const now = Date.now();
            const dt = now - lastTime;
            if (dt > 10) {
                velocityY = (touch.clientY - lastY) / dt;
                lastY = touch.clientY;
                lastTime = now;
            }
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            card.classList.remove('is-dragging');
            const deltaY = currentY - startY;

            if (deltaY <= 0 || isPullingUp) {
                // Тянули вверх: НИ В КОЕМ СЛУЧАЕ НЕ ЗАКРЫВАЕТСЯ! Пружинно падает обратно в исходную высоту
                card.style.transition = 'height 0.36s cubic-bezier(0.175, 0.885, 0.32, 1.25)';
                card.style.height = '';
                card.style.transform = 'translateY(0px)';
                setTimeout(() => {
                    if (card && !isDragging) {
                        card.style.transform = '';
                        card.style.transition = '';
                        card.style.height = '';
                    }
                }, 360);
            } else if (deltaY > 60 || (deltaY > 30 && velocityY > 0.32)) {
                // Осознанный свайп вниз: закрытие
                card.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)';
                card.style.transform = 'translateY(100%)';
                setTimeout(() => {
                    closeProductDetailsModal();
                }, 250);
            } else {
                // Небольшое смещение вниз: возврат в исходное положение
                card.style.transition = 'transform 0.22s ease, height 0.22s ease';
                card.style.transform = 'translateY(0px)';
                card.style.height = '';
                setTimeout(() => {
                    if (card && !isDragging) {
                        card.style.transform = '';
                        card.style.transition = '';
                        card.style.height = '';
                    }
                }, 220);
            }
        }

        if (container) {
            container.addEventListener('touchstart', onStart, { passive: true });
            container.addEventListener('mousedown', onStart);
        }
        card.addEventListener('touchstart', onStart, { passive: true });
        card.addEventListener('mousedown', onStart);

        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mousemove', onMove);

        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
        window.addEventListener('mouseup', onEnd);
    }

    // === ИНИЦИАЛИЗАЦИЯ И СЛУШАТЕЛИ ===
    function init() {
        const els = getEls();

        // Главные вкладки («Список покупок» / «Мои товары» / «Настройки»)
        if (els.tabShoppingList) {
            els.tabShoppingList.onclick = () => setMainTab('shoppingList');
        }
        if (els.tabMyProducts) {
            els.tabMyProducts.onclick = () => setMainTab('myProducts');
        }
        if (els.tabSettings) {
            els.tabSettings.onclick = () => setMainTab('settings');
        }

        // Кнопка выхода / входа в блоке профиля
        const btnLogout = document.getElementById('btnSettingsLogout');
        if (btnLogout) {
            btnLogout.onclick = () => {
                const cachedUserStr = localStorage.getItem('todo_cached_user');
                let user = (window.firebaseAuth && window.firebaseAuth.currentUser) || window.currentUser;
                if (!user && cachedUserStr) {
                    try { user = JSON.parse(cachedUserStr); } catch (e) {}
                }

                if (user && (user.uid || user.email || user.displayName)) {
                    // Выход из аккаунта
                    const authLogoutBtn = document.getElementById('btnLogout');
                    if (authLogoutBtn) {
                        authLogoutBtn.click();
                    } else if (window.firebaseAuth && typeof window.firebaseAuth.signOut === 'function') {
                        window.firebaseAuth.signOut();
                    } else {
                        localStorage.removeItem('todo_cached_user');
                        window.dispatchEvent(new CustomEvent('authChanged', { detail: { user: null } }));
                    }
                } else {
                    // Вход в аккаунт через auth-widget
                    if (typeof window.openAuthModal === 'function') {
                        window.openAuthModal(btnLogout, 'login');
                    } else {
                        const loginBtn = document.getElementById('auth-login-btn');
                        if (loginBtn) loginBtn.click();
                    }
                }
            };
        }

        // Переключение тем в настройках
        document.querySelectorAll('.theme-choice-btn').forEach(btn => {
            btn.onclick = () => {
                const mode = btn.dataset.themeMode;
                if (window.setTheme) {
                    window.setTheme(mode);
                } else {
                    localStorage.setItem('themeMode_shopping', mode);
                    document.body.classList.toggle('dark', mode === 'dark');
                }
                document.querySelectorAll('.theme-choice-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });

        // Применяем сохраненный режим кропа картинок в списке
        applyListCropMode(localStorage.getItem('shopping_list_crop_mode') === 'edge');

        // Тумблер кропа картинок
        if (els.toggleListCropMode) {
            els.toggleListCropMode.onchange = (e) => {
                applyListCropMode(e.target.checked);
            };
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

        // Клик по круглому плюсу (FAB во вкладке «Мои товары»)
        if (els.btnOpenAddModal) {
            els.btnOpenAddModal.onclick = openProductModal;
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
            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
            if (!items) return;

            if (currentEls.editImageModalOverlay && currentEls.editImageModalOverlay.style.display !== 'none') {
                for (const item of items) {
                    if (item.type && item.type.indexOf('image') === 0) {
                        const file = item.getAsFile();
                        if (file) {
                            switchEditUploadTab('file');
                            handleEditImageFile(file);
                        }
                        break;
                    }
                }
                return;
            }

            if (!currentEls.productModalOverlay || currentEls.productModalOverlay.style.display === 'none') return;
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
            if (e.key === 'Escape') {
                hideCustomConfirm();
                closeEditImageModal();
                closeAddModal();
                closeProductModal();
                closeProductDetailsModal();
            }
        });

        // Слушатели модального окна деталей товара (как в todo.html)
        if (els.btnProductDetailsClose) {
            els.btnProductDetailsClose.onclick = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                closeProductDetailsModal();
            };
        }

        if (els.productDetailsModal) {
            els.productDetailsModal.onclick = (e) => {
                if (e.target === els.productDetailsModal) {
                    closeProductDetailsModal();
                }
            };
        }

        // Клик по иконке карандаша (с комфортным радиусом вокруг нее) для открытия меню замены/удаления
        if (els.btnEditProductImage) {
            els.btnEditProductImage.onclick = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                openEditImageModal();
            };
        }

        // Слушатели модального окна редактирования изображения товара
        if (els.btnEditImageModalClose) els.btnEditImageModalClose.onclick = closeEditImageModal;
        if (els.btnCancelEditedImage) els.btnCancelEditedImage.onclick = closeEditImageModal;
        if (els.editImageModalOverlay) {
            els.editImageModalOverlay.onclick = (e) => {
                if (e.target === els.editImageModalOverlay) closeEditImageModal();
            };
        }

        if (els.tabBtnEditFile) {
            els.tabBtnEditFile.onclick = () => switchEditUploadTab('file');
        }
        if (els.tabBtnEditUrl) {
            els.tabBtnEditUrl.onclick = () => switchEditUploadTab('url');
        }

        if (els.btnEditProductSelectFile && els.editProductFileInput) {
            els.btnEditProductSelectFile.onclick = () => els.editProductFileInput.click();
        }
        if (els.editProductDropzone && els.editProductFileInput) {
            els.editProductDropzone.onclick = () => els.editProductFileInput.click();
            els.editProductDropzone.ondragover = (e) => {
                e.preventDefault();
                els.editProductDropzone.classList.add('dragover');
            };
            els.editProductDropzone.ondragleave = () => {
                els.editProductDropzone.classList.remove('dragover');
            };
            els.editProductDropzone.ondrop = (e) => {
                e.preventDefault();
                els.editProductDropzone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) handleEditImageFile(file);
            };
        }
        if (els.editProductFileInput) {
            els.editProductFileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) handleEditImageFile(file);
            };
        }

        if (els.editProductUrlInput) {
            els.editProductUrlInput.oninput = () => {
                const url = els.editProductUrlInput.value.trim();
                if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'))) {
                    if (els.editUrlPreviewWrap && els.editUrlPreviewImg) {
                        els.editUrlPreviewImg.src = url;
                        els.editUrlPreviewWrap.style.display = 'flex';
                    }
                } else {
                    if (els.editUrlPreviewWrap) els.editUrlPreviewWrap.style.display = 'none';
                }
            };
            els.editProductUrlInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (els.btnSaveEditedImage) els.btnSaveEditedImage.click();
                }
            };
        }

        if (els.btnSaveEditedImage) {
            els.btnSaveEditedImage.onclick = () => {
                if (!currentDetailsProductId) return;
                const prod = userProducts.find(p => p.id === currentDetailsProductId);
                if (!prod) return;

                let finalImg = currentEditUploadedImageUrl;
                if (currentEditUploadTab === 'url' && els.editProductUrlInput && els.editProductUrlInput.value.trim()) {
                    finalImg = els.editProductUrlInput.value.trim();
                }

                prod.imageUrl = finalImg || null;
                prod.updatedAt = Date.now();

                let itemsChanged = false;
                shoppingItems.forEach(item => {
                    if (item.name.toLowerCase() === prod.name.toLowerCase()) {
                        item.imageUrl = prod.imageUrl;
                        item.updatedAt = Date.now();
                        itemsChanged = true;
                        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
                            try {
                                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                                window.setDoc(itemRef, { imageUrl: item.imageUrl, updatedAt: item.updatedAt }, { merge: true });
                            } catch (e) { }
                        }
                    }
                });

                saveLocalCache();
                renderCatalog();
                if (itemsChanged && currentMainTab === 'shoppingList') renderItems();

                if (els.modalProductImageDisplay) {
                    els.modalProductImageDisplay.src = prod.imageUrl || PLACEHOLDER_IMG;
                }

                if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
                    try {
                        const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', prod.id);
                        window.setDoc(prodRef, { imageUrl: prod.imageUrl, updatedAt: prod.updatedAt }, { merge: true });
                    } catch (e) { }
                }

                closeEditImageModal();
                showItemCompletedToast({ name: 'Изображение обновлено' });
            };
        }

        if (els.btnDeleteProductImage) {
            els.btnDeleteProductImage.onclick = () => {
                if (!currentDetailsProductId) return;
                const prod = userProducts.find(p => p.id === currentDetailsProductId);
                if (!prod) return;

                prod.imageUrl = null;
                prod.updatedAt = Date.now();

                let itemsChanged = false;
                shoppingItems.forEach(item => {
                    if (item.name.toLowerCase() === prod.name.toLowerCase()) {
                        item.imageUrl = null;
                        item.updatedAt = Date.now();
                        itemsChanged = true;
                        if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
                            try {
                                const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', item.id);
                                window.setDoc(itemRef, { imageUrl: null, updatedAt: item.updatedAt }, { merge: true });
                            } catch (e) { }
                        }
                    }
                });

                saveLocalCache();
                renderCatalog();
                if (itemsChanged && currentMainTab === 'shoppingList') renderItems();

                if (els.modalProductImageDisplay) {
                    els.modalProductImageDisplay.src = PLACEHOLDER_IMG;
                }

                if (!isTestMode() && currentUid && window.db && typeof window.doc === 'function' && typeof window.setDoc === 'function') {
                    try {
                        const prodRef = window.doc(window.db, 'users', currentUid, 'shopping_products', prod.id);
                        window.setDoc(prodRef, { imageUrl: null, updatedAt: prod.updatedAt }, { merge: true });
                    } catch (e) { }
                }

                closeEditImageModal();
                showItemCompletedToast({ name: 'Изображение удалено' });
            };
        }

        if (els.btnProductDetailsMore && els.productActionsDropdown) {
            els.btnProductDetailsMore.onclick = (e) => {
                e.stopPropagation();
                const isHidden = els.productActionsDropdown.style.display === 'none';
                els.productActionsDropdown.style.display = isHidden ? 'flex' : 'none';
            };
        }

        window.addEventListener('click', (e) => {
            if (els.productActionsDropdown && !e.target.closest('#btnProductDetailsMore') && !e.target.closest('.product-actions-dropdown')) {
                els.productActionsDropdown.style.display = 'none';
            }
        });

        if (els.btnEditImageFromModal) {
            els.btnEditImageFromModal.onclick = (e) => {
                e.stopPropagation();
                if (els.productActionsDropdown) els.productActionsDropdown.style.display = 'none';
                openEditImageModal();
            };
        }

        if (els.btnDeleteProductFromModal) {
            els.btnDeleteProductFromModal.onclick = (e) => {
                e.stopPropagation();
                if (els.productActionsDropdown) els.productActionsDropdown.style.display = 'none';
                if (!currentDetailsProductId) return;
                const prod = userProducts.find(p => p.id === currentDetailsProductId);
                if (!prod) return;

                showCustomConfirm(
                    "Переместить в корзину?",
                    `Товар <strong>${escapeHtml(prod.name)}</strong> будет перемещен в корзину.`,
                    "Удалить",
                    () => {
                        moveProductToTrash(prod.id);
                        closeProductDetailsModal();
                    }
                );
            };
        }

        // Слушатели окна подтверждения удаления (confirmDeleteModal, как в todo.html)
        if (els.btnConfirmDeleteCancel) {
            els.btnConfirmDeleteCancel.onclick = hideCustomConfirm;
        }

        if (els.btnConfirmDeleteSubmit) {
            els.btnConfirmDeleteSubmit.onclick = () => {
                const cb = customConfirmCallback;
                hideCustomConfirm();
                if (cb) {
                    try {
                        cb();
                    } catch (err) {
                        console.error('[Shopping] Ошибка в callback подтверждения:', err);
                    }
                }
            };
        }

        if (els.confirmDeleteModal) {
            els.confirmDeleteModal.onclick = (e) => {
                if (e.target === els.confirmDeleteModal) {
                    hideCustomConfirm();
                }
            };
        }

        // Слушатели экрана корзины в настройках
        if (els.btnOpenTrashSettings) {
            els.btnOpenTrashSettings.onclick = () => {
                if (els.screenSettings) els.screenSettings.style.display = 'none';
                if (els.screenTrash) els.screenTrash.style.display = 'block';
                renderTrashView();
            };
        }

        if (els.btnBackFromTrash) {
            els.btnBackFromTrash.onclick = () => {
                if (els.screenTrash) els.screenTrash.style.display = 'none';
                if (els.screenSettings) els.screenSettings.style.display = 'block';
                renderSettingsView();
            };
        }

        if (els.btnEmptyTrash) {
            els.btnEmptyTrash.onclick = () => {
                const trashed = userProducts.filter(p => p.deleted);
                if (trashed.length === 0) return;
                showCustomConfirm(
                    "Очистить корзину?",
                    `Все товары в корзине (${trashed.length}) будут удалены навсегда. Это действие нельзя отменить.`,
                    "Очистить",
                    () => {
                        emptyTrash();
                    }
                );
            };
        }

        // Инлайн редактирование названия при клике (как в todo.html)
        if (els.modalProductTitleDisplay && els.modalProductTitleInput) {
            els.modalProductTitleDisplay.onclick = () => {
                els.modalProductTitleDisplay.style.display = 'none';
                els.modalProductTitleInput.style.display = 'block';
                autoResizeModalInput(els.modalProductTitleInput);
                els.modalProductTitleInput.focus();
                els.modalProductTitleInput.select();
            };

            els.modalProductTitleInput.onblur = () => {
                saveProductDetailsTitle();
            };

            els.modalProductTitleInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    els.modalProductTitleInput.blur();
                }
            };

            els.modalProductTitleInput.oninput = () => {
                autoResizeModalInput(els.modalProductTitleInput);
            };
        }

        initProductDetailsDrag();

        if (els.btnExitTestMode) {
            els.btnExitTestMode.onclick = (e) => {
                e.preventDefault();
                history.replaceState(null, null, window.location.pathname);
                loadItems();
            };
        }

        // Кнопка отмены покупки или удаления в уведомлении (Undo, как в todo.js)
        const btnToastUndo = document.getElementById('btnToastUndo');
        if (btnToastUndo) {
            btnToastUndo.onclick = () => {
                // 1. Отмена удаления из списка покупок
                if (lastDeletedShoppingItem) {
                    const restoredItem = { ...lastDeletedShoppingItem };
                    const insertIdx = (lastDeletedShoppingIndex >= 0 && lastDeletedShoppingIndex <= shoppingItems.length)
                        ? lastDeletedShoppingIndex
                        : 0;
                    shoppingItems.splice(insertIdx, 0, restoredItem);
                    lastDeletedShoppingItem = null;
                    lastDeletedShoppingIndex = -1;

                    renderItems();
                    if (currentMainTab === 'myProducts') renderCatalog();
                    saveLocalCache();

                    if (!isTestMode() && currentUid && window.db && typeof window.setDoc === 'function' && typeof window.doc === 'function') {
                        try {
                            const itemRef = window.doc(window.db, 'users', currentUid, 'shopping_items', restoredItem.id);
                            window.setDoc(itemRef, restoredItem);
                        } catch (e) { }
                    }
                }
                // 2. Отмена завершения покупки
                else if (lastCompletedItemId) {
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
                            } catch (e) { }
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

        // Кнопка "+ Создать" в настройках категорий (инлайн создание без модалки)
        if (els.btnOpenAddCategoryModal) {
            els.btnOpenAddCategoryModal.onclick = () => {
                handleCreateCategoryInline();
            };
        }

        if (els.btnCloseEmojiPickerModal) {
            els.btnCloseEmojiPickerModal.onclick = () => {
                closeEmojiPickerModal();
            };
        }

        if (els.btnSaveCategoryEmoji) {
            els.btnSaveCategoryEmoji.onclick = () => {
                const emoji = els.categoryEmojiInput ? els.categoryEmojiInput.value.trim() : '';
                applyEmojiToCategory(emoji || '🏷️');
            };
        }

        if (els.categoryEmojiPickerModal) {
            els.categoryEmojiPickerModal.onclick = (e) => {
                if (e.target === els.categoryEmojiPickerModal) {
                    closeEmojiPickerModal();
                }
            };
        }

        // Ввод эмодзи пользователем
        if (els.categoryEmojiInput) {
            els.categoryEmojiInput.addEventListener('input', () => {
                const val = els.categoryEmojiInput.value.trim();
                let emoji = '';
                if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                    const segments = Array.from(segmenter.segment(val));
                    emoji = segments.length > 0 ? segments[0].segment : '';
                } else {
                    emoji = val ? Array.from(val)[0] : '';
                }
                els.categoryEmojiInput.value = emoji;
                if (els.categoryIconPreview) {
                    els.categoryIconPreview.textContent = emoji || '🏷️';
                }
            });

            els.categoryEmojiInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const emoji = els.categoryEmojiInput.value.trim();
                    applyEmojiToCategory(emoji || '🏷️');
                }
            });
        }

        setViewMode(currentViewMode);
        setMainTab('shoppingList');
        initTabsDragGesture();
        initShoppingItemsSwipe();
        initReorderDragAndDrop();
        loadItems();

        // Фоновая периодическая проверка автоочистки купленных товаров (5 часов) и корзины (30 дней)
        setInterval(() => {
            cleanupExpiredBoughtItems();
            cleanupExpiredTrashProducts();
            if (currentMainTab === 'shoppingList') renderItems();
            if (currentMainTab === 'settings') renderSettingsView();
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
            if (unsubCategories) unsubCategories();
            loadItems();
        }
        if (currentMainTab === 'settings') {
            renderSettingsView();
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
