export class PlaylistManager {
    constructor(state, dom, { formatTime, showToast }, callbacks) {
        this.state = state;
        this.dom = dom;
        this.formatTime = formatTime;
        this.showToast = showToast;

        this.onSelect = callbacks.onSelect;
        this.onRemove = callbacks.onRemove;
        this.onCurrentMetadataUpdate = callbacks.onCurrentMetadataUpdate;
    }

    handleFiles(files) {
        const newFiles = Array.from(files).filter(f => f.type === 'audio/mpeg');
        const wasEmpty = this.state.playlist.length === 0;

        for (const file of newFiles) {
            this.state.playlist.push({
                file,
                title: file.name,
                artist: 'ロード中...',
                artwork: null,
                duration: null
            });
            const index = this.state.playlist.length - 1;
            this.readMetadata(file, index);
            this.getDuration(file, index);
        }

        if (newFiles.length > 0) {
            this.showToast(`${newFiles.length} 曲が追加されました`);
        }
        this.render();

        return { addedCount: newFiles.length, wasEmpty };
    }

    readMetadata(file, index) {
        const jsmediatags = window.jsmediatags;
        if (!jsmediatags) return;

        jsmediatags.read(file, {
            onSuccess: (tag) => {
                const tags = tag.tags;

                let artworkUrl = null;
                if (tags.picture) {
                    const { data, format } = tags.picture;
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) {
                        base64String += String.fromCharCode(data[i]);
                    }
                    artworkUrl = `data:${format};base64,${window.btoa(base64String)}`;
                }

                const track = this.state.playlist[index];
                if (!track) return;

                track.title = tags.title || file.name;
                track.artist = tags.artist || '不明なアーティスト';
                track.artwork = artworkUrl;

                if (index === this.state.currentTrackIndex && this.onCurrentMetadataUpdate) {
                    this.onCurrentMetadataUpdate(index);
                }

                this.render();
            },
            onError: (error) => {
                console.error("メタデータ読み込みエラー:", error);
                const track = this.state.playlist[index];
                if (track) track.artist = 'メタデータがありません';
                this.render();
            }
        });
    }

    getDuration(file, index) {
        const tempAudio = new Audio();
        const url = URL.createObjectURL(file);
        tempAudio.src = url;

        tempAudio.addEventListener('loadedmetadata', () => {
            const track = this.state.playlist[index];
            if (track) track.duration = tempAudio.duration;
            this.render();
            URL.revokeObjectURL(url);
        });
        tempAudio.addEventListener('error', (e) => {
            console.error("曲の長さの取得エラー:", e);
            URL.revokeObjectURL(url);
        });
    }

    filter(query) {
        const q = query.toLowerCase();
        this.dom.playlistUl.querySelectorAll('li.playlist-item').forEach(li => {
            const index = parseInt(li.dataset.index);
            const track = this.state.playlist[index];
            if (!track) return;
            const isMatch =
                track.title.toLowerCase().includes(q) ||
                track.artist.toLowerCase().includes(q);
            li.classList.toggle('hidden', !isMatch);
        });
    }

    render() {
        const ul = this.dom.playlistUl;
        ul.innerHTML = '';

        if (this.state.playlist.length === 0) {
            ul.innerHTML = '<li class="placeholder text-center pt-10">曲をドロップしてください</li>';
            return;
        }

        this.state.playlist.forEach((track, index) => {
            const li = document.createElement('li');
            li.className = 'playlist-item flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors relative group';
            li.dataset.index = index;
            li.id = `track-${index}`;

            const img = document.createElement('img');
            img.src = track.artwork || 'https://placehold.co/50x50/312e81/ffffff?text=MP3';
            img.className = 'w-10 h-10 object-cover rounded-md';
            li.appendChild(img);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'flex-grow min-w-0';

            if (track.artist === 'ロード中...') {
                infoDiv.innerHTML = `
                    <p class="text-sm font-medium truncate">${track.title}</p>
                    <p class="text-xs truncate w-24 h-4 rounded bg-gray-500/30 animate-pulse" style="color: var(--text-secondary);"></p>
                `;
            } else {
                infoDiv.innerHTML = `
                    <p class="text-sm font-medium truncate">${track.title}</p>
                    <p class="text-xs truncate" style="color: var(--text-secondary);">${track.artist}</p>
                `;
            }
            li.appendChild(infoDiv);

            const durationSpan = document.createElement('span');
            durationSpan.className = 'text-xs font-mono px-2 playlist-duration';
            durationSpan.textContent = this.formatTime(track.duration);
            if (track.duration === null) {
                durationSpan.className += ' w-8 h-4 rounded bg-gray-500/30 animate-pulse';
            }
            li.appendChild(durationSpan);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100';
            deleteBtn.style.color = "var(--text-secondary)";
            deleteBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            `;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onRemove(index);
            });
            li.appendChild(deleteBtn);

            li.addEventListener('click', () => this.onSelect(index));

            if (index === this.state.currentTrackIndex) {
                li.classList.add('active');
            }

            ul.appendChild(li);
        });
    }
}
