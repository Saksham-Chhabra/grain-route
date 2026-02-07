import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "./middleware/logger.middleware.js";
import { ApiError } from "./utils/ApiError.js";

const app = express();
app.use(cookieParser());

app.use(express.json({ limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(express.static("public"));
import { startScenario } from "./controllers/node.controller.js";

app.use(logger);

app.post("/api/v1/startMock", startScenario);
// Routes Import
import eventRouter from "./routes/event.route.js";
import mapRouter from "./routes/map.routes.js";
import nodeRouter from "./routes/node.route.js";
import requestRouter from "./routes/ngo.route.js";
import ngoRouter from "./routes/ngo.route.js";
import mlRouter from "./routes/model.route.js";
import batchRouter from "./routes/batch.route.js";
import shipmentRouter from "./routes/shipment.route.js";
import historyRouter from "./routes/history.route.js";
import suggestRouter from "./routes/suggest.route.js";

app.use("/api/v1/event/", eventRouter);
app.use("/api/v1/map", mapRouter);
app.use("/api/v1/node", nodeRouter);
app.use("/api/v1/request", requestRouter);
app.use("/api/v1/ngo", ngoRouter);
app.use("/api/ml", mlRouter);
app.use("/api/batches", batchRouter);
app.use("/api/shipments", shipmentRouter);
app.use("/api/history", historyRouter);
app.use("/api/suggest", suggestRouter);

// 404 handler (keeps API responses consistent)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: "Route not found",
  });
});

// Central error handler (prevents default HTML error pages)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode =
    err instanceof ApiError
      ? err.statusCode
      : typeof err?.statusCode === "number"
        ? err.statusCode
        : typeof err?.status === "number"
          ? err.status
          : 500;

  const payload = {
    success: false,
    statusCode,
    message: err?.message || "Internal Server Error",
    errors: err instanceof ApiError ? err.errors : err?.errors || [],
  };

  if (process.env.NODE_ENV !== "production") {
    payload.stack = err?.stack;
  }

  res.status(statusCode).json(payload);
});

// Store io instance in app for access in controllers
// Will be set by index.js after io is created
app.set("io", null);

export { app };
