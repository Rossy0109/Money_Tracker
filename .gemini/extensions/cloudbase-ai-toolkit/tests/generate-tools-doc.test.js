import { expect, test } from 'vitest';
import { renderDoc } from '../scripts/generate-tools-doc.mjs';

test('renderDoc escapes MDX-sensitive braces in overview and details', () => {
  const markdown = renderDoc({
    tools: [
      {
        name: 'writeNoSqlDatabaseContent',
        description:
          '部分更新要使用 { "$set": { "address.city": "shenzhen" } }；直接传 { field: value } 会替换整条文档，前端可通过 `db.collection(...).doc(uid)` 读取。',
        inputSchema: {
          type: 'object',
          properties: {
            update: {
              type: 'string',
              description:
                '更新内容示例 { "$set": { "status": "pending" } }，不要直接传 { "status": "pending" }。',
            },
          },
        },
      },
    ],
  });

  expect(markdown).toContain('&#123; "$set": &#123; "address.city": "shenzhen" &#125; &#125;');
  expect(markdown).toContain('&#123; field: value &#125;');
  expect(markdown).toContain('`db.collection(...).doc(uid)`');

  const detailSection = markdown.split('## 详细规格')[1];
  expect(detailSection).toContain('&#123; "$set": &#123; "address.city": "shenzhen" &#125; &#125;');
  expect(detailSection).toContain('&#123; field: value &#125;');
  expect(detailSection).not.toContain('{ "$set": { "address.city": "shenzhen" } }');
});
