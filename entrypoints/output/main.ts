import { Slide } from "../../types/Slide";
import { outputReady } from "../../utils/messageHandling";
import { cropImageWithHiDPI } from "../../utils/imageCropping";


const addSlides = async (slides: Slide[]) => {
  var output = document.getElementById('output');
  if (!output) return
  for (const slide of slides) {
    const image = slide.img;
    const page = document.createElement("div");
    page.className = "page";

    const img = document.createElement("img");
    img.className = "slide-img";
    try {
      const finalSrc = slide.dimensions
        ? await cropImageWithHiDPI({
            imgUri: image,
            dimensions: slide.dimensions as DOMRect,
            coordinatesAlreadyScaled: !!slide.preScaled,
          })
        : image;
      img.src = finalSrc;
    } catch {
      img.src = image;
    }

    page.appendChild(img);
    output.appendChild(page);
  }
  printPage()
}

function printPage() {
  var imgs = document.images,
    len = imgs.length,
    counter = 0;


  function incrementCounter() {
    counter++;
    if ( counter === len ) {
      console.log( 'All images loaded!' );
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
