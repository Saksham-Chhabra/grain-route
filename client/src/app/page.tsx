"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { generateFoodTimelineData } from "@/data/sampleFoodData";

// Dynamically import MapTimeline to avoid SSR issues with Leaflet
const MapTimeline = dynamic(() => import("@/components/MapTimeline"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading map...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  // Generate food timeline data with nodes, shipments, and events
  const { nodes, shipments, events, shipmentLocationUpdates } = useMemo(
    () => generateFoodTimelineData(),
    []
  );

  // Calculate time range from events
  const { startTime, endTime } = useMemo(() => {
    if (events.length === 0) {
      const now = new Date();
      return {
        startTime: new Date(now.getTime() - 20000), // 20 seconds fallback
        endTime: now,
      };
    }

    const times = events.map((e) => e.time.getTime());
    return {
      startTime: new Date(Math.min(...times)),
      endTime: new Date(Math.max(...times)),
    };
  }, [events]);

  // Current time state
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isPlaying, setIsPlaying] = useState(false);

  // Filter visible events based on current time
  const visibleEvents = useMemo(() => {
    return events.filter((event) => event.time <= currentTime);
  }, [events, currentTime]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStepBack = () => {
    const totalDuration = endTime.getTime() - startTime.getTime();
    const stepTime = totalDuration / 100; // 1% of timeline
    const newTime = new Date(
      Math.max(startTime.getTime(), currentTime.getTime() - stepTime)
    );
    setCurrentTime(newTime);
  };

  const handleStepForward = () => {
    const totalDuration = endTime.getTime() - startTime.getTime();
    const stepTime = totalDuration / 100; // 1% of timeline
    const newTime = new Date(
      Math.min(endTime.getTime(), currentTime.getTime() + stepTime)
    );
    setCurrentTime(newTime);
  };

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying) return;

    const playbackSpeed = 172800000; // Fast forward: 2 days per second (30 days in ~15 seconds)
    const interval = setInterval(() => {
      setCurrentTime((prevTime) => {
        const currentPos = prevTime.getTime() - startTime.getTime();
        const totalDuration = endTime.getTime() - startTime.getTime();
        const newPos = currentPos + playbackSpeed / 10; // 0.2 days per update (every 100ms)

        if (newPos >= totalDuration) {
          setIsPlaying(false);
          return endTime;
        } else {
          return new Date(startTime.getTime() + newPos);
        }
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, startTime, endTime]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 shadow-sm z-20">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-zinc-900">
              Food Supply Chain Timeline
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/admin"
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              Admin
            </a>
            <a
              href="/about"
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              About
            </a>
            <a
              href="/help"
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              Help
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Map Container - Left Side */}
        <div className="flex-1 relative">
          <MapTimeline
            nodes={nodes}
            events={events}
            shipments={shipments}
            shipmentLocationUpdates={shipmentLocationUpdates}
            currentTime={currentTime}
            startTime={startTime}
            endTime={endTime}
          />
        </div>

        {/* Right Sidebar */}
        <div className="w-80 bg-white border-l border-zinc-200 flex flex-col">
          {/* Events List */}
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-sm font-semibold text-zinc-900 mb-3 sticky top-0 bg-white py-2">
              Timeline Events ({visibleEvents.length})
            </h2>
            <div className="space-y-2">
              {visibleEvents.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  No events yet. Press play to start.
                </div>
              ) : (
                visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    className="bg-zinc-50 rounded-lg p-3 border border-zinc-200 hover:border-zinc-300 transition-colors"
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{
                          backgroundColor:
                            event.type === "farm_production"
                              ? "#22c55e"
                              : event.type === "shipment_created"
                                ? "#3b82f6"
                                : event.type === "shipment_arrived"
                                  ? "#10b981"
                                  : event.type === "ngo_request"
                                    ? "#ef4444"
                                    : "#6b7280",
                        }}
                      ></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-900 capitalize">
                          {event.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {formatTime(event.time)}
                        </p>
                        {event.payload && (
                          <div className="mt-1 text-xs text-zinc-600">
                            {event.payload.foodItem && (
                              <span>🌾 {event.payload.foodItem}</span>
                            )}
                            {event.payload.shipmentId && (
                              <span className="block">
                                📦 {event.payload.shipmentId}
                              </span>
                            )}
                            {event.payload.fromNode && event.payload.toNode && (
                              <span className="block text-zinc-500">
                                {event.payload.fromNode} →{" "}
                                {event.payload.toNode}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Timeline Controls - Bottom */}
          <div className="border-t border-zinc-200 p-4 bg-white">
            <div className="mb-3">
              <div className="text-xs text-zinc-500 mb-1">Current Time</div>
              <div className="text-sm font-mono text-zinc-900">
                {formatTime(currentTime)}
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleStepBack}
                className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors flex items-center justify-center"
                aria-label="Step back"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              <button
                onClick={handlePlayPause}
                className="w-12 h-12 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white transition-colors flex items-center justify-center"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M6 4h4v12H6V4zm4 0h4v12h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 ml-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                )}
              </button>

              <button
                onClick={handleStepForward}
                className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors flex items-center justify-center"
                aria-label="Step forward"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>{formatTime(startTime)}</span>
                <span>{formatTime(endTime)}</span>
              </div>
              <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-900 transition-all duration-100"
                  style={{
                    width: `${Math.max(0, Math.min(100, ((currentTime.getTime() - startTime.getTime()) / (endTime.getTime() - startTime.getTime())) * 100))}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
