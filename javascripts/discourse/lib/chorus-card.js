// Chorus · Story kartları (1080×1920). Tarayıcıda canvas ile çizilir; telefonda
// paylaşım menüsü açılır (Instagram oradan seçilir), masaüstünde PNG olarak iner.

import { coverFor } from "./chorus-media";

const W = 1080;
const H = 1920;
const NIGHT = "#171716";
const PAPER = "#F3EEE4";
const ACID = "#E3FF45";
const TOMATO = "#F45139";
const COBALT = "#2948B1";
const GREY = "#8A857A";
const SANS = '"IBM Plex Sans", sans-serif';
const MONO = '"IBM Plex Mono", monospace';
const SERIF = '"Newsreader", serif';
const ART = [
  [COBALT, ACID],
  [TOMATO, NIGHT],
  ["#2C2B28", PAPER],
  [ACID, COBALT],
  [PAPER, TOMATO],
];

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`700 80px ${SANS}`),
      document.fonts.load(`600 50px ${SANS}`),
      document.fonts.load(`400 36px ${SANS}`),
      document.fonts.load(`500 40px ${MONO}`),
      document.fonts.load(`italic 400 70px ${SERIF}`),
    ]);
  } catch {
    // font yüklenemezse sistem fontu kullanılır
  }
}

function canvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return [c, c.getContext("2d")];
}

function spaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function lines(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) {
    out.push(cur);
  }
  return out;
}

function clip(ctx, text, maxW) {
  let t = String(text || "");
  if (ctx.measureText(t).width <= maxW) {
    return t;
  }
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) {
    t = t.slice(0, -1);
  }
  return `${t.trim()}…`;
}

