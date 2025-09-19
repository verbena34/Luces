// music.js - Music control module for LightShow
// Handles file uploads, track management, playback control, and beat synchronization

let currentTrack = null;
let trackList = [];
let audio = null;
let audioContext = null;
let gainNode = null;
let analyserNode = null;
let t0 = 0;
let bpm = 120;
let beatOffset = 0;
let subdivision = 1;
let lastBeatTime = 0;
let isAutoLights = false;
let latestServerTime = 0;
let clientTimeOffset = 0;
let socket = null;

// Tap tempo variables
const tapHistory = [];
const MAX_TAP_HISTORY = 8;
let lastTapTime = 0;

// Initialize audio objects
function initAudio() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";

    // If we have AudioContext, set up the audio graph
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaElementSource(audio);
      analyserNode = audioContext.createAnalyser();
      gainNode = audioContext.createGain();

      source.connect(analyserNode);
      analyserNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      console.log("Audio graph setup complete");
    } catch (e) {
      console.error("AudioContext setup error:", e);
    }
  }
}

// Format time in seconds to MM:SS
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

// Update UI components with current playback state
function updatePlaybackUI() {
  if (!audio) return;

  const currentTime = audio.currentTime || 0;
  const duration = audio.duration || 0;
  const progress = duration ? (currentTime / duration) * 100 : 0;

  // Update time display
  document.getElementById("current-time").textContent = formatTime(currentTime);
  document.getElementById("duration").textContent = formatTime(duration);

  // Update seek slider
  const seekSlider = document.getElementById("seek-slider");
  seekSlider.value = progress;
  seekSlider.disabled = !currentTrack;

  // Update play/pause/stop buttons
  document.getElementById("music-play-btn").disabled = !currentTrack;
  document.getElementById("music-pause-btn").disabled = !currentTrack || audio.paused;
  document.getElementById("music-stop-btn").disabled =
    !currentTrack || (audio.paused && audio.currentTime === 0);

  // Update track name
  const trackName = document.getElementById("track-name");
  if (currentTrack) {
    trackName.textContent = currentTrack.filename || currentTrack.trackId;
  } else {
    trackName.textContent = "No hay track seleccionado";
  }
}

// Update the track list UI
function updateTrackList() {
  const listElement = document.getElementById("track-list");

  if (!trackList.length) {
    listElement.innerHTML = '<p class="muted">No hay tracks subidos</p>';
    return;
  }

  listElement.innerHTML = "";
  trackList.forEach((track) => {
    const item = document.createElement("div");
    item.className = `track-item ${
      currentTrack && currentTrack.trackId === track.trackId ? "active" : ""
    }`;
    item.dataset.trackId = track.trackId;

    const name = document.createElement("span");
    name.textContent = track.filename || track.trackId;

    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Seleccionar";
    selectBtn.onclick = () => selectTrack(track);

    item.appendChild(name);
    item.appendChild(selectBtn);
    listElement.appendChild(item);
  });
}

// Select a track for playback
function selectTrack(track) {
  currentTrack = track;

  // Initialize audio elements if they don't exist
  initAudio();

  // Stop any current playback
  audio.pause();
  audio.currentTime = 0;

  // Set the source to the new track
  audio.src = track.url;
  audio.load();

  // Update track list to highlight current selection
  updateTrackList();

  // Enable playback controls
  updatePlaybackUI();

  console.log(`Selected track: ${track.filename || track.trackId}`);
}

// Handle file upload
async function uploadTrack(file) {
  if (!file) return null;

  const formData = new FormData();
  formData.append("file", file);

  const uploadStatus = document.getElementById("upload-status");
  uploadStatus.textContent = "Subiendo...";

  try {
    const eventId = window.__EVENT_ID__ || "";
    const response = await fetch(`/api/upload-track?e=${encodeURIComponent(eventId)}`, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.error || "Error desconocido");
    }

    uploadStatus.textContent = "Subida exitosa";

    // Add track to local list
    trackList.push(result.track);
    updateTrackList();

    return result.track;
  } catch (error) {
    console.error("Upload error:", error);
    uploadStatus.textContent = `Error: ${error.message}`;
    return null;
  }
}

// Start playback with synchronization
function playTrack() {
  if (!currentTrack || !audio) return;

  // Resume audioContext if it's suspended
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  // Apply current volume and loop settings
  const volumeControl = document.getElementById("volume-control");
  if (gainNode) {
    gainNode.gain.value = parseFloat(volumeControl.value);
  } else {
    audio.volume = parseFloat(volumeControl.value);
  }

  audio.loop = document.getElementById("loop-control").checked;

  // Calculate t0 with lead time
  const leadTime = 1200; // 1.2 seconds
  t0 = Date.now() + leadTime;

  // Send play command with synchronization params
  socket.emit("music:play", {
    trackId: currentTrack.trackId,
    url: currentTrack.url, // ← enviar url
    t0: t0,
    bpm: 120, // Valor por defecto ya que se eliminó el control
    beatOffset: 0, // Valor por defecto ya que se eliminó el control
    gain: parseFloat(volumeControl.value),
    loop: audio.loop,
    subdivision: 4, // Valor por defecto ya que se eliminó el control
  });

  // Play audio locally
  setTimeout(() => {
    audio.play();
  }, leadTime);
}

