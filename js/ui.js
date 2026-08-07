// --- MODUŁ INTERFEJSU I OBSŁUGI WIDOKÓW (UI.JS) ---

import { 
    inputData, resultsData, printHistory, projectsList, archivedProjectsList, 
    induscoHistory, induscoDailyRecords, activeRemanentAlerts, activeInduscoRequests, 
    database, paintTypes, laborCosts, userPreferences, usersList, protocolCounter,
    setInputData, setUserPreferences, setUsersList, autoSaveToDisk 
} from './store.js';

import { currentUser } from './auth.js';
import { AVAILABLE_TABS } from './config.js';
import { formatNumber, escapeHTML, parsePlDateToISO, formatISOToPL, parsePlDate } from './utils.js';

// ==========================================
// 1. DIALOGI I ALERT KUSTOMOWY
// ==========================================

export function showCustomDialog(options) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customDialogOverlay');
        const titleEl = document.getElementById('customDialogTitle');
        const msgEl = document.getElementById('customDialogMessage');
        const inputEl = document.getElementById('customDialogInput');
        const btnContainer = document.getElementById('customDialogButtons');

        if (!overlay) return resolve(null);

        titleEl.innerHTML = options.title || 'Komunikat';
        msgEl.innerHTML = options.message || '';
        
        if (options.type === 'prompt') {
            inputEl.type = options.inputType || 'text';
            inputEl.value = '';
            inputEl.classList.remove('hidden');
            setTimeout(() => inputEl.focus(), 100);
        } else {
            inputEl.classList.add('hidden');
        }

        btnContainer.innerHTML = '';

        if (options.type === 'confirm' || options.type === 'prompt') {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = "bg-gray-200 text-black border border-black hover:bg-gray-300 font-bold py-1.5 px-4 uppercase text-xs transition";
            cancelBtn.textContent = 'Anuluj';
            cancelBtn.onclick = () => { overlay.classList.remove('flex'); overlay.classList.add('hidden'); resolve(null); };
            btnContainer.appendChild(cancelBtn);
        }

        const okBtn = document.createElement('button');
        okBtn.className = "bg-black text-white border border-black hover:bg-gray-800 font-bold py-1.5 px-4 uppercase text-xs transition shadow-md";
        okBtn.textContent = 'Zatwierdź';
        okBtn.onclick = () => {
            overlay.classList.remove('flex'); overlay.classList.add('hidden');
            if (options.type === 'prompt') resolve(inputEl.value);
            else resolve(true);
        };
        btnContainer.appendChild(okBtn);

        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        if(options.type === 'alert') setTimeout(() => okBtn.focus(), 100);
    });
}

export async function customAlert(msg) { await showCustomDialog({type: 'alert', message: msg}); }
export async function customConfirm(msg) { return await showCustomDialog({type: 'confirm', message: msg, title: 'Potwierdzenie'}); }
export async function customPrompt(msg, inputType='text') { return await showCustomDialog({type: 'prompt', message: msg, title: 'Wprowadź dane', inputType}); }

// ==========================================
// 2. PRZEŁĄCZANIE ZAKŁADEK I UI
// ==========================================

export function switchTab(tabId, bypassCheck = false) {
    const views = ['daily', 'daily-indusco', 'compare', 'calc', 'db', 'colors', 'costs', 'history', 'users', 'projects', 'indusco', 'archive'];
    
    views.forEach(v => {
        const el = document.getElementById('view-' + v);
        if(el) { el.classList.add('hidden'); el.classList.remove('block'); }
        const btn = document.getElementById('tab-' + v);
        if(btn) {
            btn.className = "px-2 py-1.5 border-2 border-transparent hover:border-black border-b-0 text-black bg-white text-xs font-bold focus:outline-none whitespace-nowrap z-10";
        }
    });
    
    const targetEl = document.getElementById('view-' + tabId);
    if(targetEl) { targetEl.classList.remove('hidden'); targetEl.classList.add('block'); }
    
    const targetBtn = document.getElementById('tab-' + tabId);
    if(targetBtn) {
        targetBtn.className = "px-2 py-1.5 border-2 border-black border-b-0 bg-white text-black text-xs font-bold focus:outline-none whitespace-nowrap z-10";
    }

    if (tabId === 'calc' && window.calculate) window.calculate();
    if (tabId === 'history' && window.renderHistoryTable) window.renderHistoryTable();
    if (tabId === 'daily' && window.renderDailySidebar) { window.renderDailySidebar(); window.renderDailyLedger(); }
    if (tabId === 'daily-indusco' && window.renderDailyInduscoSidebar) { window.renderDailyInduscoSidebar(); window.renderDailyInduscoLedger(); }
    if (tabId === 'compare' && window.renderCompareTable) window.renderCompareTable();
    if (tabId === 'projects' && window.renderProjectsList) window.renderProjectsList();
    if (tabId === 'archive' && window.renderArchiveList) window.renderArchiveList();
    if (tabId === 'indusco' && window.renderInduscoTable) window.renderInduscoTable();
    if (tabId === 'db' && window.renderDbTable) window.renderDbTable();
    if (tabId === 'colors' && window.renderColorsTable) window.renderColorsTable();
    if (tabId === 'costs' && window.renderPaintTypesTable) window.renderPaintTypesTable();
    
    if (tabId === 'users') {
        if (window.renderUserPreferences) window.renderUserPreferences();
        if (window.renderUsersTable) window.renderUsersTable();
    }
}

