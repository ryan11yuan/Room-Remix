/**
 * The room before there's a room: an open box drawn in hairlines, with the slow lap the video should walk dashed on the
 * floor and the camera on it. Shown in the hero until a splat develops over it, and when there's none to show.
 */
export function RoomSketch({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 310" fill="none" aria-hidden="true" className={className}>
      <g stroke="var(--color-driftwood)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {/* floor and the two back walls */}
        <path d="M200 140 50 215l150 75 150-75Z" />
        <path d="M50 215V95l150-75v120M350 215V95L200 20" />
        {/* a window on the left wall, a door on the right */}
        <path d="M95 144.5 140 122V80l-45 22.5Z" />
        <path d="M282.5 181.25 312.5 196.25V121.85l-30-15Z" />
      </g>
      {/* the lap: one slow walk round the edge, camera pointed in toward the middle */}
      <ellipse
        cx="200"
        cy="215"
        rx="104"
        ry="52"
        stroke="var(--color-cream)"
        strokeOpacity="0.7"
        strokeWidth="1"
        strokeDasharray="3 5"
        vectorEffect="non-scaling-stroke"
      />
      <g transform="translate(304 215)">
        <circle r="4" fill="var(--color-cream)" />
        <path d="M-4 0h-22" stroke="var(--color-cream)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
