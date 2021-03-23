'use strict';

function getSlideNodes() {
  return document.querySelectorAll(".viewer_content-container img.page-view");
}

function getSlides() {
  var slideNodes = getSlideNodes();
  try {
    var slides = [];
    slideNodes.forEach(function(slide){
      slides.push({
        img: slide.src,
        height: slide.height,
        width: slide.width
      });
    })
    return slides;
  } catch(e) {
    console.log(e);
    alert("No slides found");
    return [];
  }
}

function dispatchMouseEvent(target, var_args) {
  var e = document.createEvent("MouseEvent");
  // If you need clientX, clientY, etc., you can call
  // initMouseEvent instead of initEvent
  e.initEvent.apply(e, Array.prototype.slice.call(arguments, 1));
  target.dispatchEvent(e);
};

function nextSlide() {
  var nextBtn = document.getElementById('nextPageButton');
  dispatchMouseEvent(nextBtn, 'mouseover', true, true);
  dispatchMouseEvent(nextBtn, 'mousedown', true, true);
  dispatchMouseEvent(nextBtn, 'click', true, true);
  dispatchMouseEvent(nextBtn, 'mouseup', true, true);

  return true;
}

function advanceSlides(idx, end, done) {
  if (idx < end) {
    console.log("next Slide - ", idx, end);
    nextSlide();
    setTimeout(function(){advanceSlides(idx+1, end, done)}, 750)
  } else {
    done()
  }
}

var myPort = chrome.runtime.connect();
myPort.onMessage.addListener(function(msg) {
  if (msg.event === "print") {
    var numSlides = getSlideNodes().length;
    advanceSlides(0, numSlides-1, function(){
      myPort.postMessage({event: "slides", content: getSlides()});
    })
  }
});

