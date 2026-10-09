/**
 * One kind of object the app finds, names and lets you walk to (spec 2026-10-08 §4). `say`/`sayMany` are the clip words,
 * `one`/`many` the words in the narrator's counts. Sizes are width (x) × depth (z) × height in metres, for added objects.
 */
export type NameInfo = {
  id: string;
  title: string;
  say: string;
  sayMany: string;
  one: string;
  many: string;
  prompts: readonly string[];
  blocks: boolean;
  size: readonly [number, number, number];
  bottom: number;
};

export const NAMES = [
  { id: 'door', title: 'Door', say: 'door', sayMany: 'doors', one: 'door', many: 'doors', prompts: ['door', 'doorway'], blocks: false, size: [0.9, 0.1, 2.0], bottom: 0 },
  { id: 'stairs', title: 'Stairs', say: 'stairs', sayMany: 'stairs', one: 'staircase', many: 'staircases', prompts: ['stairs'], blocks: true, size: [1.0, 2.0, 1.0], bottom: 0 },
  { id: 'chair', title: 'Chair', say: 'chair', sayMany: 'chairs', one: 'chair', many: 'chairs', prompts: ['chair'], blocks: true, size: [0.5, 0.5, 0.9], bottom: 0 },
  { id: 'sofa', title: 'Sofa', say: 'sofa', sayMany: 'sofas', one: 'sofa', many: 'sofas', prompts: ['sofa'], blocks: true, size: [2.0, 0.9, 0.8], bottom: 0 },
  { id: 'table', title: 'Table', say: 'table', sayMany: 'tables', one: 'table', many: 'tables', prompts: ['table', 'desk'], blocks: true, size: [1.4, 0.8, 0.75], bottom: 0 },
  { id: 'counter', title: 'Counter', say: 'counter', sayMany: 'counters', one: 'counter', many: 'counters', prompts: ['counter'], blocks: true, size: [1.5, 0.6, 0.9], bottom: 0 },
  { id: 'sink', title: 'Sink', say: 'sink', sayMany: 'sinks', one: 'sink', many: 'sinks', prompts: ['sink'], blocks: true, size: [0.6, 0.5, 0.9], bottom: 0 },
  { id: 'toilet', title: 'Toilet', say: 'toilet', sayMany: 'toilets', one: 'toilet', many: 'toilets', prompts: ['toilet'], blocks: true, size: [0.4, 0.7, 0.8], bottom: 0 },
  { id: 'bin', title: 'Bin', say: 'bin', sayMany: 'bins', one: 'bin', many: 'bins', prompts: ['trash can'], blocks: true, size: [0.4, 0.4, 0.7], bottom: 0 },
  { id: 'window', title: 'Window', say: 'window', sayMany: 'windows', one: 'window', many: 'windows', prompts: ['window'], blocks: false, size: [1.2, 0.1, 1.2], bottom: 0.9 },
  { id: 'bed', title: 'Bed', say: 'bed', sayMany: 'beds', one: 'bed', many: 'beds', prompts: ['bed'], blocks: true, size: [1.6, 2.0, 0.6], bottom: 0 },
  { id: 'cabinet', title: 'Cabinet', say: 'cabinet', sayMany: 'cabinets', one: 'cabinet', many: 'cabinets', prompts: ['cabinet'], blocks: true, size: [1.0, 0.5, 1.0], bottom: 0 },
  { id: 'bookshelf', title: 'Bookshelf', say: 'bookshelf', sayMany: 'bookshelves', one: 'bookshelf', many: 'bookshelves', prompts: ['bookshelf'], blocks: true, size: [0.9, 0.35, 1.8], bottom: 0 },
  { id: 'tv', title: 'TV', say: 'TV', sayMany: 'TVs', one: 'TV', many: 'TVs', prompts: ['television'], blocks: false, size: [1.2, 0.1, 0.7], bottom: 0.9 },
  { id: 'whiteboard', title: 'Whiteboard', say: 'whiteboard', sayMany: 'whiteboards', one: 'whiteboard', many: 'whiteboards', prompts: ['whiteboard'], blocks: false, size: [1.8, 0.05, 1.2], bottom: 0.9 },
  { id: 'plant', title: 'Plant', say: 'plant', sayMany: 'plants', one: 'plant', many: 'plants', prompts: ['plant'], blocks: true, size: [0.5, 0.5, 1.0], bottom: 0 },
] as const satisfies readonly NameInfo[];

export type NameId = (typeof NAMES)[number]['id'];
export const NAME_IDS: readonly NameId[] = NAMES.map((n) => n.id);

const BY_ID = new Map<string, NameInfo>(NAMES.map((n) => [n.id, n] as const));
export const isNameId = (v: unknown): v is NameId => typeof v === 'string' && BY_ID.has(v);
export const nameInfo = (id: NameId): NameInfo => BY_ID.get(id)!;

/** The clip that says some words: its file is public/voices/<id>.wav (spec §8.2). */
export const clipId = (words: string): string => words.toLowerCase().replace(/\s+/g, '-');
export const WALL_CLIP = 'wall';
/** Every clip id and the words it says: the names, their plurals where they differ, and "wall" (32 in all). */
export const CLIPS: ReadonlyMap<string, string> = new Map<string, string>(
  [...NAMES.flatMap((n) => [n.say, n.sayMany]), 'wall'].map((words) => [clipId(words), words] as const),
);

/** Detector prompt → name: "desk" is found as a table, "doorway" as a door (spec §5). */
export const PROMPT_TO_NAME: ReadonlyMap<string, NameId> = new Map<string, NameId>(
  NAMES.flatMap((n) => n.prompts.map((p) => [p, n.id] as const)),
);
export const DETECT_PROMPTS: readonly string[] = [...PROMPT_TO_NAME.keys()];
