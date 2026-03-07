import './style.css';
import { createLanMatchConfig, defaultGameConfig } from './game/config';
import { BattleSession } from './game/controller';
import type { Command, GameConfig, SimulationState } from './game/types';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = `
  <div class="shell">
    <header class="top-strip">
      <div class="strip-brand">
        <h1>Modern War</h1>
        <span id="battlefield-name" class="strip-map">${defaultGameConfig.map.name} · ${defaultGameConfig.map.width}×${defaultGameConfig.map.height}</span>
      </div>
      <div class="strip-divider"></div>
      <div class="strip-economy">
        <div class="econ-stat">
          <span class="econ-label">Credits</span>
          <div class="econ-payout-wrap">
            <strong id="resource-count" class="econ-val">0</strong>
            <span id="payout-badge" class="economy-badge hidden"></span>
          </div>
        </div>
        <div class="econ-stat">
          <span class="econ-label">Income</span>
          <strong id="income-rate" class="econ-val">+0/s</strong>
        </div>
        <div class="econ-stat">
          <span class="econ-label">Deposits</span>
          <strong id="resource-sites" class="econ-val">0</strong>
        </div>
        <div class="econ-stat">
          <span class="econ-label">Couriers</span>
          <strong id="worker-count" class="econ-val">0</strong>
        </div>
      </div>
      <div class="strip-divider"></div>
      <div class="strip-mode">
        <span id="mode-chip" class="mode-badge">Standing by</span>
        <span id="mode-hint" class="mode-hint hidden"></span>
      </div>
      <div class="strip-spacer"></div>
      <span id="timer-display" class="timer-display">0:00</span>
      <div class="strip-divider"></div>
      <div class="strip-controls">
        <button class="chrome-button" id="pause-button" type="button">Pause</button>
        <button class="chrome-button" id="restart-button" type="button">Restart</button>
        <button class="chrome-button" id="help-toggle" type="button" title="Controls (H)">?</button>
      </div>
    </header>
    <main class="stage">
      <div class="viewport">
        <div id="game-root"></div>
        <div class="overlay" id="menu-overlay">
          <div class="overlay-card">
            <p class="eyebrow">Battle Setup</p>
            <h2>${defaultGameConfig.map.name}</h2>
            <button class="primary-button" id="start-button" type="button">Start Skirmish</button>
            <details class="lan-section">
              <summary class="lan-summary">LAN Multiplayer</summary>
              <div class="lan-card">
                <label class="lan-field">
                  <span>WebSocket URL</span>
                  <input id="lan-url" type="text" value="ws://127.0.0.1:8787" />
                </label>
                <label class="lan-field">
                  <span>Room ID</span>
                  <input id="lan-room" type="text" value="lan-room" />
                </label>
                <label class="lan-field">
                  <span>Teams</span>
                  <select id="lan-team-count">
                    <option value="2" selected>2 teams</option>
                    <option value="3">3 teams</option>
                    <option value="4">4 teams</option>
                  </select>
                </label>
                <div class="lan-actions">
                  <button class="chrome-button" id="lan-host-button" type="button">Host LAN</button>
                  <button class="chrome-button" id="lan-join-button" type="button">Join LAN</button>
                  <button class="primary-button" id="lan-start-button" type="button" disabled>Start Match</button>
                </div>
                <p id="lan-status">LAN status: idle.</p>
              </div>
            </details>
          </div>
        </div>
        <div class="overlay hidden" id="end-overlay">
          <div class="overlay-card">
            <p class="eyebrow" id="end-kicker">Battle Over</p>
            <h2 id="end-title">Victory</h2>
            <p id="end-reason"></p>
            <button class="primary-button" id="play-again-button" type="button">Play Again</button>
          </div>
        </div>
        <div class="overlay hidden" id="help-overlay">
          <div class="overlay-card">
            <p class="eyebrow">Controls</p>
            <h2>How to Play</h2>
            <ul class="help-list">
              <li><kbd>Arrow keys</kbd> Pan camera</li>
              <li><kbd>Mouse wheel</kbd> Zoom in / out</li>
              <li><kbd>Middle drag</kbd> Pan camera</li>
              <li><kbd>Left click</kbd> Select unit or building</li>
              <li><kbd>Drag</kbd> Box-select units</li>
              <li><kbd>Shift + click</kbd> Add to selection</li>
              <li><kbd>Right-click</kbd> Move / attack / set rally</li>
              <li><kbd>A</kbd> Arm attack-move</li>
              <li><kbd>C</kbd> Center camera on selection</li>
              <li><kbd>Esc</kbd> Cancel mode / deselect</li>
              <li><kbd>Space</kbd> Pause / resume</li>
            </ul>
            <button class="primary-button" id="help-close" type="button">Close</button>
          </div>
        </div>
      </div>
    </main>
    <footer class="command-deck">
      <section class="deck-col">
        <p class="panel-label">Selection</p>
        <h3 id="selection-title">No selection</h3>
        <p id="selection-detail" class="selection-detail-text">Click or drag to select units.</p>
        <p id="selection-target" class="selection-meta hidden"></p>
        <p id="selection-combat" class="selection-meta hidden"></p>
      </section>
      <div class="deck-actions">
        <div class="deck-action-group">
          <p class="panel-label">Build</p>
          <div class="deck-action-row" id="build-actions"></div>
        </div>
        <div class="deck-action-group">
          <p class="panel-label">Train</p>
          <div class="deck-action-row" id="train-actions"></div>
        </div>
      </div>
      <section class="deck-col">
        <div id="queue-section" class="hidden">
          <p class="panel-label">Queue</p>
          <div id="queue-display"></div>
        </div>
        <div class="forces-compact">
          <div class="force-row">
            <span class="player-color">You</span>
            <span id="player-force-count" class="force-count">—</span>
          </div>
          <div class="force-row">
            <span class="enemy-color">Enemy</span>
            <span id="enemy-force-count" class="force-count">—</span>
          </div>
        </div>
      </section>
    </footer>
  </div>
`;

