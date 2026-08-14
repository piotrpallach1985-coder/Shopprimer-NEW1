// --- MODUŁ ZARZĄDZANIA STANEM I BAZĄ DANYCH (STORE.JS) ---

import { USE_FIREBASE } from './config.js';
import { refreshCurrentUser, firestoreDb, fsCollection, fsDoc, fsOnSnapshot, fsGetDoc, fsSetDoc, appUsers } from './auth.js';
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
export let userPreferences = null;
export const usersList = appUsers;

window.hasUnsavedChanges = false;
window.isSyncing = false;
window.saveQueuePromise = Promise.resolve();
window.forceNextCloudOverwrite = false;

// Settery dla zmiennych stanu (używane przy aktualizacji z innych plików)
export function setInputData(data) { inputData = data; }
export function setResultsData(data) { resultsData = data; }
export function setPrintHistory(history) { printHistory = history; }
export function setProjectsList(list) { 
    projectsList = list.map(item => (item.name && typeof item.name === 'object') ? { ...item.name, id: item.id } : item);
}
export function setArchivedProjectsList(list) { 
    archivedProjectsList = list.map(item => (item.name && typeof item.name === 'object') ? { ...item.name, id: item.id } : item);
}
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

export function initFirebaseListeners() {
    if (window.firebasePermissionDenied || !USE_FIREBASE || !firestoreDb) return;
    
    // 1. Settings listener (Scalars)
    fsOnSnapshot(fsDoc(firestoreDb, "settings", "app"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.database) { setDatabase(data.database); if (window.renderDbTable) window.renderDbTable(); }
            if (data.laborCosts) { setLaborCosts(data.laborCosts); if (window.renderPaintTypesTable) window.renderPaintTypesTable(); }
            if (data.paintTypes) {
                const arr = Array.isArray(data.paintTypes) ? data.paintTypes : Object.values(data.paintTypes);
                const filteredArr = arr.filter(p => p !== null);
                const uniquePaints = [...new Map(filteredArr.map(item => [item.id, item])).values()];
                setPaintTypes(uniquePaints);
                if (window.renderPaintTypesTable) window.renderPaintTypesTable();
                if (window.updatePaintDropdowns) window.updatePaintDropdowns();
            }
            if (data.protocolCounter !== undefined) protocolCounter = data.protocolCounter;
            if (data.paintMonthlyCosts) { paintMonthlyCosts = data.paintMonthlyCosts; } else { paintMonthlyCosts = {}; }
            if (window.renderPaintReport) window.renderPaintReport();
            if (data.visibleDailyPaints !== undefined) {
                visibleDailyPaints = (Array.isArray(data.visibleDailyPaints) && data.visibleDailyPaints.length === 0) ? null : data.visibleDailyPaints;
            }

            if (window.updateAllStocks) window.updateAllStocks();
            if (window.renderDailySidebar) window.renderDailySidebar();
            if (window.renderDailyLedger) window.renderDailyLedger();
            if (window.renderDailyInduscoSidebar) window.renderDailyInduscoSidebar();
            if (window.renderDailyInduscoLedger) window.renderDailyInduscoLedger();
        }
    });

    // 2. Collection Listeners
    const setupCollectionListener = (collectionName, setterFunc, renderFunc) => {
        fsOnSnapshot(fsCollection(firestoreDb, collectionName), (snapshot) => {
            const arr = [];
            snapshot.forEach(doc => {
                const item = doc.data();
                if (!item.id) item.id = doc.id;
                arr.push(item);
            });
            setterFunc(arr);
            if (renderFunc) renderFunc();
        });
    };

    setupCollectionListener('history', setPrintHistory, () => { 
        if (window.renderHistoryTable) window.renderHistoryTable(); 
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailySidebar) window.renderDailySidebar();
        if (window.renderDailyLedger) window.renderDailyLedger();
    });

    setupCollectionListener('indusco_history', setInduscoHistory, () => { 
        if (window.renderInduscoTable) window.renderInduscoTable(); 
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailyInduscoSidebar) window.renderDailyInduscoSidebar();
        if (window.renderDailyInduscoLedger) window.renderDailyInduscoLedger();
        if (window.renderDailySidebar) window.renderDailySidebar();
        if (window.renderDailyLedger) window.renderDailyLedger();
    });

    setupCollectionListener('indusco_daily', setInduscoDailyRecords, () => { 
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailyInduscoLedger) window.renderDailyInduscoLedger(); 
    });

    setupCollectionListener('remanent_alerts', setActiveRemanentAlerts, () => { 
        if (window.updateAlertsUI) window.updateAlertsUI(); 
    });

    setupCollectionListener('indusco_requests', setActiveInduscoRequests, () => { 
        if (window.updateAlertsUI) window.updateAlertsUI(); 
    });

    setupCollectionListener('projects', setProjectsList, () => { 
        if (window.renderProjectsList) window.renderProjectsList(); 
    });

    setupCollectionListener('archived_projects', setArchivedProjectsList, () => {
        if (window.renderArchiveList) window.renderArchiveList();
    });
    
    setupCollectionListener('users', setUsersList, () => { 
        refreshCurrentUser(usersList); 
        if (window.renderUsersTable) window.renderUsersTable(); 
    });
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

