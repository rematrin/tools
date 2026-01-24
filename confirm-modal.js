export class ConfirmModal {
    constructor() {
        this.overlay = document.getElementById('iosModalOverlay');
        this.titleEl = document.getElementById('iosModalTitle');
        this.descEl = document.getElementById('iosModalDesc');
        this.confirmBtn = document.getElementById('iosModalConfirm');
        this.ungroupBtn = document.getElementById('iosModalUngroup');
        this.cancelBtn = document.getElementById('iosModalCancel');

        this.onConfirm = null;
        this.onUngroup = null;

        // Закрытия
        this.cancelBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Действия
        this.confirmBtn.addEventListener('click', () => {
            if (this.onConfirm) this.onConfirm();
            this.close();
        });

        this.ungroupBtn.addEventListener('click', () => {
            if (this.onUngroup) this.onUngroup();
            this.close();
        });
    }

    show(name, type, options) {
        // options может быть либо функцией (для обратной совместимости), либо объектом { onConfirm, onUngroup }
        if (typeof options === 'function') {
            this.onConfirm = options;
            this.onUngroup = null;
        } else {
            this.onConfirm = options?.onConfirm;
            this.onUngroup = options?.onUngroup;
        }

        this.titleEl.innerText = `Удалить «${name}»?`;

        if (type === 'folder') {
            this.descEl.innerText = "Выберите действие для папки.";
            this.confirmBtn.innerText = "Удалить папку";
            this.ungroupBtn.style.display = 'block';
        } else {
            this.descEl.innerText = "Удаление приложения с главного экрана.";
            this.confirmBtn.innerText = "Удалить приложение";
            this.ungroupBtn.style.display = 'none';
        }

        this.overlay.classList.add('active');
        const card = this.overlay.querySelector('.ios-modal');
        card.style.transform = 'scale(1.1)';
        setTimeout(() => card.style.transform = 'scale(1)', 10);
    }

    close() {
        this.overlay.classList.remove('active');
        this.onConfirm = null;
        this.onUngroup = null;
    }
}