// ---------------------------
// 1) Grab elements from HTML
// ---------------------------
const scoreElement = document.getElementById('score');
const timeElement = document.getElementById('timeLeft');
const livesElement = document.getElementById('lives');
const timerDisplayElement = document.getElementById('timerDisplay');
const targetScoreElement = document.getElementById('targetScore');
const scoreProgressFill = document.getElementById('scoreProgressFill');
const scoreProgressText = document.getElementById('scoreProgressText');
const feedbackMessage = document.getElementById('feedbackMessage');
const gameArea = document.getElementById('gameArea');
const playerCatcher = document.getElementById('playerCatcher');

const startButton = document.getElementById('startButton');
const resetButton = document.getElementById('resetButton');
const soundToggleButton = document.getElementById('soundToggleButton');
const difficultySelect = document.getElementById('difficultySelect');
const difficultyInfo = document.getElementById('difficultyInfo');
const difficultySection = document.querySelector('.difficulty-selector');

// ---------------------------
// 1.25) Sound setup
// ---------------------------
// We create each Audio object once, then reuse it through playSound().
function createSound(path) {
	const audio = new Audio(path);
	audio.preload = 'auto';

	const soundEntry = {
		audio,
		isMissing: false
	};

	// If a file fails to load, mark it missing so the game keeps running silently.
	audio.addEventListener('error', () => {
		soundEntry.isMissing = true;
	});

	return soundEntry;
}

const sounds = {
	catch: createSound('sounds/catch.mp3'),
	miss: createSound('sounds/miss.mp3'),
	win: createSound('sounds/win.mp3'),
	button: createSound('sounds/button.mp3')
};

let hasUserInteracted = false;
let soundEnabled = false;

function updateSoundToggleButton() {
	if (!hasUserInteracted) {
		soundToggleButton.textContent = 'Sound: Off';
		soundToggleButton.setAttribute('aria-pressed', 'false');
		soundToggleButton.classList.remove('sound-on');
		return;
	}

	const soundLabel = soundEnabled ? 'Sound: On' : 'Sound: Off';
	soundToggleButton.textContent = soundLabel;
	soundToggleButton.setAttribute('aria-pressed', String(soundEnabled));
	soundToggleButton.classList.toggle('sound-on', soundEnabled);
}

function enableSoundAfterFirstInteraction() {
	if (hasUserInteracted) {
		return;
	}

	hasUserInteracted = true;
	soundEnabled = true;
	updateSoundToggleButton();
}

// Helper for all game sounds.
function playSound(soundName) {
	if (!hasUserInteracted || !soundEnabled) {
		return;
	}

	const soundEntry = sounds[soundName];

	if (!soundEntry || soundEntry.isMissing) {
		return;
	}

	try {
		soundEntry.audio.currentTime = 0;
		const playPromise = soundEntry.audio.play();

		if (playPromise && typeof playPromise.catch === 'function') {
			playPromise.catch(() => {
				soundEntry.isMissing = true;
			});
		}
	} catch {
		soundEntry.isMissing = true;
	}
}

// -------------------------------------------
// 1.5) Difficulty modes object with all settings
// -------------------------------------------
// Each mode defines the complete gameplay parameters so students
// can experience 3 distinct difficulty levels with clear differences.
const gameModes = {
	easy: {
		timer: 75,
		lives: 4,
		targetScore: 80,
		baseSpawnDelay: 950,
		basePollutantChance: 0.22,
		cleanReward: 10,
		pollutantPenalty: 4,
		missPenalty: 1,
		cleanMissesForLifePenalty: 5,
		displayName: 'Easy'
	},
	normal: {
		timer: 60,
		lives: 3,
		targetScore: 100,
		baseSpawnDelay: 850,
		basePollutantChance: 0.30,
		cleanReward: 10,
		pollutantPenalty: 5,
		missPenalty: 2,
		cleanMissesForLifePenalty: 4,
		displayName: 'Normal'
	},
	hard: {
		timer: 45,
		lives: 2,
		targetScore: 120,
		baseSpawnDelay: 700,
		basePollutantChance: 0.42,
		cleanReward: 10,
		pollutantPenalty: 6,
		missPenalty: 2,
		cleanMissesForLifePenalty: 3,
		displayName: 'Hard'
	}
};

