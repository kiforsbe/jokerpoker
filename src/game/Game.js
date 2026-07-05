import { Component } from '../engine/Component.js';
import { createDeck } from './Deck.js';
import { CardComponent, createCard } from './Card.js';
import HandEvaluator from './HandEvaluator.js';
import { isPaying, isOneCardAway } from './nearWin.js';
import { resolveDouble, classifyDoubleCard, canDouble } from './Tuplaus.js';
import { ROYAL_PAYOUT } from './payouts.js';
import { GameAudioComponent } from '../audio/AudioComponent.js';
import { ScreenShakeComponent } from '../rendering/ScreenShakeComponent.js';
import GameLogger from '../utils/GameLogger.js';

// Draw-phase suspense reveal (see draw()): while the hand is one card from
// paying, replacements turn over in slow motion — the flip itself is
// stretched (not delayed), and each reveal that keeps the player waiting
// stretches the next one further.
const SUSPENSE_FLIP_SCALE = 3;      // first tense flip turns 3x slower
const SUSPENSE_FLIP_SCALE_STEP = 2; // each tease adds another 2x
const SUSPENSE_FLIP_SCALE_MAX = 9;
// Only tease when the chased hand would pay more than double the bet.
// Payouts are per-bet multipliers, so payout > 2 means straight or better
// (two pairs and three of a kind pay exactly 2).
const SUSPENSE_MIN_PAYOUT = 3;

class GameManagerComponent extends Component {
  constructor() {
    super();
    this.credits = 100;
    this.bet = 1;
    this.maxBet = 5;
    this.win = 0;            // win meter (the "Wins" box)
    this.state = 'idle';
    this.hand = [];
    this.doubleCards = []; // tuplaus cards on the table, oldest first
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
    // Tapping the deck doubles as the PLAY button: deal, or draw after holds.
    if (this.deckRender) this.deckRender.onClick = () => this.playDealOrDraw();
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

  // Hand row: card bottoms (cards are 0.585 tall, so bottom = y - 0.293)
  // rest a small gap above the bottom gray band (LAYOUT.bottomBandTopY).
  _handSlot(i) { return { x: -1.0 + i * 0.5, y: -0.46, z: 0 }; }
  // The tuplaus card is dealt face-up to the center of the (now cleared)
  // hand row, where the eye already rests during play.
  _doubleSlot() { return { x: 0, y: -0.46, z: 0 }; }
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

    // Swap replacements into the hand data first, then deal them one at a
    // time with the same rhythm as the opening deal (fly, flip, short gap).
    const dealt = [];
    for (let i = 0; i < this.hand.length; i++) {
      const old = this.hand[i];
      const card = old.getComponent('Card');
      if (card.held) continue;
      const replacement = this.deck.dealCard();
      this.hand[i] = replacement;
      this.deck.returnCards([old]);
      dealt.push({ slot: i, replacement });
    }

    // Suspense reveal: while the face-up cards sit one card away from a
    // paying hand, each replacement turns over in slow motion — the flip
    // starts on time but takes longer — and every tease (a reveal that
    // still doesn't pay) stretches the next flip further. The counter is
    // local to this draw, so the tempo resets to normal by itself once the
    // hand is resolved, win or lose.
    let teases = 0;
    for (let k = 0; k < dealt.length; k++) {
      const rc = dealt[k].replacement.getComponent('Card');
      rc.faceUp = false;
      this.emit('cardDealt', { count: 1 });
      await rc.dealTo(this._handSlot(dealt[k].slot));

      const visible = this.hand
        .map(o => o.getComponent('Card'))
        .filter(c => c.faceUp);
      const tense = teases > 0 || isOneCardAway(visible, SUSPENSE_MIN_PAYOUT);
      const flipScale = tense
        ? Math.min(SUSPENSE_FLIP_SCALE + teases * SUSPENSE_FLIP_SCALE_STEP,
                   SUSPENSE_FLIP_SCALE_MAX)
        : 1;

      await rc.flip(false, flipScale);
      if (tense && !isPaying(visible.concat([rc]), SUSPENSE_MIN_PAYOUT)) teases++;
      if (k < dealt.length - 1) await this._delay(80);
    }

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
    // The tuplaus stack stays on the table after collecting — it is swept
    // back into the deck (and shuffled in) when the next hand starts.
    const amount = this.win;
    this.credits += amount;
    this.setWin(0);
    this.emit('creditsChanged', { credits: this.credits });
    this.emit('collected', { amount });
    this._returnToIdle();
  }

