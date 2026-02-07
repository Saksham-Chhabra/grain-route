export interface FoodDataPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  timestamp: Date;
  category: string;
  description?: string;
  value?: number;
}

export interface Node {
  id: string;
  nodeId: string;
  name: string;
  type: 'farm' | 'warehouse' | 'ngo' | 'processing';
  lat: number;
  lng: number;
}

export interface Shipment {
  id: string;
  shipmentId: string;
  fromNodeId: string;
  toNodeId: string;
  startTime: Date;
  etaTime?: Date;
  arrivedTime?: Date;
  status: 'in_transit' | 'arrived' | 'delayed' | 'cancelled';
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  foodItem: string;
  value: number;
}

export interface ShipmentLocationUpdate {
  id: string;
  shipmentId: string;
  lat: number;
  lng: number;
  timestamp: Date;
}

export interface Event {
  id: string;
  eventId: string;
  time: Date;
  type: 'farm_production' | 'ngo_request' | 'shipment_created' | 'shipment_arrived' | 'shipment_location_update' | 'batch_spoiled' | 'prediction_made';
  lat: number;
  lng: number;
  payload: any;
  shipmentId?: string;
}

// Generate complete food supply chain data with shipments and events
export const generateFoodTimelineData = () => {
  // Start from today and span 30 days forward
  const startTime = new Date();
  startTime.setHours(0, 0, 0, 0); // Set to start of day
  
  // 30 days = 30 * 24 * 60 * 60 * 1000 milliseconds
  const daysDuration = 30;
  const endTime = new Date(startTime);
  endTime.setDate(endTime.getDate() + daysDuration);

  // Create nodes (locations) - All in India
  const nodes: Node[] = [
    // Farms in agricultural regions of India
    { id: 'node-1', nodeId: 'N001', name: 'Punjab Wheat Farm', type: 'farm', lat: 30.9129, lng: 75.7873 }, // Ludhiana, Punjab
    { id: 'node-2', nodeId: 'N002', name: 'Haryana Rice Farm', type: 'farm', lat: 29.0588, lng: 76.0856 }, // Karnal, Haryana
    { id: 'node-3', nodeId: 'N003', name: 'Maharashtra Cotton Farm', type: 'farm', lat: 19.0760, lng: 72.8777 }, // Mumbai, Maharashtra
    { id: 'node-4', nodeId: 'N004', name: 'Karnataka Coffee Farm', type: 'farm', lat: 12.9716, lng: 77.5946 }, // Bangalore, Karnataka
    { id: 'node-5', nodeId: 'N005', name: 'Tamil Nadu Vegetable Farm', type: 'farm', lat: 13.0827, lng: 80.2707 }, // Chennai, Tamil Nadu
    { id: 'node-6', nodeId: 'N006', name: 'Uttar Pradesh Sugarcane Farm', type: 'farm', lat: 26.8467, lng: 80.9462 }, // Lucknow, UP
    { id: 'node-7', nodeId: 'N007', name: 'Gujarat Groundnut Farm', type: 'farm', lat: 23.0225, lng: 72.5714 }, // Ahmedabad, Gujarat
    
    // Processing Plants
    { id: 'node-8', nodeId: 'N008', name: 'Delhi Food Processing Unit', type: 'processing', lat: 28.6139, lng: 77.2090 }, // Delhi
    { id: 'node-9', nodeId: 'N009', name: 'Pune Processing Plant', type: 'processing', lat: 18.5204, lng: 73.8567 }, // Pune, Maharashtra
    { id: 'node-10', nodeId: 'N010', name: 'Hyderabad Processing Center', type: 'processing', lat: 17.3850, lng: 78.4867 }, // Hyderabad, Telangana
    { id: 'node-11', nodeId: 'N011', name: 'Kolkata Food Processing', type: 'processing', lat: 22.5726, lng: 88.3639 }, // Kolkata, West Bengal
    
    // Warehouses
    { id: 'node-12', nodeId: 'N012', name: 'Mumbai Central Warehouse', type: 'warehouse', lat: 19.0760, lng: 72.8777 }, // Mumbai
    { id: 'node-13', nodeId: 'N013', name: 'Delhi Distribution Hub', type: 'warehouse', lat: 28.7041, lng: 77.1025 }, // Delhi (Noida area)
    { id: 'node-14', nodeId: 'N014', name: 'Bangalore Storage Facility', type: 'warehouse', lat: 12.9352, lng: 77.6245 }, // Bangalore
    { id: 'node-15', nodeId: 'N015', name: 'Chennai Warehouse', type: 'warehouse', lat: 13.0475, lng: 80.2500 }, // Chennai
    { id: 'node-16', nodeId: 'N016', name: 'Surat Logistics Center', type: 'warehouse', lat: 21.1702, lng: 72.8311 }, // Surat, Gujarat
    
    // NGOs and Community Centers
    { id: 'node-17', nodeId: 'N017', name: 'Delhi Food Bank NGO', type: 'ngo', lat: 28.5355, lng: 77.3910 }, // Delhi
    { id: 'node-18', nodeId: 'N018', name: 'Mumbai Community Kitchen', type: 'ngo', lat: 19.2183, lng: 72.9781 }, // Mumbai (Mumbai Suburban)
    { id: 'node-19', nodeId: 'N019', name: 'Bangalore Seva Foundation', type: 'ngo', lat: 12.9166, lng: 77.6101 }, // Bangalore
    { id: 'node-20', nodeId: 'N020', name: 'Kolkata Relief Center', type: 'ngo', lat: 22.5448, lng: 88.3426 }, // Kolkata
    { id: 'node-21', nodeId: 'N021', name: 'Hyderabad Food Distribution', type: 'ngo', lat: 17.3616, lng: 78.4747 }, // Hyderabad
    { id: 'node-22', nodeId: 'N022', name: 'Chennai Aid Center', type: 'ngo', lat: 13.0674, lng: 80.2376 }, // Chennai
    { id: 'node-23', nodeId: 'N023', name: 'Jaipur Community Center', type: 'ngo', lat: 26.9124, lng: 75.7873 }, // Jaipur, Rajasthan
  ];

  const foodItems = [
    { name: 'Basmati Rice', value: 500 },
    { name: 'Wheat Flour', value: 1000 },
    { name: 'Fresh Vegetables', value: 300 },
    { name: 'Dairy Products (Milk, Paneer)', value: 800 },
    { name: 'Lentils (Dal)', value: 600 },
    { name: 'Tomatoes', value: 400 },
    { name: 'Potatoes', value: 700 },
    { name: 'Onions', value: 550 },
    { name: 'Canned Pulses', value: 450 },
    { name: 'Spices Mix', value: 350 },
    { name: 'Cooking Oil', value: 650 },
    { name: 'Sugar', value: 500 },
  ];

  const shipments: Shipment[] = [];
  const events: Event[] = [];
  const shipmentLocationUpdates: ShipmentLocationUpdate[] = [];
  let shipmentCounter = 1;
  let eventCounter = 1;

  // Create shipments between nodes
  // Farm -> Processing (0-5s)
  const farms = nodes.filter(n => n.type === 'farm');
  const processing = nodes.filter(n => n.type === 'processing');
  const warehouses = nodes.filter(n => n.type === 'warehouse');
  const ngos = nodes.filter(n => n.type === 'ngo');

  // Helper function to create shipment with events
  // startOffsetDays: day offset from start (0 = Day 1, 1 = Day 2, etc.)
  // durationDays: duration in days
  const createShipment = (
    fromNode: Node,
    toNode: Node,
    foodItem: { name: string; value: number },
    startOffsetDays: number,
    durationDays: number,
    createFarmProduction = false,
    createNgoRequest = false
  ) => {
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const shipmentStart = new Date(startTime.getTime() + startOffsetDays * millisecondsPerDay);
    const shipmentEnd = new Date(shipmentStart.getTime() + durationDays * millisecondsPerDay);
    
    const shipment: Shipment = {
      id: `shipment-${shipmentCounter++}`,
      shipmentId: `SH${String(shipmentCounter - 1).padStart(3, '0')}`,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      startTime: shipmentStart,
      etaTime: shipmentEnd,
      status: 'in_transit',
      fromLat: fromNode.lat,
      fromLng: fromNode.lng,
      toLat: toNode.lat,
      toLng: toNode.lng,
      foodItem: foodItem.name,
      value: foodItem.value,
    };
    shipments.push(shipment);

    // Farm production event
    if (createFarmProduction && fromNode.type === 'farm') {
      events.push({
        id: `event-${eventCounter++}`,
        eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
        time: new Date(shipmentStart.getTime() - 0.5 * millisecondsPerDay),
        type: 'farm_production',
        lat: fromNode.lat,
        lng: fromNode.lng,
        payload: { foodItem: foodItem.name, quantity: foodItem.value },
      });
    }

    // NGO request event
    if (createNgoRequest && toNode.type === 'ngo') {
      events.push({
        id: `event-${eventCounter++}`,
        eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
        time: new Date(shipmentStart.getTime() - 0.5 * millisecondsPerDay),
        type: 'ngo_request',
        lat: toNode.lat,
        lng: toNode.lng,
        payload: { ngo: toNode.name, requestedFood: foodItem.name },
      });
    }

    // Shipment created event
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentStart,
      type: 'shipment_created',
      lat: fromNode.lat,
      lng: fromNode.lng,
      payload: { shipmentId: shipment.shipmentId, fromNode: fromNode.name, toNode: toNode.name },
      shipmentId: shipment.id,
    });

    // Location updates - generate updates throughout the shipment duration
    const numUpdates = Math.max(8, Math.floor(durationDays * 2)); // At least 8 updates, or 2 per day
    for (let i = 1; i <= numUpdates; i++) {
      const updateTime = new Date(shipmentStart.getTime() + (durationDays * millisecondsPerDay * i) / (numUpdates + 1));
      const progress = i / (numUpdates + 1);
      const lat = fromNode.lat + (toNode.lat - fromNode.lat) * progress;
      const lng = fromNode.lng + (toNode.lng - fromNode.lng) * progress;

      shipmentLocationUpdates.push({
        id: `update-${shipmentLocationUpdates.length + 1}`,
        shipmentId: shipment.id,
        lat,
        lng,
        timestamp: updateTime,
      });

      events.push({
        id: `event-${eventCounter++}`,
        eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
        time: updateTime,
        type: 'shipment_location_update',
        lat,
        lng,
        payload: { shipmentId: shipment.shipmentId, progress: Math.round(progress * 100) },
        shipmentId: shipment.id,
      });
    }

    // Shipment arrived event
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentEnd,
      type: 'shipment_arrived',
      lat: toNode.lat,
      lng: toNode.lng,
      payload: { shipmentId: shipment.shipmentId },
      shipmentId: shipment.id,
    });
    
    shipment.arrivedTime = shipmentEnd;
    shipment.status = 'arrived';
  };

  // Shipment 1: Farm to Processing (starts at Day 1, duration 3 days)
  if (farms.length > 0 && processing.length > 0) {
    const farm = farms[0];
    const plant = processing[0];
    const foodItem = foodItems[0];
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const shipmentStart = new Date(startTime.getTime() + 0 * millisecondsPerDay); // Day 1
    const shipmentDuration = 3 * millisecondsPerDay; // 3 days
    const shipmentEnd = new Date(shipmentStart.getTime() + shipmentDuration);
    
    const shipment: Shipment = {
      id: `shipment-${shipmentCounter++}`,
      shipmentId: `SH${String(shipmentCounter - 1).padStart(3, '0')}`,
      fromNodeId: farm.id,
      toNodeId: plant.id,
      startTime: shipmentStart,
      etaTime: shipmentEnd,
      status: 'in_transit',
      fromLat: farm.lat,
      fromLng: farm.lng,
      toLat: plant.lat,
      toLng: plant.lng,
      foodItem: foodItem.name,
      value: foodItem.value,
    };
    shipments.push(shipment);

    // Create shipment_created event
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentStart,
      type: 'shipment_created',
      lat: farm.lat,
      lng: farm.lng,
      payload: { shipmentId: shipment.shipmentId, fromNode: farm.name, toNode: plant.name },
      shipmentId: shipment.id,
    });

    // Create farm_production event (before shipment starts)
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: new Date(startTime.getTime() - 0.5 * millisecondsPerDay), // Half day before shipment
      type: 'farm_production',
      lat: farm.lat,
      lng: farm.lng,
      payload: { foodItem: foodItem.name, quantity: foodItem.value },
    });

    // Generate location updates along the path (updates every few hours during transit)
    const numUpdates = 8; // More updates for multi-day shipments
    for (let i = 1; i <= numUpdates; i++) {
      const updateTime = new Date(shipmentStart.getTime() + (shipmentDuration * i) / (numUpdates + 1));
      const progress = i / (numUpdates + 1);
      const lat = farm.lat + (plant.lat - farm.lat) * progress;
      const lng = farm.lng + (plant.lng - farm.lng) * progress;

      shipmentLocationUpdates.push({
        id: `update-${shipmentLocationUpdates.length + 1}`,
        shipmentId: shipment.id,
        lat,
        lng,
        timestamp: updateTime,
      });

      events.push({
        id: `event-${eventCounter++}`,
        eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
        time: updateTime,
        type: 'shipment_location_update',
        lat,
        lng,
        payload: { shipmentId: shipment.shipmentId, progress: Math.round(progress * 100) },
        shipmentId: shipment.id,
      });
    }

    // Create shipment_arrived event
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentEnd,
      type: 'shipment_arrived',
      lat: plant.lat,
      lng: plant.lng,
      payload: { shipmentId: shipment.shipmentId },
      shipmentId: shipment.id,
    });
    shipment.arrivedTime = shipmentEnd;
    shipment.status = 'arrived';
  }

  // Shipment 2: Processing to Warehouse (starts at Day 5, duration 4 days)
  if (processing.length > 0 && warehouses.length > 0) {
    const plant = processing[0];
    const warehouse = warehouses[0];
    const foodItem = foodItems[2];
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const shipmentStart = new Date(startTime.getTime() + 4 * millisecondsPerDay); // Day 5 (after shipment 1 arrives)
    const shipmentDuration = 4 * millisecondsPerDay; // 4 days
    const shipmentEnd = new Date(shipmentStart.getTime() + shipmentDuration);
    
    const shipment: Shipment = {
      id: `shipment-${shipmentCounter++}`,
      shipmentId: `SH${String(shipmentCounter - 1).padStart(3, '0')}`,
      fromNodeId: plant.id,
      toNodeId: warehouse.id,
      startTime: shipmentStart,
      etaTime: shipmentEnd,
      status: 'in_transit',
      fromLat: plant.lat,
      fromLng: plant.lng,
      toLat: warehouse.lat,
      toLng: warehouse.lng,
      foodItem: foodItem.name,
      value: foodItem.value,
    };
    shipments.push(shipment);

    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentStart,
      type: 'shipment_created',
      lat: plant.lat,
      lng: plant.lng,
      payload: { shipmentId: shipment.shipmentId, fromNode: plant.name, toNode: warehouse.name },
      shipmentId: shipment.id,
    });

    // Location updates
    const numUpdates = 10; // More updates for multi-day shipments
    for (let i = 1; i <= numUpdates; i++) {
      const updateTime = new Date(shipmentStart.getTime() + (shipmentDuration * i) / (numUpdates + 1));
      const progress = i / (numUpdates + 1);
      const lat = plant.lat + (warehouse.lat - plant.lat) * progress;
      const lng = plant.lng + (warehouse.lng - plant.lng) * progress;

      shipmentLocationUpdates.push({
        id: `update-${shipmentLocationUpdates.length + 1}`,
        shipmentId: shipment.id,
        lat,
        lng,
        timestamp: updateTime,
      });

      events.push({
        id: `event-${eventCounter++}`,
        eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
        time: updateTime,
        type: 'shipment_location_update',
        lat,
        lng,
        payload: { shipmentId: shipment.shipmentId, progress: Math.round(progress * 100) },
        shipmentId: shipment.id,
      });
    }

    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentEnd,
      type: 'shipment_arrived',
      lat: warehouse.lat,
      lng: warehouse.lng,
      payload: { shipmentId: shipment.shipmentId },
      shipmentId: shipment.id,
    });
    shipment.arrivedTime = shipmentEnd;
    shipment.status = 'arrived';
  }

  // Shipment 3: Warehouse to NGO (starts at Day 11, duration 5 days)
  if (warehouses.length > 0 && ngos.length > 0) {
    const warehouse = warehouses[0];
    const ngo = ngos[0];
    const foodItem = foodItems[1];
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const shipmentStart = new Date(startTime.getTime() + 10 * millisecondsPerDay); // Day 11 (after shipment 2 arrives)
    const shipmentDuration = 5 * millisecondsPerDay; // 5 days
    const shipmentEnd = new Date(shipmentStart.getTime() + shipmentDuration);
    
    const shipment: Shipment = {
      id: `shipment-${shipmentCounter++}`,
      shipmentId: `SH${String(shipmentCounter - 1).padStart(3, '0')}`,
      fromNodeId: warehouse.id,
      toNodeId: ngo.id,
      startTime: shipmentStart,
      etaTime: shipmentEnd,
      status: 'in_transit',
      fromLat: warehouse.lat,
      fromLng: warehouse.lng,
      toLat: ngo.lat,
      toLng: ngo.lng,
      foodItem: foodItem.name,
      value: foodItem.value,
    };
    shipments.push(shipment);

    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentStart,
      type: 'shipment_created',
      lat: warehouse.lat,
      lng: warehouse.lng,
      payload: { shipmentId: shipment.shipmentId, fromNode: warehouse.name, toNode: ngo.name },
      shipmentId: shipment.id,
    });

    // Create NGO request event before shipment
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: new Date(shipmentStart.getTime() - 0.5 * millisecondsPerDay), // Half day before shipment
      type: 'ngo_request',
      lat: ngo.lat,
      lng: ngo.lng,
      payload: { ngo: ngo.name, requestedFood: foodItem.name },
    });

    // Location updates
    const numUpdates = 12; // More updates for multi-day shipments
    for (let i = 1; i <= numUpdates; i++) {
      const updateTime = new Date(shipmentStart.getTime() + (shipmentDuration * i) / (numUpdates + 1));
      const progress = i / (numUpdates + 1);
      const lat = warehouse.lat + (ngo.lat - warehouse.lat) * progress;
      const lng = warehouse.lng + (ngo.lng - warehouse.lng) * progress;

      shipmentLocationUpdates.push({
        id: `update-${shipmentLocationUpdates.length + 1}`,
        shipmentId: shipment.id,
        lat,
        lng,
        timestamp: updateTime,
      });

      events.push({
        id: `event-${eventCounter++}`,
        eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
        time: updateTime,
        type: 'shipment_location_update',
        lat,
        lng,
        payload: { shipmentId: shipment.shipmentId, progress: Math.round(progress * 100) },
        shipmentId: shipment.id,
      });
    }

    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: shipmentEnd,
      type: 'shipment_arrived',
      lat: ngo.lat,
      lng: ngo.lng,
      payload: { shipmentId: shipment.shipmentId },
      shipmentId: shipment.id,
    });
    shipment.arrivedTime = shipmentEnd;
    shipment.status = 'arrived';
  }

  // Shipment 4: Farm 2 to Processing 2 (starts at Day 2, duration 3 days)
  if (farms.length > 1 && processing.length > 1) {
    createShipment(farms[1], processing[1], foodItems[3], 2, 3, true);
  }

  // Shipment 5: Processing 2 to Warehouse 2 (starts at Day 6, duration 4 days)
  if (processing.length > 1 && warehouses.length > 1) {
    createShipment(processing[1], warehouses[1], foodItems[4], 6, 4);
  }

  // Shipment 6: Warehouse 2 to NGO 2 (starts at Day 12, duration 5 days)
  if (warehouses.length > 1 && ngos.length > 1) {
    createShipment(warehouses[1], ngos[1], foodItems[5], 12, 5, false, true);
  }

  // Additional farm production events (using days)
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  if (farms.length > 2) {
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: new Date(startTime.getTime() + 3 * millisecondsPerDay), // Day 3
      type: 'farm_production',
      lat: farms[2].lat,
      lng: farms[2].lng,
      payload: { foodItem: foodItems[6].name, quantity: foodItems[6].value },
    });
  }

  if (farms.length > 3) {
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: new Date(startTime.getTime() + 4 * millisecondsPerDay), // Day 4
      type: 'farm_production',
      lat: farms[3].lat,
      lng: farms[3].lng,
      payload: { foodItem: foodItems[7].name, quantity: foodItems[7].value },
    });
  }

  // Additional NGO requests (using days)
  if (ngos.length > 2) {
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: new Date(startTime.getTime() + 7 * millisecondsPerDay), // Day 7
      type: 'ngo_request',
      lat: ngos[2].lat,
      lng: ngos[2].lng,
      payload: { ngo: ngos[2].name, requestedFood: foodItems[8].name },
    });
  }

  if (ngos.length > 3) {
    events.push({
      id: `event-${eventCounter++}`,
      eventId: `EVT${String(eventCounter - 1).padStart(4, '0')}`,
      time: new Date(startTime.getTime() + 13 * millisecondsPerDay), // Day 13
      type: 'ngo_request',
      lat: ngos[3].lat,
      lng: ngos[3].lng,
      payload: { ngo: ngos[3].name, requestedFood: foodItems[9].name },
    });
  }

  // Shipment 7: Farm 3 to Processing 3 (starts at 2.5s, duration 3.5s)
  if (farms.length > 2 && processing.length > 2) {
    createShipment(farms[2], processing[2], foodItems[6], 3, 4, true);
  }

  // Shipment 8: Farm 4 to Processing 1 (starts at 3s, duration 4s)
  if (farms.length > 3 && processing.length > 0) {
    createShipment(farms[3], processing[0], foodItems[7], 3, 4, true);
  }

  // Shipment 9: Farm 5 to Processing 2 (starts at 3.5s, duration 3s)
  if (farms.length > 4 && processing.length > 1) {
    createShipment(farms[4], processing[1], foodItems[8], 4, 3, true);
  }

  // Shipment 10: Farm 6 to Processing 4 (starts at 4s, duration 4.5s)
  if (farms.length > 5 && processing.length > 3) {
    createShipment(farms[5], processing[3], foodItems[9], 4, 5, true);
  }

  // Shipment 11: Processing 1 to Warehouse 3 (starts at 6.5s, duration 3.5s)
  if (processing.length > 0 && warehouses.length > 2) {
    createShipment(processing[0], warehouses[2], foodItems[0], 7, 4);
  }

  // Shipment 12: Processing 2 to Warehouse 4 (starts at 7s, duration 4s)
  if (processing.length > 1 && warehouses.length > 3) {
    createShipment(processing[1], warehouses[3], foodItems[1], 7, 4);
  }

  // Shipment 13: Processing 3 to Warehouse 1 (starts at 7.5s, duration 3s)
  if (processing.length > 2 && warehouses.length > 0) {
    createShipment(processing[2], warehouses[0], foodItems[2], 8, 3);
  }

  // Shipment 14: Processing 4 to Warehouse 2 (starts at 8s, duration 4.5s)
  if (processing.length > 3 && warehouses.length > 1) {
    createShipment(processing[3], warehouses[1], foodItems[3], 8, 5);
  }

  // Shipment 15: Warehouse 1 to NGO 3 (starts at 13s, duration 4s)
  if (warehouses.length > 0 && ngos.length > 2) {
    createShipment(warehouses[0], ngos[2], foodItems[4], 13, 4, false, true);
  }

  // Shipment 16: Warehouse 2 to NGO 4 (starts at 13.5s, duration 5s)
  if (warehouses.length > 1 && ngos.length > 3) {
    createShipment(warehouses[1], ngos[3], foodItems[5], 14, 5, false, true);
  }

  // Shipment 17: Warehouse 3 to NGO 5 (starts at 14s, duration 4.5s)
  if (warehouses.length > 2 && ngos.length > 4) {
    createShipment(warehouses[2], ngos[4], foodItems[6], 14, 5, false, true);
  }

  // Shipment 18: Warehouse 4 to NGO 1 (starts at 14.5s, duration 5.5s)
  if (warehouses.length > 3 && ngos.length > 0) {
    createShipment(warehouses[3], ngos[0], foodItems[7], 15, 6, false, true);
  }

  // Shipment 19: Warehouse 4 to NGO 6 (starts at 15s, duration 4s)
  if (warehouses.length > 3 && ngos.length > 5) {
    createShipment(warehouses[3], ngos[5], foodItems[8], 15, 4, false, true);
  }

  // Shipment 20: Farm 1 to Processing 3 (starts at 4.5s, duration 3.5s) - Cross-region
  if (farms.length > 0 && processing.length > 2) {
    createShipment(farms[0], processing[2], foodItems[10], 5, 4, true);
  }

  // Shipment 21: Farm 7 to Processing 1 (starts at 5s, duration 4.5s)
  if (farms.length > 6 && processing.length > 0) {
    createShipment(farms[6], processing[0], foodItems[11], 5, 5, true);
  }

  // Shipment 22: Processing 1 to Warehouse 5 (starts at 9s, duration 4s)
  if (processing.length > 0 && warehouses.length > 4) {
    createShipment(processing[0], warehouses[4], foodItems[0], 9, 4);
  }

  // Shipment 23: Processing 2 to Warehouse 1 (starts at 9.5s, duration 3.5s)
  if (processing.length > 1 && warehouses.length > 0) {
    createShipment(processing[1], warehouses[0], foodItems[1], 10, 4);
  }

  // Shipment 24: Warehouse 1 to NGO 7 (starts at 16s, duration 5s)
  if (warehouses.length > 0 && ngos.length > 6) {
    createShipment(warehouses[0], ngos[6], foodItems[9], 16, 5, false, true);
  }

  // Shipment 25: Warehouse 2 to NGO 2 (starts at 16.5s, duration 4.5s)
  if (warehouses.length > 1 && ngos.length > 1) {
    createShipment(warehouses[1], ngos[1], foodItems[10], 17, 5, false, true);
  }

  // Shipment 26: Warehouse 3 to NGO 3 (starts at 17s, duration 5.5s)
  if (warehouses.length > 2 && ngos.length > 2) {
    createShipment(warehouses[2], ngos[2], foodItems[11], 17, 6, false, true);
  }

  // Shipment 27: Processing 3 to Warehouse 3 (starts at 10s, duration 4s)
  if (processing.length > 2 && warehouses.length > 2) {
    createShipment(processing[2], warehouses[2], foodItems[2], 10, 4);
  }

  // Shipment 28: Processing 4 to Warehouse 4 (starts at 10.5s, duration 3.5s)
  if (processing.length > 3 && warehouses.length > 3) {
    createShipment(processing[3], warehouses[3], foodItems[3], 11, 4);
  }

  // Shipment 29: Farm 2 to Processing 4 (starts at 5.5s, duration 4s) - Cross-region
  if (farms.length > 1 && processing.length > 3) {
    createShipment(farms[1], processing[3], foodItems[4], 6, 4, true);
  }

  // Shipment 30: Warehouse 5 to NGO 4 (starts at 18s, duration 4s)
  if (warehouses.length > 4 && ngos.length > 3) {
    createShipment(warehouses[4], ngos[3], foodItems[5], 18, 4, false, true);
  }

  // Additional shipments for better coverage across India
  
  // Shipment 31: Farm 3 to Processing 1 (starts at 6s, duration 4s) - North to North
  if (farms.length > 2 && processing.length > 0) {
    createShipment(farms[2], processing[0], foodItems[0], 6, 4, true);
  }

  // Shipment 32: Farm 4 to Processing 2 (starts at 6.5s, duration 3.5s)
  if (farms.length > 3 && processing.length > 1) {
    createShipment(farms[3], processing[1], foodItems[1], 7, 4, true);
  }

  // Shipment 33: Processing 2 to Warehouse 5 (starts at 11s, duration 4.5s)
  if (processing.length > 1 && warehouses.length > 4) {
    createShipment(processing[1], warehouses[4], foodItems[2], 11, 5);
  }

  // Shipment 34: Processing 3 to Warehouse 4 (starts at 11.5s, duration 4s)
  if (processing.length > 2 && warehouses.length > 3) {
    createShipment(processing[2], warehouses[3], foodItems[3], 12, 4);
  }

  // Shipment 35: Warehouse 5 to NGO 1 (starts at 19s, duration 5s)
  if (warehouses.length > 4 && ngos.length > 0) {
    createShipment(warehouses[4], ngos[0], foodItems[6], 19, 5, false, true);
  }

  // Shipment 36: Warehouse 1 to NGO 5 (starts at 19.5s, duration 4.5s)
  if (warehouses.length > 0 && ngos.length > 4) {
    createShipment(warehouses[0], ngos[4], foodItems[7], 20, 5, false, true);
  }

  // Shipment 37: Farm 5 to Processing 3 (starts at 7s, duration 4s)
  if (farms.length > 4 && processing.length > 2) {
    createShipment(farms[4], processing[2], foodItems[8], 7, 4, true);
  }

  // Shipment 38: Farm 6 to Processing 1 (starts at 7.5s, duration 4.5s) - South to North
  if (farms.length > 5 && processing.length > 0) {
    createShipment(farms[5], processing[0], foodItems[9], 8, 5, true);
  }

  // Shipment 39: Processing 4 to Warehouse 5 (starts at 12s, duration 4s)
  if (processing.length > 3 && warehouses.length > 4) {
    createShipment(processing[3], warehouses[4], foodItems[4], 12, 4);
  }

  // Shipment 40: Warehouse 2 to NGO 5 (starts at 20s, duration 5s)
  if (warehouses.length > 1 && ngos.length > 4) {
    createShipment(warehouses[1], ngos[4], foodItems[10], 20, 5, false, true);
  }

  // Shipment 41: Warehouse 3 to NGO 6 (starts at 20.5s, duration 4.5s)
  if (warehouses.length > 2 && ngos.length > 5) {
    createShipment(warehouses[2], ngos[5], foodItems[11], 21, 5, false, true);
  }

  // Shipment 42: Warehouse 4 to NGO 2 (starts at 21s, duration 5s)
  if (warehouses.length > 3 && ngos.length > 1) {
    createShipment(warehouses[3], ngos[1], foodItems[0], 21, 5, false, true);
  }

  // Shipment 43: Farm 7 to Processing 2 (starts at 8s, duration 4s) - West to Central
  if (farms.length > 6 && processing.length > 1) {
    createShipment(farms[6], processing[1], foodItems[1], 8, 4, true);
  }

  // Shipment 44: Processing 1 to Warehouse 2 (starts at 12.5s, duration 4.5s)
  if (processing.length > 0 && warehouses.length > 1) {
    createShipment(processing[0], warehouses[1], foodItems[5], 13, 5);
  }

  // Shipment 45: Warehouse 5 to NGO 6 (starts at 21.5s, duration 4s)
  if (warehouses.length > 4 && ngos.length > 5) {
    createShipment(warehouses[4], ngos[5], foodItems[2], 22, 4, false, true);
  }

  // Shipment 46: Warehouse 1 to NGO 6 (starts at 22s, duration 5s)
  if (warehouses.length > 0 && ngos.length > 5) {
    createShipment(warehouses[0], ngos[5], foodItems[3], 22, 5, false, true);
  }

  // Shipment 47: Farm 1 to Processing 4 (starts at 8.5s, duration 4.5s) - North to East
  if (farms.length > 0 && processing.length > 3) {
    createShipment(farms[0], processing[3], foodItems[4], 9, 5, true);
  }

  // Shipment 48: Processing 2 to Warehouse 1 (starts at 13s, duration 4s)
  if (processing.length > 1 && warehouses.length > 0) {
    createShipment(processing[1], warehouses[0], foodItems[6], 13, 4);
  }

  // Shipment 49: Warehouse 2 to NGO 7 (starts at 22.5s, duration 4.5s)
  if (warehouses.length > 1 && ngos.length > 6) {
    createShipment(warehouses[1], ngos[6], foodItems[7], 23, 5, false, true);
  }

  // Shipment 50: Warehouse 3 to NGO 7 (starts at 23s, duration 5s)
  if (warehouses.length > 2 && ngos.length > 6) {
    createShipment(warehouses[2], ngos[6], foodItems[8], 23, 5, false, true);
  }

  return {
    nodes,
    shipments,
    events: events.sort((a, b) => a.time.getTime() - b.time.getTime()),
    shipmentLocationUpdates: shipmentLocationUpdates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
  };
};

// Keep the old function for backward compatibility
export const generateSampleFoodData = (): FoodDataPoint[] => {
  const { nodes, events } = generateFoodTimelineData();
  
  return events.map((event, index) => ({
    id: event.id,
    name: `Event: ${event.type}`,
    lat: event.lat,
    lng: event.lng,
    timestamp: event.time,
    category: event.type.includes('farm') ? 'origin' : 
              event.type.includes('processing') ? 'production' :
              event.type.includes('warehouse') ? 'distribution' : 'consumption',
    description: `Event: ${event.type} at ${new Date(event.time).toLocaleTimeString()}`,
    value: 100,
  }));
};