const gameRoot = document.querySelector<HTMLDivElement>('#game-root')!;
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!;
const lanHostButton = document.querySelector<HTMLButtonElement>('#lan-host-button')!;
const lanJoinButton = document.querySelector<HTMLButtonElement>('#lan-join-button')!;
const lanStartButton = document.querySelector<HTMLButtonElement>('#lan-start-button')!;
const lanUrlInput = document.querySelector<HTMLInputElement>('#lan-url')!;
const lanRoomInput = document.querySelector<HTMLInputElement>('#lan-room')!;
const lanTeamCountInput = document.querySelector<HTMLSelectElement>('#lan-team-count')!;
const lanStatus = document.querySelector<HTMLParagraphElement>('#lan-status')!;
const playAgainButton = document.querySelector<HTMLButtonElement>('#play-again-button')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restart-button')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-button')!;
const helpToggle = document.querySelector<HTMLButtonElement>('#help-toggle')!;
const helpClose = document.querySelector<HTMLButtonElement>('#help-close')!;
const helpOverlay = document.querySelector<HTMLDivElement>('#help-overlay')!;
const menuOverlay = document.querySelector<HTMLDivElement>('#menu-overlay')!;
const endOverlay = document.querySelector<HTMLDivElement>('#end-overlay')!;
const resourceCount = document.querySelector<HTMLElement>('#resource-count')!;
const incomeRate = document.querySelector<HTMLElement>('#income-rate')!;
const workerCount = document.querySelector<HTMLElement>('#worker-count')!;
const payoutBadge = document.querySelector<HTMLSpanElement>('#payout-badge')!;
const battlefieldName = document.querySelector<HTMLElement>('#battlefield-name')!;
const modeChip = document.querySelector<HTMLElement>('#mode-chip')!;
const modeHintEl = document.querySelector<HTMLElement>('#mode-hint')!;
const timerDisplay = document.querySelector<HTMLElement>('#timer-display')!;
const resourceSites = document.querySelector<HTMLElement>('#resource-sites')!;
const selectionTitle = document.querySelector<HTMLHeadingElement>('#selection-title')!;
const selectionDetail = document.querySelector<HTMLParagraphElement>('#selection-detail')!;
const selectionTarget = document.querySelector<HTMLParagraphElement>('#selection-target')!;
const selectionCombat = document.querySelector<HTMLParagraphElement>('#selection-combat')!;
const buildActions = document.querySelector<HTMLDivElement>('#build-actions')!;
const trainActions = document.querySelector<HTMLDivElement>('#train-actions')!;
const endTitle = document.querySelector<HTMLHeadingElement>('#end-title')!;
const endReason = document.querySelector<HTMLParagraphElement>('#end-reason')!;
const endKicker = document.querySelector<HTMLParagraphElement>('#end-kicker')!;
const queueSection = document.querySelector<HTMLElement>('#queue-section')!;
const queueDisplay = document.querySelector<HTMLDivElement>('#queue-display')!;
const playerForceCount = document.querySelector<HTMLElement>('#player-force-count')!;
const enemyForceCount = document.querySelector<HTMLElement>('#enemy-force-count')!;

