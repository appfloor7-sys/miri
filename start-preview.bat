@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   미리 (Miri) 로컬 서버
echo   ----------------------------------------
echo   주소:  http://localhost:8099/
echo   끄기:  이 창에서 Ctrl+C
echo.
echo   * localhost 는 보안 컨텍스트라서
echo     홈 화면 추가(설치), 오프라인, 알림까지 동작합니다.
echo.
start "" http://localhost:8099/
python -m http.server 8099 2>nul || py -m http.server 8099
pause
