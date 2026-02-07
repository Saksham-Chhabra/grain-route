/**
 * Socket.IO frame emitter service
 * Broadcasts real-time updates to connected clients
 */

/**
 * Emit a frame update to all connected clients
 * @param {Object} io - Socket.IO server instance
 * @param {Object} frame - Frame data {date, nodes, batches, shipments, predictions, kpis, events}
 */
function emitFrame(io, frame) {
  if (!io) {
    console.warn("Socket.IO instance not available");
    return;
  }

  io.to("live_updates").emit("frame", {
    timestamp: new Date().toISOString(),
    ...frame,
  });

  console.log(`📤 Frame emitted for ${frame.date || "unknown date"}`);
}

/**
 * Emit a suggestion/allocation update
 * @param {Object} io - Socket.IO server instance
 * @param {Object} suggestion - Suggestion data {suggestionId, reason, moves}
 */
function emitSuggestion(io, suggestion) {
  if (!io) {
    console.warn("Socket.IO instance not available");
    return;
  }

  io.to("live_updates").emit("suggestion", {
    timestamp: new Date().toISOString(),
    ...suggestion,
  });

  console.log(`💡 Suggestion emitted: ${suggestion.suggestionId || "unknown"}`);
}

/**
 * Emit a shipment update (created, location update, arrived)
 * @param {Object} io - Socket.IO server instance
 * @param {Object} shipmentUpdate - Shipment update data
 */
function emitShipmentUpdate(io, shipmentUpdate) {
  if (!io) {
    console.warn("Socket.IO instance not available");
    return;
  }

  io.to("live_updates").emit("shipment_update", {
    timestamp: new Date().toISOString(),
    ...shipmentUpdate,
  });

  console.log(
    `🚚 Shipment update emitted: ${shipmentUpdate.shipmentId || "unknown"}`
  );
}

/**
 * Emit an error/alert
 * @param {Object} io - Socket.IO server instance
 * @param {Object} alert - Alert data {type, message, severity}
 */
function emitAlert(io, alert) {
  if (!io) {
    console.warn("Socket.IO instance not available");
    return;
  }

  io.to("live_updates").emit("alert", {
    timestamp: new Date().toISOString(),
    ...alert,
  });

  console.log(`⚠️  Alert emitted: ${alert.message || "unknown"}`);
}

export { emitFrame, emitSuggestion, emitShipmentUpdate, emitAlert };
