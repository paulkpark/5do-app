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
