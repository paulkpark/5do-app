import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The player had a sleep timer already: prompt() for a number of minutes, then
// a bare setTimeout. It could not be cancelled, it stacked another timer every
// time it was used, it kept counting while playback was paused, and a track
// shorter than the timer simply ended in silence long before the time was up.
//
// The replacement is a 5-minute grid to 60, it counts PLAYING time only, and
// it loops the track for the duration. This file runs that code rather than
// grepping it: the logic block is lifted out of 5do.html and evaluated against
// a stub DOM, so the countdown and the loop handover are actually exercised.

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const html = read('public/5do.html');

function el(id = '') {
  const s = new Set();
  const attrs = {};
  return {
    id, dataset: {}, style: {}, textContent: '', className: '', children: [],
    classList: {
      add: (c) => s.add(c), remove: (c) => s.delete(c),
      toggle: (c, f) => (f ? s.add(c) : s.delete(c)), contains: (c) => s.has(c),
    },
    addEventListener(ev, fn) { (this._h ||= {})[ev] = fn; },
    append(...n) { this.children.push(...n); },
    _attr: attrs,
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k]; },
  };
}

function load() {
  const start = html.indexOf('const TIMER_STEPS');
  const tail = html.indexOf("$('#timerClose').addEventListener");
  assert.ok(start > -1 && tail > start, 'the timer block moved — re-point this test');
  const src = html.slice(start, html.indexOf('\n', tail));

  const reg = {};
  const chips = [];
  const wheel = el('#timerWheel');
  wheel.scrollTop = 0;
  wheel.scrollTo = ({ top }) => { wheel.scrollTop = top; };
  globalThis.$ = (sel) => (sel === '#timerWheel' ? wheel : (reg[sel] ||= el(sel)));
  globalThis.document = {
    createElement: () => { const c = el('chip'); chips.push(c); return c; },
    querySelectorAll: (sel) => (sel.includes('wheel-item') ? chips : []),
    getElementById: () => null,
  };
  globalThis.player = {
    paused: false, loop: false, pauses: 0,
    pause() { this.paused = true; this.pauses++; },
  };
  globalThis.statusTitle = el('statusTitle');
  globalThis.updatePlayPauseIcon = () => {};
  globalThis.stopLibViz = () => {};
  globalThis.applyLang = () => {};

  const api = new Function(`${src}\n;return { TIMER_STEPS, TIMER_ITEMS, WHEEL_ITEM_H, SLEEP,
    timerSet, timerStop, timerFmt, wheelValueFromScroll, wheelIndexFromScroll };`)();
  return { ...api, chips, reg, wheel, player: globalThis.player };
}

