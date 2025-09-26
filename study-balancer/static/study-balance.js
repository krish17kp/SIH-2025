// static/study-balance.js
// Always call same origin as the page:
const API = ""; // "" makes fetch("/classify") same-origin safe

const $ = (id) => document.getElementById(id);
const daysEl = $("days");

// Helpers
function todayPlus(i) {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
}

function tmplHead() {
  return `
  <div class="grid">
    <div class="head">Date</div>
    <div class="head">Study hrs</div>
    <div class="head">Sleep hrs</div>
    <div class="head">Deadlines</div>
    <div class="head">Classes hrs</div>
    <div class="head">Mood (1–5)</div>
  </div>`;
}

function tmplRow(i) {
  return `
  <div class="grid">
    <input type="date" value="${todayPlus(i)}" class="date">
    <input type="number" step="0.5" value="${
      [2, 3, 4, 5, 6, 3, 2][i]
    }" class="study">
    <input type="number" step="0.5" value="${
      [7.5, 7, 6.5, 7, 6, 7.5, 8][i]
    }" class="sleep">
    <input type="number" value="${[0, 1, 1, 2, 1, 0, 0][i]}" class="deadlines">
    <input type="number" step="0.5" value="${
      [2, 2.5, 2, 1.5, 3, 0, 0][i]
    }" class="classes">
    <input type="number" step="0.5" value="${
      [3.5, 3, 3, 2.5, 3, 4, 4][i]
    }" class="mood">
  </div>`;
}

function buildTable() {
  daysEl.innerHTML =
    tmplHead() + Array.from({ length: 7 }, (_, i) => tmplRow(i)).join("");
}

function collectWeek() {
  const rows = daysEl.querySelectorAll(".grid:not(:first-child)");
  const logs = [];
  rows.forEach((r) => {
    const g = r.querySelectorAll("input");
    const toF = (x, def = 0) => {
      const v = parseFloat(x);
      return Number.isFinite(v) ? v : def;
    };
    const toI = (x, def = 0) => {
      const v = parseInt(x);
      return Number.isFinite(v) ? v : def;
    };
    logs.push({
      date: g[0].value,
      study_hours: toF(g[1].value),
      sleep_hours: toF(g[2].value),
      deadlines: toI(g[3].value),
      classes_hours: toF(g[4].value),
      mood: toF(g[5].value, 3),
      exercised: false,
    });
  });
  return { logs };
}

function labelColor(label) {
  return label === "Overloaded"
    ? "#ff2d55"
    : label === "Balanced"
    ? "#ffcc00"
    : "#1e7f4c";
}

function renderPlan(plan) {
  const wrap = $("plan");
  wrap.innerHTML = "";
  plan.days.forEach((d) => {
    const pomos = d.pomodoro
      .map(
        (b) =>
          `<span class="badge">${b.study_min}m study${
            b.break_min ? ` + ${b.break_min}m break` : ``
          }</span>`
      )
      .join(" ");
    const recs = d.recommendations.map((r) => `<li>${r}</li>`).join("");
    const div = document.createElement("div");
    div.className = "dayplan";
    div.innerHTML = `
      <div><b>${d.date}</b></div>
      <div>Target study: <b>${d.study_target_hours}h</b> • Sleep target: <b>${d.sleep_target_hours}h</b></div>
      <div>${pomos}</div>
      <ul>${recs}</ul>`;
    wrap.appendChild(div);
  });
}

$("balanceBtn").addEventListener("click", async () => {
  $("status").textContent = "Checking API…";
  $("result").classList.add("hide");
  const payload = collectWeek();

  try {
    const ping = await fetch(`${API}/health`);
    if (!ping.ok)
      throw new Error(`health ${ping.status}: ${await ping.text()}`);

    $("status").textContent = "Crunching…";

    const r1 = await fetch(`${API}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r1.ok) throw new Error(`classify ${r1.status}: ${await r1.text()}`);
    const cls = await r1.json();

    const r2 = await fetch(`${API}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r2.ok) throw new Error(`plan ${r2.status}: ${await r2.text()}`);
    const pl = await r2.json();

    $("label").textContent = cls.label;
    $("label").style.background = labelColor(cls.label);
    $("centroid").textContent =
      "Cluster centroid (explainability):\n" +
      JSON.stringify(cls.centroid_hint, null, 2);

    renderPlan(pl.plan);
    $("result").classList.remove("hide");
    $("status").textContent = "Done ✓";
  } catch (e) {
    console.error(e);
    $("status").textContent = e.message.includes("Failed to fetch")
      ? "Browser couldn't reach the API. Open the page from http://127.0.0.1:8001/ so it shares the same origin."
      : `Error: ${e.message}`;
  }
});

buildTable();