// ---------------------------
// 2) Game state variables
// ---------------------------
// These are the main values that change while playing.
const initialScoreValue = 0;
let currentDifficulty = 'normal';
let currentMode = gameModes.normal;
let initialTimerValue = currentMode.timer;
let initialLivesValue = currentMode.lives;
let targetScore = currentMode.targetScore;
const resetMessageText = 'Game reset! Press Start to play again.';

let score = initialScoreValue;
let timer = initialTimerValue;
let lives = initialLivesValue;
let gameRunning = false;

// Milestones are based on percent of the current mode's target score.
const milestoneTemplates = [
	{
		thresholdPercent: 25,
		message: 'Great start - every drop helps.'
	},
	{
		thresholdPercent: 50,
		message: 'Halfway there!'
	},
	{
		thresholdPercent: 75,
		message: 'You\'re getting close to your clean water goal.'
	},
	{
		thresholdPercent: 100,
		message: 'Goal reached - clean water wins!'
	}
];

let milestones = [];

// We store the interval ID so we can stop the timer later.
let timerIntervalId = null;
let spawnIntervalId = null;
let gameLoopIntervalId = null;
let celebrationCleanupTimeoutId = null;
let milestoneBannerTimeoutId = null;
let feedbackLockUntil = 0;

// -------------------------------
// CHALLENGE LOGIC (fair + simple)
// -------------------------------
// These values come from the selected difficulty mode.
// They make pollutants feel like obstacles, add a penalty for
// missing many clean drops, and increase difficulty a little over time.
let pollutantScorePenalty = currentMode.pollutantPenalty;
let cleanMissesForLifePenalty = currentMode.cleanMissesForLifePenalty;
let missedCleanStreak = 0;
let currentSpawnDelay = currentMode.baseSpawnDelay;
let pollutantChance = currentMode.basePollutantChance;
const confettiColors = ['#FFC907', '#2E9DF7', '#8BD1CB', '#4FCB53', '#FF902A', '#F16061'];

// Array to track every falling item currently on screen.
const fallingItems = [];

// ---------------------------------
// 3) Player movement state variables
// ---------------------------------
let catcherX = 0;
const catcherStep = 24;
const keyboardMoveSpeed = 7;
let leftKeyDown = false;
let rightKeyDown = false;

const feedbackClassNames = ['feedback-info', 'feedback-success', 'feedback-warning', 'feedback-danger'];

// ------------------------------------------------------
// 4) clampCatcherX(): keep catcher inside game boundaries
// ------------------------------------------------------
function clampCatcherX(value) {
	const maxX = Math.max(0, gameArea.clientWidth - playerCatcher.offsetWidth);
	return Math.min(Math.max(value, 0), maxX);
}

// ---------------------------------------------------------------------------
// 4.5) applyDifficultyMode(): load settings from the selected game mode
// ---------------------------------------------------------------------------
// This function updates all game settings to match the selected difficulty.
// Can only be called when the game is not running.
function applyDifficultyMode(modeKey) {
	if (gameRunning) {
		// Difficulty locked during gameplay - revert selector to current mode.
		difficultySelect.value = currentDifficulty;
		setFeedbackMessage('Cannot change difficulty while playing!', 'warning', 800);
		return;
	}

	currentDifficulty = modeKey;
	currentMode = gameModes[modeKey];

	// Update all mode-dependent constants.
	initialTimerValue = currentMode.timer;
	initialLivesValue = currentMode.lives;
	targetScore = currentMode.targetScore;
	pollutantScorePenalty = currentMode.pollutantPenalty;
	cleanMissesForLifePenalty = currentMode.cleanMissesForLifePenalty;
	currentSpawnDelay = currentMode.baseSpawnDelay;
	pollutantChance = currentMode.basePollutantChance;

	// Reset game values to mode defaults.
	score = initialScoreValue;
	timer = initialTimerValue;
	lives = initialLivesValue;
	missedCleanStreak = 0;
	resetMilestones();
	leftKeyDown = false;
	rightKeyDown = false;
	clearFloatingFeedback();

	// Update display and difficulty info.
	difficultyInfo.innerHTML = `Currently playing: <strong>${currentMode.displayName}</strong>`;
	updateDifficultyVisuals();
	targetScoreElement.textContent = targetScore;
	setFeedbackMessage(`Difficulty changed to ${currentMode.displayName}. Press Start to play!`, 'info');
	updateDisplay();
}