test('the grid is 5-minute steps up to 60, and nothing beyond', () => {
  const { TIMER_STEPS } = load();
  assert.deepEqual(TIMER_STEPS, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
});

test('the drum carries Off and every step, in order', () => {
  const { chips, TIMER_ITEMS } = load();
  assert.deepEqual(TIMER_ITEMS, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  assert.equal(chips.length, 13);
  assert.equal(chips[0].dataset.min, '0', 'Off is the top of the drum');
  assert.equal(chips[0].dataset.i18n, 'timer.off', 'the Off label cannot be translated');
  assert.deepEqual(chips.map((c) => c.getAttribute('role')), new Array(13).fill('option'),
    'the drum rows are not announced as options');
});

test('where the drum stops decides the value', () => {
  // The rounding IS the selection rule, so it is tested without a scroller.
  const { wheelValueFromScroll, WHEEL_ITEM_H: H } = load();
  assert.equal(wheelValueFromScroll(0), 0);
  assert.equal(wheelValueFromScroll(H * 3), 15);
  assert.equal(wheelValueFromScroll(H * 3 + 5), 15, 'a nudge must not change the pick');
  assert.equal(wheelValueFromScroll(H * 3.6), 20, 'past halfway it should land on the next one');
  assert.equal(wheelValueFromScroll(H * 12), 60);
  assert.equal(wheelValueFromScroll(H * 99), 60, 'overscroll must clamp, not go undefined');
  assert.equal(wheelValueFromScroll(-200), 0);
});

test('prompt() is gone from the player', () => {
  // It is blocked outright in some embedded webviews, and it cannot express
  // "cancel" or "how much is left".
  const block = html.slice(html.indexOf("$('#btnTimer')"), html.indexOf("$('#btnBack')"));
  assert.doesNotMatch(block, /prompt\(/);
});

test('a timer loops the track, so a short one repeats instead of ending', () => {
  const { timerSet, timerStop, player } = load();
  assert.equal(player.loop, false);
  timerSet(15);
  assert.equal(player.loop, true, 'a 3-minute track would stop 12 minutes early');
  timerStop(false);   // a live 1s interval would hold the test process open
});

test('loop is handed back exactly as it was found', () => {
  const { timerSet, timerStop, player, SLEEP } = load();
  timerSet(10);
  assert.equal(SLEEP.forcedLoop, true);
  timerStop(false);
  assert.equal(player.loop, false, 'loop was left on after the timer went away');

  player.loop = true;                       // user turned it on themselves
  timerSet(10);
  assert.equal(SLEEP.forcedLoop, false, 'the timer claimed a loop it did not set');
  timerStop(false);
  assert.equal(player.loop, true, 'the timer switched off the user\'s own loop');
});

test('the countdown spends playing time only', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  const { timerSet, SLEEP, player } = load();
  timerSet(5);
  assert.equal(SLEEP.leftMs, 300000);

  t.mock.timers.tick(60000);                 // a minute of playback
  assert.ok(Math.abs(SLEEP.leftMs - 240000) < 1500, `left ${SLEEP.leftMs}`);

  player.paused = true;
  t.mock.timers.tick(120000);                // two minutes paused
  assert.ok(Math.abs(SLEEP.leftMs - 240000) < 1500,
    `paused time was charged to the timer: ${SLEEP.leftMs}`);

  player.paused = false;
  t.mock.timers.tick(60000);
  assert.ok(Math.abs(SLEEP.leftMs - 180000) < 1500, `left ${SLEEP.leftMs}`);
});

test('when the time is up it pauses and clears itself', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  const { timerSet, SLEEP, player } = load();
  timerSet(5);
  t.mock.timers.tick(5 * 60000 + 1000);
  assert.equal(player.pauses, 1, 'playback kept going');
  assert.equal(SLEEP.leftMs, 0);
  assert.equal(SLEEP.minutes, 0);
  assert.equal(SLEEP.iv, null, 'the interval is still running after it fired');
  assert.equal(player.loop, false, 'the forced loop outlived the timer');

  const before = player.pauses;
  t.mock.timers.tick(10 * 60000);
  assert.equal(player.pauses, before, 'it fired again after finishing');
});

test('picking a new duration replaces the old one, it does not stack', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  const { timerSet, SLEEP, player } = load();
  timerSet(5);
  t.mock.timers.tick(60000);
  timerSet(30);
  assert.equal(SLEEP.leftMs, 1800000, 'the new timer did not start clean');
  t.mock.timers.tick(5 * 60000);             // the old one would have fired here
  assert.equal(player.pauses, 0, 'the replaced timer still stopped playback');
});

test('Off cancels without stopping the music', () => {
  const { timerSet, timerStop, SLEEP, player } = load();
  timerSet(20);
  timerStop(false);
  assert.equal(SLEEP.leftMs, 0);
  assert.equal(player.pauses, 0, 'cancelling the timer killed playback');
});

test('the remaining time is shown as m:ss', () => {
  const { timerFmt } = load();
  assert.equal(timerFmt(300000), '5:00');
  assert.equal(timerFmt(61000), '1:01');
  assert.equal(timerFmt(9000), '0:09');
});

test('the service worker was rebuilt', () => {
  const id = read('public/sw.js').match(/const BUILD_ID = '([^']+)'/)[1];
  assert.ok(id >= '2026-11-19-v130', `BUILD_ID ${id} predates the play timer`);
});
