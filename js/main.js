// --- GŁÓWNY PUNKT STARTOWY APLIKACJI (MAIN.JS) ---

import './utils.js';
import './config.js';
import { auth, handleUserLoggedOut } from './auth.js';
import './store.js';
import './calculator.js';
import './ui.js';
import './projects.js';
import './history.js';
import './indusco.js';
import './reports.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Shopprimer Web App initialized successfully.");
    
    // Uruchomienie pomocniczych elementów UI
    if (window.initGatunkiSelect) window.initGatunkiSelect();
    if (window.renderColorsTable) window.renderColorsTable();
    if (window.addInduscoBulkRow) window.addInduscoBulkRow();
    if (window.toggleFormFields) window.toggleFormFields();
    
    // Jeśli Firebase nie zwróci użytkownika od razu (np. brak sesji), wymuszamy pokazywanie ekranu logowania
    if (auth && !auth.currentUser) {
        handleUserLoggedOut();
    }

    // Zabezpieczenie przed zamknięciem karty z niezapisanymi danymi
    window.addEventListener('beforeunload', (e) => {
        if (window.hasUnsavedChanges || window.isSyncing) {
            e.preventDefault();
            e.returnValue = 'Trwa zapisywanie danych. Jesteś pewien, że chcesz wyjść?';
        }
    });
});