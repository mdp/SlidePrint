import { findHandlerFor } from './handlers';
import { asyncMessageHandler } from './utils/messageHandling';

(async () => {
  const handler = findHandlerFor(window.location.href)
  chrome.runtime.onMessage.addListener(asyncMessageHandler<null>(async (request, _sender) => {
    if (handler) {
      if (request.event === 'content:can-print' && handler) {
        return true
      } else if (request.event === 'content:start-capture' && handler) {
        await handler(window.document)
        return true
      } else {
        return false
      }
    }
    return false
  }))
})();
