const API = ""; // same-origin

const $ = (id) => document.getElementById(id);
const fmt = (d) => new Date(d).toISOString().slice(0, 10);

(function setDefaultDate() {
  $("date").value = fmt(new Date());
})();

$("save").addEventListener("click", async () => {
  $("status").textContent = "Saving...";
  try {
    const payload = {
      date: $("date").value,
      mood: parseFloat($("mood").value),
      sleep_hours: parseFloat($("sleep").value),
      study_hours: parseFloat($("study").value),
    };
    const r = await fetch(`/mood/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(await r.text());
    $("status").textContent = "Saved ✓";

    // ⬇️ Immediately redraw and re-forecast
    await draw();
  } catch (e) {
    $("status").textContent = `Error: ${e.message}`;
    console.error(e);
  }
});

$("seed").addEventListener("click", async () => {
  $("status").textContent = "Seeding…";
  try {
    const r = await fetch(`/mood/seed`, { method: "POST" });
    if (!r.ok) throw new Error(await r.text());
    await draw();
    $("status").textContent = "Seeded ✓";
  } catch (e) {
    $("status").textContent = `Error: ${e.message}`;
  }
});

$("clear").addEventListener("click", async () => {
  $("status").textContent = "Clearing…";
  try {
    const r = await fetch(`/mood/clear`, { method: "POST" });
    if (!r.ok) throw new Error(await r.text());
    await draw();
    $("status").textContent = "Cleared ✓";
  } catch (e) {
    $("status").textContent = `Error: ${e.message}`;
  }
});

let chart;
async function draw() {
  $("status").textContent = "Loading...";
  $("refresh").disabled = true; // avoid double clicks
  try {
    const h = await (await fetch(`/mood/series?days=120`)).json(); // <= limit
    const f = await (await fetch(`/mood/forecast`)).json();

    const hist = h.history || [];
    const fc = f.forecast || [];

    const labels = [...hist.map((x) => x.date), ...fc.map((x) => x.date)];
    const histY = hist.map((x) => x.mood);
    const fcY = [...Array(hist.length).fill(null), ...fc.map((x) => x.mood)];

    if (chart) chart.destroy();
    const ctx = $("chart").getContext("2d");
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "History (mood)",
            data: histY,
            borderWidth: 2,
            spanGaps: true,
            pointRadius: 0, // <= faster
          },
          {
            label: "Forecast (mood)",
            data: fcY,
            borderDash: [5, 5],
            borderWidth: 2,
            spanGaps: true,
            pointRadius: 2,
          },
        ],
      },
      options: {
        animation: false, // <= kill animations
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        elements: { line: { tension: 0.2 } },
        plugins: {
          legend: { display: true },
          decimation: {
            // <= built-in speedup
            enabled: true,
            algorithm: "min-max",
          },
        },
        scales: {
          y: {
            suggestedMin: 1,
            suggestedMax: 5,
            title: { display: true, text: "Mood (1–5)" },
          },
        },
      },
    });
    $("status").textContent = "Ready ✓";
  } catch (e) {
    $("status").textContent = `Error: ${e.message}`;
    console.error(e);
  } finally {
    $("refresh").disabled = false;
  }
}

$("refresh").addEventListener("click", draw);
draw();
