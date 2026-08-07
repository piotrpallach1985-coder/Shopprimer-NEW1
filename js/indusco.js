// --- MODUŁ MAGAZYNU INDUSCO, ROZLICZEŃ DZIENNYCH I ALERTÓW (INDUSCO.JS) ---

import { formatNumber, escapeHTML, parsePlDate, parsePlDateToISO, formatISOToPL, dateToISO } from './utils.js';
import { shopPrimerRules } from './config.js';
import { 
    paintTypes, induscoHistory, induscoDailyRecords, activeRemanentAlerts, activeInduscoRequests,
    projectsList, visibleDailyPaints, printHistory, autoSaveToDisk,
    setInduscoHistory, setInduscoDailyRecords, setActiveRemanentAlerts, setActiveInduscoRequests, setVisibleDailyPaints
} from './store.js';

import { currentUser } from './auth.js';

window.remanentAdjustmentsCalc = {};
window.currentCalcStocks = {};
window.remanentAdjustmentsIndusco = {};
window.currentInduscoStocks = {};
window.calcEvents = {};
window.indEvents = {};

let currentDailyPaint = null;
let currentDailyInduscoPaint = null;

// ==========================================
// 1. ZARZĄDZANIE WIDOCZNYMI FARBAMI
// ==========================================

export function getAllPossibleDailyPaints() {
    let paints = []; 
    paintTypes.forEach(pt => { 
        if (!pt.fallbacks || !pt.fallbacks['Szary']) paints.push(`${pt.name} - Szary`); 
        if (!pt.fallbacks || !pt.fallbacks['Czerwony']) paints.push(`${pt.name} - Czerwony`); 
        if (!pt.fallbacks || !pt.fallbacks['Zielony']) paints.push(`${pt.name} - Zielony`); 
        paints.push(`${pt.name} - Rozcieńczalnik`); 
    }); 
    return paints;
}

export function initDailyPaints() {
    const allPaints = getAllPossibleDailyPaints();
    if (visibleDailyPaints === null) return allPaints;
    return allPaints.filter(p => visibleDailyPaints.includes(p));
}

export function openConfigDailyPaints() {
    const allPaints = getAllPossibleDailyPaints();
    const listEl = document.getElementById('configDailyPaintsList');
    
    let html = '';
    allPaints.forEach(paint => {
        const isChecked = visibleDailyPaints === null || visibleDailyPaints.includes(paint);
        html += `
            <label class="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-gray-100 border border-transparent hover:border-gray-300">
                <input type="checkbox" class="daily-paint-checkbox w-4 h-4 cursor-pointer" value="${paint}" ${isChecked ? 'checked' : ''}>
                <span class="text-xs font-bold uppercase">${paint}</span>
            </label>
        `;
    });
    listEl.innerHTML = html;
    document.getElementById('configDailyPaintsModal').classList.remove('hidden');
    document.getElementById('configDailyPaintsModal').classList.add('flex');
}

export function saveDailyPaintsConfig() {
    const checkboxes = document.querySelectorAll('.daily-paint-checkbox');
    setVisibleDailyPaints(Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value));
    
    document.getElementById('configDailyPaintsModal').classList.add('hidden');
    document.getElementById('configDailyPaintsModal').classList.remove('flex');
    
    const paints = initDailyPaints();
    if (paints.length > 0 && !paints.includes(currentDailyPaint)) {
        currentDailyPaint = paints[0];
    } else if (paints.length === 0) {
        currentDailyPaint = null;
    }
    
    renderDailySidebar(); renderDailyLedger(); autoSaveToDisk();
}

// ==========================================
// 2. OBLICZANIE STANÓW MAGAZYNOWYCH (SILNIK)
// ==========================================

