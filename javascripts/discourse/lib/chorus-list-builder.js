// Chorus · Liste oluştur
// Bağlantıyı yapıştır, şarkı adı kendiliğinden gelsin; sırala, her şarkıya tek cümle yaz.
// Sonuç her yerde aynı biçimdeki listedir: yeni konu olarak açılır ya da yazı kutusuna eklenir.
import { itemsToMarkdown, mediaFromUrl, resolveMeta } from "./chorus-media";

export const LISTELER = 10;
export const CHORUS_SECKILERI = 12;

// Chorus Seçkileri'ni ekip ve Küratörler grubu açar
export function isCurator(user) {
  return !!user && (user.staff || (user.groups || []).some((g) => g.name === "kuratorler"));
}

function esc(s) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/**
 * mode "topic": ad, giriş ve kategori sorulur; onDone({ title, body, categoryId })
 * mode "insert": yalnızca şarkılar; onDone({ markdown })
 */
export function openListBuilder({ mode = "topic", staff = false, onDone }) {
  document.querySelector(".chorus-builder")?.remove();
  const items = [];
  const wrap = document.createElement("div");
  wrap.className = "chorus-card-dialog chorus-builder";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Liste oluştur");
  wrap.innerHTML = `
    <form class="chorus-card-dialog__panel chorus-builder__panel" novalidate>
      <button type="button" class="chorus-card-dialog__close" aria-label="Kapat">×</button>
      <div class="chorus-card-dialog__label">${mode === "topic" ? "LİSTE OLUŞTUR" : "YAZIYA LİSTE EKLE"}</div>
      ${
        mode === "topic"
          ? `<label class="chorus-builder__field"><span>Listenin adı</span><input name="title" type="text" maxlength="120" placeholder="Pazar sabahı, mutfakta" required></label>
             <label class="chorus-builder__field"><span>Bu liste ne için? <small>bir iki cümle</small></span><textarea name="intro" rows="2" maxlength="480" placeholder="Kahve demlenirken açtığım, sesi kısık kalan şarkılar."></textarea></label>
             <label class="chorus-builder__field"><span>Tüm liste bir yerde varsa <small>isteğe bağlı · Spotify ya da YouTube çalma listesi</small></span><input name="source" type="url" placeholder="https://open.spotify.com/playlist/..."></label>
             <label class="chorus-builder__check"><input name="ortak" type="checkbox"> Ortak liste: herkes şarkı ekleyebilsin</label>
             ${
               staff
                 ? `<label class="chorus-builder__check"><input name="curated" type="checkbox"> Chorus seçkisi olarak yayımla</label>`
                 : ""
             }
             <p class="chorus-builder__ipucu">Kendi kapağını kullanmak istersen yazı kutusuna bir görsel ekle; eklemezsen ilk dört şarkının kapağından kolaj olur.</p>`
          : ""
      }
      <div class="chorus-builder__add">
        <label class="chorus-builder__field"><span>Şarkı ekle <small>Spotify ya da YouTube bağlantısını yapıştır</small></span>
          <div class="chorus-builder__addrow"><input name="link" type="url" placeholder="https://open.spotify.com/track/..." autocomplete="off"><button type="button" class="btn btn-primary" data-b="add">Ekle</button></div>
        </label>
        <p class="chorus-builder__msg" aria-live="polite"></p>
      </div>
      <ol class="chorus-builder__items"></ol>
      <div class="chorus-builder__foot">
        <span class="chorus-builder__count">0 şarkı</span>
        <button type="submit" class="btn btn-primary">${mode === "topic" ? "Yazı kutusuna aktar" : "Yazıya ekle"}</button>
      </div>
    </form>`;

  const form = wrap.querySelector("form");
  const list = wrap.querySelector(".chorus-builder__items");
  const msg = wrap.querySelector(".chorus-builder__msg");
  const link = form.elements.link;

  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();

  function draw() {
    list.innerHTML = items
      .map(
        (it, i) => `<li data-i="${i}">
          <span class="chorus-builder__no">${String(i + 1).padStart(2, "0")}</span>
          <div class="chorus-builder__cells">
            <input data-k="artist" value="${esc(it.artist)}" placeholder="Sanatçı" aria-label="Sanatçı">
            <input data-k="title" value="${esc(it.title)}" placeholder="Şarkı" aria-label="Şarkı">
            <input data-k="note" value="${esc(it.note)}" placeholder="Not (isteğe bağlı): neden bu şarkı?" aria-label="Not (isteğe bağlı)" class="chorus-builder__note">
            <small>${it.kind === "spotify" ? "Spotify" : "YouTube"} · ${esc(it.type)}</small>
          </div>
          <div class="chorus-builder__move">
            <button type="button" data-b="up" aria-label="Yukarı" ${i === 0 ? "disabled" : ""}>↑</button>
            <button type="button" data-b="down" aria-label="Aşağı" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
            <button type="button" data-b="del" aria-label="Çıkar">×</button>
          </div>
        </li>`
      )
      .join("");
    wrap.querySelector(".chorus-builder__count").textContent = `${items.length} şarkı`;
  }

  async function add() {
    const urls = String(link.value || "").split(/\s+/).filter(Boolean);
    if (!urls.length) {
      return;
    }
    msg.textContent = "Bağlantıya bakılıyor…";
    let added = 0;
    for (const u of urls) {
      const media = mediaFromUrl(u);
      if (!media) {
        msg.textContent = "Bu bağlantıyı tanıyamadım. Spotify ya da YouTube bağlantısı olmalı.";
        continue;
      }
      const meta = await resolveMeta(media);
      items.push({ ...media, artist: meta.artist, title: meta.title, note: "" });
      added++;
    }
    link.value = "";
    draw();
    if (added) {
      const last = list.lastElementChild;
      const empty = last?.querySelector('input[data-k="artist"]:placeholder-shown') || last?.querySelector('input[data-k="note"]');
      msg.textContent = items[items.length - 1].artist ? "Eklendi. İstersen bir cümle not ekle." : "Eklendi. Spotify sanatçı adını vermiyor; sen yaz.";
      empty?.focus();
    }
  }

  list.addEventListener("input", (e) => {
    const li = e.target.closest("li");
    const k = e.target.dataset.k;
    if (li && k) {
      items[Number(li.dataset.i)][k] = e.target.value;
    }
  });
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      return close();
    }
    const b = e.target.closest("[data-b]")?.dataset.b;
    const i = Number(e.target.closest("li")?.dataset.i);
    if (b === "add") {
      add();
    } else if (b === "up" && i > 0) {
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
      draw();
    } else if (b === "down" && i < items.length - 1) {
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
      draw();
    } else if (b === "del") {
      items.splice(i, 1);
      draw();
    }
  });
  link.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  });
  link.addEventListener("paste", () => setTimeout(add, 50));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const missing = items.findIndex((it) => !String(it.artist).trim() || !String(it.title).trim());
    if (mode === "topic" && !form.elements.title.value.trim()) {
      msg.textContent = "Listeye bir ad ver.";
      form.elements.title.focus();
      return;
    }
    if (!items.length) {
      msg.textContent = "En az bir şarkı ekle.";
      link.focus();
      return;
    }
    if (missing > -1) {
      msg.textContent = `${missing + 1}. şarkıda sanatçı ya da şarkı adı eksik.`;
      list.children[missing]?.querySelector("input")?.focus();
      return;
    }
    const lines = itemsToMarkdown(items);
    if (mode === "insert") {
      close();
      onDone?.({ markdown: `\n${lines}\n` });
      return;
    }
    const intro = form.elements.intro.value.trim();
    const source = mediaFromUrl(form.elements.source.value)?.url || "";
    const ortak = !!form.elements.ortak?.checked;
    const curated = !!form.elements.curated?.checked;
    const body = [
      intro && `**${curated ? "Bu seçki" : "Bu liste"} ne için?** ${intro}`,
      lines,
      source && `Tüm liste bir arada:\n\n${source}`,
      ortak ? "Bu ortak bir liste: sen de ekle. Konunun başındaki **+ Şarkı ekle** düğmesine bas, yanına neden burada olduğunu tek cümleyle yaz." : "Sen bu listeye ne eklerdin?",
    ]
      .filter(Boolean)
      .join("\n\n");
    close();
    onDone?.({
      title: form.elements.title.value.trim(),
      body,
      categoryId: curated ? CHORUS_SECKILERI : LISTELER,
      tags: ortak ? ["ortak-liste"] : [],
    });
  });

  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  (form.elements.title || link).focus();
}
