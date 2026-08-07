// --- MODUŁ HISTORII KALKULACJI I WYDRUKÓW (HISTORY.JS) ---

import { formatNumber, escapeHTML, formatISOToPL, parsePlDateToISO, parsePlDate } from './utils.js';
import { shopPrimerRules } from './config.js';
import { 
    printHistory, inputData, resultsData, paintTypes, laborCosts, 
    archivedProjectsList, projectsList, protocolCounter, 
    autoSaveToDisk, setInputData, setPrintHistory 
} from './store.js';

import { currentUser } from './auth.js';

export async function saveToSummaryInternal() {
    const dateInputVal = document.getElementById('protocolDateInput').value;
    const dateStr = formatISOToPL(dateInputVal) || new Date().toLocaleDateString('pl-PL');
    const currentUnits = {};

    const currentLaborCosts = window.historicalRates ? window.historicalRates.laborCosts : laborCosts;
    const currentPaintTypes = window.historicalRates ? window.historicalRates.paintTypes : paintTypes;

    resultsData.forEach((item) => {
        if (item.powierzchnia <= 0) return;
        const isBlacha = item.typ === 'Blacha';
        const matType = isBlacha ? 'BLACHY' : 'PROFILE';
        const unitKey = (item.jednostka || "Brak jednostki") + "___" + matType;
        
        if (!currentUnits[unitKey]) {
            currentUnits[unitKey] = { projectName: (item.jednostka || "Brak jednostki"), area: 0, cost: 0, areaBlachy: 0, areaProfile: 0, brandStats: {}, items: [] };
            currentPaintTypes.forEach(pt => currentUnits[unitKey].brandStats[pt.id] = { vol: 0, thinner: 0, colors: {}, pct: pt.thinnerPct });
        }
        
        currentUnits[unitKey].area += item.powierzchnia;
        currentUnits[unitKey].items.push(inputData[item.originalIndex]);
        const costRate = isBlacha ? currentLaborCosts.blachy : currentLaborCosts.profile;
        currentUnits[unitKey].cost += item.powierzchnia * costRate;
        currentUnits[unitKey].areaBlachy += isBlacha ? item.powierzchnia : 0;
        currentUnits[unitKey].areaProfile += !isBlacha ? item.powierzchnia : 0;

        const brandKey = item.farba.toUpperCase();
        const ptConfig = currentPaintTypes.find(p => p.id === brandKey) || currentPaintTypes[0]; 
        if(!currentUnits[unitKey].brandStats[brandKey]) currentUnits[unitKey].brandStats[brandKey] = { vol: 0, thinner: 0, colors: {}, pct: ptConfig.thinnerPct };
        
        const yieldRate = isBlacha ? ptConfig.yieldBlachy : ptConfig.yieldProfile;
        const vol = item.powierzchnia / yieldRate;
        currentUnits[unitKey].brandStats[brandKey].vol += vol;
        const cName = item.kolorInfo.name;
        currentUnits[unitKey].brandStats[brandKey].colors[cName] = (currentUnits[unitKey].brandStats[brandKey].colors[cName] || 0) + vol;
    });
    
    const generatedNumbers = [];

    let existingEntryIndex = window.editingProtocolId ? printHistory.findIndex(e => e.id.toString() === window.editingProtocolId.toString()) : -1;

    const appliedRates = window.historicalRates ? window.historicalRates : {
        laborCosts: JSON.parse(JSON.stringify(laborCosts)),
        paintTypes: JSON.parse(JSON.stringify(paintTypes))
    };

    if (existingEntryIndex !== -1) {
        const unitKeys = Object.keys(currentUnits);
        if (unitKeys.length > 1) { await window.customAlert("Podczas edycji wszystkie elementy w tabeli muszą należeć do jednego, oryginalnego projektu i być tego samego typu (tylko blachy lub tylko profile)!"); return; }
        const uKey = unitKeys[0]; const data = currentUnits[uKey];
        let totalThinner = 0;
        currentPaintTypes.forEach(pt => {
            if(data.brandStats[pt.id]) { data.brandStats[pt.id].thinner = data.brandStats[pt.id].vol * (data.brandStats[pt.id].pct / 100); totalThinner += data.brandStats[pt.id].thinner; }
        });

        const oldEntry = printHistory[existingEntryIndex];
        const currUserStr = currentUser ? (currentUser.name || currentUser.login) : "System";
        const editDateStr = new Date().toLocaleString('pl-PL', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'});
        const authorStr = oldEntry.author + `<br><span class="text-[9px] text-gray-600 font-normal">[Edycja: ${currUserStr} ${editDateStr}]</span>`;

        printHistory[existingEntryIndex] = {
            id: oldEntry.id, protocolNumber: oldEntry.protocolNumber, projectName: data.projectName, date: dateStr, unit: data.projectName, area: data.area, cost: data.cost, areaBlachy: data.areaBlachy, areaProfile: data.areaProfile, brandStats: data.brandStats, thinnerVol: totalThinner, isError: oldEntry.isError, author: authorStr, items: JSON.parse(JSON.stringify(data.items)), appliedRates: appliedRates, lastModified: Date.now(),
            isAccepted: false, acceptedBy: null, rejectionComment: null, rejectedBy: null
        };
        generatedNumbers.push(oldEntry.protocolNumber);
        if (window.cancelEditMode) window.cancelEditMode();
    } else {
        const parts = dateStr.split('.');
        const monthStr = parts[1] || String(new Date().getMonth() + 1).padStart(2, '0');
        const yearStr = parts[2] || String(new Date().getFullYear());
        const suffix = `/${monthStr}/${yearStr}`;

        let maxNum = 0;
        printHistory.forEach(entry => {
            if (entry.protocolNumber && entry.protocolNumber.endsWith(suffix)) {
                const numPart = parseInt(entry.protocolNumber.split('/')[0]);
                if (!isNaN(numPart) && numPart > maxNum) {
                    maxNum = numPart;
                }
            }
        });
        
        let currentMonthCounter = maxNum;

        for (const [uKey, data] of Object.entries(currentUnits)) {
            let totalThinner = 0;
            currentPaintTypes.forEach(pt => {
                if(data.brandStats[pt.id]) { data.brandStats[pt.id].thinner = data.brandStats[pt.id].vol * (data.brandStats[pt.id].pct / 100); totalThinner += data.brandStats[pt.id].thinner; }
            });
            
            currentMonthCounter++;
            const newProtocolNumber = `${currentMonthCounter}${suffix}`;
            generatedNumbers.push(newProtocolNumber);
            
            printHistory.push({
                id: Date.now() + Math.random().toString(36).substr(2, 9), 
                protocolNumber: newProtocolNumber, 
                projectName: data.projectName, 
                date: dateStr, 
                unit: data.projectName, 
                area: data.area, 
                cost: data.cost, 
                areaBlachy: data.areaBlachy, 
                areaProfile: data.areaProfile, 
                brandStats: data.brandStats, 
                thinnerVol: totalThinner, 
                isError: false, 
                author: currentUser ? (currentUser.name || currentUser.login) : "Nieznany", 
                items: JSON.parse(JSON.stringify(data.items)), 
                appliedRates: appliedRates, 
                lastModified: Date.now(),
                isAccepted: false,
                acceptedBy: null,
                rejectionComment: null,
                rejectedBy: null
            });
        }
    }
    
    if (window.updatePrintHeaders) window.updatePrintHeaders(generatedNumbers.join(', '));
    window.historicalRates = null;
    renderHistoryTable(); 
    if (window.updateAllStocks) window.updateAllStocks();
    if (window.renderProjectsList) window.renderProjectsList(); 
    if (window.renderArchiveList) window.renderArchiveList();
    if (document.getElementById('view-daily') && document.getElementById('view-daily').classList.contains('block')) { 
        if(window.renderDailySidebar) window.renderDailySidebar(); 
        if(window.renderDailyLedger) window.renderDailyLedger(); 
    }
    autoSaveToDisk();
}

export async function saveToSummary() {
    if (resultsData.length === 0) { await window.customAlert("Brak elementów do zapisania!"); return; }
    await saveToSummaryInternal();
    setInputData([]); 
    document.getElementById('protocolDateInput').valueAsDate = new Date(); 
    if (window.calculate) window.calculate(); 
    if (window.clearAddForm) window.clearAddForm();
    
    const wasEditing = window.sourceTabForPreview != null;
    const targetTab = window.sourceTabForPreview || 'history';
    if (wasEditing) {
        if (window.switchTab) window.switchTab(targetTab, true);
        window.sourceTabForPreview = null;
    }
    
    await window.customAlert("Pomyślnie zapisano do Zestawienia Kalkulacji. Formularz został wyczyszczony.");
}

export async function printProtocol() {
    if (resultsData.length === 0) { await window.customAlert("Brak danych do wydruku!"); return; }
    if (!window.isPreviewMode) await saveToSummaryInternal(); 
    window.print();
    if (!window.isPreviewMode) {
        if (window.saveProjectAction) await window.saveProjectAction(true); 
        setInputData([]); 
        if (window.calculate) window.calculate(); 
        if (window.clearAddForm) window.clearAddForm();
    }
}

export function printHistoryProtocol() {
    document.body.classList.add('print-history'); 
    window.print(); 
    document.body.classList.remove('print-history');
}

export async function acceptCurrentPreview() {
    if (!window.previewHistoryId) return;
    const index = printHistory.findIndex(e => e.id.toString() === window.previewHistoryId.toString());
    if (index === -1) return;
    
    if (await window.customConfirm("Czy na pewno chcesz potwierdzić przyjęcie tej kalkulacji?")) {
        window.forceNextCloudOverwrite = true; 
        
        // Tworzymy NOWĄ tablicę i NOWY obiekt by wymusić zrzut do bazy (niezbędne dla starych protokołów)
        const newHistory = [...printHistory];
        newHistory[index] = {
            ...newHistory[index],
            isAccepted: true,
            acceptedBy: currentUser ? (currentUser.name || currentUser.login) : "System",
            rejectionComment: null,
            rejectedBy: null,
            lastModified: Date.now()
        };
        
        setPrintHistory(newHistory);
        autoSaveToDisk(true);
        
        if (window.renderHistoryTable) window.renderHistoryTable();
        
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailyLedger && document.getElementById('view-daily') && !document.getElementById('view-daily').classList.contains('hidden')) {
            window.renderDailyLedger();
        }
        
        loadHistoryItem(window.previewHistoryId, window.sourceTabForPreview);
        await window.customAlert("Kalkulacja została pomyślnie oznaczona jako przyjęta.");
    }
}

