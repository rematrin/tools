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
            if (e.target === this.overlay || e.target.classList.contains('folder-overlay-bg')) {
                this.close();
            }
        });
    }

    open(folderData, index) {
        this.activeFolderIndex = index;
        this.isOpen = true;
        this.currentFolderData = JSON.parse(JSON.stringify(folderData));

        this.titleEl.innerText = this.currentFolderData.name;
        this.renderItems();

        document.body.classList.add('folder-open');
        this.overlay.classList.add('active');

        this.mainGrid.style.opacity = '0';
        this.mainGrid.style.transform = 'scale(0.95)';
        this.mainGrid.style.pointerEvents = 'none';

        this.header.style.opacity = '0';
        this.header.style.pointerEvents = 'none';
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.activeFolderIndex = -1;

        this.overlay.classList.remove('active');
        document.body.classList.remove('folder-open');

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

        const items = this.currentFolderData.items || [];

        items.forEach((app, idx) => {
            const item = document.createElement('div');
            item.className = 'app-item';
            item.dataset.internalIndex = idx;
            item.dataset.appName = app.name; // Для поиска при сохранении

            item.innerHTML = `
                <a href="${app.url}" class="icon-container" onclick="if(document.body.classList.contains('edit-mode-folder')) return false;">
                    <img src="${app.icon}" alt="${app.name}" onerror="this.src='https://via.placeholder.com/62?text=?'">
                    <div class="glass-overlay"></div>
                    <div class="delete-btn"></div>
                </a>
                <span class="app-name">${app.name}</span>
            `;

            // --- ОБНОВЛЕННАЯ ЛОГИКА УДАЛЕНИЯ ---
            const delBtn = item.querySelector('.delete-btn');
            delBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Вызываем модальное окно вместо мгновенного удаления
                if (this.confirmModal) {
                    this.confirmModal.show(app.name, 'site', () => {
                        this.deleteItem(idx);
                    });
                } else {
                    this.deleteItem(idx);
                }
            };
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

        // Добавляем в глобальный стейт
        const allApps = this.ctx.getApps();
        // Вставляем сразу после текущей папки
        allApps.splice(this.activeFolderIndex + 1, 0, app);

        this.ctx.saveApps(allApps);
        this.ctx.renderMain(allApps, true);

        // Если папка пуста (или просто после выноса) сохраняем актуальность в context
        this.syncToGlobalState();
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
        const newItems = [];

        domItems.forEach(el => {
            // Используем dataset для надежности, если имена дублируются
            const oldIdx = el.dataset.internalIndex;
            if (oldIdx !== undefined && this.currentFolderData.items[oldIdx]) {
                // Но так как sortable перемещает DOM, dataset едет вместе с элементом.
                // Это ненадежно при multi-drag, но для simple sortable ок.
                // Лучше искать по объекту:
                const name = el.querySelector('.app-name').innerText;
                const found = this.currentFolderData.items.find(i => i.name === name);
                if (found) newItems.push(found);
            }
        });

        // Fallback если выше не сработало (простое восстановление)
        if (newItems.length !== this.currentFolderData.items.length) {
            const domNames = Array.from(domItems).map(el => el.querySelector('.app-name').innerText);
            const restored = [];
            domNames.forEach(name => {
                const item = this.currentFolderData.items.find(i => i.name === name);
                if (item) restored.push(item);
            });
            if (restored.length === this.currentFolderData.items.length) {
                this.currentFolderData.items = restored;
                this.syncToGlobalState();
                return;
            }
        }

        this.currentFolderData.items = newItems;
        this.syncToGlobalState();
    }

    syncToGlobalState() {
        const allApps = this.ctx.getApps();
        if (allApps[this.activeFolderIndex]) {
            const isEmpty = !this.currentFolderData.items || this.currentFolderData.items.length === 0;

            if (isEmpty) {
                // Если в папке ничего не осталось - удаляем её полностью
                allApps.splice(this.activeFolderIndex, 1);
                this.close();
            } else {
                allApps[this.activeFolderIndex] = this.currentFolderData;
            }

            this.ctx.saveApps(allApps);
            this.ctx.renderMain(allApps, true);
        }
    }
}