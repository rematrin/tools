export class FolderManager {
    constructor() {
        // Создаем модальное окно для открытой папки один раз при загрузке
        if (!document.getElementById('folderModal')) {
            this.createModal();
        }
    }

    createModal() {
        const modal = document.createElement('div');
        modal.id = 'folderModal';
        modal.className = 'folder-modal-overlay';
        modal.innerHTML = `
            <div class="folder-modal-content">
                <div class="folder-modal-header">
                    <h3 id="folderModalTitle">Папка</h3>
                    <button class="close-folder-btn" id="closeFolderBtn">×</button>
                </div>
                <div class="folder-modal-grid" id="folderModalGrid"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Закрытие по крестику и фону
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.id === 'closeFolderBtn') {
                this.closeFolder();
            }
        });
    }

    // Генерирует HTML иконки папки для рабочего стола
    getFolderHTML(folder, index) {
        // Берем первые 9 иконок для превью (3x3)
        const items = folder.items || [];
        const previewIcons = items.slice(0, 9).map(item => 
            `<div class="mini-icon"><img src="${item.icon}" onerror="this.src='https://via.placeholder.com/20'"></div>`
        ).join('');

        // Сохраняем данные папки прямо в атрибут data-folder-json
        // Заменяем кавычки, чтобы не сломать HTML
        const safeJSON = JSON.stringify(items).replace(/"/g, '&quot;');

        return `
            <div class="app-item folder-type" data-type="folder" data-name="${folder.name}" data-items="${safeJSON}">
                <div class="icon-container folder-container" onclick="window.openFolder(${index})">
                    <div class="folder-grid-preview">
                        ${previewIcons}
                    </div>
                </div>
                <span class="app-name">${folder.name}</span>
            </div>
        `;
    }

    openFolder(name, items, onSave) {
        const modal = document.getElementById('folderModal');
        const grid = document.getElementById('folderModalGrid');
        const title = document.getElementById('folderModalTitle');
        
        title.innerText = name;
        grid.innerHTML = '';
        modal.classList.add('active');
        document.body.classList.add('folder-open');

        // Рендерим иконки внутри открытой папки
        items.forEach(app => {
            const el = document.createElement('div');
            el.className = 'app-item in-folder';
            el.innerHTML = `
                <a href="${app.url}" class="icon-container" target="_blank">
                    <img src="${app.icon}">
                </a>
                <span class="app-name">${app.name}</span>
            `;
            grid.appendChild(el);
        });

        // ВАЖНО: Тут можно добавить Sortable для сортировки ВНУТРИ папки,
        // но для простоты пока оставим только просмотр.
    }

    closeFolder() {
        const modal = document.getElementById('folderModal');
        modal.classList.remove('active');
        document.body.classList.remove('folder-open');
    }
}