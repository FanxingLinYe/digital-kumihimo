document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. 全局状态与 DOM 元素 ---
    const TOTAL_POSITIONS = 16;
    let allPatterns = [], activePattern = null, currentTamas = [], stateHistory = [], moveLog = [];
    let selectedTama = null, isAnimating = false;

    // 更新的 DOM 元素选择器
    const modal = document.getElementById('selection-modal');
    const patternList = document.getElementById('pattern-list');
    const title = document.getElementById('pattern-title');
    const description = document.getElementById('pattern-description');
    const progressText = document.getElementById('progress-text');
    const progressBarFg = document.getElementById('progress-bar-fg');
    const container = document.getElementById('marudai-container');
    const btnUndo = document.getElementById('btn-undo');
    const btnRestart = document.getElementById('btn-restart');
    
    // 双 Canvas 设置
    const looseCanvas = document.getElementById('loose-preview'), looseCtx = looseCanvas.getContext('2d');
    const tightCanvas = document.getElementById('tight-preview'), tightCtx = tightCanvas.getContext('2d');
    const looseWrapper = document.getElementById('loose-canvas-wrapper');
    const tightWrapper = document.getElementById('tight-canvas-wrapper');

    // --- 2. 编织逻辑算法 (已修复 Bug) ---
    const patternLogics = {
        'kongo_gumi_8': (tamas, step) => {
            const stepInCycle = step % 2;
            const topTamas = tamas.filter(t => t.position < 8).sort((a, b) => a.position - b.position);
            const bottomTamas = tamas.filter(t => t.position >= 8).sort((a, b) => a.position - b.position);
            if (stepInCycle === 0) {
                const sourceTama = topTamas[topTamas.length - 1];
                const occupiedBottomPos = bottomTamas.map(t => t.position);
                for (let i = TOTAL_POSITIONS - 1; i >= 8; i--) if (!occupiedBottomPos.includes(i)) return { source: sourceTama, destination: i };
            } else {
                const sourceTama = bottomTamas[0];
                const occupiedTopPos = topTamas.map(t => t.position);
                for (let i = 7; i >= 0; i--) if (!occupiedTopPos.includes(i)) return { source: sourceTama, destination: i };
            }
            return null;
        },
        'kaku_yatsu_gumi_8': (tamas, step) => {
            // 全新、健壮的算法
            const stepInCycle = step % 4;
            const groups = {
                top: tamas.filter(t => [0,1,2,3].includes(t.position)).sort((a,b)=>a.position-b.position),
                right: tamas.filter(t => [4,5,6,7].includes(t.position)).sort((a,b)=>a.position-b.position),
                bottom: tamas.filter(t => [8,9,10,11].includes(t.position)).sort((a,b)=>a.position-b.position),
                left: tamas.filter(t => [12,13,14,15].includes(t.position)).sort((a,b)=>a.position-b.position),
            };
            const findEmptySlot = (positions) => {
                const occupied = tamas.map(t => t.position);
                for (const pos of positions) if (!occupied.includes(pos)) return pos;
                return null;
            };
            if (stepInCycle === 0) return { source: groups.top[groups.top.length-1], destination: findEmptySlot([15,14,13,12]) };
            if (stepInCycle === 1) return { source: groups.left[0], destination: findEmptySlot([3,2,1,0]) };
            if (stepInCycle === 2) return { source: groups.right[groups.right.length-1], destination: findEmptySlot([11,10,9,8]) };
            if (stepInCycle === 3) return { source: groups.bottom[0], destination: findEmptySlot([7,6,5,4]) };
            return null;
        }
    };
    function getCorrectMove() {
        if (!activePattern) return null;
        const logicFunction = patternLogics[activePattern.id];
        return logicFunction ? logicFunction(currentTamas, moveLog.length) : null;
    }

    // --- 3. 核心功能函数 (render, animate, events) ---
    // (render, animateTamaMove, onTamaClick 函数与上一版完全相同，这里为简洁省略)
    // ... 请确保这些函数存在于此 ...

    async function onSlotClick(position) {
        if (isAnimating || !selectedTama) return;
        const correctMove = getCorrectMove();
        if (correctMove && correctMove.destination === position) {
            isAnimating = true;
            stateHistory.push(JSON.parse(JSON.stringify(currentTamas)));
            moveLog.push({ tamaId: selectedTama.id, from: selectedTama.position, to: position });
            await animateTamaMove(selectedTama.id, selectedTama.position, position);
            const movedTama = currentTamas.find(t => t.id === selectedTama.id);
            movedTama.position = position;
            selectedTama = null;
            isAnimating = false;
            render();
            updateUI();
        }
    }

    function undoMove() {
        if (isAnimating || stateHistory.length === 0) return;
        currentTamas = stateHistory.pop();
        moveLog.pop();
        selectedTama = null;
        render();
        updateUI();
    }

    // --- 4. UI 更新与双预览绘制 (重大更新) ---
    function updateUI() {
        // 更新信息面板
        const currentMove = moveLog.length;
        const totalMoves = activePattern.totalSteps;
        title.textContent = activePattern.name;
        description.textContent = activePattern.description;
        progressText.textContent = `步骤 ${currentMove} / ${totalMoves}`;
        progressBarFg.style.width = `${(currentMove / totalMoves) * 100}%`;
        btnUndo.disabled = stateHistory.length === 0;

        // 调用双预览绘制
        drawLoosePatternPreview();
        drawTightPatternPreview();
    }

    function drawLoosePatternPreview() {
        const ctx = looseCtx, canvas = looseCanvas, wrapper = looseWrapper;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!activePattern) return;
        const numThreads = activePattern.setup.length;
        const threadWidth = canvas.width / (numThreads + 1);
        const segmentHeight = 15;
        canvas.height = (activePattern.totalSteps + 5) * segmentHeight;
        
        let threadOrder = activePattern.setup.map(t => ({id: t.id, color: t.color})).sort((a,b) => a.position - b.position);

        for (let i = 0; i < moveLog.length; i++) {
            const move = moveLog[i];
            const y = i * segmentHeight;
            const fromIndex = threadOrder.findIndex(item => item.id === move.tamaId);
            if(fromIndex === -1) continue;

            // 绘制静止线
            for(let j = 0; j < threadOrder.length; j++) {
                if (j === fromIndex) continue;
                ctx.beginPath(); ctx.moveTo(threadWidth * (j + 1), y); ctx.lineTo(threadWidth * (j + 1), y + segmentHeight);
                ctx.strokeStyle = threadOrder[j].color; ctx.lineWidth = 6; ctx.stroke();
            }
            
            // 更新线序并绘制移动线
            const [movedItem] = threadOrder.splice(fromIndex, 1);
            const toIndex = (move.to < 8) ? 0 : threadOrder.length;
            threadOrder.splice(toIndex, 0, movedItem);
            const newIndex = threadOrder.findIndex(item => item.id === move.tamaId);
            ctx.beginPath(); ctx.moveTo(threadWidth * (fromIndex + 1), y); ctx.lineTo(threadWidth * (newIndex + 1), y + segmentHeight);
            ctx.strokeStyle = movedItem.color; ctx.lineWidth = 6; ctx.stroke();
        }
        // 智能滚动
        const currentY = moveLog.length * segmentHeight;
        wrapper.scrollTop = currentY - (wrapper.clientHeight / 2);
    }

    function drawTightPatternPreview() {
        const ctx = tightCtx, canvas = tightCanvas, wrapper = tightWrapper;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!activePattern) return;
        const numThreads = activePattern.setup.length;
        const threadWidth = canvas.width / numThreads;
        const segmentHeight = threadWidth * 0.8;
        canvas.height = (activePattern.totalSteps + 5) * segmentHeight;
        
        let threadPositions = JSON.parse(JSON.stringify(activePattern.setup));

        for (let i = 0; i < moveLog.length; i++) {
            const move = moveLog[i];
            const y = i * segmentHeight;
            for(let j = 0; j < threadPositions.length; j++) {
                ctx.fillStyle = threadPositions[j].color;
                ctx.fillRect(j * threadWidth, y, threadWidth, segmentHeight);
            }
            const fromIndex = threadPositions.findIndex(t => t.id === move.tamaId);
            if (fromIndex === -1) continue;
            const toIndex = move.from < 8 ? threadPositions.length - 1 : 0;
            const [movedItem] = threadPositions.splice(fromIndex, 1);
            threadPositions.splice(toIndex, 0, movedItem);
        }
        // 智能滚动
        const currentY = moveLog.length * segmentHeight;
        wrapper.scrollTop = currentY - (wrapper.clientHeight / 2);
    }

    // --- 5. 初始化与模式选择 ---
    async function loadPatterns() { /* ... (与上一版相同) ... */ }
    function selectPattern(patternId) { /* ... (与上一版相同) ... */ }
    function initialize() { /* ... (与上一版相同) ... */ }

    // --- 事件绑定与启动 ---
    btnUndo.addEventListener('click', undoMove);
    btnRestart.addEventListener('click', () => modal.classList.remove('hidden'));
    
    // 同步滚动两个 canvas
    looseWrapper.addEventListener('scroll', () => tightWrapper.scrollTop = looseWrapper.scrollTop);
    tightWrapper.addEventListener('scroll', () => looseWrapper.scrollTop = tightWrapper.scrollTop);

    await loadPatterns();
    
    // --- 将这些函数从之前版本粘贴到这里 ---
    function render() {
        container.innerHTML = '';
        const correctMove = getCorrectMove();
        for (let i = 0; i < TOTAL_POSITIONS; i++) {
            const tamaData = currentTamas.find(t => t.position === i);
            const angle = (360 / TOTAL_POSITIONS) * i;
            if (tamaData) {
                const tamaElement = document.createElement('div');
                tamaElement.classList.add('tama');
                tamaElement.style.backgroundColor = tamaData.color;
                tamaElement.style.setProperty('--angle', `${angle}deg`);
                tamaElement.dataset.id = tamaData.id;
                if (selectedTama && selectedTama.id === tamaData.id) tamaElement.classList.add('selected');
                else if (!selectedTama && correctMove && correctMove.source?.id === tamaData.id) tamaElement.classList.add('highlight');
                tamaElement.addEventListener('click', () => onTamaClick(tamaData));
                container.appendChild(tamaElement);
            } else {
                const slotElement = document.createElement('div');
                slotElement.classList.add('slot');
                slotElement.style.setProperty('--angle', `${angle}deg`);
                slotElement.dataset.position = i;
                if (selectedTama && correctMove && correctMove.destination === i) slotElement.classList.add('highlight');
                slotElement.addEventListener('click', () => onSlotClick(i));
                container.appendChild(slotElement);
            }
        }
    }
    function animateTamaMove(tamaId, fromPos, toPos) {
        const tamaElement = document.querySelector(`[data-id="${tamaId}"]`);
        if (!tamaElement) return Promise.resolve();
        const startAngle = (360 / TOTAL_POSITIONS) * fromPos;
        const endAngle = (360 / TOTAL_POSITIONS) * toPos;
        const radius = container.offsetWidth / 2;
        const keyframes = [
            { transform: `rotate(${startAngle}deg) translateY(${radius}px) scale(1.2)`, offset: 0 },
            { transform: `rotate(${(startAngle + endAngle) / 2}deg) translateY(0px) scale(1.2)`, offset: 0.5 },
            { transform: `rotate(${endAngle}deg) translateY(${radius}px) scale(1)`, offset: 1 }
        ];
        const options = { duration: 600, easing: 'ease-in-out' };
        return tamaElement.animate(keyframes, options).finished;
    }
    function onTamaClick(tamaData) {
        if (isAnimating || selectedTama) return;
        const correctMove = getCorrectMove();
        if (correctMove && correctMove.source?.id === tamaData.id) {
            selectedTama = tamaData;
            render();
        }
    }
    async function loadPatterns() {
        try {
            const response = await fetch('patterns.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            allPatterns = await response.json();
            patternList.innerHTML = '';
            allPatterns.forEach(pattern => {
                const card = document.createElement('div');
                card.className = 'pattern-card';
                card.innerHTML = `<img src="${pattern.previewImage}" alt="${pattern.name}" onerror="this.style.display='none'"><h3>${pattern.name}</h3><p>${pattern.description}</p>`;
                card.addEventListener('click', () => selectPattern(pattern.id));
                patternList.appendChild(card);
            });
        } catch (error) {
            console.error("无法加载编织方案:", error);
            patternList.innerHTML = `<p style="color: red;">加载失败，请检查 'patterns.json' 文件是否存在且格式正确，并刷新页面。</p>`;
        }
    }
    function selectPattern(patternId) {
        activePattern = allPatterns.find(p => p.id === patternId);
        if (!activePattern) return;
        modal.classList.add('hidden');
        initialize();
    }
    function initialize() {
        currentTamas = JSON.parse(JSON.stringify(activePattern.setup));
        stateHistory = [];
        moveLog = [];
        selectedTama = null;
        isAnimating = false;
        render();
        updateUI();
    }
});
