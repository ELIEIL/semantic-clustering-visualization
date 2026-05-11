// ============================================================
// IDLE ANIMATION MODULE
// ASCII curl-noise flow field with Reddit post text reveals
// Fetches posts from Flask server at localhost:5001
// Exposes: window.IdleAnimation = { init, start, stop }
// ============================================================
(function () {
    'use strict';

    const GROUP_RGB      = [[214, 40, 40], [0, 0, 254], [63, 152, 91]];
    const CHAR_REVEAL_MS = 28;
    const CHAR_HIDE_MS   = 20;
    const HOLD_MS        = 5000;
    const BETWEEN_MS     = 1000;
    const FONT_NAME      = 'MD Thermochrome 0.4 Trial';
    const REDDIT_URL     = 'http://localhost:5001/api/reddit?subreddit=conspiracy%2Bunpopularopinion%2BAmItheAsshole%2Bpolitics%2BPoliticalDiscussion&limit=25';
    const MAX_POOL       = 100;

    let container      = null;
    let asciiBgCanvas  = null;
    let asciiBgCtx     = null;
    let running        = false;
    let animFrameId    = null;
    let lastTime       = 0;

    let postsPool      = [];
    let postQueue      = [];
    let activeSlot     = null;
    let slotIdleTimer  = 0;
    let groupCycleIdx  = 0;

    let dissolveMap      = null;
    let dissolveProgress  = 0;
    let dissolving        = false;
    let dissolveMode      = 'out'; // 'out' = chars vanish | 'in' = chars materialise
    let dissolveCallback  = null;
    let dissolveStart     = 0;
    const DISSOLVE_MS     = 2800;

    // ── Curl-noise (Perlin-based) ─────────────────────────────────
    const _fract = x => x - Math.floor(x);

    function _hash3(px, py, pz) {
        const nx = px * 127.1    + py * 311.7  + pz * (-53.7);
        const ny = px * 269.5    + py * 183.3  + pz * 77.1;
        const nz = px * (-301.7) + py * 27.3   + pz * 215.3;
        return [
            2 * _fract(Math.sin(nx) * 43758.5453123) - 1,
            2 * _fract(Math.sin(ny) * 43758.5453123) - 1,
            2 * _fract(Math.sin(nz) * 43758.5453123) - 1
        ];
    }

    function _noise3(px, py, pz) {
        const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
        const fx = px - ix, fy = py - iy, fz = pz - iz;
        const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy), uz = fz*fz*(3-2*fz);
        const dot  = (h, gx, gy, gz) => h[0]*gx + h[1]*gy + h[2]*gz;
        const lerp = (a, b, t) => a + (b - a) * t;
        return 2 * lerp(
            lerp(
                lerp(dot(_hash3(ix,   iy,   iz),   fx,   fy,   fz),   dot(_hash3(ix+1, iy,   iz),   fx-1, fy,   fz),   ux),
                lerp(dot(_hash3(ix,   iy+1, iz),   fx,   fy-1, fz),   dot(_hash3(ix+1, iy+1, iz),   fx-1, fy-1, fz),   ux), uy),
            lerp(
                lerp(dot(_hash3(ix,   iy,   iz+1), fx,   fy,   fz-1), dot(_hash3(ix+1, iy,   iz+1), fx-1, fy,   fz-1), ux),
                lerp(dot(_hash3(ix,   iy+1, iz+1), fx,   fy-1, fz-1), dot(_hash3(ix+1, iy+1, iz+1), fx-1, fy-1, fz-1), ux), uy),
            uz);
    }

    function _turb(inUx, inUy, inT) {
        let ux = inUx, uy = inUy, t = inT, f = 0, q = 1, s = 0;
        for (let i = 0; i < 2; i++) {
            ux -= t * 0.6; uy -= t * 0.2;
            f  += q * _noise3(ux, uy, t);
            s  += q; q /= 2; ux *= 2; uy *= 2; t *= 1.71;
        }
        return f / s;
    }

    // ── Utilities ─────────────────────────────────────────────────
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function gridWrap(text, maxCols) {
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (test.length > maxCols && line) { lines.push(line); line = w; }
            else line = test;
        }
        if (line) lines.push(line);
        return lines;
    }

    function buildCharList(text, gcx, gcy) {
        const maxCols = 22;
        const lines   = gridWrap(text.toUpperCase(), maxCols);
        const chars   = [];
        lines.forEach((line, li) => {
            const rowOff = li - Math.floor(lines.length / 2);
            const colOff = -Math.floor(maxCols / 2);
            for (let ci = 0; ci < line.length; ci++) {
                const ch = line[ci];
                if (ch === ' ') continue;
                chars.push({ gx: gcx + colOff + ci, gy: gcy + rowOff, ch });
            }
        });
        return chars;
    }

    function buildTextMap() {
        const map = new Map();
        if (!activeSlot || activeSlot.revealed <= 0) return map;
        const n = Math.min(activeSlot.revealed, activeSlot.charList.length);
        for (let i = 0; i < n; i++) {
            const { gx, gy, ch } = activeSlot.charList[i];
            map.set(gx + ',' + gy, { char: ch, group: activeSlot.group });
        }
        return map;
    }

    // ── ASCII Render ──────────────────────────────────────────────
    function renderAsciiBackground(time) {
        if (!asciiBgCtx) return;
        const W  = asciiBgCanvas.width, H = asciiBgCanvas.height;
        const CW = 13, CH = 17;
        const t  = time * 0.08, S = 3.0;

        asciiBgCtx.clearRect(0, 0, W, H);
        asciiBgCtx.font         = `600 ${CH}px "${FONT_NAME}", monospace`;
        asciiBgCtx.textBaseline = 'top';
        asciiBgCtx.textAlign    = 'left';

        const rampDir = ['-', '/', '|', '\\'];
        const textMap = buildTextMap();

        for (let py = 0; py < H; py += CH) {
            for (let px = 0; px < W; px += CW) {
                const gridX    = Math.floor(px / CW);
                const gridY    = Math.floor(py / CH);
                const textCell = textMap.get(gridX + ',' + gridY);

                if (textCell) {
                    if (dissolveMap) {
                        const key  = gridX + gridY * Math.ceil(W / CW);
                        const gone = dissolveMode === 'out' ? dissolveMap[key] < dissolveProgress
                                                            : dissolveMap[key] > dissolveProgress;
                        if (gone) continue;
                    }
                    const gc = GROUP_RGB[textCell.group] || GROUP_RGB[0];
                    asciiBgCtx.fillStyle = `rgba(${gc[0]},${gc[1]},${gc[2]},1.0)`;
                    asciiBgCtx.fillText(textCell.char, px, py);
                    continue;
                }

                const uvx = (px + CW * 0.5) / H;
                const uvy = (H - py - CH * 0.5) / H;
                const cn  = _turb(S * uvx, S * uvy, t);
                const bri = cn * 0.5 + 0.5;
                if (bri < 0.12) continue;

                const eps = 0.001;
                const cnx = _turb(S * (uvx + eps), S * uvy, t);
                const cny = _turb(S * uvx, S * (uvy + eps), t);
                const vx  = -(cny - cn) / eps * 0.7;
                const vy  = (cnx  - cn) / eps * 0.7;

                const ang     = Math.atan2(vy, vx);
                const normAng = ((ang % Math.PI) + Math.PI) % Math.PI;
                const sec     = Math.floor(normAng / (Math.PI / 4) + 0.5) % 4;

                let char;
                if      (bri < 0.25) char = '.';
                else if (bri < 0.40) char = rampDir[sec];
                else if (bri < 0.55) char = (sec === 0 || sec === 3) ? ':' : '=';
                else if (bri < 0.70) char = (sec % 2 === 0) ? '+' : 'x';
                else if (bri < 0.87) char = '#';
                else                 char = '@';

                if (dissolveMap) {
                    const key  = gridX + gridY * Math.ceil(W / CW);
                    const gone = dissolveMode === 'out' ? dissolveMap[key] < dissolveProgress
                                                        : dissolveMap[key] > dissolveProgress;
                    if (gone) continue;
                }

                const alpha = Math.min(0.75, bri * 0.9);
                let cr2, cg2, cb2;

                if (activeSlot) {
                    const rawP   = activeSlot.charList.length > 0 ? activeSlot.revealed / activeSlot.charList.length : 0;
                    const p      = rawP * rawP * (3 - 2 * rawP);
                    const slotPx = activeSlot.gcx * CW;
                    const slotPy = activeSlot.gcy * CH;
                    const dist   = Math.hypot(px - slotPx, py - slotPy);
                    const glowR  = CW * 30 * p;
                    const w      = glowR > 1 ? Math.max(0, 1 - dist / glowR) ** 1.5 : 0;
                    const gc     = GROUP_RGB[activeSlot.group] || GROUP_RGB[0];
                    cr2 = Math.round(210 * (1 - w) + gc[0] * w);
                    cg2 = Math.round(210 * (1 - w) + gc[1] * w);
                    cb2 = Math.round(210 * (1 - w) + gc[2] * w);
                } else {
                    cr2 = 210; cg2 = 210; cb2 = 210;
                }

                asciiBgCtx.fillStyle = `rgba(${cr2},${cg2},${cb2},${alpha})`;
                asciiBgCtx.fillText(char, px, py);
            }
        }
    }

    // ── Slot animation ────────────────────────────────────────────
    function getNextPost() {
        if (postQueue.length === 0) postQueue = shuffle([...postsPool]);
        return postQueue.pop();
    }

    function updateSlots(delta) {
        if (!postsPool.length) return;

        if (!activeSlot) {
            slotIdleTimer -= delta;
            if (slotIdleTimer > 0) return;
            const group = groupCycleIdx % 3;
            groupCycleIdx++;
            const CW  = 13, CH = 17;
            const W   = asciiBgCanvas ? asciiBgCanvas.width  : window.innerWidth;
            const H   = asciiBgCanvas ? asciiBgCanvas.height : window.innerHeight;
            const pad = 6;
            const gcx = pad + Math.floor(Math.random() * (Math.floor(W / CW) - pad * 2));
            const gcy = pad + Math.floor(Math.random() * (Math.floor(H / CH) - pad * 2));
            const post = getNextPost();
            activeSlot = {
                post, group, gcx, gcy,
                charList: shuffle(buildCharList(post.title, gcx, gcy)),
                revealed: 0, phase: 'appearing', timer: 0
            };
            return;
        }

        activeSlot.timer += delta;
        if (activeSlot.phase === 'appearing') {
            activeSlot.revealed = Math.min(Math.floor(activeSlot.timer / CHAR_REVEAL_MS), activeSlot.charList.length);
            if (activeSlot.revealed >= activeSlot.charList.length) { activeSlot.phase = 'visible'; activeSlot.timer = 0; }
        } else if (activeSlot.phase === 'visible') {
            if (activeSlot.timer >= HOLD_MS) { activeSlot.phase = 'disappearing'; activeSlot.timer = 0; }
        } else if (activeSlot.phase === 'disappearing') {
            activeSlot.revealed = Math.max(0, activeSlot.charList.length - Math.floor(activeSlot.timer / CHAR_HIDE_MS));
            if (activeSlot.revealed <= 0) { activeSlot = null; slotIdleTimer = BETWEEN_MS; }
        }
    }

    // ── Reddit data ───────────────────────────────────────────────
    const FALLBACK_POSTS = [
        { title: 'AITA for refusing to attend my sister wedding' },
        { title: 'The moon landing was obviously faked' },
        { title: 'Universal basic income would destroy society' },
        { title: 'Pineapple belongs on pizza and I will die on this hill' },
        { title: 'Social media is destroying our ability to think critically' },
        { title: 'Climate change is the most pressing issue of our generation' },
        { title: 'We should abolish political parties entirely' },
        { title: 'Homework should be banned in all schools' }
    ];

    async function loadPostsPool() {
        try {
            const res  = await fetch(REDDIT_URL);
            const data = await res.json();
            postsPool  = (data.posts || []).filter(p => p.title);
            console.log('[IdleAnimation] Loaded ' + postsPool.length + ' posts from Reddit');
        } catch (e) {
            postsPool = [...FALLBACK_POSTS];
            console.warn('[IdleAnimation] Reddit unavailable, using fallback posts');
        }
    }

    async function refreshPostsPool() {
        try {
            const res      = await fetch(REDDIT_URL);
            const fresh    = ((await res.json()).posts || []).filter(p => p.title);
            const existing = new Set(postsPool.map(p => p.title));
            const newOnes  = fresh.filter(p => !existing.has(p.title));
            postsPool = [...postsPool, ...newOnes];
            if (postsPool.length > MAX_POOL) postsPool = postsPool.slice(postsPool.length - MAX_POOL);
            console.log('[IdleAnimation] Pool refreshed: +' + newOnes.length + ' posts, total ' + postsPool.length);
        } catch (e) {
            console.warn('[IdleAnimation] Pool refresh failed:', e);
        }
    }

    // ── Main loop ─────────────────────────────────────────────────
    function loop(t) {
        if (!running) return;
        const delta = Math.min(t - lastTime, 50);
        lastTime    = t;

        if (dissolving) {
            dissolveProgress = Math.min(1, (t - dissolveStart) / DISSOLVE_MS);
            if (dissolveMode === 'in') updateSlots(delta || 16.7); // allow text to appear during reveal
            if (dissolveProgress >= 1) {
                const wasRevealIn = (dissolveMode === 'in');
                dissolving       = false;
                dissolveMap      = null;
                dissolveProgress = 0;
                dissolveMode     = 'out';
                if (!wasRevealIn) {
                    running     = false;
                    animFrameId = null;
                    if (asciiBgCtx) asciiBgCtx.clearRect(0, 0, asciiBgCanvas.width, asciiBgCanvas.height);
                    if (dissolveCallback) { const cb = dissolveCallback; dissolveCallback = null; cb(); }
                    return;
                }
                // revealIn complete — keep loop running normally
                if (dissolveCallback) { const cb = dissolveCallback; dissolveCallback = null; cb(); }
            }
        } else {
            updateSlots(delta || 16.7);
        }

        renderAsciiBackground(t / 1000);
        animFrameId = requestAnimationFrame(loop);
    }

    // ── Public API ────────────────────────────────────────────────
    function init(containerEl) {
        container     = containerEl;
        asciiBgCanvas = document.createElement('canvas');
        asciiBgCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
        asciiBgCanvas.width  = window.innerWidth;
        asciiBgCanvas.height = window.innerHeight;
        container.appendChild(asciiBgCanvas);
        asciiBgCtx = asciiBgCanvas.getContext('2d');

        window.addEventListener('resize', () => {
            if (asciiBgCanvas) {
                asciiBgCanvas.width  = window.innerWidth;
                asciiBgCanvas.height = window.innerHeight;
            }
        });

        loadPostsPool().then(() => {
            setInterval(refreshPostsPool, 5 * 60 * 1000);
        });
    }

    function start() {
        if (running) return;
        running     = true;
        lastTime    = performance.now();
        animFrameId = requestAnimationFrame(loop);
        console.log('[IdleAnimation] Started');
    }

    function stop() {
        running          = false;
        dissolving       = false;
        dissolveMap      = null;
        dissolveProgress = 0;
        if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
        if (asciiBgCtx && asciiBgCanvas) {
            asciiBgCtx.clearRect(0, 0, asciiBgCanvas.width, asciiBgCanvas.height);
        }
        console.log('[IdleAnimation] Stopped');
    }

    function _buildDissolveMap() {
        const W    = asciiBgCanvas ? asciiBgCanvas.width  : window.innerWidth;
        const H    = asciiBgCanvas ? asciiBgCanvas.height : window.innerHeight;
        const cols = Math.ceil(W / 13);
        const rows = Math.ceil(H / 17);
        const map  = new Float32Array(cols * rows);
        for (let i = 0; i < map.length; i++) map[i] = Math.random();
        return map;
    }

    function dissolveOut(callback) {
        if (!running) start();
        dissolveMap      = _buildDissolveMap();
        dissolveProgress = 0;
        dissolveMode     = 'out';
        dissolveCallback = callback;
        dissolveStart    = performance.now();
        dissolving       = true;
        console.log('[IdleAnimation] Dissolving out...');
    }

    function revealIn(callback) {
        if (asciiBgCtx) asciiBgCtx.clearRect(0, 0, asciiBgCanvas.width, asciiBgCanvas.height);
        dissolveMap      = _buildDissolveMap();
        dissolveProgress = 0;
        dissolveMode     = 'in';
        dissolveCallback = callback;
        dissolveStart    = performance.now();
        dissolving       = true;
        if (!running) start();
        console.log('[IdleAnimation] Revealing in...');
    }

    window.IdleAnimation = { init, start, stop, dissolveOut, revealIn };
})();
