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
        this.confirmBtn.style.display = 'block';
        this.cancelBtn.style.display = 'block';

        if (type === 'folder') {
            this.descEl.innerText = "Выберите действие для папки.";
            this.confirmBtn.innerText = "Удалить папку";
            this.ungroupBtn.style.display = 'block';
        } else {
            this.descEl.innerText = "Удаление приложения с главного экрана.";
            this.confirmBtn.innerText = "Удалить приложение";
            this.ungroupBtn.style.display = 'none';
        }

        this.openWithAnimation();
    }

    showPrompt({ title, desc, confirmText, ungroupText, cancelText, onConfirm, onUngroup, onCancel }) {
        this.titleEl.innerText = title;
        this.descEl.innerText = desc || "";

        this.confirmBtn.innerText = confirmText || "OK";
        this.confirmBtn.style.display = confirmText ? 'block' : 'none';

        this.ungroupBtn.innerText = ungroupText || "";
        this.ungroupBtn.style.display = ungroupText ? 'block' : 'none';

        this.cancelBtn.innerText = cancelText || "Отменить";
        this.cancelBtn.style.display = cancelText ? 'block' : 'none';

        this.onConfirm = onConfirm;
        this.onUngroup = onUngroup;
        this.onCancel = onCancel || null;

        this.openWithAnimation();
    }

    openWithAnimation() {
        this.overlay.classList.add('active');
        const card = this.overlay.querySelector('.ios-modal');
        card.style.transform = 'scale(1.1)';
        card.style.opacity = '0';
        setTimeout(() => {
            card.style.transform = 'scale(1)';
            card.style.opacity = '1';
        }, 10);
    }

    close() {
        if (this.onCancel && typeof this.onCancel === 'function') {
            this.onCancel();
        }
        this.overlay.classList.remove('active');
        this.onConfirm = null;
        this.onUngroup = null;
        this.onCancel = null;
    }
}