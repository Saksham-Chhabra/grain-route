const mongoose = require('mongoose');

const CropSeasonSchema = new mongoose.Schema(
  {
    state: { type: String, index: true },
    district: { type: String, index: true },
    crop: { type: String, index: true },
    season: { type: String, index: true },
    area_hectare: Number,
    production_tonnes: Number,
    yield_tonha: Number,
    source_file: String,
    season_growth_months: Number,
    season_harvest_end_month: Number,
    season_harvest_start_month: Number,
    season_sowing_end_month: Number,
    season_sowing_start_month: Number,
  },
  { collection: 'crop_seasons' }
);

module.exports = mongoose.model('CropSeason', CropSeasonSchema);
