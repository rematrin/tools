// header.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

function updateHeaderData(user) {
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');

    if (!nameEl || !avatarEl) return; 

    if (user) {
        nameEl.innerText = user.displayName || "Пользователь"; 
        if (user.photoURL) {
            avatarEl.src = user.photoURL;
        } else {
            const letter = user.displayName ? user.displayName[0] : "U";
            avatarEl.src = `https://via.placeholder.com/32/CCCCCC/FFFFFF?text=${letter}`;
        }
        avatarEl.style.display = "block";
    } else {
        nameEl.innerText = "Войти";
        avatarEl.style.display = "none";
    }
}

fetch('header.html')
  .then(response => response.text())
  .then(data => {
    document.getElementById('header-container').innerHTML = data;

    // === 1. Клик на Профиль (ОСТАВЛЯЕМ AuthModal) ===
    const profileBtn = document.getElementById('profile-container');
    if (profileBtn) {
        profileBtn.addEventListener('click', function() {
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal(this); 
            } else {
                console.warn("Auth widget еще не загрузился");
            }
        });
    }

    // === 2. Клик на Главную (МЕНЯЕМ НА NavModal) ===
    const homeBtn = document.getElementById('home-menu-btn');
    if (homeBtn) {
        homeBtn.addEventListener('click', function() {
            // Теперь вызываем функцию из nav-widget.js
            if (typeof window.openNavModal === 'function') {
                window.openNavModal(this);
            } else {
                console.warn("Nav widget еще не загрузился");
            }
        });
    }

    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
        updateHeaderData(user);
    });
  })
  .catch(error => console.error("Ошибка:", error));