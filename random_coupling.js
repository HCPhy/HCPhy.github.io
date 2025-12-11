(() => {
    /**
     * Random Coupling Model Implementation (Bit-Packed)
     * Solves Ax = b over GF(2) for 32x32 lattice.
     */

    const rcCanvas = document.getElementById('rc-canvas');
    // ... [rest of file] ...
    // I will apply the IIFE pattern by indenting or just wrapping.
    // Actually, since this is a replace_file, I should replace the start and end.

    // IIFE start continues...
    const rcCtx = rcCanvas.getContext('2d');
    const btnResetRC = document.getElementById('rc-reset');
    const degenDisplay = document.getElementById('rc-degen');
    const sizeDisplay = document.getElementById('rc-size-display'); // Need to add this ID to HTML possibly

    // Config
    const TARGET_CELL_SIZE = 32; // Target ~20px per cell
    let RC_ROWS, RC_COLS;
    let N;
    let WORDS_PER_ROW;

    // Memory Pools (resizable)
    let A_pool, b_pool, pivotMap, couplings, spins;

    let isInitialized = false;

    // Theme colors (Match Game of Life)
    const COLOR_ALIVE_LIGHT = '#2563eb'; // blue-600
    const COLOR_ALIVE_DARK = '#60a5fa';  // blue-400
    const COLOR_DEAD_LIGHT = '#f0f4f8';
    const COLOR_DEAD_DARK = '#1e232d';
    const COLOR_COUPLING_MARKER = '#ef4444'; // Red

    function initRC() {
        if (!rcCanvas.parentElement) return;

        const container = rcCanvas.parentElement;
        const rect = container.getBoundingClientRect();
        if (rect.width === 0) return;

        // target height 500px to match Game of Life
        rcCanvas.height = 1000;
        rcCanvas.width = rect.width;

        RC_ROWS = Math.floor(rcCanvas.height / TARGET_CELL_SIZE);
        RC_COLS = Math.floor(rcCanvas.width / TARGET_CELL_SIZE);

        // Safety cap for performance N < 1200?
        // 800px / 20 = 40. 500 / 20 = 25. N = 1000. Fine.

        N = RC_ROWS * RC_COLS;
        WORDS_PER_ROW = Math.ceil(N / 32);

        // Re-allocate if size changed significantly or first run
        // For simplicity, just reallocate. JS GC handles TypedArrays well.
        A_pool = new Uint32Array(N * WORDS_PER_ROW);
        b_pool = new Uint32Array(WORDS_PER_ROW);
        pivotMap = new Int32Array(N);
        couplings = new Uint8Array(N).fill(0);
        spins = new Uint8Array(N).fill(0);

        // Update Size Display
        if (sizeDisplay) sizeDisplay.textContent = `${RC_COLS}x${RC_ROWS}`;
        else if (degenDisplay && degenDisplay.nextElementSibling) {
            degenDisplay.nextElementSibling.textContent = `System Size: ${RC_COLS}x${RC_ROWS}`;
        }

        drawRC();
        solveGroundState();
        isInitialized = true;
    }

    // -------------------------------------------------------------
    // Bit-Packed Gaussian Elimination (Optimized)
    // -------------------------------------------------------------
    function solveGroundState() {
        // Reset/Clear buffers
        A_pool.fill(0);
        b_pool.fill(0);
        pivotMap.fill(-1);

        const A = A_pool;
        const b = b_pool;

        // Helper to set bit (row, col) in A
        function setBit(row, col) {
            const wordIdx = row * WORDS_PER_ROW + (col >>> 5);
            const bitIdx = col & 31;
            A[wordIdx] |= (1 << bitIdx);
        }

        // Helper to set bit in b (row index is bit position)
        function setB(row, val) {
            if (!val) return;
            const wordIdx = row >>> 5;
            const bitIdx = row & 31;
            b[wordIdx] |= (1 << bitIdx);
        }

        // Build constraints
        for (let r = 0; r < RC_ROWS; r++) {
            for (let c = 0; c < RC_COLS; c++) {
                const idx = r * RC_COLS + c;

                if (couplings[idx] === 1) {
                    // Single site: x_idx = 1
                    setBit(idx, idx);
                    setB(idx, 1);
                } else {
                    // 5-body: Center + N + S + E + W = 0
                    setBit(idx, idx);
                    const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                    for (let [nr, nc] of neighbors) {
                        if (nr >= 0 && nr < RC_ROWS && nc >= 0 && nc < RC_COLS) {
                            setBit(idx, nr * RC_COLS + nc);
                        }
                    }
                    setB(idx, 0);
                }
            }
        }

        // Gaussian Elimination
        let pivotRow = 0;

        for (let k = 0; k < N && pivotRow < N; k++) { // Column k
            // Find pivot
            const wordOffset = k >>> 5;
            const bitMask = 1 << (k & 31);
            let sel = -1;

            for (let row = pivotRow; row < N; row++) {
                if (A[row * WORDS_PER_ROW + wordOffset] & bitMask) {
                    sel = row;
                    break;
                }
            }

            if (sel === -1) continue; // Free variable

            // Swap pivotRow and sel
            if (sel !== pivotRow) {
                // Swap A rows
                const start1 = pivotRow * WORDS_PER_ROW;
                const start2 = sel * WORDS_PER_ROW;
                for (let w = 0; w < WORDS_PER_ROW; w++) {
                    let tmp = A[start1 + w];
                    A[start1 + w] = A[start2 + w];
                    A[start2 + w] = tmp;
                }
                // Swap b bits
                const w1 = pivotRow >>> 5; const b1 = pivotRow & 31;
                const w2 = sel >>> 5; const b2 = sel & 31;

                const val1 = (b[w1] >>> b1) & 1;
                const val2 = (b[w2] >>> b2) & 1;

                if (val1 !== val2) {
                    b[w1] ^= (1 << b1);
                    b[w2] ^= (1 << b2);
                }
            }

            // Record pivot
            pivotMap[k] = pivotRow;

            // Eliminate
            const pStart = pivotRow * WORDS_PER_ROW;
            const pVal = (b[pivotRow >>> 5] >>> (pivotRow & 31)) & 1;

            for (let row = 0; row < N; row++) {
                if (row !== pivotRow) {
                    if (A[row * WORDS_PER_ROW + wordOffset] & bitMask) {
                        // XOR Row
                        const rStart = row * WORDS_PER_ROW;
                        for (let w = 0; w < WORDS_PER_ROW; w++) {
                            A[rStart + w] ^= A[pStart + w];
                        }
                        // XOR b
                        // const rVal = (b[row >>> 5] >>> (row & 31)) & 1; // Unused
                        if (pVal !== 0) {
                            const wb = row >>> 5;
                            b[wb] ^= (1 << (row & 31));
                        }
                    }
                }
            }
            pivotRow++;
        }

        // Back substitution? 
        // Since we eliminated above and below (Gauss-Jordan style elimination in loop), 
        // the matrix is already diagonalized at pivot columns.
        // x_k = b_pivotRow if k is a pivot column.
        // x_k = 0 (free) if k is free variable.

        // Update Degeneracy Display
        const rank = pivotRow;
        const degeneracy = N - rank;
        if (degenDisplay) degenDisplay.textContent = degeneracy;

        // Extract Solution
        spins.fill(0);
        for (let k = 0; k < N; k++) {
            const pRow = pivotMap[k];
            if (pRow !== -1) {
                spins[k] = (b[pRow >>> 5] >>> (pRow & 31)) & 1;
            }
        }
    }

    function drawRC() {
        rcCtx.clearRect(0, 0, rcCanvas.width, rcCanvas.height);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const cDead = isDark ? COLOR_DEAD_DARK : COLOR_DEAD_LIGHT;
        const cAlive = isDark ? COLOR_ALIVE_DARK : COLOR_ALIVE_LIGHT;

        const cellW = rcCanvas.width / RC_COLS;
        const cellH = rcCanvas.height / RC_ROWS;

        // Draw background
        rcCtx.fillStyle = cDead;
        rcCtx.fillRect(0, 0, rcCanvas.width, rcCanvas.height);

        for (let r = 0; r < RC_ROWS; r++) {
            for (let c = 0; c < RC_COLS; c++) {
                const idx = r * RC_COLS + c;
                const x = c * cellW;
                const y = r * cellH;

                // Draw Spin
                if (spins[idx]) {
                    rcCtx.fillStyle = cAlive;
                    rcCtx.fillRect(x, y, cellW, cellH);
                }

                // Marker
                if (couplings[idx] === 1) {
                    rcCtx.fillStyle = COLOR_COUPLING_MARKER;
                    rcCtx.beginPath();
                    rcCtx.arc(x + cellW / 2, y + cellH / 2, Math.min(cellW, cellH) / 4, 0, Math.PI * 2);
                    rcCtx.fill();
                }
            }
        }
    }

    // Interaction
    rcCanvas.addEventListener('mousedown', (e) => {
        const rect = rcCanvas.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        // Scale handled by using canvas dimensions directly in calculation?
        // Rect size vs Canvas size:
        const scaleX = rcCanvas.width / rect.width;
        const scaleY = rcCanvas.height / rect.height;

        const canvasX = cursorX * scaleX;
        const canvasY = cursorY * scaleY;

        const cellW = rcCanvas.width / RC_COLS;
        const cellH = rcCanvas.height / RC_ROWS;

        const c = Math.floor(canvasX / cellW);
        const r = Math.floor(canvasY / cellH);

        if (c >= 0 && c < RC_COLS && r >= 0 && r < RC_ROWS) {
            const idx = r * RC_COLS + c;
            couplings[idx] ^= 1;
            solveGroundState();
            drawRC();
        }
    });

    btnResetRC.addEventListener('click', () => {
        couplings.fill(0);
        solveGroundState();
        drawRC();
    });

    // Init
    window.initRandomCoupling = function () {
        const rect = rcCanvas.parentElement.getBoundingClientRect();
        if (rect.width > 0) {
            initRC();
            // Solve once if not already solved (or just solve again, it's fast)
            // solveGroundState(); // Called inside initRC now
            // drawRC(); // Called inside initRC now
        } else {
            // Retry if hidden
            requestAnimationFrame(window.initRandomCoupling);
        }
    };

    window.addEventListener('resize', () => {
        // Only verify/resize if this tab is active or visible
        if (rcCanvas.offsetParent !== null) {
            // Debounce?
            initRC(); // Full re-init on resize to match new width
            // solveGroundState(); // Called inside initRC now
            // drawRC(); // Called inside initRC now
        }
    });
})();

