export type PresetId = 'cathedral' | 'garage';

/** A real space, recorded: its impulse response plays through the same player as a simulated room. */
export type Preset = {
  id: PresetId;
  label: string;
  place: string;
  blurb: string;
  /** The recording, served with the site. */
  file: string;
  credit: { text: string; licence: string; licenceUrl: string; sourceUrl: string };
};

export const PRESETS: Preset[] = [
  {
    id: 'cathedral',
    label: 'Cathedral',
    place: 'York Minster, England',
    blurb: 'One of the largest Gothic cathedrals in Europe. Sound hangs in the air for seconds.',
    file: '/ir/york-minster.wav',
    credit: {
      text: 'York Minster impulse response by Audiolab, University of York (Damian T. Murphy), from the OpenAIR library, www.openairlib.net.',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://www.openairlib.net/',
    },
  },
  {
    id: 'garage',
    label: 'Parking garage',
    place: 'A concrete parking garage',
    blurb: 'Hard concrete all round: a short, loud, slappy echo.',
    file: '/ir/parking-garage.mp3',
    credit: {
      text: 'Parking garage impulse response by djericmark, from Freesound (sound 732453).',
      licence: 'CC0 1.0',
      licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl: 'https://freesound.org/people/djericmark/sounds/732453/',
    },
  },
];
