// Authentic RAY/PAF Jokeripokeri cabinet button panel as a DOM overlay below the CRT.
// Color-coded, trilingual (Swedish / Finnish / English) buttons.
import { getUiMode, cycleUiMode, onUiModeChanged } from './uiMode.js';

const COLORS = {
  red:    { bg: '#b3231f', lit: '#ff4b44', text: '#ffffff' },
  blue:   { bg: '#1b4f9c', lit: '#3a82ff', text: '#ffffff' },
  yellow: { bg: '#d9c21d', lit: '#fff34d', text: '#222200' },
  orange: { bg: '#d2761a', lit: '#ffa53a', text: '#221000' },
  green:  { bg: '#2f8a3b', lit: '#54e06a', text: '#062000' },
};

const DEFS = [
  { id: 'hold0',  color: 'red',    label: 'HÅLL\nPIDÄ\nHOLD' },
  { id: 'hold1',  color: 'red',    label: 'HÅLL\nPIDÄ\nHOLD' },
  { id: 'hold2',  color: 'red',    label: 'HÅLL\nPIDÄ\nHOLD' },
  { id: 'hold3',  color: 'red',    label: 'HÅLL\nPIDÄ\nHOLD' },
  { id: 'hold4',  color: 'red',    label: 'HÅLL\nPIDÄ\nHOLD' },
  { id: 'play',   color: 'blue',   label: 'MAX\nPELAA\nPLAY' },
  { id: 'collect',color: 'yellow', label: 'UTBETALNING\nVOITTOJEN MAKSU\nCOLLECT' },
  { id: 'low',    color: 'orange', label: 'LÅG\nPIENI\nLOW' },
  { id: 'high',   color: 'orange', label: 'HÖG\nSUURI\nHIGH' },
  { id: 'double', color: 'orange', label: 'DUBBLA\nTUPLAUS\nDOUBLE' },
  { id: 'bet',    color: 'green',  label: 'INSATS\nPANOS\nBET' },
];

const ROW1 = ['hold0', 'hold1', 'hold2', 'hold3', 'hold4', 'play'];
const ROW2 = ['collect', 'low', 'high', 'double', 'bet'];

export class CabinetPanel {
  constructor(gameManager) {
    this.gm = gameManager;
    this.buttons = new Map();
    this._injectStyles();
    this._build();
    this._buildModeSwitch();
    this._bindKeyboard();
    gameManager.addEventListener('stateChanged', () => this._refresh());
    gameManager.addEventListener('winChanged', () => this._refresh());
    this._refresh();
  }

  _injectStyles() {
    if (document.getElementById('cabinet-styles')) return;
    const s = document.createElement('style');
    s.id = 'cabinet-styles';
    s.textContent = `
      #cabinet { flex: 0 0 auto;
        display: flex; flex-direction: column; gap: 6px; align-items: center;
        padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
        background: #111; font-family: monospace;
        user-select: none; -webkit-user-select: none;
        touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      #cabinet .row { display: flex; gap: clamp(3px, 1vw, 8px); justify-content: center; }
      /* Six buttons per row must fit a 320px phone: ~15.5vw each plus gaps,
         capped at the original desktop 92x62. Height also tracks the
         viewport height a little so short landscape phones keep some CRT. */
      #cabinet button { width: clamp(44px, 15.5vw, 92px);
        height: clamp(40px, min(12vw, 14vh), 62px);
        border: none; border-radius: 8px; padding: 0; overflow: hidden;
        font-size: clamp(6px, 1.9vw, 10px); line-height: 1.25; font-weight: bold;
        white-space: pre; cursor: pointer;
        box-shadow: inset 0 -4px 0 rgba(0,0,0,0.35); opacity: 0.5;
        transition: opacity 0.1s, filter 0.1s;
        touch-action: manipulation; }
      #cabinet button.enabled { opacity: 1; }
      #cabinet button.enabled:hover { filter: brightness(1.15); }

      /* overlay mode: same layout, floating translucently over the screen */
      #cabinet.overlay { position: fixed; left: 0; right: 0; bottom: 0;
        background: transparent; z-index: 10; }
      #cabinet.overlay button { opacity: 0.15; }
      #cabinet.overlay button.enabled { opacity: 0.4; }
      #cabinet.overlay button.enabled:hover { opacity: 0.95; }

      /* screen mode: no chrome at all */
      #cabinet.hidden { display: none; }

      /* mode switch chip, top-right corner */
      #ui-mode { position: fixed; top: 8px; right: 8px; z-index: 30;
        width: 36px; height: 30px; border: none; border-radius: 7px;
        background: rgba(140, 150, 180, 0.18); color: #9aa2bd;
        font-size: 15px; line-height: 1; cursor: pointer;
        touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
      #ui-mode:hover { background: rgba(140, 150, 180, 0.4); color: #e8e8e4; }
    `;
    document.head.appendChild(s);
  }

