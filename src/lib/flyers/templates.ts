/**
 * Flyer templates.
 *
 * Each one is a pure function that paints a 1080x1350 canvas — Instagram's
 * portrait ratio, which is also close enough to A-series that a printed copy
 * does not look wrong. They share a palette, a type scale and the logo, so a
 * club posting two different templates in a month still looks like one club.
 *
 * The layouts follow the shapes real event flyers use -- an arched photo
 * window, a magazine masthead, a formal invitation card, a speaker portrait,
 * an oversized date, a diagonal split -- rather than a photo with text under
 * it five ways.
 *
 * Drawn rather than composed from HTML because the output has to become a PNG
 * a member can save and send. Rasterising HTML in the browser means either
 * html2canvas (a large dependency that renders CSS approximately) or an SVG
 * foreignObject (tainted canvases in several browsers). Painting the thing
 * directly is fewer moving parts and exact.
 */

export type FlyerImage = HTMLImageElement | HTMLCanvasElement;

export type FlyerDate = {
  day: string; // "17"
  month: string; // "Sep"
  monthLong: string; // "September"
  weekday: string; // "Thursday"
  weekdayShort: string; // "Thu"
  year: string; // "2026"
  time: string; // "6:30 pm"
};

/** Where the photo sits in its frame: a focal point (0-1 each way) and zoom. */
export type PhotoPos = { x: number; y: number; zoom: number };

/** The frame a photo was drawn into, and how big it was drawn -- for dragging. */
export type PhotoBox = { x: number; y: number; w: number; h: number; dw: number; dh: number };

export type FlyerFields = {
  clubName: string;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  date: FlyerDate;
  location: string;
  presenter: string;
  /** Already-loaded photo, or null. */
  photo: FlyerImage | null;
  photoPos: PhotoPos;
  /** The Pick a Book logo, once loaded. */
  logo: FlyerImage | null;
  /**
   * The book's cover -- from the shop catalogue where it has one, otherwise
   * whatever was uploaded. Every template shows it: a flyer for a book
   * evening with no book on it was the commonest thing to redo by hand.
   */
  bookCover: FlyerImage | null;
  /** An optional sponsor's logo, and the name printed beside it. */
  sponsor: FlyerImage | null;
  sponsorName: string;
  /** Told where the photo landed, so the designer can map a drag onto it. */
  onPhotoBox?: (box: PhotoBox) => void;
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

export const CENTRED: PhotoPos = { x: 0.5, y: 0.5, zoom: 1 };

// Straight from the brand guideline. #293896 and #00AEEF are the primary
// pair; gold is an accent, cream the paper.
const INK = "#14162e";
const MUTED = "#4a4f6b";
const CREAM = "#f8f2e9";
const BRAND = "#293896";
const BRAND_DEEP = "#16205c";
const BRAND_LIGHT = "#00aeef";
const SKY_TINT = "#e3f5fc";
const GOLD = "#c9982a";
const GOLD_LIGHT = "#f2cf7a";

// next/font serves Playfair and Poppins under generated family names, so the
// plain names never matched and every flyer quietly fell back to Georgia and
// Arial. The designer reads the real names off the page and sets them here
// before drawing; these defaults only matter if it cannot.
let DISPLAY = "'Playfair Display', Georgia, 'Times New Roman', serif";
let BODY = "Poppins, 'Helvetica Neue', Arial, sans-serif";

export function setFlyerFonts(display: string | null, body: string | null) {
  if (display) DISPLAY = `${display}, Georgia, 'Times New Roman', serif`;
  if (body) BODY = `${body}, 'Helvetica Neue', Arial, sans-serif`;
}

export function flyerFontSpecs(): string[] {
  return [
    `700 80px ${DISPLAY}`,
    `600 80px ${DISPLAY}`,
    `italic 500 40px ${DISPLAY}`,
    `400 30px ${BODY}`,
    `500 30px ${BODY}`,
    `600 30px ${BODY}`,
    `700 30px ${BODY}`,
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Breaks text into lines no wider than maxWidth, ellipsising past maxLines. */
function lines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 99,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  out.push(line);

  const shown = out.slice(0, maxLines);
  // An ellipsis rather than a silent cut, so a title that was too long is
  // visibly too long instead of quietly changed.
  if (out.length > maxLines && shown.length) {
    shown[shown.length - 1] = `${shown[shown.length - 1].replace(/\s+\S*$/, "")}…`;
  }
  return shown;
}

/** Draws wrapped text at x (honouring textAlign) and returns the next baseline. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 99,
): number {
  let cursor = y;
  for (const l of lines(ctx, text, maxWidth, maxLines)) {
    ctx.fillText(l, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

/**
 * The largest font size, up to `max`, at which the text wraps into at most
 * `maxLines` lines. Titles vary from "Poetry night" to a full sentence; a
 * fixed size makes the short ones look lost and the long ones spill.
 */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  maxWidth: number,
  max: number,
  min: number,
  maxLines: number,
): number {
  for (let size = max; size > min; size -= 4) {
    ctx.font = font(size);
    if (lines(ctx, text, maxWidth).length <= maxLines) return size;
  }
  ctx.font = font(min);
  return min;
}

/** Letter-spaced small caps, done by hand -- canvas letterSpacing is patchy. */
function spaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
  size = 22,
  tracking = 5,
  align: "left" | "center" | "right" = "left",
) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.font = `600 ${size}px ${BODY}`;
  ctx.textAlign = "left";
  const chars = [...text.toUpperCase()];
  const width =
    chars.reduce((w, ch) => w + ctx.measureText(ch).width + tracking, 0) - tracking;
  let cursor = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  for (const ch of chars) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draws the photo to cover a box, cropping the overflow -- `object-fit: cover`
 * by hand, moved by the admin's focal point and zoom. Clips to whatever path
 * is current when `clip` is given, so arches and circles work too.
 */
