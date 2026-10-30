#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
PORT=8099
echo
echo "  미리 (Miri) 로컬 서버"
echo "  ----------------------------------------"
echo "  주소:  http://localhost:$PORT/"
echo "  끄기:  Ctrl+C"
echo
echo "  * localhost 는 보안 컨텍스트라서 설치·오프라인·알림까지 동작합니다."
echo
(sleep 1; (command -v open >/dev/null && open "http://localhost:$PORT/") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT/")) &
python3 -m http.server "$PORT"
