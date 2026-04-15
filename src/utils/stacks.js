import { STACK_MAP, STACK_PRIORITY } from '../constants/stack-map.js';

export function getKnownStacks() {
  const mappedStacks = Object.values(STACK_MAP);
  const uniqueStacks = [...new Set(mappedStacks)];

  return [
    ...STACK_PRIORITY.filter((stack) => uniqueStacks.includes(stack)),
    ...uniqueStacks.filter((stack) => !STACK_PRIORITY.includes(stack)).sort(),
  ];
}

export function normalizeStackName(stack) {
  return stack.trim().toLowerCase();
}

export function isKnownStack(stack) {
  return getKnownStacks().includes(normalizeStackName(stack));
}

export function getStackSuggestions(stack) {
  const normalized = normalizeStackName(stack);
  const knownStacks = getKnownStacks();
  const scored = knownStacks
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(normalized, candidate),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored.slice(0, 3).map((item) => item.candidate);
}

export function getKnownStacksPreview(limit = 12) {
  const knownStacks = getKnownStacks();
  const preview = knownStacks.slice(0, limit);
  const suffix = knownStacks.length > limit ? ', ...' : '';

  return `${preview.join(', ')}${suffix}`;
}

function scoreCandidate(input, candidate) {
  if (!input || !candidate) {
    return 0;
  }

  if (candidate === input) {
    return 100;
  }

  let score = 0;

  if (candidate.startsWith(input)) {
    score += 60;
  }

  if (candidate.includes(input)) {
    score += 35;
  }

  if (input.includes(candidate)) {
    score += 20;
  }

  const prefixLength = sharedPrefixLength(input, candidate);
  score += Math.min(prefixLength, 6) * 4;

  const inputParts = input.split('-');
  const candidateParts = candidate.split('-');
  const sharedParts = candidateParts.filter((part) => inputParts.includes(part));
  score += sharedParts.length * 10;

  return score;
}

function sharedPrefixLength(left, right) {
  let index = 0;

  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }

  return index;
}
