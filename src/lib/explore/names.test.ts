import { describe, expect, it } from 'vitest';
import { CLIPS, clipId, DETECT_PROMPTS, isNameId, NAME_IDS, nameInfo, NAMES, PROMPT_TO_NAME, WALL_CLIP } from './names';

describe('names', () => {
  it("lists the 16 names in the spec's order", () => {
    expect(NAME_IDS).toEqual([
      'door', 'stairs', 'chair', 'sofa', 'table', 'counter', 'sink', 'toilet', 'bin', 'window', 'bed', 'cabinet', 'bookshelf', 'tv', 'whiteboard', 'plant',
    ]);
  });

  it('lets you walk through doors, windows, TVs and whiteboards only', () => {
    expect(NAMES.filter((n) => !n.blocks).map((n) => n.id)).toEqual(['door', 'window', 'tv', 'whiteboard']);
  });

  it('maps every detector prompt to its name', () => {
    expect(PROMPT_TO_NAME.get('desk')).toBe('table');
    expect(PROMPT_TO_NAME.get('doorway')).toBe('door');
    expect(PROMPT_TO_NAME.get('trash can')).toBe('bin');
    expect(PROMPT_TO_NAME.get('television')).toBe('tv');
    expect(DETECT_PROMPTS).toHaveLength(18);
  });

  it('has 32 clips: 16 names, 15 plurals (stairs is its own) and wall', () => {
    expect(CLIPS.size).toBe(32);
    expect(CLIPS.get('tv')).toBe('TV');
    expect(CLIPS.get('tvs')).toBe('TVs');
    expect(CLIPS.get('stairs')).toBe('stairs');
    expect(CLIPS.get('bookshelves')).toBe('bookshelves');
    expect(CLIPS.get(WALL_CLIP)).toBe('wall');
    expect(clipId('trash can')).toBe('trash-can');
  });

  it('gives added objects their typical size and height off the floor', () => {
    expect(nameInfo('door').size).toEqual([0.9, 0.1, 2.0]);
    expect(nameInfo('door').bottom).toBe(0);
    expect(nameInfo('window').bottom).toBe(0.9);
    expect(nameInfo('whiteboard').size).toEqual([1.8, 0.05, 1.2]);
  });

  it('knows a name from anything else', () => {
    expect(isNameId('tv')).toBe(true);
    expect(isNameId('television')).toBe(false);
    expect(isNameId(3)).toBe(false);
  });
});
