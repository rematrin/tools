import {
    getFirestore,
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const db = getFirestore();

let currentUid = null;
let unsubscribe = null;

const titleInput = document.getElementById('bm-title');
const urlInput = document.getElementById('bm-url');
const addBtn = document.getElementById('bm-add');
const hintEl = document.getElementById('bm-hint');
const listEl = document.getElementById('bm-list');

function showHint(text) { hintEl.textContent = text; }

function clearList() {
    listEl.innerHTML = '';
}

function renderSnapshot(snap) {
    listEl.innerHTML = '';
    if (snap.empty) {
        listEl.innerHTML = '<div class="muted">Пусто</div>';
        return;
    }
    snap.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;

        const item = document.createElement('div');
        item.className = 'bm-item';

        const left = document.createElement('div');
        left.className = 'bm-left';

        const a = document.createElement('a');
        a.href = data.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = data.title || data.url;

        const meta = document.createElement('div');
        meta.className = 'bm-meta';
        const urlText = document.createElement('div');
        urlText.textContent = data.url;
        meta.appendChild(urlText);

        left.appendChild(a);
        left.appendChild(meta);

        const del = document.createElement('button');
        del.className = 'bm-delete';
        del.innerHTML = 'Удалить';
        del.addEventListener('click', async () => {
            if (!currentUid) return;
            try {
                await deleteDoc(doc(db, 'users', currentUid, 'bookmarks', id));
            } catch (e) { console.error(e); }
        });

        item.appendChild(left);
        item.appendChild(del);
        listEl.appendChild(item);
    });
}

async function startForUser(uid) {
    if (!uid) return;
    if (unsubscribe) unsubscribe();
    const q = query(collection(db, 'users', uid, 'bookmarks'), orderBy('createdAt', 'desc'));
    unsubscribe = onSnapshot(q, (snap) => {
        renderSnapshot(snap);
    }, (err) => console.error('Bookmarks snapshot error', err));
}

function stopForUser() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    clearList();
}

addBtn.addEventListener('click', async () => {
    const title = (titleInput.value || '').trim();
    let url = (urlInput.value || '').trim();
    if (!currentUid) {
        // ask to login via modal
        if (typeof window.openAuthModal === 'function') window.openAuthModal(document.getElementById('profile-container'));
        return;
    }
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
        await addDoc(collection(db, 'users', currentUid, 'bookmarks'), {
            title: title || url,
            url,
            createdAt: serverTimestamp()
        });
        titleInput.value = '';
        urlInput.value = '';
    } catch (e) {
        console.error('Add bookmark error', e);
    }
});

// React to auth changes dispatched by auth-widget.js
window.addEventListener('authChanged', (e) => {
    const user = e.detail.user;
    currentUid = user ? user.uid : null;
    if (user) {
        showHint('Вы авторизованы — закладки сохраняются в облако.');
        startForUser(currentUid);
    } else {
        showHint('Войдите, чтобы сохранять закладки в облако.');
        stopForUser();
    }
});

// Init with any already-present user
if (window.currentUser) {
    currentUid = window.currentUser.uid;
    showHint('Вы авторизованы — закладки сохраняются в облако.');
    startForUser(currentUid);
} else {
    showHint('Войдите, чтобы сохранять закладки в облако.');
}
