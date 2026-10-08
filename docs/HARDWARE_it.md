# Recordare Atlas — modalità di rendering e hardware minimo

Copia italiana di `HARDWARE.md` (il riferimento è la versione inglese).

> **Stime, non misure.** La griglia è ragionata dal costo del renderer e dalla classe delle GPU; non è ancora stato fatto
> nessun benchmark. Sostituire ogni cella con valori misurati (FPS, temperatura GPU dopo 1 h) man mano che i dispositivi
> vengono provati — vedi `docs/TODO.md`.

## Modalità

| | **Completa** (predefinita, implementata) | **Leggera** (`?mode=light`, pianificata — `docs/TODO.md`) |
|---|---|---|
| Pixel ratio | `min(devicePixelRatio, 2)` | 1 |
| Antialias | MSAA | disattivato |
| Bloom | `UnrealBloomPass`, piena risoluzione | mezza risoluzione (o disattivato con `&bloom=off`) |
| Frame rate | senza limite (refresh del display) | limitato a 30 fps |
| A riposo | continua a disegnare | pianificato: rendering su richiesta (entrambe le modalità) |
| Cosa mostra | ogni evento reale | lo stesso — cambia solo il costo del disegno |

Entrambe le modalità richiedono **WebGL 2** (three.js ≥ r163 non ha più il renderer WebGL 1) e un Chromium / Firefox /
Safari recente.

## Griglia hardware

✅ fluido · ⚠️ funziona, con cali quando il cervello è molto attivo o ad alta risoluzione · ❌ sconsigliato

| Hardware (GPU) | Completa @ 1080p | Completa @ 2K–4K | Leggera @ 1080p / nativa | Note |
|---|---|---|---|---|
| Mini PC x86, Intel N100 / N150 (UHD, 24 EU) o superiore | ✅ | ⚠️ | ✅ | Consigliato per un pannello a parete: Linux + Chromium kiosk |
| Raspberry Pi 5 (VideoCore VII) | ⚠️ | ❌ | ✅ | Tenere il display a 1080p o meno |
| Rockchip RK3588 (Mali-G610 MP4) | ✅ | ⚠️ | ✅ | Android o Linux (Panthor) |
| Rockchip RK3576 (Mali-G52 MC3) | ⚠️ | ❌ | ✅ | Tipici tablet 2K: usare la modalità leggera |
| Tablet entry — RK3566, Helio serie G, Allwinner (Mali-G52 MC2 o meno) | ❌ | ❌ | ⚠️ | Modalità leggera con `&bloom=off` |
| Desktop / portatile con GPU dedicata o integrata recente | ✅ | ✅ | ✅ | |

**Hardware minimo per modalità (stima):**

- **Completa:** iGPU classe Intel N100 o GPU classe Mali-G610, display a 1080p.
- **Leggera:** GPU classe Mali-G52 MC3 (RK3576), qualsiasi risoluzione (pixel ratio 1).
- **Sotto questa soglia:** modalità leggera senza bloom, senza garanzie.

## Pannelli sempre accesi

- IPS piuttosto che OLED: il cervello ha sfondo scuro e forma fissa, che su OLED si stampa nello schermo.
- Tablet sempre in carica: usare un limite di carica / modalità bypass o far ciclare il caricatore (es. una presa smart),
  altrimenti la batteria si gonfia.
- Il pannello esegue solo il browser; il server dell'atlas (che tiene la chiave admin) può girare altrove in LAN.
  L'ascolto in LAN è opt-in e il server non ha un'autenticazione propria — tenerlo su una rete fidata o dietro la propria.
