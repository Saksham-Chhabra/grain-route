# Installation Instructions

## Required Dependencies

To run the Food Timeline Animation, you need to install the following packages:

```bash
npm install leaflet react-leaflet @types/leaflet
```

## Setup

1. Install dependencies:
   ```bash
   cd client
   npm install leaflet react-leaflet @types/leaflet
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Features

- **Interactive Map**: View food supply chain data on a map
- **Timeline Animation**: Play/pause timeline to see data points appear over time
- **Category Colors**: 
  - Green: Origin (farms)
  - Blue: Production (processing plants)
  - Amber: Distribution (distribution centers)
  - Red: Consumption (retail stores)
- **Customizable**: Easy to replace sample data with your own data

## Customizing Data

Edit `src/data/sampleFoodData.ts` to use your own food timeline data. The data structure expects:

```typescript
interface FoodDataPoint {
  id: string;
  name: string;
  lat: number;        // Latitude
  lng: number;        // Longitude
  timestamp: Date;    // When this event occurred
  category: string;   // 'origin', 'production', 'distribution', 'consumption'
  description?: string;
  value?: number;
}
```

