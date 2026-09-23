import autoAnimate from 'https://cdn.jsdelivr.net/npm/@formkit/auto-animate/index.min.js';

export class FolderManager {
    constructor(context) {
        // context: { getApps, saveApps, renderMain, iconEditor, confirmModal }
        this.ctx = context;
        this.confirmModal = context.confirmModal; // <--- ДОБАВЛЕНО
        this.activeFolderIndex = -1;
        this.isOpen = false;

        this.overlay = document.getElementById('folderOverlay');
        this.titleEl = document.getElementById('folderTitle');
        this.gridEl = document.getElementById('folderGrid');
        this.mainGrid = document.getElementById('appGrid');
        this.header = document.getElementById('header');

        this.removeZone = document.getElementById('removeFromFolderZone');
        this.isHoveringRemoveZone = false;

        this.animationController = autoAnimate(this.gridEl, { duration: 250, easing: 'ease-in-out' });

        this.initSortable();

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay || 
                e.target.classList.contains('fake-blur-bg') || 
                e.target.classList.contains('real-backdrop-layer') || 
                e.target.classList.contains('glass-tint') || 
                !e.target.closest('.folder-content')) {
                this.close();
            }
        });

        // --- ЛОГИКА ПЕРЕИМЕНОВАНИЯ И КОНВЕРТАЦИИ ПАПКИ ---
        this.titleSaveBtn = document.getElementById('titleSaveBtn');
        this.titleConvertBtn = document.getElementById('titleConvertBtn');

        if (this.titleConvertBtn) {
            this.titleConvertBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            this.titleConvertBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.convertCurrentFolderToTab();
            });
        }

        if (this.titleSaveBtn) {
            this.titleSaveBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            this.titleSaveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.titleEl.blur();
            });
        }

        this.titleEl.addEventListener('click', () => {
            if (this.titleEl.contentEditable === "true") return;

            this.titleEl.contentEditable = "true";
            this.titleEl.focus();

            // Ставим курсор в конец текста (вместо выделения всего)
            const range = document.createRange();
            range.selectNodeContents(this.titleEl);
            range.collapse(false); // false означает коллапс к концу
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        this.titleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.titleEl.blur();
            }
        });

        this.titleEl.addEventListener('blur', () => {
            this.titleEl.contentEditable = "false";
            const newName = this.titleEl.innerText.trim() || "Папка";
            this.titleEl.innerText = newName;

            if (this.currentFolderData && this.currentFolderData.name !== newName) {
                this.currentFolderData.name = newName;
                this.syncToGlobalState();
            }
        });
    }

    convertCurrentFolderToTab() {
        if (!this.currentFolderData) return;
        const folderName = (this.titleEl.innerText.trim() || this.currentFolderData.name || 'Папка');

        const doConvert = () => {
            const allApps = this.ctx.getApps();
            const folderIndex = this.getRealFolderIndex(allApps);
            if (folderIndex === -1) return;

            const folderObj = allApps[folderIndex];
            const folderItems = Array.isArray(folderObj.items) && folderObj.items.length > 0
                ? folderObj.items
                : (Array.isArray(this.currentFolderData.items) ? this.currentFolderData.items : []);

            // 1. Добавляем имя категории в глобальные категории userCategories
            if (!Array.isArray(window.userCategories)) {
                window.userCategories = ['Главная'];
            }
            if (!window.userCategories.includes(folderName)) {
                window.userCategories.push(folderName);
                localStorage.setItem('userCategories', JSON.stringify(window.userCategories));
            }

            // 2. Перемещаем все сайты из папки на главный уровень и привязываем их к новой вкладке (свойство category!)
            folderItems.forEach(item => {
                const newItem = JSON.parse(JSON.stringify(item));
                newItem.category = [folderName];
                delete newItem._explicitNoMain;
                allApps.push(newItem);
            });

            // 3. Удаляем саму папку из главного массива
            allApps.splice(folderIndex, 1);

            // 4. Сохраняем состояние и закрываем папку
            this.ctx.saveApps(allApps);
            this.close();

            // 5. Переключаемся на новосозданную вкладку и обновляем отображение
            if (typeof window.currentCategoryFilter !== 'undefined') {
                window.currentCategoryFilter = folderName;
            }

            if (window.renderCategoryBar) {
                window.renderCategoryBar();
            }
            if (this.ctx.renderMain) {
                this.ctx.renderMain(allApps);
            }
            if (typeof window.showToast === 'function') {
                window.showToast(`Папка «${folderName}» конвертирована во вкладку`);
            }
        };

        if (this.confirmModal && typeof this.confirmModal.showPrompt === 'function') {
            this.confirmModal.showPrompt({
                title: `Конвертировать во вкладку?`,
                desc: `Папка «${folderName}» будет удалена, а сайты из неё переместятся в новую вкладку «${folderName}».`,
                confirmText: 'Конвертировать',
                cancelText: 'Отмена',
                onConfirm: doConvert
            });
        } else if (confirm(`Конвертировать папку «${folderName}» во вкладку «${folderName}»?`)) {
            doConvert();
        }
    }

    open(folderData, indexOrRef) {
        this.targetFolderRef = (typeof indexOrRef === 'object' && indexOrRef !== null) ? indexOrRef : null;
        this.activeFolderIndex = typeof indexOrRef === 'number' ? indexOrRef : -1;
        this.isOpen = true;
        this.currentFolderData = JSON.parse(JSON.stringify(folderData));

        this.titleEl.innerText = this.currentFolderData.name;
        this.renderItems();

        if (this.sortable) {
            this.sortable.option("disabled", false);
        }

        if (document.body.classList.contains('edit-mode')) {
            this.enableEditMode();
        }

        document.body.classList.add('folder-open');
        this.overlay.classList.add('active');

        this.mainGrid.style.opacity = '0';
        this.mainGrid.style.transform = 'scale(0.95)';
        this.mainGrid.style.pointerEvents = 'none';

        this.header.style.opacity = '0';
        this.header.style.pointerEvents = 'none';
    }

    getRealFolderIndex(allApps) {
        if (!this.currentFolderData || !Array.isArray(allApps)) return -1;
        if (this.targetFolderRef) {
            const idx = allApps.indexOf(this.targetFolderRef);
            if (idx !== -1) return idx;
        }
        const currIdx = allApps.indexOf(this.currentFolderData);
        if (currIdx !== -1) return currIdx;

        if (this.activeFolderIndex >= 0 && this.activeFolderIndex < allApps.length) {
            const candidate = allApps[this.activeFolderIndex];
            if (candidate && candidate.type === 'folder' && candidate.name === this.currentFolderData.name) {
                return this.activeFolderIndex;
            }
        }
        return allApps.findIndex(a => a && a.type === 'folder' && a.name === this.currentFolderData.name);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.activeFolderIndex = -1;
        this.targetFolderRef = null;

        this.overlay.classList.remove('active');
        document.body.classList.remove('folder-open');
        document.body.classList.remove('folder-large');

        this.mainGrid.style.opacity = '1';
        this.mainGrid.style.transform = 'scale(1)';
        this.mainGrid.style.pointerEvents = 'auto';

        this.header.style.opacity = '1';
        this.header.style.pointerEvents = 'auto';

        this.disableEditMode();
        if (this.removeZone) this.removeZone.classList.remove('visible', 'hover');
    }

    renderItems() {
        if (this.animationController) this.animationController.disable();
        this.gridEl.innerHTML = '';

        const activeFilter = window.currentCategoryFilter;
        const allItems = this.currentFolderData.items || [];
        const items = allItems.filter(app => {
            if (activeFilter && activeFilter !== 'Главная') {
                return Array.isArray(app.category) ? app.category.includes(activeFilter) : app.category === activeFilter;
            }
            return window.isAppOnMain ? window.isAppOnMain(app) : !app._explicitNoMain;
        });

        // Добавляем класс, если в папке больше 12 элементов (13 и более)
        if (items.length > 12) {
            document.body.classList.add('folder-large');
        } else {
            document.body.classList.remove('folder-large');
        }

        items.forEach((app, idx) => {
            const item = document.createElement('div');
            item.className = 'app-item';
            item._appData = app;
            item.dataset.internalIndex = idx;
            item.dataset.appName = app.name; // Для поиска при сохранении

            item.innerHTML = `
                <a href="${app.url}" class="icon-container" onclick="if(document.body.classList.contains('edit-mode-folder')) return false;">
                    <img src="${app.icon}" alt="${app.name}" onerror="this.src='https://via.placeholder.com/62?text=?'">
                    <div class="glass-overlay"></div>
                    <div class="action-bar">
                        <div class="action-btn btn-del"></div>
                        <div class="action-divider"></div>
                        <div class="action-btn btn-edit"></div>
                    </div>
                </a>
                <span class="app-name">${app.name}</span>
            `;

            // --- ЛОГИКА УДАЛЕНИЯ ---
            const btnDel = item.querySelector('.btn-del');
            btnDel.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const realIdx = this.currentFolderData.items.indexOf(app);
                if (this.confirmModal) {
                    this.confirmModal.show(app.name, 'site', () => {
                        if (realIdx !== -1) this.deleteItem(realIdx);
                    });
                } else {
                    if (realIdx !== -1) this.deleteItem(realIdx);
                }
            };

            // --- ЛОГИКА РЕДАКТИРОВАНИЯ В ПАПКЕ ---
            const btnEdit = item.querySelector('.btn-edit');
            if (btnEdit && this.ctx.iconEditor) {
                btnEdit.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const realIdx = this.currentFolderData.items.indexOf(app);
                    this.ctx.iconEditor.open((newData) => {
                        if (realIdx !== -1) {
                            const updatedApp = { ...app, ...newData };
                            const isOnMain = window.isAppOnMain ? window.isAppOnMain(updatedApp) : !updatedApp._explicitNoMain;
                            if (!isOnMain) {
                                this.currentFolderData.items.splice(realIdx, 1);
                                const allApps = this.ctx.getApps();
                                allApps.push(updatedApp);
                                this.syncToGlobalState();
                                this.renderItems();
                            } else {
                                this.currentFolderData.items[realIdx] = updatedApp;
                                this.renderItems();
                                this.syncToGlobalState();
                            }
                        }
                    }, app, window.userCategories);
                };
            }
            // -------------------------------------

            const link = item.querySelector('a');
            link.onclick = (e) => {
                if (this.gridEl.classList.contains('edit-mode')) {
                    e.preventDefault();
                }
            };

            item.oncontextmenu = (e) => {
                e.preventDefault();
                this.enableEditMode();
            };

            this.gridEl.appendChild(item);
        });

        if (this.animationController) setTimeout(() => this.animationController.enable(), 100);
    }

    initSortable() {
        const checkHoverZone = (e) => {
            const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
            const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

            if (!clientX || !clientY || !this.removeZone) return;

            const rect = this.removeZone.getBoundingClientRect();
            const isInside = (
                clientX > rect.left && clientX < rect.right &&
                clientY > rect.top && clientY < rect.bottom
            );

            if (isInside) {
                if (!this.isHoveringRemoveZone) {
                    this.isHoveringRemoveZone = true;
                    this.removeZone.classList.add('hover');
                }
            } else {
                if (this.isHoveringRemoveZone) {
                    this.isHoveringRemoveZone = false;
                    this.removeZone.classList.remove('hover');
                }
            }
        };

        this.sortable = Sortable.create(this.gridEl, {
            animation: 300,
            delay: 200,
            delayOnTouchOnly: true,
            disabled: true,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
            forceFallback: true,
            fallbackClass: "sortable-drag",
            fallbackOnBody: true,
            swapThreshold: 0.5,
            direction: 'horizontal',
            onStart: () => {
                if (this.animationController) this.animationController.disable();
                document.body.style.cursor = 'grabbing';
                if (navigator.vibrate) navigator.vibrate(10);
                if (this.removeZone) this.removeZone.classList.add('visible');

                document.addEventListener('mousemove', checkHoverZone);
                document.addEventListener('touchmove', checkHoverZone);
            },
            onEnd: (evt) => {
                document.removeEventListener('mousemove', checkHoverZone);
                document.removeEventListener('touchmove', checkHoverZone);

                if (this.animationController) this.animationController.enable();
                document.body.style.cursor = '';
                if (this.removeZone) this.removeZone.classList.remove('visible');

                if (this.isHoveringRemoveZone) {
                    this.isHoveringRemoveZone = false;
                    this.removeZone.classList.remove('hover');

                    // Вынос из папки
                    const appName = evt.item.dataset.appName;
                    const items = this.currentFolderData.items;
                    const idx = items.findIndex(i => i.name === appName);

                    if (idx !== -1) {
                        this.removeFromFolder(idx);
                        return; // Не сохраняем порядок, элемент удален
                    }
                }

                this.saveOrderFromDOM();
            }
        });
    }

    removeFromFolder(index) {
        const app = this.currentFolderData.items.splice(index, 1)[0];

        // Обновляем UI внутри папки
        this.renderItems();

        // Обновляем папку в глобальном стейте
        const allApps = this.ctx.getApps();
        const targetIndex = this.getRealFolderIndex(allApps);

        if (targetIndex !== -1) {
            const isEmpty = !this.currentFolderData.items || this.currentFolderData.items.length === 0;
            if (isEmpty) {
                allApps.splice(targetIndex, 1);
                allApps.splice(targetIndex, 0, app);
                this.close();
            } else {
                allApps[targetIndex] = this.currentFolderData;
                allApps.splice(targetIndex + 1, 0, app);
            }
            this.ctx.saveApps(allApps);
            this.ctx.renderMain(allApps, true);
        }
    }

    enableEditMode() {
        this.gridEl.classList.add('edit-mode');
        document.body.classList.add('edit-mode-folder');
        this.sortable.option("disabled", false);

        const outsideClick = (e) => {
            // Если клик по модалке подтверждения - не закрываем режим редактирования
            if (e.target.closest('.ios-modal-overlay')) return;

            if (!e.target.closest('.app-item')) {
                this.disableEditMode();
                document.removeEventListener('click', outsideClick);
            }
        };
        setTimeout(() => document.addEventListener('click', outsideClick), 0);
    }

    disableEditMode() {
        this.gridEl.classList.remove('edit-mode');
        document.body.classList.remove('edit-mode-folder');
        this.sortable.option("disabled", true);
    }

    deleteItem(index) {
        this.currentFolderData.items.splice(index, 1);
        this.renderItems();
        this.syncToGlobalState();
    }

    saveOrderFromDOM() {
        const domItems = this.gridEl.querySelectorAll('.app-item');
        const subRenderedList = [];
        domItems.forEach(el => {
            if (el._appData) {
                subRenderedList.push(el._appData);
            }
        });

        if (subRenderedList.length > 0 && this.currentFolderData && Array.isArray(this.currentFolderData.items)) {
            const allItems = this.currentFolderData.items;

            // 1. Находим исходные индексы всех отображаемых элементов
            const originalIndices = subRenderedList
                .map(appObj => allItems.indexOf(appObj))
                .filter(idx => idx !== -1);

            // 2. Сортируем позиции по возрастанию
            const sortedIndices = [...originalIndices].sort((a, b) => a - b);

            // 3. Расставляем объекты в их новые позиции
            subRenderedList.forEach((appObj, i) => {
                if (i < sortedIndices.length) {
                    allItems[sortedIndices[i]] = appObj;
                }
            });

            this.syncToGlobalState();
        }
    }

    syncToGlobalState() {
        const allApps = this.ctx.getApps();
        const targetIndex = this.getRealFolderIndex(allApps);
        if (targetIndex !== -1) {
            const isEmpty = !this.currentFolderData.items || this.currentFolderData.items.length === 0;

            if (isEmpty) {
                // Если в папке ничего не осталось - удаляем её полностью
                allApps.splice(targetIndex, 1);
                this.close();
            } else {
                allApps[targetIndex] = this.currentFolderData;
                this.targetFolderRef = this.currentFolderData;
            }

            this.ctx.saveApps(allApps);
            this.ctx.renderMain(allApps, true);
        }
    }
}