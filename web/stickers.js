// Line-art stickers that print cleanly in 1-bit. Insert into text as :name:.
const line = (w = 8) => `fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const S = line();
const face = `<circle cx="50" cy="50" r="42" ${S}/>`;
const eyes = '<circle cx="36" cy="40" r="6"/><circle cx="64" cy="40" r="6"/>';

export const STICKERS = {
  smile: `${face}${eyes}<path d="M30 60 Q50 80 70 60" ${S}/>`,
  wink: `${face}<circle cx="36" cy="40" r="6"/><path d="M58 40 H70 M30 60 Q50 80 70 60" ${S}/>`,
  sad: `${face}${eyes}<path d="M32 72 Q50 56 68 72" ${S}/>`,
  heart: '<path d="M50 88 C10 60 4 32 26 18 C38 11 50 20 50 30 C50 20 62 11 74 18 C96 32 90 60 50 88Z"/>',
  star: '<polygon points="50,6 61,37 94,38 68,58 77,91 50,72 23,91 32,58 6,38 39,37"/>',
  sun: `<circle cx="50" cy="50" r="18"/><path d="M50 6 V18 M50 82 V94 M6 50 H18 M82 50 H94 M19 19 L27 27 M73 73 L81 81 M81 19 L73 27 M27 73 L19 81" ${S}/>`,
  snow: `<path d="M50 8 V92 M14 29 L86 71 M86 29 L14 71 M40 14 L50 24 L60 14 M40 86 L50 76 L60 86" ${S}/>`,
  warning: `<path d="M50 10 L92 86 H8 Z" ${S}/><path d="M50 38 V60" ${S}/><circle cx="50" cy="73" r="5"/>`,
  check: `<path d="M14 52 L40 78 L88 22" ${line(12)}/>`,
  cross: `<path d="M20 20 L80 80 M80 20 L20 80" ${line(12)}/>`,
  arrow: `<path d="M10 50 H82 M58 24 L86 50 L58 76" ${line(10)}/>`,
  coffee: `<path d="M16 36 H70 V60 Q70 86 43 86 Q16 86 16 60 Z M70 44 Q90 44 90 57 Q90 70 70 68 M32 24 Q26 15 34 8 M52 24 Q46 15 54 8" ${S}/>`,
  cat: `<path d="M16 44 L20 10 L40 28 Q50 25 60 28 L80 10 L84 44 Q90 88 50 90 Q10 88 16 44 Z" ${S}/><circle cx="36" cy="52" r="6"/><circle cx="64" cy="52" r="6"/><path d="M45 66 H55 L50 72 Z M8 62 L32 66 M8 76 L32 70 M92 62 L68 66 M92 76 L68 70" ${line(5)}/>`,
  flower: `<circle cx="50" cy="22" r="16" ${S}/><circle cx="77" cy="42" r="16" ${S}/><circle cx="67" cy="74" r="16" ${S}/><circle cx="33" cy="74" r="16" ${S}/><circle cx="23" cy="42" r="16" ${S}/><circle cx="50" cy="50" r="12"/>`,
  note: `<path d="M38 78 V20 L80 10 V66" ${S}/><ellipse cx="28" cy="78" rx="13" ry="10"/><ellipse cx="70" cy="68" rx="13" ry="10"/>`,
};

export const svgFor = (name) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${STICKERS[name]}</svg>`;

// name -> loaded <img>, for drawing onto canvases
export async function loadStickers() {
  const entries = await Promise.all(
    Object.keys(STICKERS).map(
      (name) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve([name, img]);
          img.onerror = () => resolve(null);
          img.src = `data:image/svg+xml,${encodeURIComponent(svgFor(name))}`;
        })
    )
  );
  return new Map(entries.filter(Boolean));
}
