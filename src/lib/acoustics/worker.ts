import { handleRequest, transferables, type SimRequest } from './protocol';

addEventListener('message', (event: MessageEvent<SimRequest>) => {
  const response = handleRequest(event.data);
  postMessage(response, { transfer: transferables(response) });
});
