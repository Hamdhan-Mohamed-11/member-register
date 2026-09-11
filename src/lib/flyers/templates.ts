/**
 * Flyer templates.
 *
 * Each one is a pure function that paints a 1080x1350 canvas — Instagram's
 * portrait ratio, which is also close enough to A-series that a printed copy
 * does not look wrong. They share a palette and a type scale so a club posting
 * two different templates in a month still looks like one club.
 *
 * Drawn rather than composed from HTML because the output has to become a PNG
 * a member can save and send. Rasterising HTML in the browser means either
 * html2canvas (a large dependency that renders CSS approximately) or an SVG
 * foreignObject (tainted canvases in several browsers). Painting the thing
 * directly is fewer moving parts and exact.
 */

export type FlyerFields = {
  clubName: string;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  when: string;
  location: string;
  presenter: string;
  /** Already-loaded photo, or null for the text-only layouts. */
  photo: HTMLImageElement | null;
};

export type FlyerTemplate = {
  id: string;
  name: string;
  /** One line telling a secretary when to reach for this one. */
  hint: string;
  /** Whether a photo does anything here, so the UI can say so. */
  usesPhoto: boolean;
  draw: (ctx: CanvasRenderingContext2D, f: FlyerFields) => void;
};

export const FLYER_W = 1080;
export const FLYER_H = 1350;

// Straight from the brand guideline, not approximated.
//
// These were a brown (#7c2d12) and a tan, which are nowhere in Pick a Book's
// palette — a flyer drawn in them would have gone out looking like a different
// organisation's. #293896 and #00AEEF are the brand's primary pair; the gold
// stays only as a hairline accent, never as a field.
const INK = "#14162e";
const CREAM = "#f8f2e9";
const BRAND = "#293896";
const BRAND_LIGHT = "#00aeef";
const GOLD = "#b8891f";

const DISPLAY = "'Playfair Display', Georgia, 'Times New Roman', serif";
const BODY = "Poppins, 'Helvetica Neue', Arial, sans-serif";

/** Wraps text to a width and returns how far down it ended. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 99,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return y;

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);

  const shown = lines.slice(0, maxLines);
  // An ellipsis rather than a silent cut, so a title that was too long is
  // visibly too long instead of quietly changed.
  if (lines.length > maxLines && shown.length) {
    shown[shown.length - 1] = `${shown[shown.length - 1].replace(/\s+\S*$/, "")}…`;
  }

  let cursor = y;
  for (const l of shown) {
    ctx.fillText(l, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

/**
 * Draws a photo to cover a box, cropping the overflow.
 *
 * `object-fit: cover` by hand. Scaling to fit instead would letterbox every
 * portrait photo a phone produced, which is most of them.
 */
function cover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/** A top-to-bottom scrim so white text stays readable over any photo. */
function scrim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  from = "rgba(0,0,0,0)",
  to = "rgba(0,0,0,0.78)",
) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function meta(ctx: CanvasRenderingContext2D, f: FlyerFields, x: number, y: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.font = `500 30px ${BODY}`;
  let cursor = y;
  for (const line of [f.when, f.location, f.presenter ? `Presented by ${f.presenter}` : ""]) {
    if (!line) continue;
    ctx.fillText(line, x, cursor);
    cursor += 44;
  }
  return cursor;
}

function eyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.font = `600 24px ${BODY}`;
  // Letter-spacing has no canvas equivalent everywhere, so it is done by hand.
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + 4;
  }
}

