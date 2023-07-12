import { findHandlerFor } from './handlers';
import { asyncMessageHandler } from './utils/messageHandling';

const handler = findHandlerFor(window.location.href)

const setup = async () => {
  chrome.runtime.onMessage.addListener(asyncMessageHandler<null>(async (request, _sender) => {
    if (handler) {
      if (request.event === 'content:start-capture' && handler) {
        await handler(window.document)
        return true
      } else {
        return false
      }
    }
    return false
  }))
};

setup()
