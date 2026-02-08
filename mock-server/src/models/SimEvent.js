const mongoose = require('mongoose');

const SimEventSchema = new mongoose.Schema(
  {
    scenarioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Scenario',
      index: true,
      required: true,
    },
    type: {
      type: String,
      enum: ['farm', 'shipment', 'ngo'],
      index: true,
      required: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    tickIndex: { type: Number, index: true, required: true },
    timestamp: { type: Date, index: true, required: true },
  },
  {
    collection: 'sim_events',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

module.exports = mongoose.model('SimEvent', SimEventSchema);
