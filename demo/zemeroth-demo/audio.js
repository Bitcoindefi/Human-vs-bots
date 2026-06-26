class AudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.musicSource = null;
        this.sounds = {};
        this.music = {};
        this.isMuted = false;
        this.initialized = false;

        const saved = localStorage.getItem('hvb_audio_volumes');
        this.volumes = saved ? JSON.parse(saved) : {
            master: 0.7,
            music: 0.4,
            sfx: 0.6
        };
    }

    async init() {
        if (this.initialized) return;

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.musicGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();

            this.masterGain.connect(this.ctx.destination);
            this.musicGain.connect(this.masterGain);
            this.sfxGain.connect(this.masterGain);

            this.updateVolumes();
            this.initialized = true;

            // Background load
            this.loadAssets();
            console.log("Audio Manager Initialized");
        } catch (e) {
            console.error("AudioContext not supported", e);
        }
    }

    updateVolumes() {
        if (!this.ctx) return;
        const muteFactor = this.isMuted ? 0 : 1;
        // Use setTargetAtTime for smooth transitions
        this.masterGain.gain.setTargetAtTime(this.volumes.master * muteFactor, this.ctx.currentTime, 0.05);
        this.musicGain.gain.setTargetAtTime(this.volumes.music, this.ctx.currentTime, 0.05);
        this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, this.ctx.currentTime, 0.05);
        localStorage.setItem('hvb_audio_volumes', JSON.stringify(this.volumes));
    }

    async loadAssets() {
        // High quality royalty free assets from Mixkit/SoundHelix for demo feel
        const sfxUrls = {
            click: 'https://assets.mixkit.co/sfx/preview/mixkit-simple-click-interface-1111.mp3',
            move: 'https://assets.mixkit.co/sfx/preview/mixkit-fast-small-sweep-transition-166.mp3',
            attack: 'https://assets.mixkit.co/sfx/preview/mixkit-light-impact-with-metallic-reverb-2144.mp3',
            produce: 'https://assets.mixkit.co/sfx/preview/mixkit-industrial-mechanical-click-2141.mp3',
            endTurn: 'https://assets.mixkit.co/sfx/preview/mixkit-magic-click-soft-hit-1118.mp3',
            victory: 'https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3',
            defeat: 'https://assets.mixkit.co/sfx/preview/mixkit-game-over-dark-orchestra-633.mp3'
        };

        const musicUrls = {
            menu: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
            game: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3'
        };

        for (const [name, url] of Object.entries(sfxUrls)) {
            this.loadBuffer(url).then(buffer => { if (buffer) this.sounds[name] = buffer; });
        }
        for (const [name, url] of Object.entries(musicUrls)) {
            this.loadBuffer(url).then(buffer => {
                if (buffer) {
                    this.music[name] = buffer;
                    // If we were waiting for this music to start
                    if (this.pendingMusic === name) {
                        this.playMusic(name);
                    }
                }
            });
        }
    }

    async loadBuffer(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.warn(`Failed to load audio: ${url}`, e);
            return null;
        }
    }

    playSfx(name) {
        if (!this.initialized || !this.sounds[name]) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const source = this.ctx.createBufferSource();
        source.buffer = this.sounds[name];
        source.connect(this.sfxGain);
        source.start(0);
    }

    playMusic(name) {
        if (!this.initialized) {
            this.pendingMusic = name;
            return;
        }
        if (!this.music[name]) {
            this.pendingMusic = name;
            return;
        }

        if (this.currentMusicName === name) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.stopMusic();
        this.musicSource = this.ctx.createBufferSource();
        this.musicSource.buffer = this.music[name];
        this.musicSource.loop = true;
        this.musicSource.connect(this.musicGain);
        this.musicSource.start(0);
        this.currentMusicName = name;
        this.pendingMusic = null;
    }

    stopMusic() {
        if (this.musicSource) {
            try {
                this.musicSource.stop();
            } catch (e) {}
            this.musicSource = null;
            this.currentMusicName = null;
        }
    }

    setVolume(type, value) {
        if (this.volumes[type] !== undefined) {
            this.volumes[type] = parseFloat(value);
            this.updateVolumes();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.updateVolumes();
        return this.isMuted;
    }
}

export const audioManager = new AudioManager();
