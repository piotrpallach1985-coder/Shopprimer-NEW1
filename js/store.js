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

export function getProjectState() {
    return {
        isMm: true,
        appUsers: usersList, // Poprawiono z appUsers na usersList, aby pobierać aktualną listę użytkowników
        projectsList: projectsList,
        archivedProjectsList: archivedProjectsList,
        database: database,
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
    if (window.firebasePermissionDenied) return;
    if (!USE_FIREBASE && !currentFileHandle) return;
    
    window.hasUnsavedChanges = true;
    if (window.updateSyncUI) window.updateSyncUI('pending');

    const doSave = async () => {
        window.isSyncing = true;
        if (window.updateSyncUI) window.updateSyncUI('syncing');
        try {
            let stateToSave = getProjectState();
            
            if (USE_FIREBASE && firebaseDb && dbSet && dbRef && dbGet) {
                if (!window.forceNextCloudOverwrite) {
                    const snapshot = await dbGet(dbRef(firebaseDb, 'appState'));
                    if (snapshot.exists()) {
                        const cloudState = snapshot.val();
                        
                        if (cloudState.printHistory) {
                            const localMap = new Map(stateToSave.printHistory.map(h => [h.id, h]));
                            const mergedHistory = [];
                            cloudState.printHistory.forEach(ch => {
                                if (localMap.has(ch.id)) {
                                    const lh = localMap.get(ch.id);
                                    const cTime = ch.lastModified || 0;
                                    const lTime = lh.lastModified || 0;
                                    if (cTime > lTime || (cTime === 0 && lTime === 0 && JSON.stringify(ch) !== JSON.stringify(lh))) {
                                        mergedHistory.push(ch);
                                    } else {
                                        mergedHistory.push(lh);
                                    }
                                    localMap.delete(ch.id);
                                } else {
                                    mergedHistory.push(ch);
                                }
                            });
                            localMap.forEach(lh => mergedHistory.push(lh));
                            stateToSave.printHistory = mergedHistory;
                        }
                    }
                }
                
                window.forceNextCloudOverwrite = false;
                const cleanState = JSON.parse(JSON.stringify(stateToSave));
                await dbSet(dbRef(firebaseDb, 'appState'), cleanState);
                
                printHistory = cleanState.printHistory || [];
                induscoHistory = cleanState.induscoHistory || [];
                projectsList = cleanState.projectsList || [];
                induscoDailyRecords = cleanState.induscoDailyRecords || [];
            }
            window.hasUnsavedChanges = false;
            if (window.updateSyncUI) window.updateSyncUI('saved');
        } catch (e) {
            console.error("Autozapis w tle nieudany.", e);
            if (window.updateSyncUI) window.updateSyncUI('error');
        } finally {
            window.isSyncing = false;
            if (window.hasUnsavedChanges && window.updateSyncUI) window.updateSyncUI('pending');
        }
    };

    if (immediate) {
        clearTimeout(autoSaveTimeout);
        window.saveQueuePromise = window.saveQueuePromise.then(doSave).catch(() => {});
        await window.saveQueuePromise;
    } else {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
            window.saveQueuePromise = window.saveQueuePromise.then(doSave).catch(() => {});
        }, 2000);
    }
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

        if (projectData.projectsList) {
            projectsList = projectData.projectsList.map(p => typeof p === 'string' ? { name: p, date: '' } : p);
        }
        if (projectData.archivedProjectsList) archivedProjectsList = projectData.archivedProjectsList;
        if (projectData.induscoHistory) induscoHistory = projectData.induscoHistory;
        if (projectData.induscoDailyRecords) induscoDailyRecords = projectData.induscoDailyRecords; else induscoDailyRecords = [];
        if (projectData.activeRemanentAlerts) activeRemanentAlerts = projectData.activeRemanentAlerts;
        if (projectData.activeInduscoRequests) activeInduscoRequests = projectData.activeInduscoRequests;

        if (projectData.protocolCounter !== undefined) protocolCounter = projectData.protocolCounter;
        visibleDailyPaints = projectData.visibleDailyPaints !== undefined ? projectData.visibleDailyPaints : null;

        if (projectData.inputData) inputData = projectData.inputData;
        if (projectData.printHistory) printHistory = projectData.printHistory;

        if (projectData.paintTypes) {
            paintTypes = projectData.paintTypes;
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
        
        // Szukanie w nowej strukturze
        const snapshot = await dbGet(dbRef(firebaseDb, 'appState'));
        if (snapshot.exists()) {
            await applyProjectData(JSON.stringify(snapshot.val()), true);
        } else {
            // Szukanie w starej strukturze głównej (wsteczna kompatybilność)
            const oldSnapshot = await dbGet(dbRef(firebaseDb, '/'));
            if (oldSnapshot.exists() && oldSnapshot.val() && oldSnapshot.val().projectsList) {
                await applyProjectData(JSON.stringify(oldSnapshot.val()), true);
                autoSaveToDisk(true); 
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