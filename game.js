(() => {
  'use strict';

  // SPでプレイ中に画面が動かないようにする
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());

  const COLS = 10, ROWS = 20, CELL = 30;
  const LOCK_DELAY = 850;          // 接地してから固まるまでの猶予。Tスピン練習用に長め
  const MAX_LOCK_RESETS = 15;      // 接地後の移動/回転による延長上限

  const boardCanvas = document.getElementById('board');
  const ctx = boardCanvas.getContext('2d');
  const holdCanvas = document.getElementById('hold');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');
  const fxCanvas = document.getElementById('fx');
  const fxCtx = fxCanvas.getContext('2d');

  const el = {
    score: document.getElementById('score'), lines: document.getElementById('lines'), level: document.getElementById('level'),
    combo: document.getElementById('combo'), effect: document.getElementById('effectText'), msg: document.getElementById('message'),
    pause: document.getElementById('pauseBtn'), restart: document.getElementById('restartBtn'),
    bgm: document.getElementById('bgmBtn'), se: document.getElementById('seBtn'), start: document.getElementById('startBtn'), title: document.getElementById('titleScreen'), toast: document.getElementById('toast'), talt: document.getElementById('taltBubble'),
    resultPanel: document.getElementById('resultPanel'), playerName: document.getElementById('playerName'), saveRanking: document.getElementById('saveRankingBtn'), shareX: document.getElementById('shareXBtn'), rankingList: document.getElementById('rankingList'), rankingStatus: document.getElementById('rankingStatus')
  };


  // ミノデザイン
  const colors = {
    I: '#5fe7ff', O: '#ffe45f', T: '#d78cff', S: '#7eff9d', Z: '#ff6f7d', J: '#75a7ff', L: '#ffb25f', G: '#25304a'
  };

  const minoImages = {};
  const minoImagePaths = {
    I: 'assets/mino/I.png',
    O: 'assets/mino/O.png',
    T: 'assets/mino/T.png',
    S: 'assets/mino/S.png',
    Z: 'assets/mino/Z.png',
    J: 'assets/mino/J.png',
    L: 'assets/mino/L.png'
  };

  Object.entries(minoImagePaths).forEach(([type, src]) => {
    const img = new Image();
    img.src = src;
    minoImages[type] = img;
  });





  // v8: AudioManager。音の差し替えは config.js で管理します。
  const AUDIO_CONFIG = window.MENTAL_TETRIS_AUDIO_CONFIG || {
    bgm: { main: '' }, se: {}, voice: {}, volume: { bgm: .35, se: .8, voice: .9 }, fallbackBeep: true
  };

  // 公開URLは本番環境に合わせて変更してください。Xカード画像はindex.htmlのOGPで設定します。
  const SHARE_SITE_URL = window.MENTAL_TETRIS_SITE_URL || 'https://www.field-up.work//mental-tetris/';

  let audioCtx = null;
  let bgmOn = localStorage.getItem('mentalTetrisBgm') !== 'off';
  let seOn = localStorage.getItem('mentalTetrisSe') !== 'off';
  let voiceOn = localStorage.getItem('mentalTetrisVoice') !== 'off';
  let currentBgm = null;
  let particles = [], rings = [], activeMood = 'normal', mentalProgress = 0, lastProgressStep = -1;
  let progressVoiceStep = 0;
  let suppressProgressVoiceOnce = false;
  let suppressLineVoiceOnce = false;
  let suppressLevelVoiceOnce = false;
  let pendingLevelUp = false;



  const taltLines = {
    ready:'焦らなくて大丈夫。少しずつ整理しよう。',
    line_normal:'いい整理ができたね。',
    line_anxiety:'不安を少し整理できたね。',
    line_anger:'イライラを少し流せたね。',
    line_sadness:'悲しい気持ちを整理できたね。',
    line_fatigue:'疲れた心を休ませられたね。',
    tspin:'視点転換！見方を変えられたね。',
    tetris:'大きな気付き！一気に整理できたね。',
    level:'こころ整理Lvアップ。前進してるよ。',
    hold:'あとで考えよ。',
    over:'お疲れさま。',
    progress_25: '少し気持ちが整理されてきたね。',
    progress_50: '半分くらい、こころが軽くなってきたよ。',
    progress_75: 'かなり前向きになってきたね。',
    progress_100: '今日はすごくよく整理できたね。',
  };


  function talkLineByMood(){
    if(pendingLevelUp){
      return;
    }

    if(suppressLineVoiceOnce){
      suppressLineVoiceOnce = false;
      return;
    }

    const key = `line_${activeMood}`;

    if(taltLines[key]){
      talk(key);
    }else{
      talk('line_normal');
    }
  }


  function ensureAudio(){
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
  }


  function checkProgressVoice(){
    const percent = mentalProgress * 100;

    let nextStep = 0;

    if(percent >= 100) nextStep = 100;
    else if(percent >= 75) nextStep = 75;
    else if(percent >= 50) nextStep = 50;
    else if(percent >= 25) nextStep = 25;

    if(nextStep > progressVoiceStep){
      progressVoiceStep = nextStep;

      if(suppressProgressVoiceOnce){
        suppressProgressVoiceOnce = false;
        return;
      }

      talk(`progress_${nextStep}`);
    }
  }

  function makeAudio(src, volume=1, loop=false){
    if(!src) return null;
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = Math.max(0, Math.min(1, volume));
    a.loop = loop;
    a.addEventListener('error', () => { a.dataset.failed = '1'; }, { once: true });
    return a;
  }

  const AudioManager = {
    bgm: {}, se: {}, voice: {},
    init(){
      const v = AUDIO_CONFIG.volume || {};
      this.bgm.main = makeAudio(AUDIO_CONFIG.bgm?.main, v.bgm ?? .35, true);
      Object.entries(AUDIO_CONFIG.se || {}).forEach(([key, src]) => this.se[key] = makeAudio(src, v.se ?? .8, false));
      Object.entries(AUDIO_CONFIG.voice || {}).forEach(([key, src]) => this.voice[key] = makeAudio(src, v.voice ?? .9, false));
    },
    playBgm(name='main'){
      if(!bgmOn) return;
      ensureAudio();
      const bgm = this.bgm[name];
      if(!bgm || bgm.dataset.failed === '1') return this.fallbackBgm();
      if(currentBgm && currentBgm !== bgm) this.stopBgm();
      currentBgm = bgm;
      bgm.play().catch(() => this.fallbackBgm());
    },
    stopBgm(){
      if(currentBgm){ currentBgm.pause(); currentBgm.currentTime = 0; }
      currentBgm = null;
      this.stopFallbackBgm();
    },
    playSE(name){
      if(!seOn) return;
      ensureAudio();
      const sound = this.se[name];
      if(sound && sound.dataset.failed !== '1'){
        try{
          const s = sound.cloneNode(true);
          s.volume = sound.volume;
          s.play().catch(() => this.fallbackSE(name));
          return;
        }catch(e){}
      }
      this.fallbackSE(name);
    },
    playVoice(name){
      if(!voiceOn) return;
      ensureAudio();
      const voice = this.voice[name];
      if(!voice || voice.dataset.failed === '1') return;
      try{ voice.currentTime = 0; voice.play().catch(()=>{}); }catch(e){}
    },
    fallbackSE(type='move'){
      if(!AUDIO_CONFIG.fallbackBeep || !seOn) return;
      ensureAudio();
      const map = { move:[520,.025,.025], rotate:[720,.04,.035], lock:[170,.06,.08], harddrop:[90,.09,.14], hold:[420,.06,.08], line:[880,.12,.16], tspin:[1040,.18,.22], tetris:[1320,.22,.28], gameover:[160,.4,.20] };
      const [freq,dur,gain] = map[type] || map.move;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type==='harddrop' ? 'sawtooth' : 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    },
    fallbackNodes: [],
    fallbackBgm(){
      if(!AUDIO_CONFIG.fallbackBeep || this.fallbackNodes.length || !bgmOn) return;
      ensureAudio();
      const master = audioCtx.createGain(); master.gain.value = .025; master.connect(audioCtx.destination);
      [261.63,329.63,392.00,493.88].forEach((f,i)=>{
        const o=audioCtx.createOscillator(); const g=audioCtx.createGain();
        o.type='sine'; o.frequency.value=f/2; g.gain.value=i===0?.55:.18;
        o.connect(g).connect(master); o.start(); this.fallbackNodes.push(o,g);
      });
      this.fallbackNodes.push(master);
    },
    stopFallbackBgm(){
      this.fallbackNodes.forEach(n=>{ try{ n.stop?.(); n.disconnect?.(); }catch(e){} });
      this.fallbackNodes=[];
    }
  };

  AudioManager.init();
  function playSE(name){ AudioManager.playSE(name); }
  function startBgm(){ AudioManager.playBgm('main'); }
  function stopBgm(){ AudioManager.stopBgm(); }
  function isGameActive(){ return el.title.classList.contains('hidden') && !over; }
  function setBgm(on){
    bgmOn=on;
    localStorage.setItem('mentalTetrisBgm', on?'on':'off');
    el.bgm.textContent = on ? 'BGM ON' : 'BGM OFF';
    if(on && isGameActive()) startBgm();
    else stopBgm();
  }
  function setSe(on){ seOn=on; localStorage.setItem('mentalTetrisSe', on?'on':'off'); el.se.textContent = on ? 'SE ON' : 'SE OFF'; }
  function toast(text){ el.toast.textContent=text; el.toast.classList.remove('hidden'); el.toast.style.animation='none'; void el.toast.offsetWidth; el.toast.style.animation=''; setTimeout(()=>el.toast.classList.add('hidden'), 900); }
  function talk(key){ el.talt.textContent=taltLines[key] || key; AudioManager.playVoice(key); el.talt.classList.add('pulse'); setTimeout(()=>el.talt.classList.remove('pulse'), 350); }
  function burst(rowCount=1){
    for(let i=0;i<rowCount*28;i++) particles.push({x:Math.random()*fxCanvas.width,y:Math.random()*fxCanvas.height,vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*3-1,life:42+Math.random()*24,r:1+Math.random()*2});
  }
  function ring(){ rings.push({x:fxCanvas.width/2,y:fxCanvas.height*.42,r:12,life:34}); }
  function flash(){ boardCanvas.classList.remove('flash'); void boardCanvas.offsetWidth; boardCanvas.classList.add('flash'); }
  function drawFx(){
    fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
    particles = particles.filter(p=>p.life-- > 0); particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; fxCtx.globalAlpha=Math.max(0,p.life/60); fxCtx.fillStyle='#b9ffe7'; fxCtx.beginPath(); fxCtx.arc(p.x,p.y,p.r,0,Math.PI*2); fxCtx.fill(); });
    rings = rings.filter(r=>r.life-- > 0); rings.forEach(r=>{ r.r+=8; fxCtx.globalAlpha=Math.max(0,r.life/34); fxCtx.strokeStyle='#5fe7ff'; fxCtx.lineWidth=5; fxCtx.beginPath(); fxCtx.arc(r.x,r.y,r.r,0,Math.PI*2); fxCtx.stroke(); });
    fxCtx.globalAlpha=1;
  }
  function setMood(m){
    activeMood=m;
    document.body.dataset.mood=m;
    document.querySelectorAll('[data-mood]').forEach(b=>b.classList.toggle('selected', b.dataset.mood===m));
    updateMentalProgress(true);
  }



  // スコア修正
  function getMentalProgress(){
    const raw =
      (score / 200000) +
      (lines / 1000) +
      (Math.max(0, combo) / 2000) +
      ((level - 1) / 300);

    return Math.max(0, Math.min(1, raw));
  }


  function updateMentalProgress(force=false){
    if(typeof score !== 'number') return;
    mentalProgress = getMentalProgress();
    document.body.style.setProperty('--mental-progress', mentalProgress.toFixed(3));
    const step = Math.floor(mentalProgress * 4);
    if(force || step !== lastProgressStep){
      lastProgressStep = step;
      document.body.dataset.progress = ['dark','dim','clear','bright','hope'][step] || 'hope';
    }
    checkProgressVoice();
  }


  function calcLevel(){
    // 難易度は「一定ポイント」で上昇。ただし速くなりすぎないようLv10で上限。
    const mentalPoint = score + lines * 120;
    return Math.min(10, 1 + Math.floor(mentalPoint / 1400));
  }



  function refreshLevel(){
    const old = level;
    level = calcLevel();

    const levelUpOccurred = level > old;

    if(levelUpOccurred){
      suppressLineVoiceOnce = true;

      toast('こころ整理Lv Up');

      if(suppressLevelVoiceOnce){
        suppressLevelVoiceOnce = false;
      }else{
        talk('level');
      }

      burst(2);
      setEffect(`こころが少し明るくなった / Lv ${level}`);
    }

    updateMentalProgress();

    return levelUpOccurred;
  }



  const shapes = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]]
  };

  // Guideline SRS wall kicks. DT砲/Tスピンダブルで必要な上方向・左右方向の補正を入れる
  const JLSTZ_KICKS = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
  };
  const I_KICKS = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
  };

  let grid, bag, queue, current, hold, canHold, score, lines, level, combo, b2b, over, paused, bestCombo;
  let rankingSaved = false;
  let gameStarted = false;

  let dropCounter = 0, lastTime = 0;

  let groundedTime = 0, lockResets = 0, wasGrounded = false;
  let lastActionRotate = false, lastKick = [0,0];

  const clone = m => m.map(r => r.slice());
  const makeGrid = () => Array.from({length: ROWS}, () => Array(COLS).fill(null));
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function refill(){ if(!bag.length) bag = shuffle(Object.keys(shapes)); while(queue.length < 5){ if(!bag.length) bag = shuffle(Object.keys(shapes)); queue.push(bag.pop()); } }
  function piece(type){ return { type, matrix: clone(shapes[type]), x: Math.floor(COLS/2)-2, y: type === 'I' ? -1 : 0, rot: 0 }; }

  function resetLock(){ groundedTime = 0; lockResets = 0; wasGrounded = false; }
  function touchLockReset(){
    if(isGrounded() && lockResets < MAX_LOCK_RESETS){ groundedTime = 0; lockResets++; }
  }

  function reset(){
    rankingSaved = false;
    if(el.saveRanking){
      el.saveRanking.disabled = false;
      el.saveRanking.style.pointerEvents = 'auto';
      el.saveRanking.textContent = 'ランキング登録';
    }
    grid = makeGrid(); bag = []; queue = []; hold = null; canHold = true; score = 0; lines = 0; level = 1; combo = -1; b2b = false;
    over = false; paused = false; bestCombo = 0; dropCounter = 0; lastTime = 0; resetLock(); lastActionRotate = false; lastKick = [0,0]; mentalProgress = 0; lastProgressStep = -1; updateMentalProgress(true);
    refill(); spawn(); setEffect('こころ整理 READY'); talk('ready'); hideMessage();
    el.msg.classList.remove('result-message');
    document.querySelector('.board-wrap')?.classList.remove('result-open');
    if(el.resultPanel) el.resultPanel.classList.add('hidden');
    if(el.rankingStatus) el.rankingStatus.textContent = '';
    updateUI();
  }

  function spawn(){
    refill(); current = piece(queue.shift()); refill(); canHold = true; resetLock(); lastActionRotate = false; lastKick = [0,0];
    if(collides(current.x, current.y, current.matrix)) gameOver();
  }

  function collides(px, py, matrix){
    for(let y=0;y<matrix.length;y++) for(let x=0;x<matrix[y].length;x++) if(matrix[y][x]){
      const bx = px+x, by = py+y;
      if(bx < 0 || bx >= COLS || by >= ROWS) return true;
      if(by >= 0 && grid[by][bx]) return true;
    }
    return false;
  }
  function isGrounded(){ return current && collides(current.x, current.y + 1, current.matrix); }

  function merge(){
    current.matrix.forEach((row,y)=>row.forEach((v,x)=>{ if(v && current.y+y>=0) grid[current.y+y][current.x+x]=current.type; }));
  }

  function rotateMatrix(m, dir){
    const n = m.length, out = Array.from({length:n},()=>Array(n).fill(0));
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) out[dir>0 ? x : n-1-x][dir>0 ? n-1-y : y] = m[y][x];
    return out;
  }

  function rotate(dir){
    if(over || paused || current.type === 'O') return;
    const from = current.rot;
    const to = (current.rot + (dir>0 ? 1 : 3)) % 4;
    const rotated = rotateMatrix(current.matrix, dir);
    const kicks = (current.type === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`] || [[0,0]];
    for(const [kx, ky] of kicks){
      if(!collides(current.x + kx, current.y - ky, rotated)){
        current.x += kx;
        current.y -= ky; // SRSの表は上が+なので、canvas座標では反転
        current.matrix = rotated;
        current.rot = to;
        lastActionRotate = true;
        lastKick = [kx, ky];
        touchLockReset();
        playSE('rotate'); draw();
        return;
      }
    }
  }

  function move(dx){
    if(over||paused) return;
    if(!collides(current.x+dx,current.y,current.matrix)){
      current.x += dx; lastActionRotate = false; touchLockReset(); playSE('move'); draw();
    }
  }
  function softDrop(){
    if(over||paused) return;
    if(!collides(current.x,current.y+1,current.matrix)){
      current.y++;
      score++; playSE('move');
      dropCounter = 0;
      groundedTime = 0;
      wasGrounded = false;
      lastActionRotate = false;
    } else {
      // 下長押しで床やブロックに触れても即固定しない。
      // Tスピン用に通常のロック遅延をそのまま使う。
      if(!wasGrounded){ groundedTime = 0; wasGrounded = true; }
    }
    updateUI(); draw();
  }
  function hardDrop(){
    if(over||paused) return;
    let d=0; while(!collides(current.x,current.y+1,current.matrix)){ current.y++; d++; }
    score += d*2; playSE('harddrop'); lock();
  }

  function holdPiece(){
    if(over || paused || !canHold) return;
    const t = current.type;
    if(hold){ current = piece(hold); hold = t; } else { hold = t; spawn(); }
    canHold = false; resetLock(); lastActionRotate = false; lastKick = [0,0]; playSE('hold'); talk('hold'); draw();
  }

  function lock(){
    const tspin = getTSpinType();
    merge();
    const cleared = clearLines();
    if(!cleared && tspin === 'none') playSE('lock');
    applyScore(cleared, tspin);
    const levelUpOccurred = refreshLevel();
    if(cleared) burst(cleared);
    spawn(); updateUI(); draw();
  }

  function blockAt(x,y){
    if(x < 0 || x >= COLS || y >= ROWS) return true;
    if(y < 0) return false;
    return !!grid[y][x];
  }

  function getTSpinType(){
    if(current.type !== 'T' || !lastActionRotate) return 'none';
    const cx = current.x + 1, cy = current.y + 1;
    const corners = [blockAt(cx-1,cy-1), blockAt(cx+1,cy-1), blockAt(cx-1,cy+1), blockAt(cx+1,cy+1)];
    const blocked = corners.filter(Boolean).length;
    if(blocked < 3) return 'none';

    // 向いている方向の前2角が埋まっていれば通常T-Spin。後ろ2角だけならMini寄り。
    const frontByRot = {
      0: [corners[0], corners[1]], // 上向き
      1: [corners[1], corners[3]], // 右向き
      2: [corners[2], corners[3]], // 下向き
      3: [corners[0], corners[2]]  // 左向き
    };
    const frontBlocked = frontByRot[current.rot].filter(Boolean).length;
    if(frontBlocked === 2 || Math.abs(lastKick[1]) === 2) return 'full';
    return 'mini';
  }

  function clearLines(){
    let count = 0;
    for(let y=ROWS-1;y>=0;y--){
      if(grid[y].every(Boolean)){ grid.splice(y,1); grid.unshift(Array(COLS).fill(null)); count++; y++; }
    }
    lines += count; return count;
  }

  function applyScore(cleared, tspin){
    const fullT = tspin === 'full';
    const miniT = tspin === 'mini';
    let base = 0;
    if(fullT) base = [400,800,1200,1600][cleared] || 400;
    else if(miniT) base = cleared ? 200 : 100;
    else base = [0,100,300,500,800][cleared];

    if(cleared > 0 || fullT || miniT){
      if(cleared > 0) combo++; else combo = -1; bestCombo = Math.max(bestCombo, combo);
      score += base * level + (cleared > 0 ? Math.max(0, combo) * 50 : 0);
      const difficult = fullT || cleared === 4 || (miniT && cleared > 0);
      if(difficult && b2b) score += Math.floor(base * level * 0.5);
      b2b = difficult ? true : (cleared > 0 ? false : b2b);
      let label = '';


      if(fullT){
        suppressProgressVoiceOnce = true;
        suppressLevelVoiceOnce = true;

        label = cleared >= 2 ? '視点転換！ T-SPIN DOUBLE' : '視点転換！ T-SPIN';
        playSE('tspin');
        ring();
        toast('視点転換！');
        talk('tspin');
      }

      
      else if(miniT){
        suppressProgressVoiceOnce = true;
        suppressLevelVoiceOnce = true;

        label = '小さな視点転換';
        playSE('tspin');
        ring();
        toast('T-SPIN MINI');
        talk('tspin');
      }



      else if(cleared === 4){ label = '大きな気付き！'; playSE('tetris'); flash(); toast('大きな気付き！'); talk('tetris'); }
      else { 
        playSE('line');
        toast('整理できた');
        talkLineByMood();
      }
      setEffect((b2b && difficult ? 'B2B ' : '') + label + (combo>0 ? ` / 気付きコンボ ${combo}` : ''));
      if(cleared === 4 || fullT || miniT) burst(3);
    } else {
      combo = -1;
    }
  }

  function ghostY(){ let y=current.y; while(!collides(current.x,y+1,current.matrix)) y++; return y; }
  

  function rect(c, x, y, s, color, alpha=1, type=null){
    c.save();
    c.globalAlpha = alpha;

    const px = x * s;
    const py = y * s;

    /* 背景色 */
    c.fillStyle = color;
    c.fillRect(px + 1, py + 1, s - 2, s - 2);

    /* グラデーション */
    const g = c.createLinearGradient(
      px,
      py,
      px,
      py + s
    );

    g.addColorStop(0,'rgba(255,255,255,.18)');
    g.addColorStop(1,'rgba(0,0,0,.18)');

    c.fillStyle = g;
    c.fillRect(px + 1, py + 1, s - 2, s - 2);

    /* PNG */
    const img = type ? minoImages[type] : null;

    if(img && img.complete && img.naturalWidth){

      c.drawImage(
        img,
        px + 2,
        py + 2,
        s - 4,
        s - 4
      );
    }

    /* 枠 */

    c.strokeStyle = 'rgba(255,255,255,.22)';
    c.lineWidth = 1;

    c.strokeRect(
      px + 1,
      py + 1,
      s - 2,
      s - 2
    );

    c.restore();
  }


  function drawMatrix(c, matrix, ox, oy, s, type, alpha=1){
    matrix.forEach((row,y)=>row.forEach((v,x)=>{
      if(v && oy+y>=0){
        rect(c, ox+x, oy+y, s, colors[type], alpha, type);
      }
    }));
  }


  function draw(){
    ctx.clearRect(0,0,boardCanvas.width,boardCanvas.height);
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    for(let x=0;x<=COLS;x++) ctx.fillRect(x*CELL,0,1,ROWS*CELL);
    for(let y=0;y<=ROWS;y++) ctx.fillRect(0,y*CELL,COLS*CELL,1);
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(grid[y][x]) rect(ctx, x, y, CELL, colors[grid[y][x]], 1, grid[y][x]);
    if(current && !over){ drawMatrix(ctx,current.matrix,current.x,ghostY(),CELL,current.type,.22); drawMatrix(ctx,current.matrix,current.x,current.y,CELL,current.type,1); }
    drawSide();
  }

  function drawPreview(c, type, yOffset=0){
    if(!type) return;
    const m = shapes[type], s = 22;
    const ox = Math.max(0, Math.floor((c.canvas.width / s - m[0].length) / 2));
    drawMatrix(c,m,ox,yOffset,s,type,1);
  }
  function drawSide(){
    holdCtx.clearRect(0,0,holdCanvas.width,holdCanvas.height); nextCtx.clearRect(0,0,nextCanvas.width,nextCanvas.height);
    holdCtx.fillStyle = nextCtx.fillStyle = 'rgba(255,255,255,.08)'; holdCtx.fillRect(0,0,96,96); nextCtx.fillRect(0,0,96,240);
    drawPreview(holdCtx, hold, 1);
    queue.slice(0,4).forEach((t,i)=>drawPreview(nextCtx,t,i*2+1));
  }

  function updateUI(){ el.score.textContent=score; el.lines.textContent=lines; el.level.textContent=level; el.combo.textContent=Math.max(0,combo); updateMentalProgress(); }
  function setEffect(t){ el.effect.textContent = t; }
  function showMessage(t){ el.msg.textContent=t; el.msg.classList.remove('hidden'); }
  function hideMessage(){ el.msg.classList.add('hidden'); }


  function gameOver(){
    over=true;
    playSE('gameover');
    stopBgm();
    talk('over');
    const result = getResultData();
    showMessage(`気持ちは楽になった？\nお疲れさま\n\n今日のこころ整理率 ${result.rate}%\n共感ポイント ${result.score}\n整理した悩み ${result.lines}個\n気付きコンボ ${result.combo}回`);
    el.msg.classList.add('result-message');
    document.querySelector('.board-wrap')?.classList.add('result-open');
    if(el.resultPanel){
      el.resultPanel.classList.remove('hidden');
      loadRanking();
    }
  }

  
   
  function getResultData(){
    return {
      score,
      rate: Math.min(100, Math.max(0, Math.round(mentalProgress * 100))),
      lines,
      combo: Math.max(0, bestCombo),
      level
    };
  }


    
  function renderRanking(data){
    if(!el.rankingList) return;

    el.rankingList.innerHTML = '';

    if(!Array.isArray(data) || data.length === 0){
      const li = document.createElement('li');
      li.textContent = 'まだランキングはありません';
      el.rankingList.appendChild(li);
      return;
    }

    data.slice(0, 10).forEach((item, index) => {
      const li = document.createElement('li');

      const rank = document.createElement('span');
      rank.className = 'ranking-rank';
      rank.textContent = `${index + 1}.`;

      const body = document.createElement('span');
      body.className = 'ranking-body';

      const name = String(item.name || '名無し');
      const itemScore = Number(item.score || 0);
      const itemRate = Number(item.rate || 0);

      body.textContent = `${name} / ${itemScore}pt / 整理率${itemRate}%`;

      li.appendChild(rank);
      li.appendChild(body);
      el.rankingList.appendChild(li);
    });
  }




  async function loadRanking(){
    if(!el.rankingList) return;
    try{
      const res = await fetch('ranking.php', { cache: 'no-store' });
      if(!res.ok) throw new Error('ranking load failed');
      const data = await res.json();
      renderRanking(data);
    }catch(e){
      renderRanking([]);
      if(el.rankingStatus) el.rankingStatus.textContent = 'ランキングの読み込みに失敗しました';
    }
  }



  async function saveRanking(){

    if(!over) return;
    if(rankingSaved) return;

    rankingSaved = true;

    if(el.saveRanking){
      el.saveRanking.disabled = true;
      el.saveRanking.style.pointerEvents = 'none';
      el.saveRanking.textContent = '登録済み';
    }

    const name = (el.playerName?.value || '').trim() || '名無し';
    const result = getResultData();

    if(el.rankingStatus){
      el.rankingStatus.textContent = '登録中...';
    }

    try{
      const res = await fetch('ranking.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          score: result.score,
          rate: result.rate,
          lines: result.lines,
          combo: result.combo,
          level: result.level
        })
      });

      if(!res.ok) throw new Error('ranking save failed');

      const data = await res.json();
      renderRanking(data);

      if(el.rankingStatus){
        el.rankingStatus.textContent = 'ランキングに登録しました';
      }

    }catch(e){
      if(el.rankingStatus){
        el.rankingStatus.textContent = '登録に失敗しました。ページを更新して再試行してください';
      }
    }
  }





  function shareToX(){
    if(!over) return;
    const result = getResultData();

    const text =
    `メンタルテトリスでこころを整理しました🧩

    今日のこころ整理率：${result.rate}%
    共感ポイント：${result.score}
    整理した悩み：${result.lines}個
    気付きコンボ：${result.combo}回

    #メンタルテトリス
    #悩みと学びの処方せん`;

    const shareUrl =
      'https://twitter.com/intent/tweet?text=' +
      encodeURIComponent(text) +
      '&url=' +
      encodeURIComponent(SHARE_SITE_URL);

    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }

function togglePause(){ if(over) return; paused=!paused; paused ? showMessage('少し休憩') : hideMessage(); }

  function loop(time=0){
    const delta = lastTime ? time - lastTime : 0; lastTime = time;
    if(gameStarted && !paused && !over){
      dropCounter += delta;
      const interval = Math.max(260, 820 - (level-1)*45);
      if(dropCounter > interval){
        if(!collides(current.x,current.y+1,current.matrix)){
          current.y++; dropCounter = 0; groundedTime = 0; wasGrounded = false; lastActionRotate = false;
        } else {
          dropCounter = 0;
        }
      }

      if(isGrounded()){
        if(!wasGrounded){ groundedTime = 0; wasGrounded = true; }
        groundedTime += delta;
        if(groundedTime >= LOCK_DELAY) lock();
      } else {
        groundedTime = 0; wasGrounded = false;
      }
    }
    draw(); drawFx(); updateUI(); requestAnimationFrame(loop);
  }

  const keyMap = {
    ArrowLeft: () => move(-1), ArrowRight: () => move(1), ArrowDown: softDrop,
    KeyZ: () => rotate(-1), KeyX: () => rotate(1), ArrowUp: () => rotate(1), Space: hardDrop,
    KeyC: holdPiece, ShiftLeft: holdPiece, ShiftRight: holdPiece, KeyP: togglePause
  };
  const holdableKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown']);
  const keyTimers = new Map();


  function startKeyRepeat(code){
    if(!gameStarted) return;
    if(over) return;
    ensureAudio();

    if(keyTimers.has(code)) return;
    const run = keyMap[code];
    if(!run) return;
    run();
    if(holdableKeys.has(code)){
      const delay = code === 'ArrowDown' ? 60 : 95;
      keyTimers.set(code, setInterval(run, delay));
    }
  }



  function stopKeyRepeat(code){
    const timer = keyTimers.get(code);
    if(timer) clearInterval(timer);
    keyTimers.delete(code);
  }
  document.addEventListener('keydown', e => {
    if(!keyMap[e.code]) return;
    e.preventDefault();
    if(e.repeat && !holdableKeys.has(e.code)) return;
    startKeyRepeat(e.code);
  });
  document.addEventListener('keyup', e => stopKeyRepeat(e.code));
  window.addEventListener('blur', () => { keyTimers.forEach(clearInterval); keyTimers.clear(); });
  el.pause.addEventListener('click', togglePause); 


  el.restart.addEventListener('click', ()=>{
    stopBgm();
    gameStarted = false;
    reset();

    if(el.title){
      el.title.classList.remove('hidden');
    }

    hideMessage();

    if(el.resultPanel){
      el.resultPanel.classList.add('hidden');
    }
  });


  el.bgm.addEventListener('click', ()=>setBgm(!bgmOn)); el.se.addEventListener('click', ()=>setSe(!seOn));
  
  
  el.start.addEventListener('click', ()=>{
    ensureAudio();

    gameStarted = true;

    el.title.classList.add('hidden');

    reset();

    if(bgmOn){
      startBgm();
    }
  });
    
  
  document.querySelectorAll('[data-mood]').forEach(btn=>btn.addEventListener('click', ()=>setMood(btn.dataset.mood)));
  el.saveRanking?.addEventListener('click', saveRanking);
  el.shareX?.addEventListener('click', shareToX);
  setBgm(bgmOn); setSe(seOn); setMood('normal');

  const action = { left:()=>move(-1), right:()=>move(1), down:softDrop, ccw:()=>rotate(-1), cw:()=>rotate(1), hard:hardDrop, hold:holdPiece };
  document.querySelectorAll('[data-action]').forEach(btn=>{
    let timer=null;

    const run=()=>{
      if(!gameStarted) return;
      ensureAudio();
      action[btn.dataset.action]?.();
    };

    btn.addEventListener('pointerdown', e=>{ e.preventDefault(); run(); if(['left','right','down'].includes(btn.dataset.action)){ timer=setInterval(run, btn.dataset.action === 'down' ? 55 : 85); } });
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>btn.addEventListener(ev,()=>{ if(timer) clearInterval(timer); timer=null; }));
  });

  reset();

  gameStarted = false;

  draw();

  requestAnimationFrame(loop);

})();
