/* ============================================================
 * storage.js — localStorage を使ったデータ層
 *  デッキ（単語帳）/ カード / 学習統計 / 設定 を永続化する。
 *  間隔反復(SRS, SM-2 簡易版)のスケジューリングもここで行う。
 *  すべてブラウザ内に保存されるため、サーバーは不要。
 * ============================================================ */
const Store = (() => {
  const KEY = 'vocab_book_v1';
  const DAY = 24 * 60 * 60 * 1000;

  function emptyData() {
    return {
      version: 2,
      settings: { theme: 'auto', onboarded: false, autoSpeak: false },
      stats: { history: {} }, // { 'YYYY-MM-DD': { reviewed, correct } }
      decks: [],
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayKey(ts) {
    const d = ts ? new Date(ts) : new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  /** 既存データを最新スキーマへ移行する */
  function migrate(d) {
    if (!d || !Array.isArray(d.decks)) return emptyData();
    if (!d.settings) d.settings = { theme: 'auto', onboarded: false, autoSpeak: false };
    if (d.settings.autoSpeak == null) d.settings.autoSpeak = false;
    if (!d.stats) d.stats = { history: {} };
    if (!d.stats.history) d.stats.history = {};
    for (const deck of d.decks) {
      if (deck.lang == null) deck.lang = 'en-US';
      for (const c of deck.cards || []) {
        if (!c.stats) c.stats = { correct: 0, incorrect: 0, streak: 0, lastReviewed: null };
        if (!c.srs) c.srs = { due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
      }
    }
    d.version = 2;
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyData();
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.error('データの読み込みに失敗しました', e);
      return emptyData();
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  let data = load();

  function newCard(front, back, note) {
    return {
      id: uid(),
      front: (front || '').trim(),
      back: (back || '').trim(),
      note: (note || '').trim(),
      createdAt: Date.now(),
      stats: { correct: 0, incorrect: 0, streak: 0, lastReviewed: null },
      srs: { due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0 },
    };
  }

  /** 学習状態（覚えた度合い） */
  function statusOf(card) {
    const s = card.stats || {};
    if ((s.correct || 0) + (s.incorrect || 0) === 0) return 'new';
    if ((card.srs && card.srs.interval >= 7) || (s.streak || 0) >= 3) return 'known';
    return 'learning';
  }

  // ---------------- 設定 ----------------
  function getSettings() {
    return data.settings;
  }
  function updateSettings(fields) {
    Object.assign(data.settings, fields);
    save();
    return data.settings;
  }

  // ---------------- デッキ ----------------
  const getDecks = () => data.decks;
  const getDeck = (id) => data.decks.find((d) => d.id === id) || null;

  function addDeck(name, lang) {
    const deck = {
      id: uid(),
      name: (name || '').trim() || '無題の単語帳',
      lang: lang || 'en-US',
      createdAt: Date.now(),
      cards: [],
    };
    data.decks.unshift(deck);
    save();
    return deck;
  }

  function updateDeck(id, fields) {
    const deck = getDeck(id);
    if (!deck) return null;
    Object.assign(deck, fields);
    save();
    return deck;
  }

  function deleteDeck(id) {
    data.decks = data.decks.filter((d) => d.id !== id);
    save();
  }

  // ---------------- カード ----------------
  function addCard(deckId, front, back, note) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    const card = newCard(front, back, note);
    deck.cards.push(card);
    save();
    return card;
  }

  function updateCard(deckId, cardId, fields) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) return null;
    Object.assign(card, fields);
    save();
    return card;
  }

  function deleteCard(deckId, cardId) {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.cards = deck.cards.filter((c) => c.id !== cardId);
    save();
  }

  // ---------------- SRS（間隔反復 / SM-2 簡易版） ----------------
  /**
   * grade: 'again'（不正解）| 'good'（正解）| 'easy'（簡単）
   * 次回出題日時(due)・間隔(interval)・易しさ(ease)を更新する。
   */
  function review(deckId, cardId, grade) {
    const deck = getDeck(deckId);
    if (!deck) return;
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) return;
    const srs = card.srs || (card.srs = { due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0 });
    const s = card.stats || (card.stats = { correct: 0, incorrect: 0, streak: 0 });
    const now = Date.now();

    if (grade === 'again') {
      srs.reps = 0;
      srs.lapses = (srs.lapses || 0) + 1;
      srs.ease = Math.max(1.3, (srs.ease || 2.5) - 0.2);
      srs.interval = 0;
      srs.due = now + 5 * 60 * 1000; // 5分後（同セッション内で再出題）
      s.incorrect = (s.incorrect || 0) + 1;
      s.streak = 0;
    } else {
      const easy = grade === 'easy';
      if (srs.reps === 0) srs.interval = easy ? 3 : 1;
      else if (srs.reps === 1) srs.interval = easy ? 6 : 3;
      else srs.interval = Math.round(srs.interval * (srs.ease || 2.5) * (easy ? 1.3 : 1));
      srs.interval = Math.max(1, srs.interval);
      srs.reps = (srs.reps || 0) + 1;
      srs.ease = Math.min(3.0, (srs.ease || 2.5) + (easy ? 0.15 : 0));
      srs.due = now + srs.interval * DAY;
      s.correct = (s.correct || 0) + 1;
      s.streak = (s.streak || 0) + 1;
    }
    s.lastReviewed = now;

    // 日次の学習履歴を更新（統計用）
    const k = todayKey(now);
    const h = data.stats.history[k] || (data.stats.history[k] = { reviewed: 0, correct: 0 });
    h.reviewed += 1;
    if (grade !== 'again') h.correct += 1;

    save();
  }

  // 旧API互換（true/false で記録）
  function recordResult(deckId, cardId, correct) {
    review(deckId, cardId, correct ? 'good' : 'again');
  }

  /** 今復習すべきカード（期限切れ＋未学習）を due 順で返す */
  function getDueCards(deck) {
    const now = Date.now();
    const due = [];
    const fresh = [];
    for (const c of deck.cards) {
      const d = c.srs && c.srs.due;
      if (d == null) fresh.push(c);
      else if (d <= now) due.push(c);
    }
    due.sort((a, b) => (a.srs.due || 0) - (b.srs.due || 0));
    return due.concat(fresh);
  }

  function resetDeckStats(deckId) {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.cards.forEach((c) => {
      c.stats = { correct: 0, incorrect: 0, streak: 0, lastReviewed: null };
      c.srs = { due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
    });
    save();
  }

  // ---------------- 集計 ----------------
  function deckProgress(deck) {
    const total = deck.cards.length;
    let known = 0, learning = 0, fresh = 0, due = 0;
    const now = Date.now();
    for (const c of deck.cards) {
      const st = statusOf(c);
      if (st === 'known') known++;
      else if (st === 'learning') learning++;
      else fresh++;
      const d = c.srs && c.srs.due;
      if (d == null || d <= now) due++;
    }
    return { total, known, learning, new: fresh, due, pct: total ? Math.round((known / total) * 100) : 0 };
  }

  /** 連続学習日数（今日まで途切れず学習した日数） */
  function streakDays() {
    const h = data.stats.history;
    let streak = 0;
    let cur = new Date();
    // 今日まだ未学習なら昨日から数える
    if (!h[todayKey(cur.getTime())]) cur = new Date(cur.getTime() - DAY);
    while (true) {
      const k = todayKey(cur.getTime());
      if (h[k] && h[k].reviewed > 0) {
        streak++;
        cur = new Date(cur.getTime() - DAY);
      } else break;
    }
    return streak;
  }

  /** 直近 n 日分の履歴（古い順）。[{date, label, reviewed, correct}] */
  function recentHistory(n) {
    const out = [];
    const now = Date.now();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      const k = todayKey(d.getTime());
      const e = data.stats.history[k] || { reviewed: 0, correct: 0 };
      out.push({ date: k, label: `${d.getMonth() + 1}/${d.getDate()}`, reviewed: e.reviewed, correct: e.correct });
    }
    return out;
  }

  function globalStats() {
    let totalCards = 0, known = 0, due = 0;
    const now = Date.now();
    for (const deck of data.decks) {
      for (const c of deck.cards) {
        totalCards++;
        if (statusOf(c) === 'known') known++;
        const d = c.srs && c.srs.due;
        if (d == null || d <= now) due++;
      }
    }
    let totalReviews = 0, totalCorrect = 0;
    for (const k in data.stats.history) {
      totalReviews += data.stats.history[k].reviewed;
      totalCorrect += data.stats.history[k].correct;
    }
    return { decks: data.decks.length, totalCards, known, due, totalReviews, totalCorrect };
  }

  // ---------------- CSV ----------------
  function parseCSV(text) {
    const rows = [];
    let field = '', record = [], inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { record.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        record.push(field); rows.push(record); record = []; field = '';
      } else field += ch;
    }
    if (field.length > 0 || record.length > 0) { record.push(field); rows.push(record); }

    const cards = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (row.every((c) => c.trim() === '')) continue;
      const front = (row[0] || '').trim();
      const back = (row[1] || '').trim();
      const note = (row[2] || '').trim();
      if (r === 0 && /^(front|表|単語|word|term)$/i.test(front)) continue;
      if (!front && !back) continue;
      cards.push({ front, back, note });
    }
    return cards;
  }

  function importCSV(deckId, text) {
    const deck = getDeck(deckId);
    if (!deck) return 0;
    const cards = parseCSV(text);
    for (const c of cards) deck.cards.push(newCard(c.front, c.back, c.note));
    save();
    return cards.length;
  }

  function csvEscape(v) {
    v = v == null ? '' : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportCSV(deckId) {
    const deck = getDeck(deckId);
    if (!deck) return '';
    const lines = ['front,back,note'];
    for (const c of deck.cards) lines.push([c.front, c.back, c.note].map(csvEscape).join(','));
    return lines.join('\n');
  }

  // ---------------- バックアップ ----------------
  function exportAll() {
    return JSON.stringify(data, null, 2);
  }
  function importAll(json) {
    const parsed = JSON.parse(json);
    data = migrate(parsed);
    save();
  }

  /** ライブラリのプリセットから単語帳を作成して返す */
  function addPresetDeck(preset) {
    const deck = addDeck(preset.name, preset.lang || 'en-US');
    for (const row of preset.cards) deck.cards.push(newCard(row[0], row[1], row[2] || ''));
    save();
    return deck;
  }

  /** サンプル単語帳を作成して返す */
  function createSampleDeck() {
    const deck = addDeck('英単語サンプル', 'en-US');
    const samples = [
      ['apple', 'りんご', '果物'],
      ['dog', '犬', 'ペットの代表'],
      ['study', '勉強する', 'I study English every day.'],
      ['beautiful', '美しい', ''],
      ['quickly', '素早く', '副詞'],
      ['knowledge', '知識', ''],
      ['challenge', '挑戦／課題', ''],
      ['improve', '改善する', 'improve my skills'],
    ];
    for (const [f, b, n] of samples) deck.cards.push(newCard(f, b, n));
    save();
    return deck;
  }

  return {
    statusOf,
    getSettings, updateSettings,
    getDecks, getDeck, addDeck, updateDeck, deleteDeck,
    addCard, updateCard, deleteCard,
    review, recordResult, getDueCards, resetDeckStats,
    deckProgress, streakDays, recentHistory, globalStats,
    parseCSV, importCSV, exportCSV, exportAll, importAll,
    createSampleDeck, addPresetDeck,
  };
})();
