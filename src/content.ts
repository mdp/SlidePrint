import { findHandlerFor } from './handlers';
import { asyncMessageHandler } from './utils/messageHandling';

const handler = findHandlerFor(window.location.href)

const setup = async () => {
  chrome.runtime.onMessage.addListener(asyncMessageHandler<null>(async (request, _sender) => {
    if (handler) {
      if (request.event === 'content:start-capture' && handler) {
        try {
          await handler(window.document)
        } catch (e) {
          console.log("Content Handler Error:", e)
        }
        return true
      } else {
        return false
      }
    }
    return false
  }))
};

setup()
