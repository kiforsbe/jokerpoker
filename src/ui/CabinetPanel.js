// Authentic RAY/PAF Jokeripokeri cabinet button panel as a DOM overlay below the CRT.
// Color-coded, trilingual (Swedish / Finnish / English) buttons.
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
      #cabinet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
        display: flex; flex-direction: column; gap: 6px; align-items: center;
        padding: 10px; background: #111; font-family: monospace; user-select: none; }
      #cabinet .row { display: flex; gap: 8px; justify-content: center; }
      #cabinet button { width: 92px; height: 62px; border: none; border-radius: 8px;
        font-size: 10px; line-height: 1.25; font-weight: bold; white-space: pre;
        cursor: pointer; box-shadow: inset 0 -4px 0 rgba(0,0,0,0.35); opacity: 0.5;
        transition: opacity 0.1s, filter 0.1s; }
      #cabinet button.enabled { opacity: 1; }
      #cabinet button.enabled:hover { filter: brightness(1.15); }
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
