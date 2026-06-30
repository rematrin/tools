// invoices.js - Fakturoid Redesign Controller (Czech language version with drag & drop)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    deleteDoc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDBNCQo3rYgmDZkZrGKT-g2t0LlpsfH1Pg",
    authDomain: "tools-c98fd.firebaseapp.com",
    projectId: "tools-c98fd",
    storageBucket: "tools-c98fd.firebasestorage.app",
    messagingSenderId: "595986762798",
    appId: "1:595986762798:web:b8c05cddcb0f3a610163bf",
    measurementId: "G-X3Z1KH8760"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- APP STATE ---
let currentInvoiceId = null;
let currentInvoice = {
    invoiceNumber: "",
    status: "draft",
    createdDate: new Date().toISOString().substring(0, 10),
    dueDate: "",
    splatnostDays: 14,
    paymentMethod: "bank",
    currency: "CZK",
    templateId: "minimalist",
    sender: { name: "", taxId: "", bankDetails: "" },
    client: { name: "", email: "", phone: "", address: "", taxId: "" },
    items: [{ description: "Služby", quantity: 1, unit: "ks", price: 0, taxRate: 0 }],
    discount: 0,
    notes: "Fyzická osoba zapsaná v živnostenském rejstříku."
};

let savedClients = [];
let dbInvoices = [];
let zoomLevel = 1.0;
let defaultSenderSettings = null;

const currencySymbols = {
    USD: "$",
    EUR: "€",
    RUB: "₽",
    CZK: "Kč",
    KZT: "₸",
    UAH: "₴"
};

// --- DOM ELEMENTS ---
const screenList = document.getElementById("screenList");
const screenEdit = document.getElementById("screenEdit");
const screenClients = document.getElementById("screenClients");

const navLinkInvoices = document.getElementById("navLinkInvoices");
const navLinkClients = document.getElementById("navLinkClients");

const invoicesListTableBody = document.getElementById("invoicesListTableBody");
const clientsListTableBody = document.getElementById("clientsListTableBody");

const clientName = document.getElementById("clientName");
const clientEmail = document.getElementById("clientEmail");
const clientAddress = document.getElementById("clientAddress");
const clientTaxId = document.getElementById("clientTaxId");
const clientsAutocompleteDropdown = document.getElementById("clientsAutocompleteDropdown");

const invoiceNumberText = document.getElementById("invoiceNumberText");
const btnChangeInvoiceNumber = document.getElementById("btnChangeInvoiceNumber");
const invoiceNumberInput = document.getElementById("invoiceNumberInput");

const createdDate = document.getElementById("createdDate");
const selectSplatnost = document.getElementById("selectSplatnost");
const customSplatnostDays = document.getElementById("customSplatnostDays");
const computedDueDateText = document.getElementById("computedDueDateText");

const paymentMethodGroup = document.getElementById("paymentMethodGroup");
const selectCurrency = document.getElementById("selectCurrency");
const invoiceStatus = document.getElementById("invoiceStatus");

const senderName = document.getElementById("senderName");
const senderBankDetails = document.getElementById("senderBankDetails");
const senderTaxId = document.getElementById("senderTaxId");

const selectTemplate = document.getElementById("selectTemplate");
const invoiceNotes = document.getElementById("invoiceNotes");

const btnToggleMoreOptions = document.getElementById("btnToggleMoreOptions");
const moreOptionsContent = document.getElementById("moreOptionsContent");

const itemsEditorRows = document.getElementById("itemsEditorRows");
const btnAddItemRow = document.getElementById("btnAddItemRow");
const btnToggleDiscount = document.getElementById("btnToggleDiscount");
const discountFormRow = document.getElementById("discountFormRow");
const discountAmount = document.getElementById("discountAmount");

const totalPriceVal = document.getElementById("totalPriceVal");

const btnSaveAsConcept = document.getElementById("btnSaveAsConcept");
const btnShowLivePreview = document.getElementById("btnShowLivePreview");
const btnCreateInvoice = document.getElementById("btnCreateInvoice");

const previewModalOverlay = document.getElementById("previewModalOverlay");
const btnClosePreviewModal = document.getElementById("btnClosePreviewModal");
const previewCanvas = document.getElementById("previewCanvas");
const btnPrintModal = document.getElementById("btnPrintModal");

const clientModalOverlay = document.getElementById("clientModalOverlay");
const btnCloseClientModal = document.getElementById("btnCloseClientModal");
const btnSaveClientModal = document.getElementById("btnSaveClientModal");
const btnAddNewClientPopup = document.getElementById("btnAddNewClientPopup");
const btnNewClientModal = document.getElementById("btnNewClientModal");

const saveStatus = document.getElementById("saveStatus");

// --- INITIALIZATION ---
function init() {
    setupEventListeners();
    setupRouting();
    
    // Auth Listener
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            updateSaveStatus("Synchronizace...");
            document.getElementById("userDisplayName").textContent = user.displayName || "Profil";
            if (user.photoURL) document.getElementById("userAvatar").src = user.photoURL;

            await loadDefaultSenderSettings();
            await loadSavedClients();
            await loadInvoicesList();
            
            updateSaveStatus("Cloud připojen");
            handleRoute(window.location.hash);
        } else {
            document.getElementById("userDisplayName").textContent = "Přihlásit se";
            document.getElementById("userAvatar").src = "https://i.ibb.co/Z6vRKK9x/0000000.jpg";
            updateSaveStatus("Lokální režim");
        }
    });
}

// --- ROUTING ---
function setupRouting() {
    window.addEventListener("hashchange", () => {
        handleRoute(window.location.hash);
    });

    // Default route
    if (!window.location.hash) {
        window.location.hash = "#/list";
    }
}

function handleRoute(hash) {
    // Clear active states
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    navLinkInvoices.classList.remove("active");
    navLinkClients.classList.remove("active");

    if (hash === "#/new") {
        resetInvoiceForm();
        document.getElementById("editorTitle").textContent = "Nová faktura";
        document.getElementById("btnCreateInvoice").textContent = "Vytvořit fakturu";
        screenEdit.classList.add("active");
        navLinkInvoices.classList.add("active");
    } 
    else if (hash.startsWith("#/edit/")) {
        const id = hash.replace("#/edit/", "");
        loadInvoiceToEditor(id);
        document.getElementById("editorTitle").textContent = "Upravit fakturu";
        document.getElementById("btnCreateInvoice").textContent = "Uložit změny";
        screenEdit.classList.add("active");
        navLinkInvoices.classList.add("active");
    } 
    else if (hash === "#/clients") {
        renderClientsList();
        screenClients.classList.add("active");
        navLinkClients.classList.add("active");
    } 
    else {
        // Default to list
        renderInvoicesList();
        screenList.classList.add("active");
        navLinkInvoices.classList.add("active");
    }
}