export async function autoSaveToDisk(immediate = false) {}

export async function applyProjectData(jsonString, isSilent = false) {
    try {
        const projectData = JSON.parse(jsonString);
        if (projectData.database) database = projectData.database;
        const ensureArray = (data) => Array.isArray(data) ? data : Object.values(data || {});
        
        if (projectData.projectsList) projectsList = ensureArray(projectData.projectsList);
        if (projectData.archivedProjectsList) archivedProjectsList = ensureArray(projectData.archivedProjectsList);
        if (projectData.induscoHistory) induscoHistory = ensureArray(projectData.induscoHistory);
        if (projectData.induscoDailyRecords) induscoDailyRecords = ensureArray(projectData.induscoDailyRecords);
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
        if (projectData.appUsers) setUsersList(projectData.appUsers);

        if (window.renderDbTable) window.renderDbTable();
        if (window.renderPaintTypesTable) window.renderPaintTypesTable();
        if (window.updatePaintDropdowns) window.updatePaintDropdowns();
        if (window.renderHistoryTable) window.renderHistoryTable();
        if (window.renderProjectsList) window.renderProjectsList();
        if (window.renderInduscoTable) window.renderInduscoTable();
        if (window.updateAllStocks) window.updateAllStocks();
        if (window.renderDailySidebar) window.renderDailySidebar();
        if (window.renderDailyLedger) window.renderDailyLedger();
        if (window.renderDailyInduscoSidebar) window.renderDailyInduscoSidebar();
        if (window.renderDailyInduscoLedger) window.renderDailyInduscoLedger();
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
        if (!firestoreDb) return;
        
        const settingsSnap = await fsGetDoc(fsDoc(firestoreDb, "settings", "app"));
        if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            applyProjectData(JSON.stringify(data), true);
        }
    } catch (err) {
        if (err.message && err.message.includes('Permission denied')) {
            window.firebasePermissionDenied = true;
        }
    }
}

window.autoSaveToDisk = autoSaveToDisk;
window.applyProjectData = applyProjectData;
window.loadDataFromFirebase = loadDataFromFirebase;
window.getProjectState = getProjectState;

window.savePaintMonthlyCost = function(month, paintId, type, cost) {
    if (!paintMonthlyCosts[month]) paintMonthlyCosts[month] = {};
    if (!paintMonthlyCosts[month][paintId]) paintMonthlyCosts[month][paintId] = { paint: 0, thinner: 0 };
    paintMonthlyCosts[month][paintId][type] = cost;
    
    // Save to Firestore
    if (firestoreDb && window.firebasePermissionDenied === false) {
        fsSetDoc(fsDoc(firestoreDb, "settings", "app"), { paintMonthlyCosts: paintMonthlyCosts }, { merge: true });
    }
    
    if (window.renderPaintReport) window.renderPaintReport();
};