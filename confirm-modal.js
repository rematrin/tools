export class ConfirmModal {
    constructor() {
        this.overlay = document.getElementById('iosModalOverlay');
        this.titleEl = document.getElementById('iosModalTitle');
        this.descEl = document.getElementById('iosModalDesc');
        this.confirmBtn = document.getElementById('iosModalConfirm');
        this.cancelBtn = document.getElementById('iosModalCancel');
        
        this.onConfirm = null;

        // Закрытие по кнопке "Отмена"
        this.cancelBtn.addEventListener('click', () => this.close());
        
        // Закрытие по клику на фон
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Действие при подтверждении
        this.confirmBtn.addEventListener('click', () => {
            if (this.onConfirm) this.onConfirm();
            this.close();
        });
    }

    show(name, type, callback) {
        this.onConfirm = callback;
        
        // Настраиваем заголовок
        this.titleEl.innerText = `Удалить «${name}»?`;
        
        // Настраиваем описание и текст кнопки
        if (type === 'folder') {
            this.descEl.innerText = "Папка и всё её содержимое будут удалены.";
            this.confirmBtn.innerText = "Удалить папку"; // <--- ИЗМЕНЕНИЕ
        } else {
            this.descEl.innerText = "Удаление этого приложения с главного экрана.";
            this.confirmBtn.innerText = "Удалить приложение"; // <--- ИЗМЕНЕНИЕ
        }

        // Показываем окно
        this.overlay.classList.add('active');
        
        // Анимация
        const card = this.overlay.querySelector('.ios-modal');
        card.style.transform = 'scale(1.1)';
        setTimeout(() => card.style.transform = 'scale(1)', 10);
    }

    close() {
        this.overlay.classList.remove('active');
        this.onConfirm = null;
    }
}