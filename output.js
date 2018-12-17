function addSlides(slides) {
  var output = document.getElementById('output');
  for (var i = 0; i < slides.length; i++) {
    var img = document.createElement("img");
    img.setAttribute("src", slides[i].img);
    img.setAttribute("style", "width: 100%");
    output.appendChild(img);
  }
}


function printPage() {
  var imgs = document.images,
    len = imgs.length,
    counter = 0;

  function orientPage() {
    console.log("Orient the page!")
    if (imgs[0].height > imgs[0].width) {
      console.log("No mo landscape");
      document.styleSheets[0].rules[0].cssRules[0].style.size = 'portrait';
    }
  }

  function incrementCounter() {
    counter++;
    if ( counter === len ) {
      console.log( 'All images loaded!' );
      orientPage();
      window.print();
    }
  }

  [].forEach.call( imgs, function( img ) {
    if (img.complete) {
      incrementCounter()
    } else {
      img.addEventListener( 'load', incrementCounter, false );
    }
  });

}
