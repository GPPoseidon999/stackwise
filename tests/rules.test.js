import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRuleEntries, lintRuleFile, walkMarkdownFiles } from '../src/utils/rules.js';

function makeRulesTree() {
  const root = mkdtempSync(join(tmpdir(), 'stackwise-rules-'));
  const standardsRoot = root;
  mkdirSync(join(standardsRoot, 'react'), { recursive: true });
  mkdirSync(join(standardsRoot, 'biz'), { recursive: true });

  writeFileSync(
    join(standardsRoot, 'react', 'component-structure.md'),
    [
      '---',
      'id: react/component-structure',
      'title: React Component Structure',
      'type: stack',
      'stack: react',
      'priority: high',
      'always_apply: true',
      'applies_to:',
      '  - implementation',
      '  - review',
      'signals:',
      '  - .tsx',
      '  - component',
      'related_rules:',
      '  - react/hooks',
      '---',
      '',
      '# Body',
    ].join('\n')
  );

  // _ 前缀文件应被过滤
  writeFileSync(
    join(standardsRoot, 'react', '_template.md'),
    '---\nid: react/_template\ntitle: Template\n---\n\n# placeholder'
  );

  // biz/ 缺 owner 与 last_reviewed → lint 必须报 error
  writeFileSync(
    join(standardsRoot, 'biz', 'order-state.md'),
    [
      '---',
      'id: biz/order-state',
      'title: 订单状态机',
      'type: concern',
      'concern: business',
      'priority: high',
      '---',
      '',
      '# Body',
    ].join('\n')
  );

  return { root, standardsRoot };
}

test('walkMarkdownFiles skips files with leading underscore and changelog', () => {
  const { root, standardsRoot } = makeRulesTree();
  try {
    writeFileSync(join(standardsRoot, 'react', 'CHANGELOG.md'), '# changelog');
    const files = walkMarkdownFiles(standardsRoot).map((f) => f.replace(`${root}/`, ''));
    assert.ok(files.some((f) => f.endsWith('component-structure.md')));
    assert.ok(!files.some((f) => f.endsWith('_template.md')), '_template.md is filtered');
    assert.ok(!files.some((f) => f.toLowerCase().endsWith('changelog.md')), 'changelog.md is filtered');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('collectRuleEntries parses frontmatter and produces stable manifest entries', () => {
  const { root, standardsRoot } = makeRulesTree();
  try {
    const entries = collectRuleEntries(join(standardsRoot, 'react'), standardsRoot, 'stack', 'standards');
    assert.equal(entries.length, 1);
    const rule = entries[0];
    assert.equal(rule.id, 'react/component-structure');
    assert.equal(rule.type, 'stack');
    assert.equal(rule.source, 'standards');
    assert.equal(rule.priority, 'high');
    assert.equal(rule.always_apply, true);
    assert.deepEqual(rule.applies_to, ['implementation', 'review']);
    assert.deepEqual(rule.signals, ['.tsx', 'component']);
    assert.deepEqual(rule.related_rules, ['react/hooks']);
    assert.ok(rule.file.startsWith('agents/rules/'), 'file path is rooted at agents/rules/');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('biz/ rule missing owner/last_reviewed produces lint errors', () => {
  const { root, standardsRoot } = makeRulesTree();
  try {
    // 把 biz/ 文件移动到一个看起来像 agents/rules/biz 的路径里以触发 biz 检查
    const bizDir = join(root, 'agents', 'rules', 'biz');
    mkdirSync(bizDir, { recursive: true });
    const bizFile = join(bizDir, 'order-state.md');
    writeFileSync(
      bizFile,
      [
        '---',
        'id: biz/order-state',
        'title: 订单状态机',
        'type: concern',
        'concern: business',
        'priority: high',
        '---',
        '',
        '# Body',
      ].join('\n')
    );

    const issues = lintRuleFile(bizFile);
    const messages = issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes('owner')), 'reports missing owner');
    assert.ok(messages.some((m) => m.includes('last_reviewed')), 'reports missing last_reviewed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