export const FLYER_TEMPLATES: FlyerTemplate[] = [
  {
    id: "photo-classic",
    name: "Photo, classic",
    hint: "A big photo with the details beneath it. The safe choice.",
    usesPhoto: true,
    draw(ctx, f) {
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, FLYER_W, FLYER_H);

      if (f.photo) cover(ctx, f.photo, 0, 0, FLYER_W, 700);
      else {
        ctx.fillStyle = BRAND;
        ctx.fillRect(0, 0, FLYER_W, 700);
      }

      ctx.fillStyle = GOLD;
      ctx.fillRect(0, 700, FLYER_W, 8);

      eyebrow(ctx, f.clubName, 80, 790, BRAND);

      ctx.fillStyle = INK;
      ctx.font = `700 76px ${DISPLAY}`;
      const afterTitle = wrap(ctx, f.title, 80, 880, FLYER_W - 160, 86, 3);

      if (f.bookTitle) {
        ctx.fillStyle = BRAND;
        ctx.font = `italic 40px ${DISPLAY}`;
        wrap(
          ctx,
          f.bookAuthor ? `${f.bookTitle} — ${f.bookAuthor}` : f.bookTitle,
          80,
          afterTitle + 24,
          FLYER_W - 160,
          50,
          2,
        );
      }

      meta(ctx, f, 80, FLYER_H - 190, INK);
    },
  },
  {
    id: "photo-overlay",
    name: "Photo, full bleed",
    hint: "The photo fills the page, words over the bottom. Best with a strong image.",
    usesPhoto: true,
    draw(ctx, f) {
      if (f.photo) cover(ctx, f.photo, 0, 0, FLYER_W, FLYER_H);
      else {
        ctx.fillStyle = INK;
        ctx.fillRect(0, 0, FLYER_W, FLYER_H);
      }

      scrim(ctx, 0, FLYER_H - 780, FLYER_W, 780);

      eyebrow(ctx, f.clubName, 80, FLYER_H - 560, GOLD);

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 84px ${DISPLAY}`;
      const after = wrap(ctx, f.title, 80, FLYER_H - 470, FLYER_W - 160, 94, 3);

      if (f.bookTitle) {
        ctx.fillStyle = "rgba(255,255,255,0.86)";
        ctx.font = `italic 38px ${DISPLAY}`;
        wrap(
          ctx,
          f.bookAuthor ? `${f.bookTitle} — ${f.bookAuthor}` : f.bookTitle,
          80,
          after + 20,
          FLYER_W - 160,
          48,
          2,
        );
      }

      meta(ctx, f, 80, FLYER_H - 190, "rgba(255,255,255,0.92)");
    },
  },
  {
    id: "split",
    name: "Split",
    hint: "Photo on top, a solid colour block below. Reads well as a thumbnail.",
    usesPhoto: true,
    draw(ctx, f) {
      if (f.photo) cover(ctx, f.photo, 0, 0, FLYER_W, 560);
      else {
        ctx.fillStyle = BRAND_LIGHT;
        ctx.fillRect(0, 0, FLYER_W, 560);
      }

      ctx.fillStyle = BRAND;
      ctx.fillRect(0, 560, FLYER_W, FLYER_H - 560);

      eyebrow(ctx, f.clubName, 80, 660, GOLD);

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 78px ${DISPLAY}`;
      const after = wrap(ctx, f.title, 80, 750, FLYER_W - 160, 88, 3);

      if (f.bookTitle) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `italic 38px ${DISPLAY}`;
        wrap(
          ctx,
          f.bookAuthor ? `${f.bookTitle} — ${f.bookAuthor}` : f.bookTitle,
          80,
          after + 20,
          FLYER_W - 160,
          48,
          2,
        );
      }

      ctx.fillStyle = GOLD;
      ctx.fillRect(80, FLYER_H - 250, 120, 6);
      meta(ctx, f, 80, FLYER_H - 180, "rgba(255,255,255,0.92)");
    },
  },
  {
    id: "typographic",
    name: "Words only",
    hint: "No photo. For when you have nothing good to hand, which is often.",
    usesPhoto: false,
    draw(ctx, f) {
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, FLYER_W, FLYER_H);

      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 6;
      ctx.strokeRect(48, 48, FLYER_W - 96, FLYER_H - 96);

      eyebrow(ctx, f.clubName, 110, 220, BRAND);

      ctx.fillStyle = INK;
      ctx.font = `700 96px ${DISPLAY}`;
      const after = wrap(ctx, f.title, 110, 360, FLYER_W - 220, 108, 4);

      ctx.fillStyle = GOLD;
      ctx.fillRect(110, after + 30, 160, 6);

      if (f.bookTitle) {
        ctx.fillStyle = BRAND;
        ctx.font = `italic 46px ${DISPLAY}`;
        wrap(ctx, f.bookTitle, 110, after + 130, FLYER_W - 220, 58, 2);
        if (f.bookAuthor) {
          ctx.fillStyle = INK;
          ctx.font = `400 34px ${BODY}`;
          ctx.fillText(f.bookAuthor, 110, after + 210);
        }
      }

      meta(ctx, f, 110, FLYER_H - 260, INK);
    },
  },
  {
    id: "poster",
    name: "Bold poster",
    hint: "Huge type on a dark ground. Stands out in a busy feed.",
    usesPhoto: true,
    draw(ctx, f) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, FLYER_W, FLYER_H);

      if (f.photo) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        cover(ctx, f.photo, 0, 0, FLYER_W, FLYER_H);
        ctx.restore();
      }

      ctx.fillStyle = GOLD;
      ctx.fillRect(0, 0, FLYER_W, 14);

      eyebrow(ctx, f.clubName, 80, 150, GOLD);

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 110px ${DISPLAY}`;
      const after = wrap(ctx, f.title, 80, 320, FLYER_W - 160, 118, 4);

      if (f.bookTitle) {
        ctx.fillStyle = GOLD;
        ctx.font = `italic 44px ${DISPLAY}`;
        wrap(
          ctx,
          f.bookAuthor ? `${f.bookTitle} — ${f.bookAuthor}` : f.bookTitle,
          80,
          after + 40,
          FLYER_W - 160,
          54,
          2,
        );
      }

      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(80, FLYER_H - 250, FLYER_W - 160, 2);
      meta(ctx, f, 80, FLYER_H - 180, "rgba(255,255,255,0.92)");
    },
  },
];

export function templateById(id: string): FlyerTemplate {
  return FLYER_TEMPLATES.find((t) => t.id === id) ?? FLYER_TEMPLATES[0];
}
