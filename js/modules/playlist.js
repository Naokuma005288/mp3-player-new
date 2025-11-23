import {
  signatureForFile,
  readID3,
  getDurationOfFile,
  formatTime
} from './utils.js';

const PLAYLIST_KEY = 'mp3PlayerPlaylist_v3_4';

export function createPlaylist(ui, callbacks) {
  const {
    ul, searchInput
  } = ui;

  let playlist = [];
  let currentTrackIndex = -1;
  let shuffled = [];
  let isShuffle = false;

  // --- persistence ---
  function savePlaylistState(lastState = {}) {
    const meta = playlist.map(t => ({
      sig: t.sig,
      title: t.title,
      artist: t.artist,
      artwork: t.artwork,
      duration: t.duration,
      missing: !t.file
    }));
    const payload = {
      meta,
      lastState
    };
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(payload));
  }

  function loadPlaylistState() {
    try {
      const raw = localStorage.getItem(PLAYLIST_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function restoreFromStorage() {
    const data = loadPlaylistState();
    if (!data?.meta) return null;

    playlist = data.meta.map(m => ({
      file: null,
      sig: m.sig,
      title: m.title ?? '未ロード',
      artist: m.artist ?? '未ロード',
      artwork: m.artwork ?? null,
      duration: m.duration ?? null,
      missing: m.missing ?? true
    }));
    render();
    return data.lastState ?? null;
  }

  // --- add files ---
  async function addFiles(files) {
    const mp3Files = Array.from(files).filter(f => f.type === 'audio/mpeg');

    for (const file of mp3Files) {
      const sig = signatureForFile(file);

      // 既存の missing とマッチしたら置換
      const missIdx = playlist.findIndex(t => t.missing && t.sig === sig);
      if (missIdx >= 0) {
        playlist[missIdx].file = file;
        playlist[missIdx].missing = false;
        await fillMetadata(missIdx);
        continue;
      }

      const track = {
        file,
        sig,
        title: file.name,
        artist: 'ロード中...',
        artwork: null,
        duration: null,
        missing: false
      };
      playlist.push(track);
      const idx = playlist.length - 1;
      await fillMetadata(idx);
    }

    if (isShuffle) createShuffled();
    render();
    callbacks.onPlaylistChanged(playlist);
  }

  async function fillMetadata(index) {
    const track = playlist[index];
    if (!track?.file) return;

    const tags = await readID3(track.file);
    let artworkUrl = null;

    if (tags?.picture) {
      const { data, format } = tags.picture;
      let base64 = "";
      for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i]);
      artworkUrl = `data:${format};base64,${window.btoa(base64)}`;
    }

    track.title = tags?.title || track.file.name;
    track.artist = tags?.artist || '不明なアーティスト';
    track.artwork = artworkUrl;

    track.duration = await getDurationOfFile(track.file);

    render();
  }

  function removeTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    const wasPlaying = index === currentTrackIndex;

    playlist.splice(index, 1);

    if (wasPlaying) callbacks.onRemovedPlaying(index, playlist.length);
    else if (index < currentTrackIndex) currentTrackIndex--;

    if (isShuffle) createShuffled();
    render();
    callbacks.onPlaylistChanged(playlist);
  }

  function clearAll() {
    playlist = [];
    currentTrackIndex = -1;
    shuffled = [];
    render();
    callbacks.onPlaylistChanged(playlist);
  }

  function setCurrentIndex(i) {
    currentTrackIndex = i;
    highlight();
  }

  function setShuffle(flag) {
    isShuffle = flag;
    if (isShuffle) createShuffled();
  }

  function createShuffled() {
    const current = currentTrackIndex !== -1 ? [currentTrackIndex] : [];
    let rest = playlist.map((_, i) => i).filter(i => i !== currentTrackIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    shuffled = [...current, ...rest];
  }

  function getNextIndex(repeatMode) {
    if (!playlist.length) return -1;

    if (isShuffle) {
      const curS = shuffled.indexOf(currentTrackIndex);
      let nextS = curS + 1;
      if (nextS >= shuffled.length) {
        if (repeatMode === 'all') {
          createShuffled();
          return shuffled[0];
        }
        return -1;
      }
      return shuffled[nextS];
    }

    let next = currentTrackIndex + 1;
    if (next >= playlist.length) {
      if (repeatMode === 'all') return 0;
      return -1;
    }
    return next;
  }

  function getPrevIndex(repeatMode) {
    if (!playlist.length) return -1;

    if (isShuffle) {
      const curS = shuffled.indexOf(currentTrackIndex);
      let prevS = curS - 1;
      if (prevS < 0) {
        if (repeatMode === 'all') return shuffled[shuffled.length - 1];
        return shuffled[shuffled.length - 1];
      }
      return shuffled[prevS];
    }

    let prev = currentTrackIndex - 1;
    if (prev < 0) {
      if (repeatMode === 'all') return playlist.length - 1;
      return 0;
    }
    return prev;
  }

  function filterList(q) {
    const query = q.toLowerCase();
    ul.querySelectorAll('li.playlist-item').forEach(li => {
      const idx = parseInt(li.dataset.index);
      const t = playlist[idx];
      if (!t) return;
      const m = (t.title || '').toLowerCase().includes(query) ||
                (t.artist || '').toLowerCase().includes(query);
      li.classList.toggle('hidden', !m);
    });
  }

  // --- drag reorder ---
  let draggingIndex = null;
  let touchDragging = false;
  let touchHoldTimer = null;

  function onDragStart(e) {
    draggingIndex = parseInt(e.currentTarget.dataset.index);
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    clearDragOver();
    draggingIndex = null;
  }
  function onDragOver(e) {
    e.preventDefault();
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    clearDragOver();

    target.classList.add(before ? 'drag-over-top' : 'drag-over-bottom');
  }
  function onDrop(e) {
    e.preventDefault();
    const targetIndex = parseInt(e.currentTarget.dataset.index);
    if (draggingIndex === null || draggingIndex === targetIndex) return;

    const item = playlist.splice(draggingIndex, 1)[0];
    const insertAt = draggingIndex < targetIndex ? targetIndex : targetIndex;
    playlist.splice(insertAt, 0, item);

    // current index adjust
    if (currentTrackIndex === draggingIndex) currentTrackIndex = insertAt;
    else {
      if (draggingIndex < currentTrackIndex && insertAt >= currentTrackIndex) currentTrackIndex--;
      if (draggingIndex > currentTrackIndex && insertAt <= currentTrackIndex) currentTrackIndex++;
    }

    if (isShuffle) createShuffled();
    render();
    callbacks.onPlaylistChanged(playlist);
  }

  // touch long-press drag
  function onHandleTouchStart(e) {
    const li = e.currentTarget.closest('li.playlist-item');
    const idx = parseInt(li.dataset.index);

    touchHoldTimer = setTimeout(() => {
      touchDragging = true;
      draggingIndex = idx;
      li.classList.add('dragging');
    }, 250);
  }
  function onHandleTouchMove(e) {
    if (!touchDragging) return;
    e.preventDefault();

    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const li = el?.closest?.('li.playlist-item');
    if (!li) return;

    const rect = li.getBoundingClientRect();
    const before = (t.clientY - rect.top) < rect.height / 2;
    clearDragOver();
    li.classList.add(before ? 'drag-over-top' : 'drag-over-bottom');
  }
  function onHandleTouchEnd(e) {
    clearTimeout(touchHoldTimer);
    if (!touchDragging) return;

    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const li = el?.closest?.('li.playlist-item');
    const targetIndex = li ? parseInt(li.dataset.index) : draggingIndex;

    if (draggingIndex !== null && targetIndex !== draggingIndex) {
      const item = playlist.splice(draggingIndex, 1)[0];
      playlist.splice(targetIndex, 0, item);

      if (currentTrackIndex === draggingIndex) currentTrackIndex = targetIndex;
      else {
        if (draggingIndex < currentTrackIndex && targetIndex >= currentTrackIndex) currentTrackIndex--;
        if (draggingIndex > currentTrackIndex && targetIndex <= currentTrackIndex) currentTrackIndex++;
      }
    }

    touchDragging = false;
    draggingIndex = null;
    clearDragOver();
    render();
    callbacks.onPlaylistChanged(playlist);
  }

  function clearDragOver() {
    ul.querySelectorAll('.drag-over-top,.drag-over-bottom').forEach(x => {
      x.classList.remove('drag-over-top','drag-over-bottom');
    });
  }

  function highlight() {
    ul.querySelectorAll('li').forEach(li => li.classList.remove('active'));
    const curLi = ul.querySelector(`#track-${currentTrackIndex}`);
    if (curLi) curLi.classList.add('active');
  }

  // --- render ---
  function render() {
    ul.innerHTML = '';

    if (!playlist.length) {
      ul.innerHTML = '<li class="placeholder text-center pt-10">曲をドロップしてください</li>';
      callbacks.onEmpty();
      savePlaylistState(callbacks.getLastState());
      return;
    }

    playlist.forEach((track, index) => {
      const li = document.createElement('li');
      li.className = 'playlist-item flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition-colors relative group';
      li.dataset.index = index;
      li.id = `track-${index}`;
      li.draggable = true;

      li.addEventListener('dragstart', onDragStart);
      li.addEventListener('dragend', onDragEnd);
      li.addEventListener('dragover', onDragOver);
      li.addEventListener('drop', onDrop);

      // drag handle
      const handle = document.createElement('span');
      handle.className = 'drag-handle text-lg';
      handle.textContent = '≡';
      handle.addEventListener('touchstart', onHandleTouchStart, { passive: true });
      handle.addEventListener('touchmove', onHandleTouchMove, { passive: false });
      handle.addEventListener('touchend', onHandleTouchEnd);
      li.appendChild(handle);

      const img = document.createElement('img');
      img.src = track.artwork || 'https://placehold.co/50x50/312e81/ffffff?text=MP3';
      img.className = 'w-10 h-10 object-cover rounded-md';
      li.appendChild(img);

      const info = document.createElement('div');
      info.className = 'flex-grow min-w-0';

      if (track.artist === 'ロード中...') {
        info.innerHTML = `
          <p class="text-sm font-medium truncate">${track.title}</p>
          <p class="text-xs truncate w-24 h-4 rounded bg-gray-500/30 animate-pulse"></p>
        `;
      } else {
        info.innerHTML = `
          <p class="text-sm font-medium truncate">${track.title}</p>
          <p class="text-xs truncate" style="color: var(--text-secondary);">
            ${track.missing ? '※ファイル未ロード（再追加で復元）' : track.artist}
          </p>
        `;
      }
      li.appendChild(info);

      const dur = document.createElement('span');
      dur.className = 'text-xs font-mono px-2 playlist-duration';
      dur.textContent = formatTime(track.duration);
      if (track.duration === null) {
        dur.className += ' w-8 h-4 rounded bg-gray-500/30 animate-pulse';
      }
      li.appendChild(dur);

      const delBtn = document.createElement('button');
      delBtn.className = 'control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100';
      delBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      `;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTrack(index);
      });
      li.appendChild(delBtn);

      li.addEventListener('click', () => callbacks.onSelect(index));

      ul.appendChild(li);
    });

    highlight();
    savePlaylistState(callbacks.getLastState());
  }

  // search
  if (searchInput) {
    searchInput.addEventListener('input', (e) => filterList(e.target.value));
  }

  return {
    addFiles,
    removeTrack,
    clearAll,
    render,
    highlight,
    setCurrentIndex,
    setShuffle,
    get playlist() { return playlist; },
    get currentTrackIndex() { return currentTrackIndex; },
    getNextIndex,
    getPrevIndex,
    createShuffled,
    restoreFromStorage,
    savePlaylistState,
  };
}
