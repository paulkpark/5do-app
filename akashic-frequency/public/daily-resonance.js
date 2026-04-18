/* =============================================================================
   Daily Resonance — 오늘의 공명 대시보드
   React component (Babel-compiled). Mounted inside akashic-frequency SPA.
   ============================================================================= */

(function() {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;

  // ─── Frequency Matching Rules ─────────────────────────────────────────────
  const CATEGORY_HZ = {
    Divine_Tunes:          { representative: [432, 528, 639],                mood: 'devotional' },
    Chakra_Activation:     { representative: [396, 417, 528, 639, 741, 852, 963], mood: 'balancing' },
    Crystal_Frequencies:   { representative: [174, 285, 396],                mood: 'grounding' },
    White_Noise:           { representative: [0],                            mood: 'shielding' },
    Solfeggio_Frequencies: { representative: [174, 285, 396, 417, 528, 639, 741, 852, 963], mood: 'solfeggio' },
    Brainwave_States:      { representative: [4, 8, 10, 15, 40],             mood: 'entrainment' },
    Organ_Healing:         { representative: [727, 787, 880],                mood: 'physical' },
    RIFE_Therapy:          { representative: [727, 787, 880, 10000],         mood: 'physical' },
    Lunar_Purification:    { representative: [210.42, 221.23],               mood: 'lunar' },
    Quantum_Torus_X:       { representative: [7.83, 33, 111],                mood: 'quantum' },
    Higher_Density:        { representative: [963, 1111, 1212],              mood: 'ascension' },
  };

  function scoreCategories(blueprint, cosmic, biorhythm) {
    const s = {};
    Object.keys(CATEGORY_HZ).forEach(k => s[k] = 0);
    const reasons = [];

    // Rule 1: saju deficient element → +30
    const deficientBoost = {
      wood:  ['Chakra_Activation'],
      fire:  ['Solfeggio_Frequencies'],
      earth: ['Crystal_Frequencies', 'Organ_Healing'],
      metal: ['Higher_Density'],
      water: ['Brainwave_States', 'Lunar_Purification']
    };
    (blueprint.saju?.deficient || []).forEach(el => {
      (deficientBoost[el] || []).forEach(cat => {
        s[cat] += 30;
        reasons.push({ cat, weight: 30, kind: 'saju_deficient', value: el });
      });
    });

    // Rule 2: biorhythm critical (|value| < 5) → +20
    if (biorhythm && Math.abs(biorhythm.physical) < 5) {
      s['Organ_Healing'] += 20; s['RIFE_Therapy'] += 20;
      reasons.push({ cat: 'Organ_Healing', weight: 20, kind: 'bio_physical_critical' });
    }
    if (biorhythm && Math.abs(biorhythm.emotional) < 5) {
      s['Chakra_Activation'] += 20; s['Divine_Tunes'] += 15;
      reasons.push({ cat: 'Chakra_Activation', weight: 20, kind: 'bio_emotional_critical' });
    }
    if (biorhythm && Math.abs(biorhythm.intellectual) < 5) {
      s['Brainwave_States'] += 20;
      reasons.push({ cat: 'Brainwave_States', weight: 20, kind: 'bio_intellectual_critical' });
    }

    // Rule 3: moon phase → +15
    const moonBoost = {
      new: ['Higher_Density'],
      waxing_crescent: ['Solfeggio_Frequencies'],
      first_quarter: ['Solfeggio_Frequencies'],
      waxing_gibbous: ['Solfeggio_Frequencies'],
      full: ['Lunar_Purification'],
      waning_gibbous: ['Crystal_Frequencies'],
      last_quarter: ['Crystal_Frequencies'],
      waning_crescent: ['Crystal_Frequencies'],
    };
    (moonBoost[cosmic.moon?.phase] || []).forEach(cat => {
      s[cat] += 15;
      reasons.push({ cat, weight: 15, kind: 'moon_phase', value: cosmic.moon.phase });
    });

    // Rule 4: mercury retrograde → +25
    if (cosmic.events?.some(e => e.type === 'retrograde' && e.planet === 'mercury')) {
      s['White_Noise'] += 25; s['Brainwave_States'] += 15;
      reasons.push({ cat: 'White_Noise', weight: 25, kind: 'mercury_retrograde' });
    }

    // Rule 5: eclipse → +20
    if (cosmic.events?.some(e => e.type === 'eclipse')) {
      s['Higher_Density'] += 20;
      reasons.push({ cat: 'Higher_Density', weight: 20, kind: 'eclipse' });
    }

    // Rule 6: Kp index
    if (cosmic.kp !== null && cosmic.kp !== undefined) {
      if (cosmic.kp >= 6) {
        s['White_Noise'] += 30; s['Crystal_Frequencies'] += 20;
        reasons.push({ cat: 'White_Noise', weight: 30, kind: 'kp_high', value: cosmic.kp });
      } else if (cosmic.kp >= 3) {
        s['Chakra_Activation'] += 10;
      }
    }

    // Rule 7: starseed alignment → +10
    const starseedCat = {
      Pleiadian: 'Divine_Tunes', Sirian: 'Solfeggio_Frequencies',
      Arcturian: 'Higher_Density', Andromedan: 'Brainwave_States', Orion: 'Quantum_Torus_X'
    };
    const topStar = blueprint.starseed?.[0]?.id;
    if (topStar && starseedCat[topStar]) s[starseedCat[topStar]] += 10;

    return { scores: s, reasons };
  }

  // ─── Visual Matching Rules ────────────────────────────────────────────────
  const VISUAL_BY_DAYMASTER = {
    wood:  { pattern: 'hyperBloom',  palette: 'forest_bloom' },
    fire:  { pattern: 'dmtTunnel',   palette: 'solar_flare' },
    earth: { pattern: 'voidCrystal', palette: 'earth_core' },
    metal: { pattern: 'kaleido',     palette: 'silver_echo' },
    water: { pattern: 'juliaWarp',   palette: 'ocean_depth' },
  };
  const PALETTES = {
    forest_bloom:      ['#00FF88', '#4CAF50', '#00BFFF'],
    solar_flare:       ['#FF4D2A', '#FFB86C', '#FFD700'],
    earth_core:        ['#C4A035', '#8B6914', '#FFD700'],
    silver_echo:       ['#E0E0FF', '#A0A0FF', '#8B00FF'],
    ocean_depth:       ['#0000FF', '#4B0082', '#4A6CF7'],
    void_seed:         ['#1A0040', '#8B5CF6', '#4B0082'],
    lunar_peak:        ['#FFD700', '#E0E0FF', '#8B5CF6'],
    shadow_work:       ['#1A1A2E', '#4B0082', '#8B00FF'],
    grounding_crystal: ['#FFD700', '#8B6914', '#4CAF50'],
  };

  function pickVisualMatch(blueprint, cosmic) {
    if (cosmic.kp >= 6)
      return { pattern: 'voidCrystal', palette: 'grounding_crystal', reason: 'kp_high' };
    if (cosmic.events?.some(e => e.type === 'eclipse'))
      return { pattern: 'voidCrystal', palette: 'shadow_work', reason: 'eclipse' };
    if (cosmic.moon?.phase === 'full')
      return { pattern: 'mandelbulb', palette: 'lunar_peak', reason: 'full_moon' };
    if (cosmic.moon?.phase === 'new')
      return { pattern: 'mandelbulb', palette: 'void_seed', reason: 'new_moon' };
    if (cosmic.events?.some(e => e.type === 'retrograde' && e.planet === 'mercury'))
      return { pattern: 'kaleido', palette: 'silver_echo', reason: 'mercury_retrograde' };
    const dm = blueprint.saju?.dayMasterElement || blueprint.saju?.dayMaster;
    return { ...(VISUAL_BY_DAYMASTER[dm] || { pattern: 'hyperBloom', palette: 'forest_bloom' }), reason: 'day_master' };
  }

  // ─── Biorhythm ────────────────────────────────────────────────────────────
  function biorhythm(birthDate, today) {
    const days = Math.floor((today - birthDate) / 86400000);
    return {
      physical:     Math.round(Math.sin(2 * Math.PI * days / 23) * 100),
      emotional:    Math.round(Math.sin(2 * Math.PI * days / 28) * 100),
      intellectual: Math.round(Math.sin(2 * Math.PI * days / 33) * 100),
      days,
    };
  }

  function biorhythmLabel(v, lang) {
    const ko = lang === 'ko';
    if (Math.abs(v) < 5) return { label: ko ? '크리티컬' : 'Critical', color: '#FFB86C' };
    if (v > 50)  return { label: ko ? '고점' : 'High',  color: '#4ADE80' };
    if (v > 0)   return { label: ko ? '상승' : 'Rising', color: '#9B7FFF' };
    if (v > -50) return { label: ko ? '하강' : 'Falling', color: '#6EC8F5' };
    return { label: ko ? '저점' : 'Low', color: '#F87171' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function pretty(str) {
    return String(str || '').replace(/[_-]/g, ' ').replace(/\.[a-z0-9]+$/i, '');
  }

  async function listTracksInFolder(folder) {
    try {
      const res = await fetch(`/api/daily/tracks?folder=${encodeURIComponent(folder)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.tracks || [];
    } catch (e) {
      console.warn('[Daily] tracks fetch failed:', folder, e.message);
      return [];
    }
  }

  // ─── Main Component ───────────────────────────────────────────────────────
  function DailyResonance({ blueprint, user, lang, onBack, onPlayTrack }) {
    const [cosmic, setCosmic] = useState(null);
    const [cosmicErr, setCosmicErr] = useState(null);
    const [frequencyMatch, setFreqMatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [guide, setGuide] = useState(null);
    const [guideLoading, setGuideLoading] = useState(false);
    const [guideErr, setGuideErr] = useState(null);

    const today = useMemo(() => new Date(), []);
    const birthDate = useMemo(() => {
      if (!blueprint?.birth_year) return null;
      return new Date(blueprint.birth_year, blueprint.birth_month - 1, blueprint.birth_day);
    }, [blueprint]);

    const bio = useMemo(() => birthDate ? biorhythm(birthDate, today) : null, [birthDate, today]);

    // Load cosmic state
    useEffect(() => {
      fetch('/api/daily/cosmic')
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          if (data.error) throw new Error(data.error);
          if (!data.moon || !data.sun) throw new Error('Incomplete cosmic data');
          console.log('[Daily] cosmic loaded:', data);
          setCosmic(data);
          setLoading(false);
        })
        .catch(e => {
          console.error('[Daily] cosmic fetch failed:', e);
          setCosmicErr(e.message);
          setLoading(false);
        });
    }, []);

    // Compute frequency match once blueprint + cosmic + bio are ready
    // Cached by date + user so it stays stable for the day (including lang toggle)
    useEffect(() => {
      if (!blueprint || !cosmic || !bio) return;
      const cacheKey = `daily_freq_${user?.id || 'anon'}_${cosmic.date}`;
      const cached = (() => { try { return JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { return null; } })();
      if (cached) { setFreqMatch(cached); return; }

      (async () => {
        const { scores, reasons } = scoreCategories(blueprint, cosmic, bio);
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const topCat = sorted[0][1] > 0 ? sorted[0][0] : 'Divine_Tunes';
        const altCat = sorted[1]?.[0] || 'Chakra_Activation';

        const [primaryTracks, altTracks] = await Promise.all([
          listTracksInFolder(topCat),
          listTracksInFolder(altCat),
        ]);

        // Deterministic pick: hash user_id + date → stable index
        const seedStr = `${user?.id || 'anon'}${cosmic.date}${topCat}`;
        let seed = 0;
        for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
        const primary = primaryTracks.length > 0 ? primaryTracks[seed % primaryTracks.length] : null;
        const alternatives = altTracks.slice(0, 2);

        const match = {
          primary: primary ? { folder: topCat, file: primary, score: scores[topCat] } : null,
          alternatives: alternatives.map(f => ({ folder: altCat, file: f })),
          reasons,
          topScore: scores[topCat],
        };
        setFreqMatch(match);
        try { localStorage.setItem(cacheKey, JSON.stringify(match)); } catch {}
      })();
      // Stable deps: date + user.id + availability flags (avoid identity-triggered re-runs)
    }, [cosmic?.date, user?.id, !!blueprint, !!bio]);

    const visualMatch = useMemo(() =>
      blueprint && cosmic ? pickVisualMatch(blueprint, cosmic) : null,
    [blueprint, cosmic]);

    // Load existing daily guide from DB
    useEffect(() => {
      if (!user?.id) return;
      fetch(`/api/daily/guide/${user.id}`)
        .then(r => r.json())
        .then(d => { if (d.guide?.ai_guide) setGuide(d.guide); })
        .catch(() => {});
    }, [user?.id]);

    const handleGenerateGuide = useCallback(async (regenerate = false) => {
      if (guideLoading) return;
      if (!user?.id) {
        setGuideErr(lang === 'ko' ? '로그인이 필요합니다. 앱에서 다시 로그인해주세요.' : 'Please sign in first.');
        return;
      }
      setGuideLoading(true); setGuideErr(null);
      console.log('[Daily Guide] generating for user=', user.id, 'regen=', regenerate);
      try {
        // Include blueprint data so server can auto-save if missing in DB
        const bpPayload = blueprint ? {
          birth_year: blueprint.birth_year,
          birth_month: blueprint.birth_month,
          birth_day: blueprint.birth_day,
          birth_time: blueprint.birth_time || null,
          birth_place: blueprint.birth_place || null,
          calendar_type: blueprint.calendar_type || 'solar',
          name: blueprint.name || null,
          gender: blueprint.gender || null,
          blood_type: blueprint.blood_type || null,
          mbti: blueprint.mbti || null,
          zodiac: blueprint.zodiac || null,
          life_path: blueprint.life_path || null,
          saju: blueprint.saju || null,
          starseed: blueprint.starseed || null,
          personal_freq: blueprint.personal_freq || null,
        } : null;

        const res = await fetch('/api/daily/guide/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, regenerate, blueprint: bpPayload }),
        });
        const data = await res.json();
        console.log('[Daily Guide] response:', res.status, data);
        if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
        setGuide(data.guide);
      } catch (e) {
        console.error('[Daily Guide] error:', e);
        setGuideErr(e.message);
      }
      setGuideLoading(false);
    }, [user?.id, guideLoading, lang]);

    const L = lang === 'ko' ? 'ko' : 'en';
    const t = (ko, en) => L === 'ko' ? ko : en;

    if (loading) {
      return React.createElement('div', { style: styles.container },
        React.createElement('div', { style: styles.loading }, t('우주를 읽고 있어요...', 'Reading the cosmos...'))
      );
    }

    if (!blueprint) {
      return React.createElement('div', { style: styles.container },
        React.createElement('div', { style: styles.empty },
          React.createElement('div', { style: { fontSize: 48, marginBottom: 16 } }, '✦'),
          React.createElement('div', { style: { fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#F0F0FF' } }, t('먼저 소울코드 분석을 완료해주세요', 'Complete your Soul Code analysis first')),
          React.createElement('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20 } }, t('오늘의 공명은 당신의 영혼 청사진 위에 그려집니다.', 'Daily Resonance is drawn from your soul blueprint.')),
          React.createElement('button', {
            onClick: onBack,
            style: styles.btnPrimary,
          }, t('분석 시작하기', 'Start Analysis'))
        )
      );
    }

    const todayStr = cosmic?.date || '';
    const kstDate = todayStr ? new Date(todayStr + 'T00:00:00+09:00') : today;
    const weekday = kstDate.toLocaleDateString(L === 'ko' ? 'ko-KR' : 'en-US', { weekday: 'long' });

    return React.createElement('div', { style: styles.container },
      // Header
      React.createElement('div', { style: styles.header },
        React.createElement('div', { style: styles.dateLabel },
          `${kstDate.getMonth() + 1}${L === 'ko' ? '월 ' : '/'}${kstDate.getDate()}${L === 'ko' ? '일' : ''} · ${weekday}`
        ),
        React.createElement('div', { style: styles.titleBig }, t('오늘의 공명', 'Today\'s Resonance')),
        React.createElement('div', { style: styles.subtle }, t(`${blueprint.name || '친애하는 영혼'}님`, `Dear ${blueprint.name || 'soul'}`)),
      ),

      // Card 1: Coordinate
      cosmic && React.createElement(CoordinateCard, { cosmic, lang: L, t }),

      // Card 2: Biorhythm
      bio && React.createElement(BiorhythmCard, { bio, lang: L, t }),

      // Card 3: Frequency Match
      frequencyMatch && React.createElement(FrequencyCard, {
        match: frequencyMatch, cosmic, lang: L, t, onPlayTrack,
      }),

      // Card 4: Visual Match
      visualMatch && React.createElement(VisualCard, { match: visualMatch, lang: L, t }),

      // Card 5: AI Life Guide
      React.createElement(GuideCard, {
        guide, loading: guideLoading, error: guideErr,
        onGenerate: () => handleGenerateGuide(false),
        onRegenerate: () => handleGenerateGuide(true),
        lang: L, t,
      }),

      // Error hint
      cosmicErr && React.createElement('div', { style: { ...styles.card, color: '#F87171' } },
        t('우주 데이터를 불러올 수 없어요.', 'Could not load cosmic data.')
      ),

      // Integrated Ritual Action Bar
      frequencyMatch?.primary && visualMatch && React.createElement(RitualBar, {
        track: frequencyMatch.primary,
        visual: visualMatch,
        mantra: guide?.ai_guide?.mantra,
        onPlayTrack, lang: L, t,
      }),

      // Back button (bottom)
      React.createElement('div', { style: { padding: '16px 20px 40px', textAlign: 'center' } },
        React.createElement('button', { onClick: onBack, style: styles.btnGhost },
          t('← 분석 화면으로', '← Back to Analysis')
        )
      ),
    );
  }

  // ─── Card 1: Coordinate ───────────────────────────────────────────────────
  function CoordinateCard({ cosmic, lang, t }) {
    const signName = (s) => s?.[lang] || s?.en || '';
    const moonPhaseName = lang === 'ko' ? cosmic.moon?.name_ko : cosmic.moon?.name_en;
    const retros = (cosmic.events || []).filter(e => e.type === 'retrograde');
    const eclipses = (cosmic.events || []).filter(e => e.type === 'eclipse');

    return React.createElement('div', { style: styles.card },
      React.createElement('div', { style: styles.cardLabel }, t('01 · 오늘의 좌표', '01 · Today\'s Coordinate')),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 } },
        // Sun
        React.createElement('div', { style: styles.coordItem },
          React.createElement('span', { style: { fontSize: 24 } }, '☀️'),
          React.createElement('div', null,
            React.createElement('div', { style: styles.coordLabel }, t('태양', 'Sun')),
            React.createElement('div', { style: styles.coordValue },
              `${cosmic.sun?.sign?.symbol || ''} ${signName(cosmic.sun?.sign)}`
            )
          )
        ),
        // Moon
        React.createElement('div', { style: styles.coordItem },
          React.createElement('span', { style: { fontSize: 24 } }, '🌙'),
          React.createElement('div', null,
            React.createElement('div', { style: styles.coordLabel }, t('달', 'Moon')),
            React.createElement('div', { style: styles.coordValue },
              `${cosmic.moon?.sign?.symbol || ''} ${signName(cosmic.moon?.sign)}`
            ),
            React.createElement('div', { style: { ...styles.coordLabel, marginTop: 2 } },
              `${moonPhaseName} · ${cosmic.moon?.illumination || 0}%`
            ),
          )
        ),
      ),
      // Events
      (retros.length > 0 || eclipses.length > 0) && React.createElement('div', { style: styles.eventsRow },
        retros.map((r, i) => React.createElement('div', { key: `r${i}`, style: styles.eventBadge },
          t(`☿ ${r.planet === 'mercury' ? '수성' : r.planet} 역행`, `☿ ${r.planet} retrograde`)
        )),
        eclipses.map((e, i) => React.createElement('div', { key: `e${i}`, style: styles.eventBadge },
          t(`${e.kind === 'solar' ? '일식' : '월식'} 시즌`, `${e.kind} eclipse`)
        )),
      ),
      // Kp
      cosmic.kp !== null && cosmic.kp !== undefined ?
        React.createElement('div', { style: styles.kpRow },
          React.createElement('span', { style: styles.coordLabel }, t('지자기 Kp', 'Geomagnetic Kp')),
          React.createElement('span', { style: { ...styles.coordValue, color: cosmic.kp >= 6 ? '#F87171' : cosmic.kp >= 4 ? '#FFB86C' : '#4ADE80' } },
            `${cosmic.kp} ${cosmic.kp >= 6 ? t('(폭풍)', '(storm)') : cosmic.kp >= 4 ? t('(활성)', '(active)') : t('(차분함)', '(calm)')}`
          )
        ) :
        React.createElement('div', { style: styles.kpRow },
          React.createElement('span', { style: styles.coordLabel }, t('지자기 Kp', 'Geomagnetic Kp')),
          React.createElement('span', { style: styles.coordLabel }, t('측정 불가', 'N/A'))
        ),
    );
  }

  // ─── Card 2: Biorhythm ────────────────────────────────────────────────────
  function BiorhythmCard({ bio, lang, t }) {
    // Build SVG wave graph (-15 to +15 days around today)
    const days = 15;
    const width = 320, height = 120;
    const midY = height / 2;

    const buildPath = (period) => {
      let d = '';
      for (let i = -days; i <= days; i++) {
        const dayOffset = bio.days + i;
        const y = Math.sin(2 * Math.PI * dayOffset / period) * (midY - 10);
        const x = ((i + days) / (days * 2)) * width;
        d += (i === -days ? 'M' : 'L') + ` ${x.toFixed(1)} ${(midY - y).toFixed(1)} `;
      }
      return d;
    };

    const rows = [
      { key: 'physical', label: t('신체', 'Physical'), value: bio.physical, color: '#4ADE80', period: 23 },
      { key: 'emotional', label: t('감정', 'Emotional'), value: bio.emotional, color: '#FF6B9D', period: 28 },
      { key: 'intellectual', label: t('지성', 'Intellectual'), value: bio.intellectual, color: '#9B7FFF', period: 33 },
    ];

    return React.createElement('div', { style: styles.card },
      React.createElement('div', { style: styles.cardLabel }, t('02 · 오늘의 리듬', '02 · Today\'s Rhythm')),
      // SVG graph
      React.createElement('svg', { width, height, style: { display: 'block', margin: '0 auto 14px', maxWidth: '100%' } },
        // Center line
        React.createElement('line', { x1: 0, y1: midY, x2: width, y2: midY, stroke: 'rgba(255,255,255,0.15)', strokeDasharray: '2 4' }),
        // Today marker
        React.createElement('line', { x1: width / 2, y1: 0, x2: width / 2, y2: height, stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }),
        // Waves
        rows.map(r => React.createElement('path', {
          key: r.key, d: buildPath(r.period),
          stroke: r.color, strokeWidth: 2, fill: 'none', opacity: 0.8,
        })),
        // Today dots
        rows.map(r => {
          const y = midY - Math.sin(2 * Math.PI * bio.days / r.period) * (midY - 10);
          return React.createElement('circle', {
            key: r.key + '_dot', cx: width / 2, cy: y, r: 4,
            fill: r.color, stroke: '#fff', strokeWidth: 1,
          });
        }),
      ),
      // Rows
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        rows.map(r => {
          const info = biorhythmLabel(r.value, lang);
          return React.createElement('div', { key: r.key, style: styles.bioRow },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('div', { style: { width: 10, height: 10, borderRadius: '50%', background: r.color } }),
              React.createElement('span', { style: styles.coordLabel }, r.label),
            ),
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('span', { style: { ...styles.coordValue, color: info.color } },
                `${r.value > 0 ? '+' : ''}${r.value}%`),
              React.createElement('span', { style: { ...styles.eventBadge, fontSize: 10, background: info.color + '22', borderColor: info.color + '55', color: info.color } },
                info.label),
            ),
          );
        }),
      ),
    );
  }

  // ─── Card 3: Frequency Match ──────────────────────────────────────────────
  function FrequencyCard({ match, cosmic, lang, t, onPlayTrack }) {
    const reasonText = (reasons, topCat) => {
      const relevant = (reasons || []).filter(r => r.cat === topCat);
      if (relevant.length === 0) return t('당신의 청사진과 오늘의 흐름이 만나는 지점', 'Where your blueprint meets today');
      const r = relevant[0];
      const labels = {
        saju_deficient: t('사주에서 부족한 오행을 보강하는 공명', 'Replenishing your deficient element'),
        bio_physical_critical: t('신체 바이오리듬 크리티컬 — 몸을 돌보는 주파수', 'Physical critical — a frequency for the body'),
        bio_emotional_critical: t('감정 바이오리듬 크리티컬 — 하트 차크라 균형', 'Emotional critical — heart chakra balance'),
        bio_intellectual_critical: t('지성 바이오리듬 크리티컬 — 뇌파 유도', 'Intellectual critical — brainwave entrainment'),
        moon_phase: t('달의 위상에 맞춘 공명', 'Aligned with the moon phase'),
        mercury_retrograde: t('수성 역행 — 속도를 늦추고 내면으로', 'Mercury retrograde — slow down, go inward'),
        eclipse: t('일월식 시즌 — 그림자를 마주할 때', 'Eclipse season — facing the shadow'),
        kp_high: t('지자기 폭풍 — 보호막 공명', 'Geomagnetic storm — a shield'),
      };
      return labels[r.kind] || t('오늘의 공명', 'Today\'s resonance');
    };

    if (!match.primary) {
      return React.createElement('div', { style: styles.card },
        React.createElement('div', { style: styles.cardLabel }, t('03 · 오늘의 주파수', '03 · Today\'s Frequency')),
        React.createElement('div', { style: { color: 'rgba(255,255,255,0.5)' } }, t('주파수를 찾는 중...', 'Finding your frequency...'))
      );
    }

    const mediaBase = 'https://xdjgumqdwedgzwqturcx.supabase.co/storage/v1/object/public/media';
    // Preserve underscores in filename (pretty() is for display only)
    const fileStem = match.primary.file.replace(/\.[^.]+$/, '');
    const thumbSuffix = lang === 'en' ? '_E' : '';
    const thumbBase = `${mediaBase}/${encodeURIComponent(match.primary.folder)}/${encodeURIComponent(fileStem + thumbSuffix)}.webp`;
    const trackTitle = pretty(match.primary.file);
    const folderLabel = match.primary.folder.replace(/_/g, ' ');

    return React.createElement('div', { style: styles.card },
      React.createElement('div', { style: styles.cardLabel }, t('03 · 오늘의 주파수', '03 · Today\'s Frequency')),
      React.createElement('div', { style: { display: 'flex', gap: 14, marginBottom: 14 } },
        React.createElement('div', {
          style: {
            width: 96, height: 96, borderRadius: 12, flexShrink: 0,
            background: `url(${thumbBase}) center/cover, linear-gradient(135deg, #7C5CFC, #3ECFCF)`,
            border: '1px solid rgba(139,92,246,0.3)',
          }
        }),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', { style: { fontSize: 12, color: '#9B7FFF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 } }, folderLabel),
          React.createElement('div', { style: { fontSize: 17, fontWeight: 700, color: '#F0F0FF', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis' } }, trackTitle),
          React.createElement('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 } }, reasonText(match.reasons, match.primary.folder)),
        ),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('button', {
          onClick: () => onPlayTrack && onPlayTrack(match.primary),
          style: { ...styles.btnPrimary, flex: 1 },
        }, t('▶ 재생', '▶ Play')),
        match.alternatives?.length > 0 && React.createElement('button', {
          onClick: () => onPlayTrack && onPlayTrack(match.alternatives[0]),
          style: styles.btnGhost,
        }, t('+ 대체', '+ Alternative')),
      ),
    );
  }

  // ─── Card 4: Visual Match ─────────────────────────────────────────────────
  function VisualCard({ match, lang, t }) {
    const colors = PALETTES[match.palette] || ['#7C5CFC', '#3ECFCF', '#FF6B9D'];
    const patternNames = {
      mandelbulb:  { ko: '만델벌브',       en: 'Mandelbulb' },
      juliaWarp:   { ko: '줄리아 워프',    en: 'Julia Warp' },
      kaleido:     { ko: '만화경',          en: 'Kaleidoscope' },
      voidCrystal: { ko: '보이드 크리스탈', en: 'Void Crystal' },
      dmtTunnel:   { ko: 'DMT 터널',        en: 'DMT Tunnel' },
      hyperBloom:  { ko: '하이퍼 블룸',    en: 'Hyper Bloom' },
    };
    const paletteNames = {
      forest_bloom: { ko: '포레스트 블룸', en: 'Forest Bloom' },
      solar_flare:  { ko: '솔라 플레어',    en: 'Solar Flare' },
      earth_core:   { ko: '어스 코어',      en: 'Earth Core' },
      silver_echo:  { ko: '실버 에코',      en: 'Silver Echo' },
      ocean_depth:  { ko: '오션 뎁스',      en: 'Ocean Depth' },
      void_seed:    { ko: '보이드 시드',    en: 'Void Seed' },
      lunar_peak:   { ko: '루나 피크',      en: 'Lunar Peak' },
      shadow_work:  { ko: '섀도우 워크',    en: 'Shadow Work' },
      grounding_crystal: { ko: '그라운딩 크리스탈', en: 'Grounding Crystal' },
    };
    const reasonLabels = {
      kp_high: t('지자기 폭풍에 대응한 그라운딩', 'Grounding against geomagnetic storm'),
      eclipse: t('일월식 그림자 작업', 'Eclipse shadow work'),
      full_moon: t('보름달의 절정 에너지', 'Peak full moon energy'),
      new_moon: t('신월의 씨앗 에너지', 'New moon seed energy'),
      mercury_retrograde: t('수성 역행의 성찰 거울', 'Mercury retrograde reflection'),
      day_master: t('당신의 일주 오행에 맞춰', 'Aligned with your day master element'),
    };

    return React.createElement('div', { style: styles.card },
      React.createElement('div', { style: styles.cardLabel }, t('04 · 오늘의 비주얼', '04 · Today\'s Visual')),
      React.createElement('div', {
        style: {
          height: 160, borderRadius: 14, marginBottom: 14,
          background: `radial-gradient(circle at 30% 30%, ${colors[0]}88, transparent 60%), radial-gradient(circle at 70% 70%, ${colors[1]}88, transparent 60%), radial-gradient(circle at 50% 50%, ${colors[2]}55, #0a0a15)`,
          border: '1px solid rgba(139,92,246,0.2)',
          position: 'relative', overflow: 'hidden',
        }
      },
        React.createElement('div', {
          style: {
            position: 'absolute', inset: 0,
            background: `conic-gradient(from 0deg, ${colors.join(',')}, ${colors[0]})`,
            opacity: 0.15, animation: 'spin 30s linear infinite',
          }
        }),
      ),
      React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('div', { style: { fontSize: 17, fontWeight: 700, color: '#F0F0FF' } },
          patternNames[match.pattern]?.[lang] || match.pattern,
          React.createElement('span', { style: { color: 'rgba(255,255,255,0.3)', margin: '0 8px' } }, '×'),
          paletteNames[match.palette]?.[lang] || match.palette,
        ),
        React.createElement('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 } },
          reasonLabels[match.reason] || ''),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 6 } },
        colors.map((c, i) => React.createElement('div', {
          key: i, style: { flex: 1, height: 6, borderRadius: 3, background: c, boxShadow: `0 0 8px ${c}` }
        }))
      ),
    );
  }

  // ─── Card 5: AI Life Guide ────────────────────────────────────────────────
  function GuideCard({ guide, loading, error, onGenerate, onRegenerate, lang, t }) {
    const ai = guide?.ai_guide;
    const regenCount = guide?.ai_regen_count || 0;
    const regenRemain = Math.max(0, 3 - regenCount);
    const pickLang = (obj) => obj?.[lang] || obj?.en || obj?.ko || '';

    if (loading) {
      return React.createElement('div', { style: styles.card },
        React.createElement('div', { style: styles.cardLabel }, t('05 · 오늘의 가이던스 ✨', '05 · Today\'s Guidance ✨')),
        React.createElement('div', { style: { textAlign: 'center', padding: '30px 0', color: 'rgba(255,255,255,0.5)', fontSize: 13 } },
          React.createElement('div', { style: { fontSize: 32, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' } }, '✨'),
          t('우주의 메시지를 받고 있어요...', 'Receiving cosmic message...')
        )
      );
    }

    if (error) {
      return React.createElement('div', { style: styles.card },
        React.createElement('div', { style: styles.cardLabel }, t('05 · 오늘의 가이던스 ✨', '05 · Today\'s Guidance ✨')),
        React.createElement('div', { style: { color: '#F87171', fontSize: 13, marginBottom: 10 } }, error),
        React.createElement('button', { onClick: onGenerate, style: styles.btnGhost },
          t('다시 시도', 'Try again')
        )
      );
    }

    if (!ai) {
      return React.createElement('div', { style: styles.card },
        React.createElement('div', { style: styles.cardLabel }, t('05 · 오늘의 가이던스 ✨', '05 · Today\'s Guidance ✨')),
        React.createElement('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16, lineHeight: 1.6 } },
          t('당신의 영혼 청사진과 오늘의 우주 기류가 만나는 지점에서 현자의 조언을 길어올립니다.',
            'From the confluence of your soul blueprint and today\'s cosmic current, a sage\'s whisper rises.')
        ),
        React.createElement('button', { onClick: onGenerate, style: { ...styles.btnPrimary, width: '100%' } },
          t('✨ 오늘의 가이던스 받기', '✨ Receive Today\'s Guidance')
        )
      );
    }

    const sections = [
      { key: 'morning',   icon: '🌅', label: t('아침', 'Morning'),   text: pickLang(ai.morning) },
      { key: 'afternoon', icon: '☀️', label: t('오후', 'Afternoon'), text: pickLang(ai.afternoon) },
      { key: 'evening',   icon: '🌙', label: t('저녁', 'Evening'),   text: pickLang(ai.evening) },
    ];

    return React.createElement('div', { style: styles.card },
      React.createElement('div', { style: styles.cardLabel }, t('05 · 오늘의 가이던스 ✨', '05 · Today\'s Guidance ✨')),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 } },
        sections.map(s => React.createElement('div', { key: s.key, style: { display: 'flex', gap: 12 } },
          React.createElement('div', { style: { fontSize: 20, flexShrink: 0 } }, s.icon),
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 11, color: '#9B7FFF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 } }, s.label),
            React.createElement('div', { style: { fontSize: 14, color: '#F0F0FF', lineHeight: 1.55 } }, s.text),
          )
        )),
        // Mantra
        ai.mantra && React.createElement('div', {
          style: {
            marginTop: 6, padding: '14px 16px',
            background: 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(139,92,246,0.08))',
            border: '1px solid rgba(255,215,0,0.25)', borderRadius: 12,
          }
        },
          React.createElement('div', { style: { fontSize: 11, color: '#FFD700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 } },
            `📿 ${t('오늘의 만트라', 'Today\'s Mantra')}`),
          React.createElement('div', { style: { fontSize: 15, fontWeight: 600, color: '#F0F0FF', fontStyle: 'italic', lineHeight: 1.5 } },
            `"${pickLang(ai.mantra)}"`),
        ),
      ),
      // Regen button
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' } },
        React.createElement('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)' } },
          t(`다시 생성 ${regenRemain}/3 남음`, `Regen ${regenRemain}/3 left`)),
        React.createElement('button', {
          onClick: onRegenerate,
          disabled: regenRemain === 0,
          style: { ...styles.btnGhost, opacity: regenRemain === 0 ? 0.35 : 1, cursor: regenRemain === 0 ? 'default' : 'pointer', padding: '8px 14px', fontSize: 12 },
        }, regenRemain === 0 ? t('내일 다시', 'Try tomorrow') : t('🔄 다시 생성', '🔄 Regenerate')),
      )
    );
  }

  // ─── Ritual Action Bar ────────────────────────────────────────────────────
  function RitualBar({ track, visual, mantra, onPlayTrack, lang, t }) {
    const [active, setActive] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const duration = 20 * 60; // 20 minutes
    const pickLang = (obj) => obj?.[lang] || obj?.en || obj?.ko || '';

    useEffect(() => {
      if (!active) return;
      const timer = setInterval(() => setElapsed(e => e + 1), 1000);
      return () => clearInterval(timer);
    }, [active]);

    useEffect(() => {
      if (elapsed >= duration) setActive(false);
    }, [elapsed]);

    const startRitual = useCallback(() => {
      setElapsed(0);
      setActive(true);
      // Play track in background without switching tabs (stay in Soul Code)
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'playTrack', folder: track.folder, file: track.file, keepTab: true
        }, '*');
      }
    }, [track]);

    const mmss = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    const colors = PALETTES[visual.palette] || ['#7C5CFC', '#3ECFCF'];

    if (!active) {
      return React.createElement('div', {
        onClick: startRitual,
        style: {
          position: 'sticky', bottom: 10, margin: '20px 0 0', padding: '18px 20px',
          background: `linear-gradient(135deg, ${colors[0]}40, ${colors[1]}40)`,
          border: `1px solid ${colors[0]}80`, borderRadius: 16,
          cursor: 'pointer', textAlign: 'center',
          backdropFilter: 'blur(10px)', boxShadow: `0 8px 32px ${colors[0]}30`,
          transition: 'transform 0.2s',
        },
        onMouseOver: (e) => e.currentTarget.style.transform = 'scale(1.02)',
        onMouseOut: (e) => e.currentTarget.style.transform = 'scale(1)',
      },
        React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: '#F0F0FF', letterSpacing: 1 } },
          t('✦ 오늘의 의식 시작 · 20분', '✦ Begin Today\'s Ritual · 20 min')),
        React.createElement('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4 } },
          t('주파수 · 비주얼 · 만트라가 하나로', 'Frequency · Visual · Mantra as one'))
      );
    }

    // Active ritual overlay
    return React.createElement('div', {
      style: {
        position: 'fixed', inset: 0, zIndex: 9999,
        background: `radial-gradient(ellipse at center, ${colors[0]}55, #000)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, backdropFilter: 'blur(4px)',
      }
    },
      // Animated backdrop
      React.createElement('div', {
        style: {
          position: 'absolute', inset: 0,
          background: `conic-gradient(from 0deg, ${colors.join(',')}, ${colors[0]})`,
          opacity: 0.12, animation: 'spin 60s linear infinite',
        }
      }),
      // Mantra
      mantra && React.createElement('div', {
        style: {
          position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 560, marginBottom: 40,
          fontSize: 'clamp(22px, 5vw, 36px)', fontWeight: 300, fontStyle: 'italic',
          color: '#F0F0FF', lineHeight: 1.5, letterSpacing: 0.5,
          textShadow: `0 0 30px ${colors[0]}`,
          animation: 'fadeIn 3s ease-out',
        }
      }, `"${pickLang(mantra)}"`),
      // Timer
      React.createElement('div', { style: { position: 'relative', zIndex: 2, fontSize: 52, fontWeight: 200, color: '#F0F0FF', letterSpacing: 4, opacity: 0.85 } },
        mmss(duration - elapsed)),
      React.createElement('div', { style: { position: 'relative', zIndex: 2, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 10, letterSpacing: 2, textTransform: 'uppercase' } },
        t('호흡을 따라가세요', 'Follow your breath')),
      // End button
      React.createElement('button', {
        onClick: () => {
          setActive(false);
          // Stop track on end
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'stopTrack' }, '*');
          }
        },
        style: {
          position: 'absolute', top: 20, right: 20, zIndex: 3,
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 24, padding: '8px 16px', color: '#F0F0FF', fontSize: 12, cursor: 'pointer',
          backdropFilter: 'blur(8px)',
        }
      }, t('✕ 종료', '✕ End')),
    );
  }

  // ─── Styles ───────────────────────────────────────────────────────────────
  const styles = {
    container: {
      maxWidth: 560, margin: '0 auto', padding: '16px 16px 60px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif',
    },
    header: { textAlign: 'center', marginBottom: 24, padding: '12px 0' },
    dateLabel: { fontSize: 12, color: '#9B7FFF', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 },
    titleBig: {
      fontSize: 30, fontWeight: 800, letterSpacing: -1,
      background: 'linear-gradient(135deg, #9B7FFF, #3ECFCF)',
      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
      marginBottom: 4,
    },
    subtle: { fontSize: 13, color: 'rgba(255,255,255,0.5)' },
    card: {
      background: 'linear-gradient(170deg, rgba(26,26,46,0.8), rgba(15,10,37,0.8))',
      border: '1px solid rgba(139,92,246,0.2)',
      borderRadius: 18, padding: '20px 18px', marginBottom: 14,
      backdropFilter: 'blur(8px)',
    },
    cardLabel: { fontSize: 11, color: '#9B7FFF', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 },
    coordItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 },
    coordLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 },
    coordValue: { fontSize: 14, fontWeight: 600, color: '#F0F0FF' },
    eventsRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    eventBadge: {
      fontSize: 11, padding: '5px 10px', borderRadius: 10,
      background: 'rgba(255,184,108,0.1)', border: '1px solid rgba(255,184,108,0.3)',
      color: '#FFB86C',
    },
    kpRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.08)' },
    bioRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px' },
    btnPrimary: {
      padding: '12px 24px', borderRadius: 10, border: 'none',
      background: 'linear-gradient(135deg, #7C5CFC, #5A3AD9)',
      color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      fontFamily: 'inherit',
    },
    btnGhost: {
      padding: '12px 18px', borderRadius: 10,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)',
      color: '#F0F0FF', fontSize: 13, fontWeight: 500, cursor: 'pointer',
      fontFamily: 'inherit',
    },
    loading: { textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.4)', fontSize: 14 },
    empty: { textAlign: 'center', padding: '60px 20px' },
  };

  // Inject keyframe once
  if (typeof document !== 'undefined' && !document.getElementById('daily-resonance-kf')) {
    const s = document.createElement('style');
    s.id = 'daily-resonance-kf';
    s.textContent = `
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(s);
  }

  // Export globally
  window.DailyResonance = DailyResonance;
})();