// ==========================================
// 3. USTAWIENIA UŻYTKOWNIKA I UPRAWNIENIA
// ==========================================

export function applyUserPermissions() {
    if (!currentUser) return;
    
    // Zawsze pobieramy najświeższe dane z bazy uprawnień dla aktualnie zalogowanego konta.
    // Gwarantuje to poprawne załadowanie zablokowanych zakładek nawet po pełnym restarcie/przeładowaniu strony.
    const dbUser = usersList.find(u => u.login === currentUser.login) || currentUser;
    
    const allStandardTabs = AVAILABLE_TABS.map(t => t.id);
    let allowed = [];
    
    if (dbUser.role === 'admin') {
        // Admin widzi wszystkie moduły ORAZ zakładkę z ustawieniami ("users")
        allowed = [...allStandardTabs, 'users'];
    } else {
        // Zwykły użytkownik widzi tylko to, co nadano mu w panelu (albo domyślne moduły)
        allowed = dbUser.allowedTabs || allStandardTabs;
        // Twarde usunięcie zakładki ustawień dla nie-adminów
        allowed = allowed.filter(t => t !== 'users'); 
    }

    const readOnlyTabs = dbUser.role === 'admin' ? [] : (dbUser.readOnlyTabs || []);

    const allPossibleTabs = [...allStandardTabs, 'users'];

    allPossibleTabs.forEach(tab => {
        const btn = document.getElementById('tab-' + tab);
        if (btn) {
            btn.style.display = allowed.includes(tab) ? 'inline-block' : 'none';
        }
        const viewEl = document.getElementById('view-' + tab);
        if (viewEl) {
            if (readOnlyTabs.includes(tab)) {
                viewEl.classList.add('is-read-only');
            } else {
                viewEl.classList.remove('is-read-only');
            }
        }
    });
    
    // Ustalanie aktywnej zakładki (żeby nie zostawić użytkownika na pustym/zablokowanym ekranie)
    const activeViews = allPossibleTabs.filter(tab => {
        const v = document.getElementById('view-' + tab);
        return v && !v.classList.contains('hidden');
    });
    
    let targetTab = null;
    if (activeViews.length > 0 && !allowed.includes(activeViews[0])) {
        targetTab = allowed[0] || 'daily'; 
    } else if (activeViews.length === 0) {
        targetTab = allowed[0] || 'daily';
    }

    if (targetTab && window.switchTab) {
        window.switchTab(targetTab, true);
    }
}

export function renderUserPreferences() {
    // Usunięto sekcję "Dostosuj swój widok".
    // Ten kod agresywnie ukrywa cały element w HTML, żeby nie zaśmiecał ekranu administratora.
    const grid = document.getElementById('userPreferencesGrid');
    if (grid) {
        const container = grid.closest('.border-black');
        if (container) container.style.display = 'none';
    }
}

export async function saveUserPreferences() {
    // Pusta funkcja - nie jest już potrzebna, zapobiega potencjalnym błędom w logach po stronie HTML.
}

