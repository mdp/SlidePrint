import { Slide } from "../../types/Slide";
import { outputReady } from "../../utils/messageHandling";


const addSlides = async (slides: Slide[]) => {
  var output = document.getElementById('output');
  if (!output) return
  for (const slide of slides) {
    const image = slide.img;
    var img = document.createElement("img");
    img.setAttribute("src", image);
    img.setAttribute("style", "width: 100%");
    output.appendChild(img);
  }
  printPage()
}

function printPage() {
  var imgs = document.images,
    len = imgs.length,
    counter = 0;

  function orientPage() {
    console.log("Orient the page!")
    if (imgs[0].height > imgs[0].width) {
      console.log("No mo landscape");
      // TODO: fix landscape
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

  for (const img of imgs) {
    if (img.complete) {
      incrementCounter()
    } else {
      img.addEventListener( 'load', incrementCounter, false );
    }
  }
}

(async () => {
  const result = await outputReady()
  console.log(result)
  await addSlides(result)
})()
