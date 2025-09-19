// public/js/scenas/text.js
import { hexToRGB, makeRunner } from "./base.js";

/**
 * Text — scene for displaying text messages with various animations
 * - Supports multiple animation types: none, fade, slide, zoom, type, ticker
 * - Responsive sizing based on canvas dimensions
 * - Configurable text color, background color, alignment, and animation speed
 */
export function sceneText(ctx, canvas) {
  const { run, clear } = makeRunner(ctx, canvas);

  // Helper functions
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  // Easing functions for animations
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  return (payload) => {
    // Destructure and set defaults for all parameters
    const {
      text = "",
      fg = "#ffffff",
      bg = "#000000",
      bgAlpha = 0.8,
      align = "center",
      anim = "none",
      speed = 1,
      intensity = 1,
    } = payload;

    // Trim text and check if empty
    const trimmedText = text.trim();
    if (trimmedText === "") {
      // If text is empty, just show a faint dash
      run((t) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fontSize = clamp(Math.round(Math.min(canvas.width, canvas.height) * 0.12), 18, 200);
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillText("—", canvas.width / 2, canvas.height / 2);
      });
      return;
    }

    // Parse colors
    const fgColor = hexToRGB(fg);
    const bgColor = hexToRGB(bg);

    // Calculate font size based on canvas size
    const baseSize = Math.min(canvas.width, canvas.height);
    const fontSize = clamp(Math.round(baseSize * 0.12), 18, 200);

    // Font settings
    const fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

    run((tMs) => {
      // Clear the canvas at the start of each frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background if bgAlpha > 0
      if (bgAlpha > 0) {
        ctx.fillStyle = `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, ${bgAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Set up text style
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.textAlign = "center";

      // Convert time to seconds for easier calculations
      const t = tMs / 1000;
      // Animation progress (0-1) modulated by speed
      // Different animations have different cycle lengths
      let animLength = 2.0; // Default animation cycle length in seconds
      let progress = 0;
      let alpha = intensity;
      let xPos = canvas.width / 2;
      let yPos = 0;
      let scale = 1;

      // Set vertical alignment
      switch (align) {
        case "top":
          ctx.textBaseline = "top";
          yPos = fontSize * 1.2;
          break;
        case "bottom":
          ctx.textBaseline = "bottom";
          yPos = canvas.height - fontSize * 0.8;
          break;
        case "center":
        default:
          ctx.textBaseline = "middle";
          yPos = canvas.height / 2;
          break;
      }

      // Handle different animation types
      switch (anim) {
        case "fade":
          animLength = 1.5 / speed;
          progress = clamp((t % animLength) / animLength, 0, 1);
          alpha = intensity * easeInOut(progress);
          break;

        case "slide":
          animLength = 1.8 / speed;
          progress = clamp((t % animLength) / animLength, 0, 1);
          // Move from left (-30% off canvas) to center
          xPos = canvas.width * (-0.3 + 0.8 * easeOut(progress));
          alpha = intensity * Math.min(1, progress * 3); // Fade in quickly at start
          break;

        case "zoom":
          animLength = 2.0 / speed;
          progress = clamp((t % animLength) / animLength, 0, 1);
          scale = 0.8 + 0.2 * easeOut(progress);
          alpha = intensity * easeInOut(progress);
          break;

        case "type":
          animLength = 3.0 / speed;
          progress = clamp((t % animLength) / animLength, 0, 1);
          // Determine how many characters to show
          const charCount = Math.floor(trimmedText.length * progress);
          // Show only the first n characters
          const visibleText = trimmedText.substring(0, charCount);

          // Draw text with typing effect
          ctx.fillStyle = `rgba(${fgColor.r}, ${fgColor.g}, ${fgColor.b}, ${intensity})`;

          // Add a thin stroke for better visibility
          ctx.strokeStyle = `rgba(0, 0, 0, 0.5)`;
          ctx.lineWidth = 2;
          ctx.strokeText(visibleText, xPos, yPos);
          ctx.fillText(visibleText, xPos, yPos);

          // Show cursor at the end of typed text
          if (charCount < trimmedText.length && t % 0.8 < 0.4) {
            const metrics = ctx.measureText(visibleText);
            const cursorX = xPos + metrics.width / 2 + fontSize * 0.1;
            ctx.fillRect(cursorX, yPos - fontSize / 2, 3, fontSize);
          }

          // Skip further rendering since we've already drawn the text
          return;

        case "ticker":
          // Measure text to determine if scrolling is needed
          ctx.font = `bold ${fontSize}px ${fontFamily}`;
          const metrics = ctx.measureText(trimmedText);

          // If text fits within 80% of canvas, center it without animation
          if (metrics.width < canvas.width * 0.8) {
            xPos = canvas.width / 2;
            alpha = intensity;
          } else {
            // Calculate scroll position
            const totalWidth = metrics.width + canvas.width;
            const scrollSpeed = 80 * speed; // pixels per second
            const scrollTime = totalWidth / scrollSpeed;
            const position = (t % scrollTime) / scrollTime;

            // Start with text right edge at left of screen, end with left edge at right
            xPos = canvas.width - position * totalWidth;
            ctx.textAlign = "left";
            alpha = intensity;
          }
          break;

        case "none":
        default:
          // No animation, just display text
          alpha = intensity;
          break;
      }

      // Save context before scaling if using zoom
      if (anim === "zoom") {
        ctx.save();
        ctx.translate(canvas.width / 2, yPos);
        ctx.scale(scale, scale);
        xPos = 0;
        yPos = 0;
      }

      // Set text color with calculated alpha
      ctx.fillStyle = `rgba(${fgColor.r}, ${fgColor.g}, ${fgColor.b}, ${alpha})`;

      // Add subtle stroke for better contrast
      if (anim !== "type") {
        // Skip for type since it handles its own drawing
        ctx.strokeStyle = `rgba(0, 0, 0, 0.5)`;
        ctx.lineWidth = 2;
        ctx.strokeText(trimmedText, xPos, yPos);
        ctx.fillText(trimmedText, xPos, yPos);
      }

      // Restore context if saved for zoom
      if (anim === "zoom") {
        ctx.restore();
      }
    });
  };
}
