/**
 * Money Tracker - Complete Apps Script Backend (Rossy0109 Style)
 * Author: Gemini CLI
 * Features: Dashboard, Transaction Management, Reporting, Budgets, Members, Bengali UI
 * No placeholders. Works immediately after setupSheets().
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const SHEETS = {
  TRANSACTIONS: 'Transactions',
  BUDGETS: 'Budgets',
  MEMBERS: 'Members',
  SETTINGS: 'Settings'
};

const CATEGORIES = {
  income: ['Salary', 'Business', 'Investment', 'Gift', 'Other'],
  expense: ['Housing', 'Personal Running Costs', 'Transport', 'Groceries', 'Restaurants', 'Utilities', 'Medical', 'Entertainment', 'Other']
};

/**
 * Serves the HTML file
 */
function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('অর্থ ট্র্যাকার - Money Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Initialize Sheets if they don't exist
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Transactions Sheet
  if (!ss.getSheetByName(SHEETS.TRANSACTIONS)) {
    const sheet = ss.insertSheet(SHEETS.TRANSACTIONS);
    sheet.appendRow(['ID', 'Date', 'Amount', 'Type', 'Category', 'Member', 'Notes', 'Timestamp']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
  }
  
  // 2. Budgets Sheet
  if (!ss.getSheetByName(SHEETS.BUDGETS)) {
    const sheet = ss.insertSheet(SHEETS.BUDGETS);
    sheet.appendRow(['Category', 'Amount']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');
    
    // Default budgets based on Rossy0109 categories
    const defaults = [
      ['Housing', 15000],
      ['Personal Running Costs', 5000],
      ['Transport', 3000],
      ['Groceries', 8000],
      ['Restaurants', 2000],
      ['Utilities', 3000],
      ['Medical', 2000],
      ['Entertainment', 2000],
      ['Other', 1000]
    ];
    defaults.forEach(row => sheet.appendRow(row));
  }
  
  // 3. Members Sheet
  if (!ss.getSheetByName(SHEETS.MEMBERS)) {
    const sheet = ss.insertSheet(SHEETS.MEMBERS);
    sheet.appendRow(['Name']);
    sheet.getRange(1, 1, 1, 1).setFontWeight('bold').setBackground('#f3f3f3');
    ['Self', 'Father', 'Mother', 'Brother', 'Sister'].forEach(m => sheet.appendRow([m]));
  }
  
  // 4. Settings Sheet
  if (!ss.getSheetByName(SHEETS.SETTINGS)) {
    const sheet = ss.insertSheet(SHEETS.SETTINGS);
    sheet.appendRow(['Key', 'Value']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.appendRow(['Currency', '৳']);
  }
  
  return "অভিনন্দন! আপনার অর্থ ট্র্যাকার ডেটাবেস তৈরি হয়ে গেছে। (Success: Sheets setup complete!)";
}

/**
 * Get all necessary data for the UI
 */
function getInitialData() {
  try {
    return {
      transactions: getTransactions(),
      budgets: getBudgets(),
      members: getMembers(),
      settings: getSettings(),
      categories: CATEGORIES
    };
  } catch (e) {
    // If sheets aren't setup, return empty defaults
    return { error: "Please run setupSheets() first.", transactions: [], budgets: {}, members: [], settings: {}, categories: CATEGORIES };
  }
}

/**
 * Transaction CRUD
 */
function getTransactions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data.shift();
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) val = val.toISOString();
      obj[h] = val;
    });
    return obj;
  }).reverse(); // Latest first
}

function addTransaction(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TRANSACTIONS);
  const id = Utilities.getUuid();
  const timestamp = new Date();
  sheet.appendRow([
    id,
    data.date,
    parseFloat(data.amount),
    data.type,
    data.category,
    data.member,
    data.notes || '',
    timestamp
  ]);
  return { status: 'success', id };
}

function deleteTransaction(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TRANSACTIONS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { status: 'success' };
    }
  }
  throw new Error('Transaction not found');
}

/**
 * Budget Management
 */
function getBudgets() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BUDGETS);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  data.shift();
  const budgets = {};
  data.forEach(row => budgets[row[0]] = row[1]);
  return budgets;
}

function updateBudget(category, amount) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.BUDGETS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === category) {
      sheet.getRange(i + 1, 2).setValue(amount);
      return { status: 'success' };
    }
  }
  sheet.appendRow([category, amount]);
  return { status: 'success' };
}

/**
 * Member Management
 */
function getMembers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MEMBERS);
  if (!sheet) return ['Self'];
  const data = sheet.getDataRange().getValues();
  data.shift();
  return data.map(row => row[0]);
}

function addMember(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MEMBERS);
  sheet.appendRow([name]);
  return { status: 'success' };
}

/**
 * Settings
 */
function getSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return { Currency: '৳' };
  const data = sheet.getDataRange().getValues();
  data.shift();
  const settings = {};
  data.forEach(row => settings[row[0]] = row[1]);
  return settings;
}

function updateSetting(key, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return { status: 'success' };
    }
  }
  sheet.appendRow([key, value]);
  return { status: 'success' };
}
