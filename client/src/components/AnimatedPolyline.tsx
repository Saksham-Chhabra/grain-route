'use client';

import { useEffect, useRef } from 'react';
import { Polyline } from 'react-leaflet';
import L from 'leaflet';

interface AnimatedPolylineProps {
  positions: [number, number][];
  color?: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
  animated?: boolean;
}

export default function AnimatedPolyline({
  positions,
  color = '#3b82f6',
  weight = 4,
  opacity = 0.7,
  dashArray = '10, 10',
  animated = true,
}: AnimatedPolylineProps) {
  const polylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!animated || !polylineRef.current) return;

    const polyline = polylineRef.current;
    let offset = 0;

    const animate = () => {
      offset = (offset + 0.5) % 20;
      const newDashArray = `${10 + offset}, ${10 - offset}`;
      polyline.setStyle({ dashArray: newDashArray });
      requestAnimationFrame(animate);
    };

    animate();
  }, [animated]);

  return (
    <Polyline
      ref={(ref) => {
        if (ref) polylineRef.current = ref;
      }}
      positions={positions}
      pathOptions={{
        color,
        weight,
        opacity,
        dashArray: animated ? '10, 10' : dashArray,
      }}
    />
  );
}