// Pause playback
function pauseTrack() {
  if (!audio) return;

  audio.pause();
  socket.emit("music:pause");
  updatePlaybackUI();
}

// Stop playback
function stopTrack() {
  if (!audio) return;

  audio.pause();
  audio.currentTime = 0;
  
  // Usar el nuevo sistema de paneles
  socket.emit("panel:musicStop");
  updatePlaybackUI();
}

// Seek to position
function seekTrack(position) {
  if (!audio || !currentTrack) return;

  // Calculate position in seconds
  const duration = audio.duration || 0;
  const positionSec = (position / 100) * duration;

  // Update local playback position
  audio.currentTime = positionSec;

  // Calculate t0 for synchronized playback
  const leadTime = 800; // 800ms
  t0 = Date.now() + leadTime;

  // Emit seek command
  socket.emit("music:seek", {
    trackId: currentTrack.trackId, // ← enviar trackId
    url: currentTrack.url, // ← enviar url
    positionSec,
    t0,
  });

  // If audio was playing, continue playing
  if (!audio.paused) {
    // Small timeout to account for network delay
    setTimeout(() => {
      audio.play();
    }, leadTime);
  }

  updatePlaybackUI();
}

// Update beat configuration - función deshabilitada porque se eliminaron los controles
// function updateBeatConfig() {
//   const newBpm = parseInt(document.getElementById("bpm-control").value, 10);
//   const newBeatOffset = parseFloat(document.getElementById("beat-offset-control").value);
//
//   bpm = newBpm;
//   beatOffset = newBeatOffset;
//
//   socket.emit("beat:config", {
//     bpm: bpm,
//     beatOffset: beatOffset,
//     subdivision: subdivision,
//   });
// }

// Process tap tempo - función deshabilitada porque se eliminaron los controles
// function tapTempo() {
//   const now = Date.now();
//
//   if (lastTapTime > 0) {
//     const interval = now - lastTapTime;
//
//     // Only consider taps between 250ms (240 BPM) and 1500ms (40 BPM)
//     if (interval >= 250 && interval <= 1500) {
//       tapHistory.push(interval);
//
//       // Keep only the last MAX_TAP_HISTORY entries
//       while (tapHistory.length > MAX_TAP_HISTORY) {
//         tapHistory.shift();
//       }
//
//       // Calculate average BPM from tap history
//       if (tapHistory.length >= 2) {
//         const averageInterval = tapHistory.reduce((sum, val) => sum + val, 0) / tapHistory.length;
//         const calculatedBpm = Math.round(60000 / averageInterval);
//
//         document.getElementById("bpm-control").value = calculatedBpm;
//         document.getElementById("tap-tempo-value").textContent = `${calculatedBpm} BPM`;
//       }
//     }
//   }
//
//   lastTapTime = now;
// }

// Handle beat clock
function startBeatClock() {
  if (!audio || !audio.duration) return;

  // Beat visualizer eliminado - comentado para evitar errores
  // const beatVisualizer = document.getElementById("beat-indicator");
  const beatPeriod = 60 / bpm; // seconds per beat

  function updateBeatVisualizer() {
    if (!audio || audio.paused) return;

    const currentTime = audio.currentTime;
    const musicalTime = currentTime - beatOffset;
    const beatPosition = musicalTime % beatPeriod;
    const progress = beatPosition / beatPeriod;

    // Update visualizer position - comentado porque se eliminó el visualizer
    // beatVisualizer.style.width = `${progress * 100}%`;

    // Check if we've crossed a beat threshold
    const beatIndex = Math.floor(musicalTime / beatPeriod);

    // If we have a new beat index
    if (beatIndex > lastBeatTime) {
      lastBeatTime = beatIndex;
      // beatVisualizer.classList.add("active");

      // Handle auto-lights feature
      if (isAutoLights) {
        triggerBeatLight(beatIndex);
      }

      setTimeout(() => {
        // beatVisualizer.classList.remove("active");
      }, 100);
    }

    requestAnimationFrame(updateBeatVisualizer);
  }

  updateBeatVisualizer();
}

