# Recordare Atlas — TODO

Copia italiana di `TODO.md` (il riferimento è la versione inglese).

## Modalità leggera (GPU deboli, pannelli a parete)

**Perché.** L'atlas è pensato per girare tutto il giorno su pannelli a parete e tablet (screen-saver, kiosk). Oggi il
renderer paga sempre il costo pieno (`src/brain.ts`): antialias MSAA, pixel ratio fino a 2, `UnrealBloomPass` a piena
risoluzione e un ciclo `requestAnimationFrame` senza limiti che continua a disegnare anche quando il servizio è fermo.
Su GPU mobili deboli (es. Mali-G52 dei tablet RK3576 / RK3566) con schermi ad alta densità questo significa pochi FPS,
calore e usura della batteria.

**Cosa.** Una modalità di rendering, scelta dall'URL (`?mode=light`), che cambia solo quanto costa disegnare — mai cosa
viene mostrato:

- [ ] Pixel ratio 1 (invece di `min(devicePixelRatio, 2)`); dimensione dei punti luminosi coerente.
- [ ] Niente MSAA (`antialias: false`).
- [ ] Bloom a mezza risoluzione (opzione: `?mode=light&bloom=off` per toglierlo del tutto).
- [ ] Limite a 30 fps.
- [ ] Rendering su richiesta quando è tutto fermo: nessun impulso in viaggio, camera ferma, nessuna transizione → niente
      frame fino al prossimo evento o tocco (utile anche in modalità completa — quando il servizio tace, il cervello è fermo).
- [ ] Stessi eventi, stessi percorsi, stessi tempi della modalità completa: la modalità leggera non scarta, non unisce e
      non ritarda impulsi (solo eventi reali).
- [ ] Modalità indicata nella UI (piccolo badge), così un pannello lento non si confonde con un servizio fermo.
- [ ] Documentare il parametro in `README.md` e la griglia hardware in `docs/HARDWARE.md`.
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
