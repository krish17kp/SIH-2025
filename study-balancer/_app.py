# app.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import numpy as np

# ---- NEW (for Mood Forecasting) ----
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX
# ------------------------------------

app = FastAPI(title="Study–Stress Balancer", version="1.0")

# Serve static UI (HTML/CSS/JS) from same origin
app.mount("/static", StaticFiles(directory="static"), name="static")

# CORS (keep permissive for local dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8001", "http://localhost:8001",
        "http://127.0.0.1:5500", "http://localhost:5500",
        "http://127.0.0.1:5501", "http://localhost:5501",
        "null"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================
#   Balancer data models
# ============================
class DayLog(BaseModel):
    date: str
    study_hours: float = Field(ge=0, le=24)
    sleep_hours: float = Field(ge=0, le=24)
    deadlines: int = Field(ge=0)
    classes_hours: float = Field(ge=0, le=24)
    mood: Optional[float] = Field(default=3.0, ge=1, le=5)
    exercised: Optional[bool] = False

class WeekIn(BaseModel):
    logs: List[DayLog]

# ==========================================
#   Seeded KMeans model (Over/Bal/Relaxed)
# ==========================================
SEED = np.array([
    [42, 5.5, 7, 14, 2.4, 1],  # overloaded
    [40, 6.0, 6, 12, 2.6, 1],
    [28, 7.0, 3, 10, 3.2, 3],  # balanced
    [25, 7.5, 2, 11, 3.4, 3],
    [15, 8.2, 0,  8, 4.2, 4],  # relaxed
    [12, 8.0, 1,  6, 4.0, 5],
], dtype=float)

FEATURE_NAMES = ["study_total","sleep_avg","deadlines_7d","classes_total","mood_avg","exercise_days"]

scaler = StandardScaler()
X_seed = scaler.fit_transform(SEED)
kmeans = KMeans(n_clusters=3, n_init=10, random_state=42).fit(X_seed)

def label_clusters() -> Dict[int, str]:
    centers_inv = scaler.inverse_transform(kmeans.cluster_centers_)
    names: Dict[int, str] = {}
    for i, c in enumerate(centers_inv):
        study, sleep, dln, classes, mood, ex = c
        score_overload = (study/40.0) + (dln/6.0) - (sleep/7.0) - ((mood-3)/2.0)
        if score_overload > 0.6:
            names[i] = "Overloaded"
        elif score_overload < -0.2:
            names[i] = "Relaxed"
        else:
            names[i] = "Balanced"
    return names

CLUSTER_NAMES = label_clusters()

def week_to_features(week: WeekIn) -> np.ndarray:
    if not week.logs:
        raise HTTPException(400, "No logs provided")
    study_total   = float(sum(d.study_hours   for d in week.logs))
    sleep_avg     = float(sum(d.sleep_hours   for d in week.logs)/len(week.logs))
    deadlines_7d  = float(sum(d.deadlines     for d in week.logs))
    classes_total = float(sum(d.classes_hours for d in week.logs))
    mood_avg      = float(sum((d.mood or 3.0) for d in week.logs)/len(week.logs))
    exercise_days = float(sum(1 for d in week.logs if d.exercised))
    X = np.array([[study_total, sleep_avg, deadlines_7d, classes_total, mood_avg, exercise_days]], dtype=float)
    if np.isnan(X).any() or np.isinf(X).any():
        raise HTTPException(400, "NaN/Inf detected in features")
    return X

def plan_for_cluster(label: str, week: WeekIn) -> Dict[str, Any]:
    def daily_blocks(target_study: float):
        out, minutes = [], int(round(target_study*60))
        while minutes > 0:
            s = min(50, minutes); minutes -= s
            b = 10 if minutes > 0 else 0
            out.append({"study_min": s, "break_min": b})
        return out

    if label == "Overloaded":
        sleep_target, max_study, add_recovery = 7.5, 4.5, True
    elif label == "Balanced":
        sleep_target, max_study, add_recovery = 7.0, 5.5, False
    else:
        sleep_target, max_study, add_recovery = 7.5, 4.0, False

    days = []
    for d in week.logs:
        base = min(max_study, float(d.study_hours) + (float(d.deadlines) * 0.6))
        if label == "Overloaded": base = min(base, 4.0)
        if label == "Relaxed":    base = max(base, 2.0)
        rec = []
        if add_recovery: rec += ["20-min walk", "2× 4-7-8 breathing", "No screens 30 min before bed"]
        if d.deadlines >= 2: rec += ["Do due-tomorrow tasks first"]
        if d.mood is not None and d.mood <= 2.5: rec += ["Short check-in with mentor/friend"]
        days.append({
            "date": d.date,
            "sleep_target_hours": sleep_target,
            "study_target_hours": round(base, 1),
            "pomodoro": daily_blocks(round(base, 1)),
            "recommendations": rec[:4]
        })
    return {"days": days}


# ============================
#   Mood Forecasting (SQLite)
# ============================
DB_PATH = Path("mood.db")

def db_conn():
    return sqlite3.connect(DB_PATH)