const buildActionButtons = new Map<string, HTMLButtonElement>();
const trainActionButtons = new Map<string, HTMLButtonElement>();

let phaserGame: import('phaser').Game | null = null;
let session: BattleSession | null = null;
let currentConfig: GameConfig = defaultGameConfig;
let localPlayerId = 'player';
let socket: WebSocket | null = null;
let lanHostMode = false;
let lanConnected = false;
let lanRoomId = '';
let lanTeamCount = 2;
let lastSentTick = -1;
let lastRenderedResources = 0;
let payoutBadgeTimeout: number | null = null;

// Block browser scroll keys and wheel when game is active
const SCROLL_BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

document.addEventListener('keydown', (e) => {
  if (!session) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
  if (SCROLL_BLOCK_KEYS.has(e.code)) {
    e.preventDefault();
  }
}, { capture: true });

document.addEventListener('wheel', (e) => {
  if (session) {
    e.preventDefault();
  }
}, { passive: false });

type ActionHandler = (actionId: string) => void;

function getActionButton(container: HTMLDivElement, cache: Map<string, HTMLButtonElement>, actionId: string) {
  let button = cache.get(actionId);
  if (button) {
    return button;
  }

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-button';
  button.dataset.actionId = actionId;

  const artwork = document.createElement('span');
  artwork.className = 'action-art';
  button.appendChild(artwork);

  const content = document.createElement('span');
  content.className = 'action-content';
  button.appendChild(content);

  const title = document.createElement('span');
  title.className = 'action-label';
  content.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'action-meta';
  content.appendChild(meta);

  cache.set(actionId, button);
  container.appendChild(button);
  return button;
}

function renderActionButtons(
  container: HTMLDivElement,
  cache: Map<string, HTMLButtonElement>,
  actions: Array<{ id: string; label: string; cost: number; imagePath: string | null; disabled: boolean; active: boolean }>,
  emptyMessage: string,
) {
  const nextIds = new Set(actions.map((action) => action.id));

  cache.forEach((button, actionId) => {
    if (!nextIds.has(actionId)) {
      button.remove();
      cache.delete(actionId);
    }
  });

  container.classList.toggle('action-grid-empty', actions.length === 0);

  if (actions.length === 0) {
    container.replaceChildren(createEmptyActionState(emptyMessage));
    return;
  }

  const fragment = document.createDocumentFragment();
  actions.forEach((action) => {
    const button = getActionButton(container, cache, action.id);
    button.dataset.actionId = action.id;
    button.disabled = action.disabled;
    button.classList.toggle('active', action.active);
    button.classList.toggle('has-art', Boolean(action.imagePath));

    const artwork = button.querySelector<HTMLSpanElement>('.action-art');
    const title = button.querySelector<HTMLSpanElement>('.action-label');
    const meta = button.querySelector<HTMLSpanElement>('.action-meta');
    if (artwork) {
      artwork.style.backgroundImage = action.imagePath ? `url("${action.imagePath}")` : '';
    }
    if (title) {
      title.textContent = action.label;
    }
    if (meta) {
      meta.textContent = `${action.cost}¢`;
    }

    fragment.appendChild(button);
  });

  container.replaceChildren(fragment);
}

