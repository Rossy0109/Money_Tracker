/**
 * lib/utils.js
 * Shared utility functions.
 */

/**
 * Formats a number as currency (defaults to BDT)
 */
export const formatCurrency = (amount, currency = 'BDT') => {
    const symbol = currency === 'BDT' ? '৳' : '$';
    return `${symbol} ${Number(amount).toLocaleString(undefined, { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 2 
    })}`;
};

/**
 * Formats a date string for display
 */
export const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('bn-BD', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

/**
 * Generates and downloads a CSV file from an array of objects
 */
export const exportToCSV = (filename, headers, rows) => {
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Parses a CSV string into an array of objects.
 * Expects the first row to be headers.
 */
export const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index];
        });
        return obj;
    });

    return data;
};

/**
 * Escapes HTML characters (legacy helper support)
 */
export const esc = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};
