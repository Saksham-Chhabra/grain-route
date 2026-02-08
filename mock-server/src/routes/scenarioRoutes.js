const express = require('express');
const controller = require('../controllers/scenarioController');

const router = express.Router();

router.post('/start', controller.startScenario);
router.post('/stop', controller.stopScenario);
router.get('/:id/status', controller.getStatus);
router.get('/:id/events', controller.getEvents);

module.exports = router;
