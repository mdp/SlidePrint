import { Slide } from "../../types/Slide";
import { outputReady } from "../../utils/messageHandling";

const cropImage = async (imgUri: string, dimensions: DOMRect): Promise<string> => {
  console.log("Values in crop", dimensions);
  const resize_canvas = document.createElement('canvas');
  const orig_src = new Image();
  orig_src.src = imgUri;
  return await new Promise((resolve) => {
    orig_src.onload = function () {
      try {
        resize_canvas.width = dimensions.width;
        resize_canvas.height = dimensions.height;
        const cnv = resize_canvas.getContext('2d');
        cnv?.drawImage(orig_src, dimensions.x, dimensions.y, dimensions.width, dimensions.height, 0, 0, dimensions.width, dimensions.height);
        const newimgUri = resize_canvas.toDataURL("image/jpeg").toString();
        resolve(newimgUri);
      }
      catch (e) {
        console.log("Couldn't crop image due to", e);
        resolve(imgUri)
      }
    }
  })
}

const addSlides = async (slides: Slide[]) => {
  var output = document.getElementById('output');
  if (!output) return
  for (const slide of slides) {
    let image = slide.img
    if (slide.dimensions) {
      image = await cropImage(image, slide.dimensions)
    }
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
  await browser.runtime.sendMessage({event: "reset"})
})()