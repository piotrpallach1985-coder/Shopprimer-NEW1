// --- MODUŁ AUTORYZACJI (auth.js) Z FIREBASE ---

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// Twoja oryginalna konfiguracja
const firebaseConfig = {
    apiKey: "AIzaSyAJ8-pGXq4atQMzEQJLXCdzyMggvotDOOM",
    authDomain: "shopprimer-63f0e.firebaseapp.com",
    databaseURL: "https://shopprimer-63f0e-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "shopprimer-63f0e",
    storageBucket: "shopprimer-63f0e.firebasestorage.app",
    messagingSenderId: "191850011826",
    appId: "1:191850011826:web:aa2b385d2e463217acbdab",
    measurementId: "G-MW99KTS8WZ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const db = getDatabase(app);

try { const analytics = getAnalytics(app); } catch (e) { }

// Dodajemy EKSPORTY wymagane przez plik store.js
export const firebaseDb = db;
export const dbRef = ref;
export const dbSet = set;
export const dbGet = get;

// Zachowujemy zgodność z Twoim oryginalnym kodem (przypisania globalne)
window.firebaseDb = db;
window.dbRef = ref;
window.dbSet = set;
window.dbGet = get;
window.firebaseAuth = auth;
window.firebaseSignIn = signInWithEmailAndPassword;
window.firebaseSignOut = signOut;

// Zmienne ES6 wymagane przez ui.js oraz store.js (likwidują błędy z konsoli)
export let currentUser = null;
export let appUsers = []; 

let dataLoaded = false;

// Główna pętla nasłuchująca logowania
onAuthStateChanged(auth, async (user) => {
    if (user) {
        window.firebaseUser = user; 
        
        // Tworzymy obiekt użytkownika dla modułu UI
        currentUser = {
            login: user.email,
            name: user.displayName || user.email.split('@')[0], 
            role: 'admin', // Docelowo przypisz z bazy, teraz dajemy admina byś widział całą aplikację
            allowedTabs: null,
            preferredTabs: null
        };

        // Aby zapobiec błędowi w store.js, wrzucamy go do listy użytkowników
        if (appUsers.length === 0) {
            appUsers.push(currentUser);
        }

        // Twoja oryginalna logika ładowania bazy i obsługi UI
        if (!dataLoaded && window.loadDataFromFirebase) {
            await window.loadDataFromFirebase();
            dataLoaded = true;
        }
        if (window.handleUserAuthenticated) {
            window.handleUserAuthenticated(user);
        }
        // Aktualizacja widoku po załadowaniu
        if (window.applyUserPermissions) {
            window.applyUserPermissions();
        }

        // Ukrycie ekranu logowania po udanym logowaniu/odświeżeniu
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            loginOverlay.classList.add('hidden');
            loginOverlay.classList.remove('flex');
        }

        // Zdejmij rozmycie i odblokuj główny interfejs
        const mainContainer = document.getElementById('mainAppContainer');
        if (mainContainer) {
            mainContainer.classList.remove('locked-ui');
        }

    } else {
        // Wylogowanie
        window.firebaseUser = null;
        currentUser = null;
        dataLoaded = false;
        
        // POPRAWKA: wywołujemy funkcję bezpośrednio, nie szukając jej w window
        handleUserLoggedOut(); 
    }
});

// Funkcje eksportowane do bezpośredniego użycia w kodzie
export async function login(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        return true;
    } catch (error) {
        console.error("Błąd logowania:", error.message);
        // Jeśli logowanie się nie powiedzie
        return false;
    }
}

export async function logout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Błąd podczas wylogowywania:", error.message);
    }
}

// Funkcja wywoływana po wylogowaniu (wymagana przez main.js)
export function handleUserLoggedOut() {
    console.log("Użytkownik został wylogowany.");
    
    const mainContainer = document.getElementById('mainAppContainer');
    if (mainContainer) {
        mainContainer.classList.add('locked-ui');
    }

    // Jeśli masz ekran logowania, funkcja może go tutaj pokazać:
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) {
        loginOverlay.classList.remove('hidden');
        loginOverlay.classList.add('flex');
    }
}

// ==========================================
// OBSŁUGA INTERFEJSU LOGOWANIA / WYLOGOWANIA
// ==========================================

export async function handleLogin() {
    const emailInput = document.getElementById('loginUsername').value.trim();
    const passwordInput = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!emailInput || !passwordInput) {
        if(errorDiv) {
            errorDiv.textContent = "Wpisz e-mail i hasło!";
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    // Wywołujemy naszą właściwą funkcję łączącą się z Firebase
    const success = await login(emailInput, passwordInput);
    
    if (success) {
        if(errorDiv) errorDiv.classList.add('hidden');
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
    } else {
        if(errorDiv) {
            errorDiv.textContent = "Błędny login lub hasło!";
            errorDiv.classList.remove('hidden');
        }
    }
}

export async function handleLogout() {
    await logout(); // Wylogowuje z Firebase
}

// ==========================================
// CZYSZCZENIE ZAWIESZONYCH ALERTÓW
// ==========================================
window.clearAllAlerts = function() {
    if(window.getProjectState) {
        let state = window.getProjectState();
        state.activeInduscoRequests.length = 0;
        state.activeRemanentAlerts.length = 0;
        if (window.updateAlertsUI) window.updateAlertsUI();
        if (window.autoSaveToDisk) window.autoSaveToDisk(true);
        alert("Wyczyszczono wszystkie zablokowane alerty i zapotrzebowania!");
    }
};

// Najważniejsze: udostępniamy te funkcje dla przycisków w pliku index.html
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;