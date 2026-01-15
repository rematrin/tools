export class IconEditor {
    constructor() {
        this.modal = null;
        this.canvas = null;
        this.ctx = null;
        this.uploadedImage = null;
        this.onSaveCallback = null;
        
        this.state = {
            scale: 1,
            rotation: 0,
            bgColor: '#ffffff',
            offsetX: 0,
            offsetY: 0
        };
    }

    // Метод для извлечения названия из URL
    extractNameFromUrl(url) {
        try {
            let domain = url.trim();
            if (!domain) return '';
            
            // Добавляем протокол для корректной работы конструктора URL
            if (!/^https?:\/\//i.test(domain)) {
                domain = 'http://' + domain;
            }
            
            const urlObj = new URL(domain);
            let host = urlObj.hostname;
            
            // Убираем www. и выделяем основное имя
            host = host.replace(/^www\./i, '');
            const parts = host.split('.');
            
            if (parts.length > 0) {
                // Берем первую часть (например, 'google' из 'google.com')
                const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                return name;
            }
        } catch (e) {
            return '';
        }
        return '';
    }

    open(onSave, initialData = null) {
        this.onSaveCallback = onSave;
        this.createModal();
        this.initCanvas();

        if (initialData) {
            this.resetEditor(false);
            const nameInput = document.getElementById('editorAppName');
            const urlInput = document.getElementById('editorAppUrl');
            
            if (nameInput) nameInput.value = initialData.name || '';
            if (urlInput) urlInput.value = initialData.url || '';

            if (initialData.icon) {
                this.uploadedImage = new Image();
                this.uploadedImage.crossOrigin = "anonymous"; 
                this.uploadedImage.onload = () => {
                    this.resetImageState();
                    this.draw();
                };
                this.uploadedImage.onerror = () => {
                    this.uploadedImage = null;
                    this.draw();
                };
                this.uploadedImage.src = initialData.icon;
            }
        } else {
            this.resetEditor(true); 
        }
    }

    createModal() {
        if (document.getElementById('iconEditorModal')) {
            document.getElementById('iconEditorModal').remove();
        }

        const modalHTML = `
        <div id="iconEditorModal" class="editor-overlay">
            <div class="editor-modal">
                <div class="editor-header">
                    Настроить значок
                    <div class="editor-close-btn">&times;</div>
                </div>
                <div class="editor-body">
                    <div class="editor-left-col">
                        <div class="canvas-wrapper">
                            <canvas id="editorCanvas" width="512" height="512"></canvas>
                            <div class="grid-overlay">
                                <div class="grid-row"><div class="grid-col"></div><div class="grid-col"></div><div class="grid-col"></div></div>
                                <div class="grid-row"><div class="grid-col"></div><div class="grid-col"></div><div class="grid-col"></div></div>
                                <div class="grid-row"><div class="grid-col"></div><div class="grid-col"></div><div class="grid-col"></div></div>
                            </div>
                        </div>

                        <div class="tools-bar">
                            <div class="tool-group">
                                <button class="tool-btn" data-action="rotate-left" title="Вращать влево">↺</button>
                                <button class="tool-btn" data-action="rotate-right" title="Вращать вправо">↻</button>
                            </div>
                            <div class="tool-group">
                                <button class="tool-btn" data-action="move-left">←</button>
                                <button class="tool-btn" data-action="move-up">↑</button>
                                <button class="tool-btn" data-action="move-down">↓</button>
                                <button class="tool-btn" data-action="move-right">→</button>
                            </div>
                            <div class="tool-group">
                                <button class="tool-btn" data-action="zoom-out">－</button>
                                <button class="tool-btn" data-action="zoom-in">＋</button>
                            </div>
                        </div>

                        <div class="img-btns-row">
                            <button class="btn-upload" id="triggerFileSelect">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                <span>Загрузить</span>
                            </button>
                            <button class="btn-upload btn-fetch" id="btnFetchFromUrl">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                <span>С сайта</span>
                            </button>
                        </div>
                        <input type="file" id="editorFileInput" accept="image/*" style="display: none;">
                    </div>
                    <div class="editor-right-col">
                        <div>
                            <h4>Предпросмотр</h4>
                            <div class="preview-box">
                                <img id="editorPreviewImg" src="" draggable="false">
                            </div>
                        </div>
                        <div>
                            <h4>Цвет фона</h4>
                            <div class="color-palette">
                                <div class="swatch active" style="background-color: #ffffff; border: 1px solid #e0e0e0;" data-color="#ffffff"></div>
                                <div class="swatch" style="background-color: #000000;" data-color="#000000"></div>
                                <div class="swatch swatch-transparent" data-color="transparent"></div>
                                <div class="swatch swatch-rainbow">
                                    <input type="color" id="editorCustomColorPicker">
                                </div>
                            </div>
                        </div>
                        <div class="editor-inputs">
                            <div class="input-group">
                                <label>Адрес (URL) <span id="urlErrorText" class="error-msg"></span></label>
                                <input type="text" id="editorAppUrl" placeholder="https://..." autocomplete="off">
                            </div>
                            <div class="input-group">
                                <label>Название сайта</label>
                                <input type="text" id="editorAppName" placeholder="Например: Google" autocomplete="off">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="editor-footer">
                    <button class="btn btn-cancel">Отмена</button>
                    <button class="btn btn-reset">Сбросить</button>
                    <button class="btn btn-ok">Готово</button>
                </div>
            </div>
        </div>
        <style>
            .editor-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
            .editor-modal { background: white; width: 750px; max-width: 95%; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); overflow: hidden; display: flex; flex-direction: column; color: #202124; font-family: sans-serif; }
            .editor-header { padding: 20px; text-align: center; font-size: 20px; position: relative; border-bottom: 1px solid #eee; }
            .editor-close-btn { position: absolute; right: 20px; top: 20px; cursor: pointer; color: #9aa0a6; font-size: 24px; line-height: 1; }
            .editor-body { display: flex; padding: 20px; gap: 30px; justify-content: center; flex-wrap: wrap; }
            .editor-left-col { display: flex; flex-direction: column; align-items: center; gap: 15px; }
            
            .canvas-wrapper { width: 300px; height: 300px; position: relative; background: #eee; border: 1px solid #ddd; background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 20px 20px; }
            canvas { display: block; width: 100%; height: 100%; }
            
            .grid-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; display: flex; flex-direction: column; }
            .grid-row { flex: 1; display: flex; border-bottom: 1px dashed rgba(255,255,255,0.5); }
            .grid-row:last-child { border-bottom: none; }
            .grid-col { flex: 1; border-right: 1px dashed rgba(255,255,255,0.5); }
            .grid-col:last-child { border-right: none; }
            
            .tools-bar { display: flex; gap: 15px; width: 100%; justify-content: center; }
            .tool-group { display: flex; gap: 5px; }
            .tool-btn { background: #f1f3f4; border: none; cursor: pointer; width: 32px; height: 32px; border-radius: 4px; font-size: 18px; display: flex; align-items: center; justify-content: center; color: #5f6368; }
            .tool-btn:hover { background: #e8eaed; color: #202124; }

            .img-btns-row { display: flex; gap: 10px; width: 100%; margin-top: 5px; }
            .btn-upload { background-color: #4285f4; color: white; border: none; border-radius: 6px; padding: 10px 0; width: 100%; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .btn-upload:hover { background-color: #3367d6; }
            .btn-fetch { background-color: #34A853; }
            .btn-fetch:hover { background-color: #2D9147; }
            
            .editor-right-col { display: flex; flex-direction: column; gap: 20px; min-width: 250px; flex: 1; max-width: 300px; }
            h4 { margin: 0 0 10px 0; font-weight: 500; font-size: 14px; color: #5f6368; }
            
            .preview-box { width: 80px; height: 80px; border-radius: 20px; overflow: hidden; border: 1px solid #eee; background: white; flex-shrink: 0; }
            .preview-box img { width: 100%; height: 100%; object-fit: contain; }
            
            .color-palette { display: flex; gap: 8px; flex-wrap: wrap; }
            .swatch { width: 32px; height: 32px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.1s; overflow: hidden; position: relative; }
            .swatch:hover { transform: scale(1.1); }
            .swatch.active { border-color: #4285f4; box-shadow: 0 0 0 2px white inset; }
            .swatch-transparent { background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%); background-size: 8px 8px; background-color: white; }
            .swatch-rainbow { background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); }
            #editorCustomColorPicker { opacity: 0; position: absolute; left: 0; top: 0; width: 100%; height: 100%; cursor: pointer; }
            
            .editor-inputs { margin-top: 10px; display: flex; flex-direction: column; gap: 15px; border-top: 1px solid #eee; padding-top: 20px; }
            .input-group { display: flex; flex-direction: column; gap: 5px; }
            .input-group label { font-size: 13px; color: #5f6368; font-weight: 500; display: flex; justify-content: space-between; }
            .input-group input { padding: 8px 12px; border: 1px solid #dadce0; border-radius: 6px; font-size: 14px; outline: none; transition: border 0.2s; }
            .input-group input:focus { border-color: #4285f4; }
            .input-group input.input-error { border-color: #ea4335; background-color: #fce8e6; }
            .error-msg { color: #ea4335; font-size: 11px; font-weight: 600; display: none; }

            .editor-footer { padding: 15px 20px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #eee; background: #f8f9fa; }
            .btn { padding: 8px 16px; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
            .btn-cancel { background: white; border: 1px solid #dadce0; color: #3c4043; }
            .btn-reset { background: white; border: 1px solid #dadce0; color: #3c4043; }
            .btn-ok { background: #1a73e8; color: white; }
            .btn-ok:hover { background: #1557b0; }
            .btn-ok:disabled { background: #a8c7fa; cursor: wait; }
        </style>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('iconEditorModal');
        this.attachEvents();
    }

    attachEvents() {
        const fileInput = document.getElementById('editorFileInput');
        fileInput.addEventListener('change', (e) => this.handleUpload(e));
        const triggerBtn = document.getElementById('triggerFileSelect');
        if(triggerBtn) triggerBtn.addEventListener('click', () => fileInput.click());

        const urlInput = document.getElementById('editorAppUrl');
        const nameInput = document.getElementById('editorAppName');

        // Автозаполнение названия при вводе URL
        if (urlInput && nameInput) {
            urlInput.addEventListener('input', () => {
                const urlVal = urlInput.value.trim();
                
                // Срабатывает, если введено более 3 символов
                if(urlVal.length > 3) {
                    const guessedName = this.extractNameFromUrl(urlVal);
                    
                    // Обновляем, если поле пустое или было заполнено автоматически
                    if (guessedName && (nameInput.value === '' || nameInput.dataset.autoFilled === 'true')) {
                        nameInput.value = guessedName;
                        nameInput.dataset.autoFilled = 'true'; // Флаг автоматического заполнения
                    }
                }
            });

            // Если пользователь редактирует название вручную, отключаем флаг автозаполнения
            nameInput.addEventListener('input', () => {
                nameInput.dataset.autoFilled = 'false';
            });
        }

        const fetchBtn = document.getElementById('btnFetchFromUrl');
        if(fetchBtn) {
            fetchBtn.addEventListener('click', () => {
                const errorMsg = document.getElementById('urlErrorText');
                urlInput.classList.remove('input-error');
                if(errorMsg) errorMsg.style.display = 'none';

                let urlVal = urlInput.value.trim();
                if(!urlVal) {
                    urlInput.classList.add('input-error');
                    if(errorMsg) { errorMsg.innerText = 'Введите URL'; errorMsg.style.display = 'inline'; }
                    urlInput.focus();
                    return;
                }

                urlVal = urlVal.replace(/^https?:\/\//, '').replace(/\/$/, '');
                const highResFaviconUrl = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${urlVal}&size=256`;
                const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(highResFaviconUrl)}&w=512&h=512&output=png`;

                const originalBtnContent = fetchBtn.innerHTML;
                fetchBtn.innerHTML = `<span>Загрузка...</span>`;
                fetchBtn.style.opacity = 0.7;

                this.uploadedImage = new Image();
                this.uploadedImage.crossOrigin = "anonymous"; 
                this.uploadedImage.onload = () => {
                    this.resetImageState();
                    this.draw();
                    fetchBtn.innerHTML = originalBtnContent;
                    fetchBtn.style.opacity = 1;
                };
                
                this.uploadedImage.onerror = () => {
                    const fallbackUrl = `https://www.google.com/s2/favicons?domain=${urlVal}&sz=512`;
                    const fallbackProxy = `https://wsrv.nl/?url=${encodeURIComponent(fallbackUrl)}`;
                    const fallbackImg = new Image();
                    fallbackImg.crossOrigin = "anonymous";
                    fallbackImg.onload = () => {
                        this.uploadedImage = fallbackImg;
                        this.resetImageState();
                        this.draw();
                        fetchBtn.innerHTML = originalBtnContent;
                        fetchBtn.style.opacity = 1;
                    };
                    fallbackImg.onerror = () => {
                        urlInput.classList.add('input-error');
                        if(errorMsg) { errorMsg.innerText = 'Иконка не найдена'; errorMsg.style.display = 'inline'; }
                        this.uploadedImage = null;
                        this.draw();
                        fetchBtn.innerHTML = originalBtnContent;
                        fetchBtn.style.opacity = 1;
                    };
                    fallbackImg.src = fallbackProxy;
                };
                this.uploadedImage.src = proxyUrl + '&t=' + new Date().getTime();
            });
        }

        this.modal.addEventListener('click', (e) => {
            const btn = e.target.closest('.tool-btn');
            if (btn) {
                const action = btn.dataset.action;
                if (action === 'rotate-left') this.rotate(-90);
                if (action === 'rotate-right') this.rotate(90);
                if (action === 'move-left') this.move(-10, 0);
                if (action === 'move-right') this.move(10, 0);
                if (action === 'move-up') this.move(0, -10);
                if (action === 'move-down') this.move(0, 10);
                if (action === 'zoom-in') this.zoom(0.1);
                if (action === 'zoom-out') this.zoom(-0.1);
            }
            
            const swatch = e.target.closest('.swatch');
            if (swatch && !swatch.classList.contains('swatch-rainbow')) {
                document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                this.state.bgColor = swatch.dataset.color;
                this.draw();
            }

            if (e.target.closest('.editor-close-btn') || e.target.closest('.btn-cancel')) this.close();
            if (e.target.closest('.btn-reset')) this.resetEditor(false); 
            if (e.target.closest('.btn-ok') && !e.target.closest('.btn-ok').disabled) this.save();
        });

        document.getElementById('editorCustomColorPicker').addEventListener('input', (e) => {
            this.state.bgColor = e.target.value;
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            e.target.parentElement.classList.add('active');
            this.draw();
        });
    }

    initCanvas() {
        this.canvas = document.getElementById('editorCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
    }

    handleUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.uploadedImage = new Image();
                this.uploadedImage.onload = () => { this.resetImageState(); this.draw(); };
                this.uploadedImage.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    }

    move(x, y) { this.state.offsetX += x; this.state.offsetY += y; this.draw(); }
    zoom(delta) { this.state.scale += delta; if (this.state.scale < 0.01) this.state.scale = 0.01; this.draw(); }
    rotate(deg) { this.state.rotation += deg; this.draw(); }

    resetImageState() {
        if (this.uploadedImage) {
            let scaleX = this.canvas.width / this.uploadedImage.width;
            let scaleY = this.canvas.height / this.uploadedImage.height;
            this.state.scale = Math.min(scaleX, scaleY);
            this.state.rotation = 0;
            this.state.offsetX = 0;
            this.state.offsetY = 0;
        }
    }

    resetEditor(fullClear = false) {
        this.state.bgColor = '#ffffff';
        this.state.rotation = 0;
        this.state.offsetX = 0;
        this.state.offsetY = 0;
        const swatches = document.querySelectorAll('.swatch');
        if (swatches.length > 0) {
            swatches.forEach(s => s.classList.remove('active'));
            const whiteSwatch = document.querySelector('[data-color="#ffffff"]');
            if(whiteSwatch) whiteSwatch.classList.add('active');
        }
        if (fullClear) {
            const nameInput = document.getElementById('editorAppName');
            const urlInput = document.getElementById('editorAppUrl');
            if (nameInput) nameInput.value = '';
            if (urlInput) urlInput.value = '';
            this.uploadedImage = null;
            this.state.scale = 1;
        } else {
            if (this.uploadedImage) this.resetImageState(); else this.state.scale = 1;
        }
        this.draw();
    }

    draw() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.state.bgColor !== 'transparent') {
            this.ctx.fillStyle = this.state.bgColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.uploadedImage) {
            this.ctx.save();
            this.ctx.translate((this.canvas.width / 2) + this.state.offsetX, (this.canvas.height / 2) + this.state.offsetY);
            this.ctx.rotate(this.state.rotation * Math.PI / 180);
            this.ctx.scale(this.state.scale, this.state.scale);
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
            this.ctx.drawImage(this.uploadedImage, -this.uploadedImage.width / 2, -this.uploadedImage.height / 2);
            this.ctx.restore();
        }
        const dataUrl = this.canvas.toDataURL('image/png');
        const preview = document.getElementById('editorPreviewImg');
        if(preview) preview.src = dataUrl;
    }

    async save() {
        if (this.onSaveCallback) {
            const btnOk = this.modal.querySelector('.btn-ok');
            const originalText = btnOk.innerText;
            btnOk.innerText = 'Загрузка...';
            btnOk.disabled = true;

            try {
                const offscreenCanvas = document.createElement('canvas');
                const offCtx = offscreenCanvas.getContext('2d');
                offscreenCanvas.width = 256;
                offscreenCanvas.height = 256;
                offCtx.imageSmoothingEnabled = true;
                offCtx.imageSmoothingQuality = 'high';

                if (this.state.bgColor !== 'transparent') {
                    offCtx.fillStyle = this.state.bgColor;
                    offCtx.fillRect(0, 0, 256, 256);
                }
                
                offCtx.drawImage(this.canvas, 0, 0, 256, 256);
                
                const dataUrl = offscreenCanvas.toDataURL('image/png');
                const hostedUrl = await this.uploadToImgBB(dataUrl);

                const name = document.getElementById('editorAppName').value.trim();
                const url = document.getElementById('editorAppUrl').value.trim();
                
                this.onSaveCallback({ icon: hostedUrl, name: name, url: url });
                this.close();

            } catch (error) {
                console.error('Save error:', error);
                alert('Ошибка загрузки изображения. Проверьте интернет или API ключ.');
                btnOk.innerText = originalText;
                btnOk.disabled = false;
            }
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

    close() { if (this.modal) { this.modal.remove(); this.modal = null; } }
}