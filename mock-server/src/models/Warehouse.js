const mongoose = require('mongoose');

const WarehouseSchema = new mongoose.Schema(
  {
    name: { type: String, index: true },
    code: { type: String, index: true },
    regionCode: { type: String, index: true },
    capacityTonnes: Number,
    latitude: Number,
    longitude: Number,
    location: {
      type: { type: String },
      coordinates: [Number],
    },
    attributes: { type: mongoose.Schema.Types.Mixed },
  },
  { collection: 'warehouses' }
);

module.exports = mongoose.model('Warehouse', WarehouseSchema);
