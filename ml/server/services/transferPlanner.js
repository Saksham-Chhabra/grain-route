const { runTransferPlanner } = require("./pythonRunner");
const { buildRouteBetween } = require("./routeService");

function coerceNumber(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildPlannerArgs(options = {}) {
  const args = [];
  if (options.mode) {
    args.push("--mode", options.mode);
  }

  const numericOptions = [
    ["--max-pairs", coerceNumber(options.maxPairs)],
    ["--min-transfer-kg", coerceNumber(options.minTransferKg)],
    ["--overstock-ratio", coerceNumber(options.overstockRatio)],
    ["--understock-ratio", coerceNumber(options.understockRatio)],
    ["--target-ratio", coerceNumber(options.targetRatio)],
  ];

  numericOptions.forEach(([flag, value]) => {
    if (value !== undefined) {
      args.push(flag, String(value));
    }
  });

  return args;
}

async function attachRouteToSuggestion(suggestion, { intervalKm, baseUrl }) {
  if (!suggestion || !suggestion.source || !suggestion.target) {
    return suggestion;
  }

  const sourceLocation = suggestion.source.location || {
    lat: suggestion.source.lat,
    lon: suggestion.source.lon,
  };
  const targetLocation = suggestion.target.location || {
    lat: suggestion.target.lat,
    lon: suggestion.target.lon,
  };

  if (
    !sourceLocation ||
    !targetLocation ||
    typeof sourceLocation.lat !== "number" ||
    typeof sourceLocation.lon !== "number" ||
    typeof targetLocation.lat !== "number" ||
    typeof targetLocation.lon !== "number"
  ) {
    return {
      ...suggestion,
      route: null,
      routeError: "Missing numeric coordinates for source or target node.",
    };
  }

  try {
    const route = await buildRouteBetween({
      baseUrl,
      start: sourceLocation,
      end: targetLocation,
      intervalKm,
    });
    return {
      ...suggestion,
      route,
    };
  } catch (error) {
    return {
      ...suggestion,
      route: null,
      routeError: error.message,
    };
  }
}

async function enrichSuggestions(list, routeConfig) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }
  const enriched = await Promise.all(
    list.map((suggestion) => attachRouteToSuggestion(suggestion, routeConfig)),
  );
  return enriched;
}

async function planTransfers({
  pythonBin,
  cwd,
  options = {},
  payload = {},
  intervalKm,
  routeServiceUrl,
  includeRoutes = true,
}) {
  const args = buildPlannerArgs(options);
  const plannerOutput = await runTransferPlanner({
    pythonBin,
    cwd,
    args,
    payload,
  });

  if (!includeRoutes) {
    return {
      ...plannerOutput,
      routing: {
        intervalKm: null,
        baseUrl: null,
        included: false,
      },
    };
  }

  const effectiveIntervalKm = Math.max(1, coerceNumber(intervalKm) || 5);
  const baseUrl = routeServiceUrl || "https://router.project-osrm.org";
  const routeConfig = { intervalKm: effectiveIntervalKm, baseUrl };

  const warehouseTransfers = await enrichSuggestions(
    plannerOutput.warehouse_to_warehouse,
    routeConfig,
  );
  const farmTransfers = await enrichSuggestions(
    plannerOutput.farm_to_warehouse,
    routeConfig,
  );

  return {
    ...plannerOutput,
    warehouse_to_warehouse: warehouseTransfers,
    farm_to_warehouse: farmTransfers,
    routing: {
      intervalKm: effectiveIntervalKm,
      baseUrl,
      included: true,
    },
  };
}

module.exports = {
  planTransfers,
};
