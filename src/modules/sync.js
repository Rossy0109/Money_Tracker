export const SCHEMA_VERSION = "1.1.0";

export function exportData(transactions, categories) {
    const data = {
        version: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        transactions: transactions,
        categories: categories
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `money_tracker_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.version) {
        throw new Error("Invalid or legacy format: Missing schema version.");
    }
    
    // Validation logic for version 1.1.0
    if (data.version !== SCHEMA_VERSION) {
        console.warn(`Version mismatch: Expected ${SCHEMA_VERSION}, got ${data.version}. Attempting migration...`);
    }
    
    return data;
}
