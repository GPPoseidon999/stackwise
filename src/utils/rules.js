import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const DEFAULT_CONCERNS = ['testing', 'performance', 'build', 'security'];

export function walkMarkdownFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const results = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      results.push(...walkMarkdownFiles(fullPath));
      continue;
    }

    if (fullPath.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

export function readDefaultConcerns(repoPath) {
  const metaPath = join(repoPath, 'meta', 'default-concerns.json');

  if (!existsSync(metaPath)) {
    return DEFAULT_CONCERNS;
  }

  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (Array.isArray(parsed.default_concerns) && parsed.default_concerns.length > 0) {
      return parsed.default_concerns;
    }
  } catch {
    return DEFAULT_CONCERNS;
  }

  return DEFAULT_CONCERNS;
}

export function collectRuleEntries(dir, standardsRoot) {
  return walkMarkdownFiles(dir).map((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const metadata = parseFrontmatter(content);
    const relPath = '.standards/' + relative(standardsRoot, filePath).replace(/\\/g, '/');

    return {
      id: metadata.id || deriveIdFromPath(relPath),
      title: metadata.title || deriveTitleFromPath(relPath),
      type: metadata.type || inferTypeFromPath(relPath),
      stack: metadata.stack || null,
      concern: metadata.concern || null,
      priority: metadata.priority || 'medium',
      always_apply: metadata.always_apply ?? false,
      applies_to: Array.isArray(metadata.applies_to) ? metadata.applies_to : [],
      signals: Array.isArray(metadata.signals) ? metadata.signals : [],
      related_rules: Array.isArray(metadata.related_rules) ? metadata.related_rules : [],
      file: relPath,
    };
  });
}

export function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return {};
  }

  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return {};
  }

  const raw = content.slice(4, endIndex).trim();
  const lines = raw.split('\n');
  const result = {};
  let currentKey = null;

  for (const line of lines) {
    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentKey) {
      result[currentKey].push(parseScalar(arrayMatch[1].trim()));
      continue;
    }

    const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const [, key, value] = keyMatch;

    if (value === '') {
      result[key] = [];
      currentKey = key;
      continue;
    }

    result[key] = parseScalar(value.trim());
    currentKey = null;
  }

  return result;
}

function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function inferTypeFromPath(filePath) {
  if (filePath.includes('/concerns/')) {
    return 'concern';
  }

  return 'stack';
}

function deriveIdFromPath(filePath) {
  return filePath
    .replace('.standards/', '')
    .replace(/^stacks\//, '')
    .replace(/^concerns\//, '')
    .replace(/\.md$/, '');
}

function deriveTitleFromPath(filePath) {
  return filePath
    .split('/')
    .at(-1)
    ?.replace(/\.md$/, '')
    ?.replace(/-/g, ' ') || 'Rule';
}
