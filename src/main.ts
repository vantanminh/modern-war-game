import './style.css';
import { getBuildingConfig } from './game/config';
import { BattleSession } from './game/controller';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing app root');
}

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">RTS Web Prototype</p>
        <h1>Modern War</h1>
      </div>
      <div class="topbar-actions">
        <button class="chrome-button" id="pause-button" type="button">Pause</button>
        <button class="chrome-button" id="restart-button" type="button">Restart</button>
      </div>
    </header>
    <main class="board">
      <aside class="panel panel-left">
        <section>
          <p class="panel-label">Economy</p>
          <div class="economy-headline">
            <h2 id="resource-count">0</h2>
            <span id="payout-badge" class="economy-badge hidden"></span>
          </div>
          <div class="economy-stats">
            <div class="economy-row">
              <span>Realized</span>
              <strong id="income-rate">+0 / sec</strong>
            </div>
            <div class="economy-row">
              <span>Projected</span>
              <strong id="projected-income">~0 / sec</strong>
            </div>
            <div class="economy-row">
              <span>Incoming</span>
              <strong id="pending-income">0 next payout</strong>
            </div>
            <div class="economy-row">
              <span>Couriers</span>
              <strong id="worker-count">0 active</strong>
            </div>
          </div>
          <p id="status-line">Initializing battlefield...</p>
        </section>
        <section>
          <p class="panel-label">Forces</p>
          <div class="forces-grid">
            <div class="force-col">
              <span class="force-header player-color">You</span>
              <div id="army-overview" class="army-list"></div>
            </div>
            <div class="force-col">
              <span class="force-header enemy-color">Enemy</span>
              <div id="enemy-army-overview" class="army-list"></div>
            </div>
          </div>
        </section>
        <section>
          <p class="panel-label">Selection</p>
          <h3 id="selection-title">No selection</h3>
          <p id="selection-detail">Use left click or drag to select units.</p>
          <p id="selection-target" class="selection-meta hidden"></p>
          <p id="selection-combat" class="selection-meta hidden"></p>
        </section>
        <section id="queue-section" class="hidden">
          <p class="panel-label">Production Queue</p>
          <div id="queue-display"></div>
        </section>
      </aside>
      <section class="viewport">
        <div id="game-root"></div>
        <div class="overlay overlay-center" id="menu-overlay">
          <div class="overlay-card">
            <p class="eyebrow">Single-player Skirmish</p>
            <h2>Red Scar Crossing</h2>
            <p>Desktop-only v1: harvest, build, train, break the opposing Command Core.</p>
            <button class="primary-button" id="start-button" type="button">Start Skirmish</button>
          </div>
        </div>
        <div class="overlay overlay-center hidden" id="end-overlay">
          <div class="overlay-card">
            <p class="eyebrow" id="end-kicker">Battle Over</p>
            <h2 id="end-title">Victory</h2>
            <p id="end-reason"></p>
            <button class="primary-button" id="play-again-button" type="button">Play Again</button>
          </div>
        </div>
        <div class="tips">
          <span>Arrow keys pan</span>
          <span>Mouse wheel zoom</span>
          <span>A arms attack-move</span>
          <span>Esc cancels mode</span>
          <span>Space pauses</span>
        </div>
      </section>
      <aside class="panel panel-right">
        <section>
          <p class="panel-label">Construction</p>
          <div class="action-grid" id="build-actions"></div>
        </section>
        <section>
          <p class="panel-label">Production</p>
          <div class="action-grid" id="train-actions"></div>
        </section>
      </aside>
    </main>
  </div>
