import { readID3, extractArtworkUrl, formatTime, getFileSignature, signatureToKey } from "./utils.js";
import { savePlaylist, loadPlaylist } from "./settings.js";

export function createPlaylistManager({
  playlistUl,
  searchInput,
  onSelectTrack,
  onPlaylistUpdated,
  showToast
}) {
  let playlist = [];
  let currentIndex = -1;

  // v3.5.0: sort / group
  let sortMode = "added";
  let groupByArtist = false;
  const collapsedGroups = new Set();

  // shuffle support
  let shuffled = [];

  function initFromStorage() {
    const stored = loadPlaylist();
    playlist = stored.map((t, i) => ({
      file: null,
      title: t.title || t.signature?.name || `Track ${i+1}`,
      artist: t.artist || "不明なアーティスト",
      artwork: t.artwork || null,
      duration: t.duration ?? null,
      signature: t.signature || null,
      key: t.signature ? signatureToKey(t.signature) : null,
      originalOrder: t.originalOrder ?? i
    }));
    render();
  }

  async function handleFiles(files) {
    const mp3s = Array.from(files).filter(f => f.type === "audio/mpeg" || f.name.toLowerCase().endsWith(".mp3"));
    if (!mp3s.length) {
      showToast("MP3ファイルのみ対応しています", true);
      return;
    }

    const wasEmpty = playlist.length === 0;

    for (const file of mp3s) {
      const sig = getFileSignature(file);
      const key = signatureToKey(sig);

      // 同じ署名の曲がすでにある場合は「再リンク復元」
      const existing = playlist.findIndex(t => t.key === key);
      if (existing !== -1) {
        playlist[existing].file = file;
        continue;
      }

      const track = {
        file,
        title: file.name,
        artist: "ロード中...",
        artwork: null,
        duration: null,
        signature: sig,
        key,
        originalOrder: playlist.length
      };
      playlist.push(track);
      const idx = playlist.length - 1;

      // メタデータ
      readMetadata(file, idx);
      // 長さ
      getDuration(file, idx);
    }

    applySort(sortMode, false);
    if (groupByArtist) render();
    showToast(`${mp3s.length} 曲が追加されました`);
    savePlaylist(playlist);

    if (wasEmpty && playlist.length > 0) {
      setCurrentIndex(0);
      onSelectTrack(0, false);
    }

    onPlaylistUpdated();
  }

  async function readMetadata(file, index) {
    const tags = await readID3(file);
    if (!playlist[index]) return;

    playlist[index].title = tags.title || file.name;
    playlist[index].artist = tags.artist || "不明なアーティスト";
    playlist[index].artwork = extractArtworkUrl(tags);

    savePlaylist(playlist);
    render();
  }

  function getDuration(file, index) {
    const temp = new Audio();
    const url = URL.createObjectURL(file);
    temp.src = url;

    temp.addEventListener("loadedmetadata", () => {
      if (playlist[index]) {
        playlist[index].duration = temp.duration;
        savePlaylist(playlist);
        render();
      }
      URL.revokeObjectURL(url);
    }, { once: true });

    temp.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
  }

  function removeTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    const wasPlaying = index === currentIndex;

    playlist.splice(index, 1);
    if (wasPlaying) currentIndex = Math.min(index, playlist.length - 1);

    savePlaylist(playlist);
    render();
    onPlaylistUpdated();

    if (wasPlaying && playlist.length > 0) onSelectTrack(currentIndex, true);
    if (playlist.length === 0) onSelectTrack(-1, false);
  }

  function clearAll() {
    playlist = [];
    currentIndex = -1;
    savePlaylist(playlist);
    render();
    onPlaylistUpdated();
    onSelectTrack(-1, false);
  }

  function setCurrentIndex(i) {
    currentIndex = i;
    highlight();
  }

  function getCurrentIndex() { return currentIndex; }
  function getPlaylist() { return playlist; }

  function createShuffled() {
    const cur = currentIndex !== -1 ? [currentIndex] : [];
    let rest = playlist.map((_, i) => i).filter(i => i !== currentIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    shuffled = [...cur, ...rest];
  }

  function getShuffled() { return shuffled; }

  // v3.5.0 sort
  function applySort(mode, save = true) {
    sortMode = mode;

    if (mode === "added") {
      playlist.sort((a,b) => (a.originalOrder ?? 0) - (b.originalOrder ?? 0));
    }
    if (mode === "title") {
      playlist.sort((a,b) => a.title.localeCompare(b.title, "ja"));
    }
    if (mode === "artist") {
      playlist.sort((a,b) => a.artist.localeCompare(b.artist, "ja"));
    }
    if (mode === "duration") {
      playlist.sort((a,b) => (a.duration ?? 0) - (b.duration ?? 0));
    }

    // 再生中 index の再追跡
    if (currentIndex !== -1) {
      const key = playlist[currentIndex]?.key;
      const newIdx = playlist.findIndex(t => t.key === key);
      currentIndex = newIdx;
    }

    if (save) savePlaylist(playlist);
    render();
  }

  function toggleGroupByArtist() {
    groupByArtist = !groupByArtist;
    render();
    onPlaylistUpdated();
    return groupByArtist;
  }

  function setGroupByArtist(v) {
    groupByArtist = !!v;
    render();
  }

  function isGroupByArtist() { return groupByArtist; }
  function getSortMode() { return sortMode; }

  function render() {
    playlistUl.innerHTML = "";

    if (playlist.length === 0) {
      playlistUl.innerHTML = `<li class="placeholder text-center pt-10">曲をドロップしてください</li>`;
      return;
    }

    if (groupByArtist) {
      renderGrouped();
    } else {
      renderFlat();
    }

    highlight();
    setupDnD();
  }

  function renderGrouped() {
    const groups = new Map();
    playlist.forEach((t, i) => {
      const a = t.artist || "不明なアーティスト";
      if (!groups.has(a)) groups.set(a, []);
      groups.get(a).push({ track: t, index: i });
    });

    for (const [artist, items] of groups.entries()) {
      const header = document.createElement("li");
      header.className = "group-header";
      header.innerHTML = `
        <span>${artist}</span>
        <span class="count">${items.length}曲</span>
      `;
      header.addEventListener("click", () => {
        if (collapsedGroups.has(artist)) collapsedGroups.delete(artist);
        else collapsedGroups.add(artist);
        render();
      });
      playlistUl.appendChild(header);

      if (collapsedGroups.has(artist)) continue;

      items.forEach(({ track, index }) => {
        playlistUl.appendChild(createTrackLI(track, index));
      });
    }
  }

  function renderFlat() {
    playlist.forEach((track, index) => {
      playlistUl.appendChild(createTrackLI(track, index));
    });
  }

  function createTrackLI(track, index) {
    const li = document.createElement("li");
    li.className = "playlist-item flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors relative group";
    li.dataset.index = index;
    li.id = `track-${index}`;
    li.draggable = true;

    const img = document.createElement("img");
    img.src = track.artwork || "https://placehold.co/50x50/312e81/ffffff?text=MP3";
    img.className = "w-10 h-10 object-cover rounded-md";
    li.appendChild(img);

    const info = document.createElement("div");
    info.className = "flex-grow min-w-0";

    if (track.artist === "ロード中...") {
      info.innerHTML = `
        <p class="text-sm font-medium truncate">${track.title}</p>
        <p class="text-xs truncate w-24 h-4 rounded bg-gray-500/30 animate-pulse"></p>`;
    } else {
      info.innerHTML = `
        <p class="text-sm font-medium truncate">${track.title}</p>
        <p class="text-xs truncate" style="color: var(--text-secondary);">${track.artist}</p>`;
    }
    li.appendChild(info);

    const dur = document.createElement("span");
    dur.className = "text-xs font-mono px-2 playlist-duration";
    dur.textContent = track.duration == null ? "…" : formatTime(track.duration);
    if (track.duration == null) dur.className += " w-8 h-4 rounded bg-gray-500/30 animate-pulse";
    li.appendChild(dur);

    const del = document.createElement("button");
    del.className = "control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100";
    del.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5"
        fill="none" viewBox="0 0 24 24"
        stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>`;
    del.addEventListener("click", e => {
      e.stopPropagation();
      removeTrack(index);
    });
    li.appendChild(del);

    li.addEventListener("click", () => onSelectTrack(index, true));
    return li;
  }

  function highlight() {
    playlistUl.querySelectorAll(".playlist-item").forEach(li => li.classList.remove("active"));
    const cur = playlistUl.querySelector(`#track-${currentIndex}`);
    if (cur) cur.classList.add("active");
  }

  // 検索
  function filter(q) {
    const query = q.toLowerCase();
    playlistUl.querySelectorAll(".playlist-item").forEach(li => {
      const i = Number(li.dataset.index);
      const t = playlist[i];
      if (!t) return;
      const ok = (t.title||"").toLowerCase().includes(query)
             || (t.artist||"").toLowerCase().includes(query);
      li.classList.toggle("hidden", !ok);
    });
  }

  // Drag & Drop 並び替え（desktop + mobile簡易対応）
  function setupDnD() {
    let dragIndex = null;

    playlistUl.querySelectorAll(".playlist-item").forEach(li => {
      li.addEventListener("dragstart", e => {
        dragIndex = Number(li.dataset.index);
        li.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
        dragIndex = null;
        savePlaylist(playlist);
      });

      li.addEventListener("dragover", e => e.preventDefault());
      li.addEventListener("drop", e => {
        e.preventDefault();
        const targetIndex = Number(li.dataset.index);
        if (dragIndex == null || dragIndex === targetIndex) return;

        const [moved] = playlist.splice(dragIndex, 1);
        playlist.splice(targetIndex, 0, moved);

        // originalOrderも更新（追加順維持したい場合は別）
        playlist.forEach((t, i) => t.originalOrder = i);

        if (currentIndex === dragIndex) currentIndex = targetIndex;
        else if (dragIndex < currentIndex && targetIndex >= currentIndex) currentIndex--;
        else if (dragIndex > currentIndex && targetIndex <= currentIndex) currentIndex++;

        render();
        onPlaylistUpdated();
      });

      // mobile long-press fallback（表示順のみ入れ替え）
      let pressTimer = null;
      li.addEventListener("touchstart", () => {
        pressTimer = setTimeout(() => {
          li.draggable = true;
        }, 250);
      }, { passive:true });
      li.addEventListener("touchend", () => clearTimeout(pressTimer));
    });
  }

  initFromStorage();

  return {
    handleFiles,
    render,
    filter,
    clearAll,
    removeTrack,
    setCurrentIndex,
    getCurrentIndex,
    getPlaylist,
    createShuffled,
    getShuffled,
    applySort,
    toggleGroupByArtist,
    setGroupByArtist,
    isGroupByArtist,
    getSortMode
  };
}
