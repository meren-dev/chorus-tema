// Chorus · beşli kuralı
// Herkesin tek bir beşlisi var: Beşliler kategorisinde açtığı ilk konu. Profil, karşılama şeridi
// ve "önce beşlin" kapısı beşliyi buradan bulur. Öne çıkan konu alanı beşliden bağımsızdır.
import { ajax } from "discourse/lib/ajax";

export const BESLILER = 9;
const cache = new Map();
// kategori tanıtım konusu ("Beşliler kategorisi hakkında") beşli sayılmaz
const ABOUT = /(kategorisi hakkında|^About the .+ category)$/i;

export function besliTemplate(site) {
  return (site?.categories || []).find((c) => c.id === BESLILER)?.topic_template || "";
}

// Kullanıcının beşlisi: { id, slug, title } ya da null
export function findBesli(username) {
  const key = String(username || "").toLowerCase();
  if (!key) {
    return Promise.resolve(null);
  }
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        const found = [];
        for (let page = 0; page < 5; page++) {
          const r = await ajax(`/topics/created-by/${encodeURIComponent(username)}.json${page ? `?page=${page}` : ""}`);
          const topics = r.topic_list?.topics || [];
          found.push(...topics.filter((t) => t.category_id === BESLILER && !ABOUT.test(t.title || "")));
          if (!r.topic_list?.more_topics_url || !topics.length) {
            break;
          }
        }
        if (!found.length) {
          return null;
        }
        const t = found.sort((a, b) => a.id - b.id)[0];
        return { id: t.id, slug: t.slug, title: t.title };
      })().catch(() => {
        cache.delete(key);
        return null;
      })
    );
  }
  return cache.get(key);
}

export function rememberBesli(username, topic) {
  cache.set(String(username).toLowerCase(), Promise.resolve(topic ? { id: topic.id, slug: topic.slug, title: topic.title } : null));
}

// Beşliyi kurmak için yazı kutusunu aç (şablon ve başlık hazır)
export function openBesliComposer(composer, site, user) {
  const category = (site.categories || []).find((c) => c.id === BESLILER);
  return composer.openNewTopic({
    category,
    title: `${user.name || user.username} · beşli`,
    body: besliTemplate(site),
  });
}

// Basit bilgi penceresi. actions: [{ label, primary, run }]
export function gateDialog({ label, title, text, actions }) {
  document.querySelector(".chorus-gate")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "chorus-card-dialog chorus-gate";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", title);
  wrap.innerHTML = `
    <div class="chorus-card-dialog__panel chorus-gate__panel">
      <button type="button" class="chorus-card-dialog__close" aria-label="Kapat">×</button>
      <div class="chorus-card-dialog__side">
        <div class="chorus-card-dialog__label"></div>
        <h3></h3>
        <p></p>
        <div class="chorus-card-dialog__actions"></div>
      </div>
    </div>`;
  wrap.querySelector(".chorus-card-dialog__label").textContent = label;
  wrap.querySelector("h3").textContent = title;
  wrap.querySelector("p").textContent = text;
  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  const box = wrap.querySelector(".chorus-card-dialog__actions");
  (actions || []).forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn ${a.primary ? "btn-primary" : "btn-flat"}`;
    b.textContent = a.label;
    b.addEventListener("click", () => {
      close();
      a.run?.();
    });
    box.appendChild(b);
  });
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      close();
    }
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  box.querySelector("button")?.focus();
}
