export type RatingLabel = 'Dead' | 'Balanced' | 'A bit echoey' | 'Echoey';

/** Plain-language rating against the 0.3–0.5 s target for living rooms and bedrooms. */
export function rateRt60(mid: number): RatingLabel {
  if (mid < 0.3) return 'Dead';
  if (mid <= 0.5) return 'Balanced';
  if (mid <= 0.8) return 'A bit echoey';
  return 'Echoey';
}