// Trigger light effect on beat
function triggerBeatLight(beatIndex) {
  if (!isAutoLights) return;

  const flashDuration = 200; // ms
  const beatPhase = beatIndex % 4; // 4/4 time signature

  // Every beat gets a flash
  const flashColor = "#ffffff";

  // On beat 1, use pulse
  if (beatPhase === 0) {
    // Send scene command to socket - reset phase of wave or alternate between strobe/pulse
    const sceneName = beatIndex % 8 === 0 ? "pulse" : "strobe";
    const scenePayload = {
      name: sceneName,
      color: flashColor,
      speed: bpm / 120, // Normalize to base BPM of 120
      intensity: 1,
      t0: Date.now() + 100,
    };

    // Emit local scene play command
    const sceneEvent = new CustomEvent("localScenePlay", { detail: scenePayload });
    document.dispatchEvent(sceneEvent);
  } else {
    // On other beats, just do a quick flash
    const flashPayload = {
      name: "solid",
      color: flashColor,
      intensity: 0.8,
      t0: Date.now() + 100,
      duration: flashDuration,
    };

    // Emit local flash command
    const flashEvent = new CustomEvent("localFlash", { detail: flashPayload });
    document.dispatchEvent(flashEvent);
  }
}

// Time sync handler
function updateTimeSync(serverTime) {
  latestServerTime = serverTime;
  clientTimeOffset = serverTime - Date.now();
}

// Fetch track list from server
async function fetchTracks() {
  try {
    const eventId = window.__EVENT_ID__ || "";
    const response = await fetch(`/api/tracks?e=${encodeURIComponent(eventId)}`);
    const result = await response.json();

    if (result.ok && result.tracks) {
      trackList = result.tracks;
      updateTrackList();
    }
  } catch (error) {
    console.error("Error fetching tracks:", error);
  }
}

// Socket event handlers
function setupSocketListeners(socket) {
  // Request track list on connection
  socket.on("connect", () => {
    socket.emit("music:list");
  });

  // Handle track list
  socket.on("music:list", (data) => {
    if (data.tracks) {
      trackList = data.tracks;
      updateTrackList();
    }
  });

  // Handle new track uploaded
  socket.on("music:ready", (data) => {
    const track = trackList.find((t) => t.trackId === data.trackId);

    if (!track) {
      // Add new track to list if it's not there yet
      trackList.push(data);
      updateTrackList();
    }
  });

  // Time sync handler
  socket.on("time:pong", (data) => {
    updateTimeSync(data.serverTs);
  });
}

// Initialize module
function init(socketInstance) {
  socket = socketInstance;

  // Set up event listeners
  document.getElementById("upload-track-btn").addEventListener("click", () => {
    const fileInput = document.getElementById("track-upload");
    if (fileInput.files.length > 0) {
      uploadTrack(fileInput.files[0]);
    }
  });

  document.getElementById("music-play-btn").addEventListener("click", playTrack);
  document.getElementById("music-pause-btn").addEventListener("click", pauseTrack);
  document.getElementById("music-stop-btn").addEventListener("click", stopTrack);

  document.getElementById("seek-slider").addEventListener("input", (e) => {
    seekTrack(parseFloat(e.target.value));
  });

  document.getElementById("volume-control").addEventListener("input", (e) => {
    const volume = parseFloat(e.target.value);
    if (gainNode) {
      gainNode.gain.value = volume;
    } else if (audio) {
      audio.volume = volume;
    }
  });

  // Elementos de beat eliminados - comentados para evitar errores
  // document.getElementById("beat-offset-control").addEventListener("input", (e) => {
  //   const value = parseFloat(e.target.value);
  //   document.getElementById("beat-offset-value").textContent = value.toFixed(2);
  //   beatOffset = value;
  // });

  // document.getElementById("auto-lights").addEventListener("change", (e) => {
  //   isAutoLights = e.target.checked;
  // });

  // document.getElementById("tap-tempo-btn").addEventListener("click", tapTempo);
  // document.getElementById("beat-config-btn").addEventListener("click", updateBeatConfig);

  // Set up subdivision buttons - comentado porque se eliminaron
  // const subdivisionButtons = document.querySelectorAll(".subdivision-btn");
  // subdivisionButtons.forEach((btn) => {
  //   btn.addEventListener("click", () => {
  //     subdivisionButtons.forEach((b) => b.classList.remove("active"));
  //     btn.classList.add("active");
  //     subdivision = parseInt(btn.dataset.subdivision, 10);
  //   });
  // });

  // Start audio playback time update loop
  setInterval(updatePlaybackUI, 250);

  // Set up socket event listeners
  setupSocketListeners(socket);

  // Fetch initial track list
  fetchTracks();

  // Try to unlock audio context on first user interaction
  document.addEventListener(
    "click",
    () => {
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume();
      }
    },
    { once: true }
  );

  console.log("Music module initialized");
}

export default { init };