// ------------------------------------------------
// 4.6) updateDifficultyVisuals(): emphasize selected mode
// ------------------------------------------------
function updateDifficultyVisuals() {
	if (difficultySection) {
		difficultySection.setAttribute('data-mode', currentDifficulty);
	}
}

// -----------------------------------------------------
// 5) drawCatcher(): apply the current catcherX position
// -----------------------------------------------------
function drawCatcher() {
	playerCatcher.style.transform = 'none';
	playerCatcher.style.left = `${catcherX}px`;
}

// -----------------------------------------------------------------
// 6) centerCatcher(): place catcher at center (used on reset/start)
// -----------------------------------------------------------------
function centerCatcher() {
	const centerX = (gameArea.clientWidth - playerCatcher.offsetWidth) / 2;
	catcherX = clampCatcherX(centerX);
	drawCatcher();
}

// ------------------------------------------------------------------
// 7) moveCatcherBy(): move catcher left/right by a fixed step amount
// ------------------------------------------------------------------
function moveCatcherBy(deltaX) {
	catcherX = clampCatcherX(catcherX + deltaX);
	drawCatcher();
}

// -----------------------------------------------------------------------
// 8) moveCatcherToClientX(): place catcher under mouse/touch horizontally
// -----------------------------------------------------------------------
function moveCatcherToClientX(clientX) {
	const gameAreaRect = gameArea.getBoundingClientRect();
	const localX = clientX - gameAreaRect.left;
	const targetX = localX - playerCatcher.offsetWidth / 2;

	catcherX = clampCatcherX(targetX);
	drawCatcher();
}

// ---------------------------------------
// 9) updateDisplay(): update UI text values
// ---------------------------------------
function updateDisplay() {
	scoreElement.textContent = score;
	timeElement.textContent = timer;
	livesElement.textContent = lives;

	const progressPercent = Math.max(0, Math.min(100, Math.round((score / targetScore) * 100)));
	scoreProgressFill.style.width = `${progressPercent}%`;
	scoreProgressText.textContent = `${progressPercent}% to goal`;

	// Visual warning when timer is low.
	timerDisplayElement.classList.toggle('timer-warning', gameRunning && timer <= 15);
}

// -------------------------------------------------------------------------
// 10) setFeedbackMessage(): updates feedback text with a color-coded message
// -------------------------------------------------------------------------
function setFeedbackMessage(message, tone = 'info', lockMs = 0) {
	feedbackMessage.textContent = message;
	feedbackMessage.classList.remove(...feedbackClassNames);
	feedbackMessage.classList.add(`feedback-${tone}`);

	if (lockMs > 0) {
		feedbackLockUntil = Date.now() + lockMs;
	}
}

// -----------------------------------------------------------------------
// 10.5) createFloatingFeedback(): create floating text in game area
// -----------------------------------------------------------------------
// Creates a temporary floating feedback message at the event location.
// The message floats upward and fades out, then removes itself from the DOM.
function createFloatingFeedback(text, x, y, type = 'info') {
	const floatingElement = document.createElement('div');
	floatingElement.classList.add('floating-feedback');
	floatingElement.classList.add(`floating-${type}`);
	floatingElement.textContent = text;

	// Position it near the catch/miss event.
	floatingElement.style.left = `${x}px`;
	floatingElement.style.top = `${y}px`;

	gameArea.appendChild(floatingElement);

	// Remove the element after the animation completes (1 second).
	setTimeout(() => {
		floatingElement.remove();
	}, 1000);
}

function clearFloatingFeedback() {
	const floatingFeedbackElements = gameArea.querySelectorAll('.floating-feedback');
	floatingFeedbackElements.forEach((floatingElement) => {
		floatingElement.remove();
	});
}

