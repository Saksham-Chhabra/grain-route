'use client';

import { useState, useEffect, useCallback } from 'react';

interface TimelineControlProps {
  startTime: Date;
  endTime: Date;
  currentTime: Date;
  onTimeChange: (time: Date) => void;
  isPlaying: boolean;
  onPlayPause: (playing: boolean) => void;
  playbackSpeed?: number; // milliseconds per second
}

export default function TimelineControl({
  startTime,
  endTime,
  currentTime,
  onTimeChange,
  isPlaying,
  onPlayPause,
  playbackSpeed = 172800000, // Fast forward: 2 days per second (30 days in ~15 seconds)
}: TimelineControlProps) {
  const [isDragging, setIsDragging] = useState(false);

  // Calculate position percentage
  const totalDuration = endTime.getTime() - startTime.getTime();
  const currentPosition = currentTime.getTime() - startTime.getTime();
  const percentage = Math.max(0, Math.min(100, (currentPosition / totalDuration) * 100));

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newPercentage = parseFloat(e.target.value);
    const newTime = new Date(startTime.getTime() + (newPercentage / 100) * totalDuration);
    onTimeChange(newTime);
  }, [startTime, totalDuration, onTimeChange]);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const currentPos = currentTime.getTime() - startTime.getTime();
      const newPos = currentPos + playbackSpeed / 10; // Update 10 times per second

      if (newPos >= totalDuration) {
        onTimeChange(endTime);
        onPlayPause(false);
      } else {
        const newTime = new Date(startTime.getTime() + newPos);
        onTimeChange(newTime);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, startTime, endTime, totalDuration, playbackSpeed, onTimeChange, onPlayPause]);

  // Calculate days elapsed from start time
  const getDaysElapsed = (date: Date) => {
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const diffInMs = date.getTime() - startTime.getTime();
    // Convert the timeline (30 seconds = 30 days for animation)
    // Since animation duration is 30 seconds, we map it to 30 days
    const totalDaysInTimeline = totalDuration / (1000 * 60 * 60 * 24); // Calculate based on actual duration
    const dayRatio = totalDuration > 0 ? diffInMs / totalDuration : 0;
    
    // If total duration is less than a day (in milliseconds), treat each second as a day
    if (totalDuration < millisecondsPerDay) {
      // Each second represents a day in fast-forward
      const days = Math.floor(diffInMs / 1000) + 1;
      return days;
    } else {
      // Actual days difference
      return Math.floor(diffInMs / millisecondsPerDay) + 1;
    }
  };

  const formatDay = (date: Date) => {
    const daysElapsed = getDaysElapsed(date);
    return `Day ${daysElapsed}`;
  };

  const formatDate = (date: Date) => {
    // Show full date format
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate total days in timeline
  const getTotalDays = () => {
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    if (totalDuration < millisecondsPerDay) {
      // Each second represents a day
      return Math.ceil(totalDuration / 1000);
    } else {
      return Math.ceil(totalDuration / millisecondsPerDay);
    }
  };

  const handlePlayPause = () => {
    onPlayPause(!isPlaying);
  };

  const handleStepBack = () => {
    const stepTime = totalDuration / 100; // 1% of timeline
    const newTime = new Date(Math.max(startTime.getTime(), currentTime.getTime() - stepTime));
    onTimeChange(newTime);
  };

  const handleStepForward = () => {
    const stepTime = totalDuration / 100; // 1% of timeline
    const newTime = new Date(Math.min(endTime.getTime(), currentTime.getTime() + stepTime));
    onTimeChange(newTime);
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 z-[1000] border border-gray-200">
      <div className="flex items-center gap-4">
        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 4h4v12H6V4zm4 0h4v12h-4V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          )}
        </button>

        {/* Step Back */}
        <button
          onClick={handleStepBack}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
          aria-label="Step back"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Time Display */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-500 truncate">
              <div className="font-medium">{formatDay(startTime)}</div>
              <div className="text-gray-400">{formatDate(startTime)}</div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-blue-600">{formatDay(currentTime)}</span>
              <span className="text-xs text-gray-500">
                {formatDate(currentTime)}
              </span>
            </div>
            <div className="text-xs text-gray-500 truncate text-right">
              <div className="font-medium">{formatDay(endTime)}</div>
              <div className="text-gray-400">{formatDate(endTime)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between mb-1 text-xs text-gray-400">
            <span>Day 1</span>
            <span className="italic">
              ⏩ Fast-forwarding {getTotalDays()} days
            </span>
            <span>Day {getTotalDays()}</span>
          </div>
          {/* Slider */}
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={percentage}
            onChange={handleSliderChange}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
        </div>

        {/* Step Forward */}
        <button
          onClick={handleStepForward}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
          aria-label="Step forward"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
        }

        .slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}