function createEmptyActionState(message: string) {
  const empty = document.createElement('div');
  empty.className = 'action-empty';
  empty.textContent = message;
  return empty;
}

function handleActionContainerPress(
  event: Event,
  container: HTMLDivElement,
  handler: ActionHandler,
) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest<HTMLButtonElement>('button[data-action-id]');
  if (!button || !container.contains(button) || button.disabled) {
    return;
  }

  const actionId = button.dataset.actionId;
  if (!actionId) {
    return;
  }

  handler(actionId);
}

buildActions.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) {
    return;
  }

  event.preventDefault();
  handleActionContainerPress(event, buildActions, (actionId) => session?.startBuildPlacement(actionId));
});

trainActions.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) {
    return;
  }

  event.preventDefault();
  handleActionContainerPress(event, trainActions, (actionId) => session?.queueSelectedBuildingUnit(actionId));
});

buildActions.addEventListener('click', (event) => {
  if (event.detail !== 0) {
    return;
  }

  handleActionContainerPress(event, buildActions, (actionId) => session?.startBuildPlacement(actionId));
});

trainActions.addEventListener('click', (event) => {
  if (event.detail !== 0) {
    return;
  }

  handleActionContainerPress(event, trainActions, (actionId) => session?.queueSelectedBuildingUnit(actionId));
});

function setLanStatus(message: string) {
  lanStatus.textContent = `LAN status: ${message}`;
}

function sendLanMessage(payload: unknown) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function closeLanSocket() {
  if (!socket) {
    return;
  }

  socket.close();
  socket = null;
  lanConnected = false;
  lanStartButton.disabled = true;
}

function handleLanServerMessage(raw: unknown) {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) {
    return;
  }

  const message = raw as { type: string; [key: string]: unknown };

  if (message.type === 'lobby') {
    const connected = Number(message.connected ?? 0);
    const required = Number(message.teamCount ?? lanTeamCount);
    lanConnected = true;
    lanStartButton.disabled = !lanHostMode || connected < 2;
    setLanStatus(`room ${lanRoomId} | ${connected}/${required} team joined`);
    return;
  }

  if (message.type === 'assigned') {
    const assignedId = typeof message.playerId === 'string' ? message.playerId : localPlayerId;
    localPlayerId = assignedId;
    setLanStatus(`room ${lanRoomId} | assigned as ${assignedId}`);
    return;
  }

  if (message.type === 'start') {
    const startPlayerId = typeof message.playerId === 'string' ? message.playerId : localPlayerId;
    localPlayerId = startPlayerId;
    const nextTeamCount = Number(message.teamCount ?? lanTeamCount);
    lanTeamCount = Math.max(2, Math.min(4, Number.isFinite(nextTeamCount) ? nextTeamCount : 2));
    currentConfig = createLanMatchConfig(lanTeamCount);
    mountBattle({
      config: currentConfig,
      localPlayerId: startPlayerId,
      authoritative: lanHostMode,
      onCommandIssued: (command) => {
        sendLanMessage({ type: 'input', command });
      },
    });
    return;
  }

  if (message.type === 'input' && lanHostMode && session) {
    const command = message.command as Command | undefined;
    if (command) {
      session.applyRemoteCommand(command);
    }
    return;
  }

  if (message.type === 'snapshot' && !lanHostMode && session) {
    const sim = message.sim as SimulationState | undefined;
    if (sim) {
      session.setSimulationSnapshot(sim);
    }
  }
}

