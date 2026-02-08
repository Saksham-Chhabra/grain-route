const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const scenarioRoutes = require("./routes/scenarioRoutes");
const transportRoutes = require("./routes/transportRoutes");
const weatherRoutes = require("./routes/weatherRoutes");
const { MONGO_URI } = require("./config");

const app = express();

app.use(bodyParser.json({ limit: "50mb" }));
app.use("/api/scenario", scenarioRoutes);
app.use("/api/transport", transportRoutes);
app.use("/api/weather", weatherRoutes);

const port = process.env.PORT || 5001;

async function bootstrap() {
  mongoose.set("strictQuery", false);
  await mongoose.connect(MONGO_URI);
  app.listen(port, () => {
    console.log(`Scenario Manager listening on ${port}`);
  });
}

bootstrap().catch((err) => {
  console.error("Startup error", err.message);
  process.exit(1);
});

module.exports = app;
