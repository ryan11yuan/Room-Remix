import type { JobState, Quality } from './protocol';

export type Settings = { fps: number; maxSize: number; steps: number };

/** Spec §4. Starting values, tuned after timed runs on the demo laptop (Plan 6, Task 8). */
export const SETTINGS: Record<Quality, Settings> = {
  quick: { fps: 2, maxSize: 1000, steps: 2000 },
  best: { fps: 3, maxSize: 1600, steps: 15000 },
};

/** The app warns above this many splats (spec 2026-10-04 §8), so OpenSplat never makes more. */
export const MAX_GAUSSIANS = 1_500_000;
/** Fewer registered frames than this and COLMAP hasn't really found the room. */
export const MIN_REGISTERED = 10;
/** Where the job folder is mounted inside the pipeline container. */
export const JOB = '/job';
/** Where COLMAP's database lives: a per-job Docker volume, because SQLite's small writes are slow on the Windows bind mount. */
export const DB = '/db';

export type StepName = 'probe' | 'frames' | 'features' | 'matching' | 'mapper' | 'training';
export type PipelineStep = { name: StepName; state: JobState; gpu: boolean; db: boolean; args: string[] };

/** Frames per second, then the longer side capped at `maxSize` px (never enlarged) for portrait and landscape video. */
export function frameFilter(fps: number, maxSize: number): string {
  return `fps=${fps},scale='if(gte(iw,ih),min(${maxSize},iw),-2)':'if(gte(iw,ih),-2,min(${maxSize},ih))'`;
}

/** The pipeline Memento uses (ffmpeg → COLMAP → OpenSplat), as the commands run inside the container. */
export function pipelineSteps(quality: Quality, videoName: string): PipelineStep[] {
  const { fps, maxSize, steps } = SETTINGS[quality];
  const video = `${JOB}/${videoName}`;
  const database = `${DB}/database.db`;
  const images = `${JOB}/images`;
  return [
    {
      name: 'probe',
      state: 'checking',
      gpu: false,
      db: false,
      args: ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', video],
    },
    {
      name: 'frames',
      state: 'frames',
      gpu: false,
      db: false,
      args: ['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', frameFilter(fps, maxSize), '-q:v', '2', `${images}/%04d.jpg`],
    },
    {
      name: 'features',
      state: 'cameras',
      gpu: false,
      db: true,
      args: [
        'colmap', 'feature_extractor',
        '--database_path', database,
        '--image_path', images,
        '--ImageReader.single_camera', '1',
        '--ImageReader.camera_model', 'SIMPLE_RADIAL',
        '--SiftExtraction.use_gpu', '0',
      ],
    },
    {
      name: 'matching',
      state: 'cameras',
      gpu: false,
      db: true,
      args: [
        'colmap', 'sequential_matcher',
        '--database_path', database,
        '--SequentialMatching.overlap', '15',
        '--SequentialMatching.quadratic_overlap', '1',
        '--SiftMatching.use_gpu', '0',
      ],
    },
    {
      name: 'mapper',
      state: 'cameras',
      gpu: false,
      db: true,
      args: [
        'colmap', 'mapper',
        '--database_path', database,
        '--image_path', images,
        '--output_path', `${JOB}/sparse`,
        '--Mapper.multiple_models', '0',
        '--Mapper.extract_colors', '1',
      ],
    },
    {
      name: 'training',
      state: 'training',
      gpu: true,
      db: false,
      // OpenSplat reads the COLMAP model from sparse/0 and the frames from images/ (its colmap.cpp); .spz by extension.
      args: ['opensplat', JOB, '-n', String(steps), '--max-gaussians', String(MAX_GAUSSIANS), '-o', `${JOB}/splat.spz`],
    },
  ];
}
