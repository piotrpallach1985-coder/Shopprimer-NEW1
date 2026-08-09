// --- MODUŁ ZARZĄDZANIA STANEM I BAZĄ DANYCH (STORE.JS) ---

import { USE_FIREBASE } from './config.js';
import { firebaseDb, dbRef, dbSet, dbGet, appUsers } from './auth.js';
import { parsePlDateToISO, formatISOToPL, parsePlDate } from './utils.js';

// --- STANY GLOBALNE APLIKACJI ---
export let currentFileHandle = null;
export let isPreviewMode = false;
export let autoSaveTimeout = null;
export let protocolCounter = 0;
export let currentPreviewProtocolNumber = null;

window.editingProtocolId = null;
window.tempInputData = null;
window.sourceTabForPreview = null;
window.firebasePermissionDenied = false;
window.historicalRates = null;

export let inputData = [];
export let resultsData = [];
export let printHistory = [];
export let filteredHistory = [];
export let projectsList = [];
export let archivedProjectsList = [];
export let induscoHistory = [];
export let induscoDailyRecords = [];
export let activeRemanentAlerts = [];
export let activeInduscoRequests = [];
window.currentNegativeAlerts = [];
export let database = {};
export let visibleDailyPaints = null;
export let paintMonthlyCosts = {};

export let paintTypes = [
    { id: 'SIGMAWELD', name: 'SIGMAWELD', yieldBlachy: 10.0, yieldProfile: 6.5, thinnerPct: 14, fallbacks: {} }
];
export let laborCosts = { blachy: 4.20, profile: 6.80 };
// Zmienna userPreferences potrzebna dla setUserPreferences
export let userPreferences = null;
// Eksport usersList (odwołanie do appUsers z auth.js)
export const usersList = appUsers;

window.hasUnsavedChanges = false;
window.isSyncing = false;
window.saveQueuePromise = Promise.resolve();
window.forceNextCloudOverwrite = false;

// Settery dla zmiennych stanu (używane przy aktualizacji z innych plików)
export function setInputData(data) { inputData = data; }
export function setResultsData(data) { resultsData = data; }
export function setPrintHistory(history) { printHistory = history; }
export function setProjectsList(list) { projectsList = list; }
export function setArchivedProjectsList(list) { archivedProjectsList = list; }
export function setInduscoHistory(history) { induscoHistory = history; }
export function setInduscoDailyRecords(records) { induscoDailyRecords = records; }
export function setActiveRemanentAlerts(alerts) { activeRemanentAlerts = alerts; }
export function setActiveInduscoRequests(requests) { activeInduscoRequests = requests; }
export function setDatabase(db) { database = db; }
export function setPaintTypes(types) { paintTypes = types; }
export function setLaborCosts(costs) { laborCosts = costs; }
export function setVisibleDailyPaints(val) { visibleDailyPaints = val; }
export function setUserPreferences(val) { userPreferences = val; }
export function setUsersList(list) {
    if (appUsers && typeof appUsers.push === 'function') {
        appUsers.length = 0; 
        appUsers.push(...list);
    }
}

import { 
    dbOnChildAdded, dbOnChildChanged, dbOnChildRemoved, dbOnValue 
} from './auth.js';

