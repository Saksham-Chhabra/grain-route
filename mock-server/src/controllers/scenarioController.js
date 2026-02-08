const mongoose = require('mongoose');
const scenarioManager = require('../services/scenarioManager');

async function startScenario(req, res) {
  try {
    const scenario = await scenarioManager.startScenario(req.body || {});
    res
      .status(201)
      .json({ scenarioId: scenario._id.toString(), status: scenario.status });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function stopScenario(req, res) {
  try {
    const { scenarioId } = req.body || {};
    if (!scenarioId || !mongoose.isValidObjectId(scenarioId))
      return res.status(400).json({ error: 'Valid scenarioId is required' });
    const scenario = await scenarioManager.stopScenario(scenarioId);
    res.json({
      scenarioId: scenario._id.toString(),
      status: scenario.status,
      stats: scenario.stats,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

async function getStatus(req, res) {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ error: 'Valid scenarioId is required' });
    const scenario = await scenarioManager.getScenarioStatus(id);
    res.json(scenario);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
}

async function getEvents(req, res) {
  try {
    const { id } = req.params;
    const { limit } = req.query;
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ error: 'Valid scenarioId is required' });
    const events = await scenarioManager.getScenarioEvents(id, limit);
    res.json(events);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  startScenario,
  stopScenario,
  getStatus,
  getEvents,
};