  async startDouble() {
    if (this.state !== 'won') return;
    if (!canDouble(this.win, this.jackpot)) return;
    // Entering tuplaus clears the table: the hand (or previous double card)
    // flies back to the deck and the deck reshuffles. The first double card
    // is then dealt FACE DOWN to the center of the hand row, waiting for
    // the small/large guess to flip it.
    this.setState('gambleDeal');
    this.emit('doubleStarted', {});
    this.audioComponent?.playButtonPress();
    await this._clearTable();
    this.deck.shuffle();
    this.emit('shuffle', {});
    await this.deckRender?.playShuffle();
    await this._dealDoubleCard();
    this.setState('gamble');
  }

  // Deal the next double card face-down onto the center slot, stacked on
  // top of any earlier cards of the run (fanned a touch to the right so
  // the history stays visible). Jokers are skipped — tuplaus is played
  // with naturals only.
  async _dealDoubleCard() {
    let cardObject = this.deck.dealCard();
    let card = cardObject.getComponent('Card');
    let guard = 0;
    while (card.value === 'Joker' && guard++ < 10) {
      this.deck.returnCards([cardObject]);
      this.deck.shuffle();
      cardObject = this.deck.dealCard();
      card = cardObject.getComponent('Card');
    }
    const n = this.doubleCards.length;
    this.doubleCards.push(cardObject);
    card.faceUp = false;
    this.emit('cardDealt', { count: 1 });
    const slot = this._doubleSlot();
    await card.dealTo({ x: slot.x + 0.055 * n, y: slot.y, z: slot.z + 0.02 * (n + 1) });
    return card;
  }

  // Top card of the tuplaus stack (the one a guess applies to), if any.
  _topDoubleCard() {
    const obj = this.doubleCards[this.doubleCards.length - 1];
    return obj?.getComponent('Card') ?? null;
  }

  // Fly the whole tuplaus stack back onto the deck (face down) and return
  // the cards to the pile. Used when the run ends and by collect().
  async _retireDoubleCards() {
    const objs = this.doubleCards;
    this.doubleCards = [];
    await Promise.all(objs.map(async obj => {
      if (!obj.engine) { this.deck.returnCards([obj]); return; }
      const c = obj.getComponent('Card');
      if (c.faceUp) await c.flip();
      await c.returnToDeck(this.deck.gameObject.position);
      this.deck.returnCards([obj]);
    }));
  }

  async chooseDouble(guess) {
    if (this.state !== 'gamble') return;
    this.setState('gambleReveal');

    // The first card of a run waits face-down (startDouble dealt it);
    // afterwards the revealed cards stay on the table, and each new guess
    // deals the next card from the remaining deck on top of them.
    let card = this._topDoubleCard();
    if (!card || card.faceUp) card = await this._dealDoubleCard();
    await card.flip();
    this.emit('doubleCard', { value: card.value, suit: card.suit });

    const { outcome } = resolveDouble(guess, { value: card.value, suit: card.suit }, { redSevenKeeps: this.redSevenKeeps });
    await this._delay(500);

    if (outcome === 'win') {
      this.setWin(this.win * 2);
      this.emit('doubleResult', { outcome, win: this.win });
      // The card stays put; the run continues in 'gamble' (guess again or
      // collect). Once the win outgrows the double limit (half the
      // jackpot) there is nothing left to gamble — pay out automatically.
      if (canDouble(this.win, this.jackpot)) {
        this.setState('gamble');
      } else {
        this.setState('won');
        this.collect();
      }
    } else if (outcome === 'keep') {
      this.emit('doubleResult', { outcome, win: this.win });
      this.setState('won');
      this.collect();
    } else {
      this.setWin(0);
      this.screenShake?.shake(0.2, 0.4);
      this.emit('doubleResult', { outcome, win: 0 });
      await this._delay(700);
      // The busted stack stays on display; the next hand's _clearTable
      // sweeps it into the deck before that hand's shuffle.
      this._returnToIdle();
    }
  }

  // ── Table / card helpers, idle / attract, init ───────────────────────────────

  async _clearTable() {
    const retiring = this._retireDoubleCards();
    await Promise.all(this.hand.map(async card => {
      if (!card.engine) return;
      const c = card.getComponent('Card');
      // Face down before flying home — the deck only ever shows backs.
      if (c.faceUp) await c.flip();
      await c.returnToDeck(this.deck.gameObject.position);
      this.deck.returnCards([card]);
    }));
    await retiring;
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
    // Attract demo hands use the same table area — sweep any leftover
    // tuplaus stack home before the demo starts.
    if (this.doubleCards.length) this._retireDoubleCards();
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