export function updateAllStocks() {
    window.remanentAdjustmentsCalc = {}; window.currentCalcStocks = {};
    window.remanentAdjustmentsIndusco = {}; window.currentInduscoStocks = {};

    const allPaints = getAllPossibleDailyPaints();
    let baseEvents = {};
    allPaints.forEach(paint => { baseEvents[paint] = []; window.currentCalcStocks[paint] = 0; window.currentInduscoStocks[paint] = 0; });
    
    induscoHistory.forEach((r, idx) => {
        if (baseEvents[r.paintType]) {
            let isUtylizacja = r.actionType === 'utylizacja' || (r.amount < 0 && !r.isRemanent && r.actionType !== 'remanent'); 
            let isKorekta = r.isRemanent || r.actionType === 'remanent';
            
            let btnAkcje = `<div class="flex flex-col gap-1 items-stretch w-16 mx-auto print-hide">`;
            btnAkcje += `<button onclick="editInduscoRecord(${idx})" class="text-[10px] font-bold border border-black px-1 py-0.5 bg-white hover:bg-gray-200 uppercase leading-none">EDYTUJ</button>`;
            
            if (!r.isAccepted) {
                if (r.rejectionComment) {
                    btnAkcje += `<button onclick="acceptInduscoRecord(${idx})" class="text-white bg-green-600 font-bold border border-black px-1 py-0.5 text-[10px] uppercase hover:bg-green-700 leading-none">Zatwierdź</button>`;
                } else {
                    btnAkcje += `<button onclick="acceptInduscoRecord(${idx})" class="text-white bg-green-600 font-bold border border-black px-1 py-0.5 text-[10px] uppercase hover:bg-green-700 leading-none">Akceptuj</button>`;
                    btnAkcje += `<button onclick="rejectInduscoRecord(${idx})" class="text-white bg-red-600 font-bold border border-black px-1 py-0.5 text-[10px] uppercase hover:bg-red-700 leading-none">Odrzuć</button>`;
                }
            }
            btnAkcje += `</div>`;

            baseEvents[r.paintType].push({ 
                dateObj: parsePlDate(r.date), 
                wydanie: (r.amount > 0 && !isKorekta) ? r.amount : 0, 
                utylizacja: isUtylizacja ? Math.abs(r.amount) : 0, 
                rodzaj: isKorekta ? 'REMANENT' : (isUtylizacja ? 'UTYLIZACJA' : 'WYDANIE'), 
                rawAmount: isKorekta ? r.amount : Math.abs(r.amount),
                induscoIndex: idx, jednostka: '-', kalkulacja: '-',
                author: r.author,
                isAccepted: r.isAccepted, acceptedBy: r.acceptedBy, rejectionComment: r.rejectionComment, rejectedBy: r.rejectedBy,
                akcje: btnAkcje
            });
        }
    });

    let calcEvents = {};
    allPaints.forEach(paint => { calcEvents[paint] = baseEvents[paint].map(e => ({...e, dateObj: new Date(e.dateObj.getTime())})); });

    printHistory.forEach(p => {
        if (p.isError || !p.brandStats) return;
        const dateObj = parsePlDate(p.date);
        let rodzajMat = []; if (p.areaBlachy > 0) rodzajMat.push("BLACHY"); if (p.areaProfile > 0) rodzajMat.push("PROFILE");
        let rodzajDisplay = "ZUŻYCIE"; if (rodzajMat.length > 0) rodzajDisplay = "ZUŻYCIE: " + rodzajMat.join(" + ");

        Object.entries(p.brandStats).forEach(([brand, stat]) => {
            if (stat.thinner > 0) {
                const pName = `${brand} - Rozcieńczalnik`;
                if (calcEvents[pName]) calcEvents[pName].push({ 
                    dateObj, wydanie: 0, utylizacja: 0, zuzycie: stat.thinner, rodzaj: rodzajDisplay, 
                    jednostka: p.projectName || p.unit || '-', kalkulacja: p.protocolNumber || '-', 
                    m2: p.area || 0, isAccepted: p.isAccepted, acceptedBy: p.acceptedBy, rejectionComment: p.rejectionComment, rejectedBy: p.rejectedBy,
                    akcje: `<button onclick="loadHistoryItem('${p.id}', 'daily')" class="text-[10px] font-bold bg-[#6466f1] text-white border border-black px-2 py-1 uppercase hover:bg-blue-800 print-hide">PODGLĄD</button>` 
                });
            }
            if (stat.colors) {
                Object.entries(stat.colors).forEach(([color, vol]) => {
                    if (vol > 0) {
                        const pName = `${brand} - ${color}`;
                        if (calcEvents[pName]) calcEvents[pName].push({ 
                            dateObj, wydanie: 0, utylizacja: 0, zuzycie: vol, rodzaj: rodzajDisplay, 
                            jednostka: p.projectName || p.unit || '-', kalkulacja: p.protocolNumber || '-', 
                            m2: p.area || 0, isAccepted: p.isAccepted, acceptedBy: p.acceptedBy, rejectionComment: p.rejectionComment, rejectedBy: p.rejectedBy,
                            akcje: `<button onclick="loadHistoryItem('${p.id}', 'daily')" class="text-[10px] font-bold bg-[#6466f1] text-white border border-black px-2 py-1 uppercase hover:bg-blue-800 print-hide">PODGLĄD</button>` 
                        });
                    }
                });
            }
        });
    });

    allPaints.forEach(paint => {
        const events = calcEvents[paint];
        events.sort((a, b) => {
            if(a.dateObj.getTime() !== b.dateObj.getTime()) return a.dateObj - b.dateObj;
            const order = { 'WYDANIE': 0, 'UTYLIZACJA': 1, 'ZUŻYCIE': 2, 'REMANENT': 3 };
            const typeA = a.rodzaj.startsWith('ZUŻYCIE') ? 'ZUŻYCIE' : a.rodzaj;
            const typeB = b.rodzaj.startsWith('ZUŻYCIE') ? 'ZUŻYCIE' : b.rodzaj;
            return (order[typeA] || 0) - (order[typeB] || 0);
        });
        
        let currentBalance = 0;
        events.forEach(ev => {
            if (ev.rodzaj === 'REMANENT') {
                const korekta = ev.rawAmount - currentBalance;
                window.remanentAdjustmentsCalc[ev.induscoIndex] = korekta;
                currentBalance = ev.rawAmount;
            } else { 
                currentBalance += (ev.wydanie || 0) - (ev.utylizacja || 0) - (ev.zuzycie || 0); 
            }
        });
        window.currentCalcStocks[paint] = currentBalance;
    });

    let indEvents = {};
    allPaints.forEach(paint => { indEvents[paint] = []; });

    const induscoZuzByDateAndPaint = {}; 
    induscoDailyRecords.forEach(r => {
        const m2 = parseFloat(r.m2) || 0;
        if (m2 > 0) {
            if (!induscoZuzByDateAndPaint[r.date]) induscoZuzByDateAndPaint[r.date] = {};
            const parts = r.paint.split(' - ');
            const brandId = parts[0];
            const isThinner = parts[1] === 'Rozcieńczalnik';
            if (!isThinner) {
                if (r.zuz === undefined) {
                    const pt = paintTypes.find(p => p.id === brandId);
                    if (pt) {
                        const isProfile = (r.matType || '').toLowerCase().includes('profil');
                        const y = isProfile ? pt.yieldProfile : pt.yieldBlachy;
                        if (y > 0) { r.zuz = m2 / y; r.thinnerZuz = r.zuz * (pt.thinnerPct / 100); } 
                        else { r.zuz = 0; r.thinnerZuz = 0; }
                    } else { r.zuz = 0; r.thinnerZuz = 0; }
                }
                if (r.zuz > 0) {
                    induscoZuzByDateAndPaint[r.date][r.paint] = (induscoZuzByDateAndPaint[r.date][r.paint] || 0) + r.zuz;
                    const thinnerName = `${brandId} - Rozcieńczalnik`;
                    induscoZuzByDateAndPaint[r.date][thinnerName] = (induscoZuzByDateAndPaint[r.date][thinnerName] || 0) + (r.thinnerZuz || 0);
                }
            }
        }
    });

    Object.entries(induscoZuzByDateAndPaint).forEach(([dateIso, paintsObj]) => {
        const dateObj = new Date(dateIso);
        Object.entries(paintsObj).forEach(([paint, zuz]) => {
            if (zuz > 0 && indEvents[paint]) {
                indEvents[paint].push({ dateObj, wydanie: 0, utylizacja: 0, zuzycie: zuz, rodzaj: 'ZUŻYCIE' });
            }
        });
    });

    induscoDailyRecords.forEach(r => {
        const wyd = parseFloat(r.wydanie) || 0; const uty = parseFloat(r.utylizacja) || 0;
        if ((wyd > 0 || uty > 0) && indEvents[r.paint]) {
            const dateObj = new Date(r.date);
            if (wyd > 0) indEvents[r.paint].push({ dateObj, wydanie: wyd, utylizacja: 0, zuzycie: 0, rodzaj: 'WYDANIE' });
            if (uty > 0) indEvents[r.paint].push({ dateObj, wydanie: 0, utylizacja: uty, zuzycie: 0, rodzaj: 'UTYLIZACJA' });
        }
    });

    allPaints.forEach(paint => {
        const events = indEvents[paint];
        events.sort((a, b) => {
            if(a.dateObj.getTime() !== b.dateObj.getTime()) return a.dateObj - b.dateObj;
            const order = { 'WYDANIE': 0, 'UTYLIZACJA': 1, 'ZUŻYCIE': 2, 'REMANENT': 3 };
            const typeA = a.rodzaj.startsWith('ZUŻYCIE') ? 'ZUŻYCIE' : a.rodzaj;
            const typeB = b.rodzaj.startsWith('ZUŻYCIE') ? 'ZUŻYCIE' : b.rodzaj;
            return (order[typeA] || 0) - (order[typeB] || 0);
        });
        
        let currentBalance = 0;
        events.forEach(ev => {
            if (ev.rodzaj === 'REMANENT') {
                const korekta = ev.rawAmount - currentBalance;
                window.remanentAdjustmentsIndusco[ev.induscoIndex] = korekta;
                currentBalance = ev.rawAmount;
            } else { 
                currentBalance += (ev.wydanie || 0) - (ev.utylizacja || 0) - (ev.zuzycie || 0); 
            }
        });
        window.currentInduscoStocks[paint] = currentBalance;
    });
    
    window.calcEvents = calcEvents;
    window.indEvents = indEvents;
    window.currentStocks = window.currentCalcStocks;
    window.remanentAdjustments = window.remanentAdjustmentsCalc;
    
    updateAlertsUI();
}

// ==========================================
// 3. TABELA MAGAZYNU GŁÓWNEGO (Wydania/Utylizacje)
// ==========================================

