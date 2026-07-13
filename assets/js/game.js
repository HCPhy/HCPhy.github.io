/**
 * Conway's Game of Life.
 * Canvas rendering uses CSS-pixel coordinates and a high-DPI backing store.
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const btnStep = document.getElementById('btn-step');
const btnClear = document.getElementById('btn-clear');
const btnRandom = document.getElementById('btn-random');
const speedRange = document.getElementById('speed-range');
const genDisplay = document.getElementById('gen-count');
const popDisplay = document.getElementById('pop-count');
const announcement = document.getElementById('game-announcement');

const CELL_SIZE = 10;
let rows = 0;
let cols = 0;
let canvasWidth = 0;
let canvasHeight = 0;
let grid = [];
let nextGrid = [];
let isRunning = false;
let animationId = 0;
let generation = 0;
let fps = 30;
let lastFrameTime = 0;
let cursorCol = 0;
let cursorRow = 0;
let activePointer = null;
let paintValue = 1;
let resizeFrame = 0;

function createGrid(width, height) {
    return new Array(width).fill(null).map(() => new Uint8Array(height));
}

function resizeCanvas(preserve = true) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const oldGrid = grid;
    const oldCols = cols;
    const oldRows = rows;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvasWidth = Math.round(rect.width);
    canvasHeight = Math.round(rect.height);
    canvas.width = Math.round(canvasWidth * dpr);
    canvas.height = Math.round(canvasHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.max(1, Math.floor(canvasWidth / CELL_SIZE));
    rows = Math.max(1, Math.floor(canvasHeight / CELL_SIZE));
    grid = createGrid(cols, rows);
    nextGrid = createGrid(cols, rows);

    if (preserve && oldGrid.length) {
        for (let col = 0; col < Math.min(cols, oldCols); col++) {
            grid[col].set(oldGrid[col].subarray(0, Math.min(rows, oldRows)));
        }
    } else {
        generation = 0;
    }

    cursorCol = Math.min(cursorCol, cols - 1);
    cursorRow = Math.min(cursorRow, rows - 1);
    draw();
    updateStats();
}

function randomize() {
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            grid[col][row] = Math.random() > 0.85 ? 1 : 0;
        }
    }
    generation = 0;
    draw();
    updateStats();
    announce('Grid randomized.');
}

function clearGrid() {
    grid = createGrid(cols, rows);
    nextGrid = createGrid(cols, rows);
    generation = 0;
    pause();
    draw();
    updateStats();
    announce('Grid cleared.');
}

function draw() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const deadColor = isDark ? '#1e232d' : '#f0f4f8';
    const aliveColor = isDark ? '#60a5fa' : '#2563eb';
    const cursorColor = isDark ? '#f6b94a' : '#9a5b06';
    const cellWidth = canvasWidth / cols;
    const cellHeight = canvasHeight / rows;

    ctx.fillStyle = deadColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    ctx.fillStyle = aliveColor;
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            if (grid[col][row] === 1) {
                ctx.fillRect(col * cellWidth, row * cellHeight, Math.max(1, cellWidth - 1), Math.max(1, cellHeight - 1));
            }
        }
    }

    if (document.activeElement === canvas) {
        ctx.save();
        ctx.strokeStyle = cursorColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(cursorCol * cellWidth + 1, cursorRow * cellHeight + 1, cellWidth - 3, cellHeight - 3);
        ctx.restore();
    }
}

function countNeighbors(x, y) {
    let sum = 0;
    for (let colOffset = -1; colOffset <= 1; colOffset++) {
        for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
            const col = (x + colOffset + cols) % cols;
            const row = (y + rowOffset + rows) % rows;
            sum += grid[col][row];
        }
    }
    return sum - grid[x][y];
}

function update() {
    let population = 0;

    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const state = grid[col][row];
            const neighbors = countNeighbors(col, row);
            const survives = state === 1 && (neighbors === 2 || neighbors === 3);
            const born = state === 0 && neighbors === 3;
            nextGrid[col][row] = survives || born ? 1 : 0;
            population += nextGrid[col][row];
        }
    }

    [grid, nextGrid] = [nextGrid, grid];
    generation++;
    updateStats(population);
}

function loop(timestamp) {
    if (!isRunning) return;

    const interval = 1000 / fps;
    const elapsed = timestamp - lastFrameTime;
    if (elapsed >= interval) {
        lastFrameTime = timestamp - (elapsed % interval);
        update();
        draw();
    }

    animationId = requestAnimationFrame(loop);
}

function togglePlay() {
    if (isRunning) {
        pause();
        announce(`Paused at generation ${generation}.`);
        return;
    }

    isRunning = true;
    btnStart.textContent = 'Pause';
    lastFrameTime = performance.now();
    animationId = requestAnimationFrame(loop);
    announce('Simulation started.');
}

function pause() {
    isRunning = false;
    btnStart.textContent = 'Start';
    cancelAnimationFrame(animationId);
}

function stepOnce() {
    pause();
    update();
    draw();
    announce(`Generation ${generation}, population ${popDisplay.textContent}.`);
}

function updateStats(population) {
    genDisplay.textContent = generation;
    if (population !== undefined) {
        popDisplay.textContent = population;
        return;
    }

    let currentPopulation = 0;
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) currentPopulation += grid[col][row];
    }
    popDisplay.textContent = currentPopulation;
}

function announce(message) {
    if (announcement) announcement.textContent = message;
}

function announceCursor() {
    const state = grid[cursorCol][cursorRow] ? 'alive' : 'dead';
    announce(`Column ${cursorCol + 1}, row ${cursorRow + 1}, ${state}.`);
}

function pointerCell(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvasWidth / rect.width);
    const y = (event.clientY - rect.top) * (canvasHeight / rect.height);
    return {
        col: Math.floor(x / (canvasWidth / cols)),
        row: Math.floor(y / (canvasHeight / rows))
    };
}

function paintCell(event) {
    const { col, row } = pointerCell(event);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;

    cursorCol = col;
    cursorRow = row;
    if (grid[col][row] !== paintValue) {
        grid[col][row] = paintValue;
        draw();
        updateStats();
    }
}

canvas.addEventListener('pointerdown', event => {
    if (activePointer !== null) return;
    event.preventDefault();
    const { col, row } = pointerCell(event);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;

    activePointer = event.pointerId;
    paintValue = grid[col][row] ? 0 : 1;
    canvas.setPointerCapture(event.pointerId);
    paintCell(event);
});

canvas.addEventListener('pointermove', event => {
    if (event.pointerId === activePointer) paintCell(event);
});

function endPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('keydown', event => {
    let toggled = false;
    if (event.key === 'ArrowLeft') cursorCol = (cursorCol - 1 + cols) % cols;
    else if (event.key === 'ArrowRight') cursorCol = (cursorCol + 1) % cols;
    else if (event.key === 'ArrowUp') cursorRow = (cursorRow - 1 + rows) % rows;
    else if (event.key === 'ArrowDown') cursorRow = (cursorRow + 1) % rows;
    else if (event.key === ' ' || event.key === 'Enter') {
        grid[cursorCol][cursorRow] ^= 1;
        updateStats();
        toggled = true;
    } else return;

    event.preventDefault();
    draw();
    if (toggled) announce(`Column ${cursorCol + 1}, row ${cursorRow + 1}, changed to ${grid[cursorCol][cursorRow] ? 'alive' : 'dead'}.`);
    else announceCursor();
});

canvas.addEventListener('focus', () => {
    draw();
    announceCursor();
});
canvas.addEventListener('blur', draw);
btnStart.addEventListener('click', togglePlay);
btnStep.addEventListener('click', stepOnce);
btnClear.addEventListener('click', clearGrid);
btnRandom.addEventListener('click', randomize);
speedRange.addEventListener('input', event => {
    fps = Number.parseInt(event.target.value, 10);
    event.target.setAttribute('aria-valuetext', `${fps} generations per second`);
});

document.addEventListener('themechange', draw);
document.addEventListener('site:tabchange', event => {
    if (event.detail.tabId !== 'game-life' && isRunning) {
        pause();
        announce('Simulation paused because its tab was hidden.');
    }
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRunning) pause();
});

const resizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
        const rect = canvas.getBoundingClientRect();
        if (Math.abs(rect.width - canvasWidth) > 1 || Math.abs(rect.height - canvasHeight) > 1) {
            resizeCanvas(true);
        }
    });
});
resizeObserver.observe(canvas);

resizeCanvas(false);
randomize();
