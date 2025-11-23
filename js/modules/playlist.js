import { qsa, isMp3File, formatTime, showToast, buildFileSignature, downloadBlob } from "./utils.js";

export class Playlist {
  constructor(dom, settings) {
    this.dom = dom;
    this.settings = settings;

    this.tracks = [];
    this.currentIndex = -1;

    this.isSelectMode = false;
    this.selected = new Set();
    this.lastSelectedIndex = null;

    this.jsmediatags = window.jsmediatags;

    this.ghostMeta = null; // import/exportの幽霊
  }

  get currentTrack() {
    return this.tracks[this.currentIndex] || null;
  }

  handleFiles(fileList) {
    const files = Array.from(fileList);

    // ★スマホmp4バグ対策：
    // acceptは広げたのでここでmp3のみ通す
    const mp3Files = files.filter(isMp3File);
    if (!mp3Files.length) {
      showToast("MP3ファイルのみ対応しています", true);
      return;
    }

    const wasEmpty = this.tracks.length === 0;

    for (const file of mp3Files) {
      const sig = buildFileSignature(file);
      this.tracks.push({
        file,
        sig,
        title: file.name,
        artist: "ロード中...",
        artwork: null,
        duration: null,
        gain: 1,
        waveform: null,
      });
      const idx = this.tracks.length - 1;
      this.readMetadata(file, idx);
      this.readDuration(file, idx);
    }

    this.render();
    showToast(`${mp3Files.length}曲追加しました`);

    if (wasEmpty) {
      this.currentIndex = 0;
    }

    this.saveGhost();
    document.dispatchEvent(new CustomEvent("playlist:filesAdded"));
  }

