# Takes the README screenshots from a real VS Code window that only sees the made-up data from make_demo.py.
# VS Code runs with its own user-data-dir / extensions-dir under demo/run/, and with USERPROFILE pointed at
# demo/run/home, so the extension reads the fake sessions and none of your real settings or chats appear.
# A VS Code window comes to the front and keys are sent to it: do not touch the keyboard or mouse (~30 s).
# Usage (Windows): python demo/make_demo.py && npx -y @vscode/vsce package -o demo/run/demo.vsix
#                  uv run --no-project --with pillow python demo/shoot.py
import ctypes
import ctypes.wintypes as wt
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from PIL import ImageGrab

ROOT = Path(__file__).resolve().parent.parent
RUN = ROOT / "demo" / "run"
WS = RUN / "shop-site"
HOME = RUN / "home"
UD = RUN / "vscode-user"
EXT = RUN / "vscode-ext"
VSIX = RUN / "demo.vsix"
OUT = ROOT / "docs" / "images"
CODE = Path(os.environ["LOCALAPPDATA"]) / "Programs" / "Microsoft VS Code" / "Code.exe"
W, H = 1280, 860

user32 = ctypes.windll.user32
ctypes.windll.shcore.SetProcessDpiAwareness(2)

SETTINGS = {
    "security.workspace.trust.enabled": False,
    "workbench.startupEditor": "none",
    "workbench.tips.enabled": False,
    "workbench.colorTheme": "Default Dark Modern",
    "workbench.secondarySideBar.defaultVisibility": "hidden",
    "workbench.welcomePage.walkthroughs.openOnInstall": False,
    "window.restoreWindows": "none",
    "window.commandCenter": False,
    "update.mode": "none",
    "extensions.ignoreRecommendations": True,
    "telemetry.telemetryLevel": "off",
    "chat.disableAIFeatures": True,
    "git.enabled": False,
    "explorer.compactFolders": False,
    "editor.minimap.enabled": False,
    "workbench.editorAssociations": {"*.pdf": "openOutside.external"},
}


def prepare():
    if not VSIX.exists():
        sys.exit(f"missing {VSIX}: run  npx -y @vscode/vsce package -o demo/run/demo.vsix")
    for d in (UD, EXT):
        if d.exists():
            shutil.rmtree(d)
    (UD / "User").mkdir(parents=True)
    (UD / "User" / "settings.json").write_text(json.dumps(SETTINGS, indent=2), encoding="utf-8")
    subprocess.run(
        ["cmd", "/c", "code", "--user-data-dir", str(UD), "--extensions-dir", str(EXT), "--install-extension", str(VSIX)],
        check=True, capture_output=True,
    )


def find_window(part, timeout=60):
    found = []
    proto = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)

    def cb(hwnd, _):
        n = user32.GetWindowTextLengthW(hwnd)
        if n and user32.IsWindowVisible(hwnd):
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            if part in buf.value and "Visual Studio Code" in buf.value:
                found.append(hwnd)
        return True

    end = time.time() + timeout
    while time.time() < end:
        found.clear()
        user32.EnumWindows(proto(cb), 0)
        if found:
            return found[0]
        time.sleep(0.5)
    sys.exit("VS Code window did not appear")


def rect(hwnd):
    r = wt.RECT()
    ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(r), ctypes.sizeof(r))  # extended frame bounds
    return (r.left, r.top, r.right, r.bottom)


def front(hwnd):
    user32.ShowWindow(hwnd, 9)  # restore
    user32.keybd_event(0x12, 0, 0, 0)  # Alt, so SetForegroundWindow is allowed
    user32.keybd_event(0x12, 0, 2, 0)
    user32.SetForegroundWindow(hwnd)


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [("wVk", wt.WORD), ("wScan", wt.WORD), ("dwFlags", wt.DWORD), ("time", wt.DWORD), ("dwExtraInfo", ctypes.c_size_t)]


class INPUT(ctypes.Structure):
    class _U(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("pad", ctypes.c_byte * 32)]

    _anonymous_ = ("u",)
    _fields_ = [("type", wt.DWORD), ("u", _U)]


def send(vk=0, scan=0, flags=0):
    i = INPUT(type=1)
    i.ki = KEYBDINPUT(vk, scan, flags, 0, 0)
    user32.SendInput(1, ctypes.byref(i), ctypes.sizeof(i))


def keys(*vks):
    for v in vks:
        send(vk=v)
    for v in reversed(vks):
        send(vk=v, flags=2)
    time.sleep(0.3)


def type_text(s):
    for ch in s:
        send(scan=ord(ch), flags=4)
        send(scan=ord(ch), flags=4 | 2)
        time.sleep(0.02)


def click(hwnd, x, y):
    left, top, _, _ = rect(hwnd)
    user32.SetCursorPos(left + x, top + y)
    user32.mouse_event(0x0002, 0, 0, 0, 0)  # left down
    user32.mouse_event(0x0004, 0, 0, 0, 0)  # left up
    user32.SetCursorPos(left + W - 60, top + 300)  # park the pointer over the editor
    time.sleep(0.3)


def palette(command):
    keys(0x11, 0x10, 0x50)  # Ctrl+Shift+P
    time.sleep(0.8)
    type_text(command)
    time.sleep(0.8)
    keys(0x0D)  # Enter


def shot(hwnd, name, crop=None):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    img = ImageGrab.grab(bbox=rect(hwnd), all_screens=True)
    if crop:
        img = img.crop(crop)
    img.save(p)
    print(p)


def main():
    prepare()
    # When run from inside VS Code (e.g. Claude Code's chat), ELECTRON_RUN_AS_NODE and VSCODE_* are inherited and
    # make Code.exe run as plain node and exit. Drop them.
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("ELECTRON_", "VSCODE_"))}
    env.update(USERPROFILE=str(HOME), HOME=str(HOME))
    subprocess.Popen(
        [str(CODE), "--user-data-dir", str(UD), "--extensions-dir", str(EXT), "--new-window", str(WS), str(WS / "src" / "price.js")],
        env=env,
    )
    hwnd = find_window("shop-site")
    user32.ShowWindow(hwnd, 9)
    user32.SetWindowPos(hwnd, 0, 40, 10, W, H, 0x0004)
    time.sleep(10)  # let the extension start and read the sessions
    front(hwnd)
    time.sleep(1)
    click(hwnd, 100, 77)  # fold the workspace folder pane (its header row) so Chat Files gets the height
    time.sleep(0.8)
    palette("Focus on Chat Files View")  # a fresh profile starts with the view collapsed
    time.sleep(1.5)
    keys(0x24)  # Home: the newest prompt (open, 5 files)
    for _ in range(6):
        keys(0x28)  # Down to the second prompt
    keys(0x27)  # Right: open it
    time.sleep(1)
    shot(hwnd, "chat-files.png", crop=(0, 0, 720, 430))

    front(hwnd)
    palette("Open Outside: History")
    time.sleep(2)
    shot(hwnd, "history.png", crop=(0, 0, 960, 430))
    keys(0x1B)  # Esc
    time.sleep(0.5)
    user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE


if __name__ == "__main__":
    main()
