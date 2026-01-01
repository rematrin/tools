// header.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

function updateHeaderData(user) {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');

    if (!nameEl || !avatarEl) return; 

    if (user) {
        // 1. Имя пользователя
        nameEl.innerText = user.displayName || "Пользователь"; 
        
        // 2. Аватарка
        if (user.photoURL) {
            avatarEl.src = user.photoURL;
        } else {
            const letter = user.displayName ? user.displayName[0] : "U";
            avatarEl.src = `https://via.placeholder.com/32/CCCCCC/FFFFFF?text=${letter}`;
        }
        avatarEl.style.display = "block";

    } else {
        // Если пользователь НЕ вошел
        nameEl.innerText = "Войти";
        avatarEl.style.display = "none";
    }
}

// Загрузка шапки
fetch('header.html')
  .then(response => response.text())
  .then(data => {
    document.getElementById('header-container').innerHTML = data;

    // === НОВОЕ: Навешиваем клик на профиль для открытия модалки ===
    const profileBtn = document.getElementById('profile-container');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal();
            } else {
                console.warn("Auth widget еще не загрузился");
            }
        });
    }

    // Слушаем Firebase
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        updateHeaderData(user);
    });
  })
  .catch(error => console.error("Ошибка:", error));