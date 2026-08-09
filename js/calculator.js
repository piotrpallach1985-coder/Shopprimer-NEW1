// --- MODUŁ OBLICZEŃ, BAZY PROFILI I REGUŁ BIZNESOWYCH (CALCULATOR.JS) ---

import { shopPrimerRules, steelGradesList, ADMIN_PIN } from './config.js';
import { formatNumber, escapeHTML } from './utils.js';
import {
    database, inputData, resultsData, paintTypes, laborCosts, visibleDailyPaints,
    setResultsData, setInputData
} from './store.js';
import { firebaseDb, dbRef, dbSet, currentUser } from './auth.js';

// ==========================================
// 1. NARZĘDZIA FORMULARZA (UI)
// ==========================================

export function flashAndExecute(btnId, action) {
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.style.transform = 'scale(0.95)';
        btn.style.opacity = '0.7';
        btn.style.transition = 'all 0.15s ease';
        setTimeout(() => {
            btn.style.transform = '';
            btn.style.opacity = '';
            if (action) action();
        }, 150);
    } else if (action) {
        action();
    }
}

export function initGatunkiSelect() {
    const select = document.getElementById('formGatunek');
    if (!select) return;
    select.innerHTML = '<option value="-">-- brak --</option>';
    const dlGatunki = document.getElementById('dl-gatunki');
    if (dlGatunki) dlGatunki.innerHTML = '';
    steelGradesList.forEach(g => {
        const opt = document.createElement('option'); opt.value = g; opt.textContent = g; select.appendChild(opt);
        if (dlGatunki) { const dlOpt = document.createElement('option'); dlOpt.value = g; dlGatunki.appendChild(dlOpt); }
    });
}

export function toggleFormFields() {
    const typ = document.getElementById('formTyp').value;
    const profilContainer = document.getElementById('formProfilContainer');
    const szerokoscContainer = document.getElementById('formSzerokoscContainer');
    const gruboscContainer = document.getElementById('formGruboscContainer');
    const dlugoscInput = document.getElementById('formDlugosc');
    const szerokoscInput = document.getElementById('formSzerokosc');

    if (typ === 'Blacha') {
        profilContainer.classList.add('hidden'); szerokoscContainer.classList.remove('hidden'); gruboscContainer.classList.remove('hidden'); 
        dlugoscInput.value = "12000"; szerokoscInput.value = "3000";
    } else if (typ === 'Płaskowniki FB') {
        profilContainer.classList.remove('hidden'); szerokoscContainer.classList.add('hidden'); gruboscContainer.classList.remove('hidden'); 
        updateProfilSelect(); dlugoscInput.value = "6000"; szerokoscInput.value = "";
    } else {
        profilContainer.classList.remove('hidden'); szerokoscContainer.classList.add('hidden'); gruboscContainer.classList.add('hidden'); 
        updateProfilSelect(); 
        if (typ === 'Profile HP') dlugoscInput.value = "12000"; else dlugoscInput.value = "6000";
        szerokoscInput.value = "";
    }
}