  readMetadata(file, index) {
    this.jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags;
        let artworkUrl = null;

        if (tags.picture) {
          const { data, format } = tags.picture;
          let base64String = "";
          for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
          artworkUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }

        const t = this.tracks[index];
        if (!t) return;
        t.title = tags.title || file.name;
        t.artist = tags.artist || "不明なアーティスト";
        t.artwork = artworkUrl;

        this.render();
      },
      onError: () => {
        const t = this.tracks[index];
        if (!t) return;
        t.artist = "メタデータがありません";
        this.render();
      }
    });
  }

  readDuration(file, index) {
    const tempAudio = new Audio();
    const url = URL.createObjectURL(file);
    tempAudio.src = url;
    tempAudio.addEventListener("loadedmetadata", () => {
      const t = this.tracks[index];
      if (t) t.duration = tempAudio.duration;
      URL.revokeObjectURL(url);
      this.render();
    });
    tempAudio.addEventListener("error", () => URL.revokeObjectURL(url));
  }

  render() {
    const ul = this.dom.playlistUl;
    ul.innerHTML = "";

    if (this.tracks.length === 0) {
      ul.innerHTML = `<li class="placeholder text-center pt-10">曲をドロップしてください</li>`;
      this.selected.clear();
      return;
    }

    this.tracks.forEach((track, index) => {
      const li = document.createElement("li");
      li.className = "playlist-item flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors relative group";
      li.dataset.index = index;
      li.id = `track-${index}`;

      if (index === this.currentIndex) li.classList.add("active");

      if (this.selected.has(index)) li.classList.add("selected");

      const img = document.createElement("img");
      img.src = track.artwork || "https://placehold.co/50x50/312e81/ffffff?text=MP3";
      img.className = "w-10 h-10 object-cover rounded-md";
      li.appendChild(img);

      const infoDiv = document.createElement("div");
      infoDiv.className = "flex-grow min-w-0";
      if (track.artist === "ロード中...") {
        infoDiv.innerHTML = `
          <p class="text-sm font-medium truncate">${track.title}</p>
          <p class="text-xs truncate w-24 h-4 rounded bg-gray-500/30 animate-pulse"></p>
        `;
      } else {
        infoDiv.innerHTML = `
          <p class="text-sm font-medium truncate">${track.title}</p>
          <p class="text-xs truncate" style="color: var(--text-secondary);">${track.artist}</p>
        `;
      }
      li.appendChild(infoDiv);

      const dur = document.createElement("span");
      dur.className = "text-xs font-mono px-2 playlist-duration";
      dur.textContent = formatTime(track.duration);
      if (track.duration === null) dur.className += " w-8 h-4 rounded bg-gray-500/30 animate-pulse";
      li.appendChild(dur);

      const del = document.createElement("button");
      del.className = "control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100";
      del.style.color = "var(--text-secondary)";
      del.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none"
          viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>`;
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.remove(index);
      });
      li.appendChild(del);

      li.addEventListener("click", (e) => {
        if (this.isSelectMode) {
          this.toggleSelection(index, e.shiftKey);
          return;
        }
        document.dispatchEvent(new CustomEvent("playlist:playIndex", { detail: index }));
      });

      ul.appendChild(li);
    });

    this.applyFilterText(this.dom.playlistSearch.value || "");
  }

  remove(index) {
    if (index < 0 || index >= this.tracks.length) return;

    const wasPlaying = index === this.currentIndex;

    // ObjectURL cleanup
    const t = this.tracks[index];
    if (t?.fileUrl) URL.revokeObjectURL(t.fileUrl);

    this.tracks.splice(index, 1);

    if (wasPlaying) {
      this.currentIndex = Math.min(index, this.tracks.length - 1);
      document.dispatchEvent(new CustomEvent("playlist:currentRemoved"));
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    }

    // selection adjust
    this.selected = new Set([...this.selected].filter(i => i !== index).map(i => (i > index ? i - 1 : i)));

    if (this.tracks.length === 0) {
      this.currentIndex = -1;
    }

    this.render();
    this.saveGhost();
  }

  clearAll() {
    // ObjectURL cleanup
    for (const t of this.tracks) {
      if (t?.fileUrl) URL.revokeObjectURL(t.fileUrl);
    }
    this.tracks = [];
    this.currentIndex = -1;
    this.selected.clear();
    this.render();
    this.saveGhost();
    showToast("プレイリストをクリアしました");
    document.dispatchEvent(new CustomEvent("playlist:cleared"));
  }

  filter(text) {
    this.applyFilterText(text);
  }

  applyFilterText(text) {
    const q = (text || "").toLowerCase();
    qsa("#playlist-ul li.playlist-item").forEach(li => {
      const idx = parseInt(li.dataset.index);
      const t = this.tracks[idx];
      if (!t) return;
      const match =
        (t.title || "").toLowerCase().includes(q) ||
        (t.artist || "").toLowerCase().includes(q);
      li.classList.toggle("hidden", !match);
    });
  }

  sortBy(mode) {
    if (mode === "added") {
      this.tracks.sort((a, b) => a._addedIndex - b._addedIndex);
    } else if (mode === "title") {
      this.tracks.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (mode === "artist") {
      this.tracks.sort((a, b) => (a.artist || "").localeCompare(b.artist || ""));
    }
    // currentIndex preserve by sig
    const curSig = this.currentTrack?.sig;
    this.currentIndex = curSig ? this.tracks.findIndex(t => t.sig === curSig) : this.currentIndex;
    this.render();
    this.saveGhost();
  }

  toggleSelectMode() {
    this.isSelectMode = !this.isSelectMode;
    this.dom.selectModeBtn.classList.toggle("btn-active", this.isSelectMode);
    this.dom.deleteSelectedBtn.classList.toggle("hidden", !this.isSelectMode);
    if (!this.isSelectMode) {
      this.selected.clear();
      this.lastSelectedIndex = null;
      this.render();
    }
    showToast(this.isSelectMode ? "選択モードON" : "選択モードOFF");
  }

  toggleSelection(index, shiftKey) {
    if (shiftKey && this.lastSelectedIndex !== null) {
      const [a, b] = [this.lastSelectedIndex, index].sort((x, y) => x - y);
      for (let i = a; i <= b; i++) this.selected.add(i);
    } else {
      if (this.selected.has(index)) this.selected.delete(index);
      else this.selected.add(index);
      this.lastSelectedIndex = index;
    }
    this.render();
  }

  deleteSelected() {
    const arr = [...this.selected].sort((a, b) => b - a);
    if (!arr.length) return;

    for (const i of arr) this.remove(i);
    this.selected.clear();
    this.render();
    showToast("選択した曲を削除しました");
  }

  exportJSON() {
    const list = this.tracks.map(t => ({
      sig: t.sig,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      name: t.file?.name,
      size: t.file?.size,
      lastModified: t.file?.lastModified,
    }));
    const blob = new Blob([JSON.stringify({ version: "3.9.0", list }, null, 2)], { type: "application/json" });
    downloadBlob("playlist.json", blob);
    showToast("プレイリストを書き出しました");
  }

  async importJSON(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data?.list?.length) throw new Error();
      this.ghostMeta = data.list;
      this.saveGhost();
      showToast("プレイリストを読み込みました（曲を再追加すると一致します）");
      this.renderGhostList();
    } catch {
      showToast("プレイリスト読み込み失敗", true);
    }
  }

  renderGhostList() {
    if (!this.ghostMeta) return;
    if (this.tracks.length) return; // 実playlist優先
    this.dom.playlistUl.innerHTML = "";
    this.ghostMeta.forEach((m, i) => {
      const li = document.createElement("li");
      li.className = "playlist-item flex items-center space-x-3 p-2 rounded-lg opacity-70";
      li.innerHTML = `
        <div class="w-10 h-10 rounded-md bg-black/20"></div>
        <div class="flex-grow min-w-0">
          <p class="text-sm font-medium truncate">${m.title || m.name}</p>
          <p class="text-xs truncate" style="color: var(--text-secondary);">${m.artist || ""}</p>
        </div>
        <span class="text-xs font-mono px-2 playlist-duration">${formatTime(m.duration)}</span>
      `;
      this.dom.playlistUl.appendChild(li);
    });
  }

  saveGhost() {
    const ghost = this.ghostMeta || (this.tracks.length
      ? this.tracks.map(t => ({
        sig: t.sig,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        name: t.file?.name,
        size: t.file?.size,
        lastModified: t.file?.lastModified,
      }))
      : null);

    localStorage.setItem("playlistGhost_v39", JSON.stringify(ghost));
  }

  loadGhostIfAny() {
    const raw = localStorage.getItem("playlistGhost_v39");
    if (!raw) return;
    try {
      this.ghostMeta = JSON.parse(raw);
      if (this.ghostMeta?.length && !this.tracks.length) this.renderGhostList();
    } catch {}
  }
}
