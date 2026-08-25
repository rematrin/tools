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
            bgElement.style.setProperty('background-image', `url('${this.settings.url}')`, 'important');
            document.documentElement.style.setProperty('--current-wallpaper', `url('${this.settings.url}')`);
            
            // --- КОНВЕРТАЦИЯ % В PX ---
            // Интерфейс: 0-100% -> Реальность: 0-50px
            const maxBlurPx = 30; 
            const currentBlurPx = (this.settings.blur / 100) * maxBlurPx;

            // --- ДИНАМИЧЕСКИЙ ЗУМ ---
            // Чем больше блюр, тем больше зум, чтобы скрыть черные края.
            const scale = 1.02 + (currentBlurPx * 0.003);
            
            bgElement.style.setProperty('filter', `blur(${currentBlurPx}px)`, 'important');
            bgElement.style.setProperty('transform', `scale(${scale})`, 'important');
        }
        
        if (dimElement) {
            const opacity = this.settings.dim / 100;
            dimElement.style.setProperty('background', `rgba(20, 20, 20, ${opacity})`, 'important');
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

    async uploadToImgBB(base64Image) {
        const API_KEY = 'fbd88ce7045582e4c4176c67de93ceee';
        const cleanBase64 = base64Image.split(',')[1];
        const formData = new FormData();
        formData.append('image', cleanBase64);
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_KEY}`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) return result.data.url; else throw new Error('ImgBB Upload Failed');
    }

    openUrlModal() {
        let modal = document.getElementById('wpModal');
        if (!modal) {
            const modalHTML = `
                <div class="wp-modal-overlay" id="wpModal">
                    <div class="fake-blur-bg"></div>
                    <div class="real-backdrop-layer"></div>
                    <div class="glass-tint"></div>
                    <div class="wp-modal-card thumbnail-confirm-box">
                        <div class="confirm-title" style="font-size: 18px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-shrink: 0; color: #000; font-weight: bold;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                            Картинка обоев
                        </div>
                        
                        <div class="modal-tabs" style="flex-shrink: 0;">
                            <button class="modal-tab active" data-tab="file">Из файла</button>
                            <button class="modal-tab" data-tab="url">По ссылке</button>
                        </div>

                        <!-- Вкладка: Из файла -->
                        <div id="tab-content-file" class="tab-content-pane">
                            <div class="confirm-message" style="margin-bottom: 16px; font-size: 13px; opacity: 0.85; line-height: 1.4; color: #444;">
                                Загрузите изображение, вставьте из буфера обмена (Ctrl + V) или перетащите файл в область ниже.
                            </div>

                            <div id="icon-dropzone" class="icon-dropzone" style="margin-bottom: 16px;">
                                <div class="dropzone-preview" style="max-width: 100%; display: flex; align-items: center; justify-content: center;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload" style="opacity: 0.6; color: #888;"><path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
                                </div>
                                <div class="dropzone-text" style="font-size: 13px; font-weight: 500; margin-top: 8px;">
                                    Кликните для выбора файла или перетащите его сюда
                                </div>
                            </div>
                        </div>

                        <!-- Вкладка: По ссылке -->
                        <div id="tab-content-url" class="tab-content-pane" style="display: none;">
                            <div class="confirm-message" style="margin-bottom: 16px; font-size: 13px; opacity: 0.85; line-height: 1.4; color: #444;">
                                Вставьте прямую ссылку на изображение в поле ниже.
                            </div>
                            
                            <input type="text" id="wpUrlInput" style="width: 100%; margin-bottom: 16px; box-sizing: border-box; padding: 10px; border-radius: 8px; border: 1px solid #dcdcdc; background: #fff; color: #000;" placeholder="https://site.com/image.png" autocomplete="off">
                        </div>

                        <!-- Скрытый инпут для выбора файла -->
                        <input type="file" id="modalIconFileInput" accept="image/*" style="display: none;">

                        <!-- Общие действия -->
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: auto; flex-shrink: 0;">
                            <button class="confirm-btn-primary" id="btn-select-file" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Выбрать файл...</button>
                            <button class="confirm-btn-primary" id="wpBtnSave" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%; display: none;">Сохранить</button>
                            
                            <button class="confirm-btn-delete" id="btn-delete-icon" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Удалить картинку</button>
                            
                            <button class="confirm-btn-secondary" id="wpBtnCancel" style="margin: 0; padding: 10px; border-radius: 8px; width: 100%;">Отмена</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            modal = document.getElementById('wpModal');

            const tabBtns = modal.querySelectorAll('.modal-tab');
            const tabPanes = modal.querySelectorAll('.tab-content-pane');
            const btnSelectFile = document.getElementById('btn-select-file');
            const wpBtnSave = document.getElementById('wpBtnSave');
            const fileInput = document.getElementById('modalIconFileInput');
            const dropzone = document.getElementById('icon-dropzone');
            const urlInput = document.getElementById('wpUrlInput');
            const deleteBtn = document.getElementById('btn-delete-icon');

            // Переключение вкладок
            tabBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    const targetTab = btn.dataset.tab;
                    tabPanes.forEach(pane => pane.style.display = 'none');
                    document.getElementById(`tab-content-${targetTab}`).style.display = 'flex';
                    
                    if (targetTab === 'file') {
                        btnSelectFile.style.display = 'block';
                        wpBtnSave.style.display = 'none';
                    } else if (targetTab === 'url') {
                        btnSelectFile.style.display = 'none';
                        wpBtnSave.style.display = 'block';
                        if (urlInput) {
                            setTimeout(() => urlInput.focus(), 100);
                        }
                    }
                });
            });

            // Кнопка отмены
            document.getElementById('wpBtnCancel').onclick = () => modal.classList.remove('active');

            // Сохранение по ссылке
            wpBtnSave.onclick = () => {
                if (urlInput.value && urlInput.value.trim() !== '') {
                    this.settings.url = urlInput.value.trim();
                    this.applySettings();
                    this.saveSettings();
                    this.saveToCloud();
                    
                    const preview = document.querySelector('.wallpaper-preview-bg');
                    if(preview) preview.style.backgroundImage = `url('${this.settings.url}')`;
                }
                modal.classList.remove('active');
            };

            // Удаление картинки (сброс к дефолтным обоям)
            deleteBtn.onclick = () => {
                this.settings.url = this.defaultSettings.url;
                this.applySettings();
                this.saveSettings();
                this.saveToCloud();
                
                const preview = document.querySelector('.wallpaper-preview-bg');
                if(preview) preview.style.backgroundImage = `url('${this.settings.url}')`;
                modal.classList.remove('active');
            };

            // Выбор файла через инпут
            btnSelectFile.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) await handleFile(file);
            };

            // Drag and drop
            dropzone.ondragover = (e) => {
                e.preventDefault();
                dropzone.style.borderColor = '#007AFF';
                dropzone.style.background = 'rgba(0, 122, 255, 0.05)';
            };

            dropzone.ondragleave = () => {
                dropzone.style.borderColor = 'rgba(0, 0, 0, 0.12)';
                dropzone.style.background = 'rgba(0, 0, 0, 0.02)';
            };

            dropzone.ondrop = async (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'rgba(0, 0, 0, 0.12)';
                dropzone.style.background = 'rgba(0, 0, 0, 0.02)';
                const file = e.dataTransfer.files[0];
                if (file) await handleFile(file);
            };

            // Paste handler (Ctrl + V)
            window.addEventListener('paste', async (e) => {
                if (!modal.classList.contains('active')) return;
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (const item of items) {
                    if (item.type.indexOf("image") === 0) {
                        const file = item.getAsFile();
                        await handleFile(file);
                    }
                }
            });

            // Обработка и загрузка файла
            const handleFile = async (file) => {
                const originalText = btnSelectFile.innerText;
                btnSelectFile.innerText = 'Загрузка...';
                btnSelectFile.disabled = true;
                btnSelectFile.style.opacity = '0.7';

                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        const hostedUrl = await this.uploadToImgBB(evt.target.result);
                        this.settings.url = hostedUrl;
                        this.applySettings();
                        this.saveSettings();
                        this.saveToCloud();

                        const preview = document.querySelector('.wallpaper-preview-bg');
                        if (preview) preview.style.backgroundImage = `url('${this.settings.url}')`;
                        modal.classList.remove('active');
                    } catch (err) {
                        console.error(err);
                        alert("Не удалось загрузить изображение.");
                    } finally {
                        btnSelectFile.innerText = originalText;
                        btnSelectFile.disabled = false;
                        btnSelectFile.style.opacity = '1';
                    }
                };
                reader.readAsDataURL(file);
            };
        }
        
        const urlInput = document.getElementById('wpUrlInput');
        if (urlInput) urlInput.value = ''; 
        
        // Сброс вкладок на дефолт при открытии
        const tabBtns = modal.querySelectorAll('.modal-tab');
        const tabPanes = modal.querySelectorAll('.tab-content-pane');
        tabBtns.forEach(b => b.classList.remove('active'));
        tabBtns[0].classList.add('active');
        tabPanes.forEach(pane => pane.style.display = 'none');
        document.getElementById('tab-content-file').style.display = 'flex';
        document.getElementById('btn-select-file').style.display = 'block';
        document.getElementById('wpBtnSave').style.display = 'none';

        setTimeout(() => modal.classList.add('active'), 10);
    }
}