function clearMilestoneBanner() {
	clearTimeout(milestoneBannerTimeoutId);
	milestoneBannerTimeoutId = null;

	const existingBanner = gameArea.querySelector('.milestone-banner');
	if (existingBanner) {
		existingBanner.remove();
	}
}

function showMilestoneBanner(text) {
	clearMilestoneBanner();

	const milestoneBanner = document.createElement('div');
	milestoneBanner.classList.add('milestone-banner');
	milestoneBanner.textContent = text;
	gameArea.appendChild(milestoneBanner);

	milestoneBannerTimeoutId = setTimeout(() => {
		milestoneBanner.remove();
		milestoneBannerTimeoutId = null;
	}, 1400);
}

function resetMilestones() {
	milestones = milestoneTemplates.map((milestoneTemplate) => ({
		thresholdPercent: milestoneTemplate.thresholdPercent,
		message: milestoneTemplate.message,
		hasTriggered: false
	}));

	clearMilestoneBanner();
}

// -----------------------------------------------------------------------
// 10.6) checkScoreMilestones(): trigger one-time milestone announcements
// -----------------------------------------------------------------------
function checkScoreMilestones() {
	const progressPercent = (score / targetScore) * 100;

	for (let i = 0; i < milestones.length; i += 1) {
		const milestone = milestones[i];

		if (!milestone.hasTriggered && progressPercent >= milestone.thresholdPercent) {
			milestone.hasTriggered = true;
			setFeedbackMessage(milestone.message, milestone.thresholdPercent === 100 ? 'success' : 'info', 1200);
			showMilestoneBanner(`${milestone.thresholdPercent}% Milestone`);

			const centerX = gameArea.clientWidth / 2 - 35;
			const topY = gameArea.clientHeight / 3;
			createFloatingFeedback(`${milestone.thresholdPercent}%`, centerX, topY, 'milestone');
		}
	}
}

// ----------------------------------------------------------------
// 11) applyKeyboardMovement(): smooth movement while key is held
// ----------------------------------------------------------------
function applyKeyboardMovement() {
	if (!gameRunning) {
		return;
	}

	if (leftKeyDown && !rightKeyDown) {
		moveCatcherBy(-keyboardMoveSpeed);
	}

	if (rightKeyDown && !leftKeyDown) {
		moveCatcherBy(keyboardMoveSpeed);
	}
}

// ------------------------------------------------------------
// 12) CELEBRATION LOGIC: remove confetti and reset banner style
// ------------------------------------------------------------
function clearCelebration() {
	clearTimeout(celebrationCleanupTimeoutId);
	celebrationCleanupTimeoutId = null;

	feedbackMessage.classList.remove('celebration-banner');
	clearMilestoneBanner();

	const celebrationLayer = gameArea.querySelector('.celebration-layer');
	if (celebrationLayer) {
		celebrationLayer.remove();
	}
}

// ----------------------------------------------------------
// 13) CELEBRATION LOGIC: create simple confetti on win
// ----------------------------------------------------------
function launchWinCelebration() {
	// Remove any old celebration first so effects do not stack.
	clearCelebration();
	feedbackMessage.classList.add('celebration-banner');

	const celebrationLayer = document.createElement('div');
	celebrationLayer.classList.add('celebration-layer');
	gameArea.appendChild(celebrationLayer);

	for (let i = 0; i < 40; i += 1) {
		const confettiPiece = document.createElement('span');
		confettiPiece.classList.add('confetti-piece');
		confettiPiece.style.left = `${Math.random() * 100}%`;
		confettiPiece.style.backgroundColor = confettiColors[i % confettiColors.length];
		confettiPiece.style.animationDelay = `${Math.random() * 0.7}s`;
		confettiPiece.style.animationDuration = `${2 + Math.random() * 1.2}s`;
		confettiPiece.style.transform = `rotate(${Math.random() * 360}deg)`;

		celebrationLayer.appendChild(confettiPiece);
	}

	// Auto-cleanup after a short celebration so the board is ready again.
	celebrationCleanupTimeoutId = setTimeout(() => {
		clearCelebration();
	}, 3200);
}

