// MARK: - Color Hash Utility
// Generates deterministic hex colors from keyword strings

/**
 * Simple hash function for consistent color generation
 * Uses character codes to create a number, then maps to HSL color space
 */
export function hashStringToColor(str: string): number {
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Map hash to hue (0-360)
  const hue = Math.abs(hash) % 360;
  
  // Use consistent saturation and lightness for good visibility
  const saturation = 65; // 65% saturation
  const lightness = 55; // 55% lightness
  
  // Convert HSL to RGB
  const rgb = hslToRgb(hue, saturation, lightness);
  
  // Convert RGB to hex integer
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
}

/**
 * Converts HSL to RGB color space
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = h / 360;
  s = s / 100;
  l = l / 100;
  
  let r: number, g: number, b: number;
  
  if (s === 0) {
    r = g = b = l; // Achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}
