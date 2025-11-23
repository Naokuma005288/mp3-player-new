export class PlayerCore {
    constructor(state, dom, visualizer, helpers) {
        this.state = state;
        this.dom = dom;
        this.visualizer = visualizer;
        this.formatTime = helpers.formatTime;
        this.showToast = helpers.showToast;
        this.saveSettings = helpers.saveSettings;

        this.currentObjectURL = null;
    }

    init() {
        const d = this.dom;

        // 再生/一時停止
        d.playPauseBtn.addEventListener('click', () => {
            this.visualizer.ensureInit();
            this.visualizer.resumeIfSuspended();
            if (this.state.playlist.length === 0) return;

            if (this.state.currentTrackIndex === -1) {
                this.loadTrack(0);
                return;
            }
            this.togglePlayPause();
        });

        // オーディオイベント
        d.audioPlayer.addEventListener('play', () => {
            this.updatePlayPauseIcon();
            this.updateMinimalOverlay();
            this.highlightCurrentTrack();
        });
        d.audioPlayer.addEventListener('pause', () => {
            this.updatePlayPauseIcon();
            this.updateMinimalOverlay();
        });
        d.audioPlayer.addEventListener('ended', () => {
            if (this.state.repeatMode === 'one') {
                d.audioPlayer.currentTime = 0;
                d.audioPlayer.play();
            } else {
                this.playNext();
            }
        });
        d.audioPlayer.addEventListener('timeupdate', () => this.updateProgress());
        d.audioPlayer.addEventListener('loadedmetadata', () => this.setDuration());

        // プログレスバー
        d.progressBar.addEventListener('input', (e) => {
            if (!d.audioPlayer.duration) return;
            const newTime = d.audioPlayer.duration * (e.target.value / 100);
            d.currentTimeDisplay.textContent = this.formatTime(newTime);
        });
        d.progressBar.addEventListener('change', (e) => {
            if (!d.audioPlayer.duration) return;
            const newTime = d.audioPlayer.duration * (e.target.value / 100);
            d.audioPlayer.currentTime = newTime;
        });

        // 音量
        d.volumeControl.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            d.audioPlayer.volume = vol;
            if (vol > 0) this.state.lastVolume = vol;
            this.updateVolumeIcon(vol);
            this.persist();
        });

        d.volumeMuteToggle.addEventListener('click', () => {
            if (d.audioPlayer.volume > 0) {
                d.audioPlayer.volume = 0;
            } else {
                d.audioPlayer.volume = this.state.lastVolume;
            }
            d.volumeControl.value = d.audioPlayer.volume;
            this.updateVolumeIcon(d.audioPlayer.volume);
            this.persist();
        });

        // ナビ・トグル
        d.prevBtn.addEventListener('click', () => this.playPrev());
        d.nextBtn.addEventListener('click', () => this.playNext());
        d.seekForwardBtn.addEventListener('click', () => this.seek(10));
        d.seekBackwardBtn.addEventListener('click', () => this.seek(-10));
        d.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        d.repeatBtn.addEventListener('click', () => this.toggleRepeat());
        d.playbackRateBtn.addEventListener('click', () => this.changePlaybackRate());

        // ミニマルモード
        d.dropZone.addEventListener('dblclick', () => this.toggleMinimalMode());
        d.dropZone.addEventListener('click', (e) => {
            if (!this.state.isMinimalMode) return;
            e.stopPropagation();
            if (this.state.playlist.length === 0) return;

            this.visualizer.ensureInit();
            this.visualizer.resumeIfSuspended();
            if (this.state.currentTrackIndex === -1) {
                this.loadTrack(0);
            } else {
                this.togglePlayPause();
            }
        });

        // キーボード
        document.addEventListener('keydown', (e) => {
            if (e.target === d.playlistSearch) return;
            if (this.state.playlist.length === 0) return;

            if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                d.playPauseBtn.click();
            }
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                if (e.shiftKey) this.playNext();
                else this.seek(10);
            }
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                if (e.shiftKey) this.playPrev();
                else this.seek(-10);
            }
        });
    }

    persist() {
        this.saveSettings({
            volume: this.dom.audioPlayer.volume,
            lastVolume: this.state.lastVolume,
            repeatMode: this.state.repeatMode,
            isShuffle: this.state.isShuffle,
            playbackRateIndex: this.state.currentRateIndex,
            theme: document.documentElement.classList.contains('light-mode') ? 'light' : 'dark',
            visualizerStyle: this.state.visualizerStyle
        });
    }

    enableControls() {
        const isDisabled = this.state.playlist.length === 0;
        const d = this.dom;
        d.playPauseBtn.disabled = isDisabled;
        d.progressBar.disabled = isDisabled;
        d.prevBtn.disabled = isDisabled;
        d.nextBtn.disabled = isDisabled;
        d.shuffleBtn.disabled = isDisabled;
        d.repeatBtn.disabled = isDisabled;
        d.seekForwardBtn.disabled = isDisabled;
        d.seekBackwardBtn.disabled = isDisabled;
        d.playlistToggleBtn.disabled = isDisabled;
        d.playbackRateBtn.disabled = isDisabled;
    }

    updateFileUIState() {
        if (this.state.playlist.length > 0) {
            this.dom.fileSelectUI.classList.add('file-select-hidden');
        } else {
            this.dom.fileSelectUI.classList.remove('file-select-hidden');
        }
    }

    updateNavButtons() {
        if (this.state.playlist.length <= 1) {
            this.dom.prevBtn.disabled = true;
            this.dom.nextBtn.disabled = true;
            return;
        }
        this.dom.prevBtn.disabled = false;
        this.dom.nextBtn.disabled = false;
    }

    resetAlbumArt() {
        this.dom.albumArt.src = 'https://placehold.co/512x512/312e81/ffffff?text=MP3';
        this.dom.albumArt.classList.add('opacity-20');
    }

    updateMainUI(index) {
        const d = this.dom;
        if (index < 0 || !this.state.playlist[index]) {
            d.songTitle.textContent = '再生する曲はありません';
            d.songArtist.textContent = 'ファイルをロードしてください';
            return;
        }

        const track = this.state.playlist[index];
        d.songTitle.classList.add('opacity-0', 'scale-90');
        d.songArtist.classList.add('opacity-0', 'scale-90');

        setTimeout(() => {
            d.songTitle.textContent = track.title;
            d.songArtist.textContent = track.artist;
            d.songTitle.classList.remove('opacity-0', 'scale-90');
            d.songArtist.classList.remove('opacity-0', 'scale-90');
        }, 300);

        if (track.artwork) {
            d.albumArt.src = track.artwork;
            d.albumArt.classList.remove('opacity-20');
        } else {
            this.resetAlbumArt();
        }
    }

    prepareTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) return;

        this.state.currentTrackIndex = index;
        const track = this.state.playlist[index];

        // revoke previous
        if (this.currentObjectURL) URL.revokeObjectURL(this.currentObjectURL);
        this.currentObjectURL = URL.createObjectURL(track.file);

        const d = this.dom;
        d.audioPlayer.src = this.currentObjectURL;
        d.audioPlayer.playbackRate = this.state.playbackRates[this.state.currentRateIndex];

        this.updateMainUI(index);
        this.updateNavButtons();
        this.highlightCurrentTrack();
    }

    loadTrack(index) {
        if (index < 0 || index >= this.state.playlist.length) {
            if (this.state.repeatMode === 'none') {
                this.dom.audioPlayer.pause();
                if (this.state.playlist.length > 0) {
                    this.prepareTrack(0);
                    this.updatePlayPauseIcon();
                } else {
                    this.state.currentTrackIndex = -1;
                }
            }
            return;
        }

        this.visualizer.ensureInit();
        this.visualizer.resumeIfSuspended();

        this.prepareTrack(index);

        const playPromise = this.dom.audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.log("自動再生がブロックされました:", err);
                this.dom.audioPlayer.pause();
                this.updatePlayPauseIcon();
            });
        }
    }

    togglePlayPause() {
        if (this.dom.audioPlayer.paused) this.dom.audioPlayer.play();
        else this.dom.audioPlayer.pause();
    }

    updatePlayPauseIcon() {
        const d = this.dom;
        const isPaused = d.audioPlayer.paused || d.audioPlayer.ended;
        d.playIcon.classList.toggle('hidden', !isPaused);
        d.pauseIcon.classList.toggle('hidden', isPaused);
        d.minimalPlayIcon.classList.toggle('hidden', !isPaused);
        d.minimalPauseIcon.classList.toggle('hidden', isPaused);
    }

    updateMinimalOverlay() {
        const d = this.dom;
        if (this.state.isMinimalMode) {
            if (d.audioPlayer.paused || d.audioPlayer.ended) {
                d.minimalPlayBtnOverlay.classList.remove('opacity-0', 'pointer-events-none');
                d.minimalPlayBtnOverlay.classList.add('pointer-events-auto');
            } else {
                d.minimalPlayBtnOverlay.classList.add('opacity-0', 'pointer-events-none');
                d.minimalPlayBtnOverlay.classList.remove('pointer-events-auto');
            }
        } else {
            d.minimalPlayBtnOverlay.classList.add('opacity-0', 'pointer-events-none');
            d.minimalPlayBtnOverlay.classList.remove('pointer-events-auto');
        }
    }

    updateProgress() {
        const d = this.dom;
        if (d.audioPlayer.duration) {
            const percentage = (d.audioPlayer.currentTime / d.audioPlayer.duration) * 100;
            d.progressBar.value = percentage;

            const newTime = this.formatTime(d.audioPlayer.currentTime);
            if (d.currentTimeDisplay.textContent !== newTime) {
                d.currentTimeDisplay.classList.add('opacity-0');
                setTimeout(() => {
                    d.currentTimeDisplay.textContent = newTime;
                    d.currentTimeDisplay.classList.remove('opacity-0');
                }, 100);
            }
        }
    }

    setDuration() {
        if (this.dom.audioPlayer.duration) {
            this.dom.durationDisplay.textContent = this.formatTime(this.dom.audioPlayer.duration);
        }
    }

    seek(sec) {
        const a = this.dom.audioPlayer;
        if (a.readyState >= 2) {
            a.currentTime = Math.min(Math.max(0, a.currentTime + sec), a.duration);
        }
    }

    playNext() {
        if (this.state.playlist.length === 0) return;

        let newIndex;
        if (this.state.isShuffle) {
            const curShuffleIndex = this.state.shuffledPlaylist.indexOf(this.state.currentTrackIndex);
            const nextShuffleIndex = curShuffleIndex + 1;

            if (nextShuffleIndex >= this.state.shuffledPlaylist.length) {
                if (this.state.repeatMode === 'all') {
                    this.createShuffledPlaylist();
                    newIndex = this.state.shuffledPlaylist[0];
                } else {
                    this.dom.audioPlayer.pause();
                    this.state.currentTrackIndex = -1;
                    this.prepareTrack(0);
                    return;
                }
            } else {
                newIndex = this.state.shuffledPlaylist[nextShuffleIndex];
            }
        } else {
            newIndex = this.state.currentTrackIndex + 1;
            if (newIndex >= this.state.playlist.length) {
                if (this.state.repeatMode === 'all') newIndex = 0;
                else {
                    this.dom.audioPlayer.pause();
                    this.state.currentTrackIndex = -1;
                    this.prepareTrack(0);
                    return;
                }
            }
        }

        this.loadTrack(newIndex);
    }

    playPrev() {
        if (this.state.playlist.length === 0) return;

        if (this.dom.audioPlayer.currentTime > 5) {
            this.dom.audioPlayer.currentTime = 0;
            return;
        }

        let newIndex;
        if (this.state.isShuffle) {
            const curShuffleIndex = this.state.shuffledPlaylist.indexOf(this.state.currentTrackIndex);
            const prevShuffleIndex = curShuffleIndex - 1;
            newIndex = prevShuffleIndex < 0
                ? this.state.shuffledPlaylist[this.state.shuffledPlaylist.length - 1]
                : this.state.shuffledPlaylist[prevShuffleIndex];
        } else {
            newIndex = this.state.currentTrackIndex - 1;
            if (newIndex < 0) {
                if (this.state.repeatMode === 'all') newIndex = this.state.playlist.length - 1;
                else {
                    this.dom.audioPlayer.currentTime = 0;
                    return;
                }
            }
        }

        this.loadTrack(newIndex);
    }

    toggleShuffle() {
        this.state.isShuffle = !this.state.isShuffle;
        this.dom.shuffleBtn.classList.toggle('btn-active', this.state.isShuffle);
        if (this.state.isShuffle) this.createShuffledPlaylist();
        this.persist();
    }

    createShuffledPlaylist() {
        const current = this.state.currentTrackIndex !== -1 ? [this.state.currentTrackIndex] : [];
        let remaining = this.state.playlist.map((_, i) => i).filter(i => i !== this.state.currentTrackIndex);

        for (let i = remaining.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }

        this.state.shuffledPlaylist = [...current, ...remaining];
    }

    toggleRepeat() {
        const d = this.dom;
        d.repeatNoneIcon.classList.add('hidden');
        d.repeatAllIcon.classList.add('hidden');
        d.repeatOneIcon.classList.add('hidden');

        if (this.state.repeatMode === 'none') {
            this.state.repeatMode = 'all';
            d.repeatAllIcon.classList.remove('hidden');
        } else if (this.state.repeatMode === 'all') {
            this.state.repeatMode = 'one';
            d.repeatOneIcon.classList.remove('hidden');
        } else {
            this.state.repeatMode = 'none';
            d.repeatNoneIcon.classList.remove('hidden');
        }

        this.updateNavButtons();
        this.persist();
    }

    changePlaybackRate() {
        this.state.currentRateIndex = (this.state.currentRateIndex + 1) % this.state.playbackRates.length;
        const newRate = this.state.playbackRates[this.state.currentRateIndex];
        this.dom.audioPlayer.playbackRate = newRate;
        this.dom.playbackRateBtn.textContent = `${newRate}x`;
        this.persist();
    }

    updateVolumeIcon(volume) {
        const d = this.dom;
        if (volume === 0) {
            d.volumeHighIcon.classList.add('hidden');
            d.volumeMuteIcon.classList.remove('hidden');
        } else {
            d.volumeHighIcon.classList.remove('hidden');
            d.volumeMuteIcon.classList.add('hidden');
        }
    }

    toggleMinimalMode() {
        if (this.state.playlist.length === 0) return;
        this.state.isMinimalMode = !this.state.isMinimalMode;
        this.dom.playerContainer.classList.toggle('minimal', this.state.isMinimalMode);
        this.updateMinimalOverlay();
    }

    highlightCurrentTrack() {
        document.querySelectorAll('#playlist-ul li').forEach(li => li.classList.remove('active'));
        const cur = document.getElementById(`track-${this.state.currentTrackIndex}`);
        if (cur) cur.classList.add('active');
    }

    resetPlayerUI() {
        this.updateMainUI(-1);
        this.resetAlbumArt();
        this.enableControls();
        this.updateFileUIState();
        this.dom.durationDisplay.textContent = "0:00";
        this.dom.currentTimeDisplay.textContent = "0:00";
        this.dom.progressBar.value = 0;
        this.updatePlayPauseIcon();
    }
}