export function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const isAdmin = currentUser && currentUser.role === 'admin';
    const colAction = document.getElementById('colUserAction');
    if (colAction) colAction.style.display = isAdmin ? 'table-cell' : 'none';

    usersList.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-100 transition-colors";
        
        let actionBtn = isAdmin ? `<button onclick="editUser('${u.login}')" class="text-white bg-blue-600 font-bold border border-black px-2 py-0.5 text-[10px] uppercase hover:bg-blue-800">Edytuj</button>` : '-';
        
        tr.innerHTML = `
            <td class="px-3 py-2 border-r border-b border-black font-bold">${escapeHTML(u.login)}</td>
            <td class="px-3 py-2 border-r border-b border-black">${escapeHTML(u.name || '-')}</td>
            <td class="px-3 py-2 border-r border-b border-black font-bold uppercase ${u.role === 'admin' ? 'text-red-600' : 'text-gray-700'}">${u.role}</td>
            ${isAdmin ? `<td class="px-3 py-2 border-b border-black text-center print-hide">${actionBtn}</td>` : ''}
        `;
        tbody.appendChild(tr);
    });
}

export function editUser(login) {
    const u = usersList.find(usr => usr.login === login);
    if (!u) return;
    
    window.editingUserLogin = login;
    document.getElementById('editUserLogin').value = u.login;
    document.getElementById('editUserName').value = u.name || '';
    
    const adminCb = document.getElementById('editUserAdmin');
    adminCb.checked = u.role === 'admin';
    
    // Generowanie siatki zakładek w oknie edycji (tylko moduły bez sekcji ustawień)
    const tabsContainer = document.getElementById('editUserTabsGrid');
    if (tabsContainer) {
        const allTabs = AVAILABLE_TABS.map(t => t);
        
        const allowed = u.allowedTabs || allTabs.map(t => t.id);
        
        let html = '';
        allTabs.forEach(tab => {
            const isChecked = allowed.includes(tab.id);
            html += `
                <label class="flex items-center gap-2 cursor-pointer bg-white p-1.5 border border-black hover:bg-gray-100">
                    <input type="checkbox" class="edit-user-tab-cb w-4 h-4 cursor-pointer" value="${tab.id}" ${isChecked ? 'checked' : ''}>
                    <span class="text-[11px] font-bold uppercase">${tab.name || tab.id}</span>
                </label>
            `;
        });
        tabsContainer.innerHTML = html;
    }
    
    if (window.toggleUserPermissionsGrid) window.toggleUserPermissionsGrid();
    
    openEditUserModal();
}

export async function saveEditUser() {
    const login = window.editingUserLogin;
    const u = usersList.find(usr => usr.login === login);
    if (!u) return;

    u.name = document.getElementById('editUserName').value.trim();
    u.role = document.getElementById('editUserAdmin').checked ? 'admin' : 'user';

    // Zbieramy zaznaczone uprawnienia do zakładek (tylko z dostępnych pól wyboru)
    const checkboxes = document.querySelectorAll('.edit-user-tab-cb');
    if (checkboxes.length > 0) {
        u.allowedTabs = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    }

    renderUsersTable();
    
    // Odświeżenie uprawnień od razu w interfejsie, jeśli admin edytuje samego siebie
    if (currentUser && currentUser.login === u.login) {
        currentUser.role = u.role;
        currentUser.allowedTabs = u.allowedTabs;
        applyUserPermissions();
    }
    
    if (window.autoSaveToDisk) window.autoSaveToDisk(true);
    closeEditUserModal();
    await customAlert("Zapisano zmiany uprawnień użytkownika.");
}

export async function addNewUser() {
    const login = document.getElementById('formNewUserLogin').value.trim().toLowerCase();
    const name = document.getElementById('formNewUserName').value.trim();
    const isAdmin = document.getElementById('formNewUserAdmin').checked;

    if (!login || !name) { await customAlert("Wypełnij e-mail oraz imię i nazwisko!"); return; }

    if (usersList.some(u => u.login === login)) {
        await customAlert("Użytkownik o tym adresie e-mail już istnieje na liście!");
        return;
    }

    const allTabs = AVAILABLE_TABS.map(t => t.id);
    
    const newUsers = [...usersList, { login, name, role: isAdmin ? 'admin' : 'user', allowedTabs: allTabs }];
    setUsersList(newUsers);

    document.getElementById('formNewUserLogin').value = '';
    document.getElementById('formNewUserName').value = '';
    document.getElementById('formNewUserAdmin').checked = false;

    renderUsersTable();
    if (window.autoSaveToDisk) window.autoSaveToDisk(true);
    await customAlert("Dodano użytkownika do listy uprawnień.");
}

export async function resetProtocolCounter() {
    if (await customConfirm("Czy na pewno chcesz zresetować numerację nowych kalkulacji? Kolejna kalkulacja otrzyma numer 1.")) {
        if (window.getProjectState) {
            let state = window.getProjectState();
            state.protocolCounter = 0;
        }
        if (window.autoSaveToDisk) window.autoSaveToDisk();
        await customAlert("Numeracja kalkulacji została zresetowana.");
    }
}

