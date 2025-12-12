/**
 * Conway's Game of Life Implementation
 * Uses HTML5 Canvas for rendering.
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const btnClear = document.getElementById('btn-clear');
const btnRandom = document.getElementById('btn-random');
const speedRange = document.getElementById('speed-range');
const genDisplay = document.getElementById('gen-count');
const popDisplay = document.getElementById('pop-count');

// Configuration
let CELL_SIZE = 10;
let ROWS, COLS;
let grid = [];
let nextGrid = [];
let isRunning = false;
let animationId;
let generation = 0;
let fps = 30;
let lastFrameTime = 0;

// Colors matching system theme (will be updated dynamically if needed)
const COLOR_ALIVE = '#2563eb'; // Primary Blue
const COLOR_DEAD = '#eff6ff'; // Very light blue/gray
const COLOR_DEAD_DARK = '#1f2937'; // Dark mode bg
let currentDeadColor = COLOR_DEAD;

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = 500; // Fixed height or dynamic

    // Recalculate grid size
    COLS = Math.floor(canvas.width / CELL_SIZE);
    ROWS = Math.floor(canvas.height / CELL_SIZE);

    initGrid();
    draw();
}

function initGrid() {
    grid = new Array(COLS).fill(null).map(() => new Array(ROWS).fill(0));
    nextGrid = new Array(COLS).fill(null).map(() => new Array(ROWS).fill(0));
    generation = 0;
    updateStats();
}

function randomize() {
    for (let i = 0; i < COLS; i++) {
        for (let j = 0; j < ROWS; j++) {
            grid[i][j] = Math.random() > 0.85 ? 1 : 0; // 15% density
        }
    }
    generation = 0;
    draw();
    updateStats();
}

function clear() {
    grid = new Array(COLS).fill(null).map(() => new Array(ROWS).fill(0));
    generation = 0;
    pause();
    draw();
    updateStats();
}

function draw() {
    // Check theme for colors
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    currentDeadColor = isDark ? '#1e232d' : '#f0f4f8';
    const aliveColor = isDark ? '#60a5fa' : '#2563eb'; // Lighter blue for dark mode

    ctx.fillStyle = currentDeadColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = aliveColor;
    for (let i = 0; i < COLS; i++) {
        for (let j = 0; j < ROWS; j++) {
            if (grid[i][j] === 1) {
                ctx.fillRect(i * CELL_SIZE, j * CELL_SIZE, CELL_SIZE - 1, CELL_SIZE - 1);
            }
        }
    }
}

function countNeighbors(x, y) {
    let sum = 0;
    for (let i = -1; i < 2; i++) {
        for (let j = -1; j < 2; j++) {
            const col = (x + i + COLS) % COLS;
            const row = (y + j + ROWS) % ROWS;
            sum += grid[col][row];
        }
    }
    sum -= grid[x][y];
    return sum;
}

function update() {
    let active = false;
    let pop = 0;

    for (let i = 0; i < COLS; i++) {
        for (let j = 0; j < ROWS; j++) {
            const state = grid[i][j];
            const neighbors = countNeighbors(i, j);

            if (state === 0 && neighbors === 3) {
                nextGrid[i][j] = 1;
                active = true;
            } else if (state === 1 && (neighbors < 2 || neighbors > 3)) {
                nextGrid[i][j] = 0;
                active = true;
            } else {
                nextGrid[i][j] = state;
            }

            if (nextGrid[i][j] === 1) pop++;
        }
    }

    [grid, nextGrid] = [nextGrid, grid]; // Swap buffers
    generation++;
    updateStats(pop);

    // If static, maybe pause? nah, let it run.
}

function loop(timestamp) {
    if (!isRunning) return;

    const now = timestamp;
    const elapsed = now - lastFrameTime;

    if (elapsed > (1000 / fps)) {
        lastFrameTime = now - (elapsed % (1000 / fps));
        update();
        draw();
    }

    animationId = requestAnimationFrame(loop);
}

function togglePlay() {
    isRunning = !isRunning;
    if (isRunning) {
        btnStart.textContent = 'Pause';
        btnStart.classList.add('active'); // Style update
        lastFrameTime = performance.now();
        loop(lastFrameTime);
    } else {
        btnStart.textContent = 'Start';
        btnStart.classList.remove('active');
        cancelAnimationFrame(animationId);
    }
}

function pause() {
    isRunning = false;
    btnStart.textContent = 'Start';
    btnStart.classList.remove('active');
    cancelAnimationFrame(animationId);
}

function updateStats(currentPop) {
    genDisplay.textContent = generation;
    if (currentPop !== undefined) {
        popDisplay.textContent = currentPop;
    } else {
        // Recalculate if not provided
        let pop = 0;
        for (let i = 0; i < COLS; i++) {
            for (let j = 0; j < ROWS; j++) {
                if (grid[i][j]) pop++;
            }
        }
        popDisplay.textContent = pop;
    }
}

// Interaction
canvas.addEventListener('mousedown', (e) => {
    drawCell(e);
    canvas.addEventListener('mousemove', drawCell);
});

window.addEventListener('mouseup', () => {
    canvas.removeEventListener('mousemove', drawCell);
});

function drawCell(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

    if (x >= 0 && x < COLS && y >= 0 && y < ROWS) {
        grid[x][y] = 1;
        draw();
        updateStats();
    }
}

// Controls
btnStart.addEventListener('click', togglePlay);
btnClear.addEventListener('click', clear);
btnRandom.addEventListener('click', randomize);
speedRange.addEventListener('input', (e) => {
    fps = parseInt(e.target.value);
});

// Init
window.addEventListener('resize', () => {
    // Only resize if significantly changed to avoid destructive resets on mobile scroll
    if (Math.abs(canvas.parentElement.clientWidth - canvas.width) > 50) {
        resizeCanvas();
    }
});

resizeCanvas();
randomize(); // Start with a random pattern
