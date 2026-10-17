import assert from 'node:assert/strict';
import {
  mergeActiveLlm,
  providerColumnKey,
  formatParallelProgressMessage,
} from '../multiLlmProgress.ts';

const m1 = mergeActiveLlm(undefined, {
  provider: 'OpenAI',
  model: 'openai/gpt-5.5',
  passIndex: 0,
  passTotal: 3,
});
assert.equal(Object.keys(m1).length, 1);
assert.ok(m1.openai);

const m2 = mergeActiveLlm(m1, {
  provider: 'Google',
  model: 'google/gemini-3.1-pro-preview',
  passIndex: 1,
  passTotal: 3,
});
assert.equal(Object.keys(m2).length, 2);

const m3 = mergeActiveLlm(m2, {
  provider: 'Anthropic',
  model: 'anthropic/claude-opus-4.8',
  passIndex: 2,
  passTotal: 3,
  stepName: 'Refactor',
});
assert.equal(Object.keys(m3).length, 3);
assert.equal(m3.openai.passIndex, 0);
assert.equal(m3.anthropic.stepName, 'Refactor');

assert.equal(providerColumnKey('OpenAI', 'openai/gpt-5.5'), 'openai');
assert.equal(providerColumnKey('Anthropic', 'anthropic/claude-opus-4.8'), 'anthropic');

const msg = formatParallelProgressMessage(m3);
assert.ok(msg.includes('Parallel (3/3)'));
assert.ok(msg.includes('OpenAI'));
assert.ok(msg.includes('Anthropic'));

console.log('multiLlmProgress.test.mjs: all assertions passed');
