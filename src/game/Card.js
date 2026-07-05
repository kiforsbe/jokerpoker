import GameObject from '../engine/GameObject.js';
import Component from '../engine/Component.js';
import CardRenderComponent from '../rendering/CardRenderComponent.js';
import { GameAudioComponent } from '../audio/AudioComponent.js';
import CardFlipAnimation from '../rendering/CardFlipAnimation.js';
import CardMovementAnimation from '../rendering/CardMovementAnimation.js';

class CardComponent extends Component {
  constructor(suit, value) {
    super();
    this.suit = suit;
    this.value = value;
    this.held = false;
    this.faceUp = false;
    // True only for cards dealt by DeckComponent.dealCard; attract-mode demo
    // cards are created directly and must never re-enter the deck's pile.
    this.fromDeck = false;
    this.flipAnimation = null;
    this.moveAnimation = null;
  }

  get type() {
    return 'Card';
  }

  onStart() {
    // Add required components if they don't exist
    if (!this.gameObject.getComponent('Render')) {
      this.gameObject.addComponent(new CardRenderComponent());
    }
    if (!this.gameObject.getComponent('Audio')) {
      this.gameObject.addComponent(new GameAudioComponent());
    }
    this.flipAnimation = this.gameObject.addComponent(new CardFlipAnimation());
    this.moveAnimation = this.gameObject.addComponent(new CardMovementAnimation());
  }

  async moveTo(position, duration = 0.3) {
    return new Promise(resolve => {
      this.moveAnimation.moveTo(position, duration, resolve);
    });
  }

  async dealTo(position) {
    // Fast initial movement from deck
    await this.moveTo(position, 0.2);
  }

  async returnToDeck(deckPosition) {
    // Slower return movement
    await this.moveTo(deckPosition, 0.4);
  }

  hold() {
    // Toggling hold does not move the card; feedback is the "hold"
    // indicator on the bottom band (CardRenderComponent shows/hides it).
    this.held = !this.held;
    // Note: holding is driven by GameManager.holdCard (button/key) and by
    // CardRenderComponent.handleClick (card click) -> both call this hold().
    // hold() must NOT call back into GameManager.holdCard or it recurses.
  }

  // `durationScale` stretches the turn animation (2 = twice as slow);
  // the draw-phase suspense reveal passes > 1 for near-win teases.
  async flip(instant = false, durationScale = 1) {
    if (instant) {
      this.faceUp = !this.faceUp;
      const renderComponent = this.gameObject.getComponent('Render');
      if (renderComponent) {
        renderComponent.flip();
      }
    } else {
      await new Promise(resolve => {
        this.flipAnimation.startFlip(!this.faceUp, () => {
          this.faceUp = !this.faceUp;
          resolve();
        }, durationScale);
      });
    }
  }

  toString() {
    return `${this.value} of ${this.suit}`;
  }
}

// Factory function to create a complete card game object
export function createCard(suit, value, x = 0, y = 0) {
  const cardObject = new GameObject(`Card_${value}_${suit}`);

  // Add card component
  const cardComponent = cardObject.addComponent(new CardComponent(suit, value));

  // Position the card
  cardObject.position.set(x, y, 0);

  return cardObject;
}

export { CardComponent };
