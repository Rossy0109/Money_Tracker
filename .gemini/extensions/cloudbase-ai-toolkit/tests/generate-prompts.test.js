import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { expect, test } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

test('generate-prompts builds prompt docs from skills source', () => {
  execFileSync('node', ['scripts/generate-prompts-data.mjs'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
  });
  execFileSync('node', ['scripts/generate-prompts.mjs'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
  });

  const authWebPrompt = fs.readFileSync(
    path.join(ROOT_DIR, 'doc', 'prompts', 'auth-web.mdx'),
    'utf8',
  );

  expect(authWebPrompt).toContain('# 身份认证：Web SDK');
  expect(authWebPrompt).toContain('AIDevelopmentPrompt');
  expect(authWebPrompt).toContain('npx skills add tencentcloudbase/cloudbase-skills');
  expect(authWebPrompt).toContain('npx skills add https://github.com/tencentcloudbase/skills --skill auth-web');
  expect(authWebPrompt).toContain('https://skills.sh/tencentcloudbase/skills/auth-web');
  expect(authWebPrompt).not.toContain('title="rule.md"');

  const authHttpApiPrompt = fs.readFileSync(
    path.join(ROOT_DIR, 'doc', 'prompts', 'auth-http-api.mdx'),
    'utf8',
  );

  expect(authHttpApiPrompt).toContain('npx skills add https://github.com/tencentcloudbase/skills --skill http-api');
  expect(authHttpApiPrompt).toContain('https://skills.sh/tencentcloudbase/skills/http-api');
});