function connectLan(role: 'host' | 'join') {
  closeLanSocket();
  lanRoomId = lanRoomInput.value.trim() || 'lan-room';
  lanTeamCount = Math.max(2, Math.min(4, Number(lanTeamCountInput.value) || 2));
  const url = lanUrlInput.value.trim();

  if (!url) {
    setLanStatus('missing WebSocket URL');
    return;
  }

  lanHostMode = role === 'host';
  socket = new WebSocket(url);
  setLanStatus('connecting...');

  socket.addEventListener('open', () => {
    if (!socket) {
      return;
    }

    sendLanMessage(
      lanHostMode
        ? { type: 'create-room', roomId: lanRoomId, teamCount: lanTeamCount }
        : { type: 'join-room', roomId: lanRoomId },
    );
  });

  socket.addEventListener('message', (event) => {
    try {
      handleLanServerMessage(JSON.parse(String(event.data)));
    } catch {
      setLanStatus('received invalid server payload');
    }
  });

  socket.addEventListener('close', () => {
    lanConnected = false;
    lanStartButton.disabled = true;
    setLanStatus('disconnected');
  });

  socket.addEventListener('error', () => {
    setLanStatus('connection error');
  });
}

async function mountBattle(options: {
  config?: GameConfig;
  localPlayerId?: string;
  authoritative?: boolean;
  onCommandIssued?: (command: Command) => void;
} = {}) {
  const [{ default: Phaser }, { BattleScene }] = await Promise.all([
    import('phaser'),
    import('./game/phaser/BattleScene'),
  ]);

  currentConfig = options.config ?? defaultGameConfig;
  localPlayerId = options.localPlayerId ?? currentConfig.map.spawns[0]?.playerId ?? 'player';
  lastSentTick = -1;

  phaserGame?.destroy(true);
  gameRoot.innerHTML = '';

  session = new BattleSession(currentConfig, {
    localPlayerId,
    authoritative: options.authoritative ?? true,
    onCommandIssued: options.onCommandIssued,
  });
  lastRenderedResources = session.state.sim.players[localPlayerId]?.resources ?? 0;
  if (payoutBadgeTimeout !== null) {
    window.clearTimeout(payoutBadgeTimeout);
    payoutBadgeTimeout = null;
  }
  payoutBadge.classList.add('hidden');
  payoutBadge.textContent = '';
  resourceCount.classList.remove('economy-total-flash');
  session.subscribe((state) => {
    if (lanHostMode && session?.authoritative && lanConnected && state.sim.tick !== lastSentTick) {
      lastSentTick = state.sim.tick;
      sendLanMessage({ type: 'snapshot', sim: state.sim });
    }
    renderHud();
  });

  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot,
    width: 1120,
    height: 780,
    backgroundColor: '#0f1720',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new BattleScene(session)],
    render: {
      pixelArt: false,
      antialias: true,
    },
  });

  menuOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
}

