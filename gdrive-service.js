const GDRIVE_FOLDER_NAME = 'Narrative Plans';

const GDriveService = {
    // Получает токен из localStorage (быстрая проверка)
    getStoredAccessToken() {
        // Мы убираем проверку expiry, чтобы сессия казалась "вечной" в UI.
        // Токен будет проверен только при реальном запросе к API.
        return localStorage.getItem('google_access_token');
    },

    // Основной метод для получения валидного токена (с проверкой БД и рефрешем)
    async ensureValidToken() {
        let token = this.getStoredAccessToken();
        if (token) return token;

        // Если в localStorage нет или протух - идем в БД
        console.log('Access token протух, пытаемся обновить через Refresh Token...');
        return await this.refreshAccessToken();
    },

    async refreshAccessToken() {
        // Ждем немного если db еще не инициализирован (так как auth-widget.js - модуль и грузится позже)
        for (let i = 0; i < 10; i++) {
            if (window.db && window.refreshGoogleToken) break;
            await new Promise(r => setTimeout(r, 200));
        }

        if (!window.refreshGoogleToken) {
            throw new Error('Сервис авторизации не готов. Попробуйте обновить страницу.');
        }

        try {
            // В статическом приложении (без бекенда) мы не можем безопасно использовать 
            // grant_type=refresh_token напрямую из-за необходимости client_secret.
            // Поэтому мы используем window.refreshGoogleToken(), который делает signInWithPopup.
            // Так как у нас настроен prompt=consent, это обновление пройдет гладко.
            console.log('Попытка автоматического обновления токена...');
            const newToken = await window.refreshGoogleToken();
            return newToken;
        } catch (err) {
            console.error('Ошибка автоматического обновления:', err);
            // Если автоматический рефреш не удался (например, заблокирован попап),
            // просим пользователя нажать кнопку войти
            throw new Error('Требуется обновление доступа. Нажмите на иконку профиля и войдите заново.');
        }
    },

    async apiCall(endpoint, options = {}) {
        const token = await this.ensureValidToken();

        const headers = {
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        const response = await fetch(`https://www.googleapis.com/${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            // Если все же 401, пробуем обновить один раз
            // Но мы не удаляем его из localStorage сразу, чтобы не ломать UI в других местах
            const newToken = await this.refreshAccessToken();
            return this.apiCall(endpoint, { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${newToken}` } });
        }

        if (!response.ok) {
            let errorMsg = 'Ошибка Google Drive API';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error.message || errorMsg;
            } catch (e) {
                errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }

        const text = await response.text();
        try {
            return text ? JSON.parse(text) : null;
        } catch (e) {
            return text;
        }
    },

    async findOrCreateFolder() {
        const query = encodeURIComponent(`name = '${GDRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const result = await this.apiCall(`drive/v3/files?q=${query}`);

        if (result.files && result.files.length > 0) {
            return result.files[0].id;
        }

        const folderMetadata = {
            name: GDRIVE_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const folder = await this.apiCall('drive/v3/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(folderMetadata)
        });

        return folder.id;
    },

    async saveFile(fileName, content, fileId = null) {
        const folderId = await this.findOrCreateFolder();
        let existingFileId = fileId;

        if (!existingFileId) {
            const query = encodeURIComponent(`name = '${fileName}.json' and '${folderId}' in parents and trashed = false`);
            const searchResult = await this.apiCall(`drive/v3/files?q=${query}`);
            if (searchResult.files && searchResult.files.length > 0) {
                existingFileId = searchResult.files[0].id;
            }
        }

        const metadata = {
            name: `${fileName}.json`,
            parents: [folderId]
        };

        const fileContent = JSON.stringify(content, null, 2);
        const boundary = 'foo_bar_baz';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        let method = 'POST';
        let url = 'upload/drive/v3/files?uploadType=multipart';

        if (existingFileId) {
            method = 'PATCH';
            url = `upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
            delete metadata.parents;
        }

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            fileContent +
            close_delim;

        const token = await this.ensureValidToken();
        const response = await fetch(`https://www.googleapis.com/${url}`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartRequestBody
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error.message || 'Ошибка при сохранении на Google Drive');
        }

        return response.json();
    },

    async listFiles() {
        const folderId = await this.findOrCreateFolder();
        const query = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType = 'application/json'`);
        const result = await this.apiCall(`drive/v3/files?q=${query}&fields=files(id, name, modifiedTime)`);
        return result.files;
    },

    async getFile(fileId) {
        const token = await this.ensureValidToken();
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Ошибка при загрузке файла с Google Drive');
        }

        return response.json();
    },

    async deleteFile(fileId) {
        return this.apiCall(`drive/v3/files/${fileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed: true })
        });
    },

    async renameFile(fileId, newName) {
        const metadata = { name: `${newName}.json` };
        return this.apiCall(`drive/v3/files/${fileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
    },

    getAccessToken() {
        return this.getStoredAccessToken();
    }
};

window.GDriveService = GDriveService;
