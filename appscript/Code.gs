/**
 * Google Apps Script Bridge for Supabase and AppSheet
 * 
 * Instructions:
 * 1. Create a new Google Apps Script project.
 * 2. Copy this code into Code.gs.
 * 3. Set Script Properties (Project Settings > Script Properties):
 *    - SUPABASE_URL: Your Supabase Project URL
 *    - SUPABASE_KEY: Your Supabase Service Role Key (Keep it secret!)
 * 4. Deploy as a Web App (Execute as: Me, Access: Anyone).
 * 5. In AppSheet, use the generated Web App URL for webhooks.
 */

const CONFIG = {
  get URL() { return PropertiesService.getScriptProperties().getProperty('SUPABASE_URL'); },
  get KEY() { return PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY'); }
};

/**
 * Main Sync Function: Supabase -> Google Sheets
 */
function syncSupabaseToSheets() {
  const tables = ['transactions', 'accounts', 'debts', 'budgets'];
  
  tables.forEach(tableName => {
    const data = fetchFromSupabase(tableName);
    if (data) {
      updateSheet(tableName, data);
    }
  });
}

/**
 * Fetch data from Supabase REST API
 */
function fetchFromSupabase(table) {
  const url = `${CONFIG.URL}/rest/v1/${table}?select=*`;
  const options = {
    method: 'get',
    headers: {
      'apikey': CONFIG.KEY,
      'Authorization': `Bearer ${CONFIG.KEY}`,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    return JSON.parse(response.getContentText());
  } else {
    Logger.log(`Error fetching ${table}: ${response.getContentText()}`);
    return null;
  }
}

/**
 * Update a Google Sheet with data
 */
function updateSheet(sheetName, data) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName);
  }
  
  sheet.clear();
  
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  sheet.appendRow(headers);
  
  const rows = data.map(item => headers.map(header => item[header]));
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

/**
 * Webhook Handler: AppSheet -> Supabase
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const table = payload.table;
    const action = payload.action; // 'INSERT', 'UPDATE', 'DELETE'
    const data = payload.data;
    
    let result;
    if (action === 'INSERT') {
      result = supabaseRequest(table, 'post', data);
    } else if (action === 'UPDATE') {
      const id = data.id;
      delete data.id;
      result = supabaseRequest(`${table}?id=eq.${id}`, 'patch', data);
    } else if (action === 'DELETE') {
      result = supabaseRequest(`${table}?id=eq.${data.id}`, 'delete');
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper for Supabase Mutating Requests
 */
function supabaseRequest(path, method, data = null) {
  const url = `${CONFIG.URL}/rest/v1/${path}`;
  const options = {
    method: method,
    headers: {
      'apikey': CONFIG.KEY,
      'Authorization': `Bearer ${CONFIG.KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    muteHttpExceptions: true
  };
  
  if (data) {
    options.payload = JSON.stringify(data);
  }
  
  const response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

/**
 * Generate a Financial Report
 */
function generateFinancialReport() {
  const transactions = fetchFromSupabase('transactions');
  if (!transactions) return;
  
  const summary = transactions.reduce((acc, curr) => {
    const type = curr.type;
    acc[type] = (acc[type] || 0) + parseFloat(curr.amount);
    return acc;
  }, {});
  
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Report');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Report');
  }
  
  sheet.clear();
  sheet.appendRow(['Metric', 'Value']);
  sheet.appendRow(['Total Income', summary.income || 0]);
  sheet.appendRow(['Total Expense', summary.expense || 0]);
  sheet.appendRow(['Net Balance', (summary.income || 0) - (summary.expense || 0)]);
  
  // Format report
  sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#f3f3f3');
}

/**
 * Menu to run sync manually
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Supabase Sync')
      .addItem('Sync All Tables', 'syncSupabaseToSheets')
      .addItem('Generate Report', 'generateFinancialReport')
      .addToUi();
}
