/* ============================================================
 * app.js — 画面制御とユーザー操作のハンドリング
 * ============================================================ */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => (el.hidden = true), 250);
    }, 2200);
  }

  // ---------- 触覚フィードバック ----------
  function haptic(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* noop */ }
  }

  // ---------- 光の波紋（フォースの所作） ----------
  function spawnForce(kind) {
    const wrap = $('#flashcardWrap');
    if (!wrap || wrap.hidden) return;
    const r = document.createElement('div');
    r.className = 'force-ripple ' + (kind || 'good');
    wrap.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
    setTimeout(() => r.remove(), 900);
  }

  // ---------- 発音（音声合成） ----------
  const TTS = {
    ok: 'speechSynthesis' in window,
    speak(text, lang) {
      if (!this.ok || !text) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (lang) u.lang = lang;
        u.rate = 0.95;
        speechSynthesis.speak(u);
      } catch (e) { /* noop */ }
    },
  };

  // ---------- テーマ ----------
  function resolveTheme(t) {
    if (t === 'auto') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    return t;
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', resolveTheme(t));
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolveTheme(t) === 'light' ? '#6366f1' : '#4f46e5');
  }
  function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const cur = Store.getSettings().theme || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    Store.updateSettings({ theme: next });
    applyTheme(next);
    toast({ auto: '自動（端末設定に追従）', light: 'ライト', dark: 'ダーク' }[next]);
  }

  // ---------- 状態 ----------
  const state = { view: 'decks', deckId: null, study: null };
  let suppressClick = false; // スワイプ直後のタップ（めくり）誤爆を抑止

  const views = {
    decks: $('#view-decks'),
    deck: $('#view-deck'),
    study: $('#view-study'),
    stats: $('#view-stats'),
  };

  function showView(name) {
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
    state.view = name;
    $('#backBtn').hidden = name === 'decks';
    $('#statsBtn').hidden = name === 'study' || name === 'stats';
    $('#menuToggle').hidden = name === 'study' || name === 'stats';
    const titles = { decks: '単語帳', deck: '単語一覧', study: '学習', stats: '学習統計' };
    $('#appTitle').textContent = titles[name] || '単語帳';
    window.scrollTo(0, 0);
  }

  // ============================================================
  //  デッキ一覧
  // ============================================================
  function renderDecks(filter = '') {
    const list = $('#deckList');
    let decks = Store.getDecks();
    const q = filter.trim().toLowerCase();
    if (q) decks = decks.filter((d) => d.name.toLowerCase().includes(q));

    $('#deckEmpty').hidden = Store.getDecks().length !== 0;
    list.innerHTML = decks
      .map((d) => {
        const p = Store.deckProgress(d);
        const dueBadge = p.due > 0 ? `<span class="due-badge">復習 ${p.due}</span>` : '';
        return `
        <button class="deck-card" data-deck="${d.id}">
          <div class="deck-card-head">
            <h3>${escapeHTML(d.name)}</h3>
            <div class="deck-badges">${dueBadge}<span class="badge">${p.total} 語</span></div>
          </div>
          <div class="progress-track"><div class="progress-bar" style="width:${p.pct}%"></div></div>
          <div class="deck-card-foot">
            <span class="chip chip-known">覚えた ${p.known}</span>
            <span class="chip chip-learning">学習中 ${p.learning}</span>
            <span class="chip chip-new">未学習 ${p.new}</span>
          </div>
        </button>`;
      })
      .join('');
    $$('.deck-card', list).forEach((el) =>
      el.addEventListener('click', () => openDeck(el.dataset.deck))
    );
  }

  // ============================================================
  //  デッキ詳細
  // ============================================================
  function openDeck(deckId) {
    state.deckId = deckId;
    renderDeck();
    showView('deck');
  }

  function renderDeck(filter = '') {
    const deck = Store.getDeck(state.deckId);
    if (!deck) return showView('decks');
    const p = Store.deckProgress(deck);
    $('#deckSummary').innerHTML = `
      <h2>${escapeHTML(deck.name)}</h2>
      <div class="progress-track big"><div class="progress-bar" style="width:${p.pct}%"></div></div>
      <p class="summary-line">
        全 ${p.total} 語 ・ 覚えた ${p.known} ・ 学習中 ${p.learning} ・ 未学習 ${p.new}
        <strong>（達成 ${p.pct}%）</strong>
      </p>
      ${p.due > 0 ? `<p class="due-line">今日の復習　<strong>${p.due}</strong> 語</p>` : ''}`;

    const q = filter.trim().toLowerCase();
    let cards = deck.cards;
    if (q)
      cards = cards.filter(
        (c) => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q)
      );

    $('#cardEmpty').hidden = deck.cards.length !== 0;
    $('#studyBtn').disabled = deck.cards.length === 0;

    const list = $('#cardList');
    list.innerHTML = cards
      .map((c) => {
        const st = Store.statusOf(c);
        const stLabel = { new: '未学習', learning: '学習中', known: '覚えた' }[st];
        const s = c.stats || {};
        return `
        <div class="word-card status-${st}" data-card="${c.id}">
          <span class="status-mark"></span>
          <div class="word-main">
            <div class="word-front-row">
              <span class="word-front">${escapeHTML(c.front) || '<em>（表が空）</em>'}</span>
              ${TTS.ok ? `<button class="speak-mini" data-speak aria-label="発音"><svg class="ic"><use href="#ic-sound"/></svg></button>` : ''}
            </div>
            <div class="word-back">${escapeHTML(c.back) || '<em>（裏が空）</em>'}</div>
            ${c.note ? `<div class="word-note">${escapeHTML(c.note)}</div>` : ''}
          </div>
          <div class="word-side">
            <span class="status-tag">${stLabel}</span>
            <span class="word-stat">${s.correct || 0}・${s.incorrect || 0}</span>
            <div class="word-actions">
              <button class="icon-btn sm" data-edit aria-label="編集"><svg class="ic"><use href="#ic-edit"/></svg></button>
              <button class="icon-btn sm" data-del aria-label="削除"><svg class="ic"><use href="#ic-trash"/></svg></button>
            </div>
          </div>
        </div>`;
      })
      .join('');

    $$('.word-card', list).forEach((el) => {
      const id = el.dataset.card;
      const card = deck.cards.find((c) => c.id === id);
      $('[data-edit]', el).addEventListener('click', () => openCardModal(id));
      $('[data-del]', el).addEventListener('click', () => confirmDeleteCard(id));
      const sp = $('[data-speak]', el);
      if (sp) sp.addEventListener('click', () => TTS.speak(card.front, deck.lang));
    });
  }

  // ============================================================
  //  学習モード（フラッシュカード / クイズ + SRS）
  // ============================================================
  function openStudySetup() {
    const deck = Store.getDeck(state.deckId);
    if (!deck || deck.cards.length === 0) return;
    const due = Store.getDueCards(deck).length;
    openModal(
      `
      <h2 class="modal-title">学習をはじめる</h2>
      <div class="seg-group">
        <span class="seg-label">出題範囲</span>
        <div class="segmented" id="segRange">
          <button data-v="due" class="${due ? 'active' : ''}">今日の復習 (${due})</button>
          <button data-v="all" class="${due ? '' : 'active'}">すべて (${deck.cards.length})</button>
          <button data-v="weak">苦手</button>
        </div>
      </div>
      <div class="seg-group">
        <span class="seg-label">モード</span>
        <div class="segmented" id="segMode">
          <button data-v="flash" class="active">カード</button>
          <button data-v="quiz">タイピング</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        <button class="btn btn-primary" id="startStudy">▶ はじめる</button>
      </div>`,
      (root) => {
        const seg = (id) => {
          const box = $('#' + id, root);
          box.addEventListener('click', (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            $$('button', box).forEach((x) => x.classList.remove('active'));
            b.classList.add('active');
          });
          return () => ($('.active', box) || $('button', box)).dataset.v;
        };
        const getRange = seg('segRange');
        const getMode = seg('segMode');
        $('#startStudy', root).addEventListener('click', () => {
          const range = getRange();
          const mode = getMode();
          closeModal();
          startStudy(range, mode);
        });
      }
    );
  }

  function collectCards(deck, range) {
    if (range === 'due') {
      const due = Store.getDueCards(deck);
      return due.length ? due : deck.cards.slice();
    }
    if (range === 'weak') {
      const weak = deck.cards.filter((c) => {
        const s = c.stats || {};
        return (s.incorrect || 0) > 0 && (s.incorrect || 0) >= (s.correct || 0);
      });
      return weak.length ? weak : deck.cards.slice();
    }
    return deck.cards.slice();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startStudy(range = 'all', mode = 'flash', cardsOverride) {
    const deck = Store.getDeck(state.deckId);
    if (!deck || deck.cards.length === 0) return;
    const cards = shuffle(cardsOverride ? cardsOverride.slice() : collectCards(deck, range));
    state.study = { cards, index: 0, mode, flipped: false, correct: 0, wrong: 0, wrongIds: [], range };

    $('#studyResult').hidden = true;
    $('#flashcardWrap').hidden = mode !== 'flash';
    $('#quizArea').hidden = mode !== 'quiz';
    $('#studyActions').hidden = mode !== 'flash';
    showView('study');
    renderStudyCard();
    // 初回のみスワイプ操作のチュートリアルを表示
    if (mode === 'flash' && !Store.getSettings().swipeCoached) $('#swipeCoach').hidden = false;
    else $('#swipeCoach').hidden = true;
  }

  function currentCard() {
    const s = state.study;
    return s && s.cards[s.index];
  }

  function renderStudyCard() {
    const s = state.study;
    const card = currentCard();
    if (!card) return finishStudy();
    const deck = Store.getDeck(state.deckId);
    s.flipped = false;
    const fc = $('#flashcard');
    const inner = fc.querySelector('.flashcard-inner');
    // 前カードが裏のままでも、次カードは必ず表から出す（めくり戻りを瞬時に行う）
    inner.style.transition = 'none';
    fc.style.transition = 'none';
    fc.classList.remove('flipped');
    fc.style.transform = '';
    fc.style.boxShadow = '';
    void fc.offsetWidth; // リフローを強制してアニメなしで即適用
    inner.style.transition = '';
    fc.style.transition = '';

    $('#studyCounter').textContent = `${s.index + 1} / ${s.cards.length}`;
    $('#studyProgressBar').style.width = Math.round((s.index / s.cards.length) * 100) + '%';

    if (s.mode === 'flash') {
      $('#cardFront').textContent = card.front || '（表が空）';
      $('#cardBack').textContent = (card.back || '（裏が空）') + (card.note ? `\n\n${card.note}` : '');
      if (Store.getSettings().autoSpeak) TTS.speak(card.front, deck.lang);
    } else {
      $('#quizPrompt').textContent = card.front || '（表が空）';
      const inp = $('#quizInput');
      inp.value = '';
      inp.disabled = false;
      $('#quizSubmit').disabled = false;
      $('#quizFeedback').hidden = true;
      setTimeout(() => inp.focus(), 60);
      if (Store.getSettings().autoSpeak) TTS.speak(card.front, deck.lang);
    }
  }

  function flipCard() {
    const s = state.study;
    if (!s || s.mode !== 'flash') return;
    s.flipped = !s.flipped;
    $('#flashcard').classList.toggle('flipped', s.flipped);
  }

  function gradeCurrent(grade) {
    const s = state.study;
    if (!s) return;
    const card = currentCard();
    Store.review(state.deckId, card.id, grade);
    haptic(grade === 'again' ? [18, 40, 18] : 22);
    spawnForce(grade === 'again' ? 'wrong' : 'good');
    if (grade === 'again') { s.wrong++; s.wrongIds.push(card.id); }
    else s.correct++;
    s.index++;
    if (s.index >= s.cards.length) finishStudy();
    else renderStudyCard();
  }

  // --- クイズ採点 ---
  function normalize(str) {
    return String(str || '')
      .trim().toLowerCase()
      .replace(/[、。／]/g, (m) => ({ '、': ',', '。': '', '／': '/' }[m]))
      .replace(/\s+/g, ' ')
      .replace(/[.。]/g, '');
  }
  function judgeQuiz(input, answer) {
    const ans = normalize(input);
    if (!ans) return false;
    // 答えは / ／ , ， 、 ; ； | などの区切りで複数許容
    const accepts = String(answer || '')
      .split(/[\/／,，、;；|･・]/)
      .map((x) => normalize(x.replace(/[（(].*?[)）]/g, '')))
      .filter(Boolean);
    return accepts.includes(ans);
  }
  function submitQuiz() {
    const s = state.study;
    if (!s || s.mode !== 'quiz') return;
    const card = currentCard();
    const input = $('#quizInput');
    if (input.disabled) return;
    const correct = judgeQuiz(input.value, card.back);
    input.disabled = true;
    $('#quizSubmit').disabled = true;
    const fb = $('#quizFeedback');
    fb.hidden = false;
    fb.className = 'quiz-feedback ' + (correct ? 'ok' : 'ng');
    fb.innerHTML = `
      <div class="qf-head">${correct ? '正解' : '不正解'}</div>
      <div class="qf-ans">正解：<strong>${escapeHTML(card.back)}</strong>
        ${TTS.ok ? '<button class="speak-mini" id="qfSpeak" aria-label="発音"><svg class="ic"><use href="#ic-sound"/></svg></button>' : ''}</div>
      ${card.note ? `<div class="qf-note">${escapeHTML(card.note)}</div>` : ''}
      <div class="qf-actions">
        ${correct ? '' : '<button class="btn btn-ghost sm" id="qfOverride">やっぱり正解にする</button>'}
        <button class="btn btn-primary" id="qfNext">次へ →</button>
      </div>`;
    const deck = Store.getDeck(state.deckId);
    const qs = $('#qfSpeak'); if (qs) qs.addEventListener('click', () => TTS.speak(card.back, deck.lang));
    let graded = correct;
    Store.review(state.deckId, card.id, correct ? 'good' : 'again');
    if (correct) s.correct++; else { s.wrong++; s.wrongIds.push(card.id); }

    const ov = $('#qfOverride');
    if (ov) ov.addEventListener('click', () => {
      if (graded) return;
      // 直前の「不正解」を取り消して正解扱いに
      Store.review(state.deckId, card.id, 'good');
      s.wrong--; s.wrongIds = s.wrongIds.filter((x) => x !== card.id); s.correct++;
      graded = true;
      ov.disabled = true; ov.textContent = '正解にしました';
    });
    $('#qfNext').addEventListener('click', () => {
      s.index++;
      if (s.index >= s.cards.length) finishStudy();
      else renderStudyCard();
    });
    $('#qfNext').focus();
  }

  function finishStudy() {
    const s = state.study;
    $('#studyProgressBar').style.width = '100%';
    $('#flashcardWrap').hidden = true;
    $('#quizArea').hidden = true;
    $('#studyActions').hidden = true;
    const total = s.correct + s.wrong;
    const rate = total ? Math.round((s.correct / total) * 100) : 0;
    $('#studyResultText').innerHTML =
      `${total} 語中 <strong class="ok">${s.correct}</strong> 語正解` +
      `（正答率 ${rate}%）、<strong class="ng">${s.wrong}</strong> 語まだでした。`;
    $('#restartWrongBtn').hidden = s.wrongIds.length === 0;
    $('#studyResult').hidden = false;
    renderDeck($('#cardSearch').value);
    renderDecks($('#deckSearch').value);
  }

  // --- スワイプ操作（フラッシュカード）：右=覚えた / 左=まだ ---
  const SWIPE_THRESHOLD = 110;
  function setupSwipe() {
    const fc = $('#flashcard');
    const hintL = $('.swipe-hint-left');
    const hintR = $('.swipe-hint-right');
    let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, moved = false;

    const clearFx = () => { hintL.style.opacity = 0; hintR.style.opacity = 0; fc.style.boxShadow = ''; };

    fc.addEventListener('pointerdown', (e) => {
      const s = state.study;
      if (!s || s.mode !== 'flash') return;
      if (e.target.closest('.speak-btn')) return;
      dragging = true; decided = false; moved = false;
      startX = e.clientX; startY = e.clientY; dx = 0;
      try { fc.setPointerCapture(e.pointerId); } catch (_) {}
      fc.style.transition = 'none';
    });

    fc.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx) + 4) { dragging = false; fc.style.transform = ''; clearFx(); return; } // 縦スクロール
        decided = true;
      }
      moved = true;
      const rot = dx / 22;
      fc.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
      const k = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD);
      if (dx > 0) {
        hintR.style.opacity = k; hintL.style.opacity = 0;
        fc.style.boxShadow = `0 18px 50px rgba(143,174,151,${0.16 + 0.34 * k})`;
      } else {
        hintL.style.opacity = k; hintR.style.opacity = 0;
        fc.style.boxShadow = `0 18px 50px rgba(194,145,138,${0.16 + 0.34 * k})`;
      }
    });

    const end = () => {
      if (!dragging) return;
      dragging = false;
      fc.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)';
      if (Math.abs(dx) > SWIPE_THRESHOLD) {
        const dir = dx > 0 ? 1 : -1;
        fc.style.transform = `translateX(${dir * 540}px) rotate(${dir * 18}deg)`;
        clearFx();
        setTimeout(() => gradeCurrent(dir > 0 ? 'good' : 'again'), 165);
      } else {
        fc.style.transform = ''; clearFx();
      }
      if (moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 80); }
    };
    fc.addEventListener('pointerup', end);
    fc.addEventListener('pointercancel', end);
  }

  // ============================================================
  //  学習統計
  // ============================================================
  function renderStats() {
    const g = Store.globalStats();
    const streak = Store.streakDays();
    const hist = Store.recentHistory(14);
    const max = Math.max(1, ...hist.map((h) => h.reviewed));
    const today = hist[hist.length - 1];

    const bars = hist
      .map((h) => {
        const pct = Math.round((h.reviewed / max) * 100);
        return `<div class="bar-col" title="${h.date}：${h.reviewed}回">
          <div class="bar" style="height:${h.reviewed ? Math.max(6, pct) : 2}%"></div>
          <span class="bar-label">${h.label.split('/')[1]}</span>
        </div>`;
      })
      .join('');

    const decks = Store.getDecks()
      .map((d) => {
        const p = Store.deckProgress(d);
        return `<div class="stat-deck">
          <div class="stat-deck-top"><span>${escapeHTML(d.name)}</span><span class="muted">${p.pct}%</span></div>
          <div class="progress-track"><div class="progress-bar" style="width:${p.pct}%"></div></div>
        </div>`;
      })
      .join('') || '<p class="muted">まだ単語帳がありません。</p>';

    const acc = g.totalReviews ? Math.round((g.totalCorrect / g.totalReviews) * 100) : 0;

    $('#statsContent').innerHTML = `
      <div class="stat-hero">
        <div class="streak-big">${streak}<small>日連続</small></div>
        <div class="stat-grid">
          <div class="stat-box"><b>${today.reviewed}</b><span>今日の学習</span></div>
          <div class="stat-box"><b>${g.due}</b><span>復習待ち</span></div>
          <div class="stat-box"><b>${g.known}/${g.totalCards}</b><span>覚えた</span></div>
          <div class="stat-box"><b>${acc}%</b><span>通算正答率</span></div>
        </div>
      </div>
      <h3 class="stats-sub">直近14日の学習回数</h3>
      <div class="bar-chart">${bars}</div>
      <h3 class="stats-sub">単語帳ごとの達成度</h3>
      <div class="stat-decks">${decks}</div>`;
  }

  // ============================================================
  //  モーダル
  // ============================================================
  const modalRoot = $('#modalRoot');
  function openModal(html, onMount) {
    $('#modalContent').innerHTML = html;
    modalRoot.hidden = false;
    document.body.style.overflow = 'hidden';
    if (onMount) onMount($('#modalContent'));
    const first = $('#modalContent input, #modalContent textarea, #modalContent button');
    if (first) setTimeout(() => first.focus(), 50);
  }
  function closeModal() {
    modalRoot.hidden = true;
    document.body.style.overflow = '';
    $('#modalContent').innerHTML = '';
  }
  modalRoot.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeModal(); });

  const LANGS = [
    ['en-US', '英語'], ['ja-JP', '日本語'], ['zh-CN', '中国語'], ['ko-KR', '韓国語'],
    ['fr-FR', 'フランス語'], ['de-DE', 'ドイツ語'], ['es-ES', 'スペイン語'], ['it-IT', 'イタリア語'],
  ];

  function openDeckModal(deck) {
    const editing = !!deck;
    const langOpts = LANGS.map(([v, l]) =>
      `<option value="${v}" ${editing && deck.lang === v ? 'selected' : ''}>${l}</option>`).join('');
    openModal(
      `
      <h2 class="modal-title">${editing ? '単語帳の設定' : '新しい単語帳'}</h2>
      <label class="field"><span>名前</span>
        <input id="m_deckName" type="text" maxlength="60" placeholder="例：英単語 / 世界史 / 化学用語"
               value="${escapeHTML(editing ? deck.name : '')}" /></label>
      <label class="field"><span>発音の言語（読み上げ用）</span>
        <select id="m_deckLang" class="select">${langOpts}</select></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        <button class="btn btn-primary" id="m_save">${editing ? '保存' : '作成'}</button>
      </div>`,
      (root) => {
        const input = $('#m_deckName', root);
        const submit = () => {
          const name = input.value.trim();
          const lang = $('#m_deckLang', root).value;
          if (!name) return toast('名前を入力してください');
          if (editing) {
            Store.updateDeck(deck.id, { name, lang });
            closeModal(); renderDeck($('#cardSearch').value); renderDecks();
          } else {
            const d = Store.addDeck(name, lang);
            closeModal(); renderDecks(); openDeck(d.id);
          }
        };
        $('#m_save', root).addEventListener('click', submit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      }
    );
  }

  function openCardModal(cardId) {
    const deck = Store.getDeck(state.deckId);
    const card = cardId ? deck.cards.find((c) => c.id === cardId) : null;
    const editing = !!card;
    openModal(
      `
      <h2 class="modal-title">${editing ? '単語を編集' : '単語を追加'}</h2>
      <label class="field"><span>表（問題・単語）</span>
        <textarea id="m_front" rows="2" placeholder="例：apple">${escapeHTML(editing ? card.front : '')}</textarea></label>
      <label class="field"><span>裏（答え・意味）</span>
        <textarea id="m_back" rows="2" placeholder="例：りんご">${escapeHTML(editing ? card.back : '')}</textarea></label>
      <label class="field"><span>メモ（任意）</span>
        <textarea id="m_note" rows="2" placeholder="例文・補足など">${escapeHTML(editing ? card.note : '')}</textarea></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        ${editing ? '' : '<button class="btn" id="m_save_more">続けて追加</button>'}
        <button class="btn btn-primary" id="m_save">${editing ? '保存' : '追加'}</button>
      </div>`,
      (root) => {
        const get = (id) => $('#' + id, root).value;
        const persist = () => {
          const front = get('m_front'), back = get('m_back');
          if (!front.trim() && !back.trim()) { toast('表か裏のどちらかは入力してください'); return false; }
          if (editing) Store.updateCard(state.deckId, card.id, { front: front.trim(), back: back.trim(), note: get('m_note').trim() });
          else Store.addCard(state.deckId, front, back, get('m_note'));
          renderDeck($('#cardSearch').value); renderDecks();
          return true;
        };
        $('#m_save', root).addEventListener('click', () => { if (persist()) closeModal(); });
        const more = $('#m_save_more', root);
        if (more) more.addEventListener('click', () => { if (persist()) { toast('追加しました'); openCardModal(); } });
      }
    );
  }

  function confirmDeleteCard(cardId) {
    const deck = Store.getDeck(state.deckId);
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) return;
    openModal(
      `<h2 class="modal-title">単語を削除</h2>
       <p class="modal-text">「<strong>${escapeHTML(card.front || card.back)}</strong>」を削除しますか？<br>この操作は取り消せません。</p>
       <div class="modal-actions">
         <button class="btn btn-ghost" data-close>キャンセル</button>
         <button class="btn btn-danger" id="m_del">削除する</button>
       </div>`,
      (root) => $('#m_del', root).addEventListener('click', () => {
        Store.deleteCard(state.deckId, cardId);
        closeModal(); renderDeck($('#cardSearch').value); renderDecks(); toast('削除しました');
      })
    );
  }

  function openDeckSettings() {
    const deck = Store.getDeck(state.deckId);
    if (!deck) return;
    const autoSpeak = Store.getSettings().autoSpeak;
    openModal(
      `
      <h2 class="modal-title">単語帳の設定</h2>
      <div class="settings-group">
        <button class="btn block" id="s_rename">名前・言語を変更</button>
        <button class="btn block" id="s_reset">学習記録をリセット</button>
      </div>
      ${TTS.ok ? `<label class="switch-row">
        <span>カード表示時に自動で発音する</span>
        <input type="checkbox" id="s_autospeak" ${autoSpeak ? 'checked' : ''} />
      </label>` : ''}
      <h3 class="settings-sub">取り込み・書き出し</h3>
      <label class="field"><span>CSVを貼り付けて取り込み（表,裏,メモ）</span>
        <textarea id="s_csv" rows="3" placeholder="apple,りんご&#10;dog,犬,ペットの代表"></textarea></label>
      <div class="settings-group">
        <button class="btn" id="s_import">取り込む</button>
        <button class="btn" id="s_importFile">ファイル</button>
        <button class="btn" id="s_export">CSV書き出し</button>
      </div>
      <input type="file" id="s_file" accept=".csv,text/csv,text/plain" hidden />
      <hr class="modal-sep" />
      <div class="settings-group">
        <button class="btn btn-danger block" id="s_deleteDeck">この単語帳を削除</button>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" data-close>閉じる</button></div>`,
      (root) => {
        $('#s_rename', root).addEventListener('click', () => openDeckModal(deck));
        $('#s_reset', root).addEventListener('click', () => {
          Store.resetDeckStats(deck.id);
          renderDeck($('#cardSearch').value); renderDecks(); toast('学習記録をリセットしました');
        });
        const as = $('#s_autospeak', root);
        if (as) as.addEventListener('change', () => { Store.updateSettings({ autoSpeak: as.checked }); });
        $('#s_import', root).addEventListener('click', () => {
          const text = $('#s_csv', root).value;
          if (!text.trim()) return toast('CSVを貼り付けてください');
          const n = Store.importCSV(deck.id, text);
          closeModal(); renderDeck($('#cardSearch').value); renderDecks(); toast(`${n} 語を取り込みました`);
        });
        $('#s_importFile', root).addEventListener('click', () => $('#s_file', root).click());
        $('#s_file', root).addEventListener('change', (e) => {
          const file = e.target.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const n = Store.importCSV(deck.id, String(reader.result));
            closeModal(); renderDeck($('#cardSearch').value); renderDecks(); toast(`${n} 語を取り込みました`);
          };
          reader.readAsText(file);
        });
        $('#s_export', root).addEventListener('click', () => download(`${deck.name || 'vocab'}.csv`, Store.exportCSV(deck.id), 'text/csv'));
        $('#s_deleteDeck', root).addEventListener('click', () => confirmDeleteDeck(deck));
      }
    );
  }

  function confirmDeleteDeck(deck) {
    openModal(
      `<h2 class="modal-title">単語帳を削除</h2>
       <p class="modal-text">「<strong>${escapeHTML(deck.name)}</strong>」と中の ${deck.cards.length} 語をすべて削除します。<br>この操作は取り消せません。</p>
       <div class="modal-actions">
         <button class="btn btn-ghost" data-close>キャンセル</button>
         <button class="btn btn-danger" id="m_del">削除する</button>
       </div>`,
      (root) => $('#m_del', root).addEventListener('click', () => {
        Store.deleteDeck(deck.id); closeModal(); showView('decks'); renderDecks(); toast('単語帳を削除しました');
      })
    );
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
    toast('書き出しました');
  }

  function openLibrary() {
    const presets = (typeof PRESETS !== 'undefined' ? PRESETS : []);
    const secDecks = (typeof SEC_DECKS !== 'undefined' ? SEC_DECKS : []);
    const wordbank = (typeof WORDBANK !== 'undefined' ? WORDBANK : []);
    const all = presets.concat(secDecks, wordbank);
    const wbWords = wordbank.reduce((n, d) => n + d.cards.length, 0);
    const secWords = secDecks.reduce((n, d) => n + d.cards.length, 0);

    const item = (p) => `
      <button class="lib-item" data-preset="${p.id}">
        <span class="lib-emoji">${p.emoji || '📘'}</span>
        <span class="lib-text">
          <span class="lib-name">${escapeHTML(p.name)}</span>
          <span class="lib-desc">${escapeHTML(p.desc || '')} ・ ${p.cards.length}語</span>
        </span>
        <span class="lib-add">＋</span>
      </button>`;

    const section = (title, sub, list) =>
      `<h3 class="lib-section">${title}${sub ? `<span>${sub}</span>` : ''}</h3><div class="lib-list">${list.map(item).join('')}</div>`;

    const html = `
      <h2 class="modal-title">ライブラリ</h2>
      <p class="modal-text">タップで単語帳に追加。追加後は自由に編集できます。</p>
      ${secDecks.length ? section('情報処理安全確保支援士 — 章別', `全${secWords}語`, secDecks) : ''}
      ${presets.length ? section('テーマ別', '', presets) : ''}
      ${wordbank.length ? section('英単語 — 頻度順', `${wbWords}語を500語ずつ収録`, wordbank) : ''}
      <div class="modal-actions"><button class="btn btn-primary" data-close>閉じる</button></div>`;

    openModal(html, (root) => {
      $$('.lib-item', root).forEach((el) =>
        el.addEventListener('click', () => {
          const preset = all.find((p) => p.id === el.dataset.preset);
          if (!preset) return;
          const deck = Store.addPresetDeck(preset);
          haptic(20);
          closeModal();
          renderDecks();
          openDeck(deck.id);
          toast(`「${preset.name}」を追加しました（${preset.cards.length}語）`);
        })
      );
    });
  }

  function openAppMenu() {
    openModal(
      `
      <h2 class="modal-title">メニュー</h2>
      <div class="settings-group">
        <button class="btn block" id="mn_stats">学習統計を見る</button>
        <button class="btn block" id="mn_theme">テーマを切り替え</button>
        <button class="btn block" id="mn_backup">全データをバックアップ</button>
        <button class="btn block" id="mn_restore">バックアップから復元</button>
        <button class="btn block" id="mn_about">このアプリについて</button>
      </div>
      <input type="file" id="mn_file" accept="application/json,.json" hidden />
      <div class="modal-actions"><button class="btn btn-primary" data-close>閉じる</button></div>`,
      (root) => {
        $('#mn_stats', root).addEventListener('click', () => { closeModal(); openStats(); });
        $('#mn_theme', root).addEventListener('click', cycleTheme);
        $('#mn_backup', root).addEventListener('click', () =>
          download(`vocab-backup-${new Date().toISOString().slice(0, 10)}.json`, Store.exportAll(), 'application/json'));
        $('#mn_restore', root).addEventListener('click', () => $('#mn_file', root).click());
        $('#mn_file', root).addEventListener('change', (e) => {
          const file = e.target.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try { Store.importAll(String(reader.result)); closeModal(); renderDecks(); showView('decks'); toast('復元しました'); }
            catch (err) { toast('ファイルを読み込めませんでした'); }
          };
          reader.readAsText(file);
        });
        $('#mn_about', root).addEventListener('click', openAboutModal);
      }
    );
  }

  function openAboutModal() {
    openModal(`
      <h2 class="modal-title">このアプリについて</h2>
      <p class="modal-text">科目を問わず使える汎用フラッシュカードアプリです。データは端末内（localStorage）にのみ保存され、外部送信はありません。</p>
      <ul class="about-list">
        <li>間隔反復で最適なタイミングに復習</li>
        <li>クイズ（タイピング）モード／発音読み上げ</li>
        <li>学習統計・連続日数 ／ スワイプ採点</li>
        <li>バックアップで端末間移行も可能</li>
      </ul>
      <div class="modal-actions"><button class="btn btn-primary" data-close>閉じる</button></div>`);
  }

  function openStats() { renderStats(); showView('stats'); }

  // ============================================================
  //  オンボーディング
  // ============================================================
  const SLIDES = [
    { title: '静けさの中に', text: '力は急がない。日々の小さな反復が、やがて確かな記憶の流れになる。ライブラリから単語帳を選べば、すぐに始められる。' },
    { title: '流れを読む', text: '間隔反復が、復習すべき「時」を計る。あなたはただ、目の前の一語に集中すればいい。' },
    { title: '手を伸ばす', text: 'カードに触れてめくり、左右へ払って記す。思考のままに、なめらかに。' },
  ];
  const EMBLEM = '<svg class="emblem"><use href="#ic-emblem"/></svg>';
  function showOnboarding() {
    const el = $('#onboard');
    let i = 0;
    const render = () => {
      const s = SLIDES[i];
      el.innerHTML = `
        <div class="onboard-card">
          <div class="onboard-mark">${EMBLEM}</div>
          <h2>${s.title}</h2>
          <p>${s.text}</p>
          <div class="dots">${SLIDES.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
          <div class="onboard-actions">
            ${i < SLIDES.length - 1
              ? `<button class="btn btn-ghost" id="ob_skip">スキップ</button><button class="btn btn-primary" id="ob_next">次へ</button>`
              : `<button class="btn" id="ob_start">自分で作る</button><button class="btn btn-primary" id="ob_lib">ライブラリから選ぶ</button>`}
          </div>
        </div>`;
      const next = $('#ob_next'); if (next) next.addEventListener('click', () => { i++; render(); });
      const skip = $('#ob_skip'); if (skip) skip.addEventListener('click', finish);
      const start = $('#ob_start'); if (start) start.addEventListener('click', finish);
      const lib = $('#ob_lib'); if (lib) lib.addEventListener('click', () => { finish(); openLibrary(); });
    };
    const finish = () => { Store.updateSettings({ onboarded: true }); el.hidden = true; el.innerHTML = ''; renderDecks(); };
    el.hidden = false;
    render();
  }

  // ============================================================
  //  イベント配線
  // ============================================================
  function wire() {
    $('#backBtn').addEventListener('click', () => {
      if (state.view === 'study') { showView('deck'); renderDeck($('#cardSearch').value); }
      else if (state.view === 'stats') { showView('decks'); renderDecks($('#deckSearch').value); }
      else if (state.view === 'deck') { showView('decks'); renderDecks($('#deckSearch').value); }
    });
    $('#statsBtn').addEventListener('click', openStats);
    $('#themeBtn').addEventListener('click', cycleTheme);
    $('#menuToggle').addEventListener('click', () => {
      if (state.view === 'deck') openDeckSettings();
      else openAppMenu();
    });

    // デッキ一覧
    $('#addDeckBtn').addEventListener('click', () => openDeckModal(null));
    $('#libraryBtn').addEventListener('click', openLibrary);
    $('#deckSearch').addEventListener('input', (e) => renderDecks(e.target.value));
    $('#emptyAddDeck').addEventListener('click', () => openDeckModal(null));
    $('#emptyLibrary').addEventListener('click', openLibrary);

    // デッキ詳細
    $('#addCardBtn').addEventListener('click', () => openCardModal(null));
    $('#studyBtn').addEventListener('click', openStudySetup);
    $('#deckMenuBtn').addEventListener('click', openDeckSettings);
    $('#cardSearch').addEventListener('input', (e) => renderDeck(e.target.value));

    // 学習：フラッシュカード
    $('#flashcard').addEventListener('click', (e) => { if (e.target.closest('.speak-btn') || suppressClick) return; flipCard(); });
    $('#flipBtn').addEventListener('click', flipCard);
    $('#coachOk').addEventListener('click', () => { Store.updateSettings({ swipeCoached: true }); $('#swipeCoach').hidden = true; });
    $('#speakFront').addEventListener('click', () => { const c = currentCard(); if (c) TTS.speak(c.front, Store.getDeck(state.deckId).lang); });
    $('#speakBack').addEventListener('click', () => { const c = currentCard(); if (c) TTS.speak(c.back, Store.getDeck(state.deckId).lang); });
    setupSwipe();

    // 学習：クイズ
    $('#quizForm').addEventListener('submit', (e) => { e.preventDefault(); submitQuiz(); });
    $('#speakQuiz').addEventListener('click', () => { const c = currentCard(); if (c) TTS.speak(c.front, Store.getDeck(state.deckId).lang); });

    // 結果
    $('#restartAllBtn').addEventListener('click', () => startStudy(state.study.range, state.study.mode));
    $('#restartWrongBtn').addEventListener('click', () => {
      const deck = Store.getDeck(state.deckId);
      const ids = new Set(state.study.wrongIds);
      startStudy(state.study.range, state.study.mode, deck.cards.filter((c) => ids.has(c.id)));
    });
    $('#backToDeckBtn').addEventListener('click', () => { showView('deck'); renderDeck($('#cardSearch').value); });

    // キーボード
    document.addEventListener('keydown', (e) => {
      if (!modalRoot.hidden) { if (e.key === 'Escape') closeModal(); return; }
      if (!$('#onboard').hidden || !$('#swipeCoach').hidden) return;
      if (state.view !== 'study' || !state.study) return;
      if (state.study.mode === 'flash') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
        else if ((e.key === 'ArrowRight' || e.key === 'j') && state.study.flipped) gradeCurrent('good');
        else if ((e.key === 'ArrowLeft' || e.key === 'f') && state.study.flipped) gradeCurrent('again');
      }
    });

    // テーマ自動追従（auto のとき端末設定変更に反応）
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if ((Store.getSettings().theme || 'auto') === 'auto') applyTheme('auto');
    });
  }

  // ---------- Service Worker ----------
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
    }
  }

  // ---------- 起動 ----------
  function init() {
    applyTheme(Store.getSettings().theme || 'auto');
    wire();
    renderDecks();
    showView('decks');
    if (!Store.getSettings().onboarded) showOnboarding();
    registerSW();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
