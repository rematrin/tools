export class WallpaperManager {
    constructor() {
        this.STORAGE_KEY = 'user_wallpaper_settings_v1';
        this.defaultSettings = {
            url: 'https://i.ibb.co/9krvx4ms/465581.jpg',
            blur: 0, // 0-100%
            dim: 30   // 0-100%
        };
        this.settings = this.loadSettings();
        this.applySettings();
    }

    loadSettings() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        return saved ? JSON.parse(saved) : this.defaultSettings;
    }

    saveSettings() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
    }

    saveToCloud() {
        // Сохраняем в БД только если пользователь вошел
        if (window.dbApi && window.auth && window.auth.currentUser) {
            window.dbApi.saveWallpaper(this.settings);
        }
    }

    async loadFromCloud() {
        if (window.dbApi && window.auth && window.auth.currentUser) {
            const cloudSettings = await window.dbApi.loadWallpaper();
            if (cloudSettings) {
                this.settings = { ...this.defaultSettings, ...cloudSettings };
                this.saveSettings();
                this.applySettings();
                this.refreshUI();
            }
        }
    }

    applySettings() {
        const bgElement = document.querySelector('.global-wallpaper-blurred');
        const dimElement = document.querySelector('.folder-backdrop');

        if (bgElement) {
            bgElement.style.backgroundImage = `url('${this.settings.url}')`;
            
            // --- КОНВЕРТАЦИЯ % В PX ---
            // Интерфейс: 0-100% -> Реальность: 0-50px
            const maxBlurPx = 30; 
            const currentBlurPx = (this.settings.blur / 100) * maxBlurPx;

            // --- ДИНАМИЧЕСКИЙ ЗУМ ---
            // Чем больше блюр, тем больше зум, чтобы скрыть черные края.
            const scale = 1.02 + (currentBlurPx * 0.003);
            
            bgElement.style.filter = `blur(${currentBlurPx}px)`;
            bgElement.style.transform = `scale(${scale})`;
        }
        
        if (dimElement) {
            const opacity = this.settings.dim / 100;
            dimElement.style.background = `rgba(20, 20, 20, ${opacity})`;
        }
    }

    refreshUI() {
        const sliderDim = document.getElementById('sliderDim');
        const sliderBlur = document.getElementById('sliderBlur');
        const dimLabel = document.getElementById('dimValueLabel');
        const blurLabel = document.getElementById('blurValueLabel');
        const preview = document.querySelector('.wallpaper-preview-bg');

        if (sliderDim) { sliderDim.value = this.settings.dim; }
        if (sliderBlur) { sliderBlur.value = this.settings.blur; }
        if (dimLabel) { dimLabel.innerText = `${this.settings.dim}%`; }
        if (blurLabel) { blurLabel.innerText = `${this.settings.blur}%`; }
        if (preview) { preview.style.backgroundImage = `url('${this.settings.url}')`; }
    }

    // showWarning = true добавит красную надпись
    getSettingsHTML(showWarning = false) {
        const warningHTML = showWarning 
            ? `<div style="font-size: 12px; color: #8E8E93; margin-bottom: 12px; margin-top: -6px;">Авторизуйтесь для сохранения обоев</div>` 
            : '';

        return `
            <div class="profile-cardnon" style="margin-top: 0;">
                <h2 class="profile-title-in-card" style="margin-bottom: 12px;">Обои</h2>
                ${warningHTML}
                
                <div class="wallpaper-preview-container" id="wpPreviewContainer">
                    <div class="wallpaper-preview-bg" style="background-image: url('${this.settings.url}');"></div>
                    <button class="wp-change-btn" id="btnChangeWallpaper">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                        </svg>
                        Сменить обои
                    </button>
                </div>

                <div class="slider-group">
                    <div class="slider-header">
                        <span>Затемнение</span>
                        <span id="dimValueLabel">${this.settings.dim}%</span>
                    </div>
                    <input type="range" min="0" max="100" value="${this.settings.dim}" class="ios-slider" id="sliderDim">
                </div>

                <div class="slider-group">
                    <div class="slider-header">
                        <span>Размытие</span>
                        <span id="blurValueLabel">${this.settings.blur}%</span>
                    </div>
                    <input type="range" min="0" max="100" value="${this.settings.blur}" class="ios-slider" id="sliderBlur">
                </div>
            </div>
        `;
    }

    attachListeners() {
        const sliderDim = document.getElementById('sliderDim');
        const sliderBlur = document.getElementById('sliderBlur');
        const btnChange = document.getElementById('btnChangeWallpaper');
        
        const updateDim = (val) => {
            this.settings.dim = val;
            const label = document.getElementById('dimValueLabel');
            if(label) label.innerText = `${val}%`;
            this.applySettings();
            this.saveSettings();
        };

        const updateBlur = (val) => {
            this.settings.blur = val;
            const label = document.getElementById('blurValueLabel');
            if(label) label.innerText = `${val}%`;
            this.applySettings();
            this.saveSettings();
        };

        if (sliderDim) {
            sliderDim.addEventListener('input', (e) => updateDim(e.target.value));
            sliderDim.addEventListener('change', () => this.saveToCloud());
        }

        if (sliderBlur) {
            sliderBlur.addEventListener('input', (e) => updateBlur(e.target.value));
            sliderBlur.addEventListener('change', () => this.saveToCloud());
        }

        if (btnChange) {
            btnChange.addEventListener('click', () => {
                this.openUrlModal();
            });
        }
    }

    openUrlModal() {
        let modal = document.getElementById('wpModal');
        if (!modal) {
            const modalHTML = `
                <div class="wp-modal-overlay" id="wpModal">
                    <div class="wp-modal-card">
                        <h3>Ссылка на изображение</h3>
                        <input type="text" id="wpUrlInput" class="form-input" placeholder="https://site.com/image.png" autocomplete="off">
                        <div class="wp-modal-actions">
                            <button class="wp-btn-cancel" id="wpBtnCancel">Отмена</button>
                            <button class="wp-btn-save" id="wpBtnSave">Сохранить</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('wpModal');
            
            document.getElementById('wpBtnCancel').onclick = () => modal.classList.remove('active');
            
            document.getElementById('wpBtnSave').onclick = () => {
                const input = document.getElementById('wpUrlInput');
                if (input.value && input.value.trim() !== '') {
                    this.settings.url = input.value.trim();
                    this.applySettings();
                    this.saveSettings();
                    this.saveToCloud();
                    
                    const preview = document.querySelector('.wallpaper-preview-bg');
                    if(preview) preview.style.backgroundImage = `url('${this.settings.url}')`;
                }
                modal.classList.remove('active');
            };
        }
        
        const input = document.getElementById('wpUrlInput');
        if (input) input.value = ''; 
        
        setTimeout(() => modal.classList.add('active'), 10);
    }
}