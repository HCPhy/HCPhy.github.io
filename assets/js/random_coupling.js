(() => {
    /** Bit-packed GF(2) solver for the random-coupling lattice. */
    const canvas = document.getElementById('rc-canvas');
    const ctx = canvas.getContext('2d');
    const resetButton = document.getElementById('rc-reset');
    const resultLabel = document.getElementById('rc-result-label');
    const resultDisplay = document.getElementById('rc-degen');
    const sizeDisplay = document.getElementById('rc-size-display');
    const announcement = document.getElementById('rc-announcement');

    const TARGET_CELL_SIZE = 32;
    let rows = 0;
    let cols = 0;
    let siteCount = 0;
    let wordsPerRow = 0;
    let canvasWidth = 0;
    let canvasHeight = 0;
    let neighbors;
    let matrixPool;
    let rhsPool;
    let pivotMap;
    let couplings;
    let spins;
    let initialized = false;
    let cursorCol = 0;
    let cursorRow = 0;
    let pointerStart = null;
    let resizeFrame = 0;
    let resizeTimer = 0;

    const bitMask = index => 1 << (index & 31);
    const wordOf = index => index >>> 5;

    function parity32(value) {
        value ^= value >>> 16;
        value ^= value >>> 8;
        value ^= value >>> 4;
        return (0x6996 >>> (value & 0xf)) & 1;
    }

    function buildNeighbors() {
        neighbors = new Int32Array(siteCount * 4);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col;
                const base = index * 4;
                neighbors[base] = row > 0 ? index - cols : -1;
                neighbors[base + 1] = row + 1 < rows ? index + cols : -1;
                neighbors[base + 2] = col > 0 ? index - 1 : -1;
                neighbors[base + 3] = col + 1 < cols ? index + 1 : -1;
            }
        }
    }

    function resizeSurface(rect) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasWidth = Math.max(1, Math.round(rect.width));
        canvasHeight = Math.max(1, Math.round(rect.height));
        canvas.width = Math.round(canvasWidth * dpr);
        canvas.height = Math.round(canvasHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function dimensionsFor(rect) {
        return {
            rows: Math.max(1, Math.floor(Math.round(rect.height) / TARGET_CELL_SIZE)),
            cols: Math.max(1, Math.floor(Math.round(rect.width) / TARGET_CELL_SIZE))
        };
    }

    function resizeModel(preserve = true) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;

        const oldCouplings = couplings;
        const oldRows = rows;
        const oldCols = cols;
        resizeSurface(rect);
        const dimensions = dimensionsFor(rect);
        rows = dimensions.rows;
        cols = dimensions.cols;
        siteCount = rows * cols;
        wordsPerRow = Math.ceil(siteCount / 32);
        matrixPool = new Uint32Array(siteCount * wordsPerRow);
        rhsPool = new Uint32Array(wordsPerRow);
        pivotMap = new Int32Array(siteCount);
        couplings = new Uint8Array(siteCount);
        spins = new Uint8Array(siteCount);

        if (preserve && oldCouplings) {
            for (let row = 0; row < Math.min(rows, oldRows); row++) {
                const oldStart = row * oldCols;
                const newStart = row * cols;
                couplings.set(oldCouplings.subarray(oldStart, oldStart + Math.min(cols, oldCols)), newStart);
            }
        }

        cursorCol = Math.min(cursorCol, cols - 1);
        cursorRow = Math.min(cursorRow, rows - 1);
        buildNeighbors();
        sizeDisplay.textContent = `${cols}×${rows}`;
        initialized = true;
        solveGroundState();
        draw();
        return true;
    }

    function buildSystem() {
        matrixPool.fill(0);
        rhsPool.fill(0);
        pivotMap.fill(-1);

        for (let index = 0; index < siteCount; index++) {
            const rowStart = index * wordsPerRow;
            matrixPool[rowStart + wordOf(index)] |= bitMask(index);

            if (couplings[index] === 1) {
                rhsPool[wordOf(index)] |= bitMask(index);
                continue;
            }

            const base = index * 4;
            for (let direction = 0; direction < 4; direction++) {
                const neighbor = neighbors[base + direction];
                if (neighbor !== -1) matrixPool[rowStart + wordOf(neighbor)] |= bitMask(neighbor);
            }
        }
    }

    function solveGroundState() {
        if (!initialized) return false;
        buildSystem();

        let rank = 0;
        for (let col = 0; col < siteCount && rank < siteCount; col++) {
            const wordOffset = wordOf(col);
            const mask = bitMask(col);
            let selectedRow = -1;

            for (let row = rank; row < siteCount; row++) {
                if (matrixPool[row * wordsPerRow + wordOffset] & mask) {
                    selectedRow = row;
                    break;
                }
            }
            if (selectedRow === -1) continue;

            if (selectedRow !== rank) {
                const rankStart = rank * wordsPerRow;
                const selectedStart = selectedRow * wordsPerRow;
                for (let word = 0; word < wordsPerRow; word++) {
                    const swap = matrixPool[rankStart + word];
                    matrixPool[rankStart + word] = matrixPool[selectedStart + word];
                    matrixPool[selectedStart + word] = swap;
                }

                const rankBit = (rhsPool[wordOf(rank)] & bitMask(rank)) !== 0;
                const selectedBit = (rhsPool[wordOf(selectedRow)] & bitMask(selectedRow)) !== 0;
                if (rankBit !== selectedBit) {
                    rhsPool[wordOf(rank)] ^= bitMask(rank);
                    rhsPool[wordOf(selectedRow)] ^= bitMask(selectedRow);
                }
            }

            pivotMap[rank] = col;
            const pivotStart = rank * wordsPerRow;
            const pivotRhs = (rhsPool[wordOf(rank)] >>> (rank & 31)) & 1;

            for (let row = rank + 1; row < siteCount; row++) {
                const rowStart = row * wordsPerRow;
                if (!(matrixPool[rowStart + wordOffset] & mask)) continue;
                for (let word = 0; word < wordsPerRow; word++) {
                    matrixPool[rowStart + word] ^= matrixPool[pivotStart + word];
                }
                if (pivotRhs) rhsPool[wordOf(row)] ^= bitMask(row);
            }
            rank++;
        }

        for (let row = rank; row < siteCount; row++) {
            let hasCoefficient = false;
            const rowStart = row * wordsPerRow;
            for (let word = 0; word < wordsPerRow; word++) {
                if (matrixPool[rowStart + word] !== 0) {
                    hasCoefficient = true;
                    break;
                }
            }
            const rhs = (rhsPool[wordOf(row)] >>> (row & 31)) & 1;
            if (!hasCoefficient && rhs === 1) {
                spins.fill(0);
                resultLabel.textContent = 'Status';
                resultDisplay.textContent = 'No solution';
                announce('This coupling configuration has no solution.');
                return false;
            }
        }

        spins.fill(0);
        const solutionWords = new Uint32Array(wordsPerRow);
        for (let row = rank - 1; row >= 0; row--) {
            const pivotCol = pivotMap[row];
            const rowStart = row * wordsPerRow;
            let parity = 0;
            for (let word = 0; word < wordsPerRow; word++) {
                parity ^= parity32(matrixPool[rowStart + word] & solutionWords[word]);
            }
            const rhs = (rhsPool[wordOf(row)] >>> (row & 31)) & 1;
            if (rhs ^ parity) {
                solutionWords[wordOf(pivotCol)] |= bitMask(pivotCol);
                spins[pivotCol] = 1;
            }
        }

        if (!verifySolution()) {
            spins.fill(0);
            resultLabel.textContent = 'Status';
            resultDisplay.textContent = 'No solution';
            announce('The computed state failed verification.');
            return false;
        }

        const degeneracy = siteCount - rank;
        resultLabel.textContent = 'Log degeneracy';
        resultDisplay.textContent = String(degeneracy);
        announce(`Log degeneracy ${degeneracy}.`);
        return true;
    }

    function verifySolution() {
        for (let index = 0; index < siteCount; index++) {
            let lhs = spins[index];
            if (couplings[index] === 0) {
                const base = index * 4;
                for (let direction = 0; direction < 4; direction++) {
                    const neighbor = neighbors[base + direction];
                    if (neighbor !== -1) lhs ^= spins[neighbor];
                }
            }
            if (lhs !== couplings[index]) return false;
        }
        return true;
    }

    function draw() {
        if (!initialized) return;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const deadColor = isDark ? '#1e232d' : '#f0f4f8';
        const aliveColor = isDark ? '#60a5fa' : '#2563eb';
        const ringColor = isDark ? '#ffffff' : '#17202b';
        const markerColor = '#f6b94a';
        const cellWidth = canvasWidth / cols;
        const cellHeight = canvasHeight / rows;

        ctx.fillStyle = deadColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const index = row * cols + col;
                const x = col * cellWidth;
                const y = row * cellHeight;

                if (spins[index]) {
                    ctx.fillStyle = aliveColor;
                    ctx.fillRect(x, y, cellWidth, cellHeight);
                }

                if (couplings[index]) {
                    const radius = Math.min(cellWidth, cellHeight);
                    ctx.fillStyle = ringColor;
                    ctx.beginPath();
                    ctx.arc(x + cellWidth / 2, y + cellHeight / 2, radius * 0.29, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = markerColor;
                    ctx.beginPath();
                    ctx.arc(x + cellWidth / 2, y + cellHeight / 2, radius * 0.19, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        if (document.activeElement === canvas) {
            ctx.save();
            ctx.strokeStyle = markerColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(cursorCol * cellWidth + 2, cursorRow * cellHeight + 2, cellWidth - 4, cellHeight - 4);
            ctx.restore();
        }
    }

    function announce(message) {
        if (announcement) announcement.textContent = message;
    }

    function resultSummary() {
        return resultLabel.textContent === 'Status'
            ? resultDisplay.textContent
            : `log degeneracy ${resultDisplay.textContent}`;
    }

    function announceCursor(prefix = '') {
        const state = couplings[cursorRow * cols + cursorCol] ? 'one-body' : 'five-body';
        const lead = prefix ? `${prefix} ` : '';
        announce(`${lead}Column ${cursorCol + 1}, row ${cursorRow + 1}, ${state}. ${resultSummary()}.`);
    }

    function toggleCell(col, row) {
        if (!initialized || col < 0 || col >= cols || row < 0 || row >= rows) return;
        cursorCol = col;
        cursorRow = row;
        couplings[row * cols + col] ^= 1;
        solveGroundState();
        draw();
        announceCursor('Changed.');
    }

    canvas.addEventListener('pointerdown', event => {
        if (!initialized || pointerStart || (event.button !== undefined && event.button !== 0)) return;
        pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });

    canvas.addEventListener('pointerup', event => {
        if (!pointerStart || pointerStart.id !== event.pointerId) return;
        const movement = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
        pointerStart = null;
        if (movement > 8) return;
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (canvasWidth / rect.width);
        const y = (event.clientY - rect.top) * (canvasHeight / rect.height);
        toggleCell(Math.floor(x / (canvasWidth / cols)), Math.floor(y / (canvasHeight / rows)));
    });

    canvas.addEventListener('pointercancel', () => {
        pointerStart = null;
    });

    canvas.addEventListener('keydown', event => {
        if (!initialized) return;
        let toggled = false;
        if (event.key === 'ArrowLeft') cursorCol = (cursorCol - 1 + cols) % cols;
        else if (event.key === 'ArrowRight') cursorCol = (cursorCol + 1) % cols;
        else if (event.key === 'ArrowUp') cursorRow = (cursorRow - 1 + rows) % rows;
        else if (event.key === 'ArrowDown') cursorRow = (cursorRow + 1) % rows;
        else if (event.key === ' ' || event.key === 'Enter') {
            toggleCell(cursorCol, cursorRow);
            toggled = true;
        }
        else return;

        event.preventDefault();
        if (!toggled) {
            draw();
            announceCursor();
        }
    });

    canvas.addEventListener('focus', () => {
        draw();
        announceCursor();
    });
    canvas.addEventListener('blur', draw);
    resetButton.addEventListener('click', () => {
        if (!initialized) return;
        couplings.fill(0);
        solveGroundState();
        draw();
        announce('All sites reset to five-body couplings.');
    });

    window.initRandomCoupling = () => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        if (!initialized) {
            resizeModel(false);
        } else if (Math.abs(rect.width - canvasWidth) > 1 || Math.abs(rect.height - canvasHeight) > 1) {
            const dimensions = dimensionsFor(rect);
            if (dimensions.rows === rows && dimensions.cols === cols) {
                resizeSurface(rect);
                draw();
            } else {
                resizeModel(true);
            }
        } else {
            draw();
        }
    };

    document.addEventListener('themechange', draw);

    const resizeObserver = new ResizeObserver(() => {
        if (canvas.offsetParent === null) return;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            const rect = canvas.getBoundingClientRect();
            if (!initialized) {
                resizeModel(true);
                return;
            }
            if (Math.abs(rect.width - canvasWidth) <= 1 && Math.abs(rect.height - canvasHeight) <= 1) return;

            const dimensions = dimensionsFor(rect);
            if (dimensions.rows === rows && dimensions.cols === cols) {
                clearTimeout(resizeTimer);
                resizeSurface(rect);
                draw();
                return;
            }

            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => resizeModel(true), 140);
        });
    });
    resizeObserver.observe(canvas);
})();
