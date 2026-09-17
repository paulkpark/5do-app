import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// cymatics.js used to build a WebGL2 context, four shader programs, two float
// FBOs and their textures inside init(), which runs on DOMContentLoaded for
// every visitor — including the large majority who never switch the visualiser
// on. The GPU work is deferred to first use now.

let Cymatics;
let contextRequests;
let canvas;

const stubEl = () => ({
  className: '', style: { cssText: '', setProperty() {}, display: '' },
  classList: { add() {}, remove() {}, toggle() {} },
  parentElement: null, offsetParent: {}, offsetWidth: 0,
  addEventListener() {}, insertAdjacentElement() {}, remove() {},
  getContext(kind) { contextRequests.push(kind); return null; },
});

before(async () => {
  // The harness can never hand back a real context, so the module warns on every
  // _ensureGL. That is the behaviour under test; keep it out of the report.
  console.warn = () => {};
  globalThis.WebGL2RenderingContext = function () {};
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.document = {
    visibilityState: 'visible',
    createElement: stubEl,
    addEventListener() {},
    getElementById: () => null,
  };
  Cymatics = await import('../public/js/cymatics.js');
});

test('init() asks for no GL context at all', () => {
  contextRequests = [];
  canvas = stubEl();
  canvas.parentElement = stubEl();
  Cymatics.init(canvas);
  assert.deepEqual(contextRequests, [],
    'init() still allocates a WebGL context on boot');
  assert.equal(Cymatics.isReady(), false);
});

test('prefs are still readable straight after init()', () => {
  // The boot script paints the checkbox and style chips from these immediately,
  // so moving the GL work out must not move the prefs load with it.
  const prefs = Cymatics.getPrefs();
  assert.equal(typeof prefs.enabled, 'boolean');
  assert.equal(typeof prefs.style, 'string');
});

test('switching the visualiser on is what builds the context', () => {
  contextRequests = [];
  Cymatics.setEnabled(true);
  assert.deepEqual(contextRequests, ['webgl2'],
    'enabling did not trigger exactly one context request');
});

test('a browser that cannot give a context does not wedge or throw', () => {
  // getContext returns null in this harness, so _ensureGL fails every time.
  // It must stay recoverable rather than throw out of a UI handler.
  contextRequests = [];
  assert.doesNotThrow(() => Cymatics.setEnabled(false));
  assert.doesNotThrow(() => Cymatics.setStyle('waves'));
  assert.doesNotThrow(() => Cymatics.setEnabled(true));
  assert.equal(Cymatics.isReady(), false);
  assert.ok(contextRequests.length > 0, 'gave up retrying the context entirely');
});

test('init() throws on a browser with no WebGL2, so the caller hides the controls', () => {
  const saved = globalThis.WebGL2RenderingContext;
  delete globalThis.WebGL2RenderingContext;
  try {
    assert.throws(() => Cymatics.init(stubEl()), /WebGL2/);
  } finally {
    globalThis.WebGL2RenderingContext = saved;
  }
});
