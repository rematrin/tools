// gdrive-auth-modal.js

const modalHTML = `
<div id="gdriveAuthOverlay" class="modal-overlay" style="display: none; z-index: 4000;">
    <div class="modal" style="max-width: 360px; text-align: center; padding: 32px 24px;">
        <div style="background: #f1f5f9; width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #4285f4;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.75 2.25l-2.617 4.5h5.234l2.617-4.5h-5.234zm-2.025 1.125l-7.125 12.375 2.617 4.5 7.125-12.375-2.617-4.5zm-8.25 14.25l-2.617 4.5h15.734l-2.617-4.5h-10.5z"></path>
            </svg>
        </div>
        <h3 style="margin: 0 0 12px 0; font-size: 1.25rem;">Доступ к Google Drive</h3>
        <p style="margin: 0 0 24px 0; color: #64748b; font-size: 0.95rem; line-height: 1.5;">Сессия работы с диском истекла. Нажмите кнопку ниже, чтобы быстро восстановить подключение.</p>
        
        <button id="btnGDriveReconnect" class="btn-primary" style="width: 100%; padding: 12px; border-radius: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px; background: #4285f4; color: white; border: none; cursor: pointer;">
            <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="currentColor"></path><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.715H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34a853"></path><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fbbc05"></path><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#ea4335"></path></svg>
            Подключить заново
        </button>
        
        <button id="btnGDriveCancel" style="margin-top: 12px; background: none; border: none; color: #94a3b8; font-size: 0.85rem; cursor: pointer;">Отмена</button>
    </div>
</div>
`;

function initGDriveAuthModal() {
    if (document.getElementById('gdriveAuthOverlay')) return;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('gdriveAuthOverlay');
    const btnReconnect = document.getElementById('btnGDriveReconnect');
    const btnCancel = document.getElementById('btnGDriveCancel');

    btnReconnect.onclick = async () => {
        const originalText = btnReconnect.innerHTML;
        try {
            btnReconnect.disabled = true;
            btnReconnect.innerHTML = 'Подключение...';

            if (window.refreshGoogleToken) {
                await window.refreshGoogleToken();
                overlay.style.display = 'none';
                if (typeof showToast === 'function') showToast('Подключение восстановлено');
            } else {
                throw new Error('Сервис авторизации не инициализирован');
            }
        } catch (e) {
            console.error(e);
            if (typeof showToast === 'function') showToast('Ошибка подключения', 'error');
        } finally {
            btnReconnect.disabled = false;
            btnReconnect.innerHTML = originalText;
        }
    };

    btnCancel.onclick = () => {
        overlay.style.display = 'none';
    };

    window.openGDriveAuthModal = () => {
        overlay.style.display = 'flex';
    };
}

initGDriveAuthModal();
