# Recordare Atlas — TODO

Copia italiana di `TODO.md` (il riferimento è la versione inglese).

## Modalità leggera (GPU deboli, pannelli a parete)

**Perché.** L'atlas è pensato per girare tutto il giorno su pannelli a parete e tablet (screen-saver, kiosk). Oggi il
renderer paga sempre il costo pieno (`src/brain.ts`): antialias MSAA, pixel ratio fino a 2, `UnrealBloomPass` a piena
risoluzione e un ciclo `requestAnimationFrame` senza limiti che continua a disegnare anche quando il servizio è fermo.
Su GPU mobili deboli (es. Mali-G52 dei tablet RK3576 / RK3566) con schermi ad alta densità questo significa pochi FPS,
calore e usura della batteria.

**Cosa.** Una modalità di rendering, scelta dall'URL (`?mode=light`), che cambia solo quanto costa disegnare — mai cosa
viene mostrato. **Implementata** (2026-10-08), tranne le misure:

- [x] Pixel ratio 1 (invece di `min(devicePixelRatio, 2)`); i punti luminosi sono dimensionati da esso, quindi restano coerenti.
- [x] Niente MSAA (`antialias: false`).
- [x] Bloom a mezza risoluzione; `bloom=off` lo toglie del tutto (in qualsiasi modalità).
- [x] Limite a 30 fps.
- [x] Rendering su richiesta a riposo (entrambe le modalità): nessun impulso in viaggio, niente in dissolvenza, camera
      ferma → nessun frame fino al prossimo evento o tocco. Con la rotazione lenta attiva la camera si muove, quindi i
      frame continuano (30 fps in modalità leggera).
- [x] Stessi eventi, stessi percorsi, stessi tempi della modalità completa: ogni movimento è temporizzato in secondi
      (ora anche la rotazione), quindi un frame rate più basso non rallenta né scarta impulsi.
- [x] Modalità indicata nella UI (badge nell'intestazione), così un pannello lento non si confonde con un servizio fermo.
- [x] Parametri nel `README.md`, griglia hardware in `docs/HARDWARE.md`.
- [ ] Misurare su dispositivi reali (FPS, temperatura GPU dopo 1 h) e sostituire le stime in `docs/HARDWARE.md`.

Possibile seguito (non ora): scegliere la modalità leggera in automatico da una breve misura del tempo di frame all'avvio.

## Idea, dopo le misure della modalità leggera: client nativo (Rust)

Solo se la modalità leggera non gira ancora bene sui dispositivi target (`docs/HARDWARE.md`). Un renderer nativo (Rust +
wgpu) disegnerebbe gli stessi pixel — bloom e riempimento costano alla GPU uguale in qualsiasi linguaggio — ma risparmia
la memoria del browser (centinaia di MB contro decine), la copia a schermo intero in più del compositore a ogni frame e
gli scatti del garbage collector. Costi: un secondo renderer e una seconda UI da tenere allineati ad `atlas-events`, il
browser resta comunque sul pannello (Home Assistant, foto), e su Android dovrebbe essere esso stesso lo screen-saver
(Dream service) invece di un URL di Fully Kiosk. Se si fa, è un prodotto separato e mirato (es. screen-saver nativo
dell'atlas per Linux ARM), non un secondo client di tutto. Tauri non aiuta: usa comunque una webview.
