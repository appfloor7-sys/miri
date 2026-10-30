/* 미리 — 화면과 타이머 */
(() => {
  'use strict';

  const S = MiriStore;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const VIEWS = ['onboarding', 'home', 'cards', 'records', 'settings'];
  const FULL = ['kid', 'choice'];

  let currentView = 'home';

  /* ================= 공통 ================= */

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('on'), 2200);
  }

  function fmtClock(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function go(view) {
    VIEWS.forEach(v => $('#view-' + v).classList.toggle('active', v === view));
    const isFull = FULL.includes(view);
    FULL.forEach(v => $('#view-' + v).classList.toggle('active', v === view));
    if (!isFull) {
      currentView = view;
      $('#tabbar').hidden = view === 'onboarding';
      $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === view));
      window.scrollTo(0, 0);
    }
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

  /* ================= 소리 ================= */

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

  function chime(kind) {
    if (!S.state.sound) return;
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (kind === 'end') {
        tone(523.25, 0, 0.5, 0.16);
        tone(659.25, 0.13, 0.5, 0.14);
        tone(783.99, 0.26, 0.7, 0.12);
      } else if (kind === 'pick') {
        tone(784, 0, 0.12, 0.12);
        tone(1046.5, 0.09, 0.2, 0.10);
      } else {
        tone(880, 0, 0.25, 0.10);
        tone(1174.66, 0.16, 0.3, 0.08);
      }
    } catch (e) {}
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
      S.state.presets.forEach(p => { p.pinned = p.key === ob.moment; });
      S.save();
      const p = S.state.presets.find(x => x.key === ob.moment);
      if (p) {
        $('#ob-preview-em').textContent = p.icon;
        $('#ob-preview-lb').textContent = p.label;
        $('#ob-preview-mt').textContent = p.minutes + '분';
      }
      obShow(3);
    });

    $('#ob-start').addEventListener('click', () => {
      S.state.onboarded = true;
      S.save();
      const p = S.state.presets.find(x => x.key === ob.moment) || S.state.presets[0];
      currentView = 'home';
      $('#tabbar').hidden = false;
      go('home');
      startTimer({ label: p.label, icon: p.icon, minutes: 3, presetKey: p.key, isTrial: true });
    });

    $('#ob-skip').addEventListener('click', () => {
      S.state.onboarded = true;
      S.save();
      go('home');
    });

    $$('#ob-moment .opt').forEach(x => x.classList.toggle('sel', x.dataset.key === 'go'));
  }

  /* ================= 홈 ================= */

  function renderHome() {
    const now = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    $('#home-date').textContent = `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;

    const next = S.nextPreset(now);
    if (next) {
      $('#hero-em').textContent = next.icon;
      $('#hero-lb').textContent = next.label;
      $('#hero-sub').textContent = next.minutes + '분을 보여주고 시작하세요.';
      $('#hero-start').onclick = () => startTimer({ ...next, presetKey: next.key });
      $('#hero-change').onclick = () => openSheet(next.label, min => startTimer({ ...next, minutes: min, presetKey: next.key }));
    }

    const today = S.logsToday();
    const c = S.counts(today);
    $('#home-today-stat').textContent = today.length
      ? `성공 ${c.success} · 연장 ${c.extend}`
      : '아직 기록이 없어요';

    const grid = $('#preset-grid');
    grid.innerHTML = S.orderedPresets().map(p => `
      <button class="preset" data-key="${p.key}">
        ${p.pinned ? '<span class="pin">자주</span>' : ''}
        <span class="em">${p.icon}</span>
        <span class="lb">${p.label}</span>
        <span class="mt" data-min="${p.key}">${p.minutes}분 · ${p.time}</span>
        <span class="go">시계 켜기 →</span>
      </button>
    `).join('');

    grid.querySelectorAll('.preset').forEach(btn => {
      btn.addEventListener('click', e => {
        const p = S.orderedPresets().find(x => x.key === btn.dataset.key);
        if (!p) return;
        if (e.target.closest('[data-min]')) {
          e.stopPropagation();
          openSheet(p.label, min => startTimer({ ...p, minutes: min, presetKey: p.key }));
          return;
        }
        startTimer({ ...p, presetKey: p.key });
      });
    });

    const logs = S.state.logs.slice(0, 4);
    $('#home-log-count').textContent = S.state.logs.length ? `전체 ${S.state.logs.length}회` : '';
    $('#home-logs').innerHTML = logs.length
      ? logs.map(logRow).join('')
      : `<div class="empty">첫 전환을 기록해 보세요.<br>위에서 시계를 켜면 여기에 쌓입니다.</div>`;
  }

  const OUTCOME = {
    success: { cls: 's', text: '성공' },
    extend: { cls: 'e', text: '연장' },
    abort: { cls: 'a', text: '중단' }
  };

  function logRow(l) {
    const o = OUTCOME[l.outcome] || OUTCOME.success;
    return `<div class="log-item">
      <span class="log-em">${l.icon}</span>
      <span class="log-main">${l.label}</span>
      <span class="log-time">${fmtClock(l.start)} · ${l.minutes}분</span>
      <span class="tag ${o.cls}">${o.text}</span>
    </div>`;
  }

  /* ================= 시간 선택 시트 ================= */

  let sheetCb = null;

  function openSheet(title, cb) {
    sheetCb = cb;
    $('#sheet-title').textContent = title + ' — 몇 분?';
    $('#sheet').classList.add('on');
  }

  function closeSheet() {
    $('#sheet').classList.remove('on');
    sheetCb = null;
  }

  /* ================= 카드 ================= */

  function renderCards() {
    $('#set-list').innerHTML = S.cardSets.map(s => `
      <button class="set-tile" data-key="${s.key}">
        <span class="em">${s.emoji}</span>
        <span class="nm">${s.title}</span>
        <span class="arw">→</span>
      </button>
    `).join('');

    $$('#set-list .set-tile').forEach(btn => {
      btn.addEventListener('click', () => openChoice(btn.dataset.key));
    });

    const logs = S.state.choiceLogs.slice(0, 6);
    $('#choice-logs').innerHTML = logs.length
      ? logs.map(l => `<div class="log-item">
          <span class="log-em">${l.emoji}</span>
          <span class="log-main">${l.label}</span>
          <span class="log-time">${l.title}</span>
          <span class="log-time">${fmtClock(l.at)}</span>
        </div>`).join('')
      : `<div class="empty">아이가 고른 기록이 여기에 남습니다.<br>부모가 뒤집기 어려워지는 장치예요.</div>`;
  }

  let choiceState = null;

  function openChoice(setKey) {
    showChoicePair(setKey);
    openFull('choice');
  }

  function showChoicePair(setKey) {
    const { set, cards } = S.pairFor(setKey);
    choiceState = { set, cards, picked: false };
    $('#choice-q').textContent = set.title;
    $('#choice-foot').style.display = 'none';
    $('#choice-grid').innerHTML = cards.map((c, i) => `
      <button class="choice-card" data-i="${i}">
        <span class="em">${c.emoji}</span>
        <span class="lb">${c.label}</span>
      </button>
    `).join('');
    $('#choice-grid').querySelectorAll('.choice-card').forEach(btn => {
      btn.addEventListener('click', () => pickCard(Number(btn.dataset.i)));
    });
  }

  function pickCard(i) {
    if (!choiceState || choiceState.picked) return;
    choiceState.picked = true;
    const card = choiceState.cards[i];
    chime('pick');
    $('#choice-grid').querySelectorAll('.choice-card').forEach((el, idx) => {
      el.classList.toggle('pick', idx === i);
      el.classList.toggle('dim', idx !== i);
    });
    S.addChoice({ title: choiceState.set.title, emoji: card.emoji, label: card.label });
    setTimeout(() => { $('#choice-foot').style.display = 'flex'; }, 450);
  }

  /* ================= 기록 ================= */

  function renderRecords() {
    const week = S.weekStats(7);
    const today = S.logsToday();
    const c = S.counts(today);
    const all = S.counts(S.state.logs);

    $('#st-week').textContent = S.weekSuccess();
    $('#st-total').textContent = S.state.logs.length;
    $('#st-rate').textContent = all.total ? Math.round((all.success / all.total) * 100) + '%' : '–';

    const max = Math.max(1, ...week.map(d => d.success));
    const todayKey = new Date().toDateString();
    $('#chart').innerHTML = week.map(d => `
      <div class="bar-col ${d.key === todayKey ? 'today' : ''}">
        <div class="bar-track">
          <div class="bar-fill" style="height:${Math.round((d.success / max) * 100)}%"></div>
        </div>
        <span class="d">${d.label}</span>
      </div>
    `).join('');

    $('#today-logs').innerHTML = today.length
      ? today.map(logRow).join('')
      : `<div class="empty">오늘 기록이 아직 없어요.<br>하루에 한 번이면 충분합니다.</div>`;
  }

  /* ================= 설정 ================= */

  function renderSettings() {
    $$('#set-age button').forEach(b => b.classList.toggle('on', Number(b.dataset.age) === S.state.age));
    $('#set-sound').classList.toggle('on', !!S.state.sound);
    $('#set-notify').textContent = S.state.notify ? '켜짐' : '켜기';

    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    $('#install-block').hidden = standalone;

    $('#preset-settings').innerHTML = S.state.presets.map(p => `
      <div class="set-item">
        <span class="k">${p.icon} ${p.label}</span>
        <div class="row" style="gap:8px">
          <input class="time-input" type="time" value="${p.time}" data-key="${p.key}">
          <div class="seg" data-seg="${p.key}">
            ${[5, 10, 15, 20].map(m => `<button data-min="${m}" class="${p.minutes === m ? 'on' : ''}">${m}</button>`).join('')}
          </div>
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

    $$('#preset-settings .seg').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('button[data-min]');
        if (!b) return;
        S.updatePreset(seg.dataset.seg, { minutes: Number(b.dataset.min) });
        renderSettings();
      });
    });
  }

  /* ================= 타이머 ================= */

  let timer = null;
  let ticking = null;
  let notifyTimer = null;

  // 모래가 병 위쪽 20%를 비워두어야 토끼가 잘리지 않는다
  const FILL_MAX = 0.8;
  const fillPct = pct => (pct * FILL_MAX).toFixed(3) + '%';

  function startTimer({ label, icon, minutes, presetKey, isTrial }) {
    stopTimer(true);

    const start = Date.now();
    timer = {
      label,
      icon: icon || '⏳',
      minutes,
      start,
      endsAt: start + minutes * 60000,
      totalMs: minutes * 60000,
      presetKey: presetKey || null,
      warned: false,
      logId: null,
      isTrial: !!isTrial
    };

    $('#sand').style.height = fillPct(100);
    $('#bunny').style.bottom = fillPct(100);
    $('#bunny').className = 'bunny';
    $('#bunny').textContent = '🐰';
    $('#door').className = 'door';
    $('#end-panel').className = 'end-panel';
    $('#kid-wrap').className = 'kid-wrap';

    openFull('kid');
    unlockAudio();

    ticking = setInterval(tick, 100);
    tick();

    if (S.state.notify && 'Notification' in window && Notification.permission === 'granted') {
      notifyTimer = setTimeout(() => {
        if (!timer) return;
        try {
          new Notification('미리', { body: timer.label + ' 30초 남았어요. 곧 끝난다고 알려주세요.', silent: false });
        } catch (e) {}
      }, Math.max(0, timer.endsAt - 30000 - Date.now()));
    }
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

  function tick() {
    if (!timer) return;
    const remain = Math.max(0, timer.endsAt - Date.now());
    const pct = (remain / timer.totalMs) * 100;

    $('#sand').style.height = fillPct(pct);
    $('#bunny').style.bottom = fillPct(pct);

    if (remain <= 30000 && remain > 0 && !timer.warned) {
      timer.warned = true;
      const bunny = $('#bunny');
      bunny.classList.add('wave');
      chime('soon');
      if (navigator.vibrate) { try { navigator.vibrate([120, 80, 120]); } catch (e) {} }
      setTimeout(() => bunny.classList.remove('wave'), 3400);
    }

    if (remain <= 0) finish();
  }

  function finish() {
    if (!timer) return;
    const t = timer;
    clearInterval(ticking);
    ticking = null;
    clearTimeout(notifyTimer);
    notifyTimer = null;

    const log = S.addLog({ label: t.label, icon: t.icon, minutes: t.minutes, start: t.start, outcome: 'success' });
    timer = null;

    $('#sand').style.height = fillPct(0);
    $('#bunny').style.bottom = fillPct(0);
    $('#door').classList.add('on');
    const bunny = $('#bunny');
    bunny.classList.remove('wave');
    bunny.classList.add('leave');

    chime('end');
    if (navigator.vibrate) { try { navigator.vibrate(180); } catch (e) {} }

    setTimeout(() => {
      endPanelLogId = log.id;
      $('#end-panel').classList.add('on');
    }, 1200);

    endPanelTimer = setTimeout(() => {
      if ($('#view-kid').classList.contains('active')) closeKid();
    }, 16000);
  }

  let endPanelLogId = null;
  let endPanelTimer = null;

  function closeKid() {
    clearTimeout(endPanelTimer);
    endPanelTimer = null;
    endPanelLogId = null;
    $('#end-panel').className = 'end-panel';
    $('#view-kid').classList.remove('active');
    closeFull();
  }

  function stopTimer(silent) {
    clearInterval(ticking);
    ticking = null;
    clearTimeout(notifyTimer);
    notifyTimer = null;
    clearTimeout(endPanelTimer);
    endPanelTimer = null;
    if (timer && !silent) {
      S.addLog({ label: timer.label, icon: timer.icon, minutes: timer.minutes, start: timer.start, outcome: 'abort' });
    }
    timer = null;
  }

  /* ================= 이벤트 ================= */

  function bind() {
    $('#tabbar').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (b) go(b.dataset.tab);
    });

    $('#sheet-grid').addEventListener('click', e => {
      const b = e.target.closest('button[data-min]');
      if (!b) return;
      const min = Number(b.dataset.min);
      const cb = sheetCb;
      closeSheet();
      if (cb) cb(min);
    });
    $('#sheet-cancel').addEventListener('click', closeSheet);
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

    $$('#set-age button').forEach(b => {
      b.addEventListener('click', () => {
        S.state.age = Number(b.dataset.age);
        S.save();
        renderSettings();
        toast('저장했어요');
      });
    });

    $('#set-sound').addEventListener('click', () => {
      S.state.sound = !S.state.sound;
      S.save();
      renderSettings();
      if (S.state.sound) chime('pick');
    });

    $('#set-notify').addEventListener('click', async () => {
      if (!('Notification' in window)) { toast('이 브라우저는 알림을 지원하지 않아요'); return; }
      if (Notification.permission === 'granted') {
        S.state.notify = !S.state.notify;
        S.save();
        renderSettings();
        return;
      }
      const perm = await Notification.requestPermission();
      S.state.notify = perm === 'granted';
      S.save();
      renderSettings();
      toast(perm === 'granted' ? '알림을 켰어요' : '알림이 막혀 있어요');
    });

    $('#set-reset').addEventListener('click', () => {
      S.reset();
      toast('초기화했어요');
      go('onboarding');
      obShow(1);
    });

    // 카드 화면
    $('#choice-exit').addEventListener('click', () => { closeFull(); renderCards(); });
    $('#choice-close').addEventListener('click', () => { closeFull(); renderCards(); });
    $('#choice-again').addEventListener('click', () => {
      if (choiceState) showChoicePair(choiceState.set.key);
    });

    // 아이 화면 종료 패널
    $('#end-done').addEventListener('click', () => { chime('pick'); closeKid(); });

    $('#end-extend').addEventListener('click', () => {
      if (endPanelLogId) S.setLogOutcome(endPanelLogId, 'extend');
      const label = $('#hero-lb').textContent;
      closeKid();
      setTimeout(() => {
        const p = S.nextPreset();
        startTimer({ label: p ? p.label : label, icon: p ? p.icon : '⏳', minutes: 3, presetKey: p ? p.key : null });
      }, 260);
    });

    // 1.5초 길게 눌러야 나가짐
    const exitBtn = $('#kid-exit');
    let holdTimer = null;

    const startHold = () => {
      exitBtn.classList.add('holding');
      holdTimer = setTimeout(() => {
        exitBtn.classList.remove('holding');
        if (timer) stopTimer(false);
        closeKid();
        toast('중단으로 기록했어요');
      }, 1500);
    };
    const endHold = () => {
      exitBtn.classList.remove('holding');
      clearTimeout(holdTimer);
      holdTimer = null;
    };

    exitBtn.addEventListener('pointerdown', startHold);
    exitBtn.addEventListener('pointerup', endHold);
    exitBtn.addEventListener('pointerleave', endHold);
    exitBtn.addEventListener('pointercancel', endHold);

    document.addEventListener('visibilitychange', () => {
      if (!timer) return;
      if (document.visibilityState === 'visible') tick();
    });
  }

  /* ================= 시작 ================= */

  function boot() {
    obInit();
    bind();

    if (!S.state.onboarded) {
      go('onboarding');
    } else {
      go('home');
    }

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
