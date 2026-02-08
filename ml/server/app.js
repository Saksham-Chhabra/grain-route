const express = require("express");

const config = require("./config");
const {
  listRunDirectories,
  getLatestRunDir,
  ensureRunExists,
  readMetadata,
} = require("./utils/artifacts");
const { runInference } = require("./services/pythonRunner");
const { planTransfers } = require("./services/transferPlanner");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", async (req, res, next) => {
  try {
    const runs = await listRunDirectories(config.artifactsDir);
    res.json({
      status: "ok",
      artifactsDir: config.artifactsDir,
      availableRuns: runs,
      pythonBin: config.pythonBin,
      routeServiceUrl: config.routeServiceUrl,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/runs", async (req, res, next) => {
  try {
    const runs = await listRunDirectories(config.artifactsDir);
    res.json({ runs });
  } catch (error) {
    next(error);
  }
});

app.get("/runs/:runId/metadata", async (req, res, next) => {
  try {
    const { runId } = req.params;
    const runDir = await ensureRunExists(config.artifactsDir, runId);
    if (!runDir) {
      return res.status(404).json({ error: `Run ${runId} not found` });
    }
    try {
      const metadata = await readMetadata(runDir);
      return res.json(metadata);
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "metadata.json not found" });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

app.post("/predict", async (req, res, next) => {
  try {
    const { runId } = req.body || {};
    const hasServerPayload =
      req.body &&
      (Array.isArray(req.body.nodes) ||
        Array.isArray(req.body.requests) ||
        Array.isArray(req.body.shipments) ||
        Array.isArray(req.body.batches));
    const hasRecords =
      Array.isArray(req.body?.records) && req.body.records.length > 0;
    if (!hasRecords && !hasServerPayload) {
      return res.status(400).json({
        error:
          "Provide either 'records' (non-empty array of feature rows) or raw Server data: nodes/requests/shipments/batches.",
      });
    }
    let runDir;

    if (runId) {
      runDir = await ensureRunExists(config.artifactsDir, runId);
      if (!runDir) {
        console.warn(`Run ${runId} not found, falling back to latest`);
        runDir = await getLatestRunDir(config.artifactsDir);
      }
    } else {
      runDir = await getLatestRunDir(config.artifactsDir);
    }

    if (!runDir) {
      return res.status(400).json({ error: "No trained models available" });
    }

    const payload = await runInference({
      pythonBin: config.pythonBin,
      cwd: config.rootDir,
      modelDir: runDir,
      payload: hasServerPayload ? req.body : { records: req.body.records },
    });

    return res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/transfers/plan", async (req, res, next) => {
  try {
    const {
      mode,
      maxPairs,
      minTransferKg,
      overstockRatio,
      understockRatio,
      targetRatio,
      intervalKm,
      filters,
      includeRoutes,
    } = req.body || {};

    const plan = await planTransfers({
      pythonBin: config.pythonBin,
      cwd: config.rootDir,
      options: {
        mode,
        maxPairs,
        minTransferKg,
        overstockRatio,
        understockRatio,
        targetRatio,
      },
      payload: { ...(req.body || {}), filters: filters || {} },
      intervalKm,
      routeServiceUrl: config.routeServiceUrl,
      includeRoutes: includeRoutes !== false,
    });

    return res.json(plan);
  } catch (error) {
    next(error);
  }
});

// Basic error handler so API always returns JSON payloads.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal Server Error",
    stderr: err.stderr,
    stdout: err.stdout,
  });
});

module.exports = app;
