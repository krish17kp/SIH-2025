# The Unwinf
_A privacy-first wellbeing + community web app for higher-ed students._

Helps students **plan their week**, **balance study vs. rest**, and **forecast mood**, with optional **Discord-style community** (text + voice/video). Runs on a tiny VM; no GPU.

---

## ✨ Features
- **Study–Stress Balancer**
  - Log 7 days: _study, sleep, deadlines, classes, mood_
  - **KMeans** clusters → **Overloaded / Balanced / Relaxed** (with centroid “why”)
  - Auto 7-day plan (Pomodoro blocks + recovery tips)

- **Mood Forecast (7 days)**
  - Daily `{date, mood, sleep_hours, study_hours}` stored in **SQLite**
  - **ARIMA (SARIMAX)** with exogenous driver **(sleep − study)**
  - Built-in **accuracy** endpoint: MAE / RMSE / sMAPE vs naïve baseline
  - Demo actions: **Seed 14 days** / **Clear all**

- **Community (optional prototype)**
  - Servers → channels, DMs, friends
  - **WebRTC** voice/video with Firestore signaling (P2P when possible)

- **Privacy & Safety**
  - Minimal PII, same-origin API, crisis banner, CORS locked in prod

---

## 🧱 Tech Stack
**Frontend:** HTML5, CSS3, Vanilla JS, Chart.js  
**Backend:** Python (FastAPI, Uvicorn), pydantic  
**ML:** scikit-learn (KMeans), statsmodels (SARIMAX), NumPy, Pandas  
**DB:** SQLite (dev) → PostgreSQL (scale)  
**Optional:** Firebase Auth/Firestore (signaling), WebRTC  
**DevOps:** venv + pip, optional Docker, Nginx reverse proxy

---

## 🚀 Quick Start
> Requires Python 3.10+

```bash
git clone https://github.com/<your-org>/the-unwinf.git
cd the-unwinf
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate
pip install -r requirements.txt
