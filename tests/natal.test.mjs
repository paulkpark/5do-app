import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NATAL_MODEL, NATAL_MODEL_DEEP, buildReadingRequest, createSSEFilter,
} from '../services/natal.js';

test('request targets the Claude 5 family, deep mode opting into Opus', () => {
  assert.equal(buildReadingRequest({ prompt: 'x' }).model, NATAL_MODEL);
  assert.equal(buildReadingRequest({ prompt: 'x', deep: true }).model, NATAL_MODEL_DEEP);
  assert.equal(NATAL_MODEL, 'claude-sonnet-5');
  assert.equal(NATAL_MODEL_DEEP, 'claude-opus-5');
});

test('request omits the parameters Claude 5 rejects with a 400', () => {
  const b = buildReadingRequest({ prompt: 'x', deep: true });
  for (const k of ['temperature', 'top_p', 'top_k']) {
    assert.ok(!(k in b), `${k} must not be sent — removed on this model family`);
  }
  assert.deepEqual(b.thinking, { type: 'adaptive' });
  assert.ok(!('budget_tokens' in b.thinking), 'budget_tokens is a 400 on Claude 5');
  assert.equal(b.stream, true);
  assert.ok(b.max_tokens >= 8000, 'max_tokens must cover thinking as well as the answer');
});

test('request refuses to be built without a prompt', () => {
  assert.throws(() => buildReadingRequest({}), /prompt required/);
  assert.throws(() => buildReadingRequest({ prompt: 123 }), /prompt required/);
});

const sse = (obj) => `event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`;

test('filter forwards text deltas and drops everything else', () => {
  const push = createSSEFilter();
  const out = [
    ...push(sse({ type: 'message_start', message: { usage: {} } })),
    ...push(sse({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } })),
    ...push(sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'reasoning' } })),
    ...push(sse({ type: 'ping' })),
    ...push(sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '태양은 ' } })),
    ...push(sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '쌍둥이자리' } })),
    ...push(sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })),
    ...push(sse({ type: 'message_stop' })),
  ];
  assert.deepEqual(out, [
    { type: 'text', text: '태양은 ' },
    { type: 'text', text: '쌍둥이자리' },
    { type: 'done', stopReason: 'end_turn' },
  ]);
});

test('thinking deltas never leak into the reading', () => {
  const push = createSSEFilter();
  const out = push(sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'do not show this' } }));
  assert.deepEqual(out, []);
});

test('a refusal surfaces as a stop reason rather than silence', () => {
  const push = createSSEFilter();
  assert.deepEqual(
    push(sse({ type: 'message_delta', delta: { stop_reason: 'refusal' } })),
    [{ type: 'done', stopReason: 'refusal' }],
  );
});

test('a mid-stream API error is reported, not swallowed', () => {
  const push = createSSEFilter();
  assert.deepEqual(
    push(sse({ type: 'error', error: { message: 'overloaded_error' } })),
    [{ type: 'error', message: 'overloaded_error' }],
  );
});

test('chunks split at any byte still parse — including mid-JSON', () => {
  const whole =
    sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hello ' } }) +
    sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } }) +
    sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' } });

  for (const size of [1, 3, 7, 17, 64]) {
    const push = createSSEFilter();
    const out = [];
    for (let i = 0; i < whole.length; i += size) out.push(...push(whole.slice(i, i + size)));
    assert.deepEqual(
      out,
      [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }, { type: 'done', stopReason: 'end_turn' }],
      `chunk size ${size}`,
    );
  }
});

test('a truncated trailing line is held, not half-parsed', () => {
  const push = createSSEFilter();
  assert.deepEqual(push('data: {"type":"content_block_delta","delta":{"type":"text_'), []);
  assert.deepEqual(
    push('delta","text":"ok"}}\n'),
    [{ type: 'text', text: 'ok' }],
  );
});

test('malformed JSON is skipped without killing the stream', () => {
  const push = createSSEFilter();
  const out = [
    ...push('data: {not json}\n'),
    ...push(sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'still here' } })),
  ];
  assert.deepEqual(out, [{ type: 'text', text: 'still here' }]);
});

// ── cache + limits ──────────────────────────────────────────────────────────
import {
  validateReadingTarget, timingCooldown,
  MAX_CHARTS_PER_USER, TIMING_SECTION, TIMING_COOLDOWN_DAYS,
} from '../services/natal.js';

test('limits match the agreed policy', () => {
  assert.equal(MAX_CHARTS_PER_USER, 3);
  assert.equal(TIMING_SECTION, 14);
  assert.equal(TIMING_COOLDOWN_DAYS, 30);
});

test('target validation accepts a well-formed request', () => {
  assert.deepEqual(
    validateReadingTarget({ chartKey: ' 1990|6|15|12|0|37.5700|126.9800|t ', section: '7', lang: 'en' }),
    { chartKey: '1990|6|15|12|0|37.5700|126.9800|t', section: 7, lang: 'en' },
  );
});

test('target validation rejects what would corrupt or inflate the cache', () => {
  const bad = [
    [{ chartKey: '', section: 2, lang: 'ko' }, /chartKey/],
    [{ chartKey: '   ', section: 2, lang: 'ko' }, /chartKey/],
    [{ chartKey: 'x'.repeat(201), section: 2, lang: 'ko' }, /chartKey/],
    [{ chartKey: 'k', section: 1, lang: 'ko' }, /section/],   // section 1 is computed, never generated
    [{ chartKey: 'k', section: 16, lang: 'ko' }, /section/],
    [{ chartKey: 'k', section: 7.5, lang: 'ko' }, /section/],
    [{ chartKey: 'k', section: 'abc', lang: 'ko' }, /section/],
    [{ chartKey: 'k', section: 2, lang: 'jp' }, /lang/],
  ];
  for (const [input, re] of bad) assert.throws(() => validateReadingTarget(input), re, JSON.stringify(input));
});

test('timing: the first generation is always allowed', () => {
  assert.deepEqual(timingCooldown(null), { allowed: true, availableAt: null, daysLeft: 0 });
});

test('timing: a regenerate inside 30 days is refused, with the unlock date', () => {
  const at = '2026-09-01T00:00:00Z';
  const r = timingCooldown(at, new Date('2026-09-17T00:00:00Z'));
  assert.equal(r.allowed, false);
  assert.equal(r.availableAt, '2026-10-01T00:00:00.000Z');
  assert.equal(r.daysLeft, 14);
});

test('timing: the cooldown opens exactly at 30 days, not a day late', () => {
  const at = '2026-09-01T00:00:00Z';
  const boundary = new Date('2026-10-01T00:00:00Z');
  assert.equal(timingCooldown(at, new Date(boundary.getTime() - 1000)).allowed, false);
  assert.equal(timingCooldown(at, boundary).allowed, true);
  assert.equal(timingCooldown(at, new Date(boundary.getTime() + 1000)).allowed, true);
});
