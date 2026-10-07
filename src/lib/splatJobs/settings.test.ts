import { describe, expect, it } from 'vitest';
import { DB, frameFilter, MAX_GAUSSIANS, MIN_REGISTERED, pipelineSteps, SETTINGS } from './settings';

describe('pipelineSteps', () => {
  it('runs the six steps in order, each under its job state', () => {
    expect(pipelineSteps('quick', 'video.mov').map((s) => [s.name, s.state])).toEqual([
      ['probe', 'checking'],
      ['frames', 'frames'],
      ['features', 'cameras'],
      ['matching', 'cameras'],
      ['mapper', 'cameras'],
      ['training', 'training'],
    ]);
  });

  it('gives only OpenSplat the GPU', () => {
    expect(pipelineSteps('quick', 'video.mp4').filter((s) => s.gpu).map((s) => s.name)).toEqual(['training']);
  });

  it('reads the video from the job folder and writes numbered frames into images/', () => {
    const [probe, frames] = pipelineSteps('best', 'video.mov');
    expect(probe.args).toEqual(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '/job/video.mov']);
    expect(frames.args).toEqual([
      'ffmpeg', '-v', 'error', '-y', '-i', '/job/video.mov',
      '-vf', frameFilter(SETTINGS.best.fps, SETTINGS.best.maxSize),
      '-q:v', '2', '/job/images/%04d.jpg',
    ]);
  });

  it('uses the Memento COLMAP settings, with SIFT on the CPU', () => {
    const steps = pipelineSteps('quick', 'video.mp4');
    const args = (name: string) => steps.find((s) => s.name === name)!.args.join(' ');
    expect(args('features')).toBe(
      'colmap feature_extractor --database_path /db/database.db --image_path /job/images --ImageReader.single_camera 1 --ImageReader.camera_model SIMPLE_RADIAL --SiftExtraction.use_gpu 0',
    );
    expect(args('matching')).toBe(
      'colmap sequential_matcher --database_path /db/database.db --SequentialMatching.overlap 15 --SequentialMatching.quadratic_overlap 1 --SiftMatching.use_gpu 0',
    );
    expect(args('mapper')).toBe(
      'colmap mapper --database_path /db/database.db --image_path /job/images --output_path /job/sparse --Mapper.multiple_models 0 --Mapper.extract_colors 1',
    );
  });

  it('keeps the COLMAP database on the /db volume, for features, matching and mapper only', () => {
    expect(pipelineSteps('quick', 'video.mp4').filter((s) => s.db).map((s) => s.name)).toEqual(['features', 'matching', 'mapper']);
    expect(DB).toBe('/db');
  });

  it('trains for the quality steps, caps the splat count and writes .spz', () => {
    expect(pipelineSteps('quick', 'video.mp4').at(-1)!.args).toEqual([
      'opensplat', '/job', '-n', String(SETTINGS.quick.steps), '--max-gaussians', '1500000', '-o', '/job/splat.spz',
    ]);
    expect(pipelineSteps('best', 'video.mp4').at(-1)!.args[3]).toBe(String(SETTINGS.best.steps));
    expect(MAX_GAUSSIANS).toBe(1_500_000);
    expect(MIN_REGISTERED).toBe(10);
  });

  it('takes fewer, smaller frames and fewer steps for Quick than for Best', () => {
    expect(SETTINGS.quick.fps).toBeLessThan(SETTINGS.best.fps);
    expect(SETTINGS.quick.maxSize).toBeLessThan(SETTINGS.best.maxSize);
    expect(SETTINGS.quick.steps).toBeLessThan(SETTINGS.best.steps);
  });
});

describe('frameFilter', () => {
  it('caps the longer side, so portrait and landscape video are treated alike, and never enlarges', () => {
    // ffmpeg rotates by the video's rotation tag before filters run, so iw/ih here are the upright frame's.
    expect(frameFilter(2, 1000)).toBe("fps=2,scale='if(gte(iw,ih),min(1000,iw),-2)':'if(gte(iw,ih),-2,min(1000,ih))'");
  });
});