// ---------------------------------------------------------------------
// 14) CHALLENGE LOGIC: restart spawn loop when spawn speed changes
// ---------------------------------------------------------------------
function startSpawnLoop() {
	clearInterval(spawnIntervalId);
	spawnIntervalId = setInterval(spawnFallingItem, currentSpawnDelay);
}

// ----------------------------------------------------------------
// 15) CHALLENGE LOGIC: increase difficulty slightly as time goes down
// ----------------------------------------------------------------
function updateChallengeDifficulty() {
	const elapsedTime = initialTimerValue - timer;
	let newSpawnDelay = currentMode.baseSpawnDelay;
	let newPollutantChance = currentMode.basePollutantChance;

	// Level 2: a little faster and a few more pollutants.
	if (elapsedTime >= Math.floor(initialTimerValue * 0.33)) {
		newSpawnDelay = Math.floor(currentMode.baseSpawnDelay * 0.92);
		newPollutantChance = currentMode.basePollutantChance + 0.04;
	}

	// Level 3: slightly faster again, but still fair for students.
	if (elapsedTime >= Math.floor(initialTimerValue * 0.67)) {
		newSpawnDelay = Math.floor(currentMode.baseSpawnDelay * 0.85);
		newPollutantChance = currentMode.basePollutantChance + 0.08;
	}

	pollutantChance = newPollutantChance;

	if (newSpawnDelay !== currentSpawnDelay) {
		currentSpawnDelay = newSpawnDelay;
		startSpawnLoop();
	}
}

// ------------------------------------------------------------
// 16) checkWinLoseConditions(): checks if the game should end
// ------------------------------------------------------------
function checkWinLoseConditions() {
	// WIN CHECK:
	// If player reaches the target score before time runs out, they win.
	if (score >= targetScore) {
		// CELEBRATION TRIGGER:
		// Winning ends the game and starts confetti celebration.
		endGame(`You win! You reached ${targetScore} points.`, true);
		return true;
	}

	// LOSE CHECK #1:
	// If lives reach 0, the player loses.
	if (lives <= 0) {
		lives = 0;
		endGame('You lose! You ran out of lives.');
		return true;
	}

	// LOSE CHECK #2:
	// If timer reaches 0 before the target score, the player loses.
	if (timer <= 0 && score < targetScore) {
		timer = 0;
		endGame(`You lose! Time ran out before ${targetScore} points.`);
		return true;
	}

	return false;
}

// ----------------------------------------------------------
// 17) isColliding(): checks if catcher overlaps a falling item
// ----------------------------------------------------------
function isColliding(catcherRect, itemRect) {
	// Basic rectangle collision check:
	// If rectangles overlap on both X and Y axes, they are colliding.
	return (
		catcherRect.left < itemRect.right
		&& catcherRect.right > itemRect.left
		&& catcherRect.top < itemRect.bottom
		&& catcherRect.bottom > itemRect.top
	);
}

// -------------------------------------------------------
// 18) handleItemCollision(): apply score/life consequences
// -------------------------------------------------------
function handleItemCollision(item) {
	if (!gameRunning) {
		return;
	}

	// Get the position of the caught item for floating feedback.
	const itemRect = item.element.getBoundingClientRect();
	const gameAreaRect = gameArea.getBoundingClientRect();
	const floatingX = itemRect.left - gameAreaRect.left;
	const floatingY = itemRect.top - gameAreaRect.top;

	if (item.type === 'clean') {
		score += currentMode.cleanReward;
		missedCleanStreak = 0;
		playSound('catch');
		setFeedbackMessage('Great catch!', 'success', 850);
		// Show floating feedback for caught clean water.
		createFloatingFeedback(`+${currentMode.cleanReward}`, floatingX, floatingY, 'success');
		// Check if this catch reached a score milestone.
		checkScoreMilestones();
	} else {
		// CHALLENGE LOGIC:
		// Pollutants are obstacles. Catching one hurts score and lives.
		score = Math.max(0, score - pollutantScorePenalty);
		lives -= 1;
		playSound('miss');
		setFeedbackMessage(`Watch out for pollutants! -${pollutantScorePenalty} score and -1 life.`, 'danger', 1100);
		// Show floating feedback for caught pollutant.
		createFloatingFeedback(`-${pollutantScorePenalty}`, floatingX, floatingY, 'danger');
	}

	updateDisplay();
	checkWinLoseConditions();
}

