// public/js/cymatics-patterns.js

export const PATTERNS = {
  chladni: {
    modeIndex: 0,
    palette: ['#7C5CFC', '#3ECFCF', '#FF6B9D'],
    smoothing: 0.7
  },
  mandala: {
    modeIndex: 1,
    palette: ['#FFB86C', '#FF6B9D', '#9B7FFF'],
    smoothing: 0.6
  },
  liquid: {
    modeIndex: 2,
    palette: ['#3ECFCF', '#5A3AD9', '#7C5CFC'],
    smoothing: 0.85
  },
  particle: {
    modeIndex: 3,
    palette: ['#FF6B9D', '#FFB86C', '#3ECFCF'],
    smoothing: 0.5
  }
};

export const CATEGORY_DEFAULTS = {
  Divine_Tunes: 'mandala',
  Akashic_Gateway: 'mandala',
  Chakra_Activation: 'chladni',
  Holland_Resonance: 'chladni',
  Crystal_Frequencies: 'liquid',
  White_Noise: 'liquid',
  Solar_Activation: 'particle',
  Sacral_Activation: 'particle'
};

const FALLBACK_PATTERN = 'mandala';