`;

const gameRoot = document.querySelector<HTMLDivElement>('#game-root')!;
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!;
const playAgainButton = document.querySelector<HTMLButtonElement>('#play-again-button')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restart-button')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-button')!;
const menuOverlay = document.querySelector<HTMLDivElement>('#menu-overlay')!;
const endOverlay = document.querySelector<HTMLDivElement>('#end-overlay')!;
const resourceCount = document.querySelector<HTMLHeadingElement>('#resource-count')!;
const incomeRate = document.querySelector<HTMLParagraphElement>('#income-rate')!;
const projectedIncome = document.querySelector<HTMLParagraphElement>('#projected-income')!;
const pendingIncome = document.querySelector<HTMLParagraphElement>('#pending-income')!;
const workerCount = document.querySelector<HTMLParagraphElement>('#worker-count')!;
const payoutBadge = document.querySelector<HTMLSpanElement>('#payout-badge')!;
const selectionTitle = document.querySelector<HTMLHeadingElement>('#selection-title')!;
const selectionDetail = document.querySelector<HTMLParagraphElement>('#selection-detail')!;
const selectionTarget = document.querySelector<HTMLParagraphElement>('#selection-target')!;
const selectionCombat = document.querySelector<HTMLParagraphElement>('#selection-combat')!;
const statusLine = document.querySelector<HTMLParagraphElement>('#status-line')!;
const buildActions = document.querySelector<HTMLDivElement>('#build-actions')!;
const trainActions = document.querySelector<HTMLDivElement>('#train-actions')!;
const endTitle = document.querySelector<HTMLHeadingElement>('#end-title')!;
const endReason = document.querySelector<HTMLParagraphElement>('#end-reason')!;
const endKicker = document.querySelector<HTMLParagraphElement>('#end-kicker')!;
const armyOverview = document.querySelector<HTMLDivElement>('#army-overview')!;
const enemyArmyOverview = document.querySelector<HTMLDivElement>('#enemy-army-overview')!;
const queueSection = document.querySelector<HTMLElement>('#queue-section')!;
const queueDisplay = document.querySelector<HTMLDivElement>('#queue-display')!;

const buildActionButtons = new Map<string, HTMLButtonElement>();
const trainActionButtons = new Map<string, HTMLButtonElement>();

let phaserGame: import('phaser').Game | null = null;
let session: BattleSession | null = null;
let lastRenderedResources = 0;
let payoutBadgeTimeout: number | null = null;

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
      meta.textContent = `${action.cost} credits`;
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

async function mountBattle() {
  const [{ default: Phaser }, { BattleScene }] = await Promise.all([
    import('phaser'),
    import('./game/phaser/BattleScene'),
  ]);

  phaserGame?.destroy(true);
  gameRoot.innerHTML = '';

  session = new BattleSession();
  lastRenderedResources = session.state.sim.players.player.resources;
  if (payoutBadgeTimeout !== null) {
    window.clearTimeout(payoutBadgeTimeout);
    payoutBadgeTimeout = null;
  }
  payoutBadge.classList.add('hidden');
  payoutBadge.textContent = '';
  resourceCount.classList.remove('economy-total-flash');
  session.subscribe(() => renderHud());

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

  resourceCount.textContent = `${model.resources} credits`;
  incomeRate.textContent = `+${model.incomePerSecond} / sec`;
  projectedIncome.textContent = `~${model.projectedIncomePerSecond} / sec`;
  pendingIncome.textContent = model.pendingIncome > 0 ? `${model.pendingIncome} next payout` : '0 queued';
  workerCount.textContent = `${model.activeWorkers} active`;

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
  selectionTitle.textContent = model.selectionTitle;
  selectionDetail.textContent = model.selectionDetail;
  selectionTarget.textContent = model.selectionTarget ?? '';
  selectionCombat.textContent = model.selectionCombatDetail ?? '';
  selectionTarget.classList.toggle('hidden', !model.selectionTarget);
  selectionCombat.classList.toggle('hidden', !model.selectionCombatDetail);
  statusLine.textContent = `${model.modeLabel} | ${formatTime(model.tick, tickRate)} elapsed`;
  pauseButton.textContent = model.paused ? 'Resume' : 'Pause';

  // Army overview
  armyOverview.innerHTML = model.armyOverview.length > 0
    ? model.armyOverview.map((e) => `<div class="army-row"><span>${e.name}</span><strong>${e.count}</strong></div>`).join('')
    : '<div class="army-row dim">No units</div>';

  enemyArmyOverview.innerHTML = model.enemyArmyOverview.length > 0
    ? model.enemyArmyOverview.map((e) => `<div class="army-row"><span>${e.name}</span><strong>${e.count}</strong></div>`).join('')
    : '<div class="army-row dim">No units</div>';

  // Production queue
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

  renderActionButtons(buildActions, buildActionButtons, model.buildActions, 'Need more tech or credits to construct.');
  renderActionButtons(trainActions, trainActionButtons, model.trainActions, 'Select one completed factory to train units.');

  if (model.winner) {
    endOverlay.classList.remove('hidden');
    endKicker.textContent = model.winner === 'Victory' ? 'Aurora Combine' : 'Obsidian Front';
    endTitle.textContent = model.winner;
    endReason.textContent = session.state.sim.lossReason ?? '';
  }

  if (session.state.render.placementPreview) {
    const buildingConfig = getBuildingConfig(
      session.config,
      session.state.sim.players.player.factionId,
      session.state.render.placementPreview.buildingTypeId,
    );
    statusLine.textContent = `${buildingConfig.name}: left click to place, right click or Esc to cancel.`;
  }
}

startButton.addEventListener('click', mountBattle);
playAgainButton.addEventListener('click', mountBattle);
restartButton.addEventListener('click', mountBattle);
pauseButton.addEventListener('click', () => {
  session?.togglePause();
});
