import { findHandlerFor } from './handlers';

(async () => {
    const handler = findHandlerFor(window.location.href)
    chrome.runtime.onMessage.addListener(
        (request, _sender, sendResponse) => {
            (async () => {
                if (request.event === 'print' && handler) {
                    await handler(window.document)
                    sendResponse(true)
                } else {
                    alert("SlidePrint doesn't support this page")
                    sendResponse(false)
                }
            })();
            return true;
        }
    );
})();
