export function initPlaylistUI(els, core) {
  // コア側更新イベントに追従
  document.addEventListener("playlist:updated", renderPlaylist);
  document.addEventListener("playlist:highlight", highlightCurrentTrack);

  // v3.2.0: 並び替え用
  let dragFromIndex = null;

  function filterPlaylist(e) {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll("#playlist-ul li.playlist-item").forEach(li => {
      const index = parseInt(li.dataset.index);
      const track = core.getState().playlist[index];
      if (!track) return;

      const isMatch =
        track.title.toLowerCase().includes(query)
        || track.artist.toLowerCase().includes(query);

      li.classList.toggle("hidden", !isMatch);
    });
  }

  function renderPlaylist() {
    const { playlist } = core.getState();
    els.playlistUl.innerHTML = "";

    if (playlist.length === 0) {
      els.playlistUl.innerHTML = '<li class="placeholder text-center pt-10">曲をドロップしてください</li>';
      return;
    }

    playlist.forEach((track, index) => {
      const li = document.createElement("li");
      li.className = "playlist-item flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition-colors relative group";
      li.dataset.index = index;
      li.id = `track-${index}`;
      li.draggable = true; // drag enable

      // v3.2.0: drag handle
      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "≡";
      li.appendChild(handle);

      const img = document.createElement("img");
      img.src = track.artwork || "https://placehold.co/50x50/312e81/ffffff?text=MP3";
      img.className = "w-10 h-10 object-cover rounded-md";
      li.appendChild(img);

      const infoDiv = document.createElement("div");
      infoDiv.className = "flex-grow min-w-0";

      if (track.artist === "ロード中...") {
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

      const durationSpan = document.createElement("span");
      durationSpan.className = "text-xs font-mono px-2 playlist-duration";
      durationSpan.textContent = core.formatTime(track.duration);
      if (track.duration == null) {
        durationSpan.className += " w-8 h-4 rounded bg-gray-500/30 animate-pulse";
      }
      li.appendChild(durationSpan);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "control-btn p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100";
      deleteBtn.style.color = "var(--text-secondary)";
      deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      `;
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        core.removeTrack(index);
      });
      li.appendChild(deleteBtn);

      li.addEventListener("click", () => core.loadTrack(index));

      // --- drag events ---
      li.addEventListener("dragstart", (e) => {
        dragFromIndex = index;
        li.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      });
      li.addEventListener("dragend", () => {
        li.classList.remove("dragging");
        dragFromIndex = null;
      });
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = dragFromIndex ?? parseInt(e.dataTransfer.getData("text/plain"));
        const to = index;
        if (Number.isInteger(from) && Number.isInteger(to)) {
          core.reorderPlaylist(from, to);
        }
      });

      els.playlistUl.appendChild(li);
    });

    highlightCurrentTrack();
  }

  function highlightCurrentTrack() {
    const { currentTrackIndex } = core.getState();
    document.querySelectorAll("#playlist-ul li").forEach(li => li.classList.remove("active"));
    const currentLi = document.getElementById(`track-${currentTrackIndex}`);
    if (currentLi) currentLi.classList.add("active");
  }

  return { renderPlaylist, highlightCurrentTrack, filterPlaylist };
}
