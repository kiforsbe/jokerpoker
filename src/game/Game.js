import { Component } from '../engine/Component.js';
import { createDeck } from './Deck.js';
import { CardComponent, createCard } from './Card.js';
import HandEvaluator from './HandEvaluator.js';
import { resolveDouble, classifyDoubleCard, canDouble } from './Tuplaus.js';
import { ROYAL_PAYOUT } from './payouts.js';
import { GameAudioComponent } from '../audio/AudioComponent.js';
import { ScreenShakeComponent } from '../rendering/ScreenShakeComponent.js';
import GameLogger from '../utils/GameLogger.js';

class GameManagerComponent extends Component {
  constructor() {
    super();
    this.credits = 100;
    this.bet = 1;
    this.maxBet = 5;
    this.win = 0;            // win meter (the "Wins" box)
    this.state = 'idle';
    this.hand = [];
    this.doubleCardObject = null;
    this.redSevenKeeps = true;
    this.attractMode = true;
    this.attractSequenceTimeout = null;
    this.idleTimeout = null;
    this.logger = new GameLogger();
    this.listeners = new Map();
    this.audioComponent = null;
    this.screenShake = null;
  }

  get jackpot() { return ROYAL_PAYOUT * this.bet; }
  get type() { return 'GameManager'; }

  onAdd() {
    super.onAdd();

    // Add audio component
    this.audioComponent = this.gameObject.addComponent(new GameAudioComponent());

    // Add screen shake component
    this.screenShake = this.gameObject.addComponent(new ScreenShakeComponent());
  }