// --- EVENTS ---
function setupEventListeners() {
    // Menu trigger
    const btnNavMenu = document.getElementById("btnNavMenu");
    if (btnNavMenu && window.openNavModal) {
        btnNavMenu.addEventListener("click", () => window.openNavModal(btnNavMenu));
    }

    // Profile Trigger
    document.getElementById("userProfileTrigger").addEventListener("click", () => {
        const authOverlay = document.getElementById("authOverlay");
        if (authOverlay) authOverlay.classList.add("open");
    });

    // Splatnost calculations
    createdDate.addEventListener("change", recomputeDueDate);
    selectSplatnost.addEventListener("change", () => {
        if (selectSplatnost.value === "custom") {
            customSplatnostDays.style.display = "inline-block";
        } else {
            customSplatnostDays.style.display = "none";
            currentInvoice.splatnostDays = parseInt(selectSplatnost.value);
        }
        recomputeDueDate();
    });
    customSplatnostDays.addEventListener("input", () => {
        currentInvoice.splatnostDays = parseInt(customSplatnostDays.value) || 0;
        recomputeDueDate();
    });

    // Payment methods
    paymentMethodGroup.querySelectorAll(".pm-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            paymentMethodGroup.querySelectorAll(".pm-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentInvoice.paymentMethod = btn.getAttribute("data-method");
        });
    });

    // Inline Invoice number editing
    btnChangeInvoiceNumber.addEventListener("click", () => {
        invoiceNumberInput.value = currentInvoice.invoiceNumber;
        invoiceNumberInput.style.display = "inline-block";
        invoiceNumberText.style.display = "none";
        btnChangeInvoiceNumber.style.display = "none";
        invoiceNumberInput.focus();
    });

    invoiceNumberInput.addEventListener("blur", () => {
        currentInvoice.invoiceNumber = invoiceNumberInput.value.trim() || currentInvoice.invoiceNumber;
        invoiceNumberText.textContent = currentInvoice.invoiceNumber;
        invoiceNumberInput.style.display = "none";
        invoiceNumberText.style.display = "inline-block";
        btnChangeInvoiceNumber.style.display = "inline-block";
    });

    // More options toggle
    btnToggleMoreOptions.addEventListener("click", () => {
        const isOpen = moreOptionsContent.style.display === "block";
        moreOptionsContent.style.display = isOpen ? "none" : "block";
    });

    // Add item row
    btnAddItemRow.addEventListener("click", () => {
        syncItemsFromDOM();
        currentInvoice.items.push({ description: "", quantity: 1, unit: "ks", price: 0, taxRate: 0 });
        renderItemsEditorRows();
        recomputeTotals();
    });

    // Discount toggle
    btnToggleDiscount.addEventListener("click", () => {
        const isHidden = discountFormRow.style.display === "none";
        discountFormRow.style.display = isHidden ? "flex" : "none";
    });

    discountAmount.addEventListener("input", (e) => {
        currentInvoice.discount = parseFloat(e.target.value) || 0;
        recomputeTotals();
    });

    // Select currency
    selectCurrency.addEventListener("change", (e) => {
        currentInvoice.currency = e.target.value;
        recomputeTotals();
    });

    // Search filter
    document.getElementById("invoiceSearch").addEventListener("input", renderInvoicesList);

    // Save and actions
    btnCreateInvoice.addEventListener("click", saveInvoiceToDb);
    btnSaveAsConcept.addEventListener("click", async () => {
        currentInvoice.status = "draft";
        await saveInvoiceToDb();
    });

    // Preview
    btnShowLivePreview.addEventListener("click", () => {
        syncStateFromForm();
        renderPreviewSheet();
        previewModalOverlay.classList.add("open");
    });

    btnClosePreviewModal.addEventListener("click", () => previewModalOverlay.classList.remove("open"));
    btnPrintModal.addEventListener("click", () => window.print());

    // Zoom
    document.getElementById("btnZoomIn").addEventListener("click", () => adjustZoom(0.1));
    document.getElementById("btnZoomOut").addEventListener("click", () => adjustZoom(-0.1));

    // Client modal
    btnAddNewClientPopup.addEventListener("click", () => openClientModal());
    btnNewClientModal.addEventListener("click", () => openClientModal());
    btnCloseClientModal.addEventListener("click", () => clientModalOverlay.classList.remove("open"));
    btnSaveClientModal.addEventListener("click", saveClientModalAction);

    // Client Autocomplete search
    clientName.addEventListener("input", handleClientAutocomplete);
    document.addEventListener("click", (e) => {
        if (!clientName.contains(e.target) && !clientsAutocompleteDropdown.contains(e.target)) {
            clientsAutocompleteDropdown.classList.remove("open");
        }
    });

    // Sync other form fields to state on change
    const syncField = (el, key, nested = false, parent = "") => {
        el.addEventListener("change", () => {
            if (nested) currentInvoice[parent][key] = el.value;
            else currentInvoice[key] = el.value;
        });
    };
    syncField(createdDate, "createdDate");
    syncField(invoiceStatus, "status");
    syncField(senderName, "name", true, "sender");
    syncField(senderBankDetails, "bankDetails", true, "sender");
    syncField(senderTaxId, "taxId", true, "sender");
    syncField(clientEmail, "email", true, "client");
    syncField(clientAddress, "address", true, "client");
    syncField(clientTaxId, "taxId", true, "client");
    syncField(selectTemplate, "templateId");
    syncField(invoiceNotes, "notes");
}

// --- STATE SYNCING ---
function syncStateFromForm() {
    currentInvoice.createdDate = createdDate.value;
    currentInvoice.status = invoiceStatus.value;
    currentInvoice.currency = selectCurrency.value;
    currentInvoice.templateId = selectTemplate.value;
    currentInvoice.notes = invoiceNotes.value;

    currentInvoice.sender.name = senderName.value;
    currentInvoice.sender.bankDetails = senderBankDetails.value;
    currentInvoice.sender.taxId = senderTaxId.value;

    currentInvoice.client.name = clientName.value;
    currentInvoice.client.email = clientEmail.value;
    currentInvoice.client.address = clientAddress.value;
    currentInvoice.client.taxId = clientTaxId.value;
    currentInvoice.discount = parseFloat(discountAmount.value) || 0;
    
    syncItemsFromDOM();
}