export function initFirebaseListeners() {
    if (window.firebasePermissionDenied || !USE_FIREBASE || !firebaseDb) return;
    
    const stateRef = dbRef(firebaseDb, 'appState');

    // 1. Oparte na wartościach (Value Listeners) dla obiektów
    dbOnValue(dbRef(firebaseDb, 'appState/database'), (snapshot) => {
        if (snapshot.exists()) {
            setDatabase(snapshot.val());
            if (window.renderDbTable) window.renderDbTable();
        }
    });

    dbOnValue(dbRef(firebaseDb, 'appState/laborCosts'), (snapshot) => {
        if (snapshot.exists()) {
            setLaborCosts(snapshot.val());
            if (window.renderPaintTypesTable) window.renderPaintTypesTable();
        }
    });

    dbOnValue(dbRef(firebaseDb, 'appState/paintTypes'), (snapshot) => {
        if (snapshot.exists()) {
            // Firebase tablice mogą być obiektami z kluczami liczbowymi jeśli są luki, konwertujemy do bezpiecznej tablicy:
            const data = snapshot.val();
            const arr = Array.isArray(data) ? data : Object.values(data);
            const filteredArr = arr.filter(p => p !== null);
            // Deduplikacja na wypadek zduplikowanych wpisów w bazie
            const uniquePaints = [...new Map(filteredArr.map(item => [item.id, item])).values()];
            setPaintTypes(uniquePaints);
            if (window.renderPaintTypesTable) window.renderPaintTypesTable();
            if (window.updatePaintDropdowns) window.updatePaintDropdowns();
        }
    });

    dbOnValue(dbRef(firebaseDb, 'appState/protocolCounter'), (snapshot) => {
        if (snapshot.exists()) protocolCounter = snapshot.val();
    });

    dbOnValue(dbRef(firebaseDb, 'appState/paintMonthlyCosts'), (snapshot) => {
        if (snapshot.exists()) {
            paintMonthlyCosts = snapshot.val();
            if (window.renderPaintReport) window.renderPaintReport();
        } else {
            paintMonthlyCosts = {};
            if (window.renderPaintReport) window.renderPaintReport();
        }
    });

    // Funkcja pomocnicza dla obsługi list (Child Listeners)
    const setupListListener = (path, getLocalArray, renderFunc) => {
        const refObj = dbRef(firebaseDb, `appState/${path}`);
        
        let debounceTimer = null;
        const triggerRender = () => {
            if (!renderFunc) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                renderFunc();
            }, 50);
        };

        dbOnChildAdded(refObj, (snapshot) => {
            const item = snapshot.val();
            item.firebaseKey = snapshot.key;
            
            const localArray = getLocalArray();
            let existingIdx = localArray.findIndex(i => 
                (i.firebaseKey && i.firebaseKey === snapshot.key) || 
                (item.id && i.id === item.id) || 
                (item.login && i.login === item.login) || 
                (item.name && i.name === item.name)
            );

            // Zabezpieczenie dla starych rekordów bez unikalnego ID (aby uniknąć duplikatów z applyProjectData)
            if (existingIdx === -1 && !item.id && !item.login && !item.name) {
                existingIdx = localArray.findIndex(i => {
                    if (i.firebaseKey || i.id) return false;
                    const iCopy = { ...i }; delete iCopy.firebaseKey;
                    const itemCopy = { ...item }; delete itemCopy.firebaseKey;
                    return JSON.stringify(iCopy) === JSON.stringify(itemCopy);
                });
            }

            if (existingIdx > -1) {
                // Jeśli istnieje, aktualizujemy jego firebaseKey i zawartość (serwer ma najnowszą wersję)
                localArray[existingIdx] = Object.assign({}, localArray[existingIdx], item);
                triggerRender();
            } else {
                localArray.push(item);
                triggerRender();
            }
        });
        dbOnChildChanged(refObj, (snapshot) => {
            const item = snapshot.val();
            item.firebaseKey = snapshot.key;
            const localArray = getLocalArray();
            const idx = localArray.findIndex(i => 
                i.firebaseKey === snapshot.key || 
                (item.id && i.id === item.id) || 
                (item.login && i.login === item.login) || 
                (item.name && i.name === item.name)
            );
            if (idx > -1) {
                localArray[idx] = item;
                triggerRender();
            }
        });
        dbOnChildRemoved(refObj, (snapshot) => {
            const localArray = getLocalArray();
            const idx = localArray.findIndex(i => i.firebaseKey === snapshot.key);
            if (idx > -1) {
                localArray.splice(idx, 1);
                triggerRender();
            }
        });
    };

    // 2. Nasłuchiwacze list
    setupListListener('printHistory', () => printHistory, () => { 
        if (window.renderHistoryTable) window.renderHistoryTable(); 
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailySidebar) window.renderDailySidebar();
        if (window.renderDailyLedger) window.renderDailyLedger();
    });
    setupListListener('induscoHistory', () => induscoHistory, () => { 
        if (window.renderInduscoTable) window.renderInduscoTable(); 
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailyInduscoSidebar) window.renderDailyInduscoSidebar();
        if (window.renderDailyInduscoLedger) window.renderDailyInduscoLedger();
        if (window.renderDailySidebar) window.renderDailySidebar();
        if (window.renderDailyLedger) window.renderDailyLedger();
    });
    setupListListener('induscoDailyRecords', () => induscoDailyRecords, () => { if (window.renderDailyInduscoLedger) window.renderDailyInduscoLedger(); });
    setupListListener('activeRemanentAlerts', () => activeRemanentAlerts, () => { if (window.updateAlertsUI) window.updateAlertsUI(); });
    setupListListener('activeInduscoRequests', () => activeInduscoRequests, () => { if (window.updateAlertsUI) window.updateAlertsUI(); });
    setupListListener('projectsList', () => projectsList, () => { if (window.renderProjectsList) window.renderProjectsList(); });
    setupListListener('archivedProjectsList', () => archivedProjectsList, null);
    
    // Lista Użytkowników
    setupListListener('appUsers', () => appUsers, () => { if (window.renderUsersTable) window.renderUsersTable(); });
}

