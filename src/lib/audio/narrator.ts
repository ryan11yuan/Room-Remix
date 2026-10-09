/** The narrator: the browser's own speech, heard inside the head (spec 2026-10-08 §7.7). */
export const NARRATOR_RATE = 1.05;

export type SpeechLike = {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
};

/** An English voice that runs on this computer (so the demo works offline), else any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  return english.find((v) => v.localService) ?? english[0] ?? null;
}

/** `say` cuts off whatever is being said; without speech synthesis it does nothing and the captions carry the words. */
export function createNarrator(speech: SpeechLike | undefined, utter: (text: string) => SpeechSynthesisUtterance) {
  return {
    say(text: string): void {
      if (!speech) return;
      speech.cancel();
      const u = utter(text);
      const voice = pickVoice(speech.getVoices());
      if (voice) u.voice = voice;
      u.rate = NARRATOR_RATE;
      speech.speak(u);
    },
    stop(): void {
      speech?.cancel();
    },
  };
}
