/**
 * drive_sync.js
 * Native Node.js script to backup data to Google Drive.
 * 
 * Usage:
 * 1. npm install googleapis google-auth-library
 * 2. Place credentials.json in this folder (ensure it is in .gitignore!)
 * 3. node drive_sync.js
 */

import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

// CONFIGURATION
const FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID'; // Replace with the ID of your 'Money_Tracker_Vault' folder
const CREDENTIALS_PATH = './credentials.json';

async function uploadToDrive(filePath) {
    const auth = new GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });
    
    const fileMetadata = {
        name: path.basename(filePath),
        parents: [FOLDER_ID]
    };
    
    const media = {
        mimeType: 'application/json',
        body: fs.createReadStream(filePath),
    };

    try {
        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });
        console.log('✅ Backup uploaded successfully! File ID:', file.data.id);
    } catch (err) {
        console.error('❌ Upload failed:', err.message);
    }
}

// Example: Triggering a backup of a generated JSON file
async function main() {
    const backupFile = './backup_data.json';
    // Logic to fetch from Supabase and write to backupFile would go here...
    
    console.log('Starting upload...');
    await uploadToDrive(backupFile);
}

main();
