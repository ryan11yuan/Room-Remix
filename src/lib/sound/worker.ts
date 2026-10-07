import { handleSound, soundTransferables, type SoundRequest } from './protocol';

addEventListener('message', (event: MessageEvent<SoundRequest>) => {
  const response = handleSound(event.data);
  postMessage(response, { transfer: soundTransferables(response) });
});
