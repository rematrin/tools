// version-manager.js - Управление историей версий и резервным копированием

const STORAGE_KEY = 'app_version_history';
const MAX_AUTO_VERSIONS = 5; // Храним максимум 5 авто-снимков. Ручные бэкапы удаляются ТОЛЬКО вручную.

function formatDateTime(date = new Date()) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    return `${d}.${m}.${y} ${hh}:${mm}`;
}

function countAppsAndFolders(appsList) {
    let appsCount = 0;
    let foldersCount = 0;
    function countItem(item) {
        if (!item) return;
        if (item.type === 'folder') {
            foldersCount++;
            if (Array.isArray(item.items)) {
                item.items.forEach(countItem);
            }
        } else {
            appsCount++;
        }
    }
    if (Array.isArray(appsList)) {
        appsList.forEach(countItem);
    }
    return { appsCount, foldersCount };
}

function pruneVersions(versions) {
    const manualList = versions.filter(v => v.isManual === true);
    let autoList = versions.filter(v => v.isManual !== true);

    // Автоматические снимки сортируем от новых к старым и оставляем только последние 5
    autoList.sort((a, b) => b.timestamp - a.timestamp);
    if (autoList.length > MAX_AUTO_VERSIONS) {
        autoList = autoList.slice(0, MAX_AUTO_VERSIONS);
    }

    // Объединяем ручные бэкапы (они никогда не вытесняются авто-ротацией) и авто-снимки
    const result = [...manualList, ...autoList];
    result.sort((a, b) => b.timestamp - a.timestamp);
    return result;
}

export class VersionManager {
    static getLocalVersions() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('[VersionManager] Ошибка чтения версий:', e);
            return [];
        }
    }

    static saveLocalVersions(versions) {
        try {
            const pruned = pruneVersions(versions);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
            return pruned;
        } catch (e) {
            console.error('[VersionManager] Ошибка сохранения версий:', e);
            return versions;
        }
    }

    static createSnapshot(label = 'Авто-сохранение', customApps = null, isManual = false) {
        try {
            const apps = customApps || (window.getAppsFromStorage ? window.getAppsFromStorage() : []);
            if (!apps || !Array.isArray(apps) || apps.length === 0) return null;

            const versions = this.getLocalVersions();
            const { appsCount, foldersCount } = countAppsAndFolders(apps);
            const currentSerialized = JSON.stringify(apps);

            // Предотвращаем создание идентичного дубликата снимка подряд
            if (versions.length > 0) {
                const latest = versions[0];
                if (JSON.stringify(latest.apps) === currentSerialized && latest.label === label) {
                    return latest;
                }
            }

            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const deviceStr = isMobile ? 'Мобильный' : 'Компьютер';

            const newSnapshot = {
                id: 'ver_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                timestamp: Date.now(),
                dateStr: formatDateTime(new Date()),
                label: label,
                device: deviceStr,
                isManual: isManual === true,
                appsCount: appsCount,
                foldersCount: foldersCount,
                categories: Array.from(window.userCategories || []),
                apps: JSON.parse(currentSerialized)
            };

            versions.unshift(newSnapshot);

            const savedList = this.saveLocalVersions(versions);

            // Синхронизируем с облаком если пользователь авторизован
            this.syncToCloud(savedList);

            return newSnapshot;
        } catch (e) {
            console.error('[VersionManager] Ошибка создания снимка:', e);
            return null;
        }
    }

    static autoSnapshot(apps) {
        if (!apps || !Array.isArray(apps) || apps.length === 0) return;
        this.createSnapshot('Авто-сохранение', apps, false);
    }

    static async restoreVersion(versionId) {
        try {
            const versions = this.getLocalVersions();
            const target = versions.find(v => v.id === versionId);
            if (!target) {
                throw new Error('Версия не найдена');
            }

            // Создаем контрольный бэкап текущего состояния перед откатом
            this.createSnapshot('Перед откатом', null, false);

            const restoredApps = JSON.parse(JSON.stringify(target.apps));

            // Восстанавливаем категории если сохранены
            if (target.categories && Array.isArray(target.categories)) {
                window.userCategories = Array.from(target.categories);
                localStorage.setItem('userCategories', JSON.stringify(target.categories));
                if (window.dbApi && window.auth && window.auth.currentUser) {
                    window.dbApi.saveCategories(target.categories);
                }
            }

            // Сохраняем и обновляем DOM
            if (window.saveCurrentState) {
                window.saveCurrentState(restoredApps);
            } else {
                localStorage.setItem('app_tools_user_apps_v2', JSON.stringify(restoredApps));
            }

            if (window.renderAppsToDOM) {
                window.renderAppsToDOM(restoredApps);
            }

            if (window.renderCategoryBar) {
                window.renderCategoryBar();
            }

            const msg = `Восстановлена версия от ${target.dateStr}`;
            if (window.showToast) {
                window.showToast(msg);
            } else {
                console.log(msg);
            }

            return true;
        } catch (e) {
            console.error('[VersionManager] Ошибка восстановления версии:', e);
            if (window.showToast) window.showToast('Ошибка восстановления: ' + e.message, true);
            return false;
        }
    }

    static deleteVersion(versionId) {
        try {
            let versions = this.getLocalVersions();
            versions = versions.filter(v => v.id !== versionId);
            const savedList = this.saveLocalVersions(versions);
            this.syncToCloud(savedList);
            return true;
        } catch (e) {
            console.error('[VersionManager] Ошибка удаления версии:', e);
            return false;
        }
    }

    static async syncToCloud(versions = null) {
        try {
            if (!window.auth || !window.auth.currentUser || !window.db) return;
            const uid = window.auth.currentUser.uid;
            const list = versions || this.getLocalVersions();
            
            // Сохраняем историю версий в документе пользователя Firestore (метаданные + версии)
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const userDocRef = doc(window.db, "users", uid);
            
            const prunedList = pruneVersions(list);
            await setDoc(userDocRef, { versionHistory: prunedList }, { merge: true });
        } catch (e) {
            console.warn('[VersionManager] Cloud sync warning:', e);
        }
    }

    static async loadFromCloud() {
        try {
            if (!window.auth || !window.auth.currentUser || !window.db) return;
            const uid = window.auth.currentUser.uid;
            const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            
            const userDocRef = doc(window.db, "users", uid);
            const snap = await getDoc(userDocRef);
            if (snap.exists() && snap.data().versionHistory) {
                const cloudVersions = snap.data().versionHistory;
                if (Array.isArray(cloudVersions) && cloudVersions.length > 0) {
                    const localVersions = this.getLocalVersions();
                    
                    const versionMap = new Map();
                    localVersions.forEach(v => versionMap.set(v.id, v));
                    cloudVersions.forEach(v => versionMap.set(v.id, v));
                    
                    const merged = Array.from(versionMap.values());
                    this.saveLocalVersions(merged);
                }
            }
        } catch (e) {
            console.warn('[VersionManager] Cloud load warning:', e);
        }
    }
}

window.VersionManager = VersionManager;