// ----------------------------------------------------
// 19) handleMissedItem(): penalty when a drop is missed
// ----------------------------------------------------
function handleMissedItem(item) {
	if (!gameRunning) {
		return;
	}

	// Small penalty only when a clean drop is missed.
	if (item.type === 'clean') {
		score = Math.max(0, score - currentMode.missPenalty);
		playSound('miss');

		// Get position of the missed drop for floating feedback.
		const itemRect = item.element.getBoundingClientRect();
		const gameAreaRect = gameArea.getBoundingClientRect();
		const floatingX = itemRect.left - gameAreaRect.left;
		const floatingY = itemRect.top - gameAreaRect.top;

		// Show floating feedback for missed drop.
		createFloatingFeedback('Miss!', floatingX, floatingY, 'warning');

		// CHALLENGE LOGIC:
		// Missing too many clean drops in a row costs one life.
		missedCleanStreak += 1;

		if (missedCleanStreak >= cleanMissesForLifePenalty) {
			lives -= 1;
			missedCleanStreak = 0;
			setFeedbackMessage('You missed too many clean drops! -1 life.', 'danger', 1100);
		} else {
			const missesLeft = cleanMissesForLifePenalty - missedCleanStreak;
			setFeedbackMessage(`You missed one! ${missesLeft} more miss(es) before life penalty.`, 'warning', 1000);
		}

		updateDisplay();
		checkWinLoseConditions();
	}
}

// -----------------------------------------------------
// 20) spawnFallingItem(): creates one new falling item
// -----------------------------------------------------
function spawnFallingItem() {
	// Safety check: do not spawn if the game is not running.
	if (!gameRunning) {
		return;
	}

	// SPAWN LOGIC (beginner-friendly):
	// 1) Pick a random type.
	// 2) Create a DOM element.
	// 3) Place it at a random X position near the top.
	// 4) Save its type + position values in the fallingItems array.
	// CHALLENGE LOGIC:
	// pollutantChance can increase slightly over time.
	const isPollutantDrop = Math.random() < pollutantChance;
	const itemType = isPollutantDrop ? 'pollutant' : 'clean';

	const dropElement = document.createElement('div');
	dropElement.classList.add('drop');

	if (itemType === 'clean') {
		dropElement.classList.add('clean-drop');
	} else {
		dropElement.classList.add('pollutant-drop');
	}

	const itemSize = 24;
	const maxX = Math.max(0, gameArea.clientWidth - itemSize);
	const randomX = Math.floor(Math.random() * (maxX + 1));
	const startY = -itemSize;
	const elapsedTime = initialTimerValue - timer;
	const speedMultiplier = Math.min(1.3, 1 + (elapsedTime * 0.005));

	dropElement.style.left = `${randomX}px`;
	dropElement.style.top = `${startY}px`;
	gameArea.appendChild(dropElement);

	const newItem = {
		type: itemType,
		element: dropElement,
		x: randomX,
		y: startY,
		speed: (2 + Math.random() * 1.5) * speedMultiplier
	};

	fallingItems.push(newItem);
}

// ---------------------------------------------------------
// 21) moveFallingItems(): moves all items from top to bottom
// ---------------------------------------------------------
function moveFallingItems() {
	if (!gameRunning) {
		return;
	}

	applyKeyboardMovement();

	const catcherRect = playerCatcher.getBoundingClientRect();

	for (let i = fallingItems.length - 1; i >= 0; i -= 1) {
		const item = fallingItems[i];

		item.y += item.speed;
		item.element.style.top = `${item.y}px`;

		const itemRect = item.element.getBoundingClientRect();

		// If the catcher overlaps this item, apply score/life logic.
		if (isColliding(catcherRect, itemRect)) {
			handleItemCollision(item);

			if (!gameRunning) {
				return;
			}

			item.element.remove();
			fallingItems.splice(i, 1);
			continue;
		}

		// Remove items that leave the bottom of the game area.
		if (item.y > gameArea.clientHeight) {
			handleMissedItem(item);
			item.element.remove();
			fallingItems.splice(i, 1);
		}
	}
}