def init_db():
    with db_conn() as con:
        con.execute("""
        CREATE TABLE IF NOT EXISTS mood_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dte TEXT NOT NULL UNIQUE,       -- YYYY-MM-DD
            mood REAL NOT NULL,             -- 1..5
            sleep_hours REAL NOT NULL,      -- 0..24
            study_hours REAL NOT NULL       -- 0..24
        );
        """)
init_db()

class MoodLogIn(BaseModel):
    date: str                     # "YYYY-MM-DD"
    mood: float = Field(ge=1, le=5)
    sleep_hours: float = Field(ge=0, le=24)
    study_hours: float = Field(ge=0, le=24)

def upsert_mood_log(m: MoodLogIn):
    try:
        d = datetime.strptime(m.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    with db_conn() as con:
        con.execute("""
        INSERT INTO mood_logs (dte, mood, sleep_hours, study_hours)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(dte) DO UPDATE SET
          mood=excluded.mood,
          sleep_hours=excluded.sleep_hours,
          study_hours=excluded.study_hours
        """, (str(d), float(m.mood), float(m.sleep_hours), float(m.study_hours)))

def df_mood(last_days: Optional[int] = None) -> pd.DataFrame:
    with db_conn() as con:
        df = pd.read_sql_query("SELECT dte, mood, sleep_hours, study_hours FROM mood_logs ORDER BY dte", con)
    if df.empty:
        return df
    df["dte"] = pd.to_datetime(df["dte"])
    df = df.set_index("dte").asfreq("D")
    df[["mood","sleep_hours","study_hours"]] = df[["mood","sleep_hours","study_hours"]].ffill().bfill()
    if last_days:
        df = df.last(f"{last_days}D")
    # If > 180 days, resample to weekly averages to keep the chart light
    if len(df) > 180:
        df = df.resample("W").mean().interpolate(limit_direction="both")
    return df


def forecast_mood(next_days: int = 7):
    df = df_mood()
    # Not enough history? baseline forecast (repeat last mood or 3.0)
    if df.empty or len(df) < 7:
        start = (datetime.today().date() + timedelta(days=1))
        base = float(df["mood"].iloc[-1]) if not df.empty else 3.0
        return [{"date": str(start + timedelta(days=i)), "mood": round(base, 2)} for i in range(next_days)]

    # Exogenous regressor: (sleep - study), normalized
    exog = (df["sleep_hours"] - df["study_hours"]).to_frame("balance")
    exog["balance"] = (exog["balance"] - exog["balance"].mean()) / (exog["balance"].std() + 1e-6)

    model = SARIMAX(
        endog=df["mood"],
        exog=exog,
        order=(1, 1, 1),
        seasonal_order=(0, 0, 0, 0),
        enforce_stationarity=False,
        enforce_invertibility=False
    )
    res = model.fit(disp=False)

    # Future exog: persist last value
    last_bal = float(exog["balance"].iloc[-1])
    future_idx = pd.date_range(df.index[-1] + pd.Timedelta(days=1), periods=next_days, freq="D")
    exog_future = pd.DataFrame({"balance": [last_bal]*next_days}, index=future_idx)

    fc = res.get_forecast(steps=next_days, exog=exog_future)
    yhat = fc.predicted_mean.clip(1.0, 5.0)
    return [{"date": d.strftime("%Y-%m-%d"), "mood": round(float(v), 2)} for d, v in zip(future_idx, yhat.values)]


from math import sqrt

def _metrics(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    n = len(y_true)
    mae  = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(sqrt(np.mean((y_true - y_pred)**2)))
    # Guard MAPE for zeros (mood is 1..5 so fine, but keep safe)
    mape = float(np.mean(np.abs((y_true - y_pred) / np.clip(np.abs(y_true), 1e-6, None))) * 100.0)
    smape = float(np.mean(2.0 * np.abs(y_pred - y_true) / np.clip(np.abs(y_true) + np.abs(y_pred), 1e-6, None)) * 100.0)
    return {"n": n, "MAE": round(mae, 4), "RMSE": round(rmse, 4), "MAPE": round(mape, 2), "sMAPE": round(smape, 2)}

def backtest_mood(order=(1,1,1), min_days=14, refit_every=7):
    """
    Expanding-window 1-step-ahead backtest for ARIMA (SARIMAX with exog).
    Re-fits every `refit_every` steps for speed.
    """
    df = df_mood()
    if df.empty or len(df) < min_days:
        raise HTTPException(400, f"Not enough data for accuracy. Need >= {min_days} days, have {len(df)}.")

    # exogenous regressor
    exog_all = (df["sleep_hours"] - df["study_hours"]).to_frame("balance")
    exog_all["balance"] = (exog_all["balance"] - exog_all["balance"].mean()) / (exog_all["balance"].std() + 1e-6)

    y = df["mood"].astype(float)
    start = max(7, min_days // 2)  # warm-up for first fit
    preds, trues = [], []

    model = None
    res = None

    for i in range(start, len(y)):
        # Refit periodically (or on first step)
        if (i == start) or ((i - start) % refit_every == 0):
            model = SARIMAX(
                endog=y.iloc[:i],
                exog=exog_all.iloc[:i],
                order=order,
                seasonal_order=(0,0,0,0),
                enforce_stationarity=False,
                enforce_invertibility=False
            )
            res = model.fit(disp=False)

        # Forecast next day (1-step ahead)
        exog_future = exog_all.iloc[i:i+1]
        fc = res.get_forecast(steps=1, exog=exog_future).predicted_mean
        pred = float(np.clip(fc.values[0], 1.0, 5.0))
        true = float(y.iloc[i])
        preds.append(pred)
        trues.append(true)

    # Baseline: naive-1 (predict tomorrow = today)
    naive_pred = y.shift(1).iloc[start:].astype(float)
    naive_true = y.iloc[start:].astype(float)

    sarimax_metrics = _metrics(trues, preds)
    naive_metrics   = _metrics(naive_true, naive_pred)

    def improve(a, b):  # positive = better than baseline
        return round(100.0 * (b - a) / b, 2) if b > 0 else None

    return {
        "samples_evaluated": sarimax_metrics["n"],
        "sarimax": sarimax_metrics,
        "naive": naive_metrics,
        "improvement_vs_naive": {
            "MAE_%":  improve(sarimax_metrics["MAE"],  naive_metrics["MAE"]),
            "RMSE_%": improve(sarimax_metrics["RMSE"], naive_metrics["RMSE"]),
            "sMAPE_%": improve(sarimax_metrics["sMAPE"], naive_metrics["sMAPE"]),
        }
    }

# ============================
#           Routes
# ============================
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/classify")
def classify(week: WeekIn):
    X = week_to_features(week)
    k = int(kmeans.predict(scaler.transform(X))[0])
    centers_inv = scaler.inverse_transform(kmeans.cluster_centers_)
    centroid = centers_inv[k]
    return {
        "cluster": k,
        "label": CLUSTER_NAMES[k],
        "centroid_hint": {n: round(float(v), 2) for n, v in zip(FEATURE_NAMES, centroid)},
        "features_submitted": {n: round(float(v), 2) for n, v in zip(FEATURE_NAMES, X[0])}
    }

@app.post("/plan")
def plan(week: WeekIn):
    X = scaler.transform(week_to_features(week))
    k = int(kmeans.predict(X)[0])
    label = CLUSTER_NAMES[k]
    return {"label": label, "plan": plan_for_cluster(label, week)}

# ---- Mood API ----
@app.post("/mood/log")
def mood_log(m: MoodLogIn):
    upsert_mood_log(m)
    return {"ok": True}


@app.get("/mood/series")
def mood_series(days: int = 120):   # <= last 120 days by default
    days = max(7, min(days, 365))   # sane bounds
    df = df_mood(last_days=days)
    if df.empty:
        return {"history": []}
    hist = [{
        "date": d.strftime("%Y-%m-%d"),
        "mood": round(float(df.at[d, "mood"]), 2),
        "sleep_hours": round(float(df.at[d, "sleep_hours"]), 2),
        "study_hours": round(float(df.at[d, "study_hours"]), 2),
    } for d in df.index]
    return {"history": hist}

@app.post("/mood/clear")
def mood_clear():
    with db_conn() as con:
        con.execute("DELETE FROM mood_logs")
    return {"ok": True, "msg": "cleared"}

@app.post("/mood/seed")
def mood_seed(days: int = 14):
    """Seed the last `days` with plausible values to demo forecasting quickly."""
    days = max(7, min(days, 60))
    today = datetime.today().date()
    with db_conn() as con:
        for i in range(days, 0, -1):
            d = today - timedelta(days=i)
            # simple pattern: sleep ~ 6.5–8.2, study ~ 2–6, mood follows (sleep - study)
            sleep = 7.2 + np.sin(i/3)*0.5 + np.random.normal(0, 0.15)
            study = 3.5 + np.cos(i/4)*1.0 + np.random.normal(0, 0.3)
            balance = sleep - (study*0.35)
            mood = np.clip(3.0 + (balance-5.0)*0.4 + np.random.normal(0,0.15), 1.0, 5.0)
            con.execute("""
                INSERT INTO mood_logs (dte, mood, sleep_hours, study_hours)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(dte) DO UPDATE SET mood=excluded.mood, sleep_hours=excluded.sleep_hours, study_hours=excluded.study_hours
            """, (str(d), float(mood), float(sleep), float(study)))
    return {"ok": True, "msg": f"seeded {days} days"}



@app.get("/mood/forecast")
def mood_forecast():
    fc = forecast_mood(next_days=7)
    return {"forecast": fc}

# Root: serve Balancer UI
@app.get("/", include_in_schema=False)
def ui_root():
    return FileResponse("static/study-balance.html")

@app.get("/mood/accuracy")
def mood_accuracy(min_days: int = 14, refit_every: int = 7):
    """
    Returns backtest accuracy for the ARIMA-based mood forecaster on your stored history.
    """
    result = backtest_mood(order=(1,1,1), min_days=min_days, refit_every=refit_every)
    return result
