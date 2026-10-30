/* 미리 — 화면, 타이머, 알림 */
(() => {
  'use strict';

  const S = MiriStore;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const VIEWS = ['onboarding', 'home', 'cards', 'records', 'settings', 'paywall'];
  const FULL = ['kid', 'choice'];
  const TAB_VIEWS = ['home', 'cards', 'records', 'settings'];

  let currentView = 'home';
  let paywallReturn = 'home';
  let mediaCache = {};
  let deferredPrompt = null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

  /* ================= 공통 ================= */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('on'), 2400);
  }

  function fmtClock(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function go(view) {
    VIEWS.forEach(v => $('#view-' + v).classList.toggle('active', v === view));
    FULL.forEach(v => $('#view-' + v).classList.remove('active'));
    currentView = view;
    $('#tabbar').hidden = !TAB_VIEWS.includes(view);
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === view));
    window.scrollTo(0, 0);

    if (view === 'home') renderHome();
    if (view === 'cards') renderCards();
    if (view === 'records') renderRecords();
    if (view === 'settings') renderSettings();
  }

  function openFull(view) {
    VIEWS.forEach(v => $('#view-' + v).classList.remove('active'));
    FULL.forEach(v => $('#view-' + v).classList.toggle('active', v === view));
    $('#tabbar').hidden = true;
  }

  function closeFull() {
    FULL.forEach(v => $('#view-' + v).classList.remove('active'));
    go(currentView);
  }

  /* ================= 테마 / 모션 ================= */

  function applyTheme() {
    const t = S.state.theme || 'auto';
    const resolved = t === 'auto' ? (darkMedia.matches ? 'dark' : 'light') : t;
    document.documentElement.dataset.theme = resolved;
  }

  function applyMotion() {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion.matches);
  }

  /* ================= 소리 / 진동 ================= */

  let audioCtx = null;

  function tone(freq, at, dur, gain) {
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + at);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + dur + 0.05);
  }

  function unlockAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }

  function chime(kind) {
    if (!S.state.sound) return;
    try {
      unlockAudio();
      if (!audioCtx) return;
      if (kind === 'end') {
        tone(523.25, 0, 0.5, 0.16);
        tone(659.25, 0.13, 0.5, 0.14);
        tone(783.99, 0.26, 0.7, 0.12);
      } else if (kind === 'mid') {
        // 절반을 지났다는 신호. 경보가 아니라 방 안의 여린 종소리여야 한다.
        tone(392, 0, 0.9, 0.055);
        tone(523.25, 0.3, 0.9, 0.04);
      } else if (kind === 'pick') {
        tone(784, 0, 0.12, 0.12);
        tone(1046.5, 0.09, 0.2, 0.10);
      } else {
        tone(880, 0, 0.25, 0.10);
        tone(1174.66, 0.16, 0.3, 0.08);
      }
    } catch (e) {}
  }

  // 아이 화면 위에 잠깐 떠오르는 한 줄. 읽는 사람은 부모다.
  let cueTimer = null;
  function cue(text, ms = 2600) {
    const el = $('#kid-cue');
    if (!el) return;
    clearTimeout(cueTimer);
    el.textContent = text;
    el.classList.add('on');
    cueTimer = setTimeout(() => el.classList.remove('on'), ms);
  }
  function clearCue() {
    const el = $('#kid-cue');
    clearTimeout(cueTimer);
    if (el) { el.classList.remove('on'); el.textContent = ''; }
  }

  function buzz(pattern) {
    if (!S.state.haptics) return;
    if (!navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  /* ================= 확인 다이얼로그 ================= */

  let confirmResolve = null;

  function askConfirm({ title, text, ok }) {
    return new Promise(resolve => {
      $('#confirm-title').textContent = title || '확인';
      $('#confirm-text').textContent = text || '';
      $('#confirm-ok').textContent = ok || '확인';
      $('#confirm-input').hidden = true;
      $('#confirm').classList.add('on');
      confirmResolve = resolve;
    });
  }

  function askText({ title, text, ok, placeholder, value }) {
    return new Promise(resolve => {
      $('#confirm-title').textContent = title || '입력';
      $('#confirm-text').textContent = text || '';
      $('#confirm-ok').textContent = ok || '저장';
      const inp = $('#confirm-input');
      inp.hidden = false;
      inp.placeholder = placeholder || '';
      inp.value = value || '';
      $('#confirm').classList.add('on');
      setTimeout(() => inp.focus(), 60);
      confirmResolve = resolve;
    });
  }

  function closeConfirm(result) {
    $('#confirm').classList.remove('on');
    const r = confirmResolve;
    confirmResolve = null;
    if (r) r(result);
  }

  /* ================= 온보딩 ================= */

  const ob = { step: 1, age: null, moment: 'go' };

  function obShow(step) {
    ob.step = step;
    $$('.ob-step').forEach(el => el.classList.toggle('active', Number(el.dataset.step) === step));
    $$('.ob-progress i').forEach((el, i) => el.classList.toggle('on', i < step));
  }

  function obInit() {
    $('#ob-age').addEventListener('click', e => {
      const b = e.target.closest('button[data-age]');
      if (!b) return;
      ob.age = Number(b.dataset.age);
      $$('#ob-age button').forEach(x => x.classList.toggle('on', x === b));
      chime('pick');
    });

    $('#ob-next-1').addEventListener('click', () => {
      if (!ob.age) { toast('아이 나이를 골라주세요'); return; }
      S.track('onb_age', { age: ob.age });
      obShow(2);
    });

    $('#ob-moment').addEventListener('click', e => {
      const b = e.target.closest('.opt');
      if (!b) return;
      ob.moment = b.dataset.key;
      $$('#ob-moment .opt').forEach(x => x.classList.toggle('sel', x === b));
      chime('pick');
    });

    $('#ob-next-2').addEventListener('click', () => {
      S.state.age = ob.age;
      S.state.hardMoment = ob.moment;
      S.state.children[0].age = ob.age;
      S.state.presets.forEach(p => { p.pinned = p.key === ob.moment; });
      S.track('onb_moment', { moment: ob.moment });
      S.save();

      const p = S.presetByKey(ob.moment) || S.state.presets[0];
      if (p) {
        $('#ob-preview-em').textContent = p.icon;
        $('#ob-preview-lb').textContent = p.label;
        $('#ob-preview-mt').textContent = useShort(p.minutes, modeOf(p));
      }
      obShow(3);
    });

    $('#ob-start').addEventListener('click', () => {
      S.state.onboarded = true;
      S.save();
      S.track('onb_first_run', { minutes: 3 });
      const p = S.presetByKey(ob.moment) || S.state.presets[0];
      go('home');
      startTimer({ label: p.label, icon: p.icon, minutes: 3, presetKey: p.key, isTrial: true });
    });

    $('#ob-skip').addEventListener('click', () => {
      S.state.onboarded = true;
      S.save();
      S.track('onb_skip', null);
      go('home');
    });

    $$('#ob-moment .opt').forEach(x => x.classList.toggle('sel', x.dataset.key === 'go'));
  }

  /* ================= 홈 ================= */

  function renderHome() {
    const now = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    $('#home-date').textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;

    const child = S.activeChild();
    const chip = $('#home-child');
    chip.textContent = child.avatar || '🐰';
    chip.onclick = () => cycleChild();

    const next = S.nextPreset(now);
    if (next) {
      const mode = modeOf(next);
      $('#hero-em').textContent = next.icon;
      $('#hero-lb').textContent = next.label;
      $('#hero-sub').textContent = useLine(next.label, next.minutes, mode);
      $('#hero-start').onclick = () => startTimer({ label: next.label, icon: next.icon, minutes: next.minutes, presetKey: next.key, mode });
      $('#hero-change').onclick = () => openSheet({
        label: next.label, minutes: next.minutes, mode,
        onPick: (min, m) => startTimer({ label: next.label, icon: next.icon, minutes: min, presetKey: next.key, mode: m })
      });
    }

    const usage = S.timerUsage();
    $('#hero-usage').textContent = S.isPlus()
      ? '오늘 ' + S.logsToday().length + '번 넘어갔어요'
      : (usage.used >= usage.limit
        ? '오늘 무료 ' + usage.limit + '번을 다 썼어요'
        : '오늘 ' + usage.used + '/' + usage.limit + '번 사용');

    renderInstallBanner();
    renderRoutines();

    const today = S.logsToday();
    const c = S.counts(today);
    $('#home-today-stat').textContent = today.length
      ? `성공 ${c.success} · 연장 ${c.extend}`
      : '아직 기록이 없어요';

    const grid = $('#preset-grid');
    grid.innerHTML = S.orderedPresets().map(p => `
      <button class="preset" data-key="${esc(p.key)}">
        ${p.pinned ? '<span class="pin">자주</span>' : ''}
        <span class="em">${esc(p.icon)}</span>
        <span class="lb">${esc(p.label)}</span>
        <span class="mt" data-min="${esc(p.key)}">${esc(p.time)} ${modeOf(p) === 'during' ? '· ' + p.minutes + '분 동안' : '시작 · ' + p.minutes + '분 전에'}</span>
        <span class="go">시계 켜기 →</span>
      </button>
    `).join('');

    grid.querySelectorAll('.preset').forEach(btn => {
      btn.addEventListener('click', e => {
        const p = S.presetByKey(btn.dataset.key);
        if (!p) return;
        if (e.target.closest('[data-min]')) {
          e.stopPropagation();
          openSheet({
            label: p.label, minutes: p.minutes, mode: modeOf(p),
            onPick: (min, m) => startTimer({ label: p.label, icon: p.icon, minutes: min, presetKey: p.key, mode: m })
          });
          return;
        }
        startTimer({ label: p.label, icon: p.icon, minutes: p.minutes, presetKey: p.key, mode: modeOf(p) });
      });
    });

    const logs = S.state.logs.filter(l => l.childId === S.state.activeChildId).slice(0, 4);
    $('#home-log-count').textContent = logs.length ? `${logs.length}건` : '';
    $('#home-logs').innerHTML = logs.length
      ? logs.map(logRow).join('')
      : `<div class="empty">첫 전환을 기록해 보세요.<br>위에서 시계를 켜면 여기에 쌓입니다.</div>`;
  }

  function cycleChild() {
    const list = S.children();
    if (list.length < 2) { toast('아이를 추가하면 여기서 바꿀 수 있어요'); return; }
    const idx = list.findIndex(c => c.id === S.state.activeChildId);
    const nextChild = list[(idx + 1) % list.length];
    S.setActiveChild(nextChild.id);
    toast(nextChild.name + '(으)로 바꿨어요');
    renderHome();
  }

  const OUTCOME = {
    success: { cls: 's', text: '성공', icon: '✓' },
    extend: { cls: 'e', text: '연장', icon: '＋' },
    abort: { cls: 'a', text: '중단', icon: '–' }
  };

  function logRow(l) {
    const o = OUTCOME[l.outcome] || OUTCOME.success;
    return `<div class="log-item">
      <span class="log-em">${esc(l.icon)}</span>
      <span class="log-main">${esc(l.label)}</span>
      <span class="log-time">${fmtClock(l.start)} · ${l.minutes}분</span>
      <span class="tag ${o.cls}">${o.text}</span>
    </div>`;
  }

  /* ---------- 설치 유도 ---------- */

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function renderInstallBanner() {
    const b = $('#install-banner');
    const shouldShow = !isStandalone() && !S.state.installHintSeen && S.state.logs.length >= 1;
    b.hidden = !shouldShow;
    if (!shouldShow) return;
    $('#install-banner-sub').textContent = isIOS()
      ? 'Safari 공유 → 홈 화면에 추가. 그래야 알림도 와요.'
      : '앱처럼 열리고, 알림도 받을 수 있어요.';
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /* ---------- 루틴 ---------- */

  function renderRoutines() {
    const section = $('#routine-section');
    const list = S.routines();
    if (!list.length) { section.hidden = true; return; }
    section.hidden = false;

    const plus = S.isPlus();
    $('#routine-lock').innerHTML = plus ? '' : '<span class="lock-pill">Plus</span>';

    $('#routine-list').innerHTML = list.map(r => `
      <button class="routine-tile ${plus ? '' : 'locked'}" data-routine="${esc(r.id)}">
        <span class="em">${esc(r.icon)}</span>
        <span class="rt-main">
          <span class="rt-name">${esc(r.name)}</span>
          <span class="rt-steps">${r.steps.map(s => esc(s.label)).join(' → ')}</span>
        </span>
        <span class="rt-lock">${plus ? '→' : '🔒'}</span>
      </button>
    `).join('');

    $$('#routine-list .routine-tile').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!S.isPlus()) { showPaywall('routine'); return; }
        startRoutine(btn.dataset.routine);
      });
    });
  }

  /* ================= 시간 선택 시트 ================= */


  let sheetState = null;

  function openSheet({ label, minutes, mode, onPick }) {
    sheetState = { label, mode: modeOf({ mode }), onPick };
    $('#sheet-title').textContent = label + ' — 몇 분?';
    $('#sheet-custom').value = '';
    paintSheetMode();
    $('#sheet').classList.add('on');
  }

  function paintSheetMode() {
    if (!sheetState) return;
    const { label, mode } = sheetState;
    $$('#sheet-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#sheet-mode-note').textContent = mode === 'during'
      ? label + '에 주는 시간이에요. 시간이 다 되면 끝났다고 알려줘요.'
      : label + '이 시작되기까지 남은 시간이에요. 아이는 이만큼 더 하고 움직이면 돼요.';
  }

  $$('#sheet-mode button').forEach(b => {
    b.addEventListener('click', () => {
      if (!sheetState) return;
      sheetState.mode = b.dataset.mode;
      paintSheetMode();
    });
  });

  function closeSheet() {
    $('#sheet').classList.remove('on');
    sheetState = null;
  }

  function sheetPick(min) {
    const st = sheetState;
    const m = S.clampMinutes(min);
    closeSheet();
    if (st) st.onPick(m, st.mode);
  }

  /* ================= 카드 ================= */

  let choiceState = null;
  let photoSetKey = 'clothes';

  function renderCards() {
    $('#set-list').innerHTML = S.cardSets.map(s => {
      const n = S.cardsFor(s.key).length;
      return `
      <button class="set-tile" data-key="${esc(s.key)}">
        <span class="em">${esc(s.emoji)}</span>
        <span class="nm">${esc(s.title)}${n ? ' <span class="muted">+' + n + '</span>' : ''}</span>
        <span class="arw">→</span>
      </button>`;
    }).join('');

    $$('#set-list .set-tile').forEach(btn => {
      btn.addEventListener('click', () => openChoice(btn.dataset.key));
    });

    renderPhotoSection();

    const logs = S.state.choiceLogs.slice(0, 6);
    $('#choice-logs').innerHTML = logs.length
      ? logs.map(l => `<div class="log-item">
          <span class="log-em">${l.emoji && l.emoji.startsWith('data:') ? '📷' : esc(l.emoji)}</span>
          <span class="log-main">${esc(l.label)}</span>
          <span class="log-time">${esc(l.title)}</span>
          <span class="log-time">${fmtClock(l.at)}</span>
        </div>`).join('')
      : `<div class="empty">아이가 고른 기록이 여기에 남습니다.<br>부모가 뒤집기 어려워지는 장치예요.</div>`;
  }

  function renderPhotoSection() {
    const plus = S.isPlus();
    $('#photo-count').textContent = S.photoCount() ? S.photoCount() + '장' : '';

    $('#photo-set').innerHTML = S.cardSets.map(s =>
      `<button class="chip-btn ${s.key === photoSetKey ? 'on' : ''}" data-set="${esc(s.key)}">${esc(s.emoji)} ${esc(s.title)}</button>`
    ).join('');

    $$('#photo-set .chip-btn').forEach(b => {
      b.addEventListener('click', () => { photoSetKey = b.dataset.set; renderPhotoSection(); });
    });

    const items = S.cardsFor(photoSetKey);
    $('#photo-list').innerHTML = items.map(c => `
      <div class="photo-thumb">
        <img src="${esc(mediaCache[c.id] || '')}" alt="${esc(c.label)}">
        <button data-del="${esc(c.id)}" aria-label="삭제">✕</button>
      </div>
    `).join('');

    $$('#photo-list [data-del]').forEach(b => {
      b.addEventListener('click', async () => {
        const ok = await askConfirm({ title: '사진을 지울까요?', text: '이 카드는 다시 나오지 않아요.', ok: '지우기' });
        if (!ok) return;
        const id = b.dataset.del;
        S.removeCardMeta(photoSetKey, id);
        delete mediaCache[id];
        await S.delCard(id);
        renderPhotoSection();
        toast('지웠어요');
      });
    });

    $('#photo-add').textContent = plus ? '사진 고르기' : 'Plus에서 열기';
  }

  function openChoice(setKey) {
    showChoicePair(setKey);
    openFull('choice');
    S.track('choice_open', { setKey });
  }

  function showChoicePair(setKey) {
    const { set, cards } = S.pairFor(setKey);
    choiceState = { set, cards, picked: false };
    $('#choice-q').textContent = set.title;
    $('#choice-foot').style.display = 'none';
    $('#choice-grid').innerHTML = cards.map((c, i) => {
      if (c.media) {
        const src = mediaCache[c.id] || '';
        return `<button class="choice-card photo" data-i="${i}">
          <span class="em photo"><img src="${esc(src)}" alt="${esc(c.label)}"></span>
          <span class="lb">${esc(c.label)}</span>
        </button>`;
      }
      return `<button class="choice-card" data-i="${i}">
        <span class="em">${esc(c.emoji)}</span>
        <span class="lb">${esc(c.label)}</span>
      </button>`;
    }).join('');

    $('#choice-grid').querySelectorAll('.choice-card').forEach(btn => {
      btn.addEventListener('click', () => pickCard(Number(btn.dataset.i)));
    });
  }

  function pickCard(i) {
    if (!choiceState || choiceState.picked) return;
    choiceState.picked = true;
    const card = choiceState.cards[i];
    chime('pick');
    buzz(30);
    $('#choice-grid').querySelectorAll('.choice-card').forEach((el, idx) => {
      el.classList.toggle('pick', idx === i);
      el.classList.toggle('dim', idx !== i);
    });
    S.addChoice({
      setKey: choiceState.set.key,
      title: choiceState.set.title,
      emoji: card.media ? '📷' : card.emoji,
      label: card.label
    });
    S.track('choice_pick', { setKey: choiceState.set.key, label: card.label });
    setTimeout(() => { $('#choice-foot').style.display = 'flex'; }, reduceMotion.matches ? 0 : 450);
  }

  /* ================= 기록 ================= */

  function renderRecords() {
    const child = S.activeChild();
    const all = S.children();
    $('#rec-child').innerHTML = all.length > 1
      ? all.map(c => `<button class="chip-btn ${c.id === child.id ? 'on' : ''}" data-child="${esc(c.id)}">${esc(c.avatar)} ${esc(c.name)}</button>`).join('')
      : '';
    $$('#rec-child [data-child]').forEach(b => {
      b.addEventListener('click', () => { S.setActiveChild(b.dataset.child); renderRecords(); });
    });

    const days = S.recordDays();
    const week = S.weekStats(days, child.id);
    const today = S.logsToday(child.id);
    const logs = S.state.logs.filter(l => l.childId === child.id);
    const allCounts = S.counts(logs);

    $('#st-week').textContent = week.reduce((n, d) => n + d.success, 0);
    $('#st-total').textContent = logs.length;
    $('#st-rate').textContent = allCounts.total ? Math.round((allCounts.success / allCounts.total) * 100) + '%' : '–';

    $('#chart-title').textContent = '최근 ' + days + '일';
    $('#chart-hint').textContent = S.isPlus() ? '' : '30일은 Plus';

    const max = Math.max(1, ...week.map(d => d.success));
    const todayKey = S.dayKey();
    const dense = days > 10;
    $('#chart').className = 'chart' + (dense ? ' dense' : '');
    $('#chart').innerHTML = week.map(d => `
      <div class="bar-col ${d.key === todayKey ? 'today' : ''}">
        <div class="bar-track">
          <div class="bar-fill" style="height:${Math.round((d.success / max) * 100)}%"></div>
        </div>
        <span class="d">${dense ? (d.dayNum % 5 === 0 ? d.dayNum : '') : d.label}</span>
      </div>
    `).join('');

    $('#today-logs').innerHTML = today.length
      ? today.map(logRow).join('')
      : `<div class="empty">오늘 기록이 아직 없어요.<br>하루에 한 번이면 충분합니다.</div>`;
  }

  /* ================= 설정 ================= */

  function renderSettings() {
    const child = S.activeChild();

    $('#child-chips').innerHTML = S.children().map(c => `
      <button class="chip-btn ${c.id === child.id ? 'on' : ''}" data-child="${esc(c.id)}">
        ${esc(c.avatar)} ${esc(c.name)}
      </button>
    `).join('');
    $$('#child-chips [data-child]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.child;
        if (S.state.activeChildId !== id) {
          S.setActiveChild(id);
          renderSettings();
          return;
        }
        const c = S.activeChild();
        const name = await askText({ title: '이름 바꾸기', text: '아이 이름이나 별명', ok: '저장', value: c.name });
        if (name !== null && name.trim()) {
          S.updateChild(c.id, { name: name.trim().slice(0, 8) });
          renderSettings();
        }
      });
    });
    $('#child-add').textContent = S.canAddChild() ? '아이 추가' : '추가';

    $$('#set-age button').forEach(b => b.classList.toggle('on', Number(b.dataset.age) === (child.age || S.state.age)));
    $('#set-sound').classList.toggle('on', !!S.state.sound);
    $('#set-haptics').classList.toggle('on', !!S.state.haptics);
    $('#haptics-row').hidden = !navigator.vibrate;
    $$('#set-theme button').forEach(b => b.classList.toggle('on', (S.state.theme || 'auto') === b.dataset.theme));

    const supported = 'Notification' in window;
    $('#set-notify').textContent = S.state.notify ? '끄기' : '켜기';
    if (!supported) {
      $('#set-notify-state').textContent = '이 브라우저는 지원하지 않아요';
    } else if (Notification.permission === 'denied') {
      $('#set-notify-state').textContent = '차단됨 — 브라우저 설정에서 허용';
    } else if (Notification.permission === 'granted') {
      $('#set-notify-state').textContent = S.state.notify ? '켜짐' : '꺼짐';
    } else {
      $('#set-notify-state').textContent = '아직 허용 안 함';
    }

    $('#notify-note').textContent = isIOS() && !isStandalone()
      ? '아이폰은 홈 화면에 추가해야 알림이 와요. 앱을 닫으면 알림이 늦을 수 있어요.'
      : '앱을 닫으면 알림이 늦을 수 있어요. 돌아오면 바로 알려드려요.';

    const standalone = isStandalone();
    $('#install-block').hidden = standalone;

    $('#preset-settings').innerHTML = S.state.presets.map(p => `
      <div class="set-item">
        <span class="k">${esc(p.icon)} ${esc(p.label)}
          <small>${modeOf(p) === 'during' ? p.label + '에 주는 시간' : p.label + ' 시작까지'}</small>
        </span>
        <div class="row wrap" style="gap:8px">
          <input class="time-input" type="time" value="${esc(p.time)}" data-key="${esc(p.key)}" aria-label="${esc(p.label)} 시간">
          <div class="seg" data-seg="${esc(p.key)}">
            ${[3, 5, 10, 15].map(m => `<button data-min="${m}" class="${p.minutes === m ? 'on' : ''}">${m}</button>`).join('')}
          </div>
          <button class="btn ghost sm" data-mode="${esc(p.key)}">${modeOf(p) === 'during' ? '시작까지로' : '하는 동안으로'}</button>
          ${p.custom ? `<button class="btn ghost sm" data-remove="${esc(p.key)}">삭제</button>` : ''}
        </div>
      </div>
    `).join('');

    $$('#preset-settings .time-input').forEach(inp => {
      inp.addEventListener('change', () => {
        if (!inp.value) return;
        S.updatePreset(inp.dataset.key, { time: inp.value });
        toast('시간을 바꿨어요');
      });
    });

    $$('#preset-settings [data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = S.presetByKey(btn.dataset.mode);
        if (!p) return;
        const next = modeOf(p) === 'during' ? 'until' : 'during';
        S.updatePreset(p.key, { mode: next });
        renderSettings();
        toast(next === 'during' ? '하는 동안으로 바꿨어요' : '시작까지로 바꿨어요');
      });
    });

    $$('#preset-settings .seg').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('button[data-min]');
        if (!b) return;
        S.updatePreset(seg.dataset.seg, { minutes: Number(b.dataset.min) });
        renderSettings();
      });
    });

    $$('#preset-settings [data-remove]').forEach(b => {
      b.addEventListener('click', async () => {
        const ok = await askConfirm({ title: '전환을 지울까요?', text: '기록은 그대로 남아요.', ok: '지우기' });
        if (!ok) return;
        S.removePreset(b.dataset.remove);
        renderSettings();
      });
    });

    renderRoutineSettings();
  }

  function renderRoutineSettings() {
    const plus = S.isPlus();
    $('#routine-plan').innerHTML = plus ? '' : '<span class="lock-pill">Plus</span>';

    $('#routine-settings').innerHTML = S.routines().map(r => `
      <div class="set-item" style="flex-direction:column;align-items:stretch;gap:10px">
        <div class="row between">
          <span class="k">${esc(r.icon)} ${esc(r.name)}</span>
          <span class="muted">${r.steps.length}단계</span>
        </div>
        ${r.steps.map((s, i) => `
          <div class="row between" style="gap:8px">
            <span class="muted" style="flex:1">${esc(s.icon)} ${esc(s.label)}</span>
            <div class="seg" data-routine="${esc(r.id)}" data-step="${i}">
              ${[3, 5, 10, 15, 20].map(m => `<button data-min="${m}" class="${s.minutes === m ? 'on' : ''}" ${plus ? '' : 'disabled'}>${m}</button>`).join('')}
            </div>
          </div>`).join('')}
        ${plus ? '' : '<button class="btn ghost sm" data-upgrade="routine">Plus로 열기</button>'}
      </div>
    `).join('');

    $$('#routine-settings .seg').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('button[data-min]');
        if (!b || !S.isPlus()) return;
        S.updateRoutineStep(seg.dataset.routine, Number(seg.dataset.step), Number(b.dataset.min));
        renderRoutineSettings();
      });
    });

    $$('#routine-settings [data-upgrade]').forEach(b => {
      b.addEventListener('click', () => showPaywall('routine'));
    });
  }

  /* ================= 페이월 ================= */

  const PAYWALL_COPY = {
    timer: { title: '오늘 5번을 다 썼어요', why: '내일 다시 무료로 쓸 수 있어요. Plus는 횟수 제한이 없습니다.' },
    routine: { title: '매일 아침 4단계를 한 번에', why: '기상부터 등원까지, 단계마다 시계를 켜지 않아도 됩니다.' },
    photo: { title: '내 물건 사진으로 카드 만들기', why: '이모지보다 아이가 바로 알아봅니다.' },
    child: { title: '아이 두 명까지', why: '형제는 같은 규칙으로 각자의 기록을 가집니다.' },
    preset: { title: '전환을 더 만들기', why: '우리 집 하루에 맞게 직접 추가할 수 있어요.' }
  };

  function showPaywall(trigger) {
    const copy = PAYWALL_COPY[trigger] || PAYWALL_COPY.routine;
    $('#paywall-title').textContent = copy.title;
    $('#paywall-why').textContent = copy.why;
    if (TAB_VIEWS.includes(currentView)) paywallReturn = currentView;
    S.track('paywall_view', { trigger });
    go('paywall');
  }

  /* ================= 타이머 ================= */

  let timer = null;
  let ticking = null;
  let warnTimer = null;
  let endPanelLogId = null;
  let endPanelTimer = null;
  let endMode = 'normal';
  let extendUsed = false;
  let routineRun = null;
  let wakeLock = null;

  // 모래가 병 위쪽 20%를 비워두어야 토끼가 잘리지 않는다
  const FILL_MAX = 0.8;
  const fillPct = pct => (Math.max(0, Math.min(100, pct)) * FILL_MAX).toFixed(3) + '%';

  function timerGate() {
    if (S.isPlus()) return true;
    if (!S.canStartTimer()) { showPaywall('timer'); return false; }
    return true;
  }

  function startTimer(opts) {
    if (!opts.isTrial && !opts.fromRoutine && !timerGate()) return;

    stopTimer(true);

    const start = Date.now();
    timer = {
      label: opts.label,
      icon: opts.icon || '⏳',
      minutes: opts.minutes,
      start,
      endsAt: start + opts.minutes * 60000,
      totalMs: opts.minutes * 60000,
      presetKey: opts.presetKey || null,
      mode: opts.mode === 'during' ? 'during' : 'until',
      routineId: opts.routineId || null,
      stepIndex: opts.stepIndex === undefined ? null : opts.stepIndex,
      childId: S.state.activeChildId,
      warned: false,
      midDone: false,
      isTrial: !!opts.isTrial
    };
    extendUsed = false;
    S.track('timer_start', { minutes: opts.minutes, preset: opts.presetKey || null, trial: !!opts.isTrial });
    if (!S.isPlus() && !opts.isTrial) S.consumeTimer();

    paintKid();
    openFull('kid');
    unlockAudio();
    chime('start');
    requestWakeLock();
    persist();
    scheduleNotifications(timer);

    ticking = setInterval(tick, 100);
    tick();
  }

  /* 용도에 따라 말이 달라야 한다.
     'until'  = 그 일이 시작되기까지 → "10분 더 놀고 시작해요"
     'during' = 그 일에 주어진 시간   → "10분 안에 끝내요" */
  function modeOf(x) { return x && x.mode === 'during' ? 'during' : 'until'; }

  function useLine(label, minutes, mode) {
    return mode === 'during'
      ? label + ' ' + minutes + '분 안에 끝내요.'
      : minutes + '분 더 하고 ' + label + ' 시작해요.';
  }

  function useShort(minutes, mode) {
    return mode === 'during' ? minutes + '분 안에' : minutes + '분 뒤';
  }

  function paintKid() {
    $('#sand').style.height = fillPct(100);
    $('#bunny').style.bottom = fillPct(100);
    $('#bunny').className = 'bunny';
    $('#bunny').textContent = '🐰';
    $('#door').className = 'door';
    $('#end-panel').className = 'end-panel';
    $('#kid-wrap').className = 'kid-wrap';
    renderDots();
  }

  function renderDots() {
    const box = $('#routine-dots');
    if (!routineRun) { box.innerHTML = ''; return; }
    box.innerHTML = routineRun.routine.steps.map((s, i) => {
      const cls = i < routineRun.index ? 'done' : (i === routineRun.index ? 'on' : '');
      return `<i class="${cls}"></i>`;
    }).join('');
  }

  function persist() {
    if (!timer) { S.clearPending(); return; }
    S.savePending({
      label: timer.label, icon: timer.icon, minutes: timer.minutes,
      start: timer.start, endsAt: timer.endsAt, totalMs: timer.totalMs,
      presetKey: timer.presetKey, mode: timer.mode,
      routineId: timer.routineId, stepIndex: timer.stepIndex,
      childId: timer.childId, warned: timer.warned, isTrial: timer.isTrial
    });
  }

  function tick() {
    if (!timer) return;
    const remain = Math.max(0, timer.endsAt - Date.now());
    const pct = (remain / timer.totalMs) * 100;

    $('#sand').style.height = fillPct(pct);
    $('#bunny').style.bottom = fillPct(pct);

    // 절반을 지나는 순간: 아이가 "마음의 준비"를 시작할 수 있는 첫 신호.
    // 2분 미만이면 30초 예고와 붙어버리므로 생략한다.
    const half = timer.totalMs / 2;
    if (timer.totalMs >= 120000 && remain <= half && remain > 30000 && !timer.midDone) {
      timer.midDone = true;
      persist();
      chime('mid');
      buzz([40, 70, 40]);
      cue('절반 지났어요');
      S.track('timer_mid', { preset: timer.presetKey });
    }

    if (remain <= 30000 && remain > 0 && !timer.warned) {
      timer.warned = true;
      persist();
      const bunny = $('#bunny');
      if (!reduceMotion.matches) {
        bunny.classList.add('wave');
        setTimeout(() => bunny.classList.remove('wave'), 3400);
      }
      chime('soon');
      buzz([120, 80, 120]);
      cue('곧 끝나요');
      S.track('timer_warn30', { preset: timer.presetKey });
    }

    if (remain <= 0) finish();
  }

  function finish() {
    if (!timer) return;
    const t = timer;
    clearInterval(ticking);
    ticking = null;
    clearTimeout(warnTimer);
    warnTimer = null;
    clearCue();

    const log = S.addLog({
      label: t.label, icon: t.icon, minutes: t.minutes,
      start: t.start, end: Date.now(), outcome: 'success',
      childId: t.childId, routineId: t.routineId, stepIndex: t.stepIndex, trial: t.isTrial
    });
    timer = null;
    S.clearPending();
    S.track('timer_end', { preset: t.presetKey, outcome: 'success' });

    $('#sand').style.height = fillPct(0);
    $('#bunny').style.bottom = fillPct(0);
    $('#door').classList.add('on');
    const bunny = $('#bunny');
    bunny.classList.remove('wave');
    bunny.classList.add('leave');

    chime('end');
    buzz(180);

    const delay = reduceMotion.matches ? 0 : 1200;
    setTimeout(() => {
      endPanelLogId = log.id;
      setupEndPanel(t);
      $('#end-panel').classList.add('on');
    }, delay);

    endPanelTimer = setTimeout(() => {
      if ($('#view-kid').classList.contains('active')) closeKid();
    }, 16000 + delay);
  }

  function setupEndPanel(ended) {
    const mode = ended && ended.mode === 'during' ? 'during' : 'until';
    const hasNext = routineRun && routineRun.index < routineRun.routine.steps.length - 1;
    if (hasNext) {
      endMode = 'routine';
      const nextStep = routineRun.routine.steps[routineRun.index + 1];
      $('#end-hint').textContent = '다음 단계';
      $('#end-extend').textContent = '여기서 그만';
      $('#end-done').textContent = '다음: ' + nextStep.label;
    } else {
      endMode = 'normal';
      $('#end-hint').textContent = mode === 'during' ? '끝났어요' : '이제 시작';
      $('#end-extend').textContent = extendUsed ? '3분 더 (사용함)' : '3분 더';
      $('#end-extend').disabled = extendUsed;
      $('#end-done').textContent = routineRun
        ? '다 끝났어요'
        : (mode === 'during' ? '다 했어요' : '잘 넘어갔어요');
    }
  }

  function closeKid() {
    clearTimeout(endPanelTimer);
    endPanelTimer = null;
    endPanelLogId = null;
    endMode = 'normal';
    routineRun = null;
    $('#end-panel').className = 'end-panel';
    $('#routine-dots').innerHTML = '';
    clearCue();
    $('#view-kid').classList.remove('active');
    releaseWakeLock();
    closeFull();
  }

  function stopTimer(silent) {
    clearInterval(ticking);
    ticking = null;
    clearTimeout(warnTimer);
    warnTimer = null;
    clearTimeout(endPanelTimer);
    endPanelTimer = null;
    if (timer) {
      if (!silent) {
        S.addLog({
          label: timer.label, icon: timer.icon, minutes: timer.minutes,
          start: timer.start, end: Date.now(), outcome: 'abort',
          childId: timer.childId, routineId: timer.routineId, stepIndex: timer.stepIndex
        });
        S.track('timer_abort', { preset: timer.presetKey, elapsed: Date.now() - timer.start });
      }
      S.clearPending();
    }
    timer = null;
  }

  /* ---------- 루틴 실행 ---------- */

  function startRoutine(id) {
    const r = S.routineById(id);
    if (!r || !r.steps.length) return;
    routineRun = { routine: r, index: 0 };
    startRoutineStep();
  }

  function startRoutineStep() {
    const step = routineRun.routine.steps[routineRun.index];
    startTimer({
      label: step.label, icon: step.icon, minutes: step.minutes,
      mode: step.mode === 'until' ? 'until' : 'during',
      routineId: routineRun.routine.id, stepIndex: routineRun.index,
      fromRoutine: true
    });
  }

  /* ---------- 복원 ---------- */

  function restorePending() {
    const p = S.loadPending();
    if (!p) return false;
    const now = Date.now();

    if (p.endsAt && now < p.endsAt) {
      timer = {
        label: p.label, icon: p.icon, minutes: p.minutes, start: p.start,
        endsAt: p.endsAt, totalMs: p.totalMs || p.minutes * 60000,
        presetKey: p.presetKey, mode: p.mode === 'during' ? 'during' : 'until',
        routineId: p.routineId, stepIndex: p.stepIndex,
        childId: p.childId || S.state.activeChildId,
        warned: now <= p.endsAt - 30000,
        midDone: now <= p.endsAt - (p.totalMs || p.minutes * 60000) / 2,
        isTrial: !!p.isTrial
      };
      extendUsed = false;
      if (timer.routineId) {
        const r = S.routineById(timer.routineId);
        if (r) routineRun = { routine: r, index: timer.stepIndex || 0 };
      }
      paintKid();
      openFull('kid');
      ticking = setInterval(tick, 100);
      tick();
      S.track('timer_restore', { expired: false });
      toast('하던 시계를 이어갑니다');
      return true;
    }

    const ageMs = now - (p.endsAt || now);
    S.clearPending();
    S.track('timer_restore', { expired: true });
    if (ageMs <= 12 * 3600000) {
      S.addLog({
        label: p.label, icon: p.icon, minutes: p.minutes,
        start: p.start, end: p.endsAt || now, outcome: 'success',
        childId: p.childId || S.state.activeChildId,
        routineId: p.routineId, stepIndex: p.stepIndex
      });
      setTimeout(() => toast('아까 그 시계, 이미 끝났어요'), 400);
    }
    return false;
  }

  /* ---------- 알림 ---------- */

  async function swPost(msg) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const w = reg.active || reg.waiting || reg.installing;
      if (w) w.postMessage(msg);
    } catch (e) {}
  }

  function notifyAllowedAt(ts) {
    if (!S.state.notify) return false;
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    if (S.inQuietHours(new Date(ts))) return false;
    return true;
  }

  function scheduleNotifications(t) {
    if (!S.state.notify) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const warnAt = t.endsAt - 30000;
    const endAt = t.endsAt;
    const endAllowed = notifyAllowedAt(endAt);
    const warnAllowed = notifyAllowedAt(warnAt) && warnAt > Date.now();

    if (warnAllowed && S.canNotify()) {
      S.markNotify();
      warnTimer = setTimeout(() => {
        if (!timer) return;
        showNotification(t.label + ' 30초 남았어요. 곧 끝난다고 알려주세요.', 'warn', t.start);
      }, Math.max(0, warnAt - Date.now()));
      swPost({ type: 'schedule', at: warnAt, body: t.label + ' 30초 남았어요.', tag: 'miri-' + t.start });
    }

    if (endAllowed && S.canNotify()) {
      S.markNotify();
      swPost({ type: 'schedule', at: endAt, body: t.label + ' 시간이 다 됐어요.', tag: 'miri-' + t.start + '-end' });
    }
  }

  function showNotification(body, kind, key) {
    try {
      const n = new Notification('미리', {
        body,
        tag: 'miri-' + key + (kind === 'warn' ? '' : '-end'),
        badge: 'icons/icon-192.png',
        icon: 'icons/icon-192.png',
        silent: false
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {}
  }

  /* ---------- 화면 잠금 방지 ---------- */

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {}
  }

  function releaseWakeLock() {
    try {
      if (wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }

  /* ================= 사진 카드 ================= */

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function resizeImage(dataUrl, max) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', 0.82)); }
        catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function addPhoto(file) {
    if (!file) return;
    const raw = await readFileAsDataURL(file);
    const small = await resizeImage(raw, 512);
    const id = S.uid('img_');
    const ok = await S.putCard(id, small);
    if (!ok) { toast('사진을 저장하지 못했어요'); return; }
    mediaCache[id] = small;
    S.addCardMeta(photoSetKey, '내 사진', id);
    S.track('photo_add', { setKey: photoSetKey });
    renderPhotoSection();
    toast('카드를 만들었어요');
  }

  /* ================= 내보내기 ================= */

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  /* ================= 이벤트 ================= */

  function bind() {
    $('#tabbar').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (b) go(b.dataset.tab);
    });

    // 시트
    $('#sheet-grid').addEventListener('click', e => {
      const b = e.target.closest('button[data-min]');
      if (b) sheetPick(Number(b.dataset.min));
    });
    $('#sheet-custom-go').addEventListener('click', () => {
      const v = Number($('#sheet-custom').value);
      if (!v) { toast('분을 입력해 주세요'); return; }
      sheetPick(v);
    });
    $('#sheet-cancel').addEventListener('click', closeSheet);
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

    // 확인 다이얼로그
    $('#confirm-ok').addEventListener('click', () => {
      const inp = $('#confirm-input');
      closeConfirm(inp.hidden ? true : inp.value);
    });
    $('#confirm-cancel').addEventListener('click', () => closeConfirm(inpHiddenValue()));
    $('#confirm').addEventListener('click', e => {
      if (e.target.id === 'confirm') closeConfirm(inpHiddenValue());
    });
    function inpHiddenValue() {
      const inp = $('#confirm-input');
      return inp.hidden ? false : null;
    }

    // 설정: 아이
    $('#set-age').addEventListener('click', e => {
      const b = e.target.closest('button[data-age]');
      if (!b) return;
      const age = Number(b.dataset.age);
      S.state.age = age;
      S.updateChild(S.activeChild().id, { age });
      renderSettings();
      toast('저장했어요');
    });

    $('#child-add').addEventListener('click', async () => {
      if (!S.canAddChild()) {
        if (S.children().length >= 2) { toast('아이는 두 명까지예요'); return; }
        showPaywall('child');
        return;
      }
      const name = await askText({ title: '아이 추가', text: '이름이나 별명 (최대 8자)', ok: '추가', placeholder: '둘째' });
      if (!name || !name.trim()) return;
      const c = S.addChild({ name: name.trim().slice(0, 8), age: S.state.age });
      if (c) {
        S.setActiveChild(c.id);
        renderSettings();
        toast('아이를 추가했어요');
      }
    });

    // 설정: 소리/진동/테마
    $('#set-sound').addEventListener('click', () => {
      S.state.sound = !S.state.sound;
      S.save();
      renderSettings();
      if (S.state.sound) chime('pick');
    });

    $('#set-haptics').addEventListener('click', () => {
      S.state.haptics = !S.state.haptics;
      S.save();
      renderSettings();
      if (S.state.haptics) buzz(40);
    });

    $('#set-theme').addEventListener('click', e => {
      const b = e.target.closest('button[data-theme]');
      if (!b) return;
      S.state.theme = b.dataset.theme;
      S.save();
      applyTheme();
      renderSettings();
    });

    // 설정: 알림
    $('#set-notify').addEventListener('click', async () => {
      if (!('Notification' in window)) { toast('이 브라우저는 알림을 지원하지 않아요'); return; }
      if (Notification.permission === 'denied') { toast('브라우저 설정에서 알림을 허용해 주세요'); return; }
      if (Notification.permission === 'granted') {
        S.state.notify = !S.state.notify;
        S.save();
        renderSettings();
        return;
      }
      const perm = await Notification.requestPermission();
      S.state.notify = perm === 'granted';
      S.save();
      S.track('notify_perm', { granted: perm === 'granted' });
      renderSettings();
      toast(perm === 'granted' ? '알림을 켰어요' : '알림이 막혀 있어요');
    });

    // 설정: 프리셋 추가
    $('#preset-add').addEventListener('click', async () => {
      if (!S.canAddPreset()) { showPaywall('preset'); return; }
      const name = await askText({ title: '전환 추가', text: '예: 학원, 할머니집', ok: '다음', placeholder: '학원' });
      if (!name || !name.trim()) return;
      const p = S.addPreset({ label: name.trim().slice(0, 12), icon: '⏳', minutes: 10, time: '18:00' });
      renderSettings();
      toast(p.label + ' 추가했어요');
    });

    // 설정: 데이터
    $('#data-export').addEventListener('click', () => {
      const json = JSON.stringify(S.dump(), null, 2);
      download('miri-' + S.dayKey() + '.json', json, 'application/json');
      toast('JSON으로 내보냈어요');
    });

    $('#data-export-csv').addEventListener('click', () => {
      download('miri-' + S.dayKey() + '.csv', S.toCSV(), 'text/csv;charset=utf-8');
      toast('CSV로 내보냈어요');
    });

    $('#data-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const added = S.importJSON(JSON.parse(text));
        go('records');
        toast(added + '건을 불러왔어요');
      } catch (err) {
        toast('불러오지 못했어요: ' + (err.message || '형식 오류'));
      }
    });

    $('#set-reset').addEventListener('click', async () => {
      const ok = await askConfirm({
        title: '모두 지울까요?',
        text: '기록·사진 카드·설정이 이 기기에서 사라집니다. 되돌릴 수 없어요.',
        ok: '지우기'
      });
      if (!ok) return;
      const ids = [];
      Object.values(S.state.cards).forEach(arr => arr.forEach(c => ids.push(c.id)));
      for (const id of ids) await S.delCard(id);
      mediaCache = {};
      S.reset();
      applyTheme();
      go('onboarding');
      obShow(1);
      toast('초기화했어요');
    });

    // 카드
    $('#photo-add').addEventListener('click', () => {
      if (!S.isPlus()) { showPaywall('photo'); return; }
      $('#photo-file').click();
    });
    $('#photo-file').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      addPhoto(file);
    });

    $('#choice-exit').addEventListener('click', () => { closeFull(); renderCards(); });
    $('#choice-close').addEventListener('click', () => { closeFull(); renderCards(); });
    $('#choice-again').addEventListener('click', () => {
      if (choiceState) showChoicePair(choiceState.set.key);
    });

    // 아이 화면
    $('#end-done').addEventListener('click', () => {
      chime('pick');
      if (endMode === 'routine' && routineRun) {
        routineRun.index += 1;
        clearTimeout(endPanelTimer);
        endPanelTimer = null;
        $('#end-panel').className = 'end-panel';
        startRoutineStep();
        return;
      }
      closeKid();
    });

    $('#end-extend').addEventListener('click', () => {
      if (endMode === 'routine') {
        if (endPanelLogId) S.setLogOutcome(endPanelLogId, 'abort');
        toast('루틴을 멈췄어요');
        closeKid();
        return;
      }
      if (extendUsed) return;
      extendUsed = true;
      if (endPanelLogId) S.setLogOutcome(endPanelLogId, 'extend');
      S.track('timer_extend', { preset: timer ? timer.presetKey : null, count: 1 });

      const label = $('#hero-lb').textContent;
      const prev = timer;
      const preset = S.nextPreset();
      closeKid();
      setTimeout(() => {
        startTimer({
          label: prev ? prev.label : label,
          icon: prev ? prev.icon : '⏳',
          minutes: 3,
          presetKey: prev ? prev.presetKey : (preset ? preset.key : null)
        });
        extendUsed = true;
      }, 260);
    });

    // 1.5초 길게 눌러야 나가짐 — 아이가 실수로 끄지 못하게 하는 장치.
    // 다만 "눌러도 아무 일이 없다"는 고장으로 보이므로, 누르는 동안 채워지는
    // 표시와 짧게 눌렀을 때의 안내를 함께 준다.
    const exitBtn = $('#kid-exit');
    let holdTimer = null;

    const doExit = () => {
      clearTimeout(holdTimer);
      holdTimer = null;
      exitBtn.classList.remove('holding');
      if (timer) {
        stopTimer(false);
        closeKid();
        toast('중단으로 기록했어요');
      } else {
        closeKid();
      }
    };

    const startHold = () => {
      clearTimeout(holdTimer);
      exitBtn.classList.add('holding');
      holdTimer = setTimeout(doExit, 1500);
    };

    const endHold = ({ hint }) => {
      const wasHolding = exitBtn.classList.contains('holding');
      clearTimeout(holdTimer);
      holdTimer = null;
      exitBtn.classList.remove('holding');
      if (hint && wasHolding && timer) toast('1.5초 길게 누르면 나갈 수 있어요');
    };

    exitBtn.addEventListener('pointerdown', startHold);
    exitBtn.addEventListener('pointerup', () => endHold({ hint: true }));
    exitBtn.addEventListener('pointerleave', () => endHold({ hint: false }));
    exitBtn.addEventListener('pointercancel', () => endHold({ hint: false }));
    // 길게 누르기는 아이를 위한 장치다. 키보드로 조작하는 부모는 바로 나간다.
    exitBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doExit(); }
    });

    // 설치 배너
    $('#install-banner-x').addEventListener('click', () => {
      S.state.installHintSeen = true;
      S.save();
      $('#install-banner').hidden = true;
    });
    $('#install-banner-go').addEventListener('click', async () => {
      S.state.installHintSeen = true;
      S.save();
      $('#install-banner').hidden = true;
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (e) {}
        deferredPrompt = null;
        S.track('install_prompt', { action: 'accepted' });
      } else {
        toast(isIOS() ? 'Safari 공유 → 홈 화면에 추가' : '브라우저 메뉴 → 홈 화면에 추가');
        S.track('install_prompt', { action: 'guide' });
      }
    });

    // 페이월
    $('#paywall-cta').addEventListener('click', () => {
      S.setPlan('plus');
      toast('Plus를 켰어요 (베타)');
      go(paywallReturn);
    });
    $('#paywall-later').addEventListener('click', () => go(paywallReturn));
    $('#paywall-back').addEventListener('click', () => go(paywallReturn));

    // 상태 변화
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
      if (!timer) return;
      if (document.visibilityState === 'visible') {
        tick();
        requestWakeLock();
      }
    });

    window.addEventListener('online', () => { $('#offline-bar').hidden = true; });
    window.addEventListener('offline', () => { $('#offline-bar').hidden = false; });

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
    });

    // 다중 탭 동기화
    window.addEventListener('storage', e => {
      if (e.key !== 'miri.v2') return;
      if (currentView === 'home') renderHome();
      if (currentView === 'records') renderRecords();
    });

    darkMedia.addEventListener('change', () => { if ((S.state.theme || 'auto') === 'auto') applyTheme(); });
    reduceMotion.addEventListener('change', applyMotion);
  }

  /* ================= 시작 ================= */

  async function boot() {
    applyTheme();
    applyMotion();
    mediaCache = await S.allCards();

    obInit();
    bind();

    $('#offline-bar').hidden = navigator.onLine;

    const resumed = restorePending();

    if (!S.state.onboarded) {
      go('onboarding');
    } else if (!resumed) {
      go('home');
    }

    if (S.memoryOnly) {
      setTimeout(() => toast('이 브라우저는 기록을 저장하지 못해요'), 900);
    }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});

      // 새 워커가 제어를 가져오면 한 번만 새로고침해 최신 화면으로 맞춘다
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        if (sessionStorage.getItem('miri.reloaded') === '1') return;
        sessionStorage.setItem('miri.reloaded', '1');
        location.reload();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
