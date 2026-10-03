const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { createDecipheriv } = require('crypto');
const { Buffer } = require('buffer');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'amar-hisab-backups';
const encryptionKeyHex = fs.readFileSync(process.env.BACKUP_ENCRYPTION_KEY_FILE, 'utf8').trim();

const supabase = createClient(url, key);

// List all project-1 objects
async function investigate() {
  const { data: objects, error } = await supabase.storage.from(bucket).list('', {
    prefix: 'project-1-backup-',
    limit: 50,
    sortBy: { column: 'name', order: 'desc' }
  });

  console.log('=== All project-1 backup objects ===');
  for (const obj of objects || []) {
    console.log(obj.name);
  }

  // Download the orphan dd1c91a3 object
  const orphanName = 'project-1-backup-2026-10-02-dd1c91a3.enc.json';
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(orphanName);

  if (downloadError) {
    console.error('Download failed:', downloadError);
    process.exit(1);
  }

  const text = await fileData.text();
  const envelope = JSON.parse(text);

  console.log('\n=== Envelope metadata ===');
  console.log('formatVersion:', envelope.formatVersion);
  console.log('projectId:', envelope.projectId);
  console.log('projectName:', envelope.projectName);
  console.log('timestamp:', envelope.timestamp);
  console.log('keyId:', envelope.keyId);
  console.log('checksum:', envelope.checksum);
  console.log('iv:', envelope.iv ? 'present' : 'missing');
  console.log('tag:', envelope.tag ? 'present' : 'missing');
  console.log('encrypted length:', envelope.encrypted?.length);

  // Decrypt to see contents
  const encryptionKey = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY_FILE_CONTENT || '', 'hex');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(encryptionKeyHex, 'hex'),
    Buffer.from(envelope.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const encrypted = Buffer.from(envelope.encrypted, 'base64');
  let plaintext = decipher.update(encrypted, undefined, 'utf8');
  plaintext += decipher.final('utf8');

  console.log('\n=== Decrypted backup preview (first 2000 chars) ===');
  console.log(plaintext.slice(0, 2000));

  // Verify checksum
  const crypto = require('crypto');
  const computed = crypto.createHash('sha256').update(plaintext).digest('hex');
  console.log('\nComputed checksum:', computed);
  console.log('Envelope checksum:', envelope.checksum);
  console.log('Match:', computed === envelope.checksum);

  // Parse backup structure
  const backup = JSON.parse(plaintext);
  console.log('\n=== Backup structure ===');
  console.log('project.name:', backup.project?.name);
  console.log('project.id:', backup.project?.id);
  console.log('accounts count:', Array.isArray(backup.accounts) ? backup.accounts.length : 'N/A');
  console.log('transactions count:', Array.isArray(backup.transactions) ? backup.transactions.length : 'N/A');
  console.log('categories count:', Array.isArray(backup.categories) ? backup.categories.length : 'N/A');

  // Also check if there's a corresponding cloud_backup audit row
  console.log('\n=== Checking cloud_backup audit via API ===');
  try {
    const response = await fetch('https://money-tracker-blond-pi.vercel.app/api/backup/audit', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
    });
    const audit = await response.json();
    console.log('Latest cloud_backup rows for project 1:', JSON.stringify(audit, null, 2).slice(0, 1000));
  } catch (e) {
    console.log('Could not fetch audit:', e.message);
  }
}

investigate().catch(console.error);
