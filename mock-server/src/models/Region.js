const mongoose = require('mongoose');

const RegionSchema = new mongoose.Schema(
  {
    name: { type: String, index: true },
    state: { type: String, index: true },
    district: { type: String, index: true },
    code: { type: String, index: true },
    slug: { type: String, index: true },
    centroid: {
      type: { type: String },
      coordinates: [Number],
    },
    latitude: Number,
    longitude: Number,
    population: Number,
    attributes: { type: mongoose.Schema.Types.Mixed },
  },
  { collection: 'regions' }
);

module.exports = mongoose.model('Region', RegionSchema);