  onStart() {
    super.onStart();

    // Create and position deck (visible face-down stack at the top-left;
    // it stays there across hands and the tuplaus card is dealt onto it).
    // Same x as the first hand slot, so both keep the same edge distance.
    const deckObject = createDeck(-1.0, 0.35);
    this.gameObject.engine.addGameObject(deckObject);
    this.deck = deckObject.getComponent('Deck');
    this.deckRender = deckObject.getComponent('Render');
  }

  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) cb(data);
    }
    if (event === 'stateChanged') this.logger.logState(this);
  }

  update(deltaTime) { super.update(deltaTime); }

  // ── State + win setters ──────────────────────────────────────────────────────

  setState(state) { this.state = state; this.emit('stateChanged', { state }); }
  setWin(win) { this.win = win; this.emit('winChanged', { win }); }

  // Hand row: card bottoms (cards are 0.532 tall, so bottom = y - 0.266)
  // rest a small gap above the bottom gray band (LAYOUT.bottomBandTopY).
  _handSlot(i) { return { x: -1.0 + i * 0.5, y: -0.5, z: 0 }; }
  // The tuplaus card is dealt face-up onto the deck's position.
  _doubleSlot() { return { x: -1.0, y: 0.35, z: 0 }; }
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Bet ──────────────────────────────────────────────────────────────────────

  cycleBet() {
    if (this.state !== 'idle' && this.state !== 'attract') return;
    this.bet = this.bet >= this.maxBet ? 1 : this.bet + 1;
    if (this.bet > this.credits) this.bet = Math.max(1, this.credits);
    this.audioComponent?.playButtonPress();
    this.emit('betChanged', { bet: this.bet });
  }

  betMax() {
    if (this.state !== 'idle' && this.state !== 'attract') return;
    this.bet = Math.min(this.maxBet, Math.max(1, this.credits));
    this.emit('betChanged', { bet: this.bet });
  }

  // ── Deal / draw entry point ──────────────────────────────────────────────────

  playDealOrDraw() {
    if (this.state === 'attract' || this.state === 'idle') this.startGame();
    else if (this.state === 'selecting') this.draw();
  }

  // ── startGame (deal) ─────────────────────────────────────────────────────────

  async startGame() {
    if (this.state !== 'idle' && this.state !== 'attract') return;
    if (this.win > 0) return;            // must collect/gamble first
    if (this.credits < this.bet) {
      this.audioComponent?.playLose();
      this.emit('error', { message: 'Not enough credits' });
      return;
    }
    this.attractMode = false;
    clearTimeout(this.attractSequenceTimeout);
    clearTimeout(this.idleTimeout);

    this.credits -= this.bet;
    this.emit('creditsChanged', { credits: this.credits });
    this.setWin(0);
    this.setState('dealing');
    this.emit('winningHand', { name: null });

    await this._clearTable();

    // The previous hand's cards are now back in the deck: shuffle the data
    // and play the visible split-and-merge animation before dealing.
    this.deck.shuffle();
    this.emit('shuffle', {});
    await this.deckRender?.playShuffle();

    this.hand = this.deck.dealHand(5);

    for (let i = 0; i < this.hand.length; i++) {
      const card = this.hand[i].getComponent('Card');
      card.faceUp = false;
      this.emit('cardDealt', { count: 1 });
      await card.dealTo(this._handSlot(i));
      await card.flip();
      if (i < this.hand.length - 1) await this._delay(80);
    }

    this.emit('handChanged', { hand: this.hand });
    this.setState('selecting');
  }

  // ── Hold + draw ──────────────────────────────────────────────────────────────

  holdCard(index) {
    if (this.state !== 'selecting') return;
    if (index < 0 || index >= this.hand.length) return;
    const card = this.hand[index].getComponent('Card');
    card.hold();
    this.audioComponent?.playButtonPress();
    this.emit('cardHeld', { index, held: card.held });
  }

  async draw() {
    if (this.state !== 'selecting') return;
    this.setState('drawing');

    const returns = [];
    for (let i = 0; i < this.hand.length; i++) {
      const card = this.hand[i].getComponent('Card');
      if (!card.held) returns.push((async () => {
        if (card.faceUp) await card.flip();
        await card.returnToDeck(this.deck.gameObject.position);
      })());
    }
    await Promise.all(returns);

    // Replacements fly out together, so one swish run covers the batch.
    const replacing = this.hand.filter(o => !o.getComponent('Card').held).length;
    if (replacing > 0) this.emit('cardDealt', { count: replacing });

    const deals = [];
    for (let i = 0; i < this.hand.length; i++) {
      const old = this.hand[i];
      const card = old.getComponent('Card');
      if (card.held) continue;
      const replacement = this.deck.dealCard();
      this.hand[i] = replacement;
      this.deck.returnCards([old]);
      deals.push((async () => {
        const rc = replacement.getComponent('Card');
        rc.faceUp = false;
        await rc.dealTo(this._handSlot(i));
        await rc.flip();
      })());
    }
    await Promise.all(deals);

    this.emit('handChanged', { hand: this.hand });
    await this._delay(150);
    this.evaluate();
  }

  // ── evaluate, collect, tuplaus ───────────────────────────────────────────────

  evaluate() {
    const cards = this.hand.map(c => c.getComponent('Card'));
    const result = HandEvaluator.evaluate(cards);

    if (result.payout > 0) {
      this.setWin(result.payout * this.bet);
      this.emit('win', { result, winnings: this.win });
      this.emit('winningHand', { name: result.name });
      const intensity = Math.min(0.3 + (result.payout / 200) * 0.7, 1.0);
      this.screenShake?.shake(intensity, 0.3 + (result.payout / 200) * 0.7);
      this.setState('won');
    } else {
      this.emit('noWin', {});
      this._delay(900).then(() => this._returnToIdle());
    }
  }

  collect() {
    if (this.state !== 'won' && this.state !== 'gamble') return;
    if (this.win <= 0) return;
    const amount = this.win;
    this.credits += amount;
    this.setWin(0);
    this.emit('creditsChanged', { credits: this.credits });
    this.emit('collected', { amount });
    this._returnToIdle();
  }

  startDouble() {
    if (this.state !== 'won') return;
    if (!canDouble(this.win, this.jackpot)) return;
    this.setState('gamble');
    this.emit('doubleStarted', {});
    this.audioComponent?.playButtonPress();
  }

  async chooseDouble(guess) {
    if (this.state !== 'gamble') return;
    this.setState('gambleReveal');

    let cardObject = this.deck.dealCard();
    let card = cardObject.getComponent('Card');
    let guard = 0;
    while (card.value === 'Joker' && guard++ < 10) {
      this.deck.returnCards([cardObject]);
      this.deck.shuffle();
      cardObject = this.deck.dealCard();
      card = cardObject.getComponent('Card');
    }
    this._setDoubleCard(cardObject);
    card.faceUp = false;
    this.emit('cardDealt', { count: 1 });
    await card.dealTo(this._doubleSlot());
    await card.flip();
    this.emit('doubleCard', { value: card.value, suit: card.suit });

    const { outcome } = resolveDouble(guess, { value: card.value, suit: card.suit }, { redSevenKeeps: this.redSevenKeeps });
    await this._delay(500);

    if (outcome === 'win') {
      this.setWin(this.win * 2);
      this.emit('doubleResult', { outcome, win: this.win });
      this.setState('won');
    } else if (outcome === 'keep') {
      this.emit('doubleResult', { outcome, win: this.win });
      this.setState('won');
      this.collect();
    } else {
      this.setWin(0);
      this.screenShake?.shake(0.2, 0.4);
      this.emit('doubleResult', { outcome, win: 0 });
      await this._delay(700);
      this._returnToIdle();
    }
  }

  // ── Table / card helpers, idle / attract, init ───────────────────────────────

  _setDoubleCard(cardObject) {
    this._clearDoubleCard();
    this.doubleCardObject = cardObject;
  }

  _clearDoubleCard() {
    if (this.doubleCardObject?.engine) {
      this.deck.returnCards([this.doubleCardObject]);
    }
    this.doubleCardObject = null;
  }

  async _clearTable() {
    this._clearDoubleCard();
    await Promise.all(this.hand.map(async card => {
      if (!card.engine) return;
      const c = card.getComponent('Card');
      // Face down before flying home — the deck only ever shows backs.
      if (c.faceUp) await c.flip();
      await c.returnToDeck(this.deck.gameObject.position);
      this.deck.returnCards([card]);
    }));
    this.hand = [];
  }

  async _returnToIdle() {
    this.setState('idle');
    this.emit('handChanged', { hand: this.hand });
    clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => {
      if (this.state === 'idle' && this.win === 0) {
        this.attractMode = true;
        this.startAttractMode();
      }
    }, 30000);
  }

  setInitialState() {
    this.setState('idle');
    this.emit('creditsChanged', { credits: this.credits });
    this.emit('betChanged', { bet: this.bet });
    this.setWin(0);
    setTimeout(() => { if (this.attractMode) this.startAttractMode(); }, 200);
  }

  startAttractMode() {
    if (!this.attractMode) return;
    this.setState('attract');
    this.logger.log('STATE', 'Starting attract mode');

    if (this.attractSequenceTimeout) {
      clearTimeout(this.attractSequenceTimeout);
    }

    const demoHands = [
      {
        cards: [
          { suit: 'Hearts', value: 'A' },
          { suit: 'Hearts', value: 'K' },
          { suit: 'Hearts', value: 'Q' },
          { suit: 'Hearts', value: 'J' },
          { suit: 'Hearts', value: '10' }
        ],
        name: "Royal Flush"
      },
      {
        cards: [
          { suit: 'Spades', value: '9' },
          { suit: 'Spades', value: '8' },
          { suit: 'Spades', value: '7' },
          { suit: 'Spades', value: '6' },
          { suit: 'Spades', value: '5' }
        ],
        name: "Straight Flush"
      },
      {
        cards: [
          { suit: 'Hearts', value: 'A' },
          { suit: 'Diamonds', value: 'A' },
          { suit: 'Clubs', value: 'A' },
          { suit: 'Spades', value: 'A' },
          { suit: 'Hearts', value: 'K' }
        ],
        name: "Four of a Kind"
      }
    ];

    let currentIndex = 0;

    const showNextHand = () => {
      if (!this.attractMode) return;

      // Clean up previous attract hand GameObjects if they exist
      this.hand.forEach(cardObject => {
        if (cardObject && cardObject.engine) {
          cardObject.engine.removeGameObject(cardObject);
        }
      });
      this.hand = [];

      const demo = demoHands[currentIndex];

      // Create and set up cards
      this.hand = demo.cards.map((cardData, index) => {
        // Create card object with factory function
        const cardObj = createCard(cardData.suit, cardData.value);

        // Add to engine first so engine reference is set
        this.gameObject.engine.addGameObject(cardObj);

        // Position the card using _handSlot
        const slot = this._handSlot(index);
        cardObj.position.x = slot.x;
        cardObj.position.y = slot.y;
        cardObj.position.z = slot.z;

        // Set up card state
        const cardComp = cardObj.getComponent('Card');
        if (cardComp) {
          cardComp.faceUp = true;
          const renderComp = cardObj.getComponent('Render');
          if (renderComp && renderComp.flip) {
            renderComp.flip();
          }
        }

        return cardObj;
      });

      // Play attract mode sound
      if (this.audioComponent) {
        this.audioComponent.playWin();
      }

      // Update UI
      this.emit('handChanged', { hand: this.hand });
      this.emit('winningHand', { name: demo.name });

      // Schedule next hand
      currentIndex = (currentIndex + 1) % demoHands.length;
      this.attractSequenceTimeout = setTimeout(showNextHand, 3000);
    };

    // Start the sequence
    showNextHand();
  }
}

export default GameManagerComponent;
export { GameManagerComponent };
