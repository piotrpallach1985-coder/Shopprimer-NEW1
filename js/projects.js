// --- MODUŁ ZARZĄDZANIA PROJEKTAMI I ARCHIWUM (PROJECTS.JS) ---

import { formatNumber, escapeHTML, parsePlDate } from './utils.js';
import { projectsList, archivedProjectsList, printHistory } from './store.js';
import { firebaseDb, dbRef, dbSet } from './auth.js';

export function getProjectStats(projectName) {
    let stats = { area: 0, paint: 0, thinner: 0, cost: 0 };
    const pName = (projectName || "").toUpperCase().trim();
    if (!pName) return stats;

    printHistory.forEach(h => {
        if (h.isError) return;
        const hName = (h.projectName || h.unit || "").toUpperCase().trim();
        if (hName === pName) {
            stats.area += (h.area || 0);
            stats.cost += (h.cost || 0);
            let thTotal = 0;
            if (h.brandStats) {
                Object.values(h.brandStats).forEach(bs => {
                    stats.paint += (bs.vol || 0);
                    thTotal += (bs.thinner || 0);
                });
            }
            if (h.thinnerVol && thTotal === 0) thTotal = h.thinnerVol;
            stats.thinner += thTotal;
        }
    });
    return stats;
}

export function renderProjectsList() {
    projectsList.sort((a, b) => {
        const dateA = a.date ? parsePlDate(a.date).getTime() : 0;
        const dateB = b.date ? parsePlDate(b.date).getTime() : 0;
        return dateA - dateB;
    });

    const tbody = document.getElementById('projectsTableBody');
    if(tbody) {
        let html = '';
        projectsList.forEach((p, i) => {
            const stats = getProjectStats(p.name);
            const safeName = escapeHTML(p.name);
            const dateHtml = p.date ? `<span class="text-[9px] text-gray-500 font-normal normal-case ml-2 block mt-0.5">(Dodano: ${p.date})</span>` : '';
            html += `
                <tr class="hover:bg-gray-100 transition-colors">
                    <td class="px-3 py-2 border-r border-black font-bold text-black uppercase">${safeName}${dateHtml}</td>
                    <td class="px-3 py-2 border-r border-black text-right text-black font-bold">${formatNumber(stats.area, 2)}</td>
                    <td class="px-3 py-2 border-r border-black text-right text-blue-700 font-bold">${formatNumber(stats.paint, 2)}</td>
                    <td class="px-3 py-2 border-r border-black text-right text-yellow-600 font-bold">${formatNumber(stats.thinner, 2)}</td>
                    <td class="px-3 py-2 border-r border-black text-right text-green-700 font-bold">${formatNumber(stats.cost, 2)}</td>
                    <td class="px-3 py-2 text-center align-middle">
                        <div class="flex gap-1 justify-center">
                            <button onclick="archiveProject(${i})" class="text-black font-bold uppercase text-[10px] border border-black px-2 py-0.5 hover:bg-black hover:text-white bg-white">Archiwizuj</button>
                            <button onclick="removeProject(${i})" class="text-black font-bold uppercase text-[10px] border border-black px-2 py-0.5 hover:bg-black hover:text-white bg-white">Usuń</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }
    const sel = document.getElementById('formJednostka');
    if (sel) {
        const currentVal = sel.value;
        sel.innerHTML = projectsList.length === 0 ? '<option value="">-- brak (dodaj z listy) --</option>' : '';
        projectsList.forEach(p => {
            const opt = document.createElement('option'); opt.value = p.name; opt.textContent = p.name;
            sel.appendChild(opt);
        });
        
        if (currentVal && !projectsList.some(p => p.name === currentVal)) {
            const opt = document.createElement('option');
            opt.value = currentVal; opt.textContent = currentVal + " (Archiwum)";
            sel.appendChild(opt);
            sel.value = currentVal;
        } else if (projectsList.some(p => p.name === currentVal)) {
            sel.value = currentVal;
        }
    }
    const dlProj = document.getElementById('dl-projects');
    if (dlProj) {
        dlProj.innerHTML = '';
        projectsList.forEach(p => {
            const opt = document.createElement('option'); opt.value = p.name; dlProj.appendChild(opt);
        });
    }
}

export async function addProject() {
    const val = document.getElementById('formNewProjectName').value.trim().toUpperCase();
    if (!val) return;
    const isArchived = archivedProjectsList.some(p => (typeof p === 'object' ? p.name : p) === val);
    if (!projectsList.some(p => p.name === val) && !isArchived) {
        projectsList.push({ name: val, date: new Date().toLocaleDateString('pl-PL'), lastModified: Date.now() });
        document.getElementById('formNewProjectName').value = '';
        renderProjectsList(); 
        if(window.renderInduscoTable) window.renderInduscoTable(); 
        dbSet(dbRef(firebaseDb, 'appState/projectsList'), projectsList);
    } else { await window.customAlert('Projekt już istnieje na liście (lub w archiwum)!'); }
}

export async function removeProject(index) {
    if(await window.customConfirm("Czy jesteś pewien, że chcesz trwale usunąć ten projekt z listy?")) {
        window.forceNextCloudOverwrite = true;
        projectsList.splice(index, 1); 
        renderProjectsList(); 
        if(window.renderInduscoTable) window.renderInduscoTable(); 
        dbSet(dbRef(firebaseDb, 'appState/projectsList'), projectsList);
    }
}

export function renderArchiveList() {
    const tbody = document.getElementById('archiveTableBody');
    if(tbody) {
        if (archivedProjectsList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="px-3 py-2 text-center font-bold text-gray-500 uppercase">Brak zarchiwizowanych projektów.</td></tr>`;
        } else {
            let html = '';
            archivedProjectsList.forEach((p, i) => {
                let pName = typeof p === 'object' ? p.name : p;
                let safeName = escapeHTML(pName);
                let pDate = typeof p === 'object' && p.date ? ` <span class="text-[10px] text-gray-500 font-normal ml-2 normal-case block mt-0.5">(Zarchiwizowano: ${p.date})</span>` : '';
                const stats = getProjectStats(pName);
                html += `
                    <tr class="hover:bg-gray-200 transition-colors">
                        <td class="px-3 py-2 border-r border-gray-400 font-bold uppercase text-gray-700">${safeName}${pDate}</td>
                        <td class="px-3 py-2 border-r border-gray-400 text-right text-gray-700 font-bold">${formatNumber(stats.area, 2)}</td>
                        <td class="px-3 py-2 border-r border-gray-400 text-right text-blue-800 font-bold">${formatNumber(stats.paint, 2)}</td>
                        <td class="px-3 py-2 border-r border-gray-400 text-right text-yellow-700 font-bold">${formatNumber(stats.thinner, 2)}</td>
                        <td class="px-3 py-2 border-r border-gray-400 text-right text-green-800 font-bold">${formatNumber(stats.cost, 2)}</td>
                        <td class="px-3 py-2 text-center align-middle">
                            <button onclick="unarchiveProject(${i})" class="text-black font-bold uppercase text-[10px] border border-black px-2 py-0.5 hover:bg-black hover:text-white bg-white shadow-sm">Przywróć</button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
    }
}

export async function archiveProject(index) {
    if(await window.customConfirm("Czy chcesz przenieść ten projekt do archiwum? Zniknie on z głównych list wyboru projektu.")) {
        window.forceNextCloudOverwrite = true;
        archivedProjectsList.push({ name: projectsList[index].name, date: new Date().toLocaleDateString('pl-PL') });
        projectsList.splice(index, 1);
        renderProjectsList(); renderArchiveList(); 
        if(window.renderInduscoTable) window.renderInduscoTable(); 
        dbSet(dbRef(firebaseDb, 'appState/projectsList'), projectsList);
        dbSet(dbRef(firebaseDb, 'appState/archivedProjectsList'), archivedProjectsList);
    }
}

export async function unarchiveProject(index) {
    if(await window.customConfirm("Czy chcesz przywrócić ten projekt do aktywnych? Znów pojawi się na liście wyboru.")) {
        window.forceNextCloudOverwrite = true;
        let pName = typeof archivedProjectsList[index] === 'object' ? archivedProjectsList[index].name : archivedProjectsList[index];
        projectsList.push({ name: pName, date: new Date().toLocaleDateString('pl-PL'), lastModified: Date.now() });
        archivedProjectsList.splice(index, 1);
        renderProjectsList(); renderArchiveList(); 
        if(window.renderInduscoTable) window.renderInduscoTable(); 
        dbSet(dbRef(firebaseDb, 'appState/projectsList'), projectsList);
        dbSet(dbRef(firebaseDb, 'appState/archivedProjectsList'), archivedProjectsList);
    }
}

// Podpięcie do obiektu globalnego
window.renderProjectsList = renderProjectsList;
window.addProject = addProject;
window.removeProject = removeProject;
window.renderArchiveList = renderArchiveList;
window.archiveProject = archiveProject;
window.unarchiveProject = unarchiveProject;