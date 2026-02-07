"use client";

import { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AnimatedPolyline from "./AnimatedPolyline";
import AnimatedTransitMarker from "./AnimatedTransitMarker";
import type { Node, Shipment, Event } from "@/data/sampleFoodData";

// Fix for default marker icons in Next.js
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

interface MapTimelineProps {
  nodes: Node[];
  events: Event[];
  shipments: Shipment[];
  shipmentLocationUpdates: unknown[];
  currentTime: Date;
  startTime: Date;
  endTime: Date;
}

// Component to update map view when bounds change
function MapUpdater({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [100, 100] });
    }
  }, [map, bounds]);

  return null;
}

export default function MapTimeline({
  nodes,
  events,
  shipments,
  currentTime,
}: MapTimelineProps) {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);

  // Filter events visible at current time
  const visibleEvents = useMemo(() => {
    return events.filter((event) => event.time <= currentTime);
  }, [events, currentTime]);

  // Filter shipments that are active (started but not arrived yet)
  const activeShipments = useMemo(() => {
    return shipments.filter((shipment) => {
      return (
        currentTime >= shipment.startTime &&
        (!shipment.arrivedTime || currentTime < shipment.arrivedTime)
      );
    });
  }, [shipments, currentTime]);

  // Filter shipments that should show path (started or completed)
  const visibleShipments = useMemo(() => {
    return shipments.filter((shipment) => shipment.startTime <= currentTime);
  }, [shipments, currentTime]);

  // Calculate bounds using useMemo to avoid effect issues
  const calculatedBounds = useMemo(() => {
    if (nodes.length === 0 && events.length === 0) return null;

    const allPoints: [number, number][] = [];
    nodes.forEach((node) => {
      allPoints.push([node.lat, node.lng]);
    });
    events.forEach((event) => {
      allPoints.push([event.lat, event.lng]);
    });

    if (allPoints.length > 0) {
      return L.latLngBounds(allPoints);
    }
    return null;
  }, [nodes, events]);

  // Update bounds state when calculated bounds change
  useEffect(() => {
    if (calculatedBounds && (!bounds || !bounds.equals(calculatedBounds))) {
      setBounds(calculatedBounds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculatedBounds]);

  // Get node type color and emoji
  const getNodeStyle = (type: string) => {
    const styles: Record<string, { color: string; emoji: string }> = {
      farm: { color: "#22c55e", emoji: "🌾" },
      processing: { color: "#3b82f6", emoji: "🏭" },
      warehouse: { color: "#f59e0b", emoji: "📦" },
      ngo: { color: "#ef4444", emoji: "❤️" },
    };
    return styles[type] || { color: "#6b7280", emoji: "📍" };
  };

  // Get event type color
  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      farm_production: "#22c55e",
      shipment_created: "#3b82f6",
      shipment_location_update: "#f59e0b",
      shipment_arrived: "#10b981",
      ngo_request: "#ef4444",
      batch_spoiled: "#dc2626",
      prediction_made: "#8b5cf6",
    };
    return colors[type] || "#6b7280";
  };

  // Create node icon with improved styling
  const createNodeIcon = (type: string, node: Node) => {
    const style = getNodeStyle(type);
    return L.divIcon({
      className: "node-marker",
      html: `
        <div style="
          position: relative;
          background: linear-gradient(135deg, ${style.color} 0%, ${style.color}dd 100%);
          width: 40px;
          height: 40px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 0 2px ${style.color}33;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          transition: all 0.3s ease;
        ">
          <span style="transform: rotate(45deg); display: block;">${style.emoji}</span>
        </div>
        <div style="
          position: absolute;
          bottom: -5px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 8px solid ${style.color};
        "></div>
      `,
      iconSize: [40, 45],
      iconAnchor: [20, 45],
      popupAnchor: [0, -45],
    });
  };

  // Create event icon with improved styling
  const createEventIcon = (type: string) => {
    const color = getEventColor(type);
    return L.divIcon({
      className: "event-marker",
      html: `
        <div style="
          position: relative;
          background: radial-gradient(circle at 30% 30%, ${color}ff, ${color}cc);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 3px 10px rgba(0,0,0,0.4), 0 0 0 2px ${color}44;
          animation: pulse 2s infinite;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
            opacity: 0.9;
          "></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  };

  if (typeof window === "undefined") {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
        Loading map...
      </div>
    );
  }

  const defaultCenter: [number, number] = [20.5937, 78.9629]; // India Center
  const defaultZoom = 5;

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: "100%", width: "100%", zIndex: 1 }}
        className="rounded-lg"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {bounds && <MapUpdater bounds={bounds} />}

        {/* Render shipment paths */}
        {visibleShipments.map((shipment) => {
          const path: [number, number][] = [
            [shipment.fromLat, shipment.fromLng],
            [shipment.toLat, shipment.toLng],
          ];
          const isActive = activeShipments.some((s) => s.id === shipment.id);

          return (
            <AnimatedPolyline
              key={shipment.id}
              positions={path}
              color={isActive ? "#f59e0b" : "#94a3b8"}
              weight={isActive ? 4 : 2}
              opacity={isActive ? 0.8 : 0.4}
              animated={isActive}
            />
          );
        })}

        {/* Render nodes */}
        {nodes.map((node) => (
          <Marker
            key={node.id}
            position={[node.lat, node.lng]}
            icon={createNodeIcon(node.type, node)}
          >
            <Popup>
              <div className="p-3 min-w-[200px]">
                <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                  <span className="text-xl">{getNodeStyle(node.type).emoji}</span>
                  <span>{node.name}</span>
                </h3>
                <div className="space-y-1">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Type:</span>{" "}
                    <span className="capitalize text-gray-800">{node.type}</span>
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Node ID:</span>{" "}
                    <span className="font-mono text-gray-800">{node.nodeId}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    📍 {node.lat.toFixed(4)}, {node.lng.toFixed(4)}
                  </p>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Render events */}
        {visibleEvents.map((event) => {
          // Skip location updates as they're shown by transit markers
          if (event.type === "shipment_location_update") return null;

          return (
            <Marker
              key={event.id}
              position={[event.lat, event.lng]}
              icon={createEventIcon(event.type)}
            >
              <Popup>
                <div className="p-3 min-w-[200px]">
                  <h3 className="font-bold text-base mb-2 capitalize">
                    {event.type.replace(/_/g, " ")}
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Date:</span>{" "}
                      <span className="text-gray-800">{event.time.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}</span>
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Event ID:</span>{" "}
                      <span className="font-mono text-gray-800">{event.eventId}</span>
                    </p>
                    {event.payload && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                        <span className="font-semibold block mb-1">Details:</span>
                        <pre className="whitespace-pre-wrap text-xs">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Render animated transit markers */}
        {activeShipments.map((shipment) => (
          <AnimatedTransitMarker
            key={shipment.id}
            startPos={[shipment.fromLat, shipment.fromLng]}
            endPos={[shipment.toLat, shipment.toLng]}
            startTime={shipment.startTime}
            endTime={shipment.etaTime || shipment.arrivedTime || new Date()}
            currentTime={currentTime}
            foodItem={shipment.foodItem}
            shipmentId={shipment.shipmentId}
          />
        ))}
      </MapContainer>

      <style jsx global>{`
        .node-marker,
        .event-marker {
          background: transparent;
          border: none;
        }

        .animated-truck-marker {
          background: transparent;
          border: none;
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
            box-shadow: 0 3px 10px rgba(0,0,0,0.4), 0 0 0 2px currentColor;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.9;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5), 0 0 0 4px currentColor;
          }
        }

        .node-marker:hover {
          transform: rotate(-45deg) scale(1.1);
        }

        .leaflet-marker-icon {
          transition: transform 0.2s ease;
        }

        .leaflet-marker-icon:hover {
          transform: scale(1.1);
          z-index: 1000;
        }

        .leaflet-popup-content-wrapper {
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
