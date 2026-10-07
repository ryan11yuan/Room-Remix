const PATHS = {
  left: 'M15 8H1M7 2 1 8l6 6',
  right: 'M1 8h14M9 2l6 6-6 6',
  down: 'M8 1v14M2 9l6 6 6-6',
} as const;

/** The darkroom's one icon: a hairline arrow drawn at the stroke weight of the dashed rules. */
export function Arrow({ to, className = '' }: { to: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="square"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[to]} />
    </svg>
  );
}