export async function rejectCurrentPreview() {
    if (!window.previewHistoryId) return;
    const index = printHistory.findIndex(e => e.id.toString() === window.previewHistoryId.toString());
    if (index === -1) return;

    const comment = await window.customPrompt("Podaj powód odrzucenia/braku akceptacji (np. błąd w metrażu, zły kolor):", "text");
    if (comment !== null && comment.trim() !== "") {
        window.forceNextCloudOverwrite = true; 
        
        // Tworzymy NOWĄ tablicę i NOWY obiekt by wymusić zrzut do bazy (niezbędne dla starych protokołów)
        const newHistory = [...printHistory];
        newHistory[index] = {
            ...newHistory[index],
            isAccepted: false,
            acceptedBy: null,
            rejectionComment: comment.trim(),
            rejectedBy: currentUser ? (currentUser.name || currentUser.login) : "System",
            lastModified: Date.now()
        };
        
        setPrintHistory(newHistory);
        autoSaveToDisk(true);
        
        if (window.renderHistoryTable) window.renderHistoryTable();
        
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailyLedger && document.getElementById('view-daily') && !document.getElementById('view-daily').classList.contains('hidden')) {
            window.renderDailyLedger();
        }
        
        loadHistoryItem(window.previewHistoryId, window.sourceTabForPreview);
        await window.customAlert("Kalkulacja została oznaczona jako ODRZUCONA.");
    } else if (comment !== null) {
        await window.customAlert("Komentarz do odrzucenia nie może być pusty!");
    }
}