// ----------------------------------------------------
// 22) clearFallingItems(): removes all drops from DOM
// ----------------------------------------------------
function clearFallingItems() {
	for (let i = fallingItems.length - 1; i >= 0; i -= 1) {
		fallingItems[i].element.remove();
		fallingItems.splice(i, 1);
	}

	// Safety cleanup: remove any leftover DOM drops even if they were not in the array.
	const orphanDropElements = gameArea.querySelectorAll('.drop');
	orphanDropElements.forEach((dropElement) => {
		dropElement.remove();
	});
}

// ----------------------------------------------------
// 23) stopGameLoops(): clear every running interval
// ----------------------------------------------------
function stopGameLoops() {
	clearInterval(timerIntervalId);
	clearInterval(spawnIntervalId);
	clearInterval(gameLoopIntervalId);

	timerIntervalId = null;
	spawnIntervalId = null;
	gameLoopIntervalId = null;
}

// ---------------------------------------------------------
// 24) startGame(): starts timer and marks game as running
// ---------------------------------------------------------
function startGame() {
	// Prevent starting again if the game is already running.
	if (gameRunning) {
		setFeedbackMessage('Game is already running. Keep going!', 'warning', 900);
		return;
	}

	gameRunning = true;
	clearCelebration();
	setFeedbackMessage('Game started! Catch clean drops and avoid pollutants.', 'info');

	// Optional: disable Start while running so students can see game state clearly.
	startButton.disabled = true;

	// Countdown runs once every second.
	timerIntervalId = setInterval(() => {
		if (!gameRunning) {
			return;
		}

		timer -= 1;
		updateDisplay();
		updateChallengeDifficulty();

		if (checkWinLoseConditions()) {
			return;
		}

		// Update ambient feedback only when a collision/miss message is not locked.
		if (Date.now() >= feedbackLockUntil) {
			if (timer > 40) {
				setFeedbackMessage('Great start! Keep collecting clean water.', 'info');
			} else if (timer > 20) {
				setFeedbackMessage('Every drop helps. Keep your streak alive!', 'info');
			} else if (timer > 0) {
				setFeedbackMessage('Final stretch! Focus on clean drops.', 'warning');
			}
		}
	}, 1000);

	// Reset challenge values each time a new game starts.
	missedCleanStreak = 0;
	resetMilestones();
	currentSpawnDelay = currentMode.baseSpawnDelay;
	pollutantChance = currentMode.basePollutantChance;
	feedbackLockUntil = 0;

	// Spawn loop starts at a fair speed and can get slightly faster over time.
	startSpawnLoop();

	// Move all drops every 20ms for smooth falling.
	gameLoopIntervalId = setInterval(moveFallingItems, 20);

	updateDisplay();
}

// ------------------------------------------------------
// 25) resetGame(): fully reset values and stop the game
// ------------------------------------------------------
function resetGame() {
	// RESET STEP 1:
	// Mark game as not running right away so any queued callbacks stop changing values.
	gameRunning = false;

	// RESET STEP 2:
	// Stop every timer/interval (countdown, spawning, and movement loop).
	stopGameLoops();

	// RESET STEP 3:
	// Clear all falling objects from both the tracking array and the DOM.
	clearFallingItems();
	clearFloatingFeedback();
	clearCelebration();

	// RESET STEP 4:
	// Restore base game values for a fresh new run.
	score = initialScoreValue;
	timer = initialTimerValue;
	lives = initialLivesValue;
	missedCleanStreak = 0;
	resetMilestones();
	currentSpawnDelay = currentMode.baseSpawnDelay;
	pollutantChance = currentMode.basePollutantChance;
	feedbackLockUntil = 0;
	leftKeyDown = false;
	rightKeyDown = false;

	// RESET STEP 5:
	// Reset UI message, button state, and catcher position.
	setFeedbackMessage(resetMessageText, 'info');
	startButton.disabled = false;
	updateSoundToggleButton();
	centerCatcher();

	// RESET STEP 6:
	// Show restored values on screen immediately.
	updateDisplay();
}

