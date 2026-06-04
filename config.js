// メンタルテトリス設定ファイル
// 本番公開時は SITE_URL と OGP のURLを実際のURLに変更してください。

window.MENTAL_TETRIS_SITE_URL = 'https://www.field-up.work/mental-tetris/';

window.MENTAL_TETRIS_AUDIO_CONFIG = {
  bgm: {
    main: 'assets/bgm/cooking.mp3'
  },
  se: {
    move: '',
    rotate: 'assets/se/rotate.mp3',
    lock: 'assets/se/lock.mp3',
    harddrop: '',
    hold: '',
    line: 'assets/se/line.mp3',
    tspin: 'assets/se/tspin.mp3',
    tetris: 'assets/se/tetris.mp3',
    gameover: 'assets/se/gameover.mp3'
  },
  voice: {
    progress_25: 'assets/voice/progress/progress_25.wav',
    progress_50: 'assets/voice/progress/progress_50.wav',
    progress_75: 'assets/voice/progress/progress_75.wav',
    progress_100: 'assets/voice/progress/progress_100.wav',

    line_normal: 'assets/voice/normal/line.wav',
    line_anxiety: 'assets/voice/anxiety/line.wav',
    line_anger: 'assets/voice/anger/line.wav',
    line_sadness: 'assets/voice/sadness/line.wav',
    line_fatigue: 'assets/voice/fatigue/line.wav',

    tspin: 'assets/voice/tspin.wav',
    tetris: 'assets/voice/tetris.wav',
    level: 'assets/voice/level.wav',
    hold: 'assets/voice/hold.wav',
    over: 'assets/voice/over.wav'
  },

  volume: {
    bgm: 0.2,
    se: 0.5,
    voice: 0.8
  },
  fallbackBeep: true
};
