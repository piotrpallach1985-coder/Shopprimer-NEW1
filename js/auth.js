// --- MODUŁ AUTORYZACJI (auth.js) Z FIREBASE ---

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getDatabase, ref, set, get, child, push, update, remove, onChildAdded, onChildChanged, onChildRemoved, onValue } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

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
export const dbPush = push;
export const dbUpdate = update;
export const dbRemove = remove;
export const dbOnChildAdded = onChildAdded;
export const dbOnChildChanged = onChildChanged;
export const dbOnChildRemoved = onChildRemoved;
export const dbOnValue = onValue;

// Zachowujemy zgodność z Twoim oryginalnym kodem (przypisania globalne)
window.firebaseDb = db;
window.dbRef = ref;
window.dbSet = set;
window.dbGet = get;
window.firebaseAuth = auth;
window.firebaseSignIn = signInWithEmailAndPassword;
window.firebaseSignOut = signOut;

// Zmienne ES6 wymagane przez ui.js oraz store.js
export let currentUser = null;
export let appUsers = []; 

let dataLoaded = false;

// Główna pętla nasłuchująca logowania
onAuthStateChanged(auth, async (user) => {
    if (user) {
        window.firebaseUser = user; 
        
        // Ładujemy bazę danych, jeśli jeszcze jej nie ma
        if (!dataLoaded && window.loadDataFromFirebase) {
            await window.loadDataFromFirebase();
            dataLoaded = true;
            try {
                const storeModule = await import('./store.js');
                if (storeModule.initFirebaseListeners) {
                    storeModule.initFirebaseListeners();
                }
            } catch (e) {
                console.warn("Nie udało się załadować nasłuchiwaczy z store.js:", e);
            }
        }

        // Pobieramy bazę użytkowników dynamicznie (w locie), aby uniknąć błędu zapętlenia!
        let dbUser = null;
        try {
            const storeModule = await import('./store.js');
            if (storeModule.usersList) {
                dbUser = storeModule.usersList.find(u => u.login.toLowerCase() === user.email.toLowerCase());
            }
        } catch(e) {
            console.warn("Nie udało się pobrać store.js dynamicznie:", e);
        }

        // Tworzymy obiekt użytkownika pobierając wszystkie pola z bazy (w tym uprawnienia)
        currentUser = {
            ...(dbUser || {}),
            login: user.email,
            name: dbUser ? dbUser.name : (user.displayName || user.email.split('@')[0]), 
            role: dbUser ? dbUser.role : 'user', 
            allowedTabs: dbUser ? dbUser.allowedTabs : null,
            preferredTabs: null
        };

        // Automatyczne wstrzykiwanie imienia w menu HTML
        const nameElements = document.querySelectorAll('.logged-user-name, #loggedUserName, #currentUserNameDisplay');
        nameElements.forEach(el => {
            el.textContent = currentUser.name;
        });

        if (appUsers.length === 0) {
            appUsers.push(currentUser);
        }

        if (window.handleUserAuthenticated) {
            window.handleUserAuthenticated(user);
        }
        
        if (window.applyUserPermissions) {
            window.applyUserPermissions();
        }

        // Ukrycie ekranu logowania
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            loginOverlay.classList.add('hidden');
            loginOverlay.classList.remove('flex');
        }

        // Odblokowanie interfejsu
        const mainContainer = document.getElementById('mainAppContainer');
        if (mainContainer) {
            mainContainer.classList.remove('locked-ui');
        }

    } else {
        // Wylogowanie
        window.firebaseUser = null;
        currentUser = null;
        dataLoaded = false;
        
        const nameElements = document.querySelectorAll('.logged-user-name, #loggedUserName, #currentUserNameDisplay');
        nameElements.forEach(el => {
            el.textContent = '';
        });
        
        handleUserLoggedOut(); 
    }
});

export async function login(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
        return true;
    } catch (error) {
        console.error("Błąd logowania:", error.message);
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

export function handleUserLoggedOut() {
    console.log("Użytkownik został wylogowany.");
    
    const mainContainer = document.getElementById('mainAppContainer');
    if (mainContainer) {
        mainContainer.classList.add('locked-ui');
    }

    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) {
        loginOverlay.classList.remove('hidden');
        loginOverlay.classList.add('flex');
    }
}

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
    await logout();
}

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

window.handleLogin = handleLogin;
window.handleLogout = handleLogout;