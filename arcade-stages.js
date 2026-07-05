// =============================================================================
// 5DO Arcade — PREMIUM stage data (stages 4+), server-side only.
// Served by GET /api/arcade/stages to authenticated 'pro' users.
// NEVER import this from client code and never place it under public/.
// Shape mirrors the free STAGES entries in the game client.
// =============================================================================

// P(x, y, z, w, d, opts) — y is the TOP surface height (same as the client helper)
function P(x, y, z, w, d, opts = {}) { return { x, y, z, w, d, h: opts.h ?? 1.2, ...opts }; }

export const ARCADE_PREMIUM_STAGES = [
  { // ---- Stage 4: Aurora Reef — fast movers over a glowing sea
    name: 'AURORA REEF', theme: 'garden',
    spawn: [0, 0.01, 8], sky: ['#00202e', '#3ECFCF', '#050510'],
    platforms: [
      P(0, 0, 8, 10, 10, { skin: 'grass' }),
      P(-9, 2.5, -1, 4, 4, { type: 'move', axis: [1, 0, 0], amp: 3, speed: 1.8 }),
      P(0, 5, -9, 4, 4, { type: 'move', axis: [0, 0, 1], amp: 4, speed: 1.5, phase: 1.5 }),
      P(10, 7.5, -4, 4, 4),
      P(10, 7.7, -4, 2.4, 2.4, { type: 'pad' }),
      P(10, 20, 6, 5, 5, { skin: 'grass' }),
      P(0, 22, 12, 4, 4, { type: 'move', axis: [0, 1, 0], amp: 3, speed: 2 }),
      P(-10, 25, 6, 5, 5),
      P(-16, 27, -4, 4, 4, { type: 'move', axis: [1, 0, 1], amp: 2.5, speed: 1.6 }),
      P(-8, 30, -12, 5, 5, { skin: 'grass' }),
      P(2, 33, -16, 4, 4, { type: 'move', axis: [1, 0, 0], amp: 4, speed: 2 }),
      P(12, 36, -10, 6, 6),
    ],
    pods: [[-9, 4.3, -1], [0, 6.8, -9], [10, 9.4, -4], [0, 24, 12], [-16, 29, -4], [2, 35, -16]],
    enemies: [
      { a: [8.5, 21.4, 6], b: [11.5, 21.4, 6] },
      { a: [-11.5, 26.4, 6], b: [-8.5, 26.4, 6] },
      { a: [-9.5, 31.4, -12], b: [-6.5, 31.4, -12] },
      { a: [10.5, 37.4, -11.5], b: [13.5, 37.4, -8.5] },
    ],
    exit: [12, 36, -10],
  },
  { // ---- Stage 5: Event Horizon — small platforms, long leaps, the final test
    name: 'EVENT HORIZON', theme: 'ruins',
    spawn: [0, 0.01, 0], sky: ['#1a0500', '#FFB86C', '#000005'],
    platforms: [
      P(0, 0, 0, 8, 8),
      P(0, 3, -10, 3, 3, { type: 'move', axis: [1, 0, 0], amp: 5, speed: 2.2 }),
      P(9, 6, -16, 3.5, 3.5),
      P(9, 6.2, -16, 2, 2, { type: 'pad' }),
      P(9, 20, -4, 4, 4),
      P(0, 23, 2, 3, 3, { type: 'move', axis: [0, 1, 0], amp: 3.5, speed: 2.4 }),
      P(-9, 26, -2, 3.5, 3.5),
      P(-14, 29, -10, 3, 3, { type: 'move', axis: [0, 0, 1], amp: 4, speed: 2 }),
      P(-6, 32, -18, 4, 4),
      P(4, 35, -22, 3, 3, { type: 'move', axis: [1, 0, 1], amp: 3, speed: 2.2 }),
      P(14, 38, -16, 3.5, 3.5),
      P(14, 41, -6, 3, 3, { type: 'move', axis: [0, 1, 0], amp: 2.5, speed: 2.6 }),
      P(6, 44, 2, 5, 5, { skin: 'grass' }),
    ],
    pods: [[0, 5, -10], [9, 8, -16], [9, 21.6, -4], [-9, 27.6, -2], [-6, 33.6, -18], [14, 39.6, -16], [14, 43, -6]],
    enemies: [
      { a: [7.5, 21.4, -4], b: [10.5, 21.4, -4] },
      { a: [-10.5, 27.4, -2], b: [-7.5, 27.4, -2] },
      { a: [-7.5, 33.4, -18], b: [-4.5, 33.4, -18] },
      { a: [12.5, 39.4, -17.5], b: [15.5, 39.4, -14.5] },
      { a: [4.5, 45.4, 0.5], b: [7.5, 45.4, 3.5] },
    ],
    exit: [6, 44, 2],
  },
];
