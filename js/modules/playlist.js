import { formatTime, debounce } from "./utils.js";

export function createPlaylistManager({
  playlistUl,
  playlistSearch,
  onSelectTrack,
  onRemoveTrack,
  onReorder,
}) {
  let playlist = [];
  let currentIndex = -1;
  let dragSrcIndex = null;

  function setPlaylist(list) {
    playlist = list;
  }

  function setCurrentIndex(i) {
    currentIndex = i;
  }

  function highlight() {
    playlistUl.querySelectorAll("li.playlist-item").forEach(li => li.classList.remove("active"));
    const cur = playlistUl.querySelector(`#track-${currentIndex}`);
    if (cur) cur.classList.add("active");
  }

  function buildItem(track, index) {
    const li = document.createElement("li");
    li.className = "playlist-item flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors relative group";
    li.dataset.index = index;
    li.id = `track-${index}`;
    li.draggable = true;

    li.addEventListener("click", () => onSelectTrack(index));

    li.addEventListener("dragstart", (e) => {
      dragSrcIndex = index;
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
    });

    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = dragSrcIndex;
      const to = index;
      if (from === null || from === to) return;
      onReorder(from, to);
      dragSrcIndex = null;
    });

    const img = document.createElement("img");
    img.src = track.artwork || "https://placehold.co/50x50/312e81/ffffff?text=MP3";
    img.className = "w-10 h-10 object-cover rounded-md";
    li.appendChild(img);

    const infoDiv = document.createElement("div");
    infoDiv.className = "flex-grow min-w-0";
    if (track.artist === "ロード中...") {
      infoDiv.innerHTML = `
        <p class="text-sm font-medium truncate">${track.title}</p>
        <p class="text-xs truncate w-24 h-4 rounded bg-gray-500/30 animate-pulse" style="color: var(--text-secondary);"></p>`;
    } else {
      infoDiv.innerHTML = `
        <p class="text-sm font-medium truncate">${track.title}</p>
        <p class="text-xs truncate" style="color: var(--text-secondary);">${track.artist}</p>`;
    }
    li.appendChild(infoDiv);

    const dur = document.createElement("span");
    dur.className = "text-xs font-mono px-2 playlist-duration";
    dur.textContent = track.duration == null ? "..." : formatTime(track.duration);
    if (track.duration == null) dur.className += " w-8 h-4 rounded bg-gray-500/30 animate-pulse";
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
      onRemoveTrack(index);
    });
    li.appendChild(del);

    return li;
  }

  function render() {
    playlistUl.innerHTML = "";

    if (playlist.length === 0) {
      playlistUl.innerHTML = `<li class="placeholder text-center pt-10">曲をドロップしてください</li>`;
      return;
    }

    playlist.forEach((t, i) => {
      playlistUl.appendChild(buildItem(t, i));
    });

    highlight();
    filter(playlistSearch?.value || "");
  }

  function filter(query) {
    const q = query.toLowerCase();
    playlistUl.querySelectorAll("li.playlist-item").forEach(li => {
      const idx = parseInt(li.dataset.index, 10);
      const tr = playlist[idx];
      if (!tr) return;
      const ok = tr.title.toLowerCase().includes(q) || tr.artist.toLowerCase().includes(q);
      li.classList.toggle("hidden", !ok);
    });
  }

  if (playlistSearch) {
    playlistSearch.addEventListener("input", debounce((e) => filter(e.target.value), 60));
  }

  return {
    setPlaylist,
    setCurrentIndex,
    render,
    highlight,
  };
}
