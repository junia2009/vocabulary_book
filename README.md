# 📚 単語帳 (Vocabulary Book)

科目を問わず使える、**汎用フラッシュカード単語帳**の PWA（プログレッシブ・ウェブアプリ）です。
英単語はもちろん、歴史・理科・資格の用語など、表（問題）と裏（答え）のペアであれば何でも学習できます。

ビルド不要の静的サイト（HTML / CSS / JavaScript のみ）なので、**GitHub Pages や Firebase Hosting にそのまま公開**でき、スマホのホーム画面に追加すればアプリのように使えます。

## ✨ 主な機能

- **単語帳（デッキ）管理** — 用途ごとに複数の単語帳を作成・名前変更・削除
- **単語の追加・編集・削除** — 表 / 裏 に加えてメモ（例文・補足）も登録可能
- **カードめくり学習** — タップやスペースキーでカードを裏返すフラッシュカード方式
- **学習進捗・正誤記録** — 正解／不正解を記録し、「未学習 → 学習中 → 覚えた」を自動判定
- **間違えた単語だけ復習** — 学習後に不正解だった単語のみをもう一度
- **CSV 取り込み / 書き出し** — 単語リストを一括登録・バックアップ
- **オフライン対応 (PWA)** — 一度開けばネットが無くても利用可能
- **完全ローカル保存** — データは端末のブラウザ内（localStorage）にのみ保存。サーバー送信なし

## ⌨️ 学習中のショートカット

| キー | 操作 |
| --- | --- |
| `Space` / `Enter` | カードをめくる |
| `→` / `j` | 覚えた（正解） |
| `←` / `f` | まだ（不正解） |

## 🗂️ CSV フォーマット

1 行 1 単語、`表,裏,メモ` の順です（メモは省略可、ヘッダー行も任意）。

```csv
front,back,note
apple,りんご,果物
photosynthesis,光合成,植物が光からエネルギーを作る働き
```

## 🚀 公開方法

### 方法 A: GitHub Pages（おすすめ・無料）

**初回だけ** GitHub Pages を有効化する操作が必要です（GitHub の仕様上、これは自動化できません）。
一度有効化すれば、**以降は `main` への push／マージだけで自動公開**されます。

#### A-1. ブランチから公開（最も簡単・ワークフロー不要）

1. リポジトリの **Settings → Pages** を開く。
2. **Source** で「**Deploy from a branch**」を選び、Branch を **`main`** / **`/ (root)`** にして **Save**。
3. 数十秒後、`https://<ユーザー名>.github.io/vocabulary_book/` で公開されます。
   以降は `main` に push するたびに自動で再公開されます。

#### A-2. GitHub Actions で公開（同梱ワークフローを使う）

1. **Settings → Pages → Source** で「**GitHub Actions**」を選ぶ。
2. `main` へ push すると、同梱の `.github/workflows/deploy-pages.yml` が自動でビルド・公開します。
3. **Actions** タブでワークフロー完了後、表示URLにアクセス。

> どちらも初回の有効化だけ手動で、その後は main へのマージで自動公開されます。
> 迷ったら **A-1** が簡単です。

### 方法 B: Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # 既存の firebase.json を使う場合は上書きしない
firebase deploy
```

`firebase.json` は同梱済みで、ルート（`.`）をそのまま配信する設定です。

### 方法 C: ローカルで試す

```bash
# Service Worker のため file:// ではなく http(s):// で開く必要があります
python3 -m http.server 8000
# → ブラウザで http://localhost:8000 を開く
```

## 📁 ファイル構成

```
.
├── index.html            # 画面のマークアップ
├── styles.css            # スタイル
├── app.js                # 画面制御・操作ロジック
├── storage.js            # localStorage データ層（保存・統計・CSV）
├── service-worker.js     # オフライン対応（PWA）
├── manifest.webmanifest  # PWA マニフェスト
├── icons/                # アプリアイコン
├── tools/make_icons.py   # アイコン生成スクリプト（標準ライブラリのみ）
├── firebase.json         # Firebase Hosting 設定
└── .github/workflows/    # GitHub Pages 自動デプロイ
```

## 📱 ホーム画面に追加（アプリ化）

- **iPhone (Safari)**: 共有 → 「ホーム画面に追加」
- **Android (Chrome)**: メニュー → 「アプリをインストール」

---

データは各端末のブラウザ内に保存されるため、別の端末へ移したいときは **設定 → CSV を書き出す** でバックアップし、移行先で取り込んでください。
