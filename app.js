/* ============================================================
 * app.js — 画面制御とユーザー操作のハンドリング
 * ============================================================ */
(() => {
  'use strict';

  // ---------- ユーティリティ ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => (el.hidden = true), 250);
    }, 2200);
  }

  // ---------- アプリの状態 ----------
  const state = {
    view: 'decks',
    deckId: null,
    study: null, // { cards:[], index, flipped, correct, wrong, wrongIds:[] }
  };

  const views = {
    decks: $('#view-decks'),
    deck: $('#view-deck'),
    study: $('#view-study'),
  };

  function showView(name) {
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
    state.view = name;
    const back = $('#backBtn');
    back.hidden = name === 'decks';
    $('#menuToggle').hidden = name === 'study';
    const titles = { decks: '📚 単語帳', deck: '📖 単語一覧', study: '🧠 学習中' };
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
        return `
        <button class="deck-card" data-deck="${d.id}">
          <div class="deck-card-head">
            <h3>${escapeHTML(d.name)}</h3>
            <span class="badge">${p.total} 語</span>
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
  //  デッキ詳細（カード管理）
  // ============================================================
  function openDeck(deckId) {
    state.deckId = deckId;
    renderDeck();
    showView('deck');
  }

  function renderDeck(filter = '') {
    const deck = Store.getDeck(state.deckId);
    if (!deck) {
      showView('decks');
      return;
    }
    const p = Store.deckProgress(deck);
    $('#deckSummary').innerHTML = `
      <h2>${escapeHTML(deck.name)}</h2>
      <div class="progress-track big"><div class="progress-bar" style="width:${p.pct}%"></div></div>
      <p class="summary-line">
        全 ${p.total} 語 ・ 覚えた ${p.known} ・ 学習中 ${p.learning} ・ 未学習 ${p.new}
        <strong>（達成 ${p.pct}%）</strong>
      </p>`;

    const q = filter.trim().toLowerCase();
    let cards = deck.cards;
    if (q)
      cards = cards.filter(
        (c) =>
          c.front.toLowerCase().includes(q) ||
          c.back.toLowerCase().includes(q) ||
          (c.note || '').toLowerCase().includes(q)
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
          <div class="word-main">
            <div class="word-front">${escapeHTML(c.front) || '<em>（表が空）</em>'}</div>
            <div class="word-back">${escapeHTML(c.back) || '<em>（裏が空）</em>'}</div>
            ${c.note ? `<div class="word-note">📝 ${escapeHTML(c.note)}</div>` : ''}
          </div>
          <div class="word-side">
            <span class="status-tag">${stLabel}</span>
            <span class="word-stat">✓${s.correct || 0} ✗${s.incorrect || 0}</span>
            <div class="word-actions">
              <button class="icon-btn sm" data-edit aria-label="編集">✏</button>
              <button class="icon-btn sm" data-del aria-label="削除">🗑</button>
            </div>
          </div>
        </div>`;
      })
      .join('');

    $$('.word-card', list).forEach((el) => {
      const id = el.dataset.card;
      $('[data-edit]', el).addEventListener('click', () => openCardModal(id));
      $('[data-del]', el).addEventListener('click', () => confirmDeleteCard(id));
    });
  }

  // ============================================================
  //  学習モード
  // ============================================================
  function startStudy(cardsOverride) {
    const deck = Store.getDeck(state.deckId);
    if (!deck || deck.cards.length === 0) return;
    let cards = cardsOverride || deck.cards.slice();
    // 未学習・学習中を優先しつつシャッフル
    cards = shuffle(cards.slice());
    state.study = {
      cards,
      index: 0,
      flipped: false,
      correct: 0,
      wrong: 0,
      wrongIds: [],
    };
    $('#studyResult').hidden = true;
    $('.flashcard').hidden = false;
    $('.study-actions').hidden = false;
    showView('study');
    renderStudyCard();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderStudyCard() {
    const s = state.study;
    const card = s.cards[s.index];
    if (!card) return finishStudy();
    s.flipped = false;
    $('#flashcard').classList.remove('flipped');
    $('#cardFront').textContent = card.front || '（表が空）';
    $('#cardBack').textContent =
      (card.back || '（裏が空）') + (card.note ? `\n\n📝 ${card.note}` : '');
    $('#studyCounter').textContent = `${s.index + 1} / ${s.cards.length}`;
    const pct = Math.round((s.index / s.cards.length) * 100);
    $('#studyProgressBar').style.width = pct + '%';
  }

  function flipCard() {
    const s = state.study;
    if (!s) return;
    s.flipped = !s.flipped;
    $('#flashcard').classList.toggle('flipped', s.flipped);
  }

  function markCard(correct) {
    const s = state.study;
    if (!s) return;
    const card = s.cards[s.index];
    Store.recordResult(state.deckId, card.id, correct);
    if (correct) s.correct++;
    else {
      s.wrong++;
      s.wrongIds.push(card.id);
    }
    s.index++;
    if (s.index >= s.cards.length) finishStudy();
    else renderStudyCard();
  }

  function finishStudy() {
    const s = state.study;
    $('#studyProgressBar').style.width = '100%';
    $('.flashcard').hidden = true;
    $('.study-actions').hidden = true;
    const total = s.correct + s.wrong;
    $('#studyResultText').innerHTML =
      `${total} 語中 <strong class="ok">${s.correct}</strong> 語正解、` +
      `<strong class="ng">${s.wrong}</strong> 語まだでした。`;
    $('#restartWrongBtn').hidden = s.wrongIds.length === 0;
    $('#studyResult').hidden = false;
    renderDeck($('#cardSearch').value); // 統計を反映
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

  modalRoot.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });

  // --- 単語帳の新規作成 / 名前変更 ---
  function openDeckModal(deck) {
    const editing = !!deck;
    openModal(
      `
      <h2 class="modal-title">${editing ? '単語帳の名前を変更' : '新しい単語帳'}</h2>
      <label class="field">
        <span>名前</span>
        <input id="m_deckName" type="text" maxlength="60" placeholder="例：英単語 / 世界史 / 化学用語"
               value="${escapeHTML(editing ? deck.name : '')}" />
      </label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        <button class="btn btn-primary" id="m_save">${editing ? '保存' : '作成'}</button>
      </div>`,
      (root) => {
        const input = $('#m_deckName', root);
        const submit = () => {
          const name = input.value.trim();
          if (!name) return toast('名前を入力してください');
          if (editing) {
            Store.updateDeck(deck.id, { name });
            renderDeck($('#cardSearch').value);
          } else {
            const d = Store.addDeck(name);
            closeModal();
            renderDecks();
            openDeck(d.id);
            return;
          }
          closeModal();
          renderDecks();
        };
        $('#m_save', root).addEventListener('click', submit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submit();
        });
      }
    );
  }

  // --- 単語の追加 / 編集 ---
  function openCardModal(cardId) {
    const deck = Store.getDeck(state.deckId);
    const card = cardId ? deck.cards.find((c) => c.id === cardId) : null;
    const editing = !!card;
    openModal(
      `
      <h2 class="modal-title">${editing ? '単語を編集' : '単語を追加'}</h2>
      <label class="field">
        <span>表（問題・単語）</span>
        <textarea id="m_front" rows="2" placeholder="例：apple">${escapeHTML(editing ? card.front : '')}</textarea>
      </label>
      <label class="field">
        <span>裏（答え・意味）</span>
        <textarea id="m_back" rows="2" placeholder="例：りんご">${escapeHTML(editing ? card.back : '')}</textarea>
      </label>
      <label class="field">
        <span>メモ（任意）</span>
        <textarea id="m_note" rows="2" placeholder="例文・補足など">${escapeHTML(editing ? card.note : '')}</textarea>
      </label>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        ${editing ? '' : '<button class="btn" id="m_save_more">保存して続けて追加</button>'}
        <button class="btn btn-primary" id="m_save">${editing ? '保存' : '追加'}</button>
      </div>`,
      (root) => {
        const get = (id) => $('#' + id, root).value;
        const persist = () => {
          const front = get('m_front');
          const back = get('m_back');
          if (!front.trim() && !back.trim()) {
            toast('表か裏のどちらかは入力してください');
            return false;
          }
          if (editing) {
            Store.updateCard(state.deckId, card.id, {
              front: front.trim(),
              back: back.trim(),
              note: get('m_note').trim(),
            });
          } else {
            Store.addCard(state.deckId, front, back, get('m_note'));
          }
          renderDeck($('#cardSearch').value);
          renderDecks();
          return true;
        };
        $('#m_save', root).addEventListener('click', () => {
          if (persist()) closeModal();
        });
        const more = $('#m_save_more', root);
        if (more)
          more.addEventListener('click', () => {
            if (persist()) {
              toast('追加しました');
              openCardModal(); // 続けて入力
            }
          });
      }
    );
  }

  function confirmDeleteCard(cardId) {
    const deck = Store.getDeck(state.deckId);
    const card = deck.cards.find((c) => c.id === cardId);
    if (!card) return;
    openModal(
      `
      <h2 class="modal-title">単語を削除</h2>
      <p class="modal-text">「<strong>${escapeHTML(card.front || card.back)}</strong>」を削除しますか？<br>この操作は取り消せません。</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        <button class="btn btn-danger" id="m_del">削除する</button>
      </div>`,
      (root) => {
        $('#m_del', root).addEventListener('click', () => {
          Store.deleteCard(state.deckId, cardId);
          closeModal();
          renderDeck($('#cardSearch').value);
          renderDecks();
          toast('削除しました');
        });
      }
    );
  }

  // --- デッキ設定（CSV入出力・名前変更・削除） ---
  function openDeckSettings() {
    const deck = Store.getDeck(state.deckId);
    if (!deck) return;
    openModal(
      `
      <h2 class="modal-title">単語帳の設定</h2>
      <div class="settings-group">
        <button class="btn block" id="s_rename">✏ 名前を変更</button>
        <button class="btn block" id="s_reset">↺ 学習記録をリセット</button>
      </div>
      <h3 class="settings-sub">データの取り込み・書き出し（CSV）</h3>
      <label class="field">
        <span>CSVを貼り付けて取り込み（1列目=表, 2列目=裏, 3列目=メモ）</span>
        <textarea id="s_csv" rows="4" placeholder="apple,りんご&#10;dog,犬,ペットの代表格"></textarea>
      </label>
      <div class="settings-group">
        <button class="btn" id="s_import">取り込む</button>
        <button class="btn" id="s_importFile">ファイルから取り込む</button>
        <button class="btn" id="s_export">CSVを書き出す</button>
      </div>
      <input type="file" id="s_file" accept=".csv,text/csv,text/plain" hidden />
      <hr class="modal-sep" />
      <div class="settings-group">
        <button class="btn btn-danger block" id="s_deleteDeck">🗑 この単語帳を削除</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" data-close>閉じる</button>
      </div>`,
      (root) => {
        $('#s_rename', root).addEventListener('click', () => openDeckModal(deck));
        $('#s_reset', root).addEventListener('click', () => {
          deck.cards.forEach((c) =>
            Store.updateCard(deck.id, c.id, {
              stats: { correct: 0, incorrect: 0, streak: 0, lastReviewed: null },
            })
          );
          renderDeck($('#cardSearch').value);
          renderDecks();
          toast('学習記録をリセットしました');
        });
        $('#s_import', root).addEventListener('click', () => {
          const text = $('#s_csv', root).value;
          if (!text.trim()) return toast('CSVを貼り付けてください');
          const n = Store.importCSV(deck.id, text);
          closeModal();
          renderDeck($('#cardSearch').value);
          renderDecks();
          toast(`${n} 語を取り込みました`);
        });
        $('#s_importFile', root).addEventListener('click', () => $('#s_file', root).click());
        $('#s_file', root).addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const n = Store.importCSV(deck.id, String(reader.result));
            closeModal();
            renderDeck($('#cardSearch').value);
            renderDecks();
            toast(`${n} 語を取り込みました`);
          };
          reader.readAsText(file);
        });
        $('#s_export', root).addEventListener('click', () => {
          const csv = Store.exportCSV(deck.id);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${deck.name || 'vocab'}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          toast('CSVを書き出しました');
        });
        $('#s_deleteDeck', root).addEventListener('click', () => confirmDeleteDeck(deck));
      }
    );
  }

  function confirmDeleteDeck(deck) {
    openModal(
      `
      <h2 class="modal-title">単語帳を削除</h2>
      <p class="modal-text">「<strong>${escapeHTML(deck.name)}</strong>」と中の ${deck.cards.length} 語をすべて削除します。<br>この操作は取り消せません。</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>キャンセル</button>
        <button class="btn btn-danger" id="m_del">削除する</button>
      </div>`,
      (root) => {
        $('#m_del', root).addEventListener('click', () => {
          Store.deleteDeck(deck.id);
          closeModal();
          showView('decks');
          renderDecks();
          toast('単語帳を削除しました');
        });
      }
    );
  }

  // ============================================================
  //  イベント配線
  // ============================================================
  function wire() {
    // ヘッダー
    $('#backBtn').addEventListener('click', () => {
      if (state.view === 'study') {
        showView('deck');
        renderDeck($('#cardSearch').value);
      } else if (state.view === 'deck') {
        showView('decks');
        renderDecks($('#deckSearch').value);
      }
    });
    $('#menuToggle').addEventListener('click', () => {
      if (state.view === 'deck') openDeckSettings();
      else openAboutModal();
    });

    // デッキ一覧
    $('#addDeckBtn').addEventListener('click', () => openDeckModal(null));
    $('#deckSearch').addEventListener('input', (e) => renderDecks(e.target.value));

    // デッキ詳細
    $('#addCardBtn').addEventListener('click', () => openCardModal(null));
    $('#studyBtn').addEventListener('click', () => startStudy());
    $('#deckMenuBtn').addEventListener('click', openDeckSettings);
    $('#cardSearch').addEventListener('input', (e) => renderDeck(e.target.value));

    // 学習モード
    $('#flashcard').addEventListener('click', flipCard);
    $('#flipBtn').addEventListener('click', flipCard);
    $('#markRightBtn').addEventListener('click', () => markCard(true));
    $('#markWrongBtn').addEventListener('click', () => markCard(false));
    $('#restartAllBtn').addEventListener('click', () => startStudy());
    $('#restartWrongBtn').addEventListener('click', () => {
      const deck = Store.getDeck(state.deckId);
      const ids = new Set(state.study.wrongIds);
      const cards = deck.cards.filter((c) => ids.has(c.id));
      startStudy(cards);
    });
    $('#backToDeckBtn').addEventListener('click', () => {
      showView('deck');
      renderDeck($('#cardSearch').value);
    });

    // キーボード操作
    document.addEventListener('keydown', (e) => {
      if (!modalRoot.hidden) {
        if (e.key === 'Escape') closeModal();
        return;
      }
      if (state.view !== 'study') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        flipCard();
      } else if (e.key === 'ArrowRight' || e.key === 'j') markCard(true);
      else if (e.key === 'ArrowLeft' || e.key === 'f') markCard(false);
    });
  }

  function openAboutModal() {
    openModal(`
      <h2 class="modal-title">📚 単語帳について</h2>
      <p class="modal-text">
        科目を問わず使える汎用フラッシュカードアプリです。<br>
        データはこの端末のブラウザ内（localStorage）にのみ保存され、外部には送信されません。
      </p>
      <ul class="about-list">
        <li>⌨️ 学習中： <b>スペース</b>でめくる、<b>→</b>覚えた、<b>←</b>まだ</li>
        <li>📥 CSVで一括取り込み・書き出しができます</li>
        <li>📱 ホーム画面に追加するとアプリのように使えます</li>
      </ul>
      <div class="modal-actions">
        <button class="btn btn-primary" data-close>閉じる</button>
      </div>`);
  }

  // ============================================================
  //  Service Worker 登録（PWA / オフライン対応）
  // ============================================================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch((err) =>
          console.warn('Service Worker 登録に失敗:', err)
        );
      });
    }
  }

  // ---------- 起動 ----------
  function init() {
    wire();
    renderDecks();
    showView('decks');
    registerSW();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
