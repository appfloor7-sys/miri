/* 미리 — 상태 저장소 (schema v2) */
const MiriStore = (() => {
  'use strict';

  const KEY = 'miri.v2';
  const LEGACY_KEY = 'miri.v1';
  const PENDING_KEY = 'miri.pending';
  const LIMIT = { logs: 400, choices: 200, events: 500 };

  const FREE = { timersPerDay: 5, customPresets: 2, recordDays: 7, notifyPerDay: 6 };

  const PRESET_BANK = [
    { key: 'go', label: '등원', icon: '🎒', minutes: 10, time: '07:40' },
    { key: 'home', label: '하원', icon: '🏠', minutes: 10, time: '16:00' },
    { key: 'bath', label: '목욕', icon: '🛁', minutes: 10, time: '19:30' },
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

  const ROUTINE_BANK = [
    { id: 'morning', name: '아침 루틴', icon: '🌅', time: '07:20', steps: [
      { label: '기상', icon: '☀️', minutes: 3 },
      { label: '아침밥', icon: '🥣', minutes: 15 },
      { label: '옷 입기', icon: '👕', minutes: 10 },
      { label: '등원', icon: '🎒', minutes: 5 }
    ]},
    { id: 'evening', name: '저녁 루틴', icon: '🌙', time: '19:30', steps: [
      { label: '목욕', icon: '🛁', minutes: 10 },
      { label: '양치', icon: '🪥', minutes: 3 },
      { label: '책 읽기', icon: '📖', minutes: 10 }
    ]}
  ];

  const clone = o => JSON.parse(JSON.stringify(o));

  function dayKey(ts) {
    const d = new Date(ts === undefined ? Date.now() : ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function defaults() {
    const today = dayKey();
    return {
      schema: 2,
      onboarded: false,
      age: null,
      hardMoment: 'go',
      sound: true,
      haptics: true,
      theme: 'auto',
      notify: false,
      notifyQuiet: { from: '22:00', to: '07:00' },
      installHintSeen: false,
      children: [{ id: 'c1', name: '우리 아이', age: null, avatar: '🐰' }],
      activeChildId: 'c1',
      presets: PRESET_BANK.map(p => ({ ...p, pinned: false, custom: false })),
      routines: clone(ROUTINE_BANK),
      cards: {},
      logs: [],
      choiceLogs: [],
      events: [],
      gate: {
        plan: 'free',
        timerCountToday: 0,
        dayKey: today,
        notifiedToday: 0,
        notifyDayKey: today
      }
    };
  }

  /* ---------- 마이그레이션 ---------- */

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.schema === 2) return raw;

    const out = defaults();
    out.onboarded = !!raw.onboarded;
    out.age = raw.age ?? null;
    out.sound = raw.sound !== false;
    out.notify = !!raw.notify;

    if (Array.isArray(raw.presets) && raw.presets.length) {
      out.presets = raw.presets.map(p => ({
        key: p.key,
        label: p.label,
        icon: p.icon || '⏳',
        minutes: Number(p.minutes) || 10,
        time: p.time || '09:00',
        pinned: !!p.pinned,
        custom: false
      }));
    }
    out.children[0].age = out.age;
    out.logs = (Array.isArray(raw.logs) ? raw.logs : []).map(l => ({
      id: l.id || uid('l'),
      presetKey: l.presetKey || null,
      label: l.label || '전환',
      icon: l.icon || '⏳',
      minutes: Number(l.minutes) || 1,
      start: Number(l.start) || Date.now(),
      end: Number(l.end) || (Number(l.start) || Date.now()) + (Number(l.minutes) || 1) * 60000,
      outcome: ['success', 'extend', 'abort'].includes(l.outcome) ? l.outcome : 'success',
      extended: 0,
      childId: 'c1',
      routineId: null,
      stepIndex: null,
      trial: !!l.trial
    }));
    out.choiceLogs = (Array.isArray(raw.choiceLogs) ? raw.choiceLogs : []).map(c => ({
      id: c.id || uid('c'),
      setKey: null,
      title: c.title || '',
      emoji: c.emoji || '🃏',
      label: c.label || '',
      at: Number(c.at) || Date.now(),
      childId: 'c1'
    }));
    return out;
  }

  /* ---------- 저장 ---------- */

  let memoryOnly = false;
  let state = load();

  function load() {
    try {
      const raw2 = localStorage.getItem(KEY);
      if (raw2) {
        const parsed = migrate(JSON.parse(raw2));
        if (parsed) return normalize(parsed);
      }
      const raw1 = localStorage.getItem(LEGACY_KEY);
      if (raw1) {
        const migrated = migrate(JSON.parse(raw1));
        if (migrated) {
          const st = normalize(migrated);
          persist(st);
          return st;
        }
      }
    } catch (e) {
      try {
        const broken = localStorage.getItem(KEY);
        if (broken) localStorage.setItem(KEY + '.bak', broken);
      } catch (e2) {}
    }
    return defaults();
  }

  function normalize(st) {
    const base = defaults();
    const out = { ...base, ...st };
    out.presets = Array.isArray(st.presets) && st.presets.length ? st.presets : base.presets;
    out.routines = Array.isArray(st.routines) ? st.routines : base.routines;
    out.children = Array.isArray(st.children) && st.children.length ? st.children : base.children;
    out.cards = st.cards && typeof st.cards === 'object' ? st.cards : {};
    out.logs = Array.isArray(st.logs) ? st.logs : [];
    out.choiceLogs = Array.isArray(st.choiceLogs) ? st.choiceLogs : [];
    out.events = Array.isArray(st.events) ? st.events : [];
    out.gate = { ...base.gate, ...(st.gate || {}) };
    out.notifyQuiet = { ...base.notifyQuiet, ...(st.notifyQuiet || {}) };
    if (!out.children.some(c => c.id === out.activeChildId)) out.activeChildId = out.children[0].id;
    return out;
  }

  function persist(st) {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
      return true;
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') {
        try {
          st.logs = st.logs.slice(0, 100);
          localStorage.setItem(KEY, JSON.stringify(st));
          return true;
        } catch (e2) {}
      }
      memoryOnly = true;
      return false;
    }
  }

  function save() {
    if (dayKey() !== state.gate.dayKey) {
      state.gate.dayKey = dayKey();
      state.gate.timerCountToday = 0;
    }
    if (dayKey() !== state.gate.notifyDayKey) {
      state.gate.notifyDayKey = dayKey();
      state.gate.notifiedToday = 0;
    }
    persist(state);
  }

  /* ---------- 이벤트 (로컬 기록만) ---------- */

  function track(name, params) {
    state.events.push({ n: name, t: Date.now(), p: params || null });
    if (state.events.length > LIMIT.events) state.events.splice(0, state.events.length - LIMIT.events);
  }

  function eventCount(name) {
    return state.events.filter(e => e.n === name).length;
  }

  /* ---------- 프리셋 ---------- */

  function orderedPresets() {
    return [...state.presets].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(a.time).localeCompare(String(b.time));
    });
  }

  function nextPreset(now) {
    const list = orderedPresets();
    if (!list.length) return null;
    const d = now || new Date();
    const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const upcoming = list.filter(p => p.time >= hhmm).sort((a, b) => String(a.time).localeCompare(String(b.time)))[0];
    return upcoming || list[0];
  }

  function presetByKey(key) {
    return state.presets.find(p => p.key === key) || null;
  }

  function updatePreset(key, patch) {
    const p = presetByKey(key);
    if (!p) return;
    Object.assign(p, patch);
    save();
  }

  function customPresetCount() {
    return state.presets.filter(p => p.custom).length;
  }

  function canAddPreset() {
    return state.gate.plan !== 'free' || customPresetCount() < FREE.customPresets;
  }

  function addPreset({ label, icon, minutes, time }) {
    const p = {
      key: uid('p_'),
      label: String(label || '전환').slice(0, 12),
      icon: icon || '⏳',
      minutes: clampMinutes(minutes),
      time: time || '09:00',
      pinned: false,
      custom: true
    };
    state.presets.push(p);
    save();
    return p;
  }

  function removePreset(key) {
    const idx = state.presets.findIndex(p => p.key === key && p.custom);
    if (idx < 0) return false;
    state.presets.splice(idx, 1);
    save();
    return true;
  }

  function clampMinutes(m) {
    const n = Math.round(Number(m) || 1);
    return Math.min(60, Math.max(1, n));
  }

  /* ---------- 루틴 ---------- */

  function routines() {
    return state.routines;
  }

  function routineById(id) {
    return state.routines.find(r => r.id === id) || null;
  }

  function updateRoutineStep(routineId, stepIndex, minutes) {
    const r = routineById(routineId);
    if (!r || !r.steps[stepIndex]) return;
    r.steps[stepIndex].minutes = clampMinutes(minutes);
    save();
  }

  /* ---------- 기록 ---------- */

  function addLog(entry) {
    const start = entry.start || Date.now();
    const log = {
      id: uid('l'),
      presetKey: entry.presetKey || null,
      label: entry.label || '전환',
      icon: entry.icon || '⏳',
      minutes: Number(entry.minutes) || 1,
      start,
      end: entry.end || Date.now(),
      outcome: entry.outcome || 'success',
      extended: Number(entry.extended) || 0,
      childId: entry.childId || state.activeChildId,
      routineId: entry.routineId || null,
      stepIndex: entry.stepIndex === undefined ? null : entry.stepIndex,
      trial: !!entry.trial
    };
    state.logs.unshift(log);
    if (state.logs.length > LIMIT.logs) state.logs.length = LIMIT.logs;
    save();
    return log;
  }

  function setLogOutcome(id, outcome) {
    const log = state.logs.find(l => l.id === id);
    if (!log) return;
    log.outcome = outcome;
    save();
  }

  function logsOn(ts, childId) {
    const key = dayKey(ts);
    return state.logs.filter(l => dayKey(l.start) === key && (!childId || l.childId === childId));
  }

  function logsToday(childId) {
    return logsOn(Date.now(), childId || state.activeChildId);
  }

  function counts(logs) {
    const out = { total: logs.length, success: 0, extend: 0, abort: 0 };
    logs.forEach(l => {
      if (l.outcome === 'success') out.success++;
      else if (l.outcome === 'extend') out.extend++;
      else if (l.outcome === 'abort') out.abort++;
    });
    return out;
  }

  function recordDays() {
    return state.gate.plan === 'free' ? FREE.recordDays : 30;
  }

  function weekStats(days, childId) {
    const n = days || recordDays();
    const out = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const child = childId || state.activeChildId;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const key = dayKey(d.getTime());
      const logs = state.logs.filter(l => dayKey(l.start) === key && l.childId === child);
      out.push({
        date: d,
        key,
        label: '일월화수목금토'[d.getDay()],
        dayNum: d.getDate(),
        total: logs.length,
        success: logs.filter(l => l.outcome === 'success').length
      });
    }
    return out;
  }

  function weekSuccess() {
    return weekStats().reduce((n, d) => n + d.success, 0);
  }

  /* ---------- 카드 ---------- */

  function cardsFor(setKey) {
    return state.cards[setKey] || [];
  }

  function photoCount() {
    return Object.values(state.cards).reduce((n, arr) => n + arr.length, 0);
  }

  function pairFor(setKey) {
    const set = CARD_SETS.find(s => s.key === setKey) || CARD_SETS[0];
    const custom = cardsFor(set.key).map(c => ({ id: c.id, label: c.label, media: true }));
    const builtin = set.pool.map(c => ({ ...c, media: false }));
    const pick = arr => arr.splice(Math.floor(Math.random() * arr.length), 1)[0];

    // 사진을 올린 부모는 그 사진을 보여주려고 올린 것이다. 항상 1장은 포함한다.
    const picked = [];
    if (custom.length) picked.push(pick(custom));

    const rest = [...custom, ...builtin];
    while (picked.length < 2 && rest.length) picked.push(pick(rest));

    return { set, cards: picked };
  }

  function addChoice(entry) {
    const log = {
      id: uid('c'),
      setKey: entry.setKey || null,
      title: entry.title || '',
      emoji: entry.emoji || '🃏',
      label: entry.label || '',
      at: Date.now(),
      childId: state.activeChildId
    };
    state.choiceLogs.unshift(log);
    if (state.choiceLogs.length > LIMIT.choices) state.choiceLogs.length = LIMIT.choices;
    save();
    return log;
  }

  /* ---------- 아이 프로필 ---------- */

  function activeChild() {
    return state.children.find(c => c.id === state.activeChildId) || state.children[0];
  }

  function children() {
    return state.children;
  }

  function canAddChild() {
    return state.children.length < 2 && state.gate.plan !== 'free';
  }

  function addChild({ name, age, avatar }) {
    if (state.children.length >= 2) return null;
    const c = { id: uid('c_'), name: String(name || '아이').slice(0, 8), age: age || null, avatar: avatar || '🐻' };
    state.children.push(c);
    save();
    return c;
  }

  function setActiveChild(id) {
    if (!state.children.some(c => c.id === id)) return;
    state.activeChildId = id;
    save();
  }

  function updateChild(id, patch) {
    const c = state.children.find(x => x.id === id);
    if (!c) return;
    Object.assign(c, patch);
    save();
  }

  /* ---------- 게이트 ---------- */

  function isPlus() {
    return state.gate.plan !== 'free';
  }

  function setPlan(plan) {
    state.gate.plan = plan === 'plus' || plan === 'family' ? plan : 'free';
    save();
  }

  function timerUsage() {
    save();
    return { used: state.gate.timerCountToday, limit: isPlus() ? Infinity : FREE.timersPerDay };
  }

  function canStartTimer() {
    if (isPlus()) return true;
    save();
    return state.gate.timerCountToday < FREE.timersPerDay;
  }

  function consumeTimer() {
    save();
    state.gate.timerCountToday += 1;
    save();
    return state.gate.timerCountToday;
  }

  /* ---------- 알림 예산 ---------- */

  function canNotify() {
    save();
    return state.gate.notifiedToday < FREE.notifyPerDay;
  }

  function markNotify() {
    save();
    state.gate.notifiedToday += 1;
    save();
  }

  function inQuietHours(now) {
    const d = now || new Date();
    const cur = d.getHours() * 60 + d.getMinutes();
    const [fh, fm] = String(state.notifyQuiet.from).split(':').map(Number);
    const [th, tm] = String(state.notifyQuiet.to).split(':').map(Number);
    const from = fh * 60 + fm;
    const to = th * 60 + tm;
    if (from === to) return false;
    return from < to ? cur >= from && cur < to : cur >= from || cur < to;
  }

  /* ---------- 진행 중 타이머 ---------- */

  function savePending(p) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function loadPending() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
  }

  /* ---------- 내보내기 / 가져오기 ---------- */

  function dump() {
    return {
      app: 'miri',
      schema: 2,
      exportedAt: new Date().toISOString(),
      data: clone(state)
    };
  }

  function toCSV() {
    const head = ['날짜', '시작', '전환', '분', '결과', '연장', '루틴', '단계'];
    const rows = state.logs.map(l => {
      const d = new Date(l.start);
      return [
        dayKey(l.start),
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
        l.label, l.minutes, l.outcome, l.extended || 0,
        l.routineId || '', l.stepIndex === null || l.stepIndex === undefined ? '' : l.stepIndex
      ].map(v => {
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    });
    return '\ufeff' + [head.join(','), ...rows].join('\n');
  }

  function importJSON(json) {
    if (!json || json.app !== 'miri' || !json.data) throw new Error('형식이 맞지 않아요');
    const inc = json.data;
    if (!Array.isArray(inc.logs)) throw new Error('기록이 없어요');

    const seen = new Set(state.logs.map(l => l.id));
    let added = 0;
    inc.logs.forEach(l => {
      if (!l || !l.id || seen.has(l.id)) return;
      state.logs.push({ ...l, childId: l.childId || state.activeChildId });
      seen.add(l.id);
      added++;
    });
    state.logs.sort((a, b) => b.start - a.start);
    if (state.logs.length > LIMIT.logs) state.logs.length = LIMIT.logs;

    const seenC = new Set(state.choiceLogs.map(c => c.id));
    (inc.choiceLogs || []).forEach(c => {
      if (!c || !c.id || seenC.has(c.id)) return;
      state.choiceLogs.push({ ...c, childId: c.childId || state.activeChildId });
      seenC.add(c.id);
    });
    state.choiceLogs.sort((a, b) => b.at - a.at);
    if (state.choiceLogs.length > LIMIT.choices) state.choiceLogs.length = LIMIT.choices;

    if (Array.isArray(inc.presets) && inc.presets.length) state.presets = inc.presets;
    if (Array.isArray(inc.routines) && inc.routines.length) state.routines = inc.routines;

    save();
    return added;
  }

  function reset() {
    state = defaults();
    clearPending();
    save();
  }

  /* ---------- IndexedDB (사진 카드) ---------- */

  let dbPromise = null;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('no idb')); return; }
      const req = indexedDB.open('miri-media', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
    return dbPromise;
  }

  async function putCard(id, dataUrl) {
    const d = await db();
    if (!d) return false;
    return new Promise(resolve => {
      const tx = d.transaction('cards', 'readwrite');
      tx.objectStore('cards').put({ id, dataUrl, at: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async function getCard(id) {
    const d = await db();
    if (!d) return null;
    return new Promise(resolve => {
      const tx = d.transaction('cards', 'readonly');
      const req = tx.objectStore('cards').get(id);
      req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
      req.onerror = () => resolve(null);
    });
  }

  async function allCards() {
    const d = await db();
    if (!d) return {};
    return new Promise(resolve => {
      const out = {};
      const tx = d.transaction('cards', 'readonly');
      const req = tx.objectStore('cards').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { out[cur.value.id] = cur.value.dataUrl; cur.continue(); }
        else resolve(out);
      };
      req.onerror = () => resolve({});
    });
  }

  async function delCard(id) {
    const d = await db();
    if (!d) return;
    return new Promise(resolve => {
      const tx = d.transaction('cards', 'readwrite');
      tx.objectStore('cards').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  function addCardMeta(setKey, label, id) {
    if (!state.cards[setKey]) state.cards[setKey] = [];
    state.cards[setKey].push({ id, label: String(label || '내 사진').slice(0, 12), at: Date.now() });
    save();
  }

  function removeCardMeta(setKey, id) {
    if (!state.cards[setKey]) return;
    state.cards[setKey] = state.cards[setKey].filter(c => c.id !== id);
    if (!state.cards[setKey].length) delete state.cards[setKey];
    save();
  }

  return {
    get state() { return state; },
    get memoryOnly() { return memoryOnly; },
    limits: { FREE, LIMIT },
    save,
    dayKey,
    uid,
    track,
    eventCount,
    presets: PRESET_BANK,
    cardSets: CARD_SETS,
    orderedPresets,
    nextPreset,
    presetByKey,
    updatePreset,
    canAddPreset,
    customPresetCount,
    addPreset,
    removePreset,
    clampMinutes,
    routines,
    routineById,
    updateRoutineStep,
    addLog,
    setLogOutcome,
    logsOn,
    logsToday,
    counts,
    recordDays,
    weekStats,
    weekSuccess,
    cardsFor,
    photoCount,
    pairFor,
    addChoice,
    activeChild,
    children,
    canAddChild,
    addChild,
    setActiveChild,
    updateChild,
    isPlus,
    setPlan,
    timerUsage,
    canStartTimer,
    consumeTimer,
    canNotify,
    markNotify,
    inQuietHours,
    savePending,
    loadPending,
    clearPending,
    dump,
    toCSV,
    importJSON,
    reset,
    putCard,
    getCard,
    allCards,
    delCard,
    addCardMeta,
    removeCardMeta
  };
})();