function art(ctx, x, y, s, i) {
  const [bg, dot] = ART[i % ART.length];
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, s, s);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, s, s);
  ctx.clip();
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.arc(x + s * (0.45 + 0.1 * (i % 3)), y + s * (0.35 + 0.08 * (i % 2)), s * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      return resolve(null);
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Kapak: gerçek albüm ya da video görseli; yoksa Chorus renkli yer tutucu
async function cover(ctx, item, x, y, size, i) {
  const c = await coverFor(item);
  const img = c && (await loadImage(c.src));
  if (!img) {
    art(ctx, x, y, size, i);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  if (c.crop) {
    ctx.drawImage(img, c.crop.x, c.crop.y, c.crop.s, c.crop.s, x, y, size, size);
  } else {
    ctx.drawImage(img, x, y, size, size);
  }
  ctx.restore();
}

// Alttaki boşluk Instagram bağlantı çıkartması için bırakılır; görselin üstüne yazı basılmaz.
function footer(ctx, url, color) {
  ctx.fillStyle = color;
  ctx.font = `400 30px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(url || "", W / 2, H - 110);
  ctx.textAlign = "left";
}

// Beşli ve liste kartı: kapaklı beş satır
export async function listCard({ kicker = "BENİ BEŞ ŞARKIYLA TANI", name, items, url, logo, cta = "Sen altıncıya ne eklerdin?" }) {
  await fontsReady();
  const [c, ctx] = canvas();
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ACID;
  ctx.font = `500 30px ${MONO}`;
  spaced(ctx, kicker, 80, 190, 4);
  const img = await loadImage(logo);
  if (img) {
    ctx.drawImage(img, W - 80 - 88, 132, 88, 88);
  }

  ctx.fillStyle = PAPER;
  ctx.font = `700 104px ${SANS}`;
  const nameLines = lines(ctx, name, W - 160).slice(0, 2);
  nameLines.forEach((l, i) => ctx.fillText(l, 80, 330 + i * 108));

  const list = (items || []).slice(0, 5);
  const covers = list.map((it, i) => ({ it, i }));
  let y = 330 + nameLines.length * 108 - 20;
  const row = 196;
  await Promise.all(covers.map(({ it, i }) => cover(ctx, it, 160, y + i * row, 160, i)));
  list.forEach((it, i) => {
    const top = y + i * row;
    ctx.fillStyle = GREY;
    ctx.font = `500 32px ${MONO}`;
    ctx.fillText(`0${i + 1}`, 80, top + 92);
    ctx.fillStyle = PAPER;
    ctx.font = `600 48px ${SANS}`;
    ctx.fillText(clip(ctx, it.title, W - 440), 360, top + 56);
    ctx.fillStyle = "#B7B1A3";
    ctx.font = `400 34px ${SANS}`;
    ctx.fillText(clip(ctx, it.artist, W - 440), 360, top + 104);
    if (it.note) {
      ctx.fillStyle = GREY;
      ctx.font = `italic 400 34px ${SERIF}`;
      ctx.fillText(clip(ctx, it.note, W - 440), 360, top + 148);
    }
  });
  y += list.length * row + 40;

  ctx.fillStyle = PAPER;
  ctx.font = `italic 400 70px ${SERIF}`;
  lines(ctx, cta, W - 160)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, 80, y + 60 + i * 78));

  footer(ctx, url, "#8A857A");
  return c;
}

export function besliCard(opts) {
  return listCard(opts);
}

// Tam burada: bir an
export async function anCard({ time, note, track, name, media }) {
  await fontsReady();
  const [c, ctx] = canvas();
  ctx.fillStyle = ACID;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = NIGHT;

  ctx.font = `500 30px ${MONO}`;
  spaced(ctx, "TAM BURADA", 80, 200, 4);
  ctx.textAlign = "right";
  ctx.fillText("chorus", W - 80, 200);
  ctx.textAlign = "left";

  if (media) {
    await cover(ctx, media, 80, 270, 150, 1);
  } else {
    ctx.fillRect(80, 270, 150, 150);
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(155, 345, 48, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = NIGHT;
  ctx.font = `700 52px ${SANS}`;
  const t = lines(ctx, track, W - 360).slice(0, 2);
  t.forEach((l, i) => ctx.fillText(l, 270, 330 + i * 62));

  ctx.font = `500 290px ${MONO}`;
  ctx.fillText(time, 64, 760);

  // dalga ve oynatma çizgisi
  const n = 48;
  const bw = (W - 160) / n;
  for (let i = 0; i < n; i++) {
    const h = 30 + 110 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21));
    ctx.fillStyle = i < 30 ? NIGHT : "rgba(23,23,22,0.35)";
    ctx.fillRect(80 + i * bw + 2, 900 - h / 2, bw - 5, h);
  }
  ctx.fillStyle = TOMATO;
  ctx.fillRect(80 + 30 * bw - 2, 800, 8, 200);

  ctx.fillStyle = NIGHT;
  ctx.font = `italic 400 84px ${SERIF}`;
  const q = lines(ctx, `“${note}”`, W - 160).slice(0, 5);
  q.forEach((l, i) => ctx.fillText(l, 80, 1140 + i * 100));

  ctx.font = `600 44px ${SANS}`;
  ctx.fillText("Sen de duyuyor musun?", 80, 1180 + q.length * 100);

  ctx.fillRect(80, H - 150, W - 160, 4);
  ctx.font = `600 40px ${SANS}`;
  ctx.fillText(name || "", 80, H - 90);
  return c;
}

export async function shareCanvas(c, filename, title) {
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch {
      // paylaşım iptal edildiyse indirmeye düş
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Kartı önizlemeyle aç: telefonda "Paylaş" (Instagram paylaşım menüsünde), masaüstünde
// "Görseli indir" ve "Bağlantıyı kopyala". Story'yi telefondan atmak için kısa bir yönlendirme de var.
export async function openCardDialog(c, { filename, title, link }) {
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], filename, { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const phone = canShare && window.matchMedia("(pointer: coarse)").matches;

  document.querySelector(".chorus-card-dialog")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "chorus-card-dialog";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Story kartı");
  wrap.innerHTML = `
    <div class="chorus-card-dialog__panel">
      <button type="button" class="chorus-card-dialog__close" aria-label="Kapat">×</button>
      <img class="chorus-card-dialog__img" alt="Story kartı önizlemesi">
      <div class="chorus-card-dialog__side">
        <div class="chorus-card-dialog__label">STORY KARTI</div>
        <h3>${phone ? "Paylaşmaya hazır" : "Kartın hazır"}</h3>
        <p>${
          phone
            ? "Paylaş'a dokun, açılan menüden Instagram'ı ve Story'yi seç. Bağlantı çıkartmasını kartın altındaki boşluğa koy."
            : "Story'ler telefondan atılıyor. Görseli indirip telefonuna gönder ya da bu sayfayı telefonda açıp kartı oradan paylaş. Bağlantı çıkartması için aşağıdaki bağlantıyı kopyala."
        }</p>
        <div class="chorus-card-dialog__actions">
          ${phone ? '<button type="button" class="btn btn-primary" data-act="share">Paylaş</button>' : ""}
          <a class="btn ${phone ? "" : "btn-primary"}" data-act="download" download="${filename}">Görseli indir</a>
          ${link ? '<button type="button" class="btn" data-act="copy">Bağlantıyı kopyala</button>' : ""}
          ${canShare && !phone ? '<button type="button" class="btn btn-flat" data-act="share">Başka uygulamayla paylaş</button>' : ""}
        </div>
        ${link ? `<div class="chorus-card-dialog__link"></div>` : ""}
      </div>
    </div>`;
  wrap.querySelector("img").src = url;
  wrap.querySelector('[data-act="download"]').href = url;
  if (link) {
    wrap.querySelector(".chorus-card-dialog__link").textContent = link;
  }

  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);
  wrap.addEventListener("click", async (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      return close();
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "share") {
      try {
        await navigator.share({ files: [file], title });
      } catch {
        // iptal
      }
    } else if (act === "copy") {
      try {
        await navigator.clipboard.writeText(link);
        e.target.textContent = "Kopyalandı";
      } catch {
        e.target.textContent = "Kopyalanamadı";
      }
    }
  });
  document.body.appendChild(wrap);
  wrap.querySelector(".chorus-card-dialog__close").focus();
}