function formatTime(ticks: number, tickRate: number) {
  const seconds = Math.ceil(ticks / tickRate);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`;
}

function renderHud() {
  if (!session) {
    return;
  }

  const model = session.getHudModel();
  const tickRate = session.config.tickRate;
  const payoutDelta = model.resources - lastRenderedResources;

  // Top strip — economy
  resourceCount.textContent = `${model.resources}`;
  incomeRate.textContent = `+${model.incomePerSecond}/s`;
  workerCount.textContent = `${model.activeWorkers}`;
  resourceSites.textContent = `${model.activeResourceNodes}`;
  battlefieldName.textContent = `${model.mapName} · ${model.mapSizeLabel}`;

  if (payoutDelta > 0) {
    payoutBadge.textContent = `+${payoutDelta}`;
    payoutBadge.classList.remove('hidden');
    resourceCount.classList.remove('economy-total-flash');
    void resourceCount.offsetWidth;
    resourceCount.classList.add('economy-total-flash');

    if (payoutBadgeTimeout !== null) {
      window.clearTimeout(payoutBadgeTimeout);
    }

    payoutBadgeTimeout = window.setTimeout(() => {
      payoutBadge.classList.add('hidden');
      resourceCount.classList.remove('economy-total-flash');
    }, 900);
  }

  lastRenderedResources = model.resources;

  // Top strip — mode & timer
  modeChip.textContent = model.modeLabel;
  modeChip.classList.toggle('mode-armed', session.state.render.commandMode === 'attack-move');
  modeChip.classList.toggle('mode-build', session.state.render.commandMode === 'build');

  if (model.modeHint) {
    modeHintEl.textContent = model.modeHint;
    modeHintEl.classList.remove('hidden');
  } else {
    modeHintEl.classList.add('hidden');
  }

  timerDisplay.textContent = formatTime(model.tick, tickRate);
  pauseButton.textContent = model.paused ? 'Resume' : 'Pause';

  // Command deck — selection
  selectionTitle.textContent = model.selectionTitle;
  selectionDetail.textContent = model.selectionDetail;
  selectionTarget.textContent = model.selectionTarget ?? '';
  selectionCombat.textContent = model.selectionCombatDetail ?? '';
  selectionTarget.classList.toggle('hidden', !model.selectionTarget);
  selectionCombat.classList.toggle('hidden', !model.selectionCombatDetail);

  // Command deck — actions
  renderActionButtons(buildActions, buildActionButtons, model.buildActions, 'Select HQ or meet tech req.');
  renderActionButtons(trainActions, trainActionButtons, model.trainActions, 'Select a factory to train.');

  // Command deck — queue
  if (model.productionQueues.length > 0) {
    queueSection.classList.remove('hidden');
    queueDisplay.innerHTML = model.productionQueues.map((q) => {
      const pct = Math.round(q.progress * 100);
      const timeLeft = formatTime(q.remainingTicks, tickRate);
      return `<div class="queue-item">
        <div class="queue-info"><span>${q.unitName}</span><span>${pct}% (${timeLeft})</span></div>
        <div class="queue-bar"><div class="queue-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  } else {
    queueSection.classList.add('hidden');
  }

  // Command deck — forces
  playerForceCount.textContent = `${model.playerUnitCount} units · ${model.playerBuildingCount} bldg`;
  enemyForceCount.textContent = `${model.enemyUnitCount} units · ${model.enemyBuildingCount} bldg`;

  // End game
  if (model.winner) {
    endOverlay.classList.remove('hidden');
    endKicker.textContent = model.winner === 'Victory' ? 'Your Team' : 'Opponent Team';
    endTitle.textContent = model.winner;
    endReason.textContent = session.state.sim.lossReason ?? '';
  }
}

if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  lanUrlInput.value = `ws://${window.location.hostname}:8787`;
}

startButton.addEventListener('click', () => {
  lanHostMode = false;
  currentConfig = defaultGameConfig;
  mountBattle({
    config: currentConfig,
    localPlayerId: currentConfig.map.spawns[0]?.playerId ?? 'player',
    authoritative: true,
  });
});

lanHostButton.addEventListener('click', () => {
  connectLan('host');
});

lanJoinButton.addEventListener('click', () => {
  connectLan('join');
});

lanStartButton.addEventListener('click', () => {
  if (!lanHostMode || !lanConnected) {
    return;
  }

  sendLanMessage({ type: 'start-match' });
});

playAgainButton.addEventListener('click', () => {
  if (lanHostMode && lanConnected) {
    sendLanMessage({ type: 'start-match' });
    return;
  }

  mountBattle({
    config: currentConfig,
    localPlayerId,
    authoritative: true,
  });
});

restartButton.addEventListener('click', () => {
  if (lanHostMode && lanConnected) {
    sendLanMessage({ type: 'start-match' });
    return;
  }

  mountBattle({
    config: currentConfig,
    localPlayerId,
    authoritative: true,
  });
});

pauseButton.addEventListener('click', () => {
  session?.togglePause();
});

helpToggle.addEventListener('click', () => {
  helpOverlay.classList.toggle('hidden');
});

helpClose.addEventListener('click', () => {
  helpOverlay.classList.add('hidden');
});