export function renderInduscoTable() {
    updateAllStocks();
    const tbody = document.getElementById('induscoTableBody');
    let theadTr = document.querySelector('#view-indusco table thead tr');
    
    if (theadTr) {
        theadTr.innerHTML = `
            <th class="px-3 py-2 border-r border-black">Data Zdarzenia</th>
            <th class="px-3 py-2 border-r border-black">Towar</th>
            <th class="px-3 py-2 border-r border-black text-right">Ilość [L]</th>
            <th class="px-3 py-2 border-r border-black">Akcja</th>
            <th class="px-3 py-2 border-r border-black">Autor & Akceptacja</th>
            <th id="colInduscoAction" class="px-3 py-2 text-center print-hide">Akcja</th>
        `;
    }

    if (!tbody) return; tbody.innerHTML = '';
    const isAdmin = currentUser && currentUser.role === 'admin';

    const fDateFromStr = document.getElementById('induscoFilterDateFrom') ? document.getElementById('induscoFilterDateFrom').value : '';
    const fDateToStr = document.getElementById('induscoFilterDateTo') ? document.getElementById('induscoFilterDateTo').value : '';
    const fPaint = document.getElementById('induscoFilterPaint') ? document.getElementById('induscoFilterPaint').value : '';
    const dFrom = fDateFromStr ? new Date(fDateFromStr) : new Date('1970-01-01'); dFrom.setHours(0,0,0,0);
    const dTo = fDateToStr ? new Date(fDateToStr) : new Date('2099-12-31'); dTo.setHours(23,59,59,999);

    const filteredData = induscoHistory.map((row, idx) => ({...row, originalIndex: idx})).filter(row => {
        const rowDate = parsePlDate(row.date);
        if (rowDate < dFrom || rowDate > dTo) return false;
        if (fPaint && !row.paintType.toUpperCase().includes(fPaint.toUpperCase())) return false;
        return true;
    });

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-3 py-2 text-center text-black font-bold uppercase border-b border-black">Brak zapisanych zdarzeń w wybranym okresie.</td></tr>`;
    } else {
        let html = '';
        [...filteredData].reverse().forEach((row) => {
            const i = row.originalIndex;
            let typeDisplay = escapeHTML(row.paintType); 
            let amountDisplay = formatNumber(row.amount, 2); 
            let trClass = "hover:bg-gray-100 transition-colors";
            
            let akcjaDisplay = "WYDANIE"; let akcjaColor = "text-green-700";
            
            if (row.actionType === 'utylizacja' || (row.amount < 0 && !row.isRemanent && row.actionType !== 'remanent')) {
                akcjaDisplay = "UTYLIZACJA"; akcjaColor = "text-red-600";
            }
            
            if (row.isRemanent || row.actionType === 'remanent') {
                typeDisplay += ` <span class="text-[9px] bg-yellow-300 text-black px-1 border border-black ml-2 font-bold uppercase">REMANENT</span>`;
                const korekta = window.remanentAdjustmentsCalc[i];
                if (korekta !== undefined) amountDisplay = (korekta > 0 ? "+" : "") + formatNumber(korekta, 2);
                else amountDisplay = formatNumber(row.amount, 2);
                
                akcjaDisplay = "REMANENT"; akcjaColor = "text-yellow-700"; trClass = "bg-yellow-50 hover:bg-yellow-100 transition-colors";
            } else if (row.amount < 0) {
                amountDisplay = formatNumber(Math.abs(row.amount), 2);
            }

            let authorHtml = `<div class="whitespace-normal text-[10px]">${row.author ? row.author.replace(/<[^>]*>?/gm, '') : '-'}</div>`;
            if (row.isAccepted) {
                authorHtml += `<div class="mt-1 text-[9px] text-green-700 font-bold uppercase border-t border-green-300 pt-0.5">ZAAKCEPTOWAŁ(A):<br>${escapeHTML(row.acceptedBy)}</div>`;
            } else if (row.rejectionComment) {
                authorHtml += `<div class="mt-1 text-[9px] text-red-700 font-bold border-t border-red-300 pt-0.5" title="${escapeHTML(row.rejectionComment)}"><span class="uppercase">ODRZUCONO:</span><br><span class="font-normal italic">${escapeHTML(row.rejectionComment)}</span></div>`;
            } else {
                authorHtml += `<div class="mt-1 text-[9px] text-orange-600 font-bold uppercase border-t border-orange-300 pt-0.5">OCZEKUJE</div>`;
            }

            let akcjeHtml = `<div class="flex flex-col gap-1 items-center w-16 mx-auto">`;
            akcjeHtml += `<button onclick="editInduscoRecord(${i})" class="w-full text-white bg-blue-600 font-bold uppercase text-[10px] border border-black px-1 py-0.5 hover:bg-blue-800 leading-none">Edytuj</button>`;
            
            if (!row.isAccepted) {
                if (row.rejectionComment) {
                     akcjeHtml += `<button onclick="acceptInduscoRecord(${i})" class="w-full text-white bg-green-600 font-bold uppercase text-[10px] border border-black px-1 py-0.5 hover:bg-green-700 leading-none">Zatwierdź</button>`;
                } else {
                     akcjeHtml += `<button onclick="acceptInduscoRecord(${i})" class="w-full text-white bg-green-600 font-bold uppercase text-[10px] border border-black px-1 py-0.5 hover:bg-green-700 leading-none">Akceptuj</button>`;
                     akcjeHtml += `<button onclick="rejectInduscoRecord(${i})" class="w-full text-white bg-red-600 font-bold uppercase text-[10px] border border-black px-1 py-0.5 hover:bg-red-700 leading-none">Odrzuć</button>`;
                }
            }
            if (isAdmin) {
                akcjeHtml += `<button onclick="removeInduscoRecord(${i})" class="w-full text-black font-bold uppercase text-[10px] border border-black px-1 py-0.5 hover:bg-black hover:text-white bg-white leading-none">Usuń</button>`;
            }
            akcjeHtml += `</div>`;

            html += `
                <tr class="${trClass}">
                    <td class="px-3 py-2 border-r border-black font-bold text-black align-middle">${row.date}</td>
                    <td class="px-3 py-2 border-r border-black text-black uppercase flex items-center align-middle">${typeDisplay}</td>
                    <td class="px-3 py-2 border-r border-black text-right font-bold text-black align-middle">${amountDisplay}</td>
                    <td class="px-3 py-2 border-r border-black font-bold ${akcjaColor} uppercase text-[10px] align-middle">${akcjaDisplay}</td>
                    <td class="px-3 py-2 border-r border-black text-black text-xs whitespace-normal align-middle">${authorHtml}</td>
                    <td class="px-3 py-2 text-center print-hide border-black align-middle">
                        ${akcjeHtml}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }
}

export function addInduscoBulkRow() {
    const container = document.getElementById('induscoBulkRows'); const row = document.createElement('div');
    row.className = "flex flex-wrap gap-2 items-end indusco-bulk-row";
    row.innerHTML = `<div class="flex-1 min-w-[200px]"><label class="block text-[10px] font-bold text-black mb-0.5 uppercase">Towar</label><select class="indusco-paint-select w-full border border-black p-1.5 text-sm outline-none bg-white">${window.getInduscoPaintsHtml ? window.getInduscoPaintsHtml() : ''}</select></div><div class="w-40"><label class="block text-[10px] font-bold text-black mb-0.5 uppercase">Akcja</label><select onchange="handleInduscoActionChange(this)" class="indusco-action-type w-full border border-black p-1.5 text-sm outline-none bg-white"><option value="wydanie">Wydanie</option><option value="utylizacja">Utylizacja / Zniszczenie</option><option value="remanent">Remanent</option></select></div><div class="w-32"><label class="block text-[10px] font-bold text-black mb-0.5 uppercase">Ilość [L]</label><input type="number" step="0.1" class="indusco-amount-input w-full border border-black p-1.5 text-sm outline-none"></div><button onclick="this.parentElement.remove()" class="bg-white text-black border border-black hover:bg-red-600 hover:text-white font-bold px-3 py-1.5 text-sm uppercase transition" title="Usuń ten wiersz">X</button>`;
    container.appendChild(row);
}

export async function saveBulkIndusco() {
    const dateVal = document.getElementById('induscoDate').value;
    if (!dateVal) { await window.customAlert("Wybierz datę przed zatwierdzeniem!"); return; }
    const rows = document.querySelectorAll('.indusco-bulk-row');
    if (rows.length === 0) { await window.customAlert("Dodaj przynajmniej jedną pozycję."); return; }
    const dateStr = new Date(dateVal).toLocaleDateString('pl-PL'); let addedCount = 0;

    let localAlerts = [...activeRemanentAlerts];
    let localRequests = [...activeInduscoRequests];

    rows.forEach(row => {
        const paintSelect = row.querySelector('.indusco-paint-select'), actionSelect = row.querySelector('.indusco-action-type'), amountInput = row.querySelector('.indusco-amount-input');
        if (paintSelect && amountInput && actionSelect) {
            const paintType = paintSelect.value, actionType = actionSelect.value, amount = parseFloat(amountInput.value);
            if (paintType && !isNaN(amount)) {
                let isRem = actionType === 'remanent';
                let finalAmount = amount;
                if (actionType === 'utylizacja') finalAmount = -Math.abs(amount);
                else if (actionType === 'wydanie') finalAmount = Math.abs(amount);
                
                induscoHistory.push({ 
                    id: 'ind_' + Date.now() + Math.random().toString(36).substr(2, 5), 
                    paintType, 
                    amount: finalAmount, 
                    actionType: actionType, 
                    isRemanent: isRem, 
                    date: dateStr, 
                    author: currentUser ? (currentUser.name || currentUser.login) : "Nieznany", 
                    lastModified: Date.now(),
                    isAccepted: false,
                    acceptedBy: null,
                    rejectionComment: null,
                    rejectedBy: null
                });
                
                if (isRem) {
                    localAlerts.push({ id: Date.now().toString() + Math.random().toString(36).substr(2, 5), date: dateStr, paintType: paintType, author: currentUser ? (currentUser.name || currentUser.login) : "Nieznany" });
                }
                if (actionType === 'wydanie') {
                    localRequests = localRequests.filter(req => req.paintType !== paintType);
                }
                addedCount++;
            }
        }
    });

    setActiveRemanentAlerts(localAlerts);
    setActiveInduscoRequests(localRequests);

    if (addedCount > 0) {
        renderInduscoTable(); if (document.getElementById('view-daily') && document.getElementById('view-daily').classList.contains('block')) { renderDailySidebar(); renderDailyLedger(); }
        autoSaveToDisk(); await window.customAlert(`Pomyślnie zapisano ${addedCount} pozycji.`);
        document.getElementById('induscoBulkRows').innerHTML = ''; addInduscoBulkRow(); 
    } else await window.customAlert("Nie dodano żadnych wpisów. Upewnij się, że wpisane ilości są prawidłowe.");
}

export async function acceptInduscoRecord(index) {
    if (index === undefined || index < 0 || index >= induscoHistory.length) return;
    
    if (await window.customConfirm("Czy na pewno chcesz potwierdzić ten wpis w magazynie?")) {
        window.forceNextCloudOverwrite = true;
        
        induscoHistory[index].isAccepted = true;
        induscoHistory[index].acceptedBy = currentUser ? (currentUser.name || currentUser.login) : "System";
        induscoHistory[index].rejectionComment = null;
        induscoHistory[index].rejectedBy = null;
        induscoHistory[index].lastModified = Date.now();
        
        if (window.setInduscoHistory) window.setInduscoHistory(induscoHistory);
        autoSaveToDisk(true);
        
        renderInduscoTable();
        if (document.getElementById('view-daily') && document.getElementById('view-daily').classList.contains('block')) { 
            renderDailySidebar(); renderDailyLedger(); 
        }
        await window.customAlert("Wpis został pomyślnie zaakceptowany.");
    }
}

export async function rejectInduscoRecord(index) {
    if (index === undefined || index < 0 || index >= induscoHistory.length) return;
    
    const comment = await window.customPrompt("Podaj powód odrzucenia:", "text");
    if (comment !== null && comment.trim() !== "") {
        window.forceNextCloudOverwrite = true;
        
        induscoHistory[index].isAccepted = false;
        induscoHistory[index].acceptedBy = null;
        induscoHistory[index].rejectionComment = comment.trim();
        induscoHistory[index].rejectedBy = currentUser ? (currentUser.name || currentUser.login) : "System";
        induscoHistory[index].lastModified = Date.now();
        
        if (window.setInduscoHistory) window.setInduscoHistory(induscoHistory);
        autoSaveToDisk(true);
        
        renderInduscoTable();
        if (document.getElementById('view-daily') && document.getElementById('view-daily').classList.contains('block')) { 
            renderDailySidebar(); renderDailyLedger(); 
        }
        await window.customAlert("Wpis został odrzucony.");
    } else if (comment !== null) {
        await window.customAlert("Komentarz do odrzucenia nie może być pusty!");
    }
}

export async function removeInduscoRecord(index) {
    if (!currentUser || currentUser.role !== 'admin') { await window.customAlert("Usuwanie jest dozwolone tylko dla administratora."); return; }
    const pin = await window.customPrompt("Podaj kod autoryzacji (PIN), aby usunąć wpis z historii:", 'password');
    if (pin === "4321") { 
        window.forceNextCloudOverwrite = true;
        induscoHistory.splice(index, 1); 
        renderInduscoTable(); 
        if (document.getElementById('view-daily') && document.getElementById('view-daily').classList.contains('block')) { renderDailySidebar(); renderDailyLedger(); } 
        autoSaveToDisk(); 
    } else if (pin !== null) await window.customAlert("Nieprawidłowy kod PIN.");
}

export function editInduscoRecord(index) {
    window.currentEditInduscoIndex = index; const record = induscoHistory[index];
    document.getElementById('editInduscoDate').value = parsePlDateToISO(record.date);
    let baseType = record.paintType.replace(/<[^>]*>?/gm, '').trim().replace("REMANENT", "").trim();
    document.getElementById('editInduscoPaint').value = baseType;
    let isUtylizacja = record.actionType === 'utylizacja' || (record.amount < 0 && !record.isRemanent && record.actionType !== 'remanent');
    let isRemanent = record.isRemanent || record.actionType === 'remanent';
    const actionEl = document.getElementById('editInduscoAction');
    if(actionEl) {
        if (isRemanent) actionEl.value = 'remanent';
        else if (isUtylizacja) actionEl.value = 'utylizacja';
        else actionEl.value = 'wydanie';
    }
    document.getElementById('editInduscoAmount').value = isRemanent ? record.amount : Math.abs(record.amount); 
    if (window.openEditInduscoModal) window.openEditInduscoModal();
}

export async function handleInduscoActionChange(selectEl) {
    if (selectEl.value === 'remanent') {
        await window.customAlert("Podaj wartość aktualną na magazynie - system sam obliczy zmiany ilości");
    }
}

export async function saveEditIndusco() {
    const index = window.currentEditInduscoIndex;
    const dIso = document.getElementById('editInduscoDate').value, type = document.getElementById('editInduscoPaint').value, actionEl = document.getElementById('editInduscoAction');
    const actionType = actionEl ? actionEl.value : 'wydanie'; const amtStr = document.getElementById('editInduscoAmount').value; const amt = parseFloat(amtStr);
    if (!dIso || !type || isNaN(amt) || amtStr.trim() === '') { await window.customAlert("Wypełnij poprawnie wszystkie pola!"); return; }

    const wasRem = induscoHistory[index].isRemanent || induscoHistory[index].actionType === 'remanent';
    let isRem = actionType === 'remanent';
    let finalAmt = amt;
    if (actionType === 'utylizacja') finalAmt = -Math.abs(amt);
    else if (actionType === 'wydanie') finalAmt = Math.abs(amt);

    if (!induscoHistory[index].id) induscoHistory[index].id = 'ind_' + Date.now() + Math.random().toString(36).substr(2, 5);
    
    window.forceNextCloudOverwrite = true;

    const currUserStr = currentUser ? (currentUser.name || currentUser.login) : "System";
    const editDateStr = new Date().toLocaleString('pl-PL', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'});
    const editInfo = `<br><span class="text-[9px] text-gray-500 font-normal">[Edycja: ${currUserStr} ${editDateStr}]</span>`;

    induscoHistory[index].date = formatISOToPL(dIso); induscoHistory[index].paintType = type;
    induscoHistory[index].actionType = actionType; induscoHistory[index].isRemanent = isRem;
    induscoHistory[index].amount = finalAmt; induscoHistory[index].author = (induscoHistory[index].author || "") + editInfo;
    
    induscoHistory[index].isAccepted = false;
    induscoHistory[index].acceptedBy = null;
    induscoHistory[index].rejectionComment = null;
    induscoHistory[index].rejectedBy = null;
    induscoHistory[index].lastModified = Date.now();

    let localAlerts = [...activeRemanentAlerts];
    let localRequests = [...activeInduscoRequests];

    if (!wasRem && isRem) {
        localAlerts.push({ id: Date.now().toString() + Math.random().toString(36).substr(2, 5), date: formatISOToPL(dIso), paintType: type, author: currentUser ? (currentUser.name || currentUser.login) : "System" });
    }
    if (actionType === 'wydanie') {
        localRequests = localRequests.filter(req => req.paintType !== type);
    }
    
    setActiveRemanentAlerts(localAlerts);
    setActiveInduscoRequests(localRequests);

    renderInduscoTable(); 
    if (document.getElementById('view-daily') && document.getElementById('view-daily').classList.contains('block')) { renderDailySidebar(); renderDailyLedger(); }
    autoSaveToDisk(); 
    if (window.closeEditInduscoModal) window.closeEditInduscoModal();
}

// ==========================================
// 4. ALERTY I POWIADOMIENIA
// ==========================================

export function updateAlertsUI() {
    let negativeAlerts = [];
    for (let paint in window.currentStocks) {
        if (window.currentStocks[paint] < 0) {
            negativeAlerts.push({ paint: paint, stock: window.currentStocks[paint] });
        }
    }
    window.currentNegativeAlerts = negativeAlerts;

    const alertCount = activeRemanentAlerts.length + negativeAlerts.length + activeInduscoRequests.length;
    const bellIcon = document.getElementById('notificationBellIcon');
    const badge = document.getElementById('notificationBadge');

    if (!bellIcon || !badge) return;

    if (alertCount > 0) {
        bellIcon.classList.add('animate-pulse', 'text-red-600');
        badge.textContent = alertCount;
        badge.classList.remove('hidden');
    } else {
        bellIcon.classList.remove('animate-pulse', 'text-red-600');
        badge.classList.add('hidden');
    }
}

export function acknowledgeRemanent(id) {
    const newAlerts = activeRemanentAlerts.filter(a => a.id !== id);
    setActiveRemanentAlerts(newAlerts);
    updateAlertsUI();
    if(window.openNotificationsModal) window.openNotificationsModal();
    autoSaveToDisk();
}

export async function submitInduscoRequest() {
    const paint = document.getElementById('induscoRequestPaint').value;
    if (!paint) { await window.customAlert('Wybierz farbę!'); return; }
    
    if (activeInduscoRequests.some(r => r.paintType === paint)) {
        await window.customAlert('Zapotrzebowanie na tę farbę zostało już wcześniej zgłoszone i jest aktywne.');
        return;
    }

    const dateStr = new Date().toLocaleString('pl-PL', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'});
    let localReqs = [...activeInduscoRequests];
    localReqs.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        date: dateStr,
        paintType: paint,
        author: currentUser ? (currentUser.name || currentUser.login) : "System"
    });
    
    setActiveInduscoRequests(localReqs);
    updateAlertsUI();
    autoSaveToDisk();
    if(window.closeInduscoRequestModal) window.closeInduscoRequestModal();
    await window.customAlert('Zapotrzebowanie zostało wysłane i dodane do alertów. Zniknie automatycznie po dodaniu dostawy ("Wydanie").');
}

export function renderNotificationsList() {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    let html = '';

    if (activeRemanentAlerts && activeRemanentAlerts.length > 0) {
        activeRemanentAlerts.forEach(alert => {
            html += `
                <div class="flex justify-between items-center p-2 border border-black bg-yellow-50">
                    <div>
                        <span class="font-bold text-xs uppercase">Remanent: ${escapeHTML(alert.paintType)}</span>
                        <div class="text-[10px] text-gray-600">Zgłoszono: ${alert.date} przez ${escapeHTML(alert.author || 'System')}</div>
                    </div>
                    <button onclick="acknowledgeRemanent('${alert.id}')" class="bg-black text-white px-2 py-1 text-[10px] uppercase font-bold hover:bg-gray-800">Potwierdź</button>
                </div>
            `;
        });
    }

    if (window.currentNegativeAlerts && window.currentNegativeAlerts.length > 0) {
        window.currentNegativeAlerts.forEach(neg => {
            html += `
                <div class="flex justify-between items-center p-2 border border-black bg-red-50">
                    <div>
                        <span class="font-bold text-xs text-red-700 uppercase">Ujemny stan: ${escapeHTML(neg.paint)}</span>
                        <div class="text-[10px] text-red-600">Aktualny stan: ${formatNumber(neg.stock, 1)} L</div>
                    </div>
                    <span class="text-[10px] font-bold uppercase bg-red-200 px-2 py-1 border border-black">Alarm</span>
                </div>
            `;
        });
    }

    if (activeInduscoRequests && activeInduscoRequests.length > 0) {
        activeInduscoRequests.forEach(req => {
            html += `
                <div class="flex justify-between items-center p-2 border border-black bg-blue-50">
                    <div>
                        <span class="font-bold text-xs text-blue-800 uppercase">Zapotrzebowanie Indusco: ${escapeHTML(req.paintType)}</span>
                        <div class="text-[10px] text-gray-600">Zgłoszono: ${req.date} przez ${escapeHTML(req.author || 'System')}</div>
                    </div>
                    <span class="text-[10px] font-bold uppercase bg-blue-200 px-2 py-1 border border-black">Oczekuje</span>
                </div>
            `;
        });
    }

    if (!html) {
        html = `<div class="text-center py-4 font-bold text-xs uppercase text-gray-500">Brak nowych powiadomień i alertów.</div>`;
    }

    container.innerHTML = html;
}

export function openNotificationsModal() { 
    const m = document.getElementById('notificationsModal'); 
    if (m) { 
        m.classList.remove('hidden'); 
        m.classList.add('flex'); 
        renderNotificationsList(); 
    } 
}

// ==========================================
// 5. ROZLICZENIA DZIENNE (GLOBALNE I INDUSCO)
// ==========================================

export function renderDailySidebar() {
    const sidebar = document.getElementById('dailyPaintSidebar'); if (!sidebar) return;
    updateAllStocks();
    const paints = initDailyPaints(); 
    if (!currentDailyPaint || !paints.includes(currentDailyPaint)) currentDailyPaint = paints.length > 0 ? paints[0] : null;
    sidebar.innerHTML = '';
    paints.forEach(paint => {
        const isSelected = currentDailyPaint === paint; 
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-3 py-2.5 border-b border-gray-300 font-bold text-xs uppercase transition-colors ${isSelected ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-black hover:bg-gray-100'}`;
        
        let stock = window.currentCalcStocks[paint] || 0;
        let stockClass = stock <= 0 ? (isSelected ? 'text-red-200' : 'text-red-600') : (isSelected ? 'text-blue-200' : 'text-gray-500');
        
        btn.innerHTML = `<div class="flex justify-between items-center gap-1"><span class="truncate" title="${paint}">${paint}</span><span class="text-[10px] whitespace-nowrap ${stockClass}">${formatNumber(stock, 1)} L</span></div>`;
        btn.onclick = () => selectDailyPaint(paint); 
        sidebar.appendChild(btn);
    });
    const title = document.getElementById('dailySelectedPaintTitle'); if (title) title.textContent = currentDailyPaint || "BRAK FARB";
    
    const monthInput = document.getElementById('dailyMonthInput');
    if (monthInput && !monthInput.value) monthInput.value = new Date().toISOString().slice(0, 7);
}

