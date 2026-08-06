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
}

// ==========================================
// 3. USTAWIENIA UŻYTKOWNIKA I UPRAWNIENIA
// ==========================================

export function applyUserPermissions() {
    if (!currentUser) return;
    
    const allTabs = AVAILABLE_TABS.map(t => t.id);
    allTabs.push('users'); 
    
    let allowed = currentUser.role === 'admin' ? allTabs : (currentUser.allowedTabs || allTabs);
    let visible = currentUser.preferredTabs || allowed;
    const readOnlyTabs = currentUser.role === 'admin' ? [] : (currentUser.readOnlyTabs || []);

    allTabs.forEach(tab => {
        const btn = document.getElementById('tab-' + tab);
        if (btn) {
            const isVisible = allowed.includes(tab) && visible.includes(tab);
            btn.style.display = isVisible ? 'inline-block' : 'none';
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
    
    const activeViews = allTabs.filter(tab => {
        const v = document.getElementById('view-' + tab);
        return v && !v.classList.contains('hidden');
    });
    
    let targetTab = null;
    if (activeViews.length > 0 && (!allowed.includes(activeViews[0]) || !visible.includes(activeViews[0]))) {
        targetTab = visible.find(t => t !== 'users') || 'users'; 
    } else if (activeViews.length === 0) {
        targetTab = visible.find(t => t !== 'users') || 'users';
    } else if (activeViews.length > 0) {
        targetTab = activeViews[0];
    }

    if (targetTab && window.switchTab) {
        window.switchTab(targetTab, true);
    }
}

export function renderUserPreferences() {
    if (!currentUser) return;
    const grid = document.getElementById('userPreferencesGrid');
    if (!grid) return;
    
    const allTabs = AVAILABLE_TABS.map(t => t);
    allTabs.push({ id: 'users', name: 'Ustawienia' }); 
    
    const allowed = currentUser.role === 'admin' ? allTabs.map(t=>t.id) : (currentUser.allowedTabs || allTabs.map(t=>t.id));
    const preferred = currentUser.preferredTabs || allowed;

    let html = '';
    allTabs.forEach(tab => {
        if (allowed.includes(tab.id)) {
            const isChecked = preferred.includes(tab.id);
            const isUsersTab = tab.id === 'users';
            html += `
                <label class="flex items-center gap-2 cursor-pointer bg-white p-2 border border-black hover:bg-gray-100">
                    <input type="checkbox" class="user-pref-tab-cb w-4 h-4 cursor-pointer" value="${tab.id}" ${isChecked || isUsersTab ? 'checked' : ''} ${isUsersTab ? 'disabled' : ''}>
                    <span class="text-xs font-bold uppercase">${tab.name || tab.id}</span>
                </label>
            `;
        }
    });
    grid.innerHTML = html;
}

export async function saveUserPreferences() {
    if (!currentUser) return;
    const checkboxes = document.querySelectorAll('.user-pref-tab-cb');
    const preferred = Array.from(checkboxes).filter(cb => cb.checked || cb.disabled).map(cb => cb.value); 
    
    currentUser.preferredTabs = preferred;
    
    const userIndex = usersList.findIndex(u => u.login === currentUser.login);
    if (userIndex !== -1) {
        usersList[userIndex].preferredTabs = preferred;
    }
    
    applyUserPermissions();
    if (window.autoSaveToDisk) window.autoSaveToDisk(true);
    await customAlert("Twój widok zakładek został zaktualizowany.");
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
    
    openEditUserModal();
}

export async function saveEditUser() {
    const login = window.editingUserLogin;
    const u = usersList.find(usr => usr.login === login);
    if (!u) return;

    u.name = document.getElementById('editUserName').value.trim();
    u.role = document.getElementById('editUserAdmin').checked ? 'admin' : 'user';

    renderUsersTable();
    autoSaveToDisk();
    closeEditUserModal();
    await customAlert("Zapisano zmiany użytkownika.");
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

    const newUsers = [...usersList, { login, name, role: isAdmin ? 'admin' : 'user', allowedTabs: [] }];
    setUsersList(newUsers);

    document.getElementById('formNewUserLogin').value = '';
    document.getElementById('formNewUserName').value = '';
    document.getElementById('formNewUserAdmin').checked = false;

    renderUsersTable();
    autoSaveToDisk();
    await customAlert("Dodano użytkownika do listy uprawnień.");
}

export async function resetProtocolCounter() {
    if (await customConfirm("Czy na pewno chcesz zresetować numerację nowych kalkulacji? Kolejna kalkulacja otrzyma numer 1.")) {
        if (window.getProjectState) {
            let state = window.getProjectState();
            state.protocolCounter = 0;
        }
        autoSaveToDisk();
        await customAlert("Numeracja kalkulacji została zresetowana.");
    }
}

// ==========================================
// 4. OBSŁUGA MODALI DIALOGOWYCH W UI
// ==========================================

export function openNotificationsModal() { const m = document.getElementById('notificationsModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
export function closeNotificationsModal() { const m = document.getElementById('notificationsModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openInduscoRequestModal() { const m = document.getElementById('induscoRequestModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
export function closeInduscoRequestModal() { const m = document.getElementById('induscoRequestModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openMonthlyReportModal() { const m = document.getElementById('monthlyReportModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
export function closeMonthlyReportModal() { const m = document.getElementById('monthlyReportModal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

export function openPaintReportModal() { const m = document.getElementById('paintReportModal'); if (m) { m.classList.remove('hidden'); m.classList.add('flex'); } }
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