// ------------------------------------------
// 26) endGame(): stop game and show final text
// ------------------------------------------
function endGame(reasonText = 'Time is up!', didWin = false) {
	if (!gameRunning && timerIntervalId === null && spawnIntervalId === null && gameLoopIntervalId === null) {
		return;
	}

	gameRunning = false;
	leftKeyDown = false;
	rightKeyDown = false;
	stopGameLoops();
	clearFallingItems();

	startButton.disabled = false;
	setFeedbackMessage(`${reasonText} Final score: ${score}`, didWin ? 'success' : 'danger');

	if (didWin) {
		playSound('win');
		launchWinCelebration();
	} else {
		clearCelebration();
	}

	updateDisplay();
}

// -------------------------------------------------
// 27) Keyboard control: ArrowLeft and ArrowRight
// -------------------------------------------------
document.addEventListener('keydown', (event) => {
	if (event.key === 'ArrowLeft') {
		event.preventDefault();
		leftKeyDown = true;
		moveCatcherBy(-catcherStep);
	} else if (event.key === 'ArrowRight') {
		event.preventDefault();
		rightKeyDown = true;
		moveCatcherBy(catcherStep);
	}
});

document.addEventListener('keyup', (event) => {
	if (event.key === 'ArrowLeft') {
		leftKeyDown = false;
	} else if (event.key === 'ArrowRight') {
		rightKeyDown = false;
	}
});

window.addEventListener('blur', () => {
	leftKeyDown = false;
	rightKeyDown = false;
});

// -----------------------------------------------------------------
// 28) Mouse control: move catcher while mouse moves in game area
// -----------------------------------------------------------------
gameArea.addEventListener('mousemove', (event) => {
	if (!gameRunning) {
		return;
	}

	moveCatcherToClientX(event.clientX);
});

// -----------------------------------------------------------------
// 29) Touch control: drag finger in game area to move the catcher
// -----------------------------------------------------------------
gameArea.addEventListener('touchstart', (event) => {
	if (!gameRunning || event.touches.length === 0) {
		return;
	}

	moveCatcherToClientX(event.touches[0].clientX);
}, { passive: true });

gameArea.addEventListener('touchmove', (event) => {
	if (!gameRunning || event.touches.length === 0) {
		return;
	}

	// Prevent page scrolling while dragging inside the game area.
	event.preventDefault();
	moveCatcherToClientX(event.touches[0].clientX);
}, { passive: false });

// -----------------------------------------------------------
// 30) Keep catcher in bounds when screen size changes (resize)
// -----------------------------------------------------------
window.addEventListener('resize', () => {
	catcherX = clampCatcherX(catcherX);
	drawCatcher();
});

// -----------------------------------
// 31) Connect buttons to the functions
// -----------------------------------
soundToggleButton.addEventListener('click', () => {
	const alreadyInteracted = hasUserInteracted;
	enableSoundAfterFirstInteraction();

	// First tap enables sound by default; later taps toggle on/off.
	if (alreadyInteracted) {
		soundEnabled = !soundEnabled;
		updateSoundToggleButton();
	}
});

startButton.addEventListener('click', () => {
	enableSoundAfterFirstInteraction();
	playSound('button');
	startGame();
});

resetButton.addEventListener('click', () => {
	enableSoundAfterFirstInteraction();
	playSound('button');
	resetGame();
});

// This keeps us from trying to autoplay sounds before any user gesture.
document.addEventListener('keydown', enableSoundAfterFirstInteraction, { once: true });
document.addEventListener('pointerdown', enableSoundAfterFirstInteraction, { once: true });

// -----------------------------------------------
// 31.5) Difficulty selector: change game mode
// -----------------------------------------------
// Players can only change difficulty when the game is not running.
difficultySelect.addEventListener('change', (event) => {
	applyDifficultyMode(event.target.value);
});

// Set the starting values on page load.
targetScoreElement.textContent = targetScore;
centerCatcher();
resetMilestones();
updateDifficultyVisuals();
updateSoundToggleButton();
setFeedbackMessage('Press Start to play!', 'info');
updateDisplay();
