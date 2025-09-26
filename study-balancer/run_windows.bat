@echo off
setlocal

REM 1) Choose a Python (3.10+). This finds "python" on PATH.
where python >nul 2>&1 || (echo Python not found. Install Python 3.10+ from python.org and re-run. & pause & exit /b 1)

REM 2) Create & activate venv
if not exist .venv (
  python -m venv .venv
)
call .venv\Scripts\activate

REM 3) Upgrade pip + install deps
python -m pip install --upgrade pip
pip install -r requirements.txt

REM 4) Start server on port 8001
echo.
echo Starting Study–Stress Balancer on http://127.0.0.1:8001/
python -m uvicorn _app:app --host 127.0.0.1 --port 8001 --reload

REM 5) When you Ctrl+C to stop, deactivate
deactivate
endlocal
