/* 미리 — 상태 저장소 */
const MiriStore = (() => {
  const KEY = 'miri.v1';

  const PRESET_BANK = [
    { key: 'go',    label: '등원',   icon: '🎒', minutes: 10, time: '07:40' },
    { key: 'home',  label: '하원',   icon: '🏠', minutes: 10, time: '16:00' },
    { key: 'bath',  label: '목욕',   icon: '🛁', minutes: 10, time: '19:30' },
    { key: 'sleep', label: '잠자리', icon: '🌙', minutes: 15, time: '20:30' }
  ];

  const CARD_SETS = [
    { key: 'clothes', title: '뭘 입을까?', emoji: '👕', pool: [
      { emoji: '🔴', label: '빨간 옷' }, { emoji: '🔵', label: '파란 옷' },
      { emoji: '🟡', label: '노란 옷' }, { emoji: '🟢', label: '초록 옷' }
    ]},
    { key: 'snack', title: '뭐 먹을까?', emoji: '🍎', pool: [
      { emoji: '🍎', label: '사과' }, { emoji: '🍌', label: '바나나' },
      { emoji: '🍓', label: '딸기' }, { emoji: '🥛', label: '우유' }
    ]},
    { key: 'play', title: '뭐 하고 놀까?', emoji: '🧱', pool: [
      { emoji: '🧱', label: '블록' }, { emoji: '🎨', label: '그림' },
      { emoji: '🚗', label: '자동차' }, { emoji: '🧸', label: '인형놀이' }
    ]},
    { key: 'next', title: '다음엔 뭐 할까?', emoji: '🛁', pool: [
      { emoji: '🛁', label: '목욕 먼저' }, { emoji: '📖', label: '책 먼저' },
      { emoji: '🪥', label: '양치 먼저' }, { emoji: '🧺', label: '정리 먼저' }
    ]}
  ];

  function defaults() {
    return {
      onboarded: false,
      age: null,
      sound: true,
      notify: false,
      presets: PRESET_BANK.map(p => ({ ...p, pinned: false })),
      logs: [],
      choiceLogs: []
    };
  }

  let state = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || typeof raw !== 'object') return defaults();
      const base = defaults();
      return {
        ...base,
        ...raw,
        presets: Array.isArray(raw.presets) && raw.presets.length ? raw.presets : base.presets,
        logs: Array.isArray(raw.logs) ? raw.logs : [],
        choiceLogs: Array.isArray(raw.choiceLogs) ? raw.choiceLogs : []
      };
    } catch (e) {
      return defaults();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 프리셋 ---------- */

  function orderedPresets() {
    return [...state.presets].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.time.localeCompare(b.time);
    });
  }

  function nextPreset(now = new Date()) {
    const list = orderedPresets();
    if (!list.length) return null;
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const upcoming = list
      .filter(p => p.time >= hhmm)
      .sort((a, b) => a.time.localeCompare(b.time))[0];
    return upcoming || list[0];
  }

  function updatePreset(key, patch) {
    const p = state.presets.find(x => x.key === key);
    if (!p) return;
    Object.assign(p, patch);
    save();
  }

  /* ---------- 기록 ---------- */

  function addLog(entry) {
    const log = {
      id: uid(),
      label: entry.label,
      icon: entry.icon || '⏳',
      minutes: entry.minutes,
      start: entry.start || Date.now(),
      end: Date.now(),
      outcome: entry.outcome || 'success'
    };
    state.logs.unshift(log);
    if (state.logs.length > 400) state.logs.length = 400;
    save();
    return log;
  }

  function setLogOutcome(id, outcome) {
    const log = state.logs.find(l => l.id === id);
    if (!log) return;
    log.outcome = outcome;
    save();
  }

  function logsToday() {
    const today = new Date().toDateString();
    return state.logs.filter(l => new Date(l.start).toDateString() === today);
  }

  function counts(logs) {
    return {
      total: logs.length,
      success: logs.filter(l => l.outcome === 'success').length,
      extend: logs.filter(l => l.outcome === 'extend').length,
      abort: logs.filter(l => l.outcome === 'abort').length
    };
  }

  function weekStats(days = 7) {
    const out = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const key = d.toDateString();
      const logs = state.logs.filter(l => new Date(l.start).toDateString() === key);
      out.push({
        date: d,
        key,
        label: '일월화수목금토'[d.getDay()],
        total: logs.length,
        success: logs.filter(l => l.outcome === 'success').length
      });
    }
    return out;
  }

  function weekSuccess() {
    return weekStats(7).reduce((n, d) => n + d.success, 0);
  }

  /* ---------- 카드 ---------- */

  function pairFor(setKey) {
    const set = CARD_SETS.find(s => s.key === setKey) || CARD_SETS[0];
    const pool = [...set.pool];
    const picked = [];
    for (let i = 0; i < 2 && pool.length; i++) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return { set, cards: picked };
  }

  function addChoice(entry) {
    const log = { id: uid(), title: entry.title, emoji: entry.emoji, label: entry.label, at: Date.now() };
    state.choiceLogs.unshift(log);
    if (state.choiceLogs.length > 200) state.choiceLogs.length = 200;
    save();
    return log;
  }

  function reset() {
    state = defaults();
    save();
  }

  return {
    get state() { return state; },
    save,
    presets: PRESET_BANK,
    cardSets: CARD_SETS,
    orderedPresets,
    nextPreset,
    updatePreset,
    addLog,
    setLogOutcome,
    logsToday,
    counts,
    weekStats,
    weekSuccess,
    pairFor,
    addChoice,
    reset
  };
})();