export function selectDailyPaint(paint) { 
    currentDailyPaint = paint; 
    renderDailySidebar(); renderDailyLedger(); 
    setTimeout(() => {
        const tableContainer = document.querySelector('#view-daily .overflow-auto');
        if (tableContainer) tableContainer.scrollTop = tableContainer.scrollHeight;
    }, 50);
}

export function toggleDailySidebar() { 
    const sidebar = document.getElementById('dailyPaintSidebarWrapper'); 
    sidebar.classList.toggle('hidden'); sidebar.classList.toggle('flex'); 
}

export function printDailyLedger() { 
    document.body.classList.add('print-daily'); window.print(); document.body.classList.remove('print-daily'); 
}

export function changeDailyMonth(delta) {
    const input = document.getElementById('dailyMonthInput');
    if (!input || !input.value) return;
    let [y, m] = input.value.split('-').map(Number);
    m += delta;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    input.value = `${y}-${String(m).padStart(2, '0')}`;
    renderDailyLedger();
}

export function renderDailyLedger() {
    const tbody = document.getElementById('dailyTableBody'); const tfoot = document.getElementById('dailyTableFoot');
    if (!tbody || !tfoot || !currentDailyPaint) return;
    
    let monthInput = document.getElementById('dailyMonthInput');
    let monthVal = monthInput ? monthInput.value : '';
    if(!monthVal) {
        monthVal = new Date().toISOString().slice(0, 7);
        if(monthInput) monthInput.value = monthVal;
    }
    let [year, month] = monthVal.split('-');
    year = parseInt(year); month = parseInt(month) - 1;

    const events = window.calcEvents ? (window.calcEvents[currentDailyPaint] || []) : [];
    const todayIso = dateToISO(new Date());

    let currentBalance = 0;
    let sumDostawa = 0, sumUtylizacja = 0, sumZuzycie = 0, sumM2 = 0;
    let html = '';

    events.forEach(ev => {
        if (ev.dateObj.getFullYear() < year || (ev.dateObj.getFullYear() === year && ev.dateObj.getMonth() < month)) {
            let valZuzycie = ev.zuzycie || 0;
            if (ev.rodzaj === 'REMANENT') {
                currentBalance = ev.rawAmount;
            } else { 
                currentBalance += (ev.wydanie || 0) - (ev.utylizacja || 0) - valZuzycie; 
            }
        }
    });

    const currentMonthEvents = events.filter(ev => ev.dateObj.getFullYear() === year && ev.dateObj.getMonth() === month);

    currentMonthEvents.forEach(ev => {
        let valZuzycie = ev.zuzycie || 0;

        if (ev.rodzaj === 'REMANENT') {
            const diff = ev.rawAmount - currentBalance;
            valZuzycie = -diff; 
            currentBalance = ev.rawAmount;
        } else { 
            currentBalance += (ev.wydanie || 0) - (ev.utylizacja || 0) - valZuzycie; 
        }
        ev.pozostalo = currentBalance;

        if (ev.rodzaj === 'REMANENT') {
            sumZuzycie += valZuzycie; 
        } else {
            sumDostawa += ev.wydanie || 0; sumUtylizacja += ev.utylizacja || 0; sumZuzycie += valZuzycie; 
        }
        sumM2 += ev.m2 || 0;
        
        let zuzycieClass = "text-black"; let zuzycieText = "";
        if (ev.rodzaj === 'REMANENT') {
            zuzycieClass = valZuzycie > 0 ? "text-red-600" : "text-green-700";
            zuzycieText = (valZuzycie > 0 ? "+" : "") + formatNumber(valZuzycie);
        } else if (valZuzycie > 0) {
            zuzycieClass = "text-blue-700"; zuzycieText = formatNumber(valZuzycie);
        }

        let calcDisplay = ev.kalkulacja || '-';
        if (ev.kalkulacja && ev.kalkulacja !== '-') {
            if (ev.isAccepted) {
                calcDisplay += `<div class="mt-0.5 text-[9px] text-green-800 font-bold bg-green-100 border border-green-800 px-1 py-0.5 whitespace-nowrap">ZAAKCEPTOWANO</div>`;
            } else if (ev.rejectionComment) {
                calcDisplay += `<div class="mt-0.5 text-[9px] text-red-800 font-bold bg-red-100 border border-red-800 px-1 py-0.5 whitespace-nowrap truncate max-w-[150px]" title="${escapeHTML(ev.rejectionComment)}">ODRZUCONO: ${escapeHTML(ev.rejectionComment)}</div>`;
            } else {
                calcDisplay += `<div class="mt-0.5 text-[9px] text-orange-700 font-bold bg-orange-100 border border-orange-700 px-1 py-0.5 whitespace-nowrap">OCZEKUJE</div>`;
            }
        } else if (ev.author) {
            let cleanAuthor = ev.author.replace(/<[^>]*>?/gm, '');
            calcDisplay = `<div class="text-[9px] text-gray-500 font-normal truncate max-w-[150px] uppercase" title="Wprowadził(a): ${escapeHTML(cleanAuthor)}">${escapeHTML(cleanAuthor)}</div>`;
            
            if (ev.isAccepted) {
                calcDisplay += `<div class="mt-0.5 text-[9px] text-green-800 font-bold bg-green-100 border border-green-800 px-1 py-0.5 whitespace-nowrap">ZAAKCEPTOWANO</div>`;
            } else if (ev.rejectionComment) {
                calcDisplay += `<div class="mt-0.5 text-[9px] text-red-800 font-bold bg-red-100 border border-red-800 px-1 py-0.5 whitespace-nowrap truncate max-w-[150px]" title="${escapeHTML(ev.rejectionComment)}">ODRZUCONO: ${escapeHTML(ev.rejectionComment)}</div>`;
            } else {
                calcDisplay += `<div class="mt-0.5 text-[9px] text-orange-700 font-bold bg-orange-100 border border-orange-700 px-1 py-0.5 whitespace-nowrap">OCZEKUJE</div>`;
            }
        }

        const evDateIso = dateToISO(ev.dateObj);
        const displayDate = formatISOToPL(evDateIso);
        let rowClass = (evDateIso === todayIso) ? "bg-yellow-100 hover:bg-yellow-200 border-b border-yellow-300" : "hover:bg-gray-50 border-b border-gray-200 bg-white";

        html += `<tr class="${rowClass}">
            <td class="px-2 py-1 border-r border-black font-bold align-middle text-black">${displayDate}</td>
            <td class="px-2 py-1 border-r border-black font-bold uppercase align-middle">${ev.jednostka || '-'}</td>
            <td class="px-2 py-1 border-r border-black text-green-700 font-bold text-center align-middle">${ev.wydanie > 0 ? formatNumber(ev.wydanie) : ''}</td>
            <td class="px-2 py-1 border-r border-black text-red-600 font-bold text-center align-middle">${ev.utylizacja > 0 ? formatNumber(ev.utylizacja) : ''}</td>
            <td class="px-2 py-1 border-r border-black font-bold text-right px-2 ${zuzycieClass} align-middle">${zuzycieText}</td>
            <td class="px-2 py-1 border-r border-black font-bold bg-yellow-50 text-black text-sm text-right px-2 align-middle">${formatNumber(ev.pozostalo)}</td>
            <td class="px-2 py-1 border-r border-black text-blue-700 font-bold text-center align-middle">${ev.m2 > 0 ? formatNumber(ev.m2) : ''}</td>
            <td class="px-2 py-1 border-r border-black text-gray-700 font-bold uppercase text-[10px] align-middle">${ev.rodzaj}</td>
            <td class="px-2 py-1 border-r border-black text-gray-700 font-bold text-[10px] uppercase align-middle">${calcDisplay}</td>
            <td class="px-2 py-1 border-b border-black text-center print-hide align-middle">${ev.akcje || '-'}</td>
        </tr>`;
    });

    if (currentMonthEvents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-6 font-bold uppercase text-gray-500 text-center">Brak zdarzeń w wybranym miesiącu.</td></tr>`;
    } else {
        tbody.innerHTML = html;
    }

    tfoot.innerHTML = `<tr><td colspan="2" class="px-2 py-1.5 border-r border-black text-right uppercase text-black font-bold bg-gray-200">SUMA W MIESIĄCU:</td><td class="px-2 py-1.5 border-r border-black text-green-700 font-bold text-center bg-gray-200 text-sm">${formatNumber(sumDostawa)}</td><td class="px-2 py-1.5 border-r border-black text-red-600 font-bold text-center bg-gray-200 text-sm">${formatNumber(sumUtylizacja)}</td><td class="px-2 py-1.5 border-r border-black font-bold text-right px-2 bg-gray-200 text-blue-700 text-sm">${formatNumber(sumZuzycie)}</td><td class="px-2 py-1.5 border-r border-black font-bold bg-yellow-100 text-black text-right px-2 text-sm">${formatNumber(currentBalance)}</td><td class="px-2 py-1.5 border-r border-black text-blue-700 font-bold text-center bg-gray-200 text-sm">${formatNumber(sumM2)}</td><td colspan="3" class="px-2 py-1.5 bg-gray-200 border-black print-hide"></td></tr>`;
}

