// --- FUNKCJE POMOCNICZE (UTILS) ---

export function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

export function formatNumber(num, decimals = 2) {
    if (num === null || num === undefined || num === "" || num === "-") return "-";
    const n = parseFloat(num);
    if (isNaN(n)) return num;
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

export function dateToISO(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function parsePlDateToISO(plDateStr) {
    if (!plDateStr) return dateToISO(new Date());
    const dStr = plDateStr.split(',')[0].trim();
    const parts = dStr.split('.');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    return dateToISO(new Date());
}

export function parsePlDate(dateStr) {
    if (!dateStr) return new Date(0);
    const d = dateStr.split(',')[0].trim();
    const parts = d.split('.');
    if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
    return new Date(dateStr);
}

export function formatISOToPL(isoDateStr) {
    if (!isoDateStr) return new Date().toLocaleDateString('pl-PL');
    const parts = isoDateStr.split('-');
    if(parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return isoDateStr;
}