export function updateProfilSelect() {
    const select = document.getElementById('formProfilSelect');
    if(!select) return;
    const typ = document.getElementById('formTyp').value;
    select.innerHTML = '<option value="">-- brak --</option>';
    if (typ === 'Blacha') return;
    if (typ === 'Płaskowniki FB') {
        const fbSizes = [60, 80, 100, 120, 150, 200, 250, 300, 350, 400];
        fbSizes.forEach(size => { const option = document.createElement('option'); option.value = `FB${size}`; option.textContent = `FB${size}`; select.appendChild(option); });
        return;
    }
    if (!database[typ]) return;
    const keys = Object.keys(database[typ]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    if (keys.length === 0) return;
    keys.forEach(k => {
        const option = document.createElement('option'); option.value = k; option.textContent = `${k} (${formatNumber(database[typ][k], 4)} m²/m)`; select.appendChild(option);
    });
}

// ==========================================
// 2. BAZA PROFILI (ZARZĄDZANIE)
// ==========================================

export function filterDbTable() { renderDbTable(); }

export async function addManualDbItem() {
    const cat = document.getElementById('formDbKategoria').value;
    const nazwa = document.getElementById('formDbNazwa').value.trim().toUpperCase();
    const mnoznikStr = document.getElementById('formDbMnoznik').value.replace(/[\s\u00A0]/g, '').replace(',', '.');
    const mnoznik = parseFloat(mnoznikStr);

    if (!nazwa) { await window.customAlert("Podaj nazwę elementu!"); return; }
    if (isNaN(mnoznik) || mnoznik <= 0) { await window.customAlert("Podaj prawidłowy mnożnik pow. (liczbę większą od zera)!"); return; }

    const safeKey = nazwa.replace(/[\.\$#\[\]\/]/g, ',');
    if (!database[cat]) database[cat] = {};
    
    const isUpdate = database[cat][safeKey] !== undefined;
    database[cat][safeKey] = mnoznik;
    database.lastModified = Date.now();

    document.getElementById('formDbNazwa').value = '';
    document.getElementById('formDbMnoznik').value = '';

    renderDbTable(); updateProfilSelect(); dbSet(dbRef(firebaseDb, 'appState/database'), database);

    if (isUpdate) await window.customAlert(`Zaktualizowano mnożnik dla profilu: ${safeKey}`);
    else await window.customAlert(`Dodano nowy profil: ${safeKey} do kategorii ${cat}`);
}

export async function updateDbMultiplier(cat, key, value) {
    const cleanValue = value.replace(/[\s\u00A0]/g, '').replace(',', '.');
    const num = parseFloat(cleanValue);
    if (!isNaN(num) && num > 0) {
        database[cat][key] = num;
        database.lastModified = Date.now();
        updateProfilSelect(); calculate(); dbSet(dbRef(firebaseDb, 'appState/database'), database);
    } else {
        await window.customAlert("Podana wartość musi być liczbą większą od zera.");
        renderDbTable();
    }
}

export async function removeDbItem(cat, key) {
    const pin = await window.customPrompt("Podaj kod autoryzacji (PIN), aby usunąć profil z bazy:", 'password');
    if (pin === ADMIN_PIN) {
        if (database[cat] && database[cat][key] !== undefined) {
            delete database[cat][key];
            database.lastModified = Date.now();
            window.forceNextCloudOverwrite = true;
            renderDbTable(); 
            updateProfilSelect(); 
            calculate(); 
            dbSet(dbRef(firebaseDb, 'appState/database'), database);
            await window.customAlert(`Profil ${key} został usunięty.`);
        }
    } else if (pin !== null) {
        await window.customAlert("Nieprawidłowy kod PIN.");
    }
}

export function renderDbTable() {
    const previewSection = document.getElementById('dbPreviewSection');
    const tbody = document.getElementById('dbTableBody');
    const countBadge = document.getElementById('dbCountBadge');
    
    // Filtrowanie z UI
    const searchInput = document.getElementById('dbSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase() : "";
    
    const catFilterSelect = document.getElementById('dbFilterKategoria');
    const selectedCategory = catFilterSelect ? catFilterSelect.value : "";
    
    let html = '';
    let totalCount = 0; let totalInDb = 0;
    
    for (const cat in database) {
        if (cat === 'Płaskowniki FB') continue; 
        
        // Filtrowanie po wybranej kategorii
        if (selectedCategory && cat !== selectedCategory) continue;

        const keys = Object.keys(database[cat]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        totalInDb += keys.length;
        if (keys.length === 0) continue;
        
        const filteredKeys = keys.filter(k => k.toLowerCase().includes(query));
        if (filteredKeys.length === 0) continue;
        
        html += `<tr><td colspan="3" class="font-bold uppercase tracking-wider text-[11px] bg-gray-100 text-black px-3 py-2 border-b border-black">${cat}</td></tr>`;
        
        filteredKeys.forEach(key => {
            totalCount++;
            // Używamy escapeHTML dla key, aby bezpiecznie wyrenderować je w funkcji JS wewnątrz HTML
            const safeCat = escapeHTML(cat);
            const safeKey = escapeHTML(key);
            
            html += `
                <tr class="hover:bg-gray-100 transition-colors">
                    <td class="pl-6 font-bold text-black px-3 py-1.5 border-b border-gray-300">${key}</td>
                    <td class="text-right px-3 py-1.5 border-b border-gray-300 border-r border-gray-300">
                        <input type="text" value="${formatNumber(database[cat][key], 4)}" 
                            onchange="updateDbMultiplier('${safeCat}', '${safeKey}', this.value)" class="w-24 text-right bg-transparent focus:bg-white border border-transparent hover:border-black focus:border-black outline-none text-black font-bold px-1 py-0.5 transition-all">
                    </td>
                    <td class="text-center px-3 py-1.5 border-b border-gray-300">
                        <button onclick="removeDbItem('${safeCat}', '${safeKey}')" class="text-white bg-red-600 font-bold uppercase text-[10px] border border-black px-2 py-0.5 hover:bg-red-700 leading-none shadow-sm transition-colors">Usuń</button>
                    </td>
                </tr>
            `;
        });
    }
    if (tbody) tbody.innerHTML = html;
    if (countBadge) countBadge.textContent = totalCount;
    if (previewSection) {
        // Zawsze pokazujemy sekcję, żeby można było używać filtrów (nawet jeśli totalInDb wyniesie chwilowo 0 przez filtry)
        previewSection.classList.remove('hidden'); previewSection.classList.add('flex');
    }
    updateProfilSelect();

    const dlProfile = document.getElementById('dl-profile');
    if (dlProfile) {
        dlProfile.innerHTML = '';
        for (const cat in database) {
            if (cat === 'Płaskowniki FB') continue; 
            Object.keys(database[cat]).forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                dlProfile.appendChild(opt);
            });
        }
    }
}

// ==========================================
// 3. FARBY, KOLORYSTYKA I KOSZTY
// ==========================================

export function getShopprimerColor(gatunek, grubosc) {
    if (!gatunek || gatunek === "-") return { name: "Brak danych", hex: "transparent" };
    const g = gatunek.toUpperCase().trim();
    for (let rule of shopPrimerRules) {
        if (rule.grades.includes(g)) {
            if (rule.condition) {
                if (rule.condition(grubosc)) return { name: rule.colorName, hex: rule.colorHex };
            } else return { name: rule.colorName, hex: rule.colorHex };
        }
    }
    return { name: "Brak danych", hex: "transparent" };
}

export function renderColorsTable() {
    const tbody = document.getElementById('colorsTableBody');
    if (!tbody) return;
    let html = '';
    shopPrimerRules.forEach(rule => {
        html += `
            <tr class="hover:bg-gray-100 transition-colors">
                <td class="font-bold text-black px-3 py-2 border-r border-black">${rule.group}</td>
                <td class="whitespace-normal text-xs text-black px-3 py-2 border-r border-black">${rule.grades.join(", ")}</td>
                <td class="text-xs text-black px-3 py-2 border-r border-black">${rule.conditionInfo || "-"}</td>
                <td class="px-3 py-2">
                    <div class="flex items-center gap-2">
                        <span class="w-4 h-4 border border-black block" style="background-color: ${rule.colorHex}"></span>
                        <span class="font-bold text-black">${rule.colorName}</span>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

export function renderPaintTypesTable() {
    const tbody = document.getElementById('paintTypesTableBody');
    const isAdmin = currentUser && currentUser.role === 'admin';
    const inputState = isAdmin ? '' : 'disabled';
    const inputClass = isAdmin ? 'border border-transparent hover:border-black focus:border-black outline-none bg-transparent focus:bg-white transition-all' : 'bg-transparent text-gray-500 cursor-not-allowed';
    
    // AKTUALIZACJA PÓL KOSZTÓW W WIDOKU
    const inputCostBlachy = document.getElementById('costBlachy');
    const inputCostProfile = document.getElementById('costProfile');
    const newPaintName = document.getElementById('newPaintName');
    const addPaintBtn = document.querySelector('button[onclick="addPaintType()"]');

    if (inputCostBlachy) {
        inputCostBlachy.value = laborCosts.blachy || 4.20;
        inputCostBlachy.disabled = !isAdmin;
        inputCostBlachy.className = isAdmin ? 'w-32 border border-black p-1 text-sm outline-none font-bold' : 'w-32 border border-gray-300 p-1 text-sm outline-none font-bold bg-transparent text-gray-500 cursor-not-allowed';
    }
    if (inputCostProfile) {
        inputCostProfile.value = laborCosts.profile || 6.80;
        inputCostProfile.disabled = !isAdmin;
        inputCostProfile.className = isAdmin ? 'w-32 border border-black p-1 text-sm outline-none font-bold' : 'w-32 border border-gray-300 p-1 text-sm outline-none font-bold bg-transparent text-gray-500 cursor-not-allowed';
    }
    if (newPaintName) {
        newPaintName.disabled = !isAdmin;
        if (!isAdmin) {
            newPaintName.parentElement.style.display = 'none';
        } else {
            newPaintName.parentElement.style.display = 'block';
        }
    }
    if (addPaintBtn) addPaintBtn.style.display = isAdmin ? 'block' : 'none';

    if(!tbody) return;
    
    let html = '';
    paintTypes.forEach(pt => {
        let fallbacksHtml = '';
        if (pt.fallbacks && Object.keys(pt.fallbacks).length > 0) {
            fallbacksHtml = '<div class="mt-1 space-y-0.5">';
            for (const [color, targetId] of Object.entries(pt.fallbacks)) {
                fallbacksHtml += `<div class="text-[9px] font-normal normal-case bg-gray-100 text-gray-800 border border-gray-300 px-1 py-0.5 w-max">Gdy kolor <b>${color}</b> — użyj <b>${targetId}</b></div>`;
            }
            fallbacksHtml += '</div>';
        }

        const akcjaHtml = isAdmin ? `<div class="flex flex-col gap-1 items-center w-16 mx-auto"><button onclick="openPaintRulesModal('${pt.id}')" class="w-full text-white bg-blue-600 font-bold uppercase text-[10px] border border-black px-1 py-0.5 hover:bg-blue-800 leading-none">Reguły</button><button onclick="removePaintType('${pt.id}')" class="w-full text-black font-bold uppercase text-[10px] border border-black px-1 py-0.5 hover:bg-black hover:text-white bg-white leading-none">Usuń</button></div>` : '<div class="text-[10px] text-gray-400 font-bold uppercase text-center w-full">-</div>';

        html += `
            <tr class="hover:bg-gray-50 border-b border-gray-300">
                <td class="px-3 py-1.5 border-r border-black text-black align-top">
                    <div class="font-bold uppercase">${pt.name}</div>
                    ${fallbacksHtml}
                </td>
                <td class="px-3 py-1.5 border-r border-black text-center">
                    <input type="number" step="0.1" min="0.1" value="${pt.yieldBlachy}" onchange="updatePaintParam('${pt.id}', 'yieldBlachy', this.value)" class="w-20 text-center outline-none font-bold text-black px-1 py-0.5 ${inputClass}" ${inputState}>
                </td>
                <td class="px-3 py-1.5 border-r border-black text-center">
                    <input type="number" step="0.1" min="0.1" value="${pt.yieldProfile}" onchange="updatePaintParam('${pt.id}', 'yieldProfile', this.value)" class="w-20 text-center outline-none font-bold text-black px-1 py-0.5 ${inputClass}" ${inputState}>
                </td>
                <td class="px-3 py-1.5 border-r border-black text-center">
                    <input type="number" step="1" min="0" value="${pt.thinnerPct}" onchange="updatePaintParam('${pt.id}', 'thinnerPct', this.value)" class="w-16 text-center outline-none font-bold text-black px-1 py-0.5 ${inputClass}" ${inputState}>
                </td>
                <td class="px-3 py-1.5 text-center border-black">
                    ${akcjaHtml}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

export function updateLaborCosts() {
    if (!currentUser || currentUser.role !== 'admin') return;
    laborCosts.blachy = parseFloat(document.getElementById('costBlachy').value) || 4.20;
    laborCosts.profile = parseFloat(document.getElementById('costProfile').value) || 6.80;
    laborCosts.lastModified = Date.now();
    calculateCosts(); dbSet(dbRef(firebaseDb, 'appState/laborCosts'), laborCosts);
}

export function updatePaintParam(id, field, value) {
    if (!currentUser || currentUser.role !== 'admin') return;
    const pt = paintTypes.find(p => p.id === id);
    if(pt) {
        const parsedValue = parseFloat(value.replace(',', '.')) || 0;
        pt[field] = Math.max(parsedValue, 0.1); 
        pt.lastModified = Date.now();
        calculateCosts(); dbSet(dbRef(firebaseDb, 'appState/paintTypes'), paintTypes);
    }
}

export async function addPaintType() {
    if (!currentUser || currentUser.role !== 'admin') { await window.customAlert('Brak uprawnień!'); return; }
    const name = document.getElementById('newPaintName').value.trim().toUpperCase();
    if(!name) { await window.customAlert('Podaj nazwę farby!'); return; }
    if(paintTypes.find(p => p.id === name)) { await window.customAlert('Farba już istnieje!'); return; }
    
    paintTypes.push({ id: name, name: name, yieldBlachy: 10.0, yieldProfile: 6.5, thinnerPct: 14, fallbacks: {}, lastModified: Date.now() });
    
    if (visibleDailyPaints !== null) {
        visibleDailyPaints.push(`${name} - Szary`);
        visibleDailyPaints.push(`${name} - Czerwony`);
        visibleDailyPaints.push(`${name} - Zielony`);
        visibleDailyPaints.push(`${name} - Rozcieńczalnik`);
    }
    
    document.getElementById('newPaintName').value = '';
    
    renderPaintTypesTable(); updatePaintDropdowns(); 
    if(window.updateAllStocks) window.updateAllStocks(); 
    if(window.renderDailySidebar) window.renderDailySidebar(); 
    if(window.renderHistoryTable) window.renderHistoryTable(); 
    
    await dbSet(dbRef(firebaseDb, 'appState/paintTypes'), paintTypes);
    if (visibleDailyPaints) await dbSet(dbRef(firebaseDb, 'appState/visibleDailyPaints'), visibleDailyPaints);
    await window.customAlert('Dodano nową farbę pomyślnie!');
}

export async function removePaintType(id) {
    if (!currentUser || currentUser.role !== 'admin') { await window.customAlert('Brak uprawnień!'); return; }
    if(id === 'SIGMAWELD') { await window.customAlert('Nie można usunąć głównej farby systemowej SIGMAWELD.'); return; }
    if(await window.customConfirm(`Czy na pewno usunąć farbę ${id}?`)) {
        window.forceNextCloudOverwrite = true;
        const newTypes = paintTypes.filter(p => p.id !== id);
        newTypes.forEach(pt => {
            for (let color in pt.fallbacks) {
                if (pt.fallbacks[color] === id) delete pt.fallbacks[color];
            }
        });
        
        window.setPaintTypes ? window.setPaintTypes(newTypes) : paintTypes.length = 0; 
        if (!window.setPaintTypes) newTypes.forEach(t => paintTypes.push(t));

        renderPaintTypesTable(); updatePaintDropdowns(); calculateCosts();
        if(window.updateAllStocks) window.updateAllStocks(); 
        if(window.renderDailySidebar) window.renderDailySidebar(); 
        if(window.renderHistoryTable) window.renderHistoryTable(); 
        await dbSet(dbRef(firebaseDb, 'appState/paintTypes'), paintTypes);
    }
}

export function openPaintRulesModal(id) {
    window.currentEditingPaintRules = id;
    const pt = paintTypes.find(p => p.id === id);
    if(!pt) return;
    document.getElementById('paintRulesTitle').textContent = pt.name;
    
    const container = document.getElementById('paintRulesContainer');
    const uniqueColors = [...new Set(shopPrimerRules.map(r => r.colorName))];
    
    let html = '';
    uniqueColors.forEach(color => {
        const currentFallback = pt.fallbacks ? pt.fallbacks[color] : '';
        let optionsHtml = `<option value="">-- domyślna (bez zastępstwa) --</option>`;
        paintTypes.forEach(otherPt => {
            if (otherPt.id !== id) {
                optionsHtml += `<option value="${otherPt.id}" ${currentFallback === otherPt.id ? 'selected' : ''}>Zastąp: ${otherPt.name}</option>`;
            }
        });
        html += `
            <div>
                <label class="block text-xs font-bold text-black mb-1 uppercase">Wymagany Kolor: ${color}</label>
                <select id="rule_color_${color}" class="rule-select w-full border border-black p-1.5 text-sm outline-none bg-white" data-color="${color}">
                    ${optionsHtml}
                </select>
            </div>
        `;
    });
    container.innerHTML = html;
    document.getElementById('paintRulesModal').classList.remove('hidden');
    document.getElementById('paintRulesModal').classList.add('flex');
}

export function savePaintRules() {
    if (!currentUser || currentUser.role !== 'admin') { window.customAlert('Brak uprawnień!'); return; }
    if (!window.currentEditingPaintRules) return;
    const pt = paintTypes.find(p => p.id === window.currentEditingPaintRules);
    if (!pt) return;
    if (!pt.fallbacks) pt.fallbacks = {};
    
    document.querySelectorAll('.rule-select').forEach(sel => {
        const color = sel.getAttribute('data-color');
        const fallbackId = sel.value;
        if (fallbackId) pt.fallbacks[color] = fallbackId;
        else delete pt.fallbacks[color];
    });
    
    pt.lastModified = Date.now();
    
    if (window.closePaintRulesModal) window.closePaintRulesModal();
    renderPaintTypesTable(); updatePaintDropdowns(); calculate();
    if(window.updateAllStocks) window.updateAllStocks(); 
    if(window.renderDailySidebar) window.renderDailySidebar();
    if(window.renderDailyLedger) window.renderDailyLedger();
    dbSet(dbRef(firebaseDb, 'appState/paintTypes'), paintTypes);
}

export function getInduscoPaintsHtml() {
    return paintTypes.map(pt => {
        let opts = '';
        if (!pt.fallbacks || !pt.fallbacks['Szary']) opts += `<option value="${pt.id} - Szary">${pt.name} - Szary</option>`;
        if (!pt.fallbacks || !pt.fallbacks['Czerwony']) opts += `<option value="${pt.id} - Czerwony">${pt.name} - Czerwony</option>`;
        if (!pt.fallbacks || !pt.fallbacks['Zielony']) opts += `<option value="${pt.id} - Zielony">${pt.name} - Zielony</option>`;
        opts += `<option value="${pt.id} - Rozcieńczalnik">${pt.name} - Rozcieńczalnik</option>`;
        return `<optgroup label="${pt.name}">${opts}</optgroup>`;
    }).join('');
}

export function updatePaintDropdowns() {
    const paintOptionsHtml = paintTypes.map(pt => `<option value="${pt.id}">${pt.name}</option>`).join('');
    const formFarba = document.getElementById('formFarba');
    if(formFarba) {
        const currentVal = formFarba.value; formFarba.innerHTML = paintOptionsHtml;
        if(paintTypes.find(p => p.id === currentVal)) formFarba.value = currentVal;
    }
    const dlShop = document.getElementById('dl-shopprimer');
    if(dlShop) dlShop.innerHTML = paintTypes.map(pt => `<option value="${pt.id}"></option>`).join('');

    ['histFilterPaint', 'induscoFilterPaint'].forEach(selId => {
        const sel = document.getElementById(selId);
        if(sel) {
            const val = sel.value; sel.innerHTML = `<option value="">Wszystkie</option>` + paintOptionsHtml; sel.value = val || "";
        }
    });

    const induscoHtml = getInduscoPaintsHtml();
    const editInduscoPaint = document.getElementById('editInduscoPaint');
    if(editInduscoPaint) editInduscoPaint.innerHTML = induscoHtml;

    document.querySelectorAll('.indusco-paint-select').forEach(sel => {
        const val = sel.value; sel.innerHTML = induscoHtml; sel.value = val;
    });
}


// ==========================================
// 4. LOGIKA KALKULATORA (DODAWANIE I TABELA)
// ==========================================

export async function addManualItem() {
    const jednostka = document.getElementById('formJednostka').value.trim();
    if (!jednostka) { await window.customAlert("Wprowadź nazwę projektu przed dodaniem elementu!"); document.getElementById('formJednostka').focus(); return; }

    const farba = document.getElementById('formFarba').value;
    const typ = document.getElementById('formTyp').value;
    const gatunek = document.getElementById('formGatunek').value;
    let nazwa = "-", szerokosc = "", grubosc = 0;
    
    if (typ !== 'Blacha') {
        nazwa = document.getElementById('formProfilSelect').value;
        if (!nazwa) { await window.customAlert("Wybierz element z bazy!"); return; }
        if (typ === 'Płaskowniki FB') {
            grubosc = parseFloat(document.getElementById('formGrubosc').value) || 0;
        } else if (nazwa.includes('X') || nazwa.includes('x')) {
            const parts = nazwa.split(/x/i); grubosc = parseFloat(parts[parts.length - 1]) || 0;
        }
    } else {
        szerokosc = parseFloat(document.getElementById('formSzerokosc').value) || 0; grubosc = parseFloat(document.getElementById('formGrubosc').value) || 0;
    }

    const dlugosc = parseFloat(document.getElementById('formDlugosc').value) || 0;
    const ilosc = parseInt(document.getElementById('formIlosc').value) || 1;

    if (dlugosc <= 0) { await window.customAlert("Długość musi być większa od zera!"); return; }
    if ((typ === 'Blacha' || typ === 'Płaskowniki FB') && grubosc <= 0) { await window.customAlert("Grubość musi być większa od zera!"); return; }
    if (typ === 'Blacha' && szerokosc <= 0) { await window.customAlert("Szerokość musi być większa od zera dla blach!"); return; }

    inputData.push({ "Jednostka": jednostka, "Farba": farba, "Typ": typ, "Gatunek": gatunek, "Grubosc": grubosc, "Nazwa": nazwa, "Dlugosc": dlugosc, "Szerokosc": szerokosc, "Ilosc": ilosc });
    clearAddForm(); calculate();

    const addedItem = resultsData[resultsData.length - 1];
    if (addedItem) {
        const feedback = document.getElementById('lastAddedFeedback');
        feedback.innerHTML = `DODANO ELEMENT: ${typ === 'Blacha' ? 'Blacha' : addedItem.nazwa}`;
        feedback.classList.remove('hidden');
        if (window.feedbackTimeout) clearTimeout(window.feedbackTimeout);
        window.feedbackTimeout = setTimeout(() => { feedback.classList.add('hidden'); }, 3000);
    }
}

export function clearAddForm() {
    const typ = document.getElementById('formTyp') ? document.getElementById('formTyp').value : 'Blacha';
    if (document.getElementById('formGrubosc')) document.getElementById('formGrubosc').value = '';
    if (document.getElementById('formIlosc')) document.getElementById('formIlosc').value = '1';
    
    if (typ === 'Blacha') {
        if (document.getElementById('formDlugosc')) document.getElementById('formDlugosc').value = '12000';
        if (document.getElementById('formSzerokosc')) document.getElementById('formSzerokosc').value = '3000';
    } else if (typ === 'Profile HP') {
        if (document.getElementById('formDlugosc')) document.getElementById('formDlugosc').value = '12000';
        if (document.getElementById('formSzerokosc')) document.getElementById('formSzerokosc').value = '';
    } else {
        if (document.getElementById('formDlugosc')) document.getElementById('formDlugosc').value = '6000';
        if (document.getElementById('formSzerokosc')) document.getElementById('formSzerokosc').value = '';
    }
}

export async function clearInputData() {
    if(await window.customConfirm("Czy na pewno chcesz wyczyścić listę elementów?")) {
        if (window.cancelEditMode) window.cancelEditMode();
        setInputData([]);
        document.getElementById('protocolDateInput').valueAsDate = new Date(); 
        window.historicalRates = null;
        calculate();
        document.getElementById('resultsSection').classList.add('hidden'); document.getElementById('resultsSection').classList.remove('flex');
    }
}

export function removeInputItem(index) {
    const isPreviewActive = window.isPreviewMode || (document.getElementById('previewBanner') && !document.getElementById('previewBanner').classList.contains('hidden'));
    if(isPreviewActive) return;
    
    inputData.splice(index, 1); calculate();
    if (inputData.length === 0) {
        document.getElementById('resultsSection').classList.add('hidden'); document.getElementById('resultsSection').classList.remove('flex');
    }
}

export function updateArea(index, value) {
    const isPreviewActive = window.isPreviewMode || (document.getElementById('previewBanner') && !document.getElementById('previewBanner').classList.contains('hidden'));
    if(isPreviewActive) return;
    
    if (value === null || value === undefined || value.toString().trim() === "") inputData[index].manualArea = null; 
    else {
        const num = parseFloat(value.toString().replace(/[\s\u00A0]/g, '').replace(',', '.'));
        if (!isNaN(num) && num >= 0) inputData[index].manualArea = num;
    }
    calculate(); 
}

export function updateUnit(index, value) {
    const isPreviewActive = window.isPreviewMode || (document.getElementById('previewBanner') && !document.getElementById('previewBanner').classList.contains('hidden'));
    if(isPreviewActive) return;
    
    if (value && value.trim() !== "") { inputData[index].Jednostka = value.trim().toUpperCase(); calculate(); }
}

export function updateRowData(index, field, value) {
    const isPreviewActive = window.isPreviewMode || (document.getElementById('previewBanner') && !document.getElementById('previewBanner').classList.contains('hidden'));
    if(isPreviewActive) return;
    
    const safeValue = value || "";
    if (field === 'Farba' || field === 'Gatunek') inputData[index][field] = safeValue.toString().toUpperCase();
    else if (field === 'Ilosc') inputData[index][field] = parseInt(value) || 1;
    else if (field === 'Szerokosc' || field === 'Dlugosc' || field === 'Grubosc') inputData[index][field] = value === "" ? 0 : (parseFloat(value.toString().replace(',', '.')) || 0);
    else if (field === 'Nazwa') inputData[index][field] = safeValue.toString().toUpperCase().replace(/[\.\$#\[\]\/]/g, ',');
    else if (field === 'Typ') {
        inputData[index][field] = value;
        if (value === 'Blacha') inputData[index]['Nazwa'] = '-';
    }
    inputData[index].manualArea = null; calculate();
}

export function calculate() {
    const newResults = [];
    let totalAreaSum = 0;
    if (window.updatePrintHeaders) window.updatePrintHeaders();

    const currentPaintTypes = window.historicalRates ? window.historicalRates.paintTypes : paintTypes;
    const isPreviewActive = window.isPreviewMode || (document.getElementById('previewBanner') && !document.getElementById('previewBanner').classList.contains('hidden'));

    inputData.forEach((row, index) => {
        let farba = row.Farba || "Nie wybrano";
        const jednostka = row.Jednostka, typ = row.Typ, gatunek = row.Gatunek;
        const bezpiecznyTyp = typ || "";
        const typLower = bezpiecznyTyp.toLowerCase(); 
        const nazwa = row.Nazwa || "-";
        const dlugosc = row.Dlugosc || 0, szerokosc = row.Szerokosc || 0, grubosc = row.Grubosc || 0, ilosc = row.Ilosc || 1;
        
        let powierzchnia = 0, mnoznik = "-", ostatecznyTyp = bezpiecznyTyp || "Inne";

        if (typLower.includes('blach') || typLower.includes('plate')) {
            ostatecznyTyp = "Blacha";
            if (dlugosc > 0 && szerokosc > 0) { powierzchnia = (dlugosc / 1000) * (szerokosc / 1000) * ilosc * 2; mnoznik = formatNumber((szerokosc / 1000) * 2, 4); }
        } else if (bezpiecznyTyp === 'Płaskowniki FB' || typLower.includes('fb')) {
            ostatecznyTyp = "Płaskowniki FB";
            const match = nazwa.match(/\d+/); const szerokoscZNazwy = match ? parseInt(match[0]) : 0;
            if (szerokoscZNazwy > 0) { const wspl = 2 * (szerokoscZNazwy / 1000); mnoznik = formatNumber(wspl, 4); if (dlugosc > 0) powierzchnia = (dlugosc / 1000) * wspl * ilosc; }
        } else {
            const searchKey = nazwa.toUpperCase(); let wspl = undefined;
            for (const cat in database) { if (database[cat] && database[cat][searchKey] !== undefined) { wspl = database[cat][searchKey]; ostatecznyTyp = cat; break; } }
            if (wspl !== undefined) { mnoznik = formatNumber(wspl, 4); if (dlugosc > 0) powierzchnia = (dlugosc / 1000) * wspl * ilosc; }
        }

        let isManual = false;
        if (row.manualArea !== undefined && row.manualArea !== null && row.manualArea !== "") { powierzchnia = parseFloat(row.manualArea); isManual = true; }
        totalAreaSum += powierzchnia;
        
        const shopPrimerInfo = getShopprimerColor(gatunek, grubosc);
        
        const ptConfig = currentPaintTypes.find(p => p.id === farba);
        if (ptConfig && ptConfig.fallbacks && ptConfig.fallbacks[shopPrimerInfo.name]) {
            const fallbackTarget = currentPaintTypes.find(p => p.id === ptConfig.fallbacks[shopPrimerInfo.name]);
            if (fallbackTarget) {
                farba = fallbackTarget.id;
                inputData[index].Farba = farba;
            }
        }

        newResults.push({ originalIndex: index, jednostka: jednostka, farba: farba, lp: index + 1, typ: ostatecznyTyp, gatunek: gatunek, grubosc: grubosc > 0 ? grubosc : "-", nazwa: nazwa || "-", dlugosc: dlugosc || "-", szerokosc: szerokosc || "-", ilosc: ilosc, mnoznik: mnoznik, powierzchnia: powierzchnia, isManual: isManual, kolorInfo: shopPrimerInfo });
    });

    setResultsData(newResults);
    renderTable();
    
    const totAreaEl = document.getElementById('totalArea');
    if (totAreaEl) totAreaEl.textContent = formatNumber(totalAreaSum, 2);
    
    const resSec = document.getElementById('resultsSection');
    if (resSec) { resSec.classList.remove('hidden'); resSec.classList.add('flex'); }
    
    const btnSave = document.getElementById('btnSaveToSummary');
    if (btnSave) {
        if (isPreviewActive) {
            btnSave.style.display = 'none';
        } else {
            btnSave.style.display = 'flex';
            if (window.editingProtocolId) {
                btnSave.className = "bg-blue-600 text-white border border-black hover:bg-blue-800 px-6 py-2 text-sm font-bold transition flex items-center gap-1.5 uppercase shadow-md";
            } else if (inputData.length > 0) {
                btnSave.className = "bg-green-600 text-white border border-black hover:bg-green-700 px-6 py-2 text-sm font-bold transition flex items-center gap-1.5 uppercase shadow-md";
            } else {
                btnSave.className = "bg-black text-white border border-black hover:bg-gray-800 px-6 py-2 text-sm font-bold transition flex items-center gap-1.5 uppercase shadow-md";
            }
        }
    }
    
    if (window.updateProtocolDateVisuals) window.updateProtocolDateVisuals();
    calculateCosts(); 
}

export function calculateCosts() {
    const container = document.getElementById('costsBreakdownContainer');
    if (!container) return;
    container.innerHTML = '';
    if (resultsData.length === 0) { return; }

    const currentLaborCosts = window.historicalRates ? window.historicalRates.laborCosts : laborCosts;
    const currentPaintTypes = window.historicalRates ? window.historicalRates.paintTypes : paintTypes;

    const unitsData = {}; let grandTotalCost = 0;
    resultsData.forEach(item => {
        if (item.powierzchnia <= 0) return;
        const isBlacha = item.typ === 'Blacha';
        const matType = isBlacha ? 'BLACHY' : 'PROFILE';
        const unitKey = (item.jednostka || "BRAK JEDNOSTKI") + "___" + matType;
        
        if (!unitsData[unitKey]) {
            unitsData[unitKey] = { projectName: (item.jednostka || "Brak jednostki"), costBlachy: 0, costProfile: 0, paintVolumes: {} };
            currentPaintTypes.forEach(pt => { unitsData[unitKey].paintVolumes[pt.id] = { totalVolume: 0, colors: {}, thinnerPct: pt.thinnerPct }; });
        }

        const appliedCostRate = isBlacha ? currentLaborCosts.blachy : currentLaborCosts.profile;
        const itemCost = item.powierzchnia * appliedCostRate;
        if (isBlacha) unitsData[unitKey].costBlachy += itemCost; else unitsData[unitKey].costProfile += itemCost;
        grandTotalCost += itemCost;

        const brandKey = item.farba.toUpperCase();
        const ptConfig = currentPaintTypes.find(p => p.id === brandKey) || currentPaintTypes[0]; 
        if(!unitsData[unitKey].paintVolumes[brandKey]) unitsData[unitKey].paintVolumes[brandKey] = { totalVolume: 0, colors: {}, thinnerPct: ptConfig.thinnerPct };
        
        const yieldRate = isBlacha ? ptConfig.yieldBlachy : ptConfig.yieldProfile;
        const appliedYield = Math.max(yieldRate, 0.1);
        
        const itemPaintVol = item.powierzchnia / appliedYield;
        unitsData[unitKey].paintVolumes[brandKey].totalVolume += itemPaintVol;

        const colorName = item.kolorInfo.name; const colorHex = item.kolorInfo.hex;
        if (!unitsData[unitKey].paintVolumes[brandKey].colors[colorName]) unitsData[unitKey].paintVolumes[brandKey].colors[colorName] = { hex: colorHex, volume: 0 };
        unitsData[unitKey].paintVolumes[brandKey].colors[colorName].volume += itemPaintVol;
    });

    for (const [unitK, data] of Object.entries(unitsData)) {
        const isB = unitK.endsWith("___BLACHY");
        const unitNameDisplay = data.projectName + (isB ? " (BLACHY)" : " (PROFILE)");
        const unitTotalCost = data.costBlachy + data.costProfile;
        const generateBrandHtml = (brandKey) => {
            const bData = data.paintVolumes[brandKey];
            if (!bData) return `<div class="text-[9px] font-bold mt-1 uppercase text-black">Brak elementów.</div>`;
            let html = '';
            if (bData.totalVolume > 0) {
                html += '<div class="space-y-0.5 mt-1">';
                for (const [cName, cData] of Object.entries(bData.colors)) {
                    html += `<div class="flex justify-between items-center text-[9px] border border-black p-0.5 bg-white"><div class="flex items-center gap-1"><span class="w-2.5 h-2.5 border border-black block" style="background-color: ${cData.hex}"></span><span class="font-bold text-black uppercase">${cName}</span></div><span class="font-bold text-black">${formatNumber(cData.volume, 2)} L</span></div>`;
                }
                html += '</div>';
                const thinnerVol = bData.totalVolume * (bData.thinnerPct / 100);
                html += `<div class="mt-1 border-t border-black flex justify-between items-center pt-0.5 text-[9px] bg-white"><span class="font-bold text-black uppercase">Rozcieńczalnik:</span><span class="font-bold text-black">${formatNumber(thinnerVol, 2)} L</span></div>`;
            } else html = `<div class="text-[9px] font-bold mt-1 uppercase text-black">Brak elementów.</div>`;
            return html;
        };

        const unitCard = document.createElement('div'); unitCard.className = "border border-black p-2 bg-white break-inside-avoid";
        let dynamicColumnsHtml = currentPaintTypes.map(pt => `<div class="border border-black p-1 bg-white"><h4 class="text-[10px] font-bold text-black border-b border-black pb-0.5 uppercase truncate" title="${pt.name}">${pt.name}</h4>${generateBrandHtml(pt.id)}</div>`).join('');
        const colCountClass = Math.min(currentPaintTypes.length + 1, 5);

        unitCard.innerHTML = `<h3 class="text-xs font-bold uppercase mb-1 pb-0.5 border-b border-black flex items-center justify-between text-black"><span>KALKULACJA: ${unitNameDisplay}</span><span class="border border-black px-1">SUMA: ${formatNumber(unitTotalCost, 2)} PLN</span></h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${colCountClass} gap-2"><div class="border border-black p-1 bg-white"><h4 class="text-[10px] font-bold text-black uppercase border-b border-black pb-0.5">Koszty</h4><div class="space-y-0.5 text-[9px] mt-1 font-bold text-black"><div class="flex justify-between"><span>BLACHY:</span><span>${formatNumber(data.costBlachy, 2)} PLN</span></div><div class="flex justify-between"><span>PROFILE/RURY:</span><span>${formatNumber(data.costProfile, 2)} PLN</span></div><div class="border-t border-black mt-0.5 pt-0.5 flex justify-between"><span>RAZEM:</span><span>${formatNumber(unitTotalCost, 2)} PLN</span></div></div></div>${dynamicColumnsHtml}</div>`;
        container.appendChild(unitCard);
    }
    const grandTotalCard = document.createElement('div'); grandTotalCard.className = "mt-2 text-right break-inside-avoid print-hide";
    grandTotalCard.innerHTML = `<div class="inline-block bg-white text-black p-1.5 border border-black font-bold uppercase text-xs">CAŁKOWITY KOSZT: ${formatNumber(grandTotalCost, 2)} PLN</div>`;
    container.appendChild(grandTotalCard); 
}

export function renderTable() {
    const tbody = document.getElementById('resultsTableBody');
    const paintOptionsHtml = paintTypes.map(pt => `<option value="${pt.id}">${escapeHTML(pt.name)}</option>`).join('');

    const isPreviewActive = window.isPreviewMode || (document.getElementById('previewBanner') && !document.getElementById('previewBanner').classList.contains('hidden'));

    const clearBtn = document.querySelector('button[onclick="clearInputData()"]');
    if (clearBtn) clearBtn.style.display = isPreviewActive ? 'none' : 'inline-block';
    
    const dateInput = document.getElementById('protocolDateInput');
    if (dateInput) dateInput.disabled = isPreviewActive;

    let html = '';
    resultsData.forEach(row => {
        const deleteBtnHtml = isPreviewActive ? '' : `<button onclick="removeInputItem(${row.originalIndex})" class="text-black font-bold uppercase text-xs border border-black px-1 hover:bg-black hover:text-white" title="Usuń pozycję">X</button>`;
        
        const editInputAttr = isPreviewActive ? 'disabled' : '';
        const editInputClass = isPreviewActive ? 'w-full min-w-[30px] bg-transparent border-none outline-none text-right font-bold text-black px-1 py-0.5 cursor-not-allowed' : `w-full min-w-[30px] bg-transparent hover:bg-gray-200 focus:bg-gray-200 border border-transparent hover:border-black focus:border-black outline-none text-right font-bold ${row.isManual ? 'text-blue-600' : 'text-black'} px-1 py-0.5 transition-all`;
        
        const unitInputClass = isPreviewActive ? 'w-full min-w-[50px] bg-transparent border-none outline-none font-bold text-black uppercase px-1 py-0.5 cursor-not-allowed' : 'w-full min-w-[50px] bg-transparent hover:bg-gray-200 border border-transparent focus:bg-white focus:border-black outline-none font-bold text-black uppercase px-1 py-0.5 transition-all';
        
        const farbaCell = isPreviewActive ? `<span class="text-[10px] font-bold text-black uppercase block py-1">${escapeHTML(row.farba)}</span>` : `<select onchange="updateRowData(${row.originalIndex}, 'Farba', this.value)" class="w-full min-w-[60px] bg-transparent border border-transparent hover:border-black focus:border-black outline-none font-bold text-[10px] text-black transition-all">${paintOptionsHtml}</select>`;
        
        const typOptions = ["Blacha", "Profile HP", "Kątowniki L", "Płaskowniki FB", "Ceowniki UNP", "Teowniki T", "Profile IPE", "Profile HEB-HEA", "Profile półokrągłe HR", "Rury kwadratowe RHS", "Rury", "Pręty okrągłe (Ø)"];
        let typOptionsHtml = typOptions.map(t => `<option value="${t}" ${row.typ === t ? 'selected' : ''}>${t}</option>`).join('');
        const typCell = isPreviewActive ? `<span class="text-[10px] font-bold text-black uppercase block py-1">${escapeHTML(row.typ)}</span>` : `<select onchange="updateRowData(${row.originalIndex}, 'Typ', this.value)" class="w-full min-w-[60px] bg-transparent border border-transparent hover:border-black focus:border-black outline-none font-bold text-[10px] text-black uppercase transition-all">${typOptionsHtml}</select>`;
        
        const gatunekCell = isPreviewActive ? `<span class="text-[11px] font-bold text-black block text-center py-1">${escapeHTML(row.gatunek)}</span>` : `<input type="text" value="${escapeHTML(row.gatunek)}" onchange="updateRowData(${row.originalIndex}, 'Gatunek', this.value)" list="dl-gatunki" class="w-full min-w-[30px] bg-transparent hover:bg-gray-200 focus:bg-white border border-transparent hover:border-black focus:border-black outline-none font-bold text-black px-1 py-0.5 transition-all">`;
        
        const gruboscVal = row.grubosc !== '-' ? row.grubosc : '';
        const gruboscCell = isPreviewActive ? `<span class="text-[11px] font-bold text-black block text-right py-1">${typeof row.grubosc === 'number' ? formatNumber(row.grubosc, 1) : row.grubosc}</span>` : `<input type="number" step="0.1" value="${gruboscVal}" onchange="updateRowData(${row.originalIndex}, 'Grubosc', this.value)" class="w-full min-w-[30px] text-right bg-transparent hover:bg-gray-200 focus:bg-white border border-transparent hover:border-black focus:border-black outline-none text-black font-bold px-1 py-0.5 transition-all">`;
        
        const nazwaVal = row.nazwa !== '-' ? row.nazwa : '';
        const nazwaCell = isPreviewActive ? `<span class="text-[11px] font-bold text-black block py-1">${escapeHTML(row.nazwa)}</span>` : `<input type="text" value="${escapeHTML(row.nazwa)}" onchange="updateRowData(${row.originalIndex}, 'Nazwa', this.value)" list="dl-profile" class="w-full min-w-[40px] bg-transparent hover:bg-gray-200 focus:bg-white border border-transparent hover:border-black focus:border-black outline-none font-bold text-black px-1 py-0.5 transition-all">`;
        
        const szerokoscVal = row.szerokosc !== '-' ? row.szerokosc : '';
        const szerokoscCell = isPreviewActive ? `<span class="text-[11px] font-normal text-black block text-center py-1">${typeof row.szerokosc === 'number' ? formatNumber(row.szerokosc, 0) : row.szerokosc}</span>` : `<input type="number" step="1" value="${szerokoscVal}" onchange="updateRowData(${row.originalIndex}, 'Szerokosc', this.value)" class="w-full min-w-[30px] text-center bg-transparent hover:bg-gray-200 focus:bg-white border border-transparent hover:border-black focus:border-black outline-none text-black px-1 py-0.5 transition-all">`;
        
        const dlugoscVal = row.dlugosc !== '-' ? row.dlugosc : '';
        const dlugoscCell = isPreviewActive ? `<span class="text-[11px] font-normal text-black block text-center py-1">${typeof row.dlugosc === 'number' ? formatNumber(row.dlugosc, 0) : row.dlugosc}</span>` : `<input type="number" step="1" value="${dlugoscVal}" onchange="updateRowData(${row.originalIndex}, 'Dlugosc', this.value)" class="w-full min-w-[30px] text-center bg-transparent hover:bg-gray-200 focus:bg-white border border-transparent hover:border-black focus:border-black outline-none text-black px-1 py-0.5 transition-all">`;
        
        const iloscCell = isPreviewActive ? `<span class="text-[11px] font-bold text-black block text-center py-1">${formatNumber(row.ilosc, 0)}</span>` : `<input type="number" step="1" value="${row.ilosc}" onchange="updateRowData(${row.originalIndex}, 'Ilosc', this.value)" class="w-full min-w-[30px] text-center bg-transparent hover:bg-gray-200 focus:bg-white border border-transparent hover:border-black focus:border-black outline-none font-bold text-black px-1 py-0.5 transition-all">`;

        html += `
            <tr class="hover:bg-gray-100 transition-colors border-b border-black">
                <td class="px-1 py-1 border-r border-black text-black">${row.lp}</td>
                <td class="px-1 py-1 border-r border-black font-bold text-black uppercase"><input type="text" ${editInputAttr} value="${escapeHTML(row.jednostka)}" onchange="updateUnit(${row.originalIndex}, this.value)" class="${unitInputClass}" title="Zmień projekt" list="dl-projects"></td>
                <td class="px-1 py-1 border-r border-black align-middle">${farbaCell}</td>
                <td class="px-1 py-1 border-r border-black text-black uppercase align-middle">${typCell}</td>
                <td class="px-1 py-1 border-r border-black font-bold text-black">${gatunekCell}</td>
                <td class="px-1 py-1 border-r border-black text-right text-black font-bold">${gruboscCell}</td>
                <td class="px-1 py-1 border-r border-black font-bold text-black">${nazwaCell}</td>
                <td class="px-1 py-1 border-r border-black text-center text-black">${szerokoscCell}</td>
                <td class="px-1 py-1 border-r border-black text-center text-black">${dlugoscCell}</td>
                <td class="px-1 py-1 border-r border-black text-center font-bold">${iloscCell}</td>
                <td class="px-1 py-1 border-r border-black text-right text-black align-middle">${row.mnoznik}</td>
                <td class="px-1 py-1 border-r border-black text-right font-bold bg-white"><input type="text" ${editInputAttr} value="${row.powierzchnia > 0 || row.isManual ? formatNumber(row.powierzchnia, 2) : ''}" onchange="updateArea(${row.originalIndex}, this.value)" class="${editInputClass}" title="Edytuj pow."></td>
                <td class="px-1 py-1 border-r border-black"><div class="flex items-center gap-1" title="${row.kolorInfo.name}"><span class="w-2.5 h-2.5 shrink-0 border border-black block" style="background-color: ${row.kolorInfo.hex}"></span><span class="text-[9px] font-bold text-black uppercase truncate max-w-[50px]">${row.kolorInfo.name}</span></div></td>
                <td class="px-1 py-1 text-center print-hide action-col align-middle">${deleteBtnHtml}</td>
            </tr>
        `;
    });
    if (tbody) tbody.innerHTML = html;
    
    resultsData.forEach(row => { 
        if (!isPreviewActive && tbody) { 
            const selFarba = tbody.children[row.originalIndex]?.querySelectorAll('select')[0];
            const selTyp = tbody.children[row.originalIndex]?.querySelectorAll('select')[1];
            if(selFarba) selFarba.value = row.farba; 
            if(selTyp) selTyp.value = row.typ;
        } 
    });
    
    document.querySelectorAll('.action-col').forEach(el => { 
        if(isPreviewActive) el.classList.add('hidden'); 
        else el.classList.remove('hidden'); 
    });
}

// ==========================================
// PODPIĘCIE FUNKCJI DO OBIEKTU WINDOW
// ==========================================
window.flashAndExecute = flashAndExecute;
window.initGatunkiSelect = initGatunkiSelect;
window.toggleFormFields = toggleFormFields;
window.updateProfilSelect = updateProfilSelect;

window.filterDbTable = filterDbTable;
window.addManualDbItem = addManualDbItem;
window.updateDbMultiplier = updateDbMultiplier;
window.removeDbItem = removeDbItem; // Dodane nowe podpięcie
window.renderDbTable = renderDbTable;

window.getShopprimerColor = getShopprimerColor;
window.renderColorsTable = renderColorsTable;
window.renderPaintTypesTable = renderPaintTypesTable;
window.updateLaborCosts = updateLaborCosts;
window.updatePaintParam = updatePaintParam;
window.addPaintType = addPaintType;
window.removePaintType = removePaintType;
window.openPaintRulesModal = openPaintRulesModal;
window.savePaintRules = savePaintRules;
window.getInduscoPaintsHtml = getInduscoPaintsHtml;
window.updatePaintDropdowns = updatePaintDropdowns;

window.addManualItem = addManualItem;
window.clearAddForm = clearAddForm;
window.clearInputData = clearInputData;
window.removeInputItem = removeInputItem;
window.updateArea = updateArea;
window.updateUnit = updateUnit;
window.updateRowData = updateRowData;
window.calculate = calculate;
window.calculateCosts = calculateCosts;
window.renderTable = renderTable;