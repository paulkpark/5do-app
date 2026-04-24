// ─── Audio matrix uniforms (Karleido-style) ──────────────────
// All provided by render.html. Declaring extras is fine even if the shader
// only uses a subset — WebGL silently ignores unused uniforms.

uniform float u_bass;        // smoothed bass (0-1)
uniform float u_mid;         // smoothed mid (0-1)
uniform float u_treble;      // smoothed treble (0-1)
uniform float u_beat;        // legacy beat pulse (decays ~0.045/frame)

// Presence = slow-attack low-pass energy per band (~0.5-1s ramp)
uniform float u_bassPres;
uniform float u_midPres;
uniform float u_treblePres;

// Hit = fast-attack peak-hold envelope (spike on transient, decays ~0.06-0.10/frame)
uniform float u_bassHit;
uniform float u_midHit;
uniform float u_trebleHit;

// Time (seconds) since last transient per band — clamped to 9s
uniform float u_bassTime;
uniform float u_midTime;
uniform float u_trebleTime;

// Beat tracking — onset pulse + running phase in [0,1)
uniform float u_beatOnset;    // 0/1 spike on kick
uniform float u_beatPhase;    // phase within estimated beat period
uniform float u_beatPeriod;   // seconds/beat (BPM = 60/u_beatPeriod)

// Convenience: exponential ramp "since hit" (1.0 at hit, 0.0 after ~0.4s)
float hitRamp(float timeSince, float halfLife) {
  return exp(-timeSince / max(halfLife, 0.01));
}