function syncItemsFromDOM() {
    const rows = itemsEditorRows.querySelectorAll(".item-row");
    rows.forEach((row, idx) => {
        if (currentInvoice.items[idx]) {
            const desc = row.querySelector(".item-desc-input").value;
            const qty = parseFloat(row.querySelector(".item-qty-input").value) || 0;
            const unit = row.querySelector(".item-unit-input").value;
            const price = parseFloat(row.querySelector(".item-price-input").value) || 0;
            const tax = parseFloat(row.querySelector(".item-tax-input").value) || 0;
            
            currentInvoice.items[idx].description = desc;
            currentInvoice.items[idx].quantity = qty;
            currentInvoice.items[idx].unit = unit;
            currentInvoice.items[idx].price = price;
            currentInvoice.items[idx].taxRate = tax;
        }
    });
}

function resetInvoiceForm() {
    currentInvoiceId = null;
    const dateStr = new Date().toISOString().substring(0, 10);
    
    currentInvoice = {
        invoiceNumber: "",
        status: "draft",
        createdDate: dateStr,
        dueDate: "",
        splatnostDays: 14,
        paymentMethod: "bank",
        currency: "CZK",
        templateId: "minimalist",
        sender: defaultSenderSettings ? { ...defaultSenderSettings } : { name: "", taxId: "", bankDetails: "" },
        client: { name: "", email: "", phone: "", address: "", taxId: "" },
        items: [{ description: "Služby", quantity: 1, unit: "ks", price: 0, taxRate: 0 }],
        discount: 0,
        notes: "Fyzická osoba zapsaná v živnostenském rejstříku."
    };

    invoiceNumberInput.value = "";
    generateInvoiceNumber();
    fillFormFields();
    recomputeDueDate();
}

function fillFormFields() {
    createdDate.value = currentInvoice.createdDate;
    invoiceStatus.value = currentInvoice.status;
    selectCurrency.value = currentInvoice.currency;
    selectTemplate.value = currentInvoice.templateId;
    invoiceNotes.value = currentInvoice.notes;

    senderName.value = currentInvoice.sender.name || "";
    senderBankDetails.value = currentInvoice.sender.bankDetails || "";
    senderTaxId.value = currentInvoice.sender.taxId || "";

    clientName.value = currentInvoice.client.name || "";
    clientEmail.value = currentInvoice.client.email || "";
    clientAddress.value = currentInvoice.client.address || "";
    clientTaxId.value = currentInvoice.client.taxId || "";
    
    discountAmount.value = currentInvoice.discount;
    discountFormRow.style.display = currentInvoice.discount > 0 ? "flex" : "none";

    // Set Splatnost UI
    if ([7, 14, 30].includes(currentInvoice.splatnostDays)) {
        selectSplatnost.value = currentInvoice.splatnostDays.toString();
        customSplatnostDays.style.display = "none";
    } else {
        selectSplatnost.value = "custom";
        customSplatnostDays.style.display = "inline-block";
        customSplatnostDays.value = currentInvoice.splatnostDays;
    }

    // Set Payment Method UI
    paymentMethodGroup.querySelectorAll(".pm-btn").forEach(btn => {
        if (btn.getAttribute("data-method") === currentInvoice.paymentMethod) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    renderItemsEditorRows();
    recomputeTotals();
}

// Generate unique invoice number
function generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    currentInvoice.invoiceNumber = `${year}-${rand}`;
    invoiceNumberText.textContent = currentInvoice.invoiceNumber;
}

// Recompute splatnost
function recomputeDueDate() {
    const issueDate = new Date(createdDate.value || Date.now());
    const days = currentInvoice.splatnostDays;
    const dueDateObj = new Date(issueDate.getTime() + days * 24 * 60 * 60 * 1000);
    
    currentInvoice.dueDate = dueDateObj.toISOString().substring(0, 10);
    
    const formatted = dueDateObj.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
    computedDueDateText.textContent = `(vychází na ${formatted})`;
}

// Items List Rendering with DRAG & DROP
function renderItemsEditorRows() {
    itemsEditorRows.innerHTML = "";
    
    currentInvoice.items.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "item-row";
        row.setAttribute("draggable", "true");
        
        row.innerHTML = `
            <div class="row-drag-handle">&#9776;</div>
            <div class="col-desc">
                <input type="text" class="item-desc-input" value="${escapeHtml(item.description)}" placeholder="Popis položky">
            </div>
            <div class="col-qty">
                <input type="number" class="item-qty-input" value="${item.quantity}" min="0.01" step="any">
            </div>
            <div class="col-unit">
                <input type="text" class="item-unit-input" value="${escapeHtml(item.unit)}" placeholder="ks">
            </div>
            <div class="col-price">
                <input type="number" class="item-price-input" value="${item.price}" min="0" step="any">
            </div>
            <div class="col-tax">
                <input type="number" class="item-tax-input" value="${item.taxRate}" min="0" max="100">
            </div>
            <div class="col-delete">
                <button class="btn-delete-row-faktura" title="Odstranit">&times;</button>
            </div>
        `;

        const descInp = row.querySelector(".item-desc-input");
        const qtyInp = row.querySelector(".item-qty-input");
        const unitInp = row.querySelector(".item-unit-input");
        const priceInp = row.querySelector(".item-price-input");
        const taxInp = row.querySelector(".item-tax-input");
        const delBtn = row.querySelector(".btn-delete-row-faktura");

        descInp.addEventListener("input", (e) => {
            currentInvoice.items[index].description = e.target.value;
        });
        qtyInp.addEventListener("input", (e) => {
            currentInvoice.items[index].quantity = parseFloat(e.target.value) || 0;
            recomputeTotals();
        });
        unitInp.addEventListener("input", (e) => {
            currentInvoice.items[index].unit = e.target.value;
        });
        priceInp.addEventListener("input", (e) => {
            currentInvoice.items[index].price = parseFloat(e.target.value) || 0;
            recomputeTotals();
        });
        taxInp.addEventListener("input", (e) => {
            currentInvoice.items[index].taxRate = parseFloat(e.target.value) || 0;
            recomputeTotals();
        });

        delBtn.addEventListener("click", () => {
            syncItemsFromDOM();
            currentInvoice.items.splice(index, 1);
            renderItemsEditorRows();
            recomputeTotals();
        });

        // DRAG AND DROP HANDLERS
        row.addEventListener("dragstart", (e) => {
            syncItemsFromDOM();
            e.dataTransfer.setData("text/plain", index);
            row.classList.add("dragging");
        });

        row.addEventListener("dragover", (e) => {
            e.preventDefault();
        });

        row.addEventListener("drop", (e) => {
            e.preventDefault();
            const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
            const toIndex = index;
            if (!isNaN(fromIndex) && fromIndex !== toIndex) {
                const moved = currentInvoice.items.splice(fromIndex, 1)[0];
                currentInvoice.items.splice(toIndex, 0, moved);
                renderItemsEditorRows();
                recomputeTotals();
            }
        });

        row.addEventListener("dragend", () => {
            row.classList.remove("dragging");
        });

        itemsEditorRows.appendChild(row);
    });
}