export async function loadHistoryItem(id, sourceTab = 'history') {
    window.sourceTabForPreview = sourceTab;
    window.previewHistoryId = id; 
    const entry = printHistory.find(e => e.id.toString() === id.toString());
    if (!entry || !entry.items) { await window.customAlert("Brak szczegółów dla tej kalkulacji."); return; }
    
    if (!window.isPreviewMode && !window.editingProtocolId && inputData.length > 0) window.tempInputData = JSON.parse(JSON.stringify(inputData));
    else if (!window.isPreviewMode && inputData.length === 0) window.tempInputData = null;

    if (window.cancelEditMode) window.cancelEditMode();
    window.historicalRates = entry.appliedRates || null;
    setInputData(JSON.parse(JSON.stringify(entry.items)));
    let projName = entry.projectName;
    
    if(inputData.length > 0 && inputData[0].Jednostka) document.getElementById('formJednostka').value = projName;
    else document.getElementById('formJednostka').value = projName;

    const dateInput = document.getElementById('protocolDateInput');
    dateInput.value = parsePlDateToISO(entry.date);
    dateInput.disabled = true;

    window.isPreviewMode = true; 
    window.currentPreviewProtocolNumber = entry.protocolNumber || "-";
    
    document.querySelectorAll('.print-protocol-number').forEach(el => el.textContent = window.currentPreviewProtocolNumber);
    document.querySelectorAll('.print-project-name').forEach(el => el.textContent = projName || "-");
    
    const banner = document.getElementById('previewBanner');
    if (banner) {
        const oldBtn = document.getElementById('previewAcceptUI');
        if (oldBtn) oldBtn.remove();
        
        const uiContainer = document.createElement('div');
        uiContainer.id = 'previewAcceptUI';
        uiContainer.className = 'ml-auto mr-4 flex items-center gap-2 print-hide';
        
        if (entry.isAccepted) {
            uiContainer.innerHTML = `<span class="text-green-800 font-bold text-xs uppercase bg-green-100 px-2 py-1 border border-green-800 shadow-sm">ZAAKCEPTOWANO PRZEZ: ${escapeHTML(entry.acceptedBy)}</span>`;
        } else if (entry.rejectionComment) {
            uiContainer.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-red-800 font-bold text-[10px] bg-red-100 px-2 py-1 border border-red-800 shadow-sm max-w-xs truncate" title="${escapeHTML(entry.rejectionComment)}">
                        <span class="uppercase">ODRZUCONO (${escapeHTML(entry.rejectedBy)}):</span> <span class="font-normal italic">${escapeHTML(entry.rejectionComment)}</span>
                    </span>
                    <button onclick="acceptCurrentPreview()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 text-[10px] uppercase border border-black shadow-sm transition">WYJAŚNIONE (ZATWIERDŹ)</button>
                </div>
            `;
        } else {
            uiContainer.innerHTML = `
                <button onclick="acceptCurrentPreview()" class="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-4 text-xs uppercase border border-black shadow-sm transition">POTWIERDŹ PRZYJĘCIE</button>
                <button onclick="rejectCurrentPreview()" class="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-4 text-xs uppercase border border-black shadow-sm transition">ODRZUĆ (KOMENTARZ)</button>
            `;
        }
        
        if (banner.lastElementChild) {
            banner.insertBefore(uiContainer, banner.lastElementChild);
        } else {
            banner.appendChild(uiContainer);
        }
    }

    document.getElementById('addFormContainer').classList.add('hidden'); 
    document.getElementById('previewBanner').classList.remove('hidden'); 
    document.getElementById('previewBanner').classList.add('flex');
    document.getElementById('tableActionsContainer').classList.add('hidden');
    if (window.switchTab) window.switchTab('calc'); 
    if (window.calculate) window.calculate(); 
    
    document.querySelectorAll('.protocol-author').forEach(el => el.textContent = entry.author || "");
}

export async function editHistoryItem(id, sourceTab = 'history') {
    const entry = printHistory.find(e => e.id.toString() === id.toString());
    if (!entry || !entry.items) { await window.customAlert("Brak szczegółów dla tej kalkulacji."); return; }
    if (inputData.length > 0) { if (!(await window.customConfirm("Otwarcie kalkulacji do EDYCJI zastąpi obecną, niezapisaną listę w Kalkulatorze. Kontynuować?"))) return; }
    
    window.sourceTabForPreview = sourceTab;
    window.tempInputData = null; 
    if (window.cancelEditMode) window.cancelEditMode(); 
    window.historicalRates = entry.appliedRates || null;
    setInputData(JSON.parse(JSON.stringify(entry.items)));
    let projName = entry.projectName;
    
    const sel = document.getElementById('formJednostka');
    if(sel) {
        const isArchived = archivedProjectsList.some(p => (typeof p === 'object' ? p.name : p) === projName);
        if (!projectsList.some(p => p.name === projName) && !isArchived) { 
            projectsList.push({ name: projName, date: new Date().toLocaleDateString('pl-PL'), lastModified: Date.now() }); 
            if (window.renderProjectsList) window.renderProjectsList(); 
        }
        
        if (!Array.from(sel.options).some(o => o.value === projName)) {
            const opt = document.createElement('option');
            opt.value = projName; opt.textContent = projName + " (Archiwum)";
            sel.appendChild(opt);
        }
        sel.value = projName;
    }

    const dateInput = document.getElementById('protocolDateInput');
    dateInput.value = parsePlDateToISO(entry.date);
    dateInput.disabled = false;

    window.isPreviewMode = false; 
    window.currentPreviewProtocolNumber = entry.protocolNumber || "-"; 
    window.editingProtocolId = id; 
    
    document.querySelectorAll('.print-protocol-number').forEach(el => el.textContent = window.currentPreviewProtocolNumber);
    document.querySelectorAll('.print-project-name').forEach(el => el.textContent = projName || "-");
    
    const btnCancel = document.getElementById('btnCancelEdit');
    if (btnCancel) btnCancel.classList.remove('hidden');

    document.getElementById('addFormContainer').classList.remove('hidden'); 
    document.getElementById('previewBanner').classList.add('hidden'); 
    document.getElementById('previewBanner').classList.remove('flex');
    document.getElementById('tableActionsContainer').classList.remove('hidden');
    
    if (window.switchTab) window.switchTab('calc'); 
    if (window.calculate) window.calculate();
}

export function exitPreviewMode() {
    if (window.cancelEditMode) window.cancelEditMode(); 
    window.isPreviewMode = false; 
    window.currentPreviewProtocolNumber = null;
    window.previewHistoryId = null;
    document.getElementById('protocolDateInput').disabled = false;
    
    document.querySelectorAll('.print-protocol-number').forEach(el => el.textContent = "");
    document.querySelectorAll('.print-project-name').forEach(el => el.textContent = "");
    
    const acceptUI = document.getElementById('previewAcceptUI');
    if (acceptUI) acceptUI.remove();

    if (window.tempInputData) { 
        setInputData(window.tempInputData); 
        window.tempInputData = null; 
    } else { 
        setInputData([]); 
    }
    window.historicalRates = null;
    document.getElementById('protocolDateInput').valueAsDate = new Date(); 
    if (window.clearAddForm) window.clearAddForm(); 
    if (window.calculate) window.calculate(); 
    
    document.getElementById('addFormContainer').classList.remove('hidden'); 
    document.getElementById('previewBanner').classList.add('hidden'); 
    document.getElementById('previewBanner').classList.remove('flex');
    document.getElementById('tableActionsContainer').classList.remove('hidden'); 
    
    if (currentUser) {
        document.querySelectorAll('.protocol-author').forEach(el => el.textContent = currentUser.name || currentUser.login || "");
    }
    
    const targetTab = window.sourceTabForPreview || 'history';
    if (window.switchTab) window.switchTab(targetTab, true); 
    window.sourceTabForPreview = null;
}

export function toggleSelectAllHistory() {
    const isChecked = document.getElementById('selectAllHistory').checked;
    document.querySelectorAll('.history-checkbox').forEach(cb => cb.checked = isChecked);
}

export async function deleteSelectedHistoryItemsWithPin() {
    if (!currentUser || currentUser.role !== 'admin') { await window.customAlert("Funkcja usuwania jest dostępna tylko dla administratora."); return; }
    const selectedCheckboxes = document.querySelectorAll('.history-checkbox:checked');
    if (selectedCheckboxes.length === 0) { await window.customAlert("Wybierz przynajmniej jedną kalkulację do usunięcia."); return; }

    const pin = await window.customPrompt(`Podaj kod autoryzacji (PIN), aby usunąć ${selectedCheckboxes.length} zaznaczone kalkulacje:`, 'password');
    if (pin === "4321") {
        if(await window.customConfirm(`Czy na pewno chcesz usunąć ${selectedCheckboxes.length} wybrane kalkulacje? Tej operacji nie można cofnąć.`)) {
            window.forceNextCloudOverwrite = true;
            const idsToDelete = Array.from(selectedCheckboxes).map(cb => cb.value);
            const newHistory = printHistory.filter(item => !idsToDelete.includes(item.id.toString()));
            setPrintHistory(newHistory);
            
            renderHistoryTable(); 
            if(window.updateAllStocks) window.updateAllStocks();
            if(window.renderProjectsList) window.renderProjectsList(); 
            if(window.renderArchiveList) window.renderArchiveList();
            if (document.getElementById('view-daily') && document.getElementById('view-daily').classList.contains('block')) { 
                if(window.renderDailySidebar) window.renderDailySidebar(); 
                if(window.renderDailyLedger) window.renderDailyLedger(); 
            }
            autoSaveToDisk(); 
            await window.customAlert("Pomyślnie usunięto zaznaczone kalkulacje.");
        }
    } else if (pin !== null) await window.customAlert("Nieprawidłowy kod PIN.");
}

export function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    let theadTr = document.querySelector('#view-history table thead tr');
    if(!theadTr) {
        const thead = document.querySelector('#view-history table thead');
        if(thead) {
            theadTr = document.createElement('tr');
            thead.appendChild(theadTr);
        }
    }
    if(!tbody || !theadTr) return;
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    const checkboxTh = isAdmin ? `<th id="colHistCheck" class="px-3 py-2 border-r border-black print-hide text-center w-8 align-middle"><input type="checkbox" id="selectAllHistory" onchange="toggleSelectAllHistory()" class="cursor-pointer w-4 h-4"></th>` : '';
    const paintColsTh = paintTypes.map(pt => `<th class="px-3 py-2 border-r border-black text-right truncate max-w-[80px]" title="${pt.name}">${pt.name}[L]</th>`).join('');

    theadTr.innerHTML = `${checkboxTh}<th class="px-3 py-2 border-r border-black">Nr Kalkulacji</th><th class="px-3 py-2 border-r border-black">Data</th><th class="px-3 py-2 border-r border-black">Jednostka</th><th class="px-3 py-2 border-r border-black text-right">Pow.[m²]</th>${paintColsTh}<th class="px-3 py-2 border-r border-black text-right">Rozc.[l]</th><th class="px-3 py-2 border-r border-black text-right">Koszty[PLN]</th><th class="px-3 py-2 border-r border-black">Autor & Akceptacja</th><th class="px-3 py-2 text-center print-hide">Akcja</th>`;

    const btnDeleteSel = document.getElementById('btnDeleteSelectedHistory');
    if (btnDeleteSel) btnDeleteSel.style.display = isAdmin ? 'inline-block' : 'none';
    const selectAllCb = document.getElementById('selectAllHistory');
    if (selectAllCb) selectAllCb.checked = false;
    tbody.innerHTML = '';

    if(printHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 + paintTypes.length : 7 + paintTypes.length}" class="px-3 py-2 text-center text-black font-bold uppercase border-b border-black">Brak zapisanych kalkulacji.</td></tr>`;
        return;
    }

    const fDateFromStr = document.getElementById('histFilterDateFrom').value;
    const fDateToStr = document.getElementById('histFilterDateTo').value;
    const fUnit = document.getElementById('histFilterUnit').value.trim().toLowerCase();
    const fPaint = document.getElementById('histFilterPaint').value;
    const dFrom = fDateFromStr ? new Date(fDateFromStr) : new Date('1970-01-01'); dFrom.setHours(0,0,0,0);
    const dTo = fDateToStr ? new Date(fDateToStr) : new Date('2099-12-31'); dTo.setHours(23,59,59,999);

    const filteredHistory = printHistory.filter(row => {
        const rowDate = parsePlDate(row.date);
        if (rowDate < dFrom || rowDate > dTo) return false;
        const searchStr = (row.projectName || "") + " " + (row.unit || "");
        if (fUnit && (!searchStr.toLowerCase().includes(fUnit))) return false;
        if (fPaint && fPaint !== 'Wszystkie') {
            if (!row.brandStats || !row.brandStats[fPaint] || row.brandStats[fPaint].vol <= 0) return false;
        }
        return true;
    });

    const historyToDisplay = [...filteredHistory].reverse();
    if(historyToDisplay.length === 0) { tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 + paintTypes.length : 7 + paintTypes.length}" class="px-3 py-2 text-center text-black font-bold uppercase border-b border-black">Brak wyników.</td></tr>`; return; }

    let sumArea = 0, sumCost = 0, sumAreaBlachy = 0, sumAreaProfile = 0;
    let sumBrands = {}; paintTypes.forEach(pt => sumBrands[pt.id] = { vol: 0, thinner: 0, colors: {} });

    let html = '';
    historyToDisplay.forEach(row => {
        let bs = row.brandStats || {};
        if (!row.isError) {
            sumArea += row.area || 0; sumCost += row.cost || 0; sumAreaBlachy += row.areaBlachy || 0; sumAreaProfile += row.areaProfile || 0;
            Object.keys(bs).forEach(brand => {
                if(!sumBrands[brand]) sumBrands[brand] = { vol: 0, thinner: 0, colors: {} };
                sumBrands[brand].vol += bs[brand].vol || 0; sumBrands[brand].thinner += bs[brand].thinner || 0;
                for (let c in bs[brand].colors) sumBrands[brand].colors[c] = (sumBrands[brand].colors[c] || 0) + bs[brand].colors[c];
            });
        }

        const safeProtocol = escapeHTML(row.protocolNumber || '-');
        const safeProject = escapeHTML(row.projectName || '-');

        const trClass = row.isError ? "bg-gray-200 text-gray-500 line-through" : "hover:bg-gray-100 transition-colors";
        const checkboxCell = isAdmin ? `<td class="px-2 py-1.5 border-r border-b border-black text-center print-hide w-8 align-middle"><input type="checkbox" class="history-checkbox cursor-pointer w-4 h-4" value="${row.id}"></td>` : '';
        let paintColsHtml = paintTypes.map(pt => `<td class="px-3 py-1.5 border-r border-b border-black text-right font-bold">${formatNumber(bs[pt.id] ? bs[pt.id].vol : 0, 2)}</td>`).join('');
        let thTotal = 0; paintTypes.forEach(pt => { if(bs[pt.id]) thTotal += bs[pt.id].thinner || 0; });
        if (row.thinnerVol && thTotal === 0) thTotal = row.thinnerVol; 

        let actionsHtml = `<div class="flex flex-col gap-1 items-stretch w-16 mx-auto"><button onclick="loadHistoryItem('${row.id}', 'history')" class="text-black font-bold border border-black px-1 py-0.5 text-[10px] uppercase hover:bg-black hover:text-white bg-white leading-none">PODGLĄD</button><button onclick="editHistoryItem('${row.id}', 'history')" class="text-white bg-blue-600 font-bold border border-black px-1 py-0.5 text-[10px] uppercase hover:bg-blue-800 leading-none">EDYTUJ</button></div>`;

        // Generowanie HTML dla kolumny z Autorem i statusem akceptacji
        let authorHtml = `<div class="whitespace-normal">${row.author || '-'}</div>`;
        if (row.isAccepted) {
            authorHtml += `<div class="mt-1 text-[9px] text-green-700 font-bold uppercase border-t border-green-300 pt-0.5">ZAAKCEPTOWAŁ(A):<br>${escapeHTML(row.acceptedBy)}</div>`;
        } else if (row.rejectionComment) {
            authorHtml += `<div class="mt-1 text-[9px] text-red-700 font-bold border-t border-red-300 pt-0.5" title="${escapeHTML(row.rejectionComment)}"><span class="uppercase">ODRZUCONO:</span><br><span class="font-normal italic">${escapeHTML(row.rejectionComment)}</span></div>`;
        } else {
            authorHtml += `<div class="mt-1 text-[9px] text-orange-600 font-bold uppercase border-t border-orange-300 pt-0.5">OCZEKUJE</div>`;
        }

        html += `<tr class="${trClass}">${checkboxCell}<td class="px-3 py-1.5 border-r border-b border-black font-bold">${safeProtocol}</td><td class="px-3 py-1.5 border-r border-b border-black font-bold">${row.date}</td><td class="px-3 py-1.5 border-r border-b border-black font-bold uppercase">${safeProject}</td><td class="px-3 py-1.5 border-r border-b border-black text-right"><div class="font-bold">${formatNumber(row.area, 2)}</div><div class="text-[9px] text-gray-600 uppercase mt-0.5 whitespace-nowrap">B: ${formatNumber(row.areaBlachy, 2)} | P: ${formatNumber(row.areaProfile, 2)}</div></td>${paintColsHtml}<td class="px-3 py-1.5 border-r border-b border-black text-right font-bold">${formatNumber(thTotal, 2)}</td><td class="px-3 py-1.5 border-r border-b border-black text-right font-bold">${formatNumber(row.cost, 2)}</td><td class="px-3 py-1.5 border-r border-b border-black text-[10px] align-middle">${authorHtml}</td><td class="px-2 py-1.5 border-b border-black text-center print-hide no-underline align-middle">${actionsHtml}</td></tr>`;
    });

    const genBrandFooter = (ptName, bData) => {
        if (!bData || (bData.vol <= 0 && bData.thinner <= 0)) return '';
        const getHex = (cName) => { const rule = shopPrimerRules.find(r => r.colorName.toUpperCase() === cName.trim().toUpperCase()); return rule ? rule.colorHex : 'transparent'; };
        let cHtml = Object.entries(bData.colors).map(([c, v]) => `<div class="flex items-center gap-1 mt-0.5"><span class="w-2.5 h-2.5 inline-block border border-black" style="background-color: ${getHex(c)}"></span><span>${c}: ${formatNumber(v)} L</span></div>`).join('');
        if(!cHtml) cHtml = "-";
        return `<div class="border border-black p-1 bg-white flex-1 min-w-[100px] text-[9px] mb-1"><div class="font-bold border-b border-black mb-0.5 truncate" title="${ptName}">${ptName}</div><div class="flex justify-between gap-1"><div><span class="underline text-[8px]">KOLORY:</span><br>${cHtml}</div><div class="text-right"><span class="underline text-[8px]">SUMA:</span><br>Farba: ${formatNumber(bData.vol)} L<br>Rozc: ${formatNumber(bData.thinner)} L</div></div></div>`;
    };

    let brandsHtml = paintTypes.map(pt => genBrandFooter(pt.name, sumBrands[pt.id])).join('');
    html += `<tr class="bg-gray-100 font-bold border-t-2 border-black"><td colspan="${isAdmin ? 4 : 3}" class="px-3 py-2 border-r border-black text-right text-black uppercase align-middle">PODSUMOWANIE WIDOCZNYCH:</td><td class="px-3 py-2 border-r border-black text-right text-black text-[10px] align-top">Blachy: ${formatNumber(sumAreaBlachy, 2)}<br>Profile: ${formatNumber(sumAreaProfile, 2)}<br><span class="font-bold text-xs mt-1 block border-t border-gray-300 pt-1">Suma: ${formatNumber(sumArea, 2)}</span></td><td colspan="${paintTypes.length + 1}" class="px-3 py-2 border-r border-black text-right text-black align-top"><div class="flex flex-wrap gap-1 text-left">${brandsHtml || 'Brak farb'}</div></td><td class="px-3 py-2 border-r border-black text-right text-black align-bottom">${formatNumber(sumCost, 2)}</td><td class="px-3 py-2 border-r border-black"></td><td class="px-3 py-2 border-black print-hide"></td></tr>`;
    tbody.innerHTML = html;
}

export async function exportHistoryToExcel() {
    const fDateFromStr = document.getElementById('histFilterDateFrom').value;
    const fDateToStr = document.getElementById('histFilterDateTo').value;
    const fUnit = document.getElementById('histFilterUnit').value.trim().toLowerCase();
    const fPaint = document.getElementById('histFilterPaint').value;
    const dFrom = fDateFromStr ? new Date(fDateFromStr) : new Date('1970-01-01'); dFrom.setHours(0,0,0,0);
    const dTo = fDateToStr ? new Date(fDateToStr) : new Date('2099-12-31'); dTo.setHours(23,59,59,999);

    const filteredHistory = printHistory.filter(row => {
        const rowDate = parsePlDate(row.date);
        if (rowDate < dFrom || rowDate > dTo) return false;
        const searchStr = (row.projectName || "") + " " + (row.unit || "");
        if (fUnit && (!searchStr.toLowerCase().includes(fUnit))) return false;
        if (fPaint && fPaint !== 'Wszystkie') {
            if (!row.brandStats || !row.brandStats[fPaint] || row.brandStats[fPaint].vol <= 0) return false;
        }
        return true;
    });

    if (!filteredHistory || filteredHistory.length === 0) { await window.customAlert("Brak danych do wyeksportowania! (Tabela historii jest pusta)"); return; }
    
    const exportData = filteredHistory.map(row => {
        let bs = row.brandStats || {};
        let rowExport = { "Nr Kalkulacji": row.protocolNumber || "-", "Data": row.date, "Projekt": row.projectName || "-", "Powierzchnia [m2]": row.area };
        let thTotal = 0;
        paintTypes.forEach(pt => { let vol = bs[pt.id] ? (bs[pt.id].vol || 0) : 0; rowExport[`${pt.name} [L]`] = vol; if(bs[pt.id]) thTotal += bs[pt.id].thinner || 0; });
        if (row.thinnerVol && thTotal === 0) thTotal = row.thinnerVol; 
        rowExport["Rozcieńczalnik [L]"] = thTotal; rowExport["Koszty Całkowite [PLN]"] = row.cost; rowExport["Status"] = row.isError ? "BŁĘDNY" : "OK"; rowExport["Zatwierdził"] = row.author || "Brak";
        
        let statusAkceptacji = "OCZEKUJE";
        if (row.isAccepted) statusAkceptacji = `ZAAKCEPTOWANO (${row.acceptedBy})`;
        else if (row.rejectionComment) statusAkceptacji = `ODRZUCONO: ${row.rejectionComment}`;
        rowExport["Akceptacja"] = statusAkceptacji;
        
        return rowExport;
    });

    if (typeof window.XLSX === 'undefined') { await window.customAlert("Biblioteka Excela nie została załadowana!"); return; }

    const ws = window.XLSX.utils.json_to_sheet(exportData);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Zestawienie Kalkulacji");
    const defaultFilename = "Zestawienie_Kalkulacji.xlsx";
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: defaultFilename, types: [{ description: 'Plik Arkusza Excel', accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']} }] });
            const writable = await handle.createWritable();
            const buffer = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            await writable.write(buffer); await writable.close();
        } else { window.XLSX.writeFile(wb, defaultFilename); }
    } catch (err) {}
}

// Podpinanie pod obiekt globalny Window
window.saveToSummaryInternal = saveToSummaryInternal;
window.saveToSummary = saveToSummary;
window.printProtocol = printProtocol;
window.printHistoryProtocol = printHistoryProtocol;
window.loadHistoryItem = loadHistoryItem;
window.editHistoryItem = editHistoryItem;
window.exitPreviewMode = exitPreviewMode;
window.acceptCurrentPreview = acceptCurrentPreview;
window.rejectCurrentPreview = rejectCurrentPreview;
window.toggleSelectAllHistory = toggleSelectAllHistory;
window.deleteSelectedHistoryItemsWithPin = deleteSelectedHistoryItemsWithPin;
window.renderHistoryTable = renderHistoryTable;
window.exportHistoryToExcel = exportHistoryToExcel;

// Uzupełnienie zdarzenia nasłuchującego dla drukowania
window.addEventListener('beforeprint', () => {
    const dateStr = new Date().toLocaleDateString('pl-PL');
    document.querySelectorAll('.print-history-only .print-date').forEach(el => el.textContent = dateStr);
});
