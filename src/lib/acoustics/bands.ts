export const BAND_CENTERS = [125, 250, 500, 1000, 2000, 4000] as const;
export const NUM_BANDS = BAND_CENTERS.length;

/** One value per octave band, index-aligned with BAND_CENTERS. */
export type Bands = number[];

export const SPEED_OF_SOUND = 343;

/** Air intensity attenuation coefficient m (1/m) at about 20 °C and 50 % relative humidity. */
export const AIR_M: Bands = [0.0001, 0.0002, 0.0006, 0.001, 0.0019, 0.0058];

export const mapBands = (f: (band: number) => number): Bands => Array.from({ length: NUM_BANDS }, (_, b) => f(b));
