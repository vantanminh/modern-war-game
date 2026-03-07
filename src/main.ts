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
          <h2 id="resource-count">0</h2>
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

let phaserGame: import('phaser').Game | null = null;
let session: BattleSession | null = null;

async function mountBattle() {
  const [{ default: Phaser }, { BattleScene }] = await Promise.all([
    import('phaser'),
    import('./game/phaser/BattleScene'),
  ]);

  phaserGame?.destroy(true);
  gameRoot.innerHTML = '';

  session = new BattleSession();
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
  resourceCount.textContent = `${model.resources} credits`;
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

  // Build actions
  buildActions.innerHTML = '';
  model.buildActions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `action-button ${action.active ? 'active' : ''}`;
    button.disabled = action.disabled;
    button.innerHTML = `<span>${action.label}</span><strong>${action.cost}</strong>`;
    button.addEventListener('click', () => session?.startBuildPlacement(action.id));
    buildActions.appendChild(button);
  });

  // Train actions
  trainActions.innerHTML = '';
  model.trainActions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-button';
    button.disabled = action.disabled;
    button.innerHTML = `<span>${action.label}</span><strong>${action.cost}</strong>`;
    button.addEventListener('click', () => session?.queueSelectedBuildingUnit(action.id));
    trainActions.appendChild(button);
  });

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