function recomputeTotals() {
    let subtotal = 0;
    currentInvoice.items.forEach(item => {
        subtotal += (item.quantity * item.price);
    });
    const discount = currentInvoice.discount || 0;
    const finalTotal = Math.max(0, subtotal - discount);

    const currencySym = currencySymbols[currentInvoice.currency] || currentInvoice.currency;
    totalPriceVal.textContent = `${finalTotal.toFixed(2)} ${currencySym}`;
}

// --- CLIENT AUTOCOMPLETE ---
function handleClientAutocomplete() {
    const val = clientName.value.trim().toLowerCase();
    if (!val) {
        clientsAutocompleteDropdown.classList.remove("open");
        return;
    }

    const filtered = savedClients.filter(c => c.name.toLowerCase().includes(val));
    if (filtered.length === 0) {
        clientsAutocompleteDropdown.classList.remove("open");
        return;
    }

    clientsAutocompleteDropdown.innerHTML = filtered.map(c => `
        <div class="autocomplete-item" data-id="${c.id}">${escapeHtml(c.name)}</div>
    `).join("");
    clientsAutocompleteDropdown.classList.add("open");

    clientsAutocompleteDropdown.querySelectorAll(".autocomplete-item").forEach(item => {
        item.addEventListener("click", () => {
            const client = savedClients.find(c => c.id === item.getAttribute("data-id"));
            if (client) {
                clientName.value = client.name;
                clientEmail.value = client.email || "";
                clientAddress.value = client.address || "";
                clientTaxId.value = client.taxId || "";
            }
            clientsAutocompleteDropdown.classList.remove("open");
        });
    });
}