export function getProjectState() {
    return {
        isMm: true,
        appUsers: usersList,
        projectsList: projectsList,
        archivedProjectsList: archivedProjectsList,
        database: database,
        paintMonthlyCosts: paintMonthlyCosts,
        inputData: inputData,
        printHistory: printHistory,
        induscoHistory: induscoHistory || [],
        induscoDailyRecords: induscoDailyRecords || [],
        activeRemanentAlerts: activeRemanentAlerts,
        activeInduscoRequests: activeInduscoRequests,
        protocolCounter: protocolCounter,
        paintTypes: paintTypes,
        laborCosts: laborCosts,
        visibleDailyPaints: visibleDailyPaints
    };
}

export async function autoSaveToDisk(immediate = false) {
    // FUNKCJA ZDEPRECJONOWANA. 
    // Zostanie całkowicie usunięta, gdy wszystkie moduły będą używać bezpośredniego zapisu (dbSet/dbPush).
    // Zostawiamy ją pustą (jako dummy), aby aplikacja nie zwracała błędów 'autoSaveToDisk is not a function' w nieprzepisanych jeszcze miejscach.
}

export async function applyProjectData(jsonString, isSilent = false) {
    try {
        const projectData = JSON.parse(jsonString);

        if (projectData.database) {
            let safeDatabase = {};
            for (let cat in projectData.database) {
                let newCat = cat;
                if (["Profile HEA/HEB", "Profile HEA-HEB", "Profile HEB/HEA", "Profile HEB-HEA"].includes(cat)) {
                    newCat = "Profile HEB-HEA";
                }
                if (!safeDatabase[newCat]) safeDatabase[newCat] = {};
                for (let itemKey in projectData.database[cat]) {
                    let safeItemKey = itemKey.replace(/[\.\$#\[\]\/]/g, ',');
                    safeDatabase[newCat][safeItemKey] = projectData.database[cat][itemKey];
                }
            }
            database = safeDatabase;
        }

        const ensureArray = (data) => {
            if (!data) return [];
            let arr = Array.isArray(data) ? data : Object.values(data);
            arr = arr.filter(i => i !== null);
            // Deduplikacja po id, login, name
            const map = new Map();
            arr.forEach(item => {
                const uniqueKey = item.id || item.login || item.name || item.firebaseKey || Math.random();
                map.set(uniqueKey, item);
            });
            return Array.from(map.values());
        };

        if (projectData.projectsList) {
            projectsList = ensureArray(projectData.projectsList).map(p => typeof p === 'string' ? { name: p, date: '' } : p);
        }
        if (projectData.archivedProjectsList) archivedProjectsList = ensureArray(projectData.archivedProjectsList);
        if (projectData.induscoHistory) induscoHistory = ensureArray(projectData.induscoHistory);
        if (projectData.induscoDailyRecords) induscoDailyRecords = ensureArray(projectData.induscoDailyRecords); else induscoDailyRecords = [];
        if (projectData.activeRemanentAlerts) activeRemanentAlerts = ensureArray(projectData.activeRemanentAlerts);
        if (projectData.activeInduscoRequests) activeInduscoRequests = ensureArray(projectData.activeInduscoRequests);
        if (projectData.paintMonthlyCosts) paintMonthlyCosts = projectData.paintMonthlyCosts;

        if (projectData.protocolCounter !== undefined) protocolCounter = projectData.protocolCounter;
        visibleDailyPaints = projectData.visibleDailyPaints !== undefined ? projectData.visibleDailyPaints : null;

        if (projectData.inputData) inputData = ensureArray(projectData.inputData);
        if (projectData.printHistory) printHistory = ensureArray(projectData.printHistory);

        if (projectData.paintTypes) {
            paintTypes = ensureArray(projectData.paintTypes);
            laborCosts = projectData.laborCosts || { blachy: 4.20, profile: 6.80 };
        }

        // Wczytywanie listy użytkowników z zapisu
        if (projectData.appUsers) {
            setUsersList(projectData.appUsers);
        }

        if (window.renderDbTable) window.renderDbTable();
        if (window.renderPaintTypesTable) window.renderPaintTypesTable();
        if (window.updatePaintDropdowns) window.updatePaintDropdowns();
        if (window.renderHistoryTable) window.renderHistoryTable();
        if (window.renderProjectsList) window.renderProjectsList();
        if (window.renderInduscoTable) window.renderInduscoTable();
        
        // Zestawienia dzienne
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailySidebar) window.renderDailySidebar();
        if (window.renderDailyLedger) window.renderDailyLedger();
        if (window.renderDailyInduscoSidebar) window.renderDailyInduscoSidebar();
        if (window.renderDailyInduscoLedger) window.renderDailyInduscoLedger();

        // Wymuszenie renderowania widoku ustawień po wczytaniu
        if (window.renderUsersTable) window.renderUsersTable();
        if (window.renderUserPreferences) window.renderUserPreferences();

        const initialOverlay = document.getElementById('initialLoadOverlay');
        if (initialOverlay) { initialOverlay.classList.add('hidden'); initialOverlay.classList.remove('flex'); }

        if (!isSilent && window.customAlert) await window.customAlert("Wczytano projekt pomyślnie.");
    } catch (error) {
        if (!isSilent && window.customAlert) await window.customAlert("Błąd odczytu danych.");
    }
}

export async function loadDataFromFirebase() {
    try {
        if (!firebaseDb || !dbGet || !dbRef) return;
        
        const oldSnapshot = await dbGet(dbRef(firebaseDb, '/'));
        let oldData = oldSnapshot.exists() ? oldSnapshot.val() : {};
        
        let mergedData = {};
        
        // Weź wszystko ze starej struktury jako fallback (pomiń węzeł appState)
        if (oldData) {
            for (let key in oldData) {
                if (key !== 'appState') {
                    mergedData[key] = oldData[key];
                }
            }
        }
        
        // Nadpisz nowymi danymi z węzła appState
        if (oldData && oldData.appState) {
            for (let key in oldData.appState) {
                mergedData[key] = oldData.appState[key];
            }
        }
        
        if (Object.keys(mergedData).length > 0) {
            await applyProjectData(JSON.stringify(mergedData), true);
            
            // JEDNORAZOWA MIGRACJA: Jeśli brakuje kluczowych elementów w nowej strukturze, przepisz je
            if (!oldData.appState || !oldData.appState.database || !oldData.appState.paintTypes) {
                // To wywoła jednorazowy zapis pełnego stanu do nowego węzła appState
                dbSet(dbRef(firebaseDb, 'appState'), mergedData);
            }
        }
    } catch (err) {
        if (err.message && err.message.includes('Permission denied')) {
            window.firebasePermissionDenied = true;
        }
    }
}

// Globalne przypisania do window
window.autoSaveToDisk = autoSaveToDisk;
window.applyProjectData = applyProjectData;
window.loadDataFromFirebase = loadDataFromFirebase;
window.getProjectState = getProjectState;

window.savePaintMonthlyCost = function(month, paintId, type, cost) {
    if (!paintMonthlyCosts[month]) paintMonthlyCosts[month] = {};
    if (!paintMonthlyCosts[month][paintId]) paintMonthlyCosts[month][paintId] = { paint: 0, thinner: 0 };
    paintMonthlyCosts[month][paintId][type] = cost;
    
    if (window.autoSaveToDisk) window.autoSaveToDisk();
    if (window.renderPaintReport) window.renderPaintReport();
};