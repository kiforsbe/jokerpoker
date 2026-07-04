class GameLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;

    // Initialize console styles
    this.styles = {
      STATE: 'color: #4CAF50; font-weight: bold',  // Green
      HAND: 'color: #2196F3; font-weight: bold',   // Blue
      WIN: 'color: #FFC107; font-weight: bold',    // Yellow
      ERROR: 'color: #F44336; font-weight: bold',  // Red
      DEBUG: 'color: #9C27B0; font-weight: bold'   // Purple
    };

    // Set up console group handling
    this.activeGroup = null;

    // Create console logger shortcut
    window.gameLog = this;
  }

  log(type, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type,
      message,
      data
    };

    // Add to logs array
    this.logs.push(logEntry);

    // Trim logs if exceeding max size
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with styling
    const style = this.styles[type] || 'color: #757575';

    if (data) {
      //console.groupCollapsed(`%c[${type}] ${message}`, style);
      console.groupCollapsed(`%c[${type}] ${message} ${JSON.stringify(data)}`, style);
      console.log('Timestamp:', timestamp);
      console.log('Data:', data);
      console.groupEnd();
    } else {
      console.log(`%c[${type}] ${message}`, style);
    }
  }

  logState(gameManager) {
    this.log('STATE', `Game State: ${gameManager.state}`, {
      credits: gameManager.credits,
      bet: gameManager.bet,
      attractMode: gameManager.attractMode
    });
  }

  logHand(cards, context) {
    this.log('HAND', context, cards.map(card => ({
      card: card.toString(),
      held: card.held
    })));
  }

  logWin(result) {
    this.log('WIN', `Won with ${result.name}!`, {
      payout: result.payout
    });
  }

  getLogsByType(type) {
    return this.logs.filter(log => log.type === type);
  }

  clearLogs() {
    this.logs = [];
    console.clear();
    this.log('DEBUG', 'Logs cleared');
  }

  downloadLogs() {
    const logText = JSON.stringify(this.logs, null, 2);
    const blob = new Blob([logText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game_log_${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export default GameLogger;