export function toggleUserPermissionsGrid() {
    const adminCb = document.getElementById('editUserAdmin');
    const container = document.getElementById('editUserPermissionsContainer');
    if (adminCb && container) {
        if (adminCb.checked) {
            container.style.opacity = '0.5';
            container.style.pointerEvents = 'none';
        } else {
            container.style.opacity = '1';
            container.style.pointerEvents = 'auto';
        }
    }
}

// ==========================================
// 4. OBSŁUGA MODALI DIALOGOWYCH W UI
// ==========================================

export function openNotificationsModal() { 
    const m = document.getElementById('notificationsModal'); 
    if (m) { 
        m.classList.remove('hidden'); 
        m.classList.add('flex'); 
        if (window.renderNotificationsList) window.renderNotificationsList();
    } 
}
export function closeNotificationsModal() { const m = document.getElementById('notificationsModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openInduscoRequestModal() { 
    const select = document.getElementById('induscoRequestPaint');
    if (select && window.getAllPossibleDailyPaints) {
        const paints = window.getAllPossibleDailyPaints();
        select.innerHTML = paints.map(p => `<option value="${escapeHTML(p)}">${escapeHTML(p)}</option>`).join('');
    }
    const m = document.getElementById('induscoRequestModal'); 
    if (m) { 
        m.classList.remove('hidden'); 
        m.classList.add('flex'); 
    } 
}
export function closeInduscoRequestModal() { const m = document.getElementById('induscoRequestModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openMonthlyReportModal() { 
    const m = document.getElementById('monthlyReportModal'); 
    if (m) { 
        m.classList.remove('hidden'); 
        m.classList.add('flex'); 
        if(window.renderMonthlyReport) window.renderMonthlyReport();
    } 
}
export function closeMonthlyReportModal() { const m = document.getElementById('monthlyReportModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openPaintReportModal() { 
    const m = document.getElementById('paintReportModal'); 
    if (m) { 
        m.classList.remove('hidden'); 
        m.classList.add('flex'); 
        if(window.renderPaintReport) window.renderPaintReport();
    } 
}
export function closePaintReportModal() { const m = document.getElementById('paintReportModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openEditInduscoModal() { const m = document.getElementById('editInduscoModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
export function closeEditInduscoModal() { const m = document.getElementById('editInduscoModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openPaintRulesModal() { const m = document.getElementById('paintRulesModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
export function closePaintRulesModal() { const m = document.getElementById('paintRulesModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openConfigDailyPaintsModal() { const m = document.getElementById('configDailyPaintsModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
export function closeConfigDailyPaintsModal() { const m = document.getElementById('configDailyPaintsModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openEditUserModal() { const m = document.getElementById('editUserModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
export function closeEditUserModal() { const m = document.getElementById('editUserModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

// Podpięcie funkcji pod obiekt globalny Window
window.showCustomDialog = showCustomDialog;
window.customAlert = customAlert;
window.customConfirm = customConfirm;
window.customPrompt = customPrompt;
window.switchTab = switchTab;

window.applyUserPermissions = applyUserPermissions;
window.renderUserPreferences = renderUserPreferences;
window.saveUserPreferences = saveUserPreferences;
window.renderUsersTable = renderUsersTable;
window.editUser = editUser;
window.saveEditUser = saveEditUser;
window.addNewUser = addNewUser;
window.resetProtocolCounter = resetProtocolCounter;
window.toggleUserPermissionsGrid = toggleUserPermissionsGrid;

window.openNotificationsModal = openNotificationsModal;
window.closeNotificationsModal = closeNotificationsModal;
window.openInduscoRequestModal = openInduscoRequestModal;
window.closeInduscoRequestModal = closeInduscoRequestModal;
window.openMonthlyReportModal = openMonthlyReportModal;
window.closeMonthlyReportModal = closeMonthlyReportModal;
window.openPaintReportModal = openPaintReportModal;
window.closePaintReportModal = closePaintReportModal;
window.openEditInduscoModal = openEditInduscoModal;
window.closeEditInduscoModal = closeEditInduscoModal;
window.openPaintRulesModal = openPaintRulesModal;
window.closePaintRulesModal = closePaintRulesModal;
window.openConfigDailyPaintsModal = openConfigDailyPaintsModal;
window.closeConfigDailyPaintsModal = closeConfigDailyPaintsModal;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