  _build() {
    this.root = document.createElement('div');
    this.root.id = 'cabinet';
    const row1 = document.createElement('div'); row1.className = 'row';
    const row2 = document.createElement('div'); row2.className = 'row';

    for (const def of DEFS) {
      const b = document.createElement('button');
      b.textContent = def.label;
      const c = COLORS[def.color];
      b.style.background = c.bg;
      b.style.color = c.text;
      b.dataset.litColor = c.lit;
      b.dataset.bgColor = c.bg;
      b.addEventListener('click', () => this._onClick(def.id));
      this.buttons.set(def.id, b);
    }

    ROW1.forEach(id => row1.appendChild(this.buttons.get(id)));
    ROW2.forEach(id => row2.appendChild(this.buttons.get(id)));
    this.root.append(row1, row2);
    document.body.appendChild(this.root);
  }

  // Corner chip (and F3) cycling the three UI modes: cabinet panel below
  // the screen, translucent overlay on it, or screen-only (all functions
  // then live on the playfield itself).
  _buildModeSwitch() {
    const b = document.createElement('button');
    b.id = 'ui-mode';
    b.textContent = '▤';
    b.addEventListener('click', () => cycleUiMode());
    document.body.appendChild(b);

    const apply = (mode) => {
      this.root.classList.toggle('overlay', mode === 'overlay');
      this.root.classList.toggle('hidden', mode === 'screen');
      b.title = `UI mode: ${mode} (click or F3 to switch)`;
      // The panel entering/leaving the flow changes the space left for the
      // canvas — refit it (index.js routes resize to RenderSystem).
      window.dispatchEvent(new Event('resize'));
    };
    onUiModeChanged(apply);
    apply(getUiMode());
  }

  _onClick(id) {
    const gm = this.gm;
    if (id.startsWith('hold')) return gm.holdCard(Number(id.slice(4)));
    switch (id) {
      case 'play': return gm.playDealOrDraw();
      case 'bet': return gm.cycleBet();
      case 'collect': return gm.collect();
      case 'double': return gm.startDouble();
      case 'low': return gm.chooseDouble('small');
      case 'high': return gm.chooseDouble('large');
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'F3') { e.preventDefault(); return cycleUiMode(); }
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '5') return this.gm.holdCard(Number(k) - 1);
      if (k === 'enter' || k === ' ') { e.preventDefault(); return this.gm.playDealOrDraw(); }
      if (k === 'b') return this.gm.cycleBet();
      if (k === 'c') return this.gm.collect();
      if (k === 'd') return this.gm.startDouble();
      if (k === 's' || k === 'arrowleft') return this.gm.chooseDouble('small');
      if (k === 'l' || k === 'arrowright') return this.gm.chooseDouble('large');
    });
  }

  _setEnabled(id, on) {
    const b = this.buttons.get(id);
    if (!b) return;
    b.classList.toggle('enabled', on);
    b.style.background = on ? b.dataset.litColor : b.dataset.bgColor;
  }

  _refresh() {
    const gm = this.gm;
    const s = gm.state;
    const selecting = s === 'selecting';
    const idle = s === 'idle' || s === 'attract';
    const won = s === 'won';
    const gamble = s === 'gamble';

    for (let i = 0; i < 5; i++) this._setEnabled('hold' + i, selecting);
    this._setEnabled('play', idle || selecting);
    this._setEnabled('bet', idle);
    this._setEnabled('collect', won || gamble);
    this._setEnabled('double', won && gm.win > 0 && gm.win <= gm.jackpot / 2);
    this._setEnabled('low', gamble);
    this._setEnabled('high', gamble);
  }
}
