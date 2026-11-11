# Open Outside

VS Code の左のファイル一覧から開いたファイルを、種類によっては VS Code のタブではなく OS の既定アプリ（エクスプローラでダブルクリックしたときと同じアプリ）で開く拡張。

## 外で開く種類の決め方

ユーザー設定（`settings.json`）の `workbench.editorAssociations` に書く。書いた種類だけが外で開き、ほかは今までどおり VS Code で開く。

```json
"workbench.editorAssociations": {
  "*.pdf": "openOutside.external",
  "*.mp4": "openOutside.external",
  "*.docx": "openOutside.external",
  "*.xlsx": "openOutside.external"
}
```

- 種類を戻す: その行を消す
- 全部戻す: 上の行を消して拡張を無効にする（行を残したまま無効にすると、その種類を開くときに VS Code が別の開き方を選ばせる）
- 今回だけ VS Code で開く: 右クリック →「ファイルを開くアプリケーションの選択...」
- 種類に関係なく外で開く: 右クリック →「Open Outside」

## 入れ方

```
npx -y @vscode/vsce package
code --install-extension open-outside-0.0.1.vsix
```

その後 VS Code で `Developer: Reload Window`。

## 制限

- 開くときに、VS Code のタブが一瞬出てすぐ閉じる
- 手元のファイルだけ。WSL・SSH で開いたフォルダのファイルは、普通のエディタで開き直す

## Chat Files（会話に出てきたファイルの一覧）

左のエクスプローラの下に「Chat Files」が出る。このフォルダで最後に動いた Claude Code の会話（`~/.claude/projects/<フォルダ名>/*.jsonl`）を見張り、出てきたファイルとフォルダを新しい順に並べる。

- 拾うもの: Claude が読んだ・書いたファイル（`edited` / `read`）、返答と自分の発言に書かれたパス（`C:\...`、`%APPDATA%\...`、`~\...`、Markdown のリンク、`` `相対パス` ``）。実在するものだけ
- ファイルをクリック: VS Code のタブで開く（別のドライブでも開けて、そのまま編集できる）
- フォルダをクリック: エクスプローラでそのフォルダを開く
- 行の右のボタン / 右クリック: Explorer（エクスプローラで場所を示す）・Outside（既定のアプリで開く）・Edit（外で開く種類でも VS Code で開く）・Copy Path

会話を取り違えることがある: 同じフォルダで会話を 2 つ並べていると、最後に書き換わった方を出す。jsonl の形は Claude Code の内部のもので、版が上がると拾えなくなるかもしれない。

拾い方だけを試す: `node tools/try_extract.js <フォルダ>`
