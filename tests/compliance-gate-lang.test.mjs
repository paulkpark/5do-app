import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

// The consent gate must paint instantly — a legal notice cannot wait on a
// network round trip — so it uses the language the page knows synchronously
// (navigator.language). boot's IP detect lands a few hundred ms later and may
// disagree. The gate is still on screen at that point, and because its markup
// is a one-shot innerHTML string with no data-i18n attributes, applyLang()
// cannot reach it: a first-time visitor abroad on a Korean-set phone used to
// get an English app under a Korean consent dialog.

const SRC = fs.readFileSync(new URL('../public/js/compliance-gate.js', import.meta.url), 'utf8');
const IDS = ['_cgTitle', '_cgBody', '_cgAck', '_cgLegal'];

function makeEl(id) {
  return {
    id: id || '', innerHTML: '', attrs: {}, children: [], listeners: {},
    style: { cssText: '' },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(ev, fn) { this.listeners[ev] = fn; },
    appendChild(c) { this.children.push(c); },
    remove() { this.removed = true; },
  };
}

function boot({ lang, acked = false } = {}) {
  const byId = new Map(IDS.map((id) => [id, makeEl(id)]));
  const body = makeEl('body');
  const docEl = makeEl('html');
  const store = acked ? { '5do_compliance_ack_v1': '1' } : {};
  let domReady = null;

  const sandbox = {
    LANG: lang,
    navigator: { language: 'xx-XX' },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    document: {
      readyState: 'loading',
      documentElement: docEl,
      body,
      createElement: () => makeEl(),
      getElementById: (id) => byId.get(id) || null,
      addEventListener: (ev, fn) => { if (ev === 'DOMContentLoaded') domReady = fn; },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  const api = {
    sandbox, byId, body, store,
    get wrap() { return body.children[0]; },
    text: () => IDS.map((id) => byId.get(id).innerHTML).join('\n'),
    href: () => byId.get('_cgLegal').getAttribute('href'),
    // What boot does when the IP detect disagrees with navigator.language.
    refineTo(next) {
      sandbox.LANG = next;
      sandbox.refreshComplianceGateLang();
    },
    ack: () => byId.get('_cgAck').listeners.click(),
  };
  if (domReady) domReady();
  return api;
}

test('the shell really carries the ids the repaint writes into', () => {
  const g = boot({ lang: 'ko' });
  for (const id of IDS) {
    assert.ok(g.wrap.innerHTML.includes('id="' + id + '"'),
      'shell markup is missing ' + id + ' — the repaint would silently no-op');
  }
});

test('first paint follows the synchronously known language', () => {
  assert.match(boot({ lang: 'ko' }).text(), /시작하기 전에/);
  assert.match(boot({ lang: 'en' }).text(), /Before you begin/);
});

test('a later IP result repaints the open dialog (ko guess → en)', () => {
  const g = boot({ lang: 'ko' });
  assert.match(g.text(), /시작하기 전에/);
  g.refineTo('en');
  const t = g.text();
  assert.match(t, /Before you begin/);
  assert.doesNotMatch(t, /시작하기 전에/);
  assert.match(t, /not a medical device/);
  assert.match(t, /13 or older/);
  assert.equal(g.href(), '/landing/en/terms.html');
});

test('and the other way round (en guess → ko)', () => {
  const g = boot({ lang: 'en' });
  g.refineTo('ko');
  const t = g.text();
  assert.match(t, /의료기기가 아닙니다/);
  assert.match(t, /만 13세 이상/);
  assert.doesNotMatch(t, /Before you begin/);
  assert.equal(g.href(), '/landing/terms.html');
});

test('a late IP result cannot resurrect a dialog the user already accepted', () => {
  const g = boot({ lang: 'ko' });
  g.ack();
  assert.equal(g.store['5do_compliance_ack_v1'], '1');
  assert.equal(g.wrap.removed, true);
  const before = g.text();
  assert.doesNotThrow(() => g.refineTo('en'));
  assert.equal(g.text(), before, 'repaint wrote into a dismissed dialog');
});

test('a returning user gets no dialog and no hook', () => {
  const g = boot({ lang: 'ko', acked: true });
  assert.equal(g.body.children.length, 0);
  assert.equal(typeof g.sandbox.refreshComplianceGateLang, 'undefined');
});

test('boot calls the hook defensively, and only on a language change', () => {
  const html = fs.readFileSync(new URL('../public/5do.html', import.meta.url), 'utf8');
  const refine = html.match(/langDetectPromise\.then\(\([\s\S]*?\n  \}\)\.catch/);
  assert.ok(refine, 'the IP refine block moved — the repaint call site is unverified');
  assert.match(refine[0], /typeof window\.refreshComplianceGateLang === 'function'/);
  assert.match(refine[0], /window\.refreshComplianceGateLang\(\)/);
});
