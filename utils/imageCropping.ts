/**
 * Utility for HiDPI-aware image cropping
 * Handles both manual capture (CSS pixels) and auto-capture (pre-scaled) coordinates
 */

export interface CropImageOptions {
  imgUri: string;
  dimensions: DOMRect;
  outputWidth?: number;
  outputHeight?: number;
  coordinatesAlreadyScaled?: boolean;
}

/**
 * Detects if dimensions are already HiDPI-scaled by comparing against image size
 * Auto-capture handlers use fixHiDPI() which pre-scales coordinates
 * Manual capture provides raw CSS pixel coordinates that need scaling
 */
export const detectHiDPIScaling = (
  dimensions: DOMRect, 
  imageNaturalWidth: number, 
  imageNaturalHeight: number
): boolean => {
  const devicePixelRatio = window.devicePixelRatio || 1;
  
  if (devicePixelRatio <= 1) {
    return false; // No HiDPI scaling needed on standard displays
  }
  
  // More precise detection: check if dimensions are close to device-scaled size
  // Auto-capture dimensions are typically much larger than CSS pixels would be
  const scaledWidth = dimensions.width * devicePixelRatio;
  const scaledHeight = dimensions.height * devicePixelRatio;
  
  // If the dimensions are already close to or larger than what they would be when scaled,
  // they're likely already HiDPI-scaled. Use a tighter threshold.
  const isWidthAlreadyScaled = dimensions.width > imageNaturalWidth * 0.3 && 
                               scaledWidth > imageNaturalWidth * 0.9;
  const isHeightAlreadyScaled = dimensions.height > imageNaturalHeight * 0.3 && 
                                scaledHeight > imageNaturalHeight * 0.9;
  
  return isWidthAlreadyScaled || isHeightAlreadyScaled;
};

/**
 * Crops an image with intelligent HiDPI coordinate handling
 */
export const cropImageWithHiDPI = async (options: CropImageOptions): Promise<string> => {
  const { imgUri, dimensions, outputWidth, outputHeight, coordinatesAlreadyScaled } = options;
  
  const canvas = document.createElement('canvas');
  const img = new Image();
  img.src = imgUri;
  
  return await new Promise((resolve) => {
    img.onload = () => {
      try {
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // Use explicit parameter if provided, otherwise fall back to detection
        const isAlreadyScaled = coordinatesAlreadyScaled !== undefined 
          ? coordinatesAlreadyScaled 
          : detectHiDPIScaling(dimensions, img.naturalWidth, img.naturalHeight);
        
        let scaledX, scaledY, scaledWidth, scaledHeight;
        let canvasWidth, canvasHeight;
        
        if (isAlreadyScaled) {
          // Dimensions are already HiDPI-scaled (from auto-capture)
          scaledX = dimensions.x;
          scaledY = dimensions.y;
          scaledWidth = dimensions.width;
          scaledHeight = dimensions.height;
          canvasWidth = outputWidth || dimensions.width / devicePixelRatio;
          canvasHeight = outputHeight || dimensions.height / devicePixelRatio;
        } else {
          // Dimensions are in CSS pixels (from manual capture), need scaling
          scaledX = dimensions.x * devicePixelRatio;
          scaledY = dimensions.y * devicePixelRatio;
          scaledWidth = dimensions.width * devicePixelRatio;
          scaledHeight = dimensions.height * devicePixelRatio;
          canvasWidth = outputWidth || dimensions.width;
          canvasHeight = outputHeight || dimensions.height;
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight, 0, 0, canvasWidth, canvasHeight);
        
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (error) {
        console.error('Error cropping image:', error);
        resolve(imgUri);
      }
    };
    
    img.onerror = () => resolve(imgUri);
  });
};
