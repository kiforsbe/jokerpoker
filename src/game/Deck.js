import Component from '../engine/Component.js';
import GameObject from '../engine/GameObject.js';
import { createCard } from './Card.js';
import { GameAudioComponent } from '../audio/AudioComponent.js';
import DeckRenderComponent from '../rendering/DeckRenderComponent.js';

class DeckComponent extends Component {
    constructor() {
        super();
        this.cards = [];
        this.discardPile = [];
        this.audioComponent = null;
        this.initializeDeck();
    }

    get type() {
        return 'Deck';
    }

    onAdd() {
        this.audioComponent = this.gameObject.addComponent(new GameAudioComponent());
    }

    onStart() {
        // The visible face-down stack (back toward the player) that stays at
        // the deck's position across hands. Added here rather than in the
        // factory because the engine reference — which the render component
        // needs — is only set once the object enters the scene.
        if (!this.gameObject.getComponent('Render')) {
            this.gameObject.addComponent(new DeckRenderComponent());
        }
    }

    initializeDeck() {
        const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        // Create standard 52 cards
        for (const suit of suits) {
            for (const value of values) {
                this.cards.push({ suit, value });
            }
        }
        
        // Add Joker
        this.cards.push({ suit: 'Special', value: 'Joker' });
        
        this.shuffle();
    }

    shuffle() {
        // Return discarded cards to deck
        this.cards.push(...this.discardPile);
        this.discardPile = [];

        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    dealCard() {
        if (this.cards.length === 0) {
            this.shuffle();
        }

        if (this.cards.length > 0) {
            const cardData = this.cards.pop();
            const cardObject = createCard(
                cardData.suit,
                cardData.value,
                this.gameObject.position.x,
                this.gameObject.position.y
            );

            // Add to scene via engine
            this.engine.addGameObject(cardObject);
            // Mark provenance: only cards dealt from this deck may return to
            // its discard pile (see returnCards).
            cardObject.getComponent('Card').fromDeck = true;
            return cardObject;
        }
        
        return null;
    }

    dealHand(count) {
        const hand = [];
        for (let i = 0; i < count; i++) {
            const card = this.dealCard();
            if (card) {
                hand.push(card);
            }
        }
        return hand;
    }

    returnCards(cards) {
        cards.forEach(card => {
            if (card.engine) {
                // Fold the card's data back into the discard pile — but only
                // if it was dealt from this deck. Attract-mode demo hands are
                // created directly (not drawn from the deck), and returning
                // them here would inject duplicates of cards the deck still
                // holds (seen in play as two aces of spades in one hand).
                const cardComponent = card.getComponent('Card');
                if (cardComponent?.fromDeck) {
                    this.discardPile.push({
                        suit: cardComponent.suit,
                        value: cardComponent.value
                    });
                }
                // Remove card game object from scene
                card.parent?.remove(card);
                this.engine.removeGameObject(card);
            }
        });

        // Shuffle if deck is low
        if (this.cards.length < 10) {
            this.shuffle();
        }
    }
}

// Factory function to create a deck game object
export function createDeck(x = 0, y = 0) {
    const deckObject = new GameObject('Deck');
    deckObject.addComponent(new DeckComponent());
    
    // Position the deck
    deckObject.position.set(x, y, 0);
    
    return deckObject;
}

export { DeckComponent };
