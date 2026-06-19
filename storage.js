/* ============================================================
 * storage.js — localStorage を使ったデータ層
 *  デッキ（単語帳）とカード（単語）の永続化・統計管理を担う。
 *  すべてブラウザ内に保存されるため、サーバーは不要。
 * ============================================================ */
const Store = (() => {
  const KEY = 'vocab_book_v1';

  /** 既定の空データ構造 */
  function emptyData() {
    return { version: 1, decks: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyData();
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.decks)) return emptyData();
      return data;
    } catch (e) {
      console.error('データの読み込みに失敗しました', e);
      return emptyData();
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let data = load();

  /** 学習状態（覚えた度合い）の判定 */
  function statusOf(card) {
    const s = card.stats || {};
    if ((s.correct || 0) + (s.incorrect || 0) === 0) return 'new';
    if ((s.streak || 0) >= 3) return 'known';
    return 'learning';
  }

  // ---------------- デッキ操作 ----------------
  function getDecks() {
    return data.decks;
  }

  function getDeck(id) {
    return data.decks.find((d) => d.id === id) || null;
  }

  function addDeck(name) {
    const deck = {
      id: uid(),
      name: name.trim() || '無題の単語帳',
      createdAt: Date.now(),
      cards: [],
    };
    data.decks.unshift(deck);
    save(data);
    return deck;
  }

  function updateDeck(id, fields) {
    const deck = getDeck(id);
    if (!deck) return null;
    Object.assign(deck, fields);
    save(data);
    return deck;
  }

  function deleteDeck(id) {
    data.decks = data.decks.filter((d) => d.id !== id);
    save(data);
  }

  // ---------------- カード操作 ----------------
  function addCard(deckId, front, back, note) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    const card = {
      id: uid(),
      front: front.trim(),
      back: back.trim(),
      note: (note || '').trim(),
      createdAt: Date.now(),
      stats: { correct: 0, incorrect: 0, streak: 0, lastReviewed: null },
    };
    deck.cards.push(card);
    save(data);
    return card;
  }

  function updateCard(deckId, cardId, fields) {
    const deck = getDeck(deckId);
    if (!deck) return null;
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) return null;
    Object.assign(card, fields);
    save(data);
    return card;
  }

  function deleteCard(deckId, cardId) {
    const deck = getDeck(deckId);
    if (!deck) return;
    deck.cards = deck.cards.filter((c) => c.id !== cardId);
    save(data);
  }

  /** 学習結果を記録する（correct: true/false） */
  function recordResult(deckId, cardId, correct) {
    const deck = getDeck(deckId);
    if (!deck) return;
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) return;
    const s = card.stats || (card.stats = { correct: 0, incorrect: 0, streak: 0 });
    if (correct) {
      s.correct = (s.correct || 0) + 1;
      s.streak = (s.streak || 0) + 1;
    } else {
      s.incorrect = (s.incorrect || 0) + 1;
      s.streak = 0;
    }
    s.lastReviewed = Date.now();
    save(data);
  }

  /** デッキの進捗サマリを集計 */
  function deckProgress(deck) {
    const total = deck.cards.length;
    let known = 0,
      learning = 0,
      fresh = 0;
    for (const c of deck.cards) {
      const st = statusOf(c);
      if (st === 'known') known++;
      else if (st === 'learning') learning++;
      else fresh++;
    }
    const pct = total ? Math.round((known / total) * 100) : 0;
    return { total, known, learning, new: fresh, pct };
  }

  // ---------------- インポート / エクスポート ----------------
  /** CSV 文字列を解析して {front, back, note} の配列を返す */
  function parseCSV(text) {
    const rows = [];
    let field = '';
    let record = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        record.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        record.push(field);
        rows.push(record);
        record = [];
        field = '';
      } else {
        field += ch;
      }
    }
    if (field.length > 0 || record.length > 0) {
      record.push(field);
      rows.push(record);
    }
    // ヘッダー行（front/back を含む）はスキップ
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
    for (const c of cards) {
      deck.cards.push({
        id: uid(),
        front: c.front,
        back: c.back,
        note: c.note || '',
        createdAt: Date.now(),
        stats: { correct: 0, incorrect: 0, streak: 0, lastReviewed: null },
      });
    }
    save(data);
    return cards.length;
  }

  function csvEscape(v) {
    v = v == null ? '' : String(v);
    if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function exportCSV(deckId) {
    const deck = getDeck(deckId);
    if (!deck) return '';
    const lines = ['front,back,note'];
    for (const c of deck.cards) {
      lines.push([c.front, c.back, c.note].map(csvEscape).join(','));
    }
    return lines.join('\n');
  }

  function reload() {
    data = load();
  }

  return {
    statusOf,
    getDecks,
    getDeck,
    addDeck,
    updateDeck,
    deleteDeck,
    addCard,
    updateCard,
    deleteCard,
    recordResult,
    deckProgress,
    parseCSV,
    importCSV,
    exportCSV,
    reload,
  };
})();
