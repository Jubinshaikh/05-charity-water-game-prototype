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

// ---------------------------
// 2) Game state variables
// ---------------------------
// These are the main values that change while playing.
const initialScoreValue = 0;
const initialTimerValue = 60;
const initialLivesValue = 3;
const resetMessageText = 'Game reset! Press Start to play again.';

let score = initialScoreValue;
let timer = initialTimerValue;
let lives = initialLivesValue;
let gameRunning = false;
const targetScore = 100;

// We store the interval ID so we can stop the timer later.
let timerIntervalId = null;
let spawnIntervalId = null;
let gameLoopIntervalId = null;
let celebrationCleanupTimeoutId = null;
let feedbackLockUntil = 0;

// -------------------------------
// CHALLENGE LOGIC (fair + simple)
// -------------------------------
// These values make pollutants feel like obstacles, add a penalty for
// missing many clean drops, and increase difficulty a little over time.
const pollutantScorePenalty = 5;
const cleanMissesForLifePenalty = 4;
let missedCleanStreak = 0;
let currentSpawnDelay = 900;
let pollutantChance = 0.3;
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
	let newSpawnDelay = 900;
	let newPollutantChance = 0.3;

	// Level 2: a little faster and a few more pollutants.
	if (elapsedTime >= 20) {
		newSpawnDelay = 820;
		newPollutantChance = 0.33;
	}

	// Level 3: slightly faster again, but still fair for students.
	if (elapsedTime >= 40) {
		newSpawnDelay = 760;
		newPollutantChance = 0.36;
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

	if (item.type === 'clean') {
		score += 10;
		missedCleanStreak = 0;
		setFeedbackMessage('Great catch!', 'success', 850);
	} else {
		// CHALLENGE LOGIC:
		// Pollutants are obstacles. Catching one hurts score and lives.
		score = Math.max(0, score - pollutantScorePenalty);
		lives -= 1;
		setFeedbackMessage('Watch out for pollutants! -5 score and -1 life.', 'danger', 1100);
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
		score = Math.max(0, score - 2);

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
	currentSpawnDelay = 900;
	pollutantChance = 0.3;
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
	clearCelebration();

	// RESET STEP 4:
	// Restore base game values for a fresh new run.
	score = initialScoreValue;
	timer = initialTimerValue;
	lives = initialLivesValue;
	missedCleanStreak = 0;
	currentSpawnDelay = 900;
	pollutantChance = 0.3;
	feedbackLockUntil = 0;
	leftKeyDown = false;
	rightKeyDown = false;

	// RESET STEP 5:
	// Reset UI message, button state, and catcher position.
	setFeedbackMessage(resetMessageText, 'info');
	startButton.disabled = false;
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
startButton.addEventListener('click', startGame);
resetButton.addEventListener('click', resetGame);

// Set the starting values on page load.
targetScoreElement.textContent = targetScore;
centerCatcher();
setFeedbackMessage('Press Start to play!', 'info');
updateDisplay();
