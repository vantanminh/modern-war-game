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
          <p class="panel-label">Selection</p>
          <h3 id="selection-title">No selection</h3>
          <p id="selection-detail">Use left click or drag to select units.</p>
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
const statusLine = document.querySelector<HTMLParagraphElement>('#status-line')!;
const buildActions = document.querySelector<HTMLDivElement>('#build-actions')!;
const trainActions = document.querySelector<HTMLDivElement>('#train-actions')!;
const endTitle = document.querySelector<HTMLHeadingElement>('#end-title')!;
const endReason = document.querySelector<HTMLParagraphElement>('#end-reason')!;
const endKicker = document.querySelector<HTMLParagraphElement>('#end-kicker')!;

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

function renderHud() {
  if (!session) {
    return;
  }

  const model = session.getHudModel();
  resourceCount.textContent = `${model.resources} credits`;
  selectionTitle.textContent = model.selectionTitle;
  selectionDetail.textContent = model.selectionDetail;
  statusLine.textContent = `${model.modeLabel} Tick ${model.tick}`;
  pauseButton.textContent = model.paused ? 'Resume' : 'Pause';

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
