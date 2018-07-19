function addSlides(slides) {
  var output = document.getElementById('output');
  for (var i = 0; i < slides.length; i++) {
    var img = document.createElement("img");
    img.setAttribute("src", slides[i].img);
    img.setAttribute("style", "width: 100%");
    output.appendChild(img);
  }
}