// --- SAVE OPERATIONS ---
async function saveInvoiceToDb() {
    syncStateFromForm();
    if (!currentInvoice.client.name) {
        alert("Vyberte prosím odběratele");
        return;
    }

    if (!auth.currentUser) {
        alert("Přihlaste se pro synchronizaci s cloudem");
        return;
    }

    try {
        updateSaveStatus("Ukládání...");
        
        // Save/Update client reference if new
        const clientId = currentInvoice.client.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const clientRef = doc(db, "users", auth.currentUser.uid, "invoice_clients", clientId);
        await setDoc(clientRef, {
            id: clientId,
            name: currentInvoice.client.name,
            email: currentInvoice.client.email || "",
            address: currentInvoice.client.address || "",
            taxId: currentInvoice.client.taxId || "",
            updatedAt: serverTimestamp()
        }, { merge: true });

        // Save Invoice details
        const invoiceId = currentInvoiceId || currentInvoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const invoiceRef = doc(db, "users", auth.currentUser.uid, "invoices", invoiceId);
        
        await setDoc(invoiceRef, {
            ...currentInvoice,
            id: invoiceId,
            updatedAt: serverTimestamp()
        });

        // Save Sender settings as default
        if (currentInvoice.sender.name) {
            const settingsRef = doc(db, "users", auth.currentUser.uid, "invoice_settings", "default");
            await setDoc(settingsRef, {
                defaultSender: { ...currentInvoice.sender },
                defaultCurrency: currentInvoice.currency,
                defaultTemplateId: currentInvoice.templateId,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }

        updateSaveStatus("Změny uloženy");
        await loadInvoicesList();
        await loadSavedClients();

        // Redirect to list
        window.location.hash = "#/list";
    } catch (e) {
        console.error(e);
        updateSaveStatus("Chyba při ukládání");
    }
}

// --- RENDER SCREENS ---
function renderInvoicesList() {
    invoicesListTableBody.innerHTML = "";
    
    const searchVal = document.getElementById("invoiceSearch").value.toLowerCase();
    const filtered = dbInvoices.filter(inv => {
        const num = (inv.invoiceNumber || "").toLowerCase();
        const name = (inv.client?.name || "").toLowerCase();
        return num.includes(searchVal) || name.includes(searchVal);
    });

    if (filtered.length === 0) {
        invoicesListTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:30px;">Faktury nebyly nalezeny. Klikněte na "+" pro vytvoření nové.</td></tr>`;
        return;
    }

    filtered.forEach(inv => {
        let subtotal = 0;
        (inv.items || []).forEach(item => {
            subtotal += (item.quantity || 0) * (item.price || 0);
        });
        const disc = parseFloat(inv.discount) || 0;
        const total = Math.max(0, subtotal - disc);
        const symbol = currencySymbols[inv.currency] || inv.currency;
        const formattedDate = inv.createdDate ? inv.createdDate.split("-").reverse().join(".") : "—";
        const formattedDueDate = inv.dueDate ? inv.dueDate.split("-").reverse().join(".") : "—";

        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.innerHTML = `
            <td><strong>№ ${escapeHtml(inv.invoiceNumber)}</strong></td>
            <td>${escapeHtml(inv.client?.name || "Nezadáno")}</td>
            <td>${formattedDate}</td>
            <td>${formattedDueDate}</td>
            <td><strong>${total.toFixed(2)} ${symbol}</strong></td>
            <td><span class="status-tag ${inv.status || 'draft'}">${translateStatus(inv.status)}</span></td>
        `;

        tr.addEventListener("click", () => {
            window.location.hash = `#/edit/${inv.id}`;
        });

        invoicesListTableBody.appendChild(tr);
    });
}

function loadInvoiceToEditor(id) {
    const inv = dbInvoices.find(i => i.id === id);
    if (inv) {
        currentInvoiceId = id;
        currentInvoice = { ...inv };
        fillFormFields();
        recomputeDueDate();
    } else {
        window.location.hash = "#/list";
    }
}

// Clients list screen
function renderClientsList() {
    clientsListTableBody.innerHTML = "";
    if (savedClients.length === 0) {
        clientsListTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:30px;">Žádné kontakty nebyly nalezeny.</td></tr>`;
        return;
    }

    savedClients.forEach(client => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${escapeHtml(client.name)}</strong></td>
            <td>${escapeHtml(client.email || "—")}</td>
            <td>${escapeHtml(client.phone || "—")}</td>
            <td>${escapeHtml(client.address || "—")}</td>
            <td>${escapeHtml(client.taxId || "—")}</td>
            <td><button class="btn-small-link text-delete" data-id="${client.id}">Odstranit</button></td>
        `;

        tr.querySelector(".text-delete").addEventListener("click", async (e) => {
            e.stopPropagation();
            if (confirm(`Opravdu chcete smazat kontakt "${client.name}"?`)) {
                await deleteClientFromDb(client.id);
            }
        });

        clientsListTableBody.appendChild(tr);
    });
}

async function deleteClientFromDb(id) {
    if (!auth.currentUser) return;
    try {
        await deleteDoc(doc(db, "users", auth.currentUser.uid, "invoice_clients", id));
        await loadSavedClients();
        renderClientsList();
    } catch (e) {
        console.error(e);
    }
}

// Client popups
function openClientModal() {
    document.getElementById("modalClientName").value = "";
    document.getElementById("modalClientEmail").value = "";
    document.getElementById("modalClientPhone").value = "";
    document.getElementById("modalClientAddress").value = "";
    document.getElementById("modalClientTaxId").value = "";
    
    clientModalOverlay.classList.add("open");
}

async function saveClientModalAction() {
    const name = document.getElementById("modalClientName").value.trim();
    if (!name) {
        alert("Zadejte prosím název firmy nebo jméno");
        return;
    }

    if (!auth.currentUser) return;

    try {
        const clientId = name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const clientRef = doc(db, "users", auth.currentUser.uid, "invoice_clients", clientId);
        
        await setDoc(clientRef, {
            id: clientId,
            name: name,
            email: document.getElementById("modalClientEmail").value.trim(),
            phone: document.getElementById("modalClientPhone").value.trim(),
            address: document.getElementById("modalClientAddress").value.trim(),
            taxId: document.getElementById("modalClientTaxId").value.trim(),
            updatedAt: serverTimestamp()
        });

        clientModalOverlay.classList.remove("open");
        await loadSavedClients();
        
        // Auto-select if in editor
        if (screenEdit.classList.contains("active")) {
            clientName.value = name;
            clientEmail.value = document.getElementById("modalClientEmail").value.trim();
            clientAddress.value = document.getElementById("modalClientAddress").value.trim();
            clientTaxId.value = document.getElementById("modalClientTaxId").value.trim();
            syncStateFromForm();
        } else {
            renderClientsList();
        }
    } catch (e) {
        console.error(e);
    }
}

// --- ZOOM PREVIEW ---
function adjustZoom(factor) {
    zoomLevel = Math.max(0.5, Math.min(1.5, zoomLevel + factor));
    previewCanvas.style.transform = `scale(${zoomLevel})`;
    document.getElementById("zoomLevel").textContent = `${Math.round(zoomLevel * 100)}%`;
}

// --- PREVIEW RENDERING ---
function renderPreviewSheet() {
    const data = currentInvoice;
    const totals = calculateTotals();
    const currencySym = currencySymbols[data.currency] || data.currency;

    let invoiceHtml = "";

    if (data.templateId === "minimalist") {
        invoiceHtml = renderMinimalistTemplate(data, totals, currencySym);
    } else if (data.templateId === "corporate") {
        invoiceHtml = renderCorporateTemplate(data, totals, currencySym);
    } else if (data.templateId === "creative") {
        invoiceHtml = renderCreativeTemplate(data, totals, currencySym);
    }

    previewCanvas.innerHTML = invoiceHtml;
}

// --- DATABASE LOADS ---
async function loadDefaultSenderSettings() {
    if (!auth.currentUser) return;
    try {
        const settingsRef = doc(db, "users", auth.currentUser.uid, "invoice_settings", "default");
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
            const data = snap.data();
            if (data.defaultSender) {
                defaultSenderSettings = data.defaultSender;
                if (!currentInvoiceId && !currentInvoice.sender.name) {
                    currentInvoice.sender = { ...defaultSenderSettings };
                    currentInvoice.currency = data.defaultCurrency || currentInvoice.currency;
                    currentInvoice.templateId = data.defaultTemplateId || currentInvoice.templateId;
                    fillFormFields();
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function loadSavedClients() {
    if (!auth.currentUser) return;
    try {
        const clientsRef = collection(db, "users", auth.currentUser.uid, "invoice_clients");
        const snap = await getDocs(clientsRef);
        savedClients = [];
        snap.forEach(docSnap => {
            savedClients.push(docSnap.data());
        });
    } catch (e) {
        console.error(e);
    }
}

async function loadInvoicesList() {
    if (!auth.currentUser) return;
    try {
        const invoicesRef = collection(db, "users", auth.currentUser.uid, "invoices");
        const q = query(invoicesRef, orderBy("updatedAt", "desc"));
        const snap = await getDocs(q);
        
        dbInvoices = [];
        snap.forEach(docSnap => {
            dbInvoices.push(docSnap.data());
        });
    } catch (e) {
        console.error(e);
    }
}

// --- CALCULATIONS ---
function calculateTotals() {
    let subtotal = 0;
    let totalTax = 0;

    currentInvoice.items.forEach(item => {
        const lineTotal = item.quantity * item.price;
        subtotal += lineTotal;
        totalTax += lineTotal * (item.taxRate / 100);
    });

    const discount = parseFloat(currentInvoice.discount) || 0;
    const total = Math.max(0, subtotal + totalTax - discount);

    return {
        subtotal,
        totalTax,
        discount,
        total
    };
}

// --- PRINT LAYOUT TEMPLATES ---
function renderMinimalistTemplate(data, totals, symbol) {
    const formatDate = (d) => d ? d.split("-").reverse().join(".") : "";
    return `
        <div class="template-minimalist" style="font-family: 'Inter', sans-serif; color: #1e293b; line-height: 1.5; text-align: left;">
            <style>
                .t-mini-header { display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 25px; margin-bottom: 30px; }
                .t-mini-logo { font-size: 24px; font-weight: 700; color: #0f172a; font-family: 'Outfit', sans-serif; }
                .t-mini-title { font-size: 28px; font-weight: 300; text-transform: uppercase; letter-spacing: 1px; color: #475569; }
                .t-mini-meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
                .t-mini-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 5px; }
                .t-mini-val { font-size: 13px; color: #1e293b; font-weight: 500; white-space: pre-line; }
                .t-mini-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                .t-mini-table th { text-align: left; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
                .t-mini-table td { padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .t-mini-summary-container { display: flex; justify-content: flex-end; margin-bottom: 40px; }
                .t-mini-summary-table { width: 250px; border-collapse: collapse; }
                .t-mini-summary-table td { padding: 6px 0; font-size: 13px; }
                .t-mini-total-row td { border-top: 2px solid #0f172a; padding-top: 10px; font-weight: 700; font-size: 16px; color: #0f172a; }
                .t-mini-notes { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #64748b; }
            </style>
            
            <div class="t-mini-header">
                <div>
                    <div class="t-mini-logo">${escapeHtml(data.sender.name || "DODAVATEL")}</div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 5px;">IČO: ${escapeHtml(data.sender.taxId || "—")}</div>
                </div>
                <div style="text-align: right;">
                    <div class="t-mini-title">Faktura</div>
                    <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 5px;">č. ${escapeHtml(data.invoiceNumber)}</div>
                </div>
            </div>

            <div class="t-mini-meta-grid">
                <div>
                    <div class="t-mini-label">Odběratel:</div>
                    <div class="t-mini-val" style="font-weight: 700;">${escapeHtml(data.client.name || "—")}</div>
                    <div class="t-mini-val">${escapeHtml(data.client.email || "")}</div>
                    <div class="t-mini-val">${escapeHtml(data.client.address || "")}</div>
                    ${data.client.taxId ? `<div class="t-mini-val">IČO: ${escapeHtml(data.client.taxId)}</div>` : ''}
                </div>
                <div>
                    <div class="t-mini-label">Datum vystavení:</div>
                    <div class="t-mini-val">${formatDate(data.createdDate)}</div>
                    <div class="t-mini-label" style="margin-top: 15px;">Splatnost:</div>
                    <div class="t-mini-val" style="font-weight: 700; color: #ef4444;">${formatDate(data.dueDate)}</div>
                </div>
                <div>
                    <div class="t-mini-label">Platební metoda:</div>
                    <div class="t-mini-val" style="text-transform: uppercase;">${escapeHtml(data.paymentMethod)}</div>
                </div>
            </div>

            <table class="t-mini-table">
                <thead>
                    <tr>
                        <th style="width: 50%;">Popis</th>
                        <th style="width: 15%; text-align: center;">Množství</th>
                        <th style="width: 15%; text-align: right;">Cena</th>
                        <th style="width: 20%; text-align: right;">Celkem</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.items.map(item => `
                        <tr>
                            <td>
                                <div>${escapeHtml(item.description || "Položka bez popisu")}</div>
                                ${item.taxRate > 0 ? `<span style="font-size: 10px; color: #94a3b8; background: #f8fafc; padding: 2px 5px; border-radius: 3px;">DPH ${item.taxRate}%</span>` : ''}
                            </td>
                            <td style="text-align: center;">${item.quantity} ${escapeHtml(item.unit || "ks")}</td>
                            <td style="text-align: right;">${item.price.toFixed(2)} ${symbol}</td>
                            <td style="text-align: right; font-weight: 600;">${(item.quantity * item.price).toFixed(2)} ${symbol}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="t-mini-summary-container">
                <table class="t-mini-summary-table">
                    <tr>
                        <td style="color: #64748b;">Mezisoučet:</td>
                        <td style="text-align: right; font-weight: 500;">${totals.subtotal.toFixed(2)} ${symbol}</td>
                    </tr>
                    ${totals.totalTax > 0 ? `
                    <tr>
                        <td style="color: #64748b;">DPH celkem:</td>
                        <td style="text-align: right; font-weight: 500;">${totals.totalTax.toFixed(2)} ${symbol}</td>
                    </tr>
                    ` : ''}
                    ${totals.discount > 0 ? `
                    <tr>
                        <td style="color: #64748b;">Sleva:</td>
                        <td style="text-align: right; color: #ef4444;">-${totals.discount.toFixed(2)} ${symbol}</td>
                    </tr>
                    ` : ''}
                    <tr class="t-mini-total-row">
                        <td>Celkem k úhradě:</td>
                        <td style="text-align: right;">${totals.total.toFixed(2)} ${symbol}</td>
                    </tr>
                </table>
            </div>

            ${data.sender.bankDetails ? `
                <div style="margin-bottom: 30px;">
                    <div class="t-mini-label">Platební údaje / IBAN:</div>
                    <div class="t-mini-val" style="background: #f8fafc; padding: 12px; border-radius: 6px; font-size: 12px; border: 1px dashed #e2e8f0;">${escapeHtml(data.sender.bankDetails)}</div>
                </div>
            ` : ''}

            ${data.notes ? `
                <div class="t-mini-notes">
                    <div class="t-mini-label">Patička:</div>
                    <div>${escapeHtml(data.notes)}</div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderCorporateTemplate(data, totals, symbol) {
    const formatDate = (d) => d ? d.split("-").reverse().join(".") : "";
    return `
        <div class="template-corporate" style="font-family: 'Inter', sans-serif; color: #2d3748; line-height: 1.5; text-align: left;">
            <style>
                .t-corp-header { background: #1a365d; color: #ffffff; padding: 30px; margin: -50px -50px 30px -50px; display: flex; justify-content: space-between; align-items: center; }
                .t-corp-brand { font-size: 26px; font-weight: 800; font-family: 'Outfit', sans-serif; letter-spacing: -0.5px; }
                .t-corp-header-right { text-align: right; }
                .t-corp-title { font-size: 32px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 1px; color: #ebf8ff; }
                .t-corp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
                .t-corp-card { background: #f7fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #2b6cb0; }
                .t-corp-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #4a5568; margin-bottom: 5px; }
                .t-corp-val { font-size: 13px; color: #2d3748; }
                .t-corp-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                .t-corp-table th { background: #2b6cb0; color: #ffffff; font-size: 11px; text-transform: uppercase; padding: 10px 12px; font-weight: 700; }
                .t-corp-table td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
                .t-corp-table tr:nth-child(even) { background: #f7fafc; }
                .t-corp-totals { float: right; width: 300px; margin-bottom: 30px; }
                .t-corp-totals-table { width: 100%; border-collapse: collapse; }
                .t-corp-totals-table td { padding: 8px 12px; font-size: 13px; }
                .t-corp-total-row { background: #2b6cb0; color: #ffffff; font-weight: 700; }
                .t-corp-footer { clear: both; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #718096; }
            </style>

            <div class="t-corp-header">
                <div>
                    <div class="t-corp-brand">${escapeHtml(data.sender.name || "DODAVATEL")}</div>
                    <div style="font-size: 12px; color: #ebf8ff; margin-top: 5px;">IČO: ${escapeHtml(data.sender.taxId || "—")}</div>
                </div>
                <div class="t-corp-header-right">
                    <h1 class="t-corp-title">Faktura</h1>
                    <div style="font-size: 14px; margin-top: 5px; opacity: 0.9;">č. ${escapeHtml(data.invoiceNumber)}</div>
                </div>
            </div>

            <div class="t-corp-grid">
                <div class="t-corp-card">
                    <div class="t-corp-label">Odběratel:</div>
                    <div class="t-corp-val" style="font-weight: 700; font-size: 14px; margin-bottom: 5px;">${escapeHtml(data.client.name || "—")}</div>
                    <div class="t-corp-val">Adresa: ${escapeHtml(data.client.address || "nezadána")}</div>
                    ${data.client.email ? `<div class="t-corp-val">Email: ${escapeHtml(data.client.email)}</div>` : ''}
                    ${data.client.taxId ? `<div class="t-corp-val">IČO: ${escapeHtml(data.client.taxId)}</div>` : ''}
                </div>
                
                <div style="padding: 10px;">
                    <div style="margin-bottom: 12px;">
                        <span class="t-corp-label" style="display:inline-block; width:120px;">Datum vystavení:</span>
                        <span class="t-corp-val" style="font-weight:600;">${formatDate(data.createdDate)}</span>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <span class="t-corp-label" style="display:inline-block; width:120px;">Splatnost:</span>
                        <span class="t-corp-val" style="font-weight:600; color:#c53030;">${formatDate(data.dueDate)}</span>
                    </div>
                    <div>
                        <span class="t-corp-label" style="display:inline-block; width:120px;">Platba:</span>
                        <span class="t-corp-val" style="text-transform: uppercase;">${escapeHtml(data.paymentMethod)}</span>
                    </div>
                </div>
            </div>

            <table class="t-corp-table">
                <thead>
                    <tr>
                        <th style="text-align: left; width: 5%;">#</th>
                        <th style="text-align: left; width: 45%;">Popis položky</th>
                        <th style="text-align: center; width: 12%;">Množství</th>
                        <th style="text-align: right; width: 18%;">Cena</th>
                        <th style="text-align: right; width: 20%;">Celkem</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.items.map((item, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>
                                <div style="font-weight: 600;">${escapeHtml(item.description || "Položka bez popisu")}</div>
                                ${item.taxRate > 0 ? `<span style="font-size: 10px; color: #4a5568;">Vč. DPH ${item.taxRate}%</span>` : ''}
                            </td>
                            <td style="text-align: center;">${item.quantity} ${escapeHtml(item.unit || "ks")}</td>
                            <td style="text-align: right;">${item.price.toFixed(2)} ${symbol}</td>
                            <td style="text-align: right; font-weight: 600;">${(item.quantity * item.price).toFixed(2)} ${symbol}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="t-corp-totals">
                <table class="t-corp-totals-table">
                    <tr>
                        <td>Celkem položky:</td>
                        <td style="text-align: right; font-weight: 600;">${totals.subtotal.toFixed(2)} ${symbol}</td>
                    </tr>
                    ${totals.totalTax > 0 ? `
                    <tr>
                        <td>DPH:</td>
                        <td style="text-align: right; font-weight: 600;">${totals.totalTax.toFixed(2)} ${symbol}</td>
                    </tr>
                    ` : ''}
                    ${totals.discount > 0 ? `
                    <tr>
                        <td>Sleva:</td>
                        <td style="text-align: right; color:#c53030;">-${totals.discount.toFixed(2)} ${symbol}</td>
                    </tr>
                    ` : ''}
                    <tr class="t-corp-total-row">
                        <td style="border-radius: 0 0 0 4px;">Celkem k úhradě:</td>
                        <td style="text-align: right; border-radius: 0 0 4px 0;">${totals.total.toFixed(2)} ${symbol}</td>
                    </tr>
                </table>
            </div>

            <div class="t-corp-footer">
                ${data.sender.bankDetails ? `
                    <div style="margin-bottom: 20px;">
                        <div class="t-corp-label" style="color: #2b6cb0;">Bankovní účet / IBAN:</div>
                        <div style="font-size:12px; background:#edf2f7; padding:10px; border-radius:6px; font-family:monospace; white-space:pre-wrap;">${escapeHtml(data.sender.bankDetails)}</div>
                    </div>
                ` : ''}
                
                ${data.notes ? `
                    <div style="margin-bottom: 10px;">
                        <strong>Patička:</strong> ${escapeHtml(data.notes)}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderCreativeTemplate(data, totals, symbol) {
    const formatDate = (d) => d ? d.split("-").reverse().join(".") : "";
    return `
        <div class="template-creative" style="font-family: 'Outfit', 'Inter', sans-serif; color: #2b2d42; line-height: 1.4; text-align: left;">
            <style>
                .t-cr-top-bar { height: 12px; background: linear-gradient(90deg, #ff007f, #7f00ff); margin: -50px -50px 30px -50px; border-radius: 4px 4px 0 0; }
                .t-cr-grid { display: flex; justify-content: space-between; margin-bottom: 40px; }
                .t-cr-badge { display: inline-block; padding: 6px 14px; background: #7f00ff; color: #ffffff; border-radius: 30px; font-weight: 700; font-size: 11px; text-transform: uppercase; margin-bottom: 15px; }
                .t-cr-title { font-size: 42px; font-weight: 900; margin: 0; line-height: 1.1; color: #1d1e2c; letter-spacing: -1px; }
                .t-cr-details-block { background: #f8f7ff; border-radius: 16px; padding: 25px; display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 40px; border: 1px solid #eeeeff; }
                .t-cr-section-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #7f00ff; font-weight: 800; margin-bottom: 6px; }
                .t-cr-text { font-size: 13px; color: #2b2d42; }
                .t-cr-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                .t-cr-table th { text-align: left; padding: 12px 16px; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #7f00ff; border-bottom: 3px solid #7f00ff; }
                .t-cr-table td { padding: 16px; border-bottom: 1px solid #eeeeff; font-size: 13px; }
                .t-cr-totals-box { background: linear-gradient(135deg, #f8f7ff, #f3efff); border-radius: 16px; padding: 20px; width: 280px; margin-left: auto; border: 1px solid #eeeeff; margin-bottom: 40px; }
                .t-cr-total-row { border-top: 1px solid #ddddff; padding-top: 12px; margin-top: 12px; display: flex; justify-content: space-between; font-weight: 900; font-size: 18px; color: #7f00ff; }
            </style>

            <div class="t-cr-top-bar"></div>

            <div class="t-cr-grid">
                <div>
                    <span class="t-cr-badge">FAKTURA</span>
                    <h1 class="t-cr-title">č. ${escapeHtml(data.invoiceNumber)}</h1>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 20px; font-weight: 800; color: #7f00ff;">${escapeHtml(data.sender.name || "Dodavatel")}</div>
                    <div style="font-size: 12px; color: #8d99ae; margin-top: 5px;">
                        IČO: ${escapeHtml(data.sender.taxId || "—")}
                    </div>
                </div>
            </div>

            <div class="t-cr-details-block">
                <div>
                    <div class="t-cr-section-lbl">Odběratel</div>
                    <div class="t-cr-text" style="font-weight: 700; font-size: 15px; color: #1d1e2c;">${escapeHtml(data.client.name || "Jméno odběratele")}</div>
                    <div class="t-cr-text" style="margin-top: 5px;">${escapeHtml(data.client.address || "")}</div>
                    <div class="t-cr-text">${escapeHtml(data.client.email || "")}</div>
                    ${data.client.taxId ? `<div class="t-cr-text" style="margin-top: 4px; font-size: 11px; opacity: 0.8;">IČO: ${escapeHtml(data.client.taxId)}</div>` : ''}
                </div>
                <div>
                    <div class="t-cr-section-lbl">Datum a platba</div>
                    <div class="t-cr-text">Vystaveno: <strong>${formatDate(data.createdDate)}</strong></div>
                    <div class="t-cr-text" style="margin-top: 5px;">Splatnost: <strong style="color: #ff007f;">${formatDate(data.dueDate)}</strong></div>
                    <div class="t-cr-text" style="margin-top: 5px;">Metoda: <strong style="text-transform: uppercase;">${escapeHtml(data.paymentMethod)}</strong></div>
                </div>
            </div>

            <table class="t-cr-table">
                <thead>
                    <tr>
                        <th style="width: 55%;">Popis položky</th>
                        <th style="width: 15%; text-align: center;">Množství</th>
                        <th style="width: 15%; text-align: right;">Cena</th>
                        <th style="width: 15%; text-align: right;">Celkem</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.items.map(item => `
                        <tr>
                            <td>
                                <div style="font-weight: 700; color: #1d1e2c;">${escapeHtml(item.description || "Popis služby")}</div>
                                ${item.taxRate > 0 ? `<div style="font-size: 10px; color: #7f00ff; margin-top: 2px;">Vč. DPH ${item.taxRate}%</div>` : ''}
                            </td>
                            <td style="text-align: center; font-weight: 500;">${item.quantity} ${escapeHtml(item.unit || "ks")}</td>
                            <td style="text-align: right; font-weight: 500;">${item.price.toFixed(2)} ${symbol}</td>
                            <td style="text-align: right; font-weight: 700; color: #1d1e2c;">${(item.quantity * item.price).toFixed(2)} ${symbol}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="t-cr-totals-box">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
                    <span style="color: #8d99ae;">Částka:</span>
                    <span style="font-weight: 700;">${totals.subtotal.toFixed(2)} ${symbol}</span>
                </div>
                ${totals.totalTax > 0 ? `
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
                    <span style="color: #8d99ae;">DPH:</span>
                    <span style="font-weight: 700;">${totals.totalTax.toFixed(2)} ${symbol}</span>
                </div>
                ` : ''}
                ${totals.discount > 0 ? `
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
                    <span style="color: #8d99ae;">Sleva:</span>
                    <span style="font-weight: 700; color: #ff007f;">-${totals.discount.toFixed(2)} ${symbol}</span>
                </div>
                ` : ''}
                <div class="t-cr-total-row">
                    <span>Celkem:</span>
                    <span>${totals.total.toFixed(2)} ${symbol}</span>
                </div>
            </div>

            ${data.sender.bankDetails ? `
                <div style="margin-bottom: 30px; background: #fbfbfe; border-radius: 12px; padding: 20px; border: 1px solid #eeeeff;">
                    <div class="t-cr-section-lbl">Platební detaily / IBAN</div>
                    <div style="font-size: 12px; font-family: monospace; white-space: pre-wrap; color: #4a4e69; margin-top: 5px;">${escapeHtml(data.sender.bankDetails)}</div>
                </div>
            ` : ''}

            ${data.notes ? `
                <div style="border-left: 3px solid #ff007f; padding-left: 15px; font-size: 12px; color: #8d99ae; font-style: italic;">
                    ${escapeHtml(data.notes)}
                </div>
            ` : ''}
        </div>
    `;
}

// --- UTILS ---
function escapeHtml(string) {
    if (!string) return "";
    return String(string)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function updateSaveStatus(text) {
    saveStatus.textContent = text;
}

function translateStatus(status) {
    const statuses = {
        draft: "Koncept",
        sent: "Odesláno",
        paid: "Zaplaceno",
        overdue: "Po splatnosti"
    };
    return statuses[status] || status;
}

init();
