#!/usr/bin/env python3
"""index.html + css + js + 아이콘을 standalone.html 한 파일로 합친다."""
import base64, pathlib, re

ROOT = pathlib.Path(__file__).parent
html = (ROOT / "index.html").read_text(encoding="utf-8")

css = (ROOT / "css/app.css").read_text(encoding="utf-8")
html = html.replace(
    '<link rel="stylesheet" href="css/app.css">',
    "<style>\n" + css + "\n</style>",
)

for name in ("store", "app"):
    js = (ROOT / f"js/{name}.js").read_text(encoding="utf-8")
    html = html.replace(
        f'<script src="js/{name}.js"></script>',
        f"<script>\n{js}\n</script>",
    )

# file:// 에서는 manifest/SW가 동작하지 않으므로 링크만 제거
html = re.sub(r'\n<link rel="manifest"[^>]*>', "", html)
html = html.replace('<link rel="icon" href="icons/icon.svg" type="image/svg+xml">', "")
html = html.replace('<link rel="apple-touch-icon" href="icons/icon-192.png">', "")

svg = (ROOT / "icons/icon.svg").read_text(encoding="utf-8")
svg_uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode()
html = html.replace(
    "<title>", '<link rel="icon" href="' + svg_uri + '">\n<title>', 1
)

# SW 등록은 오프라인 캐시용이므로 단일 파일에서는 건너뛴다
html = html.replace("navigator.serviceWorker.register('sw.js')", "Promise.reject()")

out = ROOT / "standalone.html"
out.write_text(html, encoding="utf-8")
print(f"{out}  {out.stat().st_size / 1024:.1f} KB")
