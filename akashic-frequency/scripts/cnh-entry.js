// Browser entry for circular-natal-horoscope-js.
//
// The package ships CommonJS only, and this sub-app has no bundler (React UMD
// + in-browser Babel), so the library is built once from here and committed as
// a self-contained IIFE at public/vendor/cnh.js. The natal engine wants exactly
// { Origin, Horoscope } through setEphemeris(), so only those are exposed.
//
// Rebuild:  npm run build:cnh
const m = require('circular-natal-horoscope-js');
module.exports = { Origin: m.Origin, Horoscope: m.Horoscope };
