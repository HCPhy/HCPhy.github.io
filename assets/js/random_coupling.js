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

    let nbr4; // Int32Array of size N*4: [up,down,left,right] per site (or -1)


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
        rcCanvas.height = 500;
        rcCanvas.width = rect.width;

        RC_ROWS = Math.floor(rcCanvas.height / TARGET_CELL_SIZE);
        RC_COLS = Math.floor(rcCanvas.width / TARGET_CELL_SIZE);

        // Safety cap for performance N < 1200?
        // 800px / 20 = 40. 500 / 20 = 25. N = 1000. Fine.

        N = RC_ROWS * RC_COLS;
        nbr4 = new Int32Array(N * 4);
        for (let r = 0; r < RC_ROWS; r++) {
        for (let c = 0; c < RC_COLS; c++) {
            const idx = r * RC_COLS + c;
            const base = idx << 2;
            nbr4[base + 0] = (r > 0) ? (idx - RC_COLS) : -1;                 // up
            nbr4[base + 1] = (r + 1 < RC_ROWS) ? (idx + RC_COLS) : -1;       // down
            nbr4[base + 2] = (c > 0) ? (idx - 1) : -1;                       // left
            nbr4[base + 3] = (c + 1 < RC_COLS) ? (idx + 1) : -1;             // right
        }
        }
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
    // Clear
    A_pool.fill(0);
    b_pool.fill(0);
    pivotMap.fill(-1); // reuse as pivotColOfRow (row -> pivot col)

    const A = A_pool;
    const b = b_pool;
    const words = WORDS_PER_ROW;

    const bitMask32 = (i) => (1 << (i & 31));          // ok even for 31
    const wordOf = (i) => (i >>> 5);

    // parity of 32-bit integer (GF(2) dot): returns 0/1
    const parity32 = (v) => {
        v ^= v >>> 16;
        v ^= v >>> 8;
        v ^= v >>> 4;
        v &= 0xF;
        return (0x6996 >>> v) & 1;
    };

    // --- Build constraints (no allocations) ---
    for (let idx = 0; idx < N; idx++) {
        // set diagonal bit A[idx, idx] = 1
        A[idx * words + wordOf(idx)] |= bitMask32(idx);

        if (couplings[idx] === 1) {
        // b[idx] = 1
        b[wordOf(idx)] |= bitMask32(idx);
        } else {
        // add up/down/left/right bits
        const base = idx << 2;
        let nb;

        nb = nbr4[base + 0]; if (nb !== -1) A[idx * words + wordOf(nb)] |= bitMask32(nb);
        nb = nbr4[base + 1]; if (nb !== -1) A[idx * words + wordOf(nb)] |= bitMask32(nb);
        nb = nbr4[base + 2]; if (nb !== -1) A[idx * words + wordOf(nb)] |= bitMask32(nb);
        nb = nbr4[base + 3]; if (nb !== -1) A[idx * words + wordOf(nb)] |= bitMask32(nb);
        // b[idx] stays 0
        }
    }

    // --- Forward elimination (row echelon) ---
    let rank = 0;

    for (let col = 0; col < N && rank < N; col++) {
        const wOff = col >>> 5;
        const mask = 1 << (col & 31);

        // find pivot row >= rank
        let sel = -1;
        for (let r = rank; r < N; r++) {
        if (A[r * words + wOff] & mask) { sel = r; break; }
        }
        if (sel === -1) continue; // free variable

        // swap sel <-> rank
        if (sel !== rank) {
        const a1 = rank * words;
        const a2 = sel * words;
        for (let w = 0; w < words; w++) {
            const t = A[a1 + w];
            A[a1 + w] = A[a2 + w];
            A[a2 + w] = t;
        }
        // swap b bits at row indices rank and sel
        const wr = rank >>> 5, br = rank & 31;
        const ws = sel  >>> 5, bs = sel  & 31;
        const mr = 1 << br, ms = 1 << bs;
        const vr = (b[wr] & mr) !== 0;
        const vs = (b[ws] & ms) !== 0;
        if (vr !== vs) { b[wr] ^= mr; b[ws] ^= ms; }
        }

        // record pivot column for this pivot row
        pivotMap[rank] = col;

        // eliminate below
        const pStart = rank * words;
        const pB = (b[rank >>> 5] >>> (rank & 31)) & 1;

        for (let r = rank + 1; r < N; r++) {
        const rStart = r * words;
        if (A[rStart + wOff] & mask) {
            for (let w = 0; w < words; w++) {
            A[rStart + w] ^= A[pStart + w];
            }
            if (pB) b[r >>> 5] ^= (1 << (r & 31));
        }
        }

        rank++;
    }

    // degeneracy = N - rank
    if (degenDisplay) degenDisplay.textContent = (N - rank);

    // --- Back substitution with free vars = 0 ---
    spins.fill(0);
    const xWords = new Uint32Array(words); // solution bitset

    for (let i = rank - 1; i >= 0; i--) {
        const pc = pivotMap[i]; // pivot col
        // parity of (row_i · x) where x currently has only cols > pc set
        let par = 0;
        const rowStart = i * words;
        for (let w = 0; w < words; w++) {
        par ^= parity32(A[rowStart + w] & xWords[w]);
        }
        const bi = (b[i >>> 5] >>> (i & 31)) & 1;
        const xi = bi ^ par;

        if (xi) {
        xWords[pc >>> 5] |= (1 << (pc & 31));
        spins[pc] = 1;
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

