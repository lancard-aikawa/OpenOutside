# Open Outside

VS Code で PDF・動画・Office などを開くとき、VS Code のタブではなく OS の既定のアプリ（エクスプローラや Finder でダブルクリックしたときと同じアプリ）で開く拡張です。あわせて、Claude Code との会話に出てきたファイルを左のサイドバーに並べ、そこから開けるようにします。

*A VS Code extension that opens chosen file types in the OS default app, and lists the files that appeared in your Claude Code chat so you can open them from the sidebar.*

## 入れ方

1. [Releases](https://github.com/lancard-aikawa/OpenOutside/releases) から `open-outside-<版>.vsix` をダウンロードする
2. VS Code の「拡張機能」画面の右上の `…` →「VSIX からのインストール...」で、そのファイルを選ぶ
   （コマンドなら `code --install-extension open-outside-<版>.vsix`）

Marketplace には出していないので、新しい版は自動では入りません。Releases から入れ直してください。

## 1. 決めた種類を既定のアプリで開く

ユーザー設定（`settings.json`）の `workbench.editorAssociations` に、外で開きたい種類を書きます。書いた種類だけが外で開き、ほかは今までどおり VS Code で開きます。

```json
"workbench.editorAssociations": {
  "*.pdf": "openOutside.external",
  "*.mp4": "openOutside.external",
  "*.docx": "openOutside.external",
  "*.xlsx": "openOutside.external"
}
```

| やりたいこと | 操作 |
|---|---|
| ある種類を VS Code に戻す | その行を消す |
| 全部やめる | 上の行を消してから、拡張を無効にする（行を残したまま無効にすると、その種類を開くたびに VS Code が開き方を選ばせる） |
| 今回だけ VS Code で開く | ファイルを右クリック →「ファイルを開くアプリケーションの選択...」 |
| 種類に関係なく外で開く | ファイルを右クリック →「Open Outside」 |

開くときに VS Code のタブが一瞬出て、すぐ閉じます。VS Code に「開く前に割り込む」口が無いためで、避けられません。

## 2. Chat Files（会話に出てきたファイル）

エクスプローラの下に「Chat Files」の欄が出ます。今開いているフォルダで動いている Claude Code の会話を見張り、出てきたファイルを、自分の発言ごとにまとめて並べます（新しい発言が上）。

- **拾うもの**: Claude が読んだ・書いたファイル（`read` / `edited` と付く）と、返答や自分の発言に書かれたファイルのパス（`C:\...`、`%APPDATA%\...`、`~/...`、Markdown のリンク、`` ` `` で囲んだ相対パス）。実在するものだけ
- **ファイルをクリック**: VS Code のタブで開く。開いているフォルダの外や、別のドライブのファイルも開けて、そのまま編集できる
- **行の右のボタン・右クリック**: Explorer（エクスプローラ / Finder で場所を示す）・Outside（既定のアプリで開く）・Edit（外で開く種類でも VS Code で開く）・Copy Path
- **前の会話**: 欄の右上の History（時計の印）で、このフォルダの会話を題と日時から選ぶ。選んだ会話に固定され、欄の題の横に `pinned` と出る。右上の Latest で、最新の会話について行く形に戻る

## 読むもの・送るもの

- 読むのは、この PC の `~/.claude/projects/` にある Claude Code の会話の記録（`*.jsonl`）だけです。今開いているフォルダに対応するものだけを読みます
- **どこにも送りません。** 通信は一切しません。書き込むのは VS Code の設定（ユーザーが書いた分）だけで、会話の記録は書き換えません

## 制限

- 会話の記録の形は Claude Code の内部のもので、公開された仕様ではありません。Claude Code の版が上がると、拾えなくなることがあります
- 同じフォルダで会話を 2 つ並べて動かしていると、最後に書き換わった方を出します（History で選べば固定できます）
- 手元のファイルだけが対象です。WSL・SSH・コンテナで開いたフォルダのファイルは、外で開かずに普通のエディタで開き直します
- Windows 11 で作って試しています。**Mac では試していません**

## 自分で作る

```
npx -y @vscode/vsce package
```

- 会話からパスを拾う処理だけを試す: `node tools/try_extract.js <フォルダ>`
- 会話の一覧と読み込みの速さ: `node tools/try_sessions.js <フォルダ>`（手元では会話 51 件の題が約 50ms、50MB の会話の読み込みが約 0.2 秒）
- アイコンを描き直す: `uv run --no-project --with pillow python tools/make_icon.py`

## ライセンス

MIT
