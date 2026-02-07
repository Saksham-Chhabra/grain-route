const baseUrl = process.env.SIM_URL || "http://localhost:3001/api/history/simulate";
const date = process.env.SIM_DATE || "2026-02-05";
const days = process.env.SIM_DAYS || "7";
const backlog = process.env.SIM_BACKLOG || "10";

const dayKey = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const travelHours = (distanceKm) => {
  const avgSpeedKmh = 40;
  const baseHours = (Number(distanceKm) || 0) / avgSpeedKmh;
  const breaks = Math.floor(baseHours / 4) * 0.5;
  return baseHours + breaks;
};

const etaIso = (dispatchIso, distanceKm) => {
  const start = new Date(dispatchIso);
  if (Number.isNaN(start.getTime())) return null;
  const etaMs = start.getTime() + travelHours(distanceKm) * 3600 * 1000;
  return new Date(etaMs).toISOString();
};

const summarize = (name, allocs) => {
  const total = allocs.length;
  const nonzero = allocs.filter((a) => (Number(a.allocated_kg) || 0) > 0);
  const zero = total - nonzero.length;

  let min = Infinity;
  let max = -Infinity;
  const byDispatchDay = new Map();
  const byArrivalDay = new Map();

  for (const a of nonzero) {
    const t = new Date(a.dispatchTime || 0).getTime();
    if (Number.isFinite(t)) {
      min = Math.min(min, t);
      max = Math.max(max, t);
    }

    const dKey = dayKey(a.dispatchTime);
    byDispatchDay.set(dKey, (byDispatchDay.get(dKey) || 0) + 1);

    const eta = etaIso(a.dispatchTime, a.distance_km);
    const aKey = dayKey(eta);
    byArrivalDay.set(aKey, (byArrivalDay.get(aKey) || 0) + 1);
  }

  const sorted = (m) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  console.log(`\n== ${name} ==`);
  console.log("allocations", total, "nonzero", nonzero.length, "zero", zero);
  console.log(
    "dispatch range",
    Number.isFinite(min) ? new Date(min).toISOString() : "n/a",
    "->",
    Number.isFinite(max) ? new Date(max).toISOString() : "n/a"
  );

  console.log("nonzero by dispatch day:");
  for (const [k, v] of sorted(byDispatchDay)) console.log(" ", k, v);

  console.log("nonzero by arrival day (ETA):");
  for (const [k, v] of sorted(byArrivalDay)) console.log(" ", k, v);
};

(async () => {
  const u = new URL(baseUrl);
  u.searchParams.set("date", date);
  u.searchParams.set("days", days);
  u.searchParams.set("backlog", backlog);

  const resp = await fetch(u);
  const json = await resp.json();
  if (!json?.success) {
    console.error("Simulation endpoint error", json);
    process.exit(1);
  }

  summarize("Regular", json.data?.regular?.allocations || []);
  summarize("ML", json.data?.ml?.allocations || []);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
