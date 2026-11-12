import { tracked } from "@glimmer/tracking";

// Chorus · Dinle'deki "Kepenk Radyosu" sekmesi
// Sekme sohbet çekmecesini açmak yerine Dinle'nin içinde radyoyu gösterir (son şarkılar, çal, sohbete gir).
// Oda girişi (chorus-odalar) sekmeyi işaretler, raf (chorus-yollar) radyoyu çizer; ikisi bu durumu paylaşır.
class RadyoGorunumu {
  @tracked acik = false;
}

export const radyoGorunumu = new RadyoGorunumu();
