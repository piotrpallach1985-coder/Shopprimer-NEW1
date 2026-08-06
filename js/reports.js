// --- MODUŁ RAPORTÓW I WYKRESÓW PORÓWNAWCZYCH (REPORTS.JS) ---

import { formatNumber, escapeHTML, parsePlDate, dateToISO, formatISOToPL } from './utils.js';
import { printHistory, induscoDailyRecords, paintTypes } from './store.js';

let chartM2Instance = null;
let chartZuzInstance = null;

// ==========================================
// FUNKCJA POMOCNICZA: GENEROWANIE MIESIĘCY
// ==========================================
function populateMonthOptions(selectElement) {
    if (!selectElement) return;
    
    const monthsSet = new Set();
    const today = new Date();
    monthsSet.add(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
    
    printHistory.forEach(h => {
        if (!h.isError && h.date) {
            const d = parsePlDate(h.date);
            if (!isNaN(d.getTime())) {
                monthsSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
        }
    });

    const sortedMonths = Array.from(monthsSet).sort().reverse();
    
    if (selectElement.options.length === 0) {
        selectElement.innerHTML = sortedMonths.map(m => {
            const [y, mo] = m.split('-');
            return `<option value="${m}">${mo}.${y}</option>`;
        }).join('');
        selectElement.value = sortedMonths[0]; 
    }
}

// ==========================================
// 1. RAPORT MIESIĘCZNY (M2 I KOSZTY)
// ==========================================

export function renderMonthlyReport() {
    const tbody = document.getElementById('monthlyReportTableBody');
    const tfoot = document.getElementById('monthlyReportTableFoot');
    const monthInput = document.getElementById('reportMonthSelector');
    
    if (monthInput) populateMonthOptions(monthInput);

    const monthVal = monthInput ? monthInput.value : null;
    const printDateSpan = document.querySelector('.print-date-report');
    
    if (!tbody || !tfoot || !monthVal) return;
    
    const [fYear, fMonth] = monthVal.split('-');
    const reportMonthLabel = `${fMonth}.${fYear}`;
    if (printDateSpan) printDateSpan.textContent = `Podsumowanie za miesiąc: ${reportMonthLabel}`;

    const units = {};
    let totalBlachy = 0, totalProfile = 0, totalArea = 0, totalCost = 0;

    printHistory.forEach(h => {
        if (h.isError) return;
        const rowDate = parsePlDate(h.date);
        if (rowDate.getFullYear() === parseInt(fYear) && (rowDate.getMonth() + 1) === parseInt(fMonth)) {
            const pName = (h.projectName || h.unit || "BRAK NAZWY").toUpperCase().trim();
            if (!units[pName]) units[pName] = { blachy: 0, profile: 0, area: 0, cost: 0 };
            
            units[pName].blachy += (h.areaBlachy || 0);
            units[pName].profile += (h.areaProfile || 0);
            units[pName].area += (h.area || 0);
            units[pName].cost += (h.cost || 0);
            
            totalBlachy += (h.areaBlachy || 0);
            totalProfile += (h.areaProfile || 0);
            totalArea += (h.area || 0);
            totalCost += (h.cost || 0);
        }
    });

    tbody.innerHTML = '';
    const unitKeys = Object.keys(units).sort();
    
    if (unitKeys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-3 py-4 text-center text-gray-500 font-bold uppercase">Brak zapisanych kalkulacji dla wybranego miesiąca.</td></tr>`;
        tfoot.innerHTML = ''; return;
    }

    let html = '';
    unitKeys.forEach(u => {
        const data = units[u];
        const safeU = escapeHTML(u);
        html += `
            <tr class="hover:bg-gray-50 transition-colors border-b border-black">
                <td class="px-3 py-2 border-r border-black font-bold text-black">${safeU}</td>
                <td class="px-3 py-2 border-r border-black text-right text-black">${formatNumber(data.blachy, 2)}</td>
                <td class="px-3 py-2 border-r border-black text-right text-black">${formatNumber(data.profile, 2)}</td>
                <td class="px-3 py-2 border-r border-black text-right font-bold text-blue-700">${formatNumber(data.area, 2)}</td>
                <td class="px-3 py-2 text-right font-bold text-green-700">${formatNumber(data.cost, 2)}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;

    tfoot.innerHTML = `
        <tr>
            <td class="px-3 py-2 border-r border-black text-right">SUMA CAŁKOWITA:</td>
            <td class="px-3 py-2 border-r border-black text-right text-black">${formatNumber(totalBlachy, 2)}</td>
            <td class="px-3 py-2 border-r border-black text-right text-black">${formatNumber(totalProfile, 2)}</td>
            <td class="px-3 py-2 border-r border-black text-right text-blue-800">${formatNumber(totalArea, 2)}</td>
            <td class="px-3 py-2 text-right text-green-800">${formatNumber(totalCost, 2)}</td>
        </tr>
    `;
}

// ==========================================
// 2. RAPORT ZUŻYCIA FARB (LITRY)
// ==========================================

export function renderPaintReport() {
    const tbody = document.getElementById('paintReportTableBody');
    const tfoot = document.getElementById('paintReportTableFoot');
    const monthInput = document.getElementById('reportPaintMonthSelector');
    
    if (monthInput) populateMonthOptions(monthInput);

    const monthVal = monthInput ? monthInput.value : null;
    const printDateSpan = document.querySelector('.print-date-paint-report');
    
    if (!tbody || !tfoot || !monthVal) return;
    
    const [fYear, fMonth] = monthVal.split('-');
    const reportMonthLabel = `${fMonth}.${fYear}`;
    if (printDateSpan) printDateSpan.textContent = `Podsumowanie za miesiąc: ${reportMonthLabel}`;

    const units = {};
    let totalPaintAll = 0, totalThinnerAll = 0;
    let totalPaintByBrand = {};

    printHistory.forEach(h => {
        if (h.isError) return;
        const rowDate = parsePlDate(h.date);
        if (rowDate.getFullYear() === parseInt(fYear) && (rowDate.getMonth() + 1) === parseInt(fMonth)) {
            const pName = (h.projectName || h.unit || "BRAK NAZWY").toUpperCase().trim();
            if (!units[pName]) units[pName] = {};
            
            if (h.brandStats) {
                Object.keys(h.brandStats).forEach(paintId => {
                    const stat = h.brandStats[paintId];
                    if (stat.vol > 0 || stat.thinner > 0) {
                        if (!units[pName][paintId]) units[pName][paintId] = { paint: 0, thinner: 0 };
                        
                        units[pName][paintId].paint += (stat.vol || 0);
                        units[pName][paintId].thinner += (stat.thinner || 0);
                        
                        totalPaintAll += (stat.vol || 0);
                        totalThinnerAll += (stat.thinner || 0);

                        if (!totalPaintByBrand[paintId]) totalPaintByBrand[paintId] = { paint: 0, thinner: 0 };
                        totalPaintByBrand[paintId].paint += (stat.vol || 0);
                        totalPaintByBrand[paintId].thinner += (stat.thinner || 0);
                    }
                });
            }
        }
    });

    tbody.innerHTML = '';
    const unitKeys = Object.keys(units).sort();
    
    if (unitKeys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-3 py-4 text-center text-gray-500 font-bold uppercase">Brak zapisanych zużyć farb dla wybranego miesiąca.</td></tr>`;
        tfoot.innerHTML = ''; return;
    }

    let html = '';
    unitKeys.forEach(u => {
        const paintsData = units[u];
        const paintKeys = Object.keys(paintsData).sort();
        const safeU = escapeHTML(u);
        
        if (paintKeys.length === 0) return;

        paintKeys.forEach((paintId, idx) => {
            const data = paintsData[paintId];
            const isFirst = idx === 0;
            const rowSpanAttr = isFirst && paintKeys.length > 1 ? `rowspan="${paintKeys.length}"` : '';
            const unitCellHtml = isFirst ? `<td ${rowSpanAttr} class="px-3 py-2 border-r border-b border-black font-bold text-black align-middle">${safeU}</td>` : '';
            
            let percent = 0;
            if (totalPaintByBrand[paintId] && totalPaintByBrand[paintId].paint > 0) {
                percent = (data.paint / totalPaintByBrand[paintId].paint) * 100;
            }

            html += `
                <tr class="hover:bg-gray-50 transition-colors border-b border-black">
                    ${unitCellHtml}
                    <td class="px-3 py-2 border-r border-black font-bold text-black">${paintId}</td>
                    <td class="px-3 py-2 border-r border-black text-right text-blue-700 font-bold">${formatNumber(data.paint, 2)}</td>
                    <td class="px-3 py-2 border-r border-black text-right text-yellow-600 font-bold">${formatNumber(data.thinner, 2)}</td>
                    <td class="px-3 py-2 border-r border-black text-right text-purple-700 font-bold">${formatNumber(percent, 1)}%</td>
                    <td class="px-3 py-2 text-right font-bold text-green-700">${formatNumber(data.paint + data.thinner, 2)}</td>
                </tr>
            `;
        });
    });
    tbody.innerHTML = html;

    let footerHtml = '';
    const brandKeys = Object.keys(totalPaintByBrand).sort();
    brandKeys.forEach(bId => {
        const bData = totalPaintByBrand[bId];
        footerHtml += `
            <tr class="bg-gray-100 border-t border-black">
                <td colspan="2" class="px-3 py-1.5 border-r border-black text-right font-bold text-gray-700">PODSUMOWANIE: ${bId}</td>
                <td class="px-3 py-1.5 border-r border-black text-right font-bold text-blue-800">${formatNumber(bData.paint, 2)}</td>
                <td class="px-3 py-1.5 border-r border-black text-right font-bold text-yellow-700">${formatNumber(bData.thinner, 2)}</td>
                <td class="px-3 py-1.5 border-r border-black text-right font-bold text-purple-800">100.0%</td>
                <td class="px-3 py-1.5 text-right font-bold text-green-800">${formatNumber(bData.paint + bData.thinner, 2)}</td>
            </tr>
        `;
    });

    footerHtml += `
        <tr class="border-t-2 border-black bg-gray-200">
            <td colspan="2" class="px-3 py-2 border-r border-black text-right font-bold text-black">SUMA CAŁKOWITA MIESIĄCA [L]:</td>
            <td class="px-3 py-2 border-r border-black text-right text-black font-bold">${formatNumber(totalPaintAll, 2)}</td>
            <td class="px-3 py-2 border-r border-black text-right text-black font-bold">${formatNumber(totalThinnerAll, 2)}</td>
            <td class="px-3 py-2 border-r border-black text-right text-black font-bold">-</td>
            <td class="px-3 py-2 text-right text-black font-bold">${formatNumber(totalPaintAll + totalThinnerAll, 2)}</td>
        </tr>
    `;
    tfoot.innerHTML = footerHtml;
}

// ==========================================
// 3. PORÓWNANIA (CRI VS INDUSCO) I WYKRESY
// ==========================================

export function setCompareMonth() {
    const monthVal = document.getElementById('compareTableMonth').value;
    if (!monthVal) return;
    const [year, month] = monthVal.split('-');
    const firstDay = `${year}-${month}-01`;
    const lastDayObj = new Date(year, parseInt(month), 0);
    const lastDay = dateToISO(lastDayObj);
    
    document.getElementById('compareDateFrom').value = firstDay;
    document.getElementById('compareDateTo').value = lastDay;
    
    // Zsynchronizowanie daty na wykresach z datą tabeli!
    const chartMonthInput = document.getElementById('compareMonthDate');
    if (chartMonthInput) chartMonthInput.value = monthVal;

    renderCompareTable();
}

export function getBalancesForDate(targetDateIso) {
    if(window.updateAllStocks) window.updateAllStocks(); 
    const targetDate = new Date(targetDateIso);
    targetDate.setHours(23, 59, 59, 999);
    
    let criBal = {}; let indBal = {};
    const allPaints = window.getAllPossibleDailyPaints ? window.getAllPossibleDailyPaints() : [];
    
    allPaints.forEach(paint => {
        let cBal = 0;
        if (window.calcEvents && window.calcEvents[paint]) {
            window.calcEvents[paint].forEach(ev => {
                if (ev.dateObj <= targetDate) {
                    if (ev.rodzaj === 'REMANENT') cBal = ev.rawAmount;
                    else cBal += (ev.wydanie || 0) - (ev.utylizacja || 0) - (ev.zuzycie || 0);
                }
            });
        }
        criBal[paint] = cBal;
        
        let iBal = 0;
        if (window.indEvents && window.indEvents[paint]) {
            window.indEvents[paint].forEach(ev => {
                if (ev.dateObj <= targetDate) {
                    if (ev.rodzaj === 'REMANENT') iBal = ev.rawAmount;
                    else iBal += (ev.wydanie || 0) - (ev.utylizacja || 0) - (ev.zuzycie || 0);
                }
            });
        }
        indBal[paint] = iBal;
    });
    return { criBal, indBal };
}

export function renderCompareTable() {
    const dateFromInput = document.getElementById('compareDateFrom');
    const dateToInput = document.getElementById('compareDateTo');
    const monthInput = document.getElementById('compareTableMonth');
    const chartMonthInput = document.getElementById('compareMonthDate');
    
    // Ustawienie POPRZEDNIEGO miesiąca domyślnie przy włączeniu okienka
    if (dateFromInput && dateToInput && (!dateFromInput.value || !dateToInput.value)) {
        const d = new Date();
        d.setMonth(d.getMonth() - 1); // Cofamy o 1 miesiąc do tyłu
        
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const defaultMonth = `${y}-${m}`;
        
        if (monthInput) monthInput.value = defaultMonth;
        if (chartMonthInput) chartMonthInput.value = defaultMonth; // Synchronizacja
        
        const firstDay = `${y}-${m}-01`;
        const lastDayObj = new Date(y, parseInt(m), 0);
        const lastDay = `${y}-${m}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
        
        dateFromInput.value = firstDay;
        dateToInput.value = lastDay;
    }

    const dateFromIso = dateFromInput ? dateFromInput.value : null;
    const dateToIso = dateToInput ? dateToInput.value : null;
    if (!dateFromIso || !dateToIso) return;
    
    const dFrom = new Date(dateFromIso); dFrom.setHours(0,0,0,0);
    const dTo = new Date(dateToIso); dTo.setHours(23,59,59,999);
    
    const { criBal, indBal } = getBalancesForDate(dateToIso);
    
    let criM2 = 0;
    printHistory.forEach(p => { 
        if (!p.isError && p.date) {
            const rowDate = parsePlDate(p.date);
            if (rowDate >= dFrom && rowDate <= dTo) criM2 += p.area || 0; 
        }
    });
    
    let indM2 = 0;
    induscoDailyRecords.forEach(r => { 
        if (r.date) {
            const rowDate = new Date(r.date); rowDate.setHours(12,0,0,0);
            if (rowDate >= dFrom && rowDate <= dTo) indM2 += parseFloat(r.m2) || 0; 
        }
    });
    
    let criZuz = {}; let indZuz = {};
    const allPaints = window.initDailyPaints ? window.initDailyPaints() : []; 
    
    allPaints.forEach(paint => {
        criZuz[paint] = 0; indZuz[paint] = 0;
        if (window.calcEvents && window.calcEvents[paint]) {
            window.calcEvents[paint].forEach(ev => {
                if (ev.dateObj >= dFrom && ev.dateObj <= dTo && ev.rodzaj !== 'REMANENT') criZuz[paint] += ev.zuzycie || 0;
            });
        }
        if (window.indEvents && window.indEvents[paint]) {
            window.indEvents[paint].forEach(ev => {
                if (ev.dateObj >= dFrom && ev.dateObj <= dTo && ev.rodzaj !== 'REMANENT') indZuz[paint] += ev.zuzycie || 0;
            });
        }
    });
    
    let html = `<table class="w-full text-center text-[10px] sm:text-xs whitespace-nowrap bg-white border border-black">
        <thead class="bg-gray-100 text-black font-bold uppercase border-b-2 border-black">
            <tr>
                <th class="px-2 py-1.5 border-r border-black" rowspan="2">Wskaźnik / Towar</th>
                <th class="px-2 py-1 border-r border-black" colspan="3">Zużycie / Wykonanie (W wybranym okresie)</th>
                <th class="px-2 py-1 border-black" colspan="3">Stan Magazynowy (Na koniec wybranego okresu)</th>
            </tr>
            <tr class="border-t border-black">
                <th class="px-2 py-1 border-r border-black text-blue-700">CRI</th>
                <th class="px-2 py-1 border-r border-black text-green-700">INDUSCO</th>
                <th class="px-2 py-1 border-r border-black text-red-600 bg-red-50">RÓŻNICA</th>
                <th class="px-2 py-1 border-r border-black text-blue-700">CRI</th>
                <th class="px-2 py-1 border-r border-black text-green-700">INDUSCO</th>
                <th class="px-2 py-1 border-black text-red-600 bg-red-50">RÓŻNICA</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-300">`;
        
    let m2Diff = indM2 - criM2;
    let m2DiffColor = Math.abs(m2Diff) < 0.01 ? 'text-black' : (m2Diff > 0 ? 'text-green-600' : 'text-red-600');
    html += `<tr class="bg-blue-50 font-bold border-b-2 border-black">
        <td class="px-2 py-2 border-r border-black text-left uppercase">Wykonanie całkowite m²</td>
        <td class="px-2 py-2 border-r border-black text-blue-800">${formatNumber(criM2)}</td>
        <td class="px-2 py-2 border-r border-black text-green-800">${formatNumber(indM2)}</td>
        <td class="px-2 py-2 border-r border-black bg-red-50 ${m2DiffColor}">${m2Diff > 0 ? '+' : ''}${formatNumber(m2Diff)}</td>
        <td class="px-2 py-2 border-r border-black text-gray-400">-</td>
        <td class="px-2 py-2 border-r border-black text-gray-400">-</td>
        <td class="px-2 py-2 bg-red-50 text-gray-400">-</td>
    </tr>`;
    
    allPaints.forEach(paint => {
        let cZuz = criZuz[paint]; let iZuz = indZuz[paint];
        let zuzDiff = iZuz - cZuz;
        let zDiffColor = Math.abs(zuzDiff) < 0.01 ? 'text-black' : (zuzDiff > 0 ? 'text-green-600' : 'text-red-600');
        
        let cBal = criBal[paint]; let iBal = indBal[paint];
        let balDiff = iBal - cBal;
        let bDiffColor = Math.abs(balDiff) < 0.01 ? 'text-black' : (balDiff > 0 ? 'text-green-600' : 'text-red-600');
        
        html += `<tr class="hover:bg-gray-100">
            <td class="px-2 py-1.5 border-r border-black text-left font-bold uppercase truncate max-w-[150px]" title="${paint}">${paint}</td>
            <td class="px-2 py-1.5 border-r border-black">${formatNumber(cZuz)} L</td>
            <td class="px-2 py-1.5 border-r border-black">${formatNumber(iZuz)} L</td>
            <td class="px-2 py-1.5 border-r border-black font-bold bg-red-50 ${zDiffColor}">${zuzDiff > 0 ? '+' : ''}${formatNumber(zuzDiff)} L</td>
            <td class="px-2 py-1.5 border-r border-black">${formatNumber(cBal)} L</td>
            <td class="px-2 py-1.5 border-r border-black">${formatNumber(iBal)} L</td>
            <td class="px-2 py-1.5 font-bold bg-red-50 ${bDiffColor}">${balDiff > 0 ? '+' : ''}${formatNumber(balDiff)} L</td>
        </tr>`;
    });
    
    html += `</tbody></table>`;
    document.getElementById('compareDailyResults').innerHTML = html;

    // Automatyczne renderowanie wykresów po wygenerowaniu głównej tabeli!
    if (window.renderMonthlyCompareCharts) window.renderMonthlyCompareCharts();
}

export function renderMonthlyCompareCharts() {
    const monthInput = document.getElementById('compareMonthDate');
    const tableMonthInput = document.getElementById('compareTableMonth');
    
    // Zawsze bierzemy datę z głównej tabeli porównawczej do wykresów
    if (monthInput && tableMonthInput && tableMonthInput.value) {
        monthInput.value = tableMonthInput.value;
    } else if (monthInput && !monthInput.value) {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        monthInput.value = `${y}-${m}`;
    }

    const monthVal = monthInput ? monthInput.value : null;
    if (!monthVal) return;
    
    const [year, month] = monthVal.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const labels = []; 
    const criM2Data = []; const indM2Data = []; const criZuzData = []; const indZuzData = [];
    const criM2Cumulative = []; const indM2Cumulative = []; 
    const criZuzCumulative = []; const indZuzCumulative = [];
    
    let sumCriM2 = 0; let sumIndM2 = 0;
    let sumCriZuz = 0; let sumIndZuz = 0;
    
    if(window.updateAllStocks) window.updateAllStocks(); 
    
    for (let d = 1; d <= daysInMonth; d++) {
        labels.push(`${String(d).padStart(2,'0')}.${String(month).padStart(2,'0')}`);
        const dateIso = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const datePl = formatISOToPL(dateIso);
        
        let cM2 = 0; printHistory.forEach(p => { if (!p.isError && p.date === datePl) cM2 += p.area || 0; });
        criM2Data.push(cM2); sumCriM2 += cM2; criM2Cumulative.push(sumCriM2);
        
        let iM2 = 0; induscoDailyRecords.forEach(r => { if (r.date === dateIso) iM2 += parseFloat(r.m2) || 0; });
        indM2Data.push(iM2); sumIndM2 += iM2; indM2Cumulative.push(sumIndM2);
        
        let cZuz = 0; let iZuz = 0;
        const allPaints = window.initDailyPaints ? window.initDailyPaints() : [];
        allPaints.forEach(paint => {
            if (window.calcEvents && window.calcEvents[paint]) {
                window.calcEvents[paint].forEach(ev => { if (dateToISO(ev.dateObj) === dateIso && ev.rodzaj !== 'REMANENT') cZuz += ev.zuzycie || 0; });
            }
            if (window.indEvents && window.indEvents[paint]) {
                window.indEvents[paint].forEach(ev => { if (dateToISO(ev.dateObj) === dateIso && ev.rodzaj !== 'REMANENT') iZuz += ev.zuzycie || 0; });
            }
        });
        criZuzData.push(cZuz); sumCriZuz += cZuz; criZuzCumulative.push(sumCriZuz);
        indZuzData.push(iZuz); sumIndZuz += iZuz; indZuzCumulative.push(sumIndZuz);
    }
    
    const commonOptions = { 
        responsive: true, maintainAspectRatio: false, 
        scales: { 
            y: { type: 'linear', position: 'left', beginAtZero: true },
            y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } }
        } 
    };

    if (typeof window.Chart === 'undefined') return;

    if (chartM2Instance) chartM2Instance.destroy();
    const ctxM2 = document.getElementById('chartM2').getContext('2d');
    chartM2Instance = new window.Chart(ctxM2, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'CRI m²', data: criM2Data, backgroundColor: 'rgba(29, 78, 216, 0.7)', yAxisID: 'y' },
                { label: 'INDUSCO m²', data: indM2Data, backgroundColor: 'rgba(21, 128, 61, 0.7)', yAxisID: 'y' },
                { label: 'Σ CRI m²', data: criM2Cumulative, type: 'line', borderColor: 'rgba(29, 78, 216, 1)', borderDash: [5, 5], yAxisID: 'y1', tension: 0.1, fill: false },
                { label: 'Σ INDUSCO m²', data: indM2Cumulative, type: 'line', borderColor: 'rgba(21, 128, 61, 1)', borderDash: [5, 5], yAxisID: 'y1', tension: 0.1, fill: false }
            ]
        },
        options: { ...commonOptions, plugins: { title: { display: true, text: 'Wykres Wykonania M² (Dzienne + Narastająco)' } } }
    });
    
    if (chartZuzInstance) chartZuzInstance.destroy();
    const ctxZuz = document.getElementById('chartZuz').getContext('2d');
    chartZuzInstance = new window.Chart(ctxZuz, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'CRI Zużycie Farb [L]', data: criZuzData, backgroundColor: 'rgba(29, 78, 216, 0.2)', borderColor: 'rgba(29, 78, 216, 1)', borderWidth: 1, type: 'bar', yAxisID: 'y' },
                { label: 'INDUSCO Zużycie Farb [L]', data: indZuzData, backgroundColor: 'rgba(21, 128, 61, 0.2)', borderColor: 'rgba(21, 128, 61, 1)', borderWidth: 1, type: 'bar', yAxisID: 'y' },
                { label: 'Σ CRI [L]', data: criZuzCumulative, type: 'line', borderColor: 'rgba(29, 78, 216, 1)', borderWidth: 2, borderDash: [5, 5], fill: false, yAxisID: 'y1', tension: 0.1 },
                { label: 'Σ INDUSCO [L]', data: indZuzCumulative, type: 'line', borderColor: 'rgba(21, 128, 61, 1)', borderWidth: 2, borderDash: [5, 5], fill: false, yAxisID: 'y1', tension: 0.1 }
            ]
        },
        options: { ...commonOptions, plugins: { title: { display: true, text: 'Wykres Zużycia Materiału [L] (Dzienne + Narastająco)' } } }
    });
}

// ==========================================
// 4. FUNKCJE DRUKOWANIA RAPORTÓW
// ==========================================

export function printMonthlyReport() {
    const modal = document.getElementById('monthlyReportModal');
    const main = document.getElementById('mainAppContainer');
    if (modal && main) {
        modal.classList.remove('print-hide');
        main.classList.add('print-hide');
        window.print();
        modal.classList.add('print-hide');
        main.classList.remove('print-hide');
    }
}

export function printPaintReport() {
    const modal = document.getElementById('paintReportModal');
    const main = document.getElementById('mainAppContainer');
    if (modal && main) {
        modal.classList.remove('print-hide');
        main.classList.add('print-hide');
        window.print();
        modal.classList.add('print-hide');
        main.classList.remove('print-hide');
    }
}

// Bindowanie do window
window.renderMonthlyReport = renderMonthlyReport;
window.renderPaintReport = renderPaintReport;
window.setCompareMonth = setCompareMonth;
window.getBalancesForDate = getBalancesForDate;
window.renderCompareTable = renderCompareTable;
window.renderMonthlyCompareCharts = renderMonthlyCompareCharts;
window.printMonthlyReport = printMonthlyReport;
window.printPaintReport = printPaintReport;