export function renderDailyInduscoSidebar() {
    const sidebar = document.getElementById('dailyInduscoSidebar'); if (!sidebar) return;
    updateAllStocks();
    const paints = initDailyPaints(); 
    if (!currentDailyInduscoPaint || !paints.includes(currentDailyInduscoPaint)) currentDailyInduscoPaint = paints.length > 0 ? paints[0] : null;
    sidebar.innerHTML = '';
    paints.forEach(paint => {
        const isSelected = currentDailyInduscoPaint === paint; 
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-3 py-2.5 border-b border-gray-300 font-bold text-xs uppercase transition-colors ${isSelected ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-black hover:bg-gray-100'}`;
        
        let stock = window.currentInduscoStocks[paint] || 0;
        let stockClass = stock <= 0 ? (isSelected ? 'text-red-200' : 'text-red-600') : (isSelected ? 'text-blue-200' : 'text-gray-500');

        btn.innerHTML = `<div class="flex justify-between items-center gap-1"><span class="truncate" title="${paint}">${paint}</span><span class="text-[10px] whitespace-nowrap ${stockClass}">${formatNumber(stock, 1)} L</span></div>`;
        btn.onclick = () => { currentDailyInduscoPaint = paint; renderDailyInduscoSidebar(); renderDailyInduscoLedger(); }; 
        sidebar.appendChild(btn);
    });
    const title = document.getElementById('dailyInduscoSelectedPaintTitle'); if (title) title.textContent = currentDailyInduscoPaint || "BRAK FARB";
    
    const monthInput = document.getElementById('induscoDailyMonthInput');
    if (monthInput && !monthInput.value) monthInput.value = new Date().toISOString().slice(0, 7);
}

export function addInduscoDailyRow(dateIso) {
    if (!currentDailyInduscoPaint) return;
    const newRecords = [...induscoDailyRecords];
    newRecords.push({
        id: 'id_' + Date.now() + Math.random().toString(36).substr(2, 5),
        date: dateIso, paint: currentDailyInduscoPaint, unit: '', m2: '', matType: 'Blachy', lastModified: Date.now()
    });
    setInduscoDailyRecords(newRecords);
    autoSaveToDisk(); renderDailyInduscoLedger();
    setTimeout(() => {
        const tableContainer = document.querySelector('#view-daily-indusco .overflow-auto');
        const addedInput = document.querySelector(`input[onchange*="'${newRecords[newRecords.length-1].id}'"]`);
        if (addedInput && tableContainer) {
            tableContainer.scrollTop = addedInput.offsetTop - 100;
            addedInput.focus();
        }
    }, 50);
}

export function removeInduscoDailyRow(id) {
    window.forceNextCloudOverwrite = true;
    const newRecords = induscoDailyRecords.filter(r => r.id !== id);
    setInduscoDailyRecords(newRecords);
    updateAllStocks();
    renderDailyInduscoSidebar();
    autoSaveToDisk(); renderDailyInduscoLedger();
}

export function updateInduscoDailyRecord(id, dateIso, field, value) {
    let newRecords = [...induscoDailyRecords];
    let record = newRecords.find(r => r.id === id);
    if (!record && id.startsWith('new_')) {
        record = { id: 'id_' + Date.now() + Math.random().toString(36).substr(2, 5), date: dateIso, paint: currentDailyInduscoPaint, unit: '', wydanie: '', utylizacja: '', m2: '', matType: 'Blachy', lastModified: Date.now() };
        newRecords.push(record);
    }
    if (record) {
        record.lastModified = Date.now();
        if (field === 'unit' || field === 'matType') record[field] = value.toUpperCase();
        else {
            let num = parseFloat(value.toString().replace(',', '.'));
            record[field] = isNaN(num) ? '' : num;
        }
        
        if (field === 'm2' || field === 'matType') {
            const parts = record.paint.split(' - ');
            const brandId = parts[0];
            const pt = paintTypes.find(p => p.id === brandId);
            const m2 = parseFloat(record.m2) || 0;
            
            if (pt && m2 > 0) {
                const isProfile = (record.matType || '').toLowerCase().includes('profil');
                const y = isProfile ? pt.yieldProfile : pt.yieldBlachy;
                if (y > 0) { record.zuz = m2 / y; record.thinnerZuz = record.zuz * (pt.thinnerPct / 100); } 
                else { record.zuz = 0; record.thinnerZuz = 0; }
            } else { record.zuz = 0; record.thinnerZuz = 0; }
        }

        setInduscoDailyRecords(newRecords);
        updateAllStocks();
        renderDailyInduscoSidebar();
        autoSaveToDisk(); renderDailyInduscoLedger();
    }
}

export function changeInduscoMonth(delta) {
    const input = document.getElementById('induscoDailyMonthInput');
    if (!input || !input.value) return;
    let [y, m] = input.value.split('-').map(Number);
    m += delta;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    input.value = `${y}-${String(m).padStart(2, '0')}`;
    renderDailyInduscoLedger();
}

export function renderDailyInduscoLedger() {
    const tbody = document.getElementById('dailyInduscoTableBody'); const tfoot = document.getElementById('dailyInduscoTableFoot');
    if (!tbody || !tfoot || !currentDailyInduscoPaint) return;
    
    const monthVal = document.getElementById('induscoDailyMonthInput').value;
    if(!monthVal) return;
    let [year, month] = monthVal.split('-');
    year = parseInt(year); month = parseInt(month) - 1;
    
    const datesToRender = [];
    datesToRender.push(new Date(year, month, 0));
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) datesToRender.push(new Date(year, month, d));
    datesToRender.push(new Date(year, month + 1, 1));

    const todayIso = dateToISO(new Date());
    const events = window.indEvents ? (window.indEvents[currentDailyInduscoPaint] || []) : [];
    let currentBalance = 0;
    
    events.forEach(ev => {
        if (ev.dateObj < datesToRender[0]) currentBalance += (ev.wydanie || 0) - (ev.utylizacja || 0) - (ev.zuzycie || 0);
    });

    tbody.innerHTML = '';
    let sumWydanie = 0, sumUtylizacja = 0, sumZuzycie = 0, sumM2 = 0;

    const isThinnerCurrent = currentDailyInduscoPaint.includes('Rozcieńczalnik');
    const currentBrandId = currentDailyInduscoPaint.split(' - ')[0];
    const currentPt = paintTypes.find(p => p.id === currentBrandId);

    let html = '';

    datesToRender.forEach((dObj) => {
        const dateIso = dateToISO(dObj);
        const displayDate = `${String(dObj.getDate()).padStart(2, '0')}.${String(dObj.getMonth() + 1).padStart(2, '0')}.${dObj.getFullYear()}`;
        const isCurrentMonth = (dObj.getMonth() === month);
        
        let dayWyd = 0, dayUty = 0, dayZuzTotal = 0;
        
        events.filter(e => dateToISO(e.dateObj) === dateIso).forEach(e => {
            dayWyd += e.wydanie || 0; dayUty += e.utylizacja || 0; dayZuzTotal += e.zuzycie || 0;
        });

        currentBalance += dayWyd - dayUty - dayZuzTotal;

        let dayRecords = induscoDailyRecords.filter(r => r.date === dateIso && r.paint === currentDailyInduscoPaint);
        if (dayRecords.length === 0) dayRecords = [{ id: 'new_' + dateIso, date: dateIso, unit: '', wydanie: '', utylizacja: '', m2: '', matType: 'Blachy' }];

        let autoUnit = '';
        if (isThinnerCurrent) {
            const basePaintsUnits = new Set();
            induscoDailyRecords.filter(record => 
                record.date === dateIso && record.paint.startsWith(currentBrandId + ' - ') && 
                !record.paint.includes('Rozcieńczalnik') && record.unit && record.unit.trim() !== ''
            ).forEach(record => basePaintsUnits.add(record.unit.trim().toUpperCase()));
            autoUnit = Array.from(basePaintsUnits).join(' + ');
        }

        dayRecords.forEach((r, idx) => {
            let rowZuz = 0;
            if (isThinnerCurrent) {
                rowZuz = (idx === 0) ? dayZuzTotal : 0;
            } else {
                if (r.zuz !== undefined) rowZuz = r.zuz;
                else {
                    const m2 = parseFloat(r.m2) || 0;
                    if (currentPt && m2 > 0) {
                        const isProfile = (r.matType || '').toLowerCase().includes('profil');
                        const y = isProfile ? currentPt.yieldProfile : currentPt.yieldBlachy;
                        if (y > 0) rowZuz = m2 / y;
                    }
                }
            }

            if (isCurrentMonth) {
                if (idx === 0) { sumWydanie += dayWyd; sumUtylizacja += dayUty; }
                sumZuzycie += rowZuz;
                if (!isThinnerCurrent) sumM2 += parseFloat(r.m2) || 0;
            }

            const isFirst = idx === 0;
            const dateCellContent = isFirst 
                ? `<div class="flex items-center justify-between px-1"><span>${displayDate}</span><button onclick="addInduscoDailyRow('${dateIso}')" class="text-xs font-bold text-gray-500 hover:text-black border border-transparent hover:border-gray-400 bg-transparent hover:bg-gray-200 px-1 py-0 leading-none transition-colors print-hide" title="Dodaj wiersz">+</button></div>`
                : `<div class="flex items-center justify-between px-1"><span>${displayDate}</span><button onclick="removeInduscoDailyRow('${r.id}')" class="text-xs font-bold text-red-500 hover:text-white border border-transparent hover:border-red-600 bg-transparent hover:bg-red-500 px-1 py-0 leading-none transition-colors print-hide" title="Usuń wiersz">-</button></div>`;

            const inputClass = "w-full bg-transparent hover:bg-yellow-50 focus:bg-white border border-transparent focus:border-black outline-none text-right font-bold px-1 py-0.5 transition-all text-xs";
            const selectClass = "w-full bg-transparent hover:bg-yellow-50 focus:bg-white border border-transparent focus:border-black outline-none font-bold px-1 py-0.5 transition-all text-xs";
            
            let rowClass = (dateIso === todayIso) ? "bg-yellow-100 hover:bg-yellow-200 border-b border-yellow-300" : (!isCurrentMonth ? "bg-green-100 hover:bg-green-200 border-b border-green-300 italic text-gray-700" : "bg-white hover:bg-gray-50 border-b border-gray-200");
            
            const isProfile = (r.matType || '').toLowerCase().includes('profil');
            let allProjects = [...projectsList.map(p=>p.name)];
            if (r.unit && !allProjects.includes(r.unit)) allProjects.push(r.unit);
            
            let unitSelectHTML = isThinnerCurrent && idx === 0
                ? `<select class="${selectClass} text-center uppercase text-gray-500" disabled><option>${autoUnit || '-'}</option></select>`
                : `<select class="${selectClass} text-center uppercase w-full min-w-[80px]" onchange="updateInduscoDailyRecord('${r.id}', '${dateIso}', 'unit', this.value)"><option value="">-</option>${allProjects.map(p => `<option value="${p}" ${r.unit === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`;

            const wydInput = `<input type="number" step="0.1" min="0" class="${inputClass} text-green-700" value="${r.wydanie !== '' && r.wydanie !== undefined ? r.wydanie : ''}" onchange="updateInduscoDailyRecord('${r.id}', '${dateIso}', 'wydanie', this.value)">`;
            const utyInput = `<input type="number" step="0.1" min="0" class="${inputClass} text-red-600" value="${r.utylizacja !== '' && r.utylizacja !== undefined ? r.utylizacja : ''}" onchange="updateInduscoDailyRecord('${r.id}', '${dateIso}', 'utylizacja', this.value)">`;

            let displayZuz = rowZuz > 0 ? formatNumber(rowZuz) : '-';
            const displayBal = (idx === dayRecords.length - 1) ? formatNumber(currentBalance) : '-';

            const m2Input = isThinnerCurrent 
                ? `<input type="text" class="${inputClass} text-center text-gray-400" value="AUTO" disabled>` 
                : `<input type="number" step="0.1" min="0" class="${inputClass} ${isCurrentMonth ? 'text-blue-700' : ''}" value="${r.m2 !== '' ? r.m2 : ''}" onchange="updateInduscoDailyRecord('${r.id}', '${dateIso}', 'm2', this.value)">`;
            
            const matSelect = isThinnerCurrent 
                ? `<select class="${selectClass} uppercase text-center text-gray-400" disabled><option>-</option></select>` 
                : `<select class="${selectClass} uppercase text-center" onchange="updateInduscoDailyRecord('${r.id}', '${dateIso}', 'matType', this.value)"><option value="Blachy" ${!isProfile?'selected':''}>BLACHY</option><option value="Profile" ${isProfile?'selected':''}>PROFILE/RURY</option></select>`;

            html += `<tr class="${rowClass}"><td class="border-r border-black font-bold align-middle ${isCurrentMonth ? 'text-black' : ''}">${dateCellContent}</td><td class="border-r border-black">${unitSelectHTML}</td><td class="border-r border-black">${wydInput}</td><td class="border-r border-black">${utyInput}</td><td class="border-r border-black font-bold text-blue-700 text-right px-2 align-middle bg-gray-50 text-xs">${displayZuz}</td><td class="border-r border-black font-bold text-black text-right px-2 align-middle bg-yellow-50 text-xs">${displayBal}</td><td class="border-r border-black">${m2Input}</td><td class="border-black">${matSelect}</td></tr>`;
        });
    });
    tbody.innerHTML = html;
    tfoot.innerHTML = `<tr><td colspan="2" class="px-2 py-1.5 border-r border-black text-right uppercase text-black font-bold bg-gray-200">SUMA Z MIESIĄCA (BEZ SKRAJNYCH DNI):</td><td class="px-2 py-1.5 border-r border-black text-green-700 font-bold text-center bg-gray-200 text-sm">${formatNumber(sumWydanie)}</td><td class="px-2 py-1.5 border-r border-black text-red-600 font-bold text-center bg-gray-200 text-sm">${formatNumber(sumUtylizacja)}</td><td class="px-2 py-1.5 border-r border-black font-bold text-right bg-gray-200 text-blue-700 text-sm">${formatNumber(sumZuzycie)}</td><td class="px-2 py-1.5 border-r border-black font-bold bg-yellow-100 text-black text-right text-sm">${formatNumber(currentBalance)}</td><td class="px-2 py-1.5 border-r border-black text-blue-700 font-bold text-right bg-gray-200 text-sm">${formatNumber(sumM2)}</td><td class="bg-gray-200 border-black"></td></tr>`;
}

// Bindowanie do window
window.getAllPossibleDailyPaints = getAllPossibleDailyPaints;
window.initDailyPaints = initDailyPaints;
window.openConfigDailyPaints = openConfigDailyPaints;
window.saveDailyPaintsConfig = saveDailyPaintsConfig;
window.updateAllStocks = updateAllStocks;
window.renderInduscoTable = renderInduscoTable;
window.addInduscoBulkRow = addInduscoBulkRow;
window.saveBulkIndusco = saveBulkIndusco;
window.removeInduscoRecord = removeInduscoRecord;
window.editInduscoRecord = editInduscoRecord;
window.handleInduscoActionChange = handleInduscoActionChange;
window.saveEditIndusco = saveEditIndusco;
window.updateAlertsUI = updateAlertsUI;
window.acknowledgeRemanent = acknowledgeRemanent;
window.submitInduscoRequest = submitInduscoRequest;
window.renderDailySidebar = renderDailySidebar;
window.selectDailyPaint = selectDailyPaint;
window.toggleDailySidebar = toggleDailySidebar;
window.printDailyLedger = printDailyLedger;
window.renderDailyLedger = renderDailyLedger;
window.changeDailyMonth = changeDailyMonth;
window.renderDailyInduscoSidebar = renderDailyInduscoSidebar;
window.addInduscoDailyRow = addInduscoDailyRow;
window.removeInduscoDailyRow = removeInduscoDailyRow;
window.updateInduscoDailyRecord = updateInduscoDailyRecord;
window.changeInduscoMonth = changeInduscoMonth;
window.renderDailyInduscoLedger = renderDailyInduscoLedger;
window.renderNotificationsList = renderNotificationsList;
window.openNotificationsModal = openNotificationsModal;

// UDOSTĘPNIENIE FUNKCJI DLA PLIKU HTML (W TYM AKCEPTACJA WYDAŃ)
window.acceptInduscoRecord = acceptInduscoRecord;
window.rejectInduscoRecord = rejectInduscoRecord;
window.submitInduscoRequest = submitInduscoRequest;
window.saveBulkIndusco = saveBulkIndusco;
window.handleInduscoActionChange = handleInduscoActionChange;
window.saveEditIndusco = saveEditIndusco;
window.changeInduscoMonth = changeInduscoMonth;