function photo(
  ctx: CanvasRenderingContext2D,
  f: FlyerFields,
  x: number,
  y: number,
  w: number,
  h: number,
  clip?: () => void,
) {
  if (!f.photo) return false;
  const img = f.photo;
  const zoom = Math.max(1, f.photoPos.zoom);
  const scale = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const fx = Math.min(1, Math.max(0, f.photoPos.x));
  const fy = Math.min(1, Math.max(0, f.photoPos.y));

  ctx.save();
  if (clip) clip();
  else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
  ctx.restore();

  f.onPhotoBox?.({ x, y, w, h, dw, dh });
  return true;
}

/**
 * What a photo frame shows before a photo is added: a brand gradient with
 * soft rings, so a flyer downloaded without a photo still looks designed.
 */
function placeholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  clip?: () => void,
) {
  ctx.save();
  if (clip) clip();
  else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, BRAND_DEEP);
  g.addColorStop(0.6, BRAND);
  g.addColorStop(1, BRAND_LIGHT);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 2;
  for (let r = 80; r < Math.max(w, h) * 1.2; r += 70) {
    ctx.beginPath();
    ctx.arc(x + w * 0.78, y + h * 0.28, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function photoOrPlaceholder(
  ctx: CanvasRenderingContext2D,
  f: FlyerFields,
  x: number,
  y: number,
  w: number,
  h: number,
  clip?: () => void,
) {
  if (!photo(ctx, f, x, y, w, h, clip)) placeholder(ctx, x, y, w, h, clip);
}

/** A vertical gradient, for scrims that keep text readable over a photo. */
function scrim(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  from: string,
  to: string,
) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

const tinted = new WeakMap<FlyerImage, Map<string, HTMLCanvasElement>>();

/** The logo recoloured flat, for dark grounds. Cached per colour. */
function tint(img: FlyerImage, colour: string): HTMLCanvasElement {
  let byColour = tinted.get(img);
  if (!byColour) {
    byColour = new Map();
    tinted.set(img, byColour);
  }
  const hit = byColour.get(colour);
  if (hit) return hit;

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const cx = c.getContext("2d")!;
  cx.drawImage(img, 0, 0);
  cx.globalCompositeOperation = "source-in";
  cx.fillStyle = colour;
  cx.fillRect(0, 0, c.width, c.height);
  byColour.set(colour, c);
  return c;
}

function logo(
  ctx: CanvasRenderingContext2D,
  f: FlyerFields,
  x: number,
  y: number,
  width: number,
  colour: string | null = null,
  align: "left" | "center" | "right" = "left",
) {
  if (!f.logo) return;
  const img = colour ? tint(f.logo, colour) : f.logo;
  const h = (width * f.logo.height) / f.logo.width;
  const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  ctx.drawImage(img, left, y, width, h);
}

/**
 * The book, drawn as a book: a cover with a darker spine down its left edge
 * and a soft shadow under it. When there is no cover image, the title is set
 * on a brand-coloured jacket instead, so the shape is always there.
 */
function bookCover(
  ctx: CanvasRenderingContext2D,
  f: FlyerFields,
  x: number,
  y: number,
  h: number,
  tilt = 0,
) {
  const img = f.bookCover;
  const ratio = img ? img.width / img.height : 0.66;
  const w = h * Math.min(0.85, Math.max(0.55, ratio));

  ctx.save();
  if (tilt) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((tilt * Math.PI) / 180);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }

  ctx.shadowColor = "rgba(8,12,40,0.35)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, BRAND);
    g.addColorStop(1, BRAND_DEEP);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(h * 0.075)}px ${DISPLAY}`;
    wrap(ctx, f.bookTitle || f.title, x + w / 2, y + h * 0.42, w - 24, h * 0.09, 4);
    ctx.textAlign = "left";
  }

  // Spine and edge.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(x, y, w * 0.06, h);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
  return w;
}

/**
 * "In association with <sponsor>", with their logo. Drawn only when a sponsor
 * was added, so a flyer without one has no empty strip.
 */
function sponsorStrip(
  ctx: CanvasRenderingContext2D,
  f: FlyerFields,
  y: number,
  onDark: boolean,
) {
  if (!f.sponsor && !f.sponsorName) return;
  const muted = onDark ? "rgba(255,255,255,0.7)" : MUTED;
  const strong = onDark ? "#ffffff" : INK;

  spaced(ctx, "In association with", FLYER_W / 2, y, muted, 18, 4, "center");

  const logoH = 54;
  const logoW = f.sponsor ? (logoH * f.sponsor.width) / f.sponsor.height : 0;
  ctx.font = `600 30px ${BODY}`;
  const nameW = f.sponsorName ? ctx.measureText(f.sponsorName).width : 0;
  const gap = f.sponsor && f.sponsorName ? 18 : 0;
  let cursor = FLYER_W / 2 - (logoW + gap + nameW) / 2;

  if (f.sponsor) {
    ctx.drawImage(f.sponsor, cursor, y + 16, logoW, logoH);
    cursor += logoW + gap;
  }
  if (f.sponsorName) {
    ctx.fillStyle = strong;
    ctx.textAlign = "left";
    ctx.fillText(f.sponsorName, cursor, y + 16 + logoH * 0.68);
  }
}

/**
 * The sponsor on one line -- logo then name -- anchored to a corner. For
 * layouts whose foot is already carrying a date tile or a venue line.
 */
function sponsorCorner(
  ctx: CanvasRenderingContext2D,
  f: FlyerFields,
  x: number,
  y: number,
  onDark: boolean,
  align: "left" | "right" = "right",
) {
  if (!f.sponsor && !f.sponsorName) return;
  const logoH = 40;
  const logoW = f.sponsor ? (logoH * f.sponsor.width) / f.sponsor.height : 0;
  ctx.font = `600 24px ${BODY}`;
  const nameW = f.sponsorName ? ctx.measureText(f.sponsorName).width : 0;
  const gap = f.sponsor && f.sponsorName ? 12 : 0;
  const total = logoW + gap + nameW;
  let cursor = align === "right" ? x - total : x;

  spaced(ctx, "In association with", align === "right" ? x : x, y - 14,
    onDark ? "rgba(255,255,255,0.65)" : MUTED, 15, 3, align);

  if (f.sponsor) {
    ctx.drawImage(f.sponsor, cursor, y, logoW, logoH);
    cursor += logoW + gap;
  }
  if (f.sponsorName) {
    ctx.fillStyle = onDark ? "#ffffff" : INK;
    ctx.textAlign = "left";
    ctx.fillText(f.sponsorName, cursor, y + logoH * 0.7);
  }
}

function bookLine(f: FlyerFields): string {
  if (!f.bookTitle) return "";
  return f.bookAuthor ? `${f.bookTitle} by ${f.bookAuthor}` : f.bookTitle;
}

/**
 * Label-over-value columns -- DATE / TIME / VENUE -- the way printed event
 * flyers set their details, instead of three loose lines of text.
 */
function details(
  ctx: CanvasRenderingContext2D,
  items: [string, string][],
  x: number,
  y: number,
  width: number,
  labelColour: string,
  valueColour: string,
  align: "left" | "center" = "left",
) {
  const shown = items.filter(([, v]) => v);
  if (!shown.length) return;
  const gap = 36;
  const colW = (width - gap * (shown.length - 1)) / shown.length;
  shown.forEach(([label, value], i) => {
    const cx = x + i * (colW + gap);
    const ax = align === "center" ? cx + colW / 2 : cx;
    spaced(ctx, label, ax, y, labelColour, 20, 4, align);
    ctx.save();
    ctx.fillStyle = valueColour;
    ctx.font = `500 30px ${BODY}`;
    ctx.textAlign = align;
    wrap(ctx, value, ax, y + 46, colW, 40, 2);
    ctx.restore();
  });
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const FLYER_TEMPLATES: FlyerTemplate[] = [
  {
    id: "editorial-arch",
    name: "Editorial",
    hint: "A photo in an arched window on cream paper, with a date seal. Elegant and bookish.",
    usesPhoto: true,
    draw(ctx, f) {
      ctx.fillStyle = CREAM;
      ctx.fillRect(0, 0, FLYER_W, FLYER_H);

      logo(ctx, f, 80, 64, 230);
      spaced(ctx, f.clubName, FLYER_W - 80, 108, BRAND, 20, 4, "right");

      // The arch: a rectangle with a semicircular top.
      const ax = 170;
      const ay = 180;
      const aw = 740;
      const ah = 600;
      const R = aw / 2;
      const archPath = (inset = 0) => () => {
        ctx.beginPath();
        ctx.moveTo(ax - inset, ay + ah + inset);
        ctx.lineTo(ax - inset, ay + R);
        ctx.arc(ax + R, ay + R, R + inset, Math.PI, 0);
        ctx.lineTo(ax + aw + inset, ay + ah + inset);
        ctx.closePath();
      };
      photoOrPlaceholder(ctx, f, ax, ay, aw, ah, archPath());
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      archPath(22)();
      ctx.stroke();

      // Date seal on the arch's right edge where the curve meets the side --
      // clear of the title below, which a seal on the bottom corner covered.
      const sx = ax + aw;
      const sy = ay + R + 40;
      ctx.fillStyle = BRAND;
      ctx.beginPath();
      ctx.arc(sx, sy, 104, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = GOLD_LIGHT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = `700 74px ${DISPLAY}`;
      ctx.fillText(f.date.day, sx, sy + 14);
      spaced(ctx, f.date.month, sx, sy + 54, GOLD_LIGHT, 22, 4, "center");

      // The book itself, leaning against the arch on the left.
      bookCover(ctx, f, 58, ay + ah - 268, 250, -7);

      // Title and book, centred.
      ctx.textAlign = "center";
      ctx.fillStyle = INK;
      const size = fitSize(ctx, f.title, (s) => `700 ${s}px ${DISPLAY}`, 880, 66, 46, 2);
      const y = wrap(ctx, f.title, FLYER_W / 2, 900, 880, size * 1.08, 2);
      if (f.bookTitle) {
        ctx.fillStyle = BRAND;
        ctx.font = `italic 500 34px ${DISPLAY}`;
        wrap(ctx, bookLine(f), FLYER_W / 2, y + 6, 900, 44, 1);
      }

      ctx.fillStyle = GOLD;
      ctx.fillRect(FLYER_W / 2 - 60, FLYER_H - 268, 120, 3);
      if (f.sponsor || f.sponsorName) sponsorStrip(ctx, f, FLYER_H - 86, false);
      details(
        ctx,
        [
          ["When", `${f.date.weekday}, ${f.date.time}`],
          ["Where", f.location],
          ["Presented by", f.presenter],
        ],
        90,
        FLYER_H - 218,
        FLYER_W - 180,
        GOLD,
        INK,
        "center",
      );
      ctx.textAlign = "left";
    },
  },
  {
    id: "magazine-cover",
    name: "Magazine cover",
    hint: "Full-bleed photo with the club as a masthead. Best with a strong, bright image.",
    usesPhoto: true,
    draw(ctx, f) {
      photoOrPlaceholder(ctx, f, 0, 0, FLYER_W, FLYER_H);

      scrim(ctx, 0, 0, FLYER_W, 460, "rgba(10,14,40,0.72)", "rgba(10,14,40,0)");
      scrim(ctx, 0, FLYER_H - 820, FLYER_W, 820, "rgba(10,14,40,0)", "rgba(10,14,40,0.9)");

      logo(ctx, f, 80, 60, 190, "#ffffff");
      spaced(ctx, "Book club evening", FLYER_W - 80, 100, GOLD_LIGHT, 20, 5, "right");

      // Masthead: the club's name as large as the width allows.
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      const mast = fitSize(ctx, f.clubName, (s) => `700 ${s}px ${DISPLAY}`, FLYER_W - 160, 120, 56, 2);
      wrap(ctx, f.clubName, 80, 150 + mast * 0.9, FLYER_W - 160, mast * 1.02, 2);

      // The book, standing at the right of the page -- drawn before the text
      // so the words know how much room is left.
      const coverRight = bookCover(ctx, f, FLYER_W - 280, FLYER_H - 700, 290, 4);

      // Bottom block, laid out upward from the details.
      // The words keep clear of the cover standing on the right.
      const textW = FLYER_W - 160 - (f.bookCover ? coverRight + 40 : 0);
      ctx.font = `700 84px ${DISPLAY}`;
      const titleSize = fitSize(ctx, f.title, (s) => `700 ${s}px ${DISPLAY}`, textW, 84, 52, 3);
      const titleLines = lines(ctx, f.title, textW, 3);
      const bookH = f.bookTitle ? 100 : 0;
      let y = FLYER_H - 300 - bookH - titleLines.length * titleSize * 1.08;

      ctx.fillStyle = GOLD_LIGHT;
      ctx.fillRect(80, y - titleSize - 10, 90, 5);
      ctx.fillStyle = "#ffffff";
      y = wrap(ctx, f.title, 80, y, textW, titleSize * 1.08, 3);
      if (f.bookTitle) {
        ctx.fillStyle = "rgba(255,255,255,0.86)";
        ctx.font = `italic 500 36px ${DISPLAY}`;
        wrap(ctx, bookLine(f), 80, y + 6, textW, 44, 2);
      }

      // Date pill.
      const pill = `${f.date.weekdayShort} ${f.date.day} ${f.date.month}  ·  ${f.date.time}`;
      ctx.font = `600 30px ${BODY}`;
      const pw = ctx.measureText(pill).width + 64;
      ctx.fillStyle = "#ffffff";
      roundRectPath(ctx, 80, FLYER_H - 250, pw, 66, 33);
      ctx.fill();
      ctx.fillStyle = BRAND;
      ctx.fillText(pill, 112, FLYER_H - 206);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `500 30px ${BODY}`;
      const bits = [f.location, f.presenter ? `with ${f.presenter}` : ""].filter(Boolean);
      wrap(ctx, bits.join("  ·  "), 80, FLYER_H - 120, FLYER_W - 420, 40, 2);
      if (f.sponsor || f.sponsorName) sponsorCorner(ctx, f, FLYER_W - 80, FLYER_H - 150, true);
    },
  },
  {
    id: "invitation",
    name: "Invitation",
    hint: "A formal invitation card in navy and gold. No photo needed.",
    usesPhoto: false,
    draw(ctx, f) {
      const g = ctx.createLinearGradient(0, 0, 0, FLYER_H);
      g.addColorStop(0, BRAND);
      g.addColorStop(1, BRAND_DEEP);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, FLYER_W, FLYER_H);

      // Double gold frame with diamonds at the corners.
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.strokeRect(44, 44, FLYER_W - 88, FLYER_H - 88);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(62, 62, FLYER_W - 124, FLYER_H - 124);
      ctx.fillStyle = GOLD;
      for (const [cx, cy] of [
        [53, 53],
        [FLYER_W - 53, 53],
        [53, FLYER_H - 53],
        [FLYER_W - 53, FLYER_H - 53],
      ]) {
        diamond(ctx, cx, cy, 12);
      }

      const mid = FLYER_W / 2;
      logo(ctx, f, mid, 120, 250, "#ffffff", "center");

      ctx.textAlign = "center";
      ctx.fillStyle = GOLD_LIGHT;
      ctx.font = `italic 500 42px ${DISPLAY}`;
      ctx.fillText("You're invited to", mid, 300);

      // The book, centred under the invitation line.
      const coverW = bookCover(ctx, f, mid - 90, 330, 250);
      void coverW;

      ctx.fillStyle = "#ffffff";
      const size = fitSize(ctx, f.title, (s) => `700 ${s}px ${DISPLAY}`, 860, 76, 48, 3);
      let y = wrap(ctx, f.title, mid, 660 + size, 860, size * 1.1, 3);

      // Divider: rules either side of a diamond.
      y += 10;
      ctx.fillStyle = GOLD;
      ctx.fillRect(mid - 190, y, 160, 2);
      ctx.fillRect(mid + 30, y, 160, 2);
      diamond(ctx, mid, y + 1, 10);

      if (f.bookTitle) {
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.font = `italic 500 40px ${DISPLAY}`;
        wrap(ctx, f.bookTitle, mid, y + 70, 860, 46, 1);
        if (f.bookAuthor) {
          spaced(ctx, f.bookAuthor, mid, y + 112, "rgba(255,255,255,0.7)", 20, 4, "center");
        }
      }

      details(
        ctx,
        [
          ["Date", `${f.date.weekday} ${f.date.day} ${f.date.monthLong}`],
          ["Time", f.date.time],
          ["Venue", f.location],
        ],
        120,
        FLYER_H - 284,
        FLYER_W - 240,
        GOLD_LIGHT,
        "#ffffff",
        "center",
      );

      ctx.textAlign = "center";
      if (f.presenter) {
        ctx.fillStyle = BRAND_LIGHT;
        ctx.font = `500 28px ${BODY}`;
        ctx.fillText(`Presented by ${f.presenter}`, mid, FLYER_H - 138);
      }
      spaced(ctx, f.clubName, mid, FLYER_H - 102, GOLD, 20, 5, "center");
      if (f.sponsor || f.sponsorName) sponsorCorner(ctx, f, mid - 90, FLYER_H - 78, true, "left");
      ctx.textAlign = "left";
    },
  },
  {
    id: "spotlight",
    name: "Speaker spotlight",
    hint: "A round portrait of the presenter with their name up front. Add a headshot.",
    usesPhoto: true,
    draw(ctx, f) {
      const bg = ctx.createLinearGradient(0, 0, 0, FLYER_H);
      bg.addColorStop(0, SKY_TINT);
      bg.addColorStop(0.7, "#ffffff");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, FLYER_W, FLYER_H);

      // Decorative circles, off the edges.
      ctx.fillStyle = "rgba(0,174,239,0.16)";
      ctx.beginPath();
      ctx.arc(FLYER_W - 40, 120, 260, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(41,56,150,0.1)";
      ctx.beginPath();
      ctx.arc(60, 700, 180, 0, Math.PI * 2);
      ctx.fill();

      logo(ctx, f, 80, 64, 210);
      spaced(ctx, f.clubName, FLYER_W - 80, 104, BRAND, 20, 4, "right");

      // Portrait with a gold ring.
      const cx = FLYER_W / 2;
      const cy = 470;
      const r = 240;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, r + 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 22, 0, Math.PI * 2);
      ctx.stroke();
      const circle = () => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      };
      if (!photo(ctx, f, cx - r, cy - r, r * 2, r * 2, circle)) {
        placeholder(ctx, cx - r, cy - r, r * 2, r * 2, circle);
        if (f.presenter) {
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.font = `700 150px ${DISPLAY}`;
          ctx.fillText(initials(f.presenter), cx, cy + 52);
        }
      }

      ctx.textAlign = "center";
      let y = 800;
      if (f.presenter) {
        spaced(ctx, "Presented by", cx, y, BRAND_LIGHT, 20, 5, "center");
        ctx.fillStyle = INK;
        ctx.font = `700 58px ${DISPLAY}`;
        ctx.fillText(f.presenter, cx, y + 66);
        y += 150;
      } else {
        y += 30;
      }

      ctx.fillStyle = BRAND;
      const size = fitSize(ctx, f.title, (s) => `700 ${s}px ${DISPLAY}`, 900, 60, 42, 2);
      y = wrap(ctx, f.title, cx, y, 900, size * 1.12, 2);
      if (f.bookTitle) {
        ctx.fillStyle = MUTED;
        ctx.font = `italic 500 34px ${DISPLAY}`;
        wrap(ctx, bookLine(f), cx, y + 4, 880, 42, 1);
      }

      // The book, propped at the top left beside the portrait.
      bookCover(ctx, f, 56, 236, 250, -7);

      // Navy band with the details.
      ctx.fillStyle = BRAND;
      ctx.fillRect(0, FLYER_H - 200, FLYER_W, 200);
      ctx.fillStyle = GOLD;
      ctx.fillRect(0, FLYER_H - 200, FLYER_W, 6);
      details(
        ctx,
        [
          ["Date", `${f.date.weekdayShort} ${f.date.day} ${f.date.month}`],
          ["Time", f.date.time],
          ["Venue", f.location],
        ],
        80,
        FLYER_H - 130,
        FLYER_W - 160,
        GOLD_LIGHT,
        "#ffffff",
        "center",
      );
      if (f.sponsor || f.sponsorName) sponsorCorner(ctx, f, FLYER_W - 70, FLYER_H - 262, false);
      ctx.textAlign = "left";
    },
  },
  {
    id: "big-date",
    name: "Big date",
    hint: "An oversized date with bold shapes. Modern, and needs no photo.",
    usesPhoto: false,
    draw(ctx, f) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, FLYER_W, FLYER_H);

      // Overlapping circles, bottom right.
      ctx.fillStyle = BRAND_LIGHT;
      ctx.beginPath();
      ctx.arc(FLYER_W - 40, FLYER_H - 120, 330, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(41,56,150,0.92)";
      ctx.beginPath();
      ctx.arc(FLYER_W + 40, FLYER_H - 470, 230, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = GOLD_LIGHT;
      ctx.beginPath();
      ctx.arc(FLYER_W - 330, FLYER_H - 430, 46, 0, Math.PI * 2);
      ctx.fill();

      // The book, large on the right, over the circles.
      bookCover(ctx, f, FLYER_W - 330, 330, 400, 5);

      ctx.textAlign = "left";
      ctx.fillStyle = BRAND;
      ctx.font = `700 340px ${DISPLAY}`;
      ctx.fillText(f.date.day, 60, 380);
      const dayW = ctx.measureText(f.date.day).width;

      spaced(ctx, f.date.monthLong, 90 + dayW, 250, INK, 40, 6);
      ctx.fillStyle = MUTED;
      ctx.font = `500 34px ${BODY}`;
      ctx.fillText(`${f.date.weekday}, ${f.date.time}`, 90 + dayW, 310);

      ctx.fillStyle = GOLD;
      ctx.fillRect(80, 470, 130, 6);
      spaced(ctx, f.clubName, 80, 550, BRAND_LIGHT, 22, 5);

      ctx.fillStyle = INK;
      const textW = f.bookCover ? 600 : 860;
      const size = fitSize(ctx, f.title, (s) => `700 ${s}px ${DISPLAY}`, textW, 84, 50, 3);
      const y = wrap(ctx, f.title, 80, 550 + size * 1.25, textW, size * 1.1, 3);
      if (f.bookTitle) {
        ctx.fillStyle = BRAND;
        ctx.font = `italic 500 36px ${DISPLAY}`;
        wrap(ctx, bookLine(f), 80, y + 10, textW, 46, 2);
      }

      ctx.fillStyle = INK;
      ctx.font = `500 30px ${BODY}`;
      let by = FLYER_H - 250;
      if (f.location) by = wrap(ctx, f.location, 80, by, 560, 40, 2);
      if (f.presenter) {
        ctx.fillStyle = MUTED;
        ctx.fillText(`Presented by ${f.presenter}`, 80, by + 4);
      }
      logo(ctx, f, 80, FLYER_H - 130, 210);
      if (f.sponsor || f.sponsorName) sponsorCorner(ctx, f, FLYER_W - 80, FLYER_H - 120, false);
    },
  },
  {
    id: "diagonal",
    name: "Diagonal split",
    hint: "Photo above a sharp diagonal, details on navy below. Energetic.",
    usesPhoto: true,
    draw(ctx, f) {
      const top = 520;
      const drop = 180;
      photoOrPlaceholder(ctx, f, 0, 0, FLYER_W, top + drop, () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(FLYER_W, 0);
        ctx.lineTo(FLYER_W, top);
        ctx.lineTo(0, top + drop);
        ctx.closePath();
      });

      // Navy below the cut, with gold and sky stripes along it.
      ctx.fillStyle = BRAND;
      ctx.beginPath();
      ctx.moveTo(0, top + drop);
      ctx.lineTo(FLYER_W, top);
      ctx.lineTo(FLYER_W, FLYER_H);
      ctx.lineTo(0, FLYER_H);
      ctx.closePath();
      ctx.fill();
      const stripe = (offset: number, thick: number, colour: string) => {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(0, top + drop + offset);
        ctx.lineTo(FLYER_W, top + offset);
        ctx.lineTo(FLYER_W, top + offset + thick);
        ctx.lineTo(0, top + drop + offset + thick);
        ctx.closePath();
        ctx.fill();
      };
      stripe(-4, 14, GOLD);
      stripe(22, 6, BRAND_LIGHT);

      // A soft shade behind the white logo, which vanishes on a bright sky.
      scrim(ctx, 0, 0, FLYER_W, 240, "rgba(10,14,40,0.5)", "rgba(10,14,40,0)");
      logo(ctx, f, 80, 60, 200, "#ffffff");

      // The book across the diagonal, on the right.
      bookCover(ctx, f, FLYER_W - 290, top - 210, 320, 6);

      spaced(ctx, f.clubName, 80, top + drop + 100, GOLD_LIGHT, 22, 5);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      const size = fitSize(ctx, f.title, (s) => `700 ${s}px ${DISPLAY}`, FLYER_W - 160, 76, 50, 2);
      const y = wrap(ctx, f.title, 80, top + drop + 100 + size * 1.2, FLYER_W - 160, size * 1.08, 2);
      if (f.bookTitle) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `italic 500 34px ${DISPLAY}`;
        wrap(ctx, bookLine(f), 80, y + 4, FLYER_W - 160, 42, 1);
      }

      // Date tile, gold.
      const tx = 80;
      const ty = FLYER_H - 190;
      ctx.fillStyle = GOLD_LIGHT;
      roundRectPath(ctx, tx, ty, 130, 130, 18);
      ctx.fill();
      ctx.fillStyle = BRAND_DEEP;
      ctx.textAlign = "center";
      ctx.font = `700 62px ${DISPLAY}`;
      ctx.fillText(f.date.day, tx + 65, ty + 70);
      spaced(ctx, f.date.month, tx + 65, ty + 106, BRAND_DEEP, 20, 3, "center");

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 32px ${BODY}`;
      ctx.fillText(`${f.date.weekday}, ${f.date.time}`, tx + 164, ty + 42);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `400 28px ${BODY}`;
      const rest = [f.location, f.presenter ? `with ${f.presenter}` : ""].filter(Boolean);
      wrap(ctx, rest.join("  ·  "), tx + 164, ty + 88, FLYER_W - tx - 164 - 80, 36, 2);
      if (f.sponsor || f.sponsorName) sponsorCorner(ctx, f, FLYER_W - 80, 150, true);
    },
  },
];

export function templateById(id: string): FlyerTemplate {
  return FLYER_TEMPLATES.find((t) => t.id === id) ?? FLYER_TEMPLATES[0];
}
