// --- KONFIGURACJA I STAŁE ---

export const USE_FIREBASE = true;
export const ADMIN_PIN = "4321";

export const firebaseConfig = {
    apiKey: "AIzaSyAJ8-pGXq4atQMzEQJLXCdzyMggvotDOOM",
    authDomain: "shopprimer-63f0e.firebaseapp.com",
    databaseURL: "https://shopprimer-63f0e-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "shopprimer-63f0e",
    storageBucket: "shopprimer-63f0e.firebasestorage.app",
    messagingSenderId: "191850011826",
    appId: "1:191850011826:web:aa2b385d2e463217acbdab",
    measurementId: "G-MW99KTS8WZ"
};

export const AVAILABLE_TABS = [
    { id: 'daily', name: 'Rozliczenie Dzienne' },
    { id: 'daily-indusco', name: 'Rozlicz. Dzienne Indusco' },
    { id: 'compare', name: 'CRI / INDUSCO' },
    { id: 'calc', name: 'Kalkulacja' },
    { id: 'history', name: 'Zestawienie Kalkulacji' },
    { id: 'indusco', name: 'Shopprimer (Indusco)' },
    { id: 'projects', name: 'Projekty' },
    { id: 'db', name: 'Baza Profili' },
    { id: 'colors', name: 'Kolorystyka' },
    { id: 'costs', name: 'Wydajność (Koszty)' },
    { id: 'archive', name: 'Archiwum' }
];

export const steelGradesList = [
    "A", "B", "D", "E", 
    "A36", "D36", "E36", "F36", "A40", "D40", "E40", "F40", "A420", "D420", "E420", "F420", "A460", "D460", "E460", "F460", "A500", "D500", "E500", "F500", "A550", "D550", "E550", "F550", "A620", "D620", "E620", "F620", "A690", "D690", "E690", "F690",
    "S235JR", "S235JO", "S235J2", "S275M", "S275N", 
    "S355JR", "S355J0", "S355J2", "S355K2", "S355M", "S355N", "S355ML", "S355NL", 
    "S420M", "S420N", "S420ML", "S420NL", "S460M", "S460N", "S460ML", "S460NL", "S460QL", "S460QL1", "S500QL", "S500QL1", "S550QL", "S550QL1", "S620QL", "S620QL1", "S690QL", "S690QL1"
];

export const shopPrimerRules = [
    { group: "Stale okrętowe zwykłe + A36", grades: ["A", "B", "D", "E", "A36"], colorName: "Szary", colorHex: "#9ca3af" },
    { group: "Stale okrętowe podwyższonej wytrzymałości (<= 50mm)", grades: ["D36", "E36"], conditionInfo: "Grubość <= 50mm", condition: (grubosc) => !grubosc || grubosc <= 50, colorName: "Szary", colorHex: "#9ca3af" },
    { group: "Stale okrętowe podwyższonej wytrzymałości (> 50mm)", grades: ["D36", "E36"], conditionInfo: "Grubość > 50mm", condition: (grubosc) => grubosc > 50, colorName: "Czerwony", colorHex: "#ef4444" },
    { group: "Stale okrętowe (F36)", grades: ["F36"], colorName: "Czerwony", colorHex: "#ef4444" },
    { group: "Stale okrętowe wysokiej wytrzymałości", grades: ["A40", "D40", "E40", "F40", "A420", "D420", "E420", "F420", "A460", "D460", "E460", "F460", "A500", "D500", "E500", "F500", "A550", "D550", "E550", "F550", "A620", "D620", "E620", "F620", "A690", "D690", "E690", "F690"], colorName: "Zielony", colorHex: "#22c55e" },
    { group: "Stale konstrukcyjne zwykłej wytrzymałości", grades: ["S235JR", "S235JO", "S235J2", "S275M", "S275N"], colorName: "Szary", colorHex: "#9ca3af" },
    { group: "Stale konstrukcyjne podwyższonej wytrzymałości", grades: ["S355JR", "S355J0", "S355J2", "S355K2", "S355M", "S355N"], colorName: "Szary", colorHex: "#9ca3af" },
    { group: "Stale konstrukcyjne podwyższonej wytrzymałości", grades: ["S355ML", "S355NL"], colorName: "Czerwony", colorHex: "#ef4444" },
    { group: "Stale konstrukcyjne wysokiej wytrzymałości", grades: ["S420M", "S420N", "S420ML", "S420NL", "S460M", "S460N", "S460ML", "S460NL", "S460QL", "S460QL1", "S500QL", "S500QL1", "S550QL", "S550QL1", "S620QL", "S620QL1", "S690QL", "S690QL1"], colorName: "Zielony", colorHex: "#22c55e" }
];