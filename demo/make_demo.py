# Builds a made-up project and made-up Claude Code sessions for README screenshots.
# Everything goes under demo/run/ (git-ignored). Nothing real is read.
#   demo/run/shop-site/     the workspace (a fictional web shop)
#   demo/run/shared/        files outside the workspace, mentioned in the chat
#   demo/run/home/          a fake home: .claude/projects/<dir>/<session>.jsonl
# Usage: python demo/make_demo.py
import json
import os
import re
import shutil
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

RUN = Path(__file__).resolve().parent / "run"
WS = RUN / "shop-site"
SHARED = RUN / "shared"
HOME = RUN / "home"

MIN_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"

FILES = {
    WS / "README.md": "# shop-site\n\nA made-up web shop used for screenshots.\n",
    WS / "package.json": '{ "name": "shop-site", "version": "0.3.0" }\n',
    WS / "src" / "cart.js": "export function total(items) {\n  return items.reduce((s, i) => s + i.price * i.qty, 0);\n}\n",
    WS / "src" / "price.js": "export const TAX = 0.10;\n\nexport function withTax(yen) {\n  return Math.floor(yen * (1 + TAX));\n}\n",
    WS / "src" / "list.js": "export const PAGE = 20;\n",
    WS / "tests" / "cart.test.js": "import { total } from '../src/cart.js';\n",
    WS / "docs" / "spec.pdf": MIN_PDF,
    SHARED / "design" / "mockup.pdf": MIN_PDF,
    SHARED / "notes" / "meeting-2026-11.md": "# Meeting notes (made up)\n",
}


def write_files():
    for p, body in FILES.items():
        p.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(body, bytes):
            p.write_bytes(body)
        else:
            p.write_text(body, encoding="utf-8", newline="\n")
    # a tiny PNG (1x1) for the banner
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360f8cf000000030101005bd6a1"
        "d80000000049454e44ae426082"
    )
    (WS / "assets").mkdir(parents=True, exist_ok=True)
    (WS / "assets" / "banner.png").write_bytes(png)


class Session:
    def __init__(self, title, start):
        self.id = str(uuid.uuid4())
        self.title = title
        self.t = start
        self.lines = []

    def _ts(self, minutes):
        self.t += timedelta(minutes=minutes)
        return self.t.isoformat().replace("+00:00", "Z")

    def user(self, text, minutes=3):
        self.lines.append({
            "type": "user", "uuid": str(uuid.uuid4()), "promptId": str(uuid.uuid4()),
            "timestamp": self._ts(minutes), "cwd": str(WS), "sessionId": self.id,
            "message": {"role": "user", "content": [{"type": "text", "text": text}]},
        })

    def assistant(self, text=None, tools=()):
        content = []
        if text:
            content.append({"type": "text", "text": text})
        for name, path in tools:
            key = "file_path"
            content.append({"type": "tool_use", "id": "toolu_" + uuid.uuid4().hex[:20], "name": name, "input": {key: str(path)}})
        self.lines.append({
            "type": "assistant", "uuid": str(uuid.uuid4()), "timestamp": self._ts(1), "cwd": str(WS),
            "sessionId": self.id, "message": {"role": "assistant", "content": content},
        })

    def save(self, folder, mtime):
        self.lines.append({"type": "ai-title", "aiTitle": self.title, "sessionId": self.id})
        p = folder / f"{self.id}.jsonl"
        with p.open("w", encoding="utf-8", newline="\n") as f:
            for o in self.lines:
                f.write(json.dumps(o, ensure_ascii=False, separators=(",", ":")) + "\n")  # compact, like Claude Code
        os.utime(p, (mtime, mtime))


def write_sessions():
    folder = HOME / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(WS))
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    now = time.time()
    day = datetime(2026, 11, 10, 0, 50, tzinfo=timezone.utc)  # 09:50 JST

    s = Session("カートの合計を税込みにする", day)
    s.user("カートの合計が税込みにならない。`docs/spec.pdf` の 3 ページ目の計算と合わない")
    s.assistant("合計を出しているところと、税の計算を読みます。", [("Read", WS / "src/cart.js"), ("Read", WS / "src/price.js")])
    s.assistant("`src/cart.js` の `total` が税を掛けていません。仕様は [spec.pdf](docs/spec.pdf) の 3 ページ目です。")
    s.user(f"デザインの見本と比べたい。{SHARED / 'design' / 'mockup.pdf'} と前回の打ち合わせのメモ", minutes=9)
    s.assistant(
        f"見本は `{SHARED / 'design' / 'mockup.pdf'}`、メモは `{SHARED / 'notes' / 'meeting-2026-11.md'}` です。"
        "バナーの画像も確かめます。",
        [("Read", WS / "assets/banner.png"), ("Read", SHARED / "notes/meeting-2026-11.md")],
    )
    s.user("ありがとう", minutes=4)
    s.assistant("どういたしまして。")
    s.user("税込みに直して、テストも足して", minutes=6)
    s.assistant(None, [("Edit", WS / "src/price.js"), ("Edit", WS / "src/cart.js"), ("Write", WS / "tests/cart.test.js")])
    s.assistant("直しました。端数は [spec.pdf](docs/spec.pdf) のとおり切り捨てです。`README.md` の例も合わせました。", [("Edit", WS / "README.md")])
    s.save(folder, now - 60)

    older = [
        ("商品一覧のページ送り", [("Read", "src/list.js"), ("Edit", "src/list.js")], 1),
        ("README の手順の見直し", [("Read", "README.md"), ("Edit", "README.md")], 2),
        ("バナー画像の書き出しが遅い", [("Read", "assets/banner.png")], 3),
        ("package.json の依存の整理", [("Read", "package.json")], 6),
    ]
    for title, tools, days_ago in older:
        o = Session(title, day - timedelta(days=days_ago))
        o.user(title + "について")
        o.assistant(None, [(n, WS / p) for n, p in tools])
        o.save(folder, now - days_ago * 86400)
    print(folder)


if __name__ == "__main__":
    write_files()
    write_sessions()
