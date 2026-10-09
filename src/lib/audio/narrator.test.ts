import { describe, expect, it } from 'vitest';
import { createNarrator, NARRATOR_RATE, pickVoice } from './narrator';

const voice = (lang: string, localService: boolean, name: string) => ({ lang, localService, name }) as SpeechSynthesisVoice;
const utter = (text: string) => ({ text }) as unknown as SpeechSynthesisUtterance;

describe('pickVoice', () => {
  it('prefers an English voice on this computer, then any English voice', () => {
    expect(pickVoice([voice('fr-FR', true, 'a'), voice('en-US', false, 'b'), voice('en-GB', true, 'c')])?.name).toBe('c');
    expect(pickVoice([voice('en-US', false, 'b')])?.name).toBe('b');
    expect(pickVoice([voice('fr-FR', true, 'a')])).toBeNull();
  });
});

describe('createNarrator', () => {
  it('cuts off the line being spoken and says the new one in the chosen voice', () => {
    const spoken: SpeechSynthesisUtterance[] = [];
    let cancels = 0;
    const speech = { speak: (u: SpeechSynthesisUtterance) => spoken.push(u), cancel: () => cancels++, getVoices: () => [voice('en-US', true, 'v')] };
    const narrator = createNarrator(speech, utter);
    narrator.say('Hello.');
    expect(cancels).toBe(1);
    expect(spoken[0]).toMatchObject({ text: 'Hello.', rate: NARRATOR_RATE, voice: { name: 'v' } });
    narrator.stop();
    expect(cancels).toBe(2);
  });

  it('stays quiet without speech synthesis', () => {
    expect(() => createNarrator(undefined, utter).say('Hello.')).not.toThrow();
  });
});
