import GameObject from '../engine/GameObject.js';
import { ButtonComponent, TextDisplayComponent, StatusBoxComponent, BetDisplayComponent } from './UIComponent.js';

export function createButton(text, x = 0, y = 0, width = 0.4, height = 0.15) {
  const buttonObject = new GameObject(`Button_${text}`);
  const button = buttonObject.addComponent(new ButtonComponent(text, width, height));

  // Position the button
  buttonObject.position.x = x;
  buttonObject.position.y = y;
  buttonObject.position.z = 0;

  return buttonObject;
}

export function createTextDisplay(text, x = 0, y = 0, color = '#ffffff', size = 32) {
  const textObject = new GameObject(`Text_${text}`);
  const textDisplay = textObject.addComponent(new TextDisplayComponent(text, color, size));

  // Position the text
  textObject.position.x = x;
  textObject.position.y = y;
  textObject.position.z = 0;

  return textObject;
}

function createStatusBox(label, x, y) {
  const obj = new GameObject(`Status_${label}`);
  // 0.73 wide: roomy enough that "Credits 100" fits at the standard 32px
  // retro font without triggering the box's shrink-to-fit fallback.
  obj.addComponent(new StatusBoxComponent(label, 0.73, 0.18));
  obj.position.set(x, y, 0);
  return obj;
}

// The status row is one parent GameObject; the three displays are children
// positioned relative to it, so moving the bar moves the whole row.
export function createStatusBar(gameManager) {
  const bar = new GameObject('StatusBar');
  // Vertically centered in the top gray band (screen top 1.0 down to
  // LAYOUT.topBandBottomY = 0.74).
  bar.position.set(0, 0.87, 0);

  const credits = createStatusBox('Credits', -0.66, 0); // left of the bar center
  const wins    = createStatusBox('Wins',     0.66, 0); // right of the bar center
  const bet = new GameObject('Status_Bet');
  bet.addComponent(new BetDisplayComponent(0.62, 0.18));
  bet.position.set(0, 0, 0); // bar center
  bar.add(credits);
  bar.add(bet);
  bar.add(wins);

  const set = (obj, v) => obj.getComponent('UI').setValue(v);
  gameManager.addEventListener('creditsChanged', ({ credits: c }) => set(credits, c));
  gameManager.addEventListener('betChanged', ({ bet: b }) => set(bet, b));
  gameManager.addEventListener('winChanged', ({ win }) => set(wins, win));

  return bar;
}
