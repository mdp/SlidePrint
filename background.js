'use strict';

var activeTab, myPort, id=100;

function connected(p) {
  myPort = p;
  myPort.onMessage.addListener(function(m) {
    if (m.event === "slides") {
      var slides = m.content;
      console.log("About to print" + slides.length + " slides");
      var viewTabUrl = chrome.extension.getURL('output.html?id=' + id++)
      var targetId = null;
      chrome.tabs.onUpdated.addListener(function listener(tabId, changedProps) {
        // We are waiting for the tab we opened to finish loading.
        // Check that the tab's id matches the tab we opened,
        // and that the tab is done loading.
        if (tabId != targetId || changedProps.status != "complete") { return; } // Passing the above test means this is the event we were waiting for.
        // There is nothing we need to do for future onUpdated events, so we
        // use removeListner to stop getting called when onUpdated events fire.
        chrome.tabs.onUpdated.removeListener(listener);

        // Look through all views to find the window which will display
        // the screenshot.  The url of the tab which will display the
        // screenshot includes a query parameter with a unique id, which
        // ensures that exactly one view will have the matching URL.
        var views = chrome.extension.getViews();
        for (var i = 0; i < views.length; i++) {
          var view = views[i];
          if (view.location.href == viewTabUrl) {
            view.addSlides(slides);
            view.printPage();
            break;
          }
        }
      });

      chrome.tabs.create({url: viewTabUrl}, function(tab) {
        targetId = tab.id;
      });
    }
  });
}

chrome.runtime.onConnect.addListener(connected);

chrome.browserAction.onClicked.addListener(function() {

  chrome.tabs.query(
    { currentWindow: true, active: true },
    function (tabArray) {
      activeTab = tabArray[0];

      // Ensure that our current tab is on Docsend, otherwise toss up
      // an error for the user
      var url = new URL(activeTab.url);
      if (!url.hostname.match(/([a-zA-Z\.]*)docsend.com/)) {
        alert("'" +url.hostname + "' doesn't look like a docsend page :/");
      } else if (myPort) {
        myPort.postMessage({event: "print"}); 
      }
    }
  );

});
