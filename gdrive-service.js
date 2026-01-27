/**
 * Google Drive Service for Narrative Plans
 */

const GDRIVE_FOLDER_NAME = 'Narrative Plans';

const GDriveService = {
    getAccessToken() {
        return localStorage.getItem('google_access_token');
    },

    async apiCall(endpoint, options = {}) {
        const token = this.getAccessToken();
        if (!token) {
            throw new Error('Необходима авторизация Google');
        }

        const headers = {
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        const response = await fetch(`https://www.googleapis.com/${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            localStorage.removeItem('google_access_token');
            throw new Error('Сессия Google истекла. Пожалуйста, войдите в аккаунт снова.');
        }

        if (!response.ok) {
            let errorMsg = 'Ошибка Google Drive API';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error.message || errorMsg;
            } catch (e) {
                // If body is not JSON or empty
                errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMsg);
        }

        // Handle empty responses (like 204 No Content for DELETE)
        const text = await response.text();
        try {
            return text ? JSON.parse(text) : null;
        } catch (e) {
            return text; // Return as text if not JSON
        }
    },

    async findOrCreateFolder() {
        // Поиск папки по имени
        const query = encodeURIComponent(`name = '${GDRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        const result = await this.apiCall(`drive/v3/files?q=${query}`);

        if (result.files && result.files.length > 0) {
            return result.files[0].id;
        }

        // Создание папки, если не найдена
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
            // Поиск существующего файла с таким же именем в этой папке, если ID не передан
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
            // Обновление существующего файла
            method = 'PATCH';
            url = `upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
            delete metadata.parents; // Не нужно при обновлении
        }

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            fileContent +
            close_delim;

        const response = await fetch(`https://www.googleapis.com/${url}`, {
            method: method,
            headers: {
                'Authorization': `Bearer ${this.getAccessToken()}`,
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
        // Мы используем alt=media для получения содержимого файла
        const token = this.getAccessToken();
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Ошибка при загрузке файла с Google Drive');
        }

        return response.json();
    },

    async deleteFile(fileId) {
        // Используем перемещение в корзину (trashed: true) вместо окончательного удаления.
        // Это безопаснее и часто решает проблемы с правами доступа в drive.file scope.
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
    }
};

window.GDriveService = GDriveService;
