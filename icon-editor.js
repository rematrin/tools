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

            if (!/^https?:\/\//i.test(domain)) {
                domain = 'http://' + domain;
            }

            const urlObj = new URL(domain);
            let host = urlObj.hostname;

            host = host.replace(/^www\./i, '');
            const parts = host.split('.');

            if (parts.length > 0) {
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
            const previewBox = document.getElementById('editorPreviewBox');
            if (previewBox) previewBox.classList.add('can-download');

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
                    const fallbackProxy = `https://wsrv.nl/?url=${encodeURIComponent(initialData.icon)}&w=512&h=512&output=png`;
                    const fallbackImg = new Image();
                    fallbackImg.crossOrigin = "anonymous";
                    fallbackImg.onload = () => {
                        this.uploadedImage = fallbackImg;
                        this.resetImageState();
                        this.draw();
                    };
                    fallbackImg.onerror = () => {
                        this.uploadedImage = null;
                        this.draw();
                    };
                    fallbackImg.src = fallbackProxy;
                };

                if (initialData.icon.startsWith('data:')) {
                    this.uploadedImage.src = initialData.icon;
                } else {
                    const separator = initialData.icon.includes('?') ? '&' : '?';
                    this.uploadedImage.src = initialData.icon + separator + 'cb=' + new Date().getTime();
                }
            }
        } else {
            this.resetEditor(true);
            const previewBox = document.getElementById('editorPreviewBox');
            if (previewBox) previewBox.classList.remove('can-download');
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
                        <div class="editor-canvas-container">
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
                            <div class="color-picker-bar">
                                <span style="font-size: 13px; color: #5f6368; font-weight: 500;">Цвет фона:</span>
                                <div class="color-palette">
                                    <div class="swatch active" style="background-color: #ffffff; border: 1px solid #e0e0e0;" data-color="#ffffff"></div>
                                    <div class="swatch" style="background-color: #000000;" data-color="#000000"></div>
                                    <div class="swatch swatch-transparent" data-color="transparent"></div>
                                    <div class="swatch swatch-rainbow">
                                        <input type="color" id="editorCustomColorPicker">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <input type="file" id="editorFileInput" accept="image/*" style="display: none;">
                    </div>
                    
                    <div class="editor-right-col">
                        <div style="display: flex; gap: 20px;">
                            <div>
                                <h4>Предпросмотр</h4>
                                <div class="preview-box" id="editorPreviewBox">
                                    <img id="editorPreviewImg" src="" draggable="false">
                                    <div class="download-overlay" id="editorDownloadOverlay" style="display: none;">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="editor-inputs">
                            <div class="modern-input-group">
                                <div class="modern-input-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                </div>
                                <div class="modern-input-content">
                                    <input type="text" id="editorAppUrl" placeholder=" " autocomplete="off">
                                    <label for="editorAppUrl">Ссылка на сайт</label>
                                    <span id="urlErrorText" class="error-msg"></span>
                                </div>
                            </div>
                            <div class="modern-input-group">
                                <div class="modern-input-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
                                </div>
                                <div class="modern-input-content">
                                    <input type="text" id="editorAppName" placeholder=" " autocomplete="off">
                                    <label for="editorAppName">Название</label>
                                </div>
                            </div>
                        </div>

                        <div style="width: 100%; display: flex; flex-direction: column; gap: 5px;">
                            <div style="border-top: 1px solid #ddd; margin: 0 0 5px 0;"></div>
                            <div style="font-size: 14px; color: #5f6368; font-weight: 500;">Выбрать другую иконку:</div>
                            
                            <div class="img-btns-row" style="position: relative;">
                                <button class="btn-upload" id="triggerFileSelect">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                    <span>Файл</span>
                                </button>
                                <button class="btn-upload btn-search" id="btnOpenSearch">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                    <span>Каталог</span>
                                </button>
                                
                                <button class="btn-upload btn-fetch" id="btnFetchFromUrl">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                    <span>С сайта</span>
                                </button>
                                
                                <button class="btn-upload btn-link" id="btnLoadFromImgUrl">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                    <span>По ссылке</span>
                                </button>
                                
                                <div id="searchPopup" class="search-popup" style="display: none;">
                                    <div class="search-popup-header">
                                        <div class="search-input-wrapper">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                            <input type="text" id="iconSearchInput" placeholder="Поиск иконок..." autocomplete="off">
                                        </div>
                                        <div class="search-close" id="closeSearchPopup">&times;</div>
                                    </div>
                                    <div class="search-options">
                                        <label for="iconColorPicker" class="color-label">Покрасить:</label>
                                        <input type="color" id="iconColorPicker" value="#000000">
                                    </div>
                                    <div id="iconSearchResults" class="search-results"></div>
                                </div>
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
            .editor-header { padding: 10px 20px; text-align: center; font-size: 18px; position: relative; border-bottom: 1px solid #eee; }
            .editor-close-btn { position: absolute; right: 20px; top: 10px; cursor: pointer; color: #9aa0a6; font-size: 24px; line-height: 1; }
            .editor-body { display: flex; padding: 20px; gap: 30px; justify-content: center; flex-wrap: wrap; }
            .editor-left-col { display: flex; flex-direction: column; align-items: center; gap: 15px; }
            
            .editor-canvas-container { width: 300px; border: 1px solid #ddd; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; background: #fff; }
            .canvas-wrapper { width: 100%; height: 300px; position: relative; background: #eee; background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 20px 20px; }
            canvas { display: block; width: 100%; height: 100%; }
            
            .grid-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; display: flex; flex-direction: column; }
            .grid-row { flex: 1; display: flex; border-bottom: 1px dashed rgba(255,255,255,0.5); }
            .grid-row:last-child { border-bottom: none; }
            .grid-col { flex: 1; border-right: 1px dashed rgba(255,255,255,0.5); }
            .grid-col:last-child { border-right: none; }
            
            .tools-bar { display: flex; gap: 10px; width: 100%; justify-content: space-between; padding: 8px; border-top: 1px solid #ddd; background: #f8f9fa; box-sizing: border-box; height: 50px; }
            .tool-group { display: flex; gap: 4px; flex: 1; }
            .tool-group:nth-child(1) { flex: 2; }
            .tool-group:nth-child(2) { flex: 4; }
            .tool-group:nth-child(3) { flex: 2; }
            .tool-btn { background: #fff; border: 1px solid #dadce0; cursor: pointer; flex: 1; height: 100%; border-radius: 6px; font-size: 17px; display: flex; align-items: center; justify-content: center; color: #5f6368; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: background 0.2s, box-shadow 0.2s; padding: 0; margin: 0; }
            .tool-btn:hover { background: #f1f3f4; color: #202124; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            
            .color-picker-bar { display: flex; align-items: center; justify-content: center; gap: 15px; padding: 6px 10px 14px 10px; background: #f8f9fa; }

            .img-btns-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; margin-top: 5px; }
            .btn-upload { background-color: #4285f4; color: white; border: none; border-radius: 6px; padding: 10px 0; width: 100%; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
            .btn-upload:hover { background-color: #3367d6; }
            .btn-fetch { background-color: #34A853; }
            .btn-fetch:hover { background-color: #2D9147; }
            
            .btn-search { background-color: #8e44ad; }
            .btn-search:hover { background-color: #732d91; }
            .btn-link { background-color: #f39c12; }
            .btn-link:hover { background-color: #e67e22; }

            .search-popup {
                position: absolute;
                bottom: 50px;
                left: 0;
                width: 100%;
                height: 320px;
                background: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                box-sizing: border-box;
                z-index: 100;
            }
            .search-popup-header { display: flex; align-items: center; gap: 10px; }
            .search-input-wrapper { flex: 1; position: relative; display: flex; align-items: center; }
            .search-input-wrapper svg { position: absolute; left: 10px; pointer-events: none; }
            #iconSearchInput { width: 100%; padding: 8px 8px 8px 32px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 14px; outline: none; transition: border 0.2s; }
            #iconSearchInput:focus { border-color: #8e44ad; }
            
            .search-close { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #999; font-size: 22px; line-height: 1; border-radius: 4px; transition: background 0.2s; }
            .search-close:hover { background: #f1f3f4; color: #333; }
            
            .search-options { display: flex; align-items: center; gap: 10px; padding-bottom: 5px; border-bottom: 1px solid #eee; font-size: 13px; color: #5f6368; }
            .color-label { font-weight: 500; }
            #iconColorPicker { -webkit-appearance: none; border: none; width: 24px; height: 24px; padding: 0; margin: 0; border-radius: 4px; cursor: pointer; overflow: hidden; }
            #iconColorPicker::-webkit-color-swatch-wrapper { padding: 0; }
            #iconColorPicker::-webkit-color-swatch { border: 1px solid #ddd; border-radius: 4px; }

            .search-results {
                flex: 1;
                overflow-y: auto;
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 8px;
                align-content: start;
                padding-right: 4px;
                padding-top: 5px;
            }
            .search-results::-webkit-scrollbar { width: 4px; }
            .search-results::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }

            .search-item {
                aspect-ratio: 1;
                border: 1px solid #eee;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                background: #fff;
            }
            .search-item:hover { background: #f8f9fa; border-color: #8e44ad; transform: translateY(-2px); box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .search-item img { width: 28px; height: 28px; transition: transform 0.2s; }
            .search-item:hover img { transform: scale(1.1); }
            
            .editor-right-col { display: flex; flex-direction: column; justify-content: space-between; min-width: 250px; flex: 1; max-width: 300px; }
            h4 { margin: 0 0 10px 0; font-weight: 500; font-size: 14px; color: #5f6368; }
            
            .preview-box { width: 80px; height: 80px; border-radius: 20px; overflow: hidden; border: 1px solid #eee; background: white; flex-shrink: 0; position: relative; }
            .preview-box img { width: 100%; height: 100%; object-fit: contain; display: block; position: relative; z-index: 1; }
            
            .download-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex; align-items: center; justify-content: center;
                color: white; opacity: 0; transition: opacity 0.2s;
                cursor: pointer; z-index: 2;
            }
            .preview-box.can-download .download-overlay { display: flex !important; }
            .preview-box.can-download:hover .download-overlay { opacity: 1; }
            
            .color-palette { display: flex; gap: 8px; flex-wrap: wrap; }
            .swatch { width: 32px; height: 32px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.1s; overflow: hidden; position: relative; }
            .swatch:hover { transform: scale(1.1); }
            .swatch.active { border-color: #4285f4; box-shadow: 0 0 0 2px white inset; }
            .swatch-transparent {
                background-color: #fff;
                background-image: 
                    linear-gradient(45deg, #e0e0e0 25%, transparent 25%, transparent 75%, #e0e0e0 75%, #e0e0e0),
                    linear-gradient(45deg, #e0e0e0 25%, transparent 25%, transparent 75%, #e0e0e0 75%, #e0e0e0);
                background-position: 0 0, 5px 5px;
                background-size: 10px 10px;
            }
            .swatch-rainbow { background: transparent; }
            .swatch-rainbow::before {
                content: '';
                position: absolute;
                top: -4px; left: -4px; right: -4px; bottom: -4px;
                background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
                border-radius: 50%;
                z-index: 1;
            }
            #editorCustomColorPicker { opacity: 0; position: absolute; left: 0; top: 0; width: 100%; height: 100%; cursor: pointer; z-index: 5; }
            
            .editor-inputs { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid #eee; padding-top: 15px; }
            .modern-input-group {
                display: flex;
                align-items: center;
                background: #f8f9fa;
                border: 1px solid #dadce0;
                border-radius: 10px;
                padding: 0 12px;
                height: 52px;
                transition: all 0.2s ease;
                position: relative;
            }
            .modern-input-group:focus-within {
                border-color: #4285f4;
                background: #fff;
                box-shadow: 0 0 0 1px #4285f4;
            }
            .modern-input-group:has(.input-error) {
                border-color: #ea4335 !important;
                background-color: #fce8e6;
            }
            .modern-input-group:has(.input-error):focus-within {
                box-shadow: 0 0 0 1px #ea4335;
            }
            .modern-input-icon {
                margin-right: 12px;
                color: #5f6368;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s;
            }
            .modern-input-content {
                display: flex;
                flex: 1;
                position: relative;
                height: 100%;
            }
            .modern-input-content label {
                position: absolute;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                font-size: 15px;
                color: #8E8E93;
                font-weight: 500;
                pointer-events: none;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .modern-input-content input {
                border: none;
                background: transparent;
                font-size: 15px;
                padding: 16px 0 0 0;
                outline: none;
                color: #202124;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
            }
            
            /* Animation for Floating Label inside bounds */
            .modern-input-content input:focus ~ label,
            .modern-input-content input:not(:placeholder-shown) ~ label {
                top: 8px;
                transform: translateY(0) scale(0.75);
                transform-origin: left top;
            }
            
            /* Focus and Error Colors */
            .modern-input-group:focus-within .modern-input-icon,
            .modern-input-group:focus-within .modern-input-content label {
                color: #4285f4;
            }
            .modern-input-group:has(.input-error) .modern-input-icon,
            .modern-input-group:has(.input-error) .modern-input-content label {
                color: #ea4335 !important;
            }
            
            .error-msg { position: absolute; right: 0; top: 18px; color: #ea4335; font-size: 11px; font-weight: 600; display: none; }

            .editor-footer { padding: 10px 20px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #eee; background: #f8f9fa; }
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
        const downloadOverlay = document.getElementById('editorDownloadOverlay');
        if (downloadOverlay) {
            downloadOverlay.addEventListener('click', () => {
                const dataUrl = this.canvas.toDataURL('image/png');
                const nameInput = document.getElementById('editorAppName');
                let linkName = (nameInput && nameInput.value.trim() !== '') ? nameInput.value.trim() : 'icon';
                const link = document.createElement('a');
                link.download = `${linkName}.png`;
                link.href = dataUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }

        const fileInput = document.getElementById('editorFileInput');
        fileInput.addEventListener('change', (e) => this.handleUpload(e));
        const triggerBtn = document.getElementById('triggerFileSelect');
        if (triggerBtn) triggerBtn.addEventListener('click', () => fileInput.click());

        const urlInput = document.getElementById('editorAppUrl');
        const nameInput = document.getElementById('editorAppName');
        const fetchBtn = document.getElementById('btnFetchFromUrl');

        if (urlInput && nameInput) {
            urlInput.addEventListener('input', () => {
                const urlVal = urlInput.value.trim();
                
                urlInput.classList.remove('input-error');
                const errorMsg = document.getElementById('urlErrorText');
                if (errorMsg) errorMsg.style.display = 'none';

                if (urlVal.length > 3) {
                    const guessedName = this.extractNameFromUrl(urlVal);
                    if (guessedName && (nameInput.value === '' || nameInput.dataset.autoFilled === 'true')) {
                        nameInput.value = guessedName;
                        nameInput.dataset.autoFilled = 'true';
                    }
                }
            });
            nameInput.addEventListener('input', () => { nameInput.dataset.autoFilled = 'false'; });

            // --- НОВАЯ ЛОГИКА: Авто-нажатие (только если иконка НЕ загружена) ---
            urlInput.addEventListener('paste', () => {
                setTimeout(() => {
                    const val = urlInput.value.trim();
                    // Добавлено условие !this.uploadedImage
                    if (!this.uploadedImage && val.length > 4 && val.includes('.')) {
                        if (fetchBtn) fetchBtn.click();
                    }
                }, 50);
            });
        }

        if (fetchBtn) {
            fetchBtn.addEventListener('click', () => {
                const errorMsg = document.getElementById('urlErrorText');
                urlInput.classList.remove('input-error');
                if (errorMsg) errorMsg.style.display = 'none';

                let urlVal = urlInput.value.trim();
                if (!urlVal) {
                    urlInput.classList.add('input-error');
                    if (errorMsg) { errorMsg.innerText = 'Введите URL'; errorMsg.style.display = 'inline'; }
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
                        if (errorMsg) { errorMsg.innerText = 'Иконка не найдена'; errorMsg.style.display = 'inline'; }
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

        // --- ЛОГИКА ПОИСКА ICONIFY ---
        const searchBtn = document.getElementById('btnOpenSearch');
        const searchPopup = document.getElementById('searchPopup');
        const closeSearch = document.getElementById('closeSearchPopup');
        const searchInput = document.getElementById('iconSearchInput');
        const resultsContainer = document.getElementById('iconSearchResults');
        const colorPicker = document.getElementById('iconColorPicker');

        let currentSearchColor = colorPicker ? colorPicker.value : '#000000';

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const isHidden = searchPopup.style.display === 'none';
                searchPopup.style.display = isHidden ? 'flex' : 'none';
                if (isHidden) searchInput.focus();
            });

            closeSearch.addEventListener('click', () => {
                searchPopup.style.display = 'none';
            });

            colorPicker.addEventListener('input', (e) => {
                currentSearchColor = e.target.value;
                const images = resultsContainer.querySelectorAll('img');
                images.forEach(img => {
                    const baseUrl = img.src.split('?')[0];
                    img.src = `${baseUrl}?color=${encodeURIComponent(currentSearchColor)}`;
                });
            });

            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                const query = e.target.value.trim();

                if (query.length < 2) {
                    resultsContainer.innerHTML = '';
                    return;
                }

                debounceTimer = setTimeout(async () => {
                    resultsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #999; padding: 20px;">Ищу...</div>';

                    try {
                        const resp = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=100`);
                        const data = await resp.json();

                        resultsContainer.innerHTML = '';

                        if (data.icons && data.icons.length > 0) {
                            data.icons.forEach(iconName => {
                                const div = document.createElement('div');
                                div.className = 'search-item';
                                const baseUrl = `https://api.iconify.design/${iconName}.svg`;
                                const coloredUrl = `${baseUrl}?color=${encodeURIComponent(currentSearchColor)}`;

                                const img = document.createElement('img');
                                img.src = coloredUrl;
                                img.loading = "lazy";
                                div.appendChild(img);

                                div.addEventListener('click', () => {
                                    const finalUrl = `${baseUrl}?color=${encodeURIComponent(currentSearchColor)}`;

                                    this.uploadedImage = new Image();
                                    this.uploadedImage.crossOrigin = "anonymous";

                                    this.uploadedImage.onload = () => {
                                        const targetSize = this.canvas.width * 0.6;
                                        const scale = targetSize / Math.max(this.uploadedImage.width, this.uploadedImage.height);

                                        this.state.scale = scale;
                                        this.state.rotation = 0;
                                        this.state.offsetX = 0;
                                        this.state.offsetY = 0;

                                        this.draw();
                                        searchPopup.style.display = 'none';
                                    };

                                    this.uploadedImage.src = finalUrl;
                                });
                                resultsContainer.appendChild(div);
                            });
                        } else {
                            resultsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #999; padding: 20px;">Ничего не найдено</div>';
                        }
                    } catch (err) {
                        console.error(err);
                        resultsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ea4335; padding: 20px;">Ошибка сети</div>';
                    }
                }, 500);
            });
        }

        // --- ЛОГИКА ЗАГРУЗКИ ПО ССЫЛКЕ ---
        const btnLoadFromImgUrl = document.getElementById('btnLoadFromImgUrl');
        if (btnLoadFromImgUrl) {
            btnLoadFromImgUrl.addEventListener('click', () => {
                let modal = document.getElementById('iconEditorUrlModal');
                if (!modal) {
                    const modalHTML = `
                        <div class="wp-modal-overlay" id="iconEditorUrlModal" style="z-index: 3000;">
                            <div class="wp-modal-card">
                                <h3>Ссылка на изображение</h3>
                                <input type="text" id="iconEditorUrlInput" class="form-input" placeholder="https://site.com/image.png" autocomplete="off">
                                <div class="wp-modal-actions">
                                    <button class="wp-btn-cancel" id="iconEditorUrlCancel">Отмена</button>
                                    <button class="wp-btn-save" id="iconEditorUrlSave">Сохранить</button>
                                </div>
                            </div>
                        </div>
                    `;
                    document.body.insertAdjacentHTML('beforeend', modalHTML);
                    modal = document.getElementById('iconEditorUrlModal');
                    
                    document.getElementById('iconEditorUrlCancel').onclick = () => modal.classList.remove('active');
                    
                    document.getElementById('iconEditorUrlSave').onclick = () => {
                        const input = document.getElementById('iconEditorUrlInput');
                        const imgUrl = input.value;
                        if (imgUrl && imgUrl.trim() !== '') {
                            const originalBtnContent = btnLoadFromImgUrl.innerHTML;
                            btnLoadFromImgUrl.innerHTML = `<span>Загрузка...</span>`;
                            btnLoadFromImgUrl.style.opacity = 0.7;

                            const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl.trim())}&w=512&h=512&output=png`;

                            this.uploadedImage = new Image();
                            this.uploadedImage.crossOrigin = "anonymous";

                            this.uploadedImage.onload = () => {
                                this.resetImageState();
                                this.draw();
                                btnLoadFromImgUrl.innerHTML = originalBtnContent;
                                btnLoadFromImgUrl.style.opacity = 1;
                            };

                            this.uploadedImage.onerror = () => {
                                this.uploadedImage = new Image();
                                this.uploadedImage.crossOrigin = "anonymous";
                                this.uploadedImage.onload = () => {
                                    this.resetImageState();
                                    this.draw();
                                    btnLoadFromImgUrl.innerHTML = originalBtnContent;
                                    btnLoadFromImgUrl.style.opacity = 1;
                                };
                                this.uploadedImage.onerror = () => {
                                    alert('Не удалось загрузить картинку по этой ссылке. Возможно, она недоступна или заблокирована.');
                                    this.uploadedImage = null;
                                    this.draw();
                                    btnLoadFromImgUrl.innerHTML = originalBtnContent;
                                    btnLoadFromImgUrl.style.opacity = 1;
                                };
                                // Пытаемся без прокси, если прокси упал
                                this.uploadedImage.src = imgUrl.trim();
                            };

                            this.uploadedImage.src = proxyUrl + '&t=' + new Date().getTime();
                        }
                        modal.classList.remove('active');
                    };
                }
                
                const input = document.getElementById('iconEditorUrlInput');
                if (input) {
                    input.value = '';
                    setTimeout(() => input.focus(), 100); 
                }
                
                setTimeout(() => modal.classList.add('active'), 10);
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
            if (whiteSwatch) whiteSwatch.classList.add('active');
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
        if (preview) preview.src = dataUrl;
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