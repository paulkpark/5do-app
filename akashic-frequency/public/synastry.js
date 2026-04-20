/* =============================================================================
   Synastry — Soul Code 관계 분석
   두 명의 Soul Code 블루프린트를 비교하여 관계 다이나믹 해석.
   Mounted inside akashic-frequency SPA as window.Synastry.
   ============================================================================= */

(function () {
  const { useState, useEffect, useMemo } = React;

  // ─── Sun sign from birth month/day (tropical zodiac boundaries) ───
  const ZODIAC_BOUNDARIES = [
    ['Capricorn', '염소자리', 1, 19, '흙', 'Earth'],
    ['Aquarius',  '물병자리', 2, 18, '공기', 'Air'],
    ['Pisces',    '물고기자리', 3, 20, '물', 'Water'],
    ['Aries',     '양자리',   4, 19, '불', 'Fire'],
    ['Taurus',    '황소자리', 5, 20, '흙', 'Earth'],
    ['Gemini',    '쌍둥이자리', 6, 20, '공기', 'Air'],
    ['Cancer',    '게자리',   7, 22, '물', 'Water'],
    ['Leo',       '사자자리', 8, 22, '불', 'Fire'],
    ['Virgo',     '처녀자리', 9, 22, '흙', 'Earth'],
    ['Libra',     '천칭자리', 10, 22, '공기', 'Air'],
    ['Scorpio',   '전갈자리', 11, 21, '물', 'Water'],
    ['Sagittarius','궁수자리', 12, 21, '불', 'Fire'],
    ['Capricorn', '염소자리', 12, 31, '흙', 'Earth'],
  ];
  function zodiacFromBirthday(month, day) {
    for (const [en, ko, m, d, eKo, eEn] of ZODIAC_BOUNDARIES) {
      if (month < m || (month === m && day <= d)) {
        return { en, ko, element_ko: eKo, element_en: eEn };
      }
    }
    return { en: 'Capricorn', ko: '염소자리', element_ko: '흙', element_en: 'Earth' };
  }

  // ─── Element compatibility (zodiac, symbolic) ───
  const ELEMENT_MATRIX = {
    Fire: { Fire:'공명', Earth:'길들임', Air:'확장', Water:'긴장' },
    Earth:{ Fire:'길들임', Earth:'안정', Air:'대조', Water:'양육' },
    Air:  { Fire:'확장', Earth:'대조', Air:'공명', Water:'흐림' },
    Water:{ Fire:'긴장', Earth:'양육', Air:'흐림', Water:'공명' },
  };
  const ELEMENT_MATRIX_EN = {
    Fire: { Fire:'resonance', Earth:'grounding', Air:'amplifying', Water:'tension' },
    Earth:{ Fire:'grounding', Earth:'stable', Air:'contrast', Water:'nurturing' },
    Air:  { Fire:'amplifying', Earth:'contrast', Air:'resonance', Water:'dissolving' },
    Water:{ Fire:'tension', Earth:'nurturing', Air:'dissolving', Water:'resonance' },
  };

  // ─── Age gap archetype ───
  function ageGapArchetype(ageA, ageB, lang) {
    const gap = Math.abs(ageA - ageB);
    if (gap <= 2)  return lang === 'en' ? 'Peer mirror'     : '동세대 거울';
    if (gap <= 6)  return lang === 'en' ? 'Close generation': '가까운 세대';
    if (gap <= 12) return lang === 'en' ? 'Generational bridge' : '세대 다리';
    return lang === 'en' ? 'Elder·student dynamic' : '멘토·배움 다이나믹';
  }

  // ─── MBTI pairing quick-note ───
  const MBTI_COMPAT = {
    'INFJ-ENFP':'magnetic', 'INFJ-ENTP':'stimulating', 'INFJ-INTJ':'resonant',
    'INTJ-ENFP':'expansive', 'INTJ-ENTP':'sharpening',
    'INFP-ENFJ':'flowing', 'INTP-ENTJ':'complementary',
    'ESFJ-ISFP':'warm', 'ESTJ-ISTP':'grounded',
  };

  // ─── Main component ───
  function Synastry({ blueprint, user, lang, onBack, onPlayTrack }) {
    const L = lang === 'en' ? 'en' : 'ko';
    const [form, setForm] = useState({
      name: '',
      year: '',
      month: '',
      day: '',
      mbti: '',
      gender: '',
    });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    // Self snapshot from blueprint
    const self = useMemo(() => {
      const m = blueprint?.birth_month || 1;
      const d = blueprint?.birth_day || 1;
      const z = zodiacFromBirthday(m, d);
      return {
        name: blueprint?.name || (L === 'en' ? 'You' : '당신'),
        year: blueprint?.birth_year || null,
        month: m, day: d,
        zodiac: z,
        freq: blueprint?.personal_freq || null,
        starseed: blueprint?.starseed?.key || blueprint?.starseed?.name || '',
        mbti: blueprint?.mbti || '',
      };
    }, [blueprint, L]);

    const canSubmit = form.year && form.month && form.day && form.name;

    async function runAnalysis() {
      setError('');
      setLoading(true);
      try {
        const partnerZ = zodiacFromBirthday(+form.month, +form.day);
        const selfEl = self.zodiac.element_en;
        const partnerEl = partnerZ.element_en;
        const compatElKo = ELEMENT_MATRIX[selfEl][partnerEl];
        const compatElEn = ELEMENT_MATRIX_EN[selfEl][partnerEl];
        const age = self.year && form.year ? ageGapArchetype(self.year, +form.year, L) : null;

        const prompt = L === 'ko' ? `
당신은 5DO의 Soul Code 관계 분석가입니다. 두 영혼의 블루프린트를 받아 관계 다이나믹을 해석합니다.

## 본인
• 이름: ${self.name}
• 생년월일: ${self.year || '?'}-${String(self.month).padStart(2,'0')}-${String(self.day).padStart(2,'0')}
• 별자리: ${self.zodiac.ko} (${self.zodiac.element_ko} 원소)
• 개인 주파수: ${self.freq ? self.freq + ' Hz' : '미측정'}
• 스타시드: ${self.starseed || '미정'}
• MBTI: ${self.mbti || '미정'}

## 상대
• 이름: ${form.name}
• 생년월일: ${form.year}-${String(form.month).padStart(2,'0')}-${String(form.day).padStart(2,'0')}
• 별자리: ${partnerZ.ko} (${partnerZ.element_ko} 원소)
• MBTI: ${form.mbti || '미정'}
• 성별: ${form.gender || '미정'}

## 원소 관계: ${compatElKo}
${age ? '## 세대 관계: ' + age : ''}

# 출력 형식 (정확히 JSON만, 코드블록 없이):
{
  "headline": "두 문장 정도의 시적이고 강렬한 관계 요약 (15~30자)",
  "element_desc": "두 원소 조합(${selfEl}×${partnerEl})의 다이나믹 2~3문장",
  "archetype": "이 관계의 아키타입 이름 (예: 불꽃과 샘, 강과 숲)",
  "strengths": ["강점 1", "강점 2", "강점 3"],
  "challenges": ["주의할 점 1", "주의할 점 2"],
  "growth": "이 관계에서 두 영혼이 함께 성장할 수 있는 핵심 과제 (3~4문장)",
  "frequency_harmony": "두 사람이 함께 명상/힐링할 때 추천 주파수와 이유 (2~3문장)",
  "recommended_hz": 528,
  "mantra": "두 사람을 위한 짧은 만트라 한 줄 (한국어 시적 표현)"
}
`.trim() : `
You are 5DO's Soul Code relationship analyst. Interpret two soul blueprints and their relationship dynamic.

## You
• Name: ${self.name}
• Birthdate: ${self.year || '?'}-${String(self.month).padStart(2,'0')}-${String(self.day).padStart(2,'0')}
• Sun sign: ${self.zodiac.en} (${self.zodiac.element_en} element)
• Personal frequency: ${self.freq ? self.freq + ' Hz' : 'not set'}
• Starseed: ${self.starseed || 'unspecified'}
• MBTI: ${self.mbti || 'unspecified'}

## Partner
• Name: ${form.name}
• Birthdate: ${form.year}-${String(form.month).padStart(2,'0')}-${String(form.day).padStart(2,'0')}
• Sun sign: ${partnerZ.en} (${partnerZ.element_en} element)
• MBTI: ${form.mbti || 'unspecified'}
• Gender: ${form.gender || 'unspecified'}

## Element relation: ${compatElEn}
${age ? '## Generation: ' + age : ''}

# Output format (JSON only, no code fences):
{
  "headline": "Poetic 2-sentence relationship summary (8-15 words)",
  "element_desc": "The dynamic of the ${selfEl}×${partnerEl} element combination in 2-3 sentences",
  "archetype": "Name of this relationship's archetype (e.g., 'Flame & Spring', 'River & Forest')",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "challenges": ["challenge 1", "challenge 2"],
  "growth": "The core growth task both souls can pursue together (3-4 sentences)",
  "frequency_harmony": "Recommended frequency when meditating together and why (2-3 sentences)",
  "recommended_hz": 528,
  "mantra": "A short one-line mantra for the pair (poetic English)"
}
`.trim();

        const res = await fetch('/akashic-frequency/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1200,
            system: L === 'ko'
              ? '당신은 영성·점성학·주파수 치유에 조예 깊은 상담자입니다. 과장 없이 통찰력 있게 답하세요.'
              : 'You are a counselor deeply versed in spirituality, astrology, and frequency healing. Answer insightfully without overclaiming.',
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error('API unavailable');
        const text = data.content?.[0]?.text || '';
        // Strip any leading markdown code fences if the model ignored instructions
        const jsonStr = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
        let parsed;
        try { parsed = JSON.parse(jsonStr); }
        catch (e) {
          // Try to extract JSON substring
          const m = jsonStr.match(/\{[\s\S]*\}/);
          if (m) parsed = JSON.parse(m[0]);
          else throw e;
        }
        setResult({
          ...parsed,
          partner: { name: form.name, zodiac: partnerZ, year: +form.year, month: +form.month, day: +form.day, mbti: form.mbti, gender: form.gender },
          self,
          element_relation: L === 'ko' ? compatElKo : compatElEn,
          age_relation: age,
        });
      } catch (e) {
        console.error('[synastry]', e);
        setError(L === 'en'
          ? 'Could not generate synastry. Please try again in a moment.'
          : '시너스트리 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        setLoading(false);
      }
    }

    function reset() { setResult(null); setError(''); }

    // ─── Render ───
    const panelStyle = {
      background: 'rgba(35,28,65,0.85)',
      border: '1px solid rgba(139,92,246,0.22)',
      borderRadius: 18,
      padding: '22px 20px',
      marginBottom: 16,
      backdropFilter: 'blur(12px)',
    };
    const labelStyle = { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#B89EFF', marginBottom: 8, fontFamily: "'JetBrains Mono', monospace" };
    const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(15,10,35,0.6)', color: '#F5F0FF', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };

    if (!result) {
      // Form view
      return React.createElement('div', { style: { padding: '0 0 60px', animation: 'fadeUp 0.5s ease-out' } },
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 22 } },
          React.createElement('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 4, color: '#B89EFF', textTransform: 'uppercase', marginBottom: 10 } }, L === 'ko' ? '시너스트리' : 'SYNASTRY'),
          React.createElement('h2', { style: { fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: '#F5F0FF', margin: 0, letterSpacing: -0.5 } }, L === 'ko' ? '두 영혼의 공명' : 'Two Souls, One Resonance'),
          React.createElement('p', { style: { fontSize: 13, color: 'rgba(220,210,255,0.7)', marginTop: 10, lineHeight: 1.7, padding: '0 16px' } },
            L === 'ko'
              ? '당신의 Soul Code × 상대의 생년월일을 결합하여 관계의 다이나믹·강점·성장 과제·공명 주파수를 AI가 해석합니다.'
              : 'Combine your Soul Code with your partner\'s birthdate — AI interprets the relational dynamic, strengths, growth edges, and resonance frequencies.'),
        ),

        // Self summary card
        React.createElement('div', { style: { ...panelStyle, borderColor: 'rgba(139,92,246,0.3)' } },
          React.createElement('div', { style: labelStyle }, L === 'ko' ? '본인' : 'You'),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 } },
            React.createElement('div', { style: { fontSize: 20, fontWeight: 600, color: '#fff' } }, self.name),
            React.createElement('div', { style: { fontSize: 13, color: 'rgba(200,190,255,0.75)' } },
              self.zodiac[L] + ' · ' + self.zodiac['element_' + L] + (L === 'ko' ? ' 원소' : ' element'))),
          self.freq && React.createElement('div', { style: { fontSize: 11, color: 'rgba(180,160,255,0.55)', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" } }, self.freq + ' Hz · ' + (self.starseed || (L === 'ko' ? '스타시드 없음' : 'no starseed')) + (self.mbti ? ' · ' + self.mbti : '')),
        ),

        // Partner form card
        React.createElement('div', { style: panelStyle },
          React.createElement('div', { style: labelStyle }, L === 'ko' ? '상대 정보' : 'Partner Info'),
          React.createElement('input', { type: 'text', placeholder: L === 'ko' ? '이름' : 'Name', value: form.name, onChange: e => setForm({ ...form, name: e.target.value }), style: { ...inputStyle, marginBottom: 10 } }),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 } },
            React.createElement('input', { type: 'number', placeholder: L === 'ko' ? '년' : 'Year', min: 1920, max: 2030, value: form.year, onChange: e => setForm({ ...form, year: e.target.value }), style: inputStyle }),
            React.createElement('input', { type: 'number', placeholder: L === 'ko' ? '월' : 'Month', min: 1, max: 12, value: form.month, onChange: e => setForm({ ...form, month: e.target.value }), style: inputStyle }),
            React.createElement('input', { type: 'number', placeholder: L === 'ko' ? '일' : 'Day', min: 1, max: 31, value: form.day, onChange: e => setForm({ ...form, day: e.target.value }), style: inputStyle }),
          ),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
            React.createElement('select', { value: form.mbti, onChange: e => setForm({ ...form, mbti: e.target.value }), style: inputStyle },
              React.createElement('option', { value: '' }, L === 'ko' ? 'MBTI (선택)' : 'MBTI (optional)'),
              ...['INFP','INFJ','INTP','INTJ','ENFP','ENFJ','ENTP','ENTJ','ISFP','ISFJ','ISTP','ISTJ','ESFP','ESFJ','ESTP','ESTJ'].map(m => React.createElement('option', { key: m, value: m }, m)),
            ),
            React.createElement('select', { value: form.gender, onChange: e => setForm({ ...form, gender: e.target.value }), style: inputStyle },
              React.createElement('option', { value: '' }, L === 'ko' ? '성별 (선택)' : 'Gender (optional)'),
              React.createElement('option', { value: L === 'ko' ? '여성' : 'female' }, L === 'ko' ? '여성' : 'Female'),
              React.createElement('option', { value: L === 'ko' ? '남성' : 'male' }, L === 'ko' ? '남성' : 'Male'),
              React.createElement('option', { value: L === 'ko' ? '기타/논바이너리' : 'non-binary' }, L === 'ko' ? '기타/논바이너리' : 'Non-binary'),
            ),
          ),
        ),

        error && React.createElement('div', { style: { color: '#F87171', fontSize: 13, textAlign: 'center', padding: 10, background: 'rgba(248,113,113,0.08)', borderRadius: 10, marginBottom: 12 } }, error),

        React.createElement('button', {
          onClick: runAnalysis,
          disabled: !canSubmit || loading,
          style: {
            width: '100%', padding: 16, borderRadius: 14, border: 'none',
            background: canSubmit ? 'linear-gradient(135deg,#7C5CFC 0%,#B89EFF 50%,#3ECFCF 100%)' : 'rgba(139,92,246,0.2)',
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
            letterSpacing: 2, boxShadow: canSubmit ? '0 10px 30px rgba(124,92,252,0.35)' : 'none',
            opacity: loading ? 0.6 : 1,
          },
        }, loading ? (L === 'ko' ? '✦ 공명 분석 중...' : '✦ Analyzing resonance...') : (L === 'ko' ? '✦ 관계 공명 보기' : '✦ Reveal Synastry')),

        onBack && React.createElement('button', {
          onClick: onBack,
          style: { display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'rgba(200,190,255,0.5)', fontSize: 12, cursor: 'pointer', letterSpacing: 1 },
        }, L === 'ko' ? '← 영혼 분석으로 돌아가기' : '← Back to Soul Analysis'),
      );
    }

    // ─── Result view ───
    return React.createElement('div', { style: { padding: '0 0 60px', animation: 'fadeUp 0.6s ease-out' } },
      // Headline
      React.createElement('div', { style: { textAlign: 'center', marginBottom: 20 } },
        React.createElement('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 4, color: '#B89EFF', textTransform: 'uppercase', marginBottom: 12 } },
          self.name + '  ⟷  ' + result.partner.name),
        React.createElement('h2', { style: { fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 400, color: '#fff', margin: 0, lineHeight: 1.3, padding: '0 8px', background: 'linear-gradient(135deg,#B89EFF,#3ECFCF,#ffd24a)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } }, result.headline),
        React.createElement('div', { style: { marginTop: 16, fontSize: 11, letterSpacing: 3, color: 'rgba(180,160,255,0.7)', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' } },
          self.zodiac[L] + ' × ' + result.partner.zodiac[L] + ' · ' + result.element_relation),
      ),

      // Archetype
      React.createElement('div', { style: { ...panelStyle, textAlign: 'center', background: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.35)' } },
        React.createElement('div', { style: labelStyle }, L === 'ko' ? '관계 아키타입' : 'Relationship Archetype'),
        React.createElement('div', { style: { fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#fff', letterSpacing: -0.3 } }, result.archetype),
      ),

      // Element dynamic
      React.createElement('div', { style: panelStyle },
        React.createElement('div', { style: labelStyle }, L === 'ko' ? '원소의 춤' : 'Element Dance'),
        React.createElement('p', { style: { fontSize: 14, lineHeight: 1.75, color: 'rgba(230,225,255,0.9)', margin: 0 } }, result.element_desc),
      ),

      // Strengths + challenges
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 16 } },
        React.createElement('div', { style: { ...panelStyle, marginBottom: 0, borderColor: 'rgba(74,222,128,0.25)' } },
          React.createElement('div', { style: { ...labelStyle, color: '#4ADE80' } }, L === 'ko' ? '강점' : 'Strengths'),
          React.createElement('ul', { style: { margin: 0, paddingLeft: 20 } },
            (result.strengths || []).map((s, i) => React.createElement('li', { key: i, style: { fontSize: 13.5, color: 'rgba(230,225,255,0.88)', marginBottom: 6, lineHeight: 1.65 } }, s)),
          ),
        ),
        React.createElement('div', { style: { ...panelStyle, marginBottom: 0, borderColor: 'rgba(251,191,36,0.3)' } },
          React.createElement('div', { style: { ...labelStyle, color: '#fbbf24' } }, L === 'ko' ? '주의할 점' : 'Edges'),
          React.createElement('ul', { style: { margin: 0, paddingLeft: 20 } },
            (result.challenges || []).map((s, i) => React.createElement('li', { key: i, style: { fontSize: 13.5, color: 'rgba(230,225,255,0.88)', marginBottom: 6, lineHeight: 1.65 } }, s)),
          ),
        ),
      ),

      // Growth path
      React.createElement('div', { style: panelStyle },
        React.createElement('div', { style: labelStyle }, L === 'ko' ? '함께 성장하는 길' : 'Growth Path'),
        React.createElement('p', { style: { fontSize: 14, lineHeight: 1.8, color: 'rgba(230,225,255,0.9)', margin: 0 } }, result.growth),
      ),

      // Frequency harmony
      React.createElement('div', { style: { ...panelStyle, borderColor: 'rgba(62,207,207,0.3)', background: 'linear-gradient(135deg,rgba(62,207,207,0.06),rgba(139,92,246,0.06))' } },
        React.createElement('div', { style: { ...labelStyle, color: '#3ECFCF' } }, L === 'ko' ? '공명 주파수' : 'Resonance Frequency'),
        result.recommended_hz && React.createElement('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 38, fontWeight: 700, color: '#3ECFCF', textAlign: 'center', marginBottom: 10, textShadow: '0 0 20px rgba(62,207,207,0.4)' } }, result.recommended_hz + ' Hz'),
        React.createElement('p', { style: { fontSize: 13.5, lineHeight: 1.75, color: 'rgba(230,225,255,0.9)', margin: 0 } }, result.frequency_harmony),
      ),

      // Mantra
      React.createElement('div', { style: { ...panelStyle, textAlign: 'center', background: 'rgba(155,127,255,0.06)' } },
        React.createElement('div', { style: labelStyle }, L === 'ko' ? '커플 만트라' : 'Couple Mantra'),
        React.createElement('div', { style: { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontStyle: 'italic', color: '#fff', lineHeight: 1.5, letterSpacing: 0.3 } }, '"' + (result.mantra || '') + '"'),
      ),

      // Actions
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 } },
        React.createElement('button', { onClick: reset, style: { padding: '14px', borderRadius: 12, border: '1px solid rgba(139,92,246,0.35)', background: 'rgba(139,92,246,0.08)', color: '#B89EFF', fontSize: 13, fontWeight: 500, cursor: 'pointer' } },
          L === 'ko' ? '↻ 새 분석' : '↻ New analysis'),
        onBack && React.createElement('button', { onClick: onBack, style: { padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(200,190,255,0.7)', fontSize: 13, fontWeight: 500, cursor: 'pointer' } },
          L === 'ko' ? '← 영혼 분석' : '← Soul Analysis'),
      ),
    );
  }

  window.Synastry = Synastry;
})();
