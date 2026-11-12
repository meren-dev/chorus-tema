// Chorus · + Yaz
// Header'daki "+ Yaz" (ve Takıl'ın eylemi) tek bir soru sorar: Ne yapmak istiyorsun?
// Her seçenek doğru bölüme ve doğru araca gider; kimsenin kategorileri bilmesi gerekmez.
// Beşli kapısı ve liste/soru oluşturucular yazı kutusu açılırken devreye girer (chorus-katilim),
// burada yalnızca yeri seçeriz.
import { findBesli, openBesliComposer } from "./chorus-besli";
import { CHORUS_SECKILERI, isCurator, LISTELER } from "./chorus-list-builder";
import { el } from "./chorus-oyun";
import { openRadyoForm } from "./chorus-radyo-kuyruk";

const SIMDI_CALIYOR = 6;
const ACIK_MASALAR = 7;
const YAPIM_ASAMASINDA = 8;
const ONERI_KUTUSU = 2;

const SECENEKLER = [
  { key: "sarki", ad: "Bir şarkı paylaş", alt: "Bu aralar ne dinliyorsun? Şarkı, neden o, seni yakalayan an.", kat: SIMDI_CALIYOR },
  { key: "liste", ad: "Liste yap", alt: "Bağlantıları yapıştır, sırala; istersen her şarkıya bir cümle.", kat: LISTELER },
  { key: "soru", ad: "Bir soru aç", alt: "Cevabı birikecek sorular: fikrini söyle, başkasınınkini dinle.", kat: ACIK_MASALAR },
  { key: "yapim", ad: "Kendi müziğini paylaş", alt: "Demo, yarım iş, ilk kayıt. Nazik ve dürüst geri bildirim al.", kat: YAPIM_ASAMASINDA },
  { key: "oneri", ad: "Siteyle ilgili bir şey", alt: "Bozuk, eksik ya da aklına takılan ne varsa. Kepenk okur.", kat: ONERI_KUTUSU, sessiz: true },
];

// Kapı kimin için kapalı: ekip dışındakiler (ekip, tarayıcıda chorus-gate-test=1 ile dener)
function kapiAcik(user) {
  if (!user) {
    return false;
  }
  try {
    return !user.staff || localStorage.getItem("chorus-gate-test") === "1";
  } catch {
    return !user.staff;
  }
}

function kat(site, id) {
  return (site?.categories || []).find((c) => c.id === id) || null;
}

function secenekDugmesi({ ad, alt, sinif = "" }, tikla) {
  const b = el("button", `chorus-yaz__secenek${sinif}`);
  b.type = "button";
  b.append(el("strong", null, ad), el("span", null, alt));
  b.addEventListener("click", tikla);
  return b;
}

/**
 * "Ne yapmak istiyorsun?" penceresi.
 * composer: service:composer · site: service:site · user: currentUser
 * gununSorusu: Günün Sorusu kategorisi (tema ayarı; initializer verir)
 */
export function openYazPicker({ composer, site, user, gununSorusu = 19 } = {}) {
  if (!user || !composer) {
    window.location.href = "/login";
    return;
  }
  document.querySelector(".chorus-yaz-dialog")?.remove();
  const wrap = el("div", "chorus-card-dialog chorus-yaz-dialog");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Ne yapmak istiyorsun?");
  const panel = el("div", "chorus-card-dialog__panel chorus-builder__panel chorus-yaz__panel");
  const kapat = el("button", "chorus-card-dialog__close", "×");
  kapat.type = "button";
  kapat.setAttribute("aria-label", "Kapat");
  const bas = el("div", "chorus-yaz__bas");
  bas.append(el("div", "chorus-card-dialog__label", "+ YAZ"), el("h3", null, "Ne yapmak istiyorsun?"));
  const kapiNotu = el("div", "chorus-yaz__kapi");
  kapiNotu.hidden = true;
  const liste = el("div", "chorus-yaz__liste");
  const ekip = el("div", "chorus-yaz__liste chorus-yaz__liste--ekip");
  panel.append(kapat, bas, kapiNotu, liste, ekip);
  wrap.appendChild(panel);

  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  const yeniKonu = (id) => {
    close();
    composer.openNewTopic({ category: kat(site, id) });
  };

  SECENEKLER.forEach((s) => {
    liste.appendChild(secenekDugmesi({ ...s, sinif: s.sessiz ? " is-sessiz" : "" }, () => yeniKonu(s.kat)));
  });

  // Ekip ve küratörler için: radyo kuyruğu, seçki, günün sorusu
  const ekipSecenekleri = [];
  if (user.staff) {
    ekipSecenekleri.push({ ad: "Radyoya şarkı ekle", alt: "Kepenk Radyosu'nun kuyruğuna. Biçimi form yazar.", run: () => (close(), openRadyoForm({ composer })) });
  }
  if (isCurator(user)) {
    ekipSecenekleri.push({ ad: "Chorus seçkisi", alt: "Haftanın seçkisi: liste oluşturucu, seçki olarak.", run: () => yeniKonu(CHORUS_SECKILERI) });
    const soru = Number(gununSorusu) || 19;
    if (kat(site, soru)) {
      ekipSecenekleri.push({ ad: "Günün Sorusu", alt: "Soru penceresi; istersen yayın saatini seç.", run: () => yeniKonu(soru) });
    }
  }
  if (ekipSecenekleri.length) {
    ekip.appendChild(el("div", "chorus-yaz__ekip-baslik", "EKİP"));
    ekipSecenekleri.forEach((s) => ekip.appendChild(secenekDugmesi(s, s.run)));
  } else {
    ekip.remove();
  }

  // Beşlisi olmayan için ilk adım: burada yazdığın ilk şey beşlin olur
  if (kapiAcik(user)) {
    findBesli(user.username).then((b) => {
      if (b || !wrap.isConnected) {
        return;
      }
      kapiNotu.hidden = false;
      kapiNotu.replaceChildren(
        el("p", null, "Burada yazdığın ilk şey beşlin olur: seni anlatan beş şarkı, her birine tek cümle. Sonra hepsi açık."),
        secenekDugmesi({ ad: "Beşlini kur", alt: "Beş şarkı seç; altıncıyı başkaları önersin.", sinif: " is-ilk" }, () => {
          close();
          openBesliComposer(composer, site, user);
        })
      );
    });
  }

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest(".chorus-card-dialog__close")) {
      close();
    }
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  liste.querySelector("button")?.focus();
}
