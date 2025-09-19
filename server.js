// server.js (ESM)
import express from "express";
import fs from "fs";
import { createServer } from "http";
import multer from "multer";
import { nanoid } from "nanoid";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Admin key for authentication
const ADMIN_KEY = process.env.ADMIN_KEY || "lightshow2025"; // Default key - change in production!

// Utility function to sanitize and slugify event IDs
function slugifyId(raw) {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '') || 'default';
}

// Track catalog - in-memory storage by eventId
const trackCatalog = new Map(); // Map<eventId, Array<{trackId, url, filename, size, uploadedAt}>>

// ======== SISTEMA DE HEARTBEAT PARA SINCRONIZACIÓN ========

// Función para enviar updates periódicos de posición cuando está reproduciendo
function startMusicHeartbeat() {
  setInterval(() => {
    for (const [eventId, state] of currentPlayback.entries()) {
      if (state.isPlaying && state.url && state.startTime) {
        const currentPos = getCurrentPosition(eventId);
        
        // Solo enviar si hay sockets conectados en la sala
        const socketsInRoom = io.sockets.adapter.rooms.get(`room:${eventId}`);
        if (socketsInRoom && socketsInRoom.size > 0) {
          // Enviar update de posición a todos en la sala
          io.to(`room:${eventId}`).emit("music:positionUpdate", {
            position: currentPos,
            serverTime: Date.now(),
            // Agregar información adicional para mejor sincronización
            startTime: state.startTime,
            initialPosition: state.position
          });
          
          console.log(`[MUSIC HEARTBEAT] room:${eventId} pos=${currentPos.toFixed(2)}s (${socketsInRoom.size} clients)`);
        }
      }
    }
  }, 1000); // Cada 1 segundo (reducido de 2)
}

// Iniciar el heartbeat
startMusicHeartbeat();
const currentPlayback = new Map(); // Map<eventId, { url, isPlaying, position, volume, trackId, updatedAt, startTime }>

function getPlayback(eventId) {
  if (!currentPlayback.has(eventId)) {
    currentPlayback.set(eventId, {
      url: null,
      isPlaying: false,
      position: 0,
      volume: 1,
      trackId: null,
      updatedAt: Date.now(),
      startTime: null, // Timestamp cuando empezó la reproducción
    });
  }
  return currentPlayback.get(eventId);
}

// Nueva función para calcular la posición actual en tiempo real
function getCurrentPosition(eventId) {
  const state = getPlayback(eventId);
  if (!state.isPlaying || !state.startTime) {
    return state.position;
  }
  
  // Calcular cuánto tiempo ha pasado desde que empezó
  const elapsedMs = Date.now() - state.startTime;
  const elapsedSec = elapsedMs / 1000;
  
  // Posición actual = posición inicial + tiempo transcurrido
  return state.position + elapsedSec;
}

function setPlayback(eventId, patch) {
  const s = getPlayback(eventId);
  const next = { ...s, ...patch, updatedAt: Date.now() };
  
  // Si está empezando a reproducir, marcar el tiempo de inicio
  if (patch.isPlaying === true && !s.isPlaying) {
    next.startTime = Date.now();
  }
  
  // Si está pausando, actualizar la posición actual
  if (patch.isPlaying === false && s.isPlaying) {
    next.position = getCurrentPosition(eventId);
    next.startTime = null;
  }
  
  // Si se hace seek, resetear tiempo de inicio
  if (typeof patch.position === 'number') {
    next.startTime = next.isPlaying ? Date.now() : null;
  }
  
  currentPlayback.set(eventId, next);
  return next;
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage for audio files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const eventId = req.query.e || "default";
    const eventDir = path.join(uploadsDir, eventId);

    if (!fs.existsSync(eventDir)) {
      fs.mkdirSync(eventDir, { recursive: true });
    }

    cb(null, eventDir);
  },
  filename: (req, file, cb) => {
    const trackId = nanoid(10);
    const fileExt = path.extname(file.originalname);
    cb(null, `${trackId}${fileExt}`);
  },
});

// File filter for multer to only accept audio files
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4", "audio/x-m4a"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Tipo de archivo no soportado. Solo se permiten archivos de audio (mp3, ogg, wav, m4a)."
      ),
      false
    );
  }
};

// Configure multer upload
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB limit
});

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Flexible routes for join page - serve join.html for various URL patterns
app.get(['/join', '/join.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get(['/join/:eventId', '/party/:eventId'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// Optional root short URLs - only if not a file-like request
app.get('/:eventId', (req, res, next) => {
  const eventId = req.params.eventId;
  // Skip if looks like a file (has extension) or favicon
  if (eventId.includes('.') || eventId === 'favicon.ico' || eventId === 'robots.txt') {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// API endpoint for uploading tracks
app.post("/api/upload-track", (req, res) => {
  const eventId = req.query.e;
  if (!eventId) {
    return res.status(400).json({ ok: false, error: "Missing eventId" });
  }

  // Use a single file upload with the 'file' field
  const uploadSingle = upload.single("file");

  uploadSingle(req, res, (err) => {
    if (err) {
      console.error("[UPLOAD ERROR]", err);
      return res.status(400).json({
        ok: false,
        error: err.message || "Error al subir archivo",
      });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No se encontró archivo" });
    }

    // Extract track ID from filename
    const trackId = path.basename(req.file.filename, path.extname(req.file.filename));

    // Create URL for the file (relative to public folder)
    const url = `/uploads/${eventId}/${req.file.filename}`;

    // Add track to catalog
    if (!trackCatalog.has(eventId)) {
      trackCatalog.set(eventId, []);
    }

    const trackInfo = {
      trackId,
      url,
      filename: req.file.originalname,
      size: req.file.size,
      uploadedAt: Date.now(),
      mimetype: req.file.mimetype,
    };

    trackCatalog.get(eventId).push(trackInfo);

    // Notify all clients in the room about the new track
    const room = `room:${eventId}`;
    // (opcional) mantener catálogo y avisar que hay una nueva pista disponible
    io.to(room).emit("music:ready", { trackId, url });

    // (recomendado) dejar lista la pista para los Join:
    setPlayback(eventId, { url, trackId, isPlaying: false, position: 0 });
    io.to(room).emit("music:load", { url, autoplay: false, position: 0 });

    // Return success response
    res.json({ ok: true, trackId, url, track: trackInfo });
  });
});

// API endpoint for listing tracks
app.get("/api/tracks", (req, res) => {
  const eventId = req.query.e;

  if (!eventId) {
    return res.status(400).json({ ok: false, error: "Missing eventId" });
  }

  // Return tracks for the event or empty array if none exist
  const tracks = trackCatalog.get(eventId) || [];
  res.json({ ok: true, tracks });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// ------------------- Socket.IO -------------------
io.on("connection", (socket) => {
  // ---- util: contar gente por sala (evento) ----
  async function emitRoomStats(room) {
    if (!room) return;
    const sockets = await io.in(room).fetchSockets();
    let viewers = 0,
      admins = 0;

    // Contar viewers y admins correctamente
    const socketDetails = [];
    for (const s of sockets) {
      if (s.data?.role === "viewer") viewers++;
      else if (s.data?.role === "admin") admins++;

      socketDetails.push({
        id: s.id,
        role: s.data?.role || "unknown",
        eventId: s.data?.eventId || "none",
      });
    }

    console.log(`[STATS] Room ${room}: ${viewers} viewers, ${admins} admins`);
    console.log(`[STATS] Socket details:`, JSON.stringify(socketDetails));
    io.to(room).emit("room:stats", { room, viewers, admins });
  }
  // ---- Validate admin key ----
  function validateAdminKey(key) {
    return key === ADMIN_KEY;
  }

  // ---- Helper functions for validation ----
  function isValidHex(color) {
    return typeof color === "string" && /^#?[0-9A-Fa-f]{6}$/.test(color);
  }

  function normalizeHex(color) {
    if (!color) return "#000000";
    if (color.startsWith("#")) return color;
    return `#${color}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ---- Sanitize scene payload ----
  function sanitizePayload(payload) {
    if (!payload) return null;

    const sanitized = {};

    // Validate name (must be a valid string)
    if (typeof payload.name === "string" && payload.name.trim() !== "") {
      sanitized.name = payload.name.trim();
    }

    // Special validation for 'text' scene type
    if (sanitized.name === "text") {
      // Validate text (string, max 120 chars, allow emoji)
      if (typeof payload.text === "string") {
        sanitized.text = payload.text.slice(0, 120).trim();
      } else {
        sanitized.text = "";
      }

      // Validate foreground color (hex with 6 digits)
      if (isValidHex(payload.fg)) {
        sanitized.fg = normalizeHex(payload.fg);
      } else {
        sanitized.fg = "#ffffff"; // Default white
      }

      // Validate background color (hex with 6 digits)
      if (isValidHex(payload.bg)) {
        sanitized.bg = normalizeHex(payload.bg);
      } else {
        sanitized.bg = "#000000"; // Default black
      }

      // Validate background alpha (0-1)
      if (typeof payload.bgAlpha === "number" && !isNaN(payload.bgAlpha)) {
        sanitized.bgAlpha = clamp(payload.bgAlpha, 0, 1);
      } else {
        sanitized.bgAlpha = 0.8; // Default
      }

      // Validate alignment (whitelist)
      const validAlignments = ["left", "center", "right"];
      if (typeof payload.align === "string" && validAlignments.includes(payload.align)) {
        sanitized.align = payload.align;
      } else {
        sanitized.align = "center"; // Default
      }

      // Validate animation type (whitelist)
      const validAnimations = ["none", "fade", "slide", "zoom", "type", "ticker"];
      if (typeof payload.anim === "string" && validAnimations.includes(payload.anim)) {
        sanitized.anim = payload.anim;
      } else {
        sanitized.anim = "none"; // Default
      }
    } else {
      // For non-text scenes, validate standard color
      if (typeof payload.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(payload.color)) {
        sanitized.color = payload.color;
      }
    }

    // Validate speed (must be between 0.2 and 3)
    if (typeof payload.speed === "number" && !isNaN(payload.speed)) {
      sanitized.speed = clamp(payload.speed, 0.2, 3);
    }

    // Validate intensity (must be between 0 and 1)
    if (typeof payload.intensity === "number" && !isNaN(payload.intensity)) {
      sanitized.intensity = clamp(payload.intensity, 0, 1);
    }

    // Validate t0 (must be a number)
    if (typeof payload.t0 === "number" && !isNaN(payload.t0)) {
      sanitized.t0 = payload.t0;
    }

    return sanitized;
  }

  // ---- rol + unión a sala ----
  socket.on("role", ({ role, eventId }) => {
    // Sanitize eventId on the server side for extra safety
    eventId = slugifyId(eventId);
    
    console.log(`[JOIN] ${socket.id} joining as ${role} to event: ${eventId}`);
    
    // Get admin key from query params
    const adminKey =
      socket.handshake.query.k ||
      new URL(socket.handshake.headers.referer || "").searchParams.get("k");

    // Si ya pertenecía a una sala, actualizamos las estadísticas de esa sala
    const oldEventId = socket.data?.eventId;
    if (oldEventId && oldEventId !== eventId) {
      const oldRoom = `room:${oldEventId}`;
      socket.leave(oldRoom);
      console.log(`[LEAVE] ${socket.id} left room: ${oldRoom}`);
      emitRoomStats(oldRoom);
    }

    // If claims to be admin but key doesn't match, downgrade to viewer
    if (role === "admin" && !validateAdminKey(adminKey)) {
      role = "viewer";
      console.log(`[AUTH] Failed admin auth attempt for ${socket.id}`);
    }

    // Establecer rol y eventId
    socket.data.role = role;
    socket.data.eventId = eventId;

    // Unirse a la nueva sala si existe un eventId
    if (eventId) {
      const room = `room:${eventId}`;
      socket.join(room);
      console.log(`[JOIN] ${socket.id} → ${role} @ ${eventId}`);
      emitRoomStats(room);
    }
  });

  // ---- escenas: solo a la sala del admin y solo si es admin ----
  socket.on("scene:play", (payload) => {
    // Only admins can send scene commands
    if (socket.data?.role !== "admin") {
      console.log(
        `[SCENE] Rejected scene:play from non-admin socket ${socket.id}, role: ${socket.data?.role}`
      );
      return;
    }

    const eventId = socket.data?.eventId;
    if (!eventId) {
      console.log(`[SCENE] Rejected scene:play from socket ${socket.id}, no eventId`);
      return;
    }

    // Sanitize payload to prevent malicious inputs
    const sanitizedPayload = sanitizePayload(payload);
    if (!sanitizedPayload) {
      console.log(`[SCENE] Rejected invalid scene payload from socket ${socket.id}`);
      return;
    }

    console.log(`[SCENE] Broadcasting scene:play to room:${eventId}:`, sanitizedPayload);

    // Broadcast to the room (usando io.to en lugar de socket.to para incluir a todos)
    io.to(`room:${eventId}`).emit("scene:play", sanitizedPayload);

    // Verificar cuántos sockets hay en la sala para asegurarnos de que el mensaje llega a alguien
    io.in(`room:${eventId}`)
      .fetchSockets()
      .then((sockets) => {
        console.log(`[SCENE] Sockets en sala room:${eventId}: ${sockets.length}`);
      });
  });

  socket.on("scene:stop", () => {
    // Only admins can send scene commands
    if (socket.data?.role !== "admin") return;

    const eventId = socket.data?.eventId;
    if (!eventId) return;

    console.log(`[SCENE] Broadcasting scene:stop to room:${eventId}`);

    // Broadcast to the room (usando io.to para incluir a todos los clientes, incluido el emisor)
    io.to(`room:${eventId}`).emit("scene:stop");
  });

  // ---- stats on-demand ----
  socket.on("room:who", () => emitRoomStats(`room:${socket.data?.eventId}`));

  // ---- verificar pertenencia a sala ----
  socket.on("verify:room", async () => {
    const eventId = socket.data?.eventId;
    if (!eventId) {
      socket.emit("verify:room", { status: "error", message: "No estás en ninguna sala" });
      return;
    }

    const room = `room:${eventId}`;
    const rooms = Array.from(socket.rooms);
    const inRoom = rooms.includes(room);

    console.log(`[VERIFY] Socket ${socket.id} en sala ${room}: ${inRoom ? "SÍ" : "NO"}`);
    console.log(`[VERIFY] Salas del socket ${socket.id}: ${rooms.join(", ")}`);

    socket.emit("verify:room", {
      status: inRoom ? "ok" : "error",
      inRoom,
      room,
      allRooms: rooms,
      role: socket.data?.role || "unknown",
    });

    // Si no está en la sala, intentar unirlo
    if (!inRoom) {
      console.log(`[VERIFY] Intentando unir el socket ${socket.id} a la sala ${room}`);
      socket.join(room);
      emitRoomStats(room);
    }
  });

  // ---- ping de tiempo (si lo usas para sync) ----
  socket.on("time:ping", (_clientTs) => {
    socket.emit("time:pong", { serverTs: Date.now() });
  });

  // ---- music track list ----
  socket.on("music:list", () => {
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    const tracks = trackCatalog.get(eventId) || [];
    socket.emit("music:list", { tracks });
  });

  // ========= NUEVO: JOIN PIDE ESTADO DE MÚSICA =========
  socket.on("music:requestState", () => {
    const eventId = socket.data?.eventId;
    if (!eventId) return;
    
    const state = getPlayback(eventId);
    
    // Calcular la posición actual en tiempo real
    const currentPosition = getCurrentPosition(eventId);
    
    // Enviar estado con posición sincronizada
    const syncedState = {
      ...state,
      position: currentPosition,
      // Añadir timestamp del servidor para sincronización adicional
      serverTime: Date.now(),
      // Información extra para sincronización precisa
      startTime: state.startTime,
      initialPosition: state.isPlaying ? state.position : currentPosition
    };
    
    console.log(`[MUSIC] Sending synced state to ${socket.id}: pos=${currentPosition.toFixed(2)}s, playing=${state.isPlaying}, startTime=${state.startTime}`);
    
    socket.emit("music:state", syncedState);
  });

  // ========= NUEVO: HANDLERS DEL PANEL (ADMIN) =========
  socket.on("panel:musicLoad", ({ url, trackId = null, autoplay = false, position = 0 }) => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    if (typeof url !== "string" || !url.trim()) {
      socket.emit("error", { message: "panel:musicLoad requiere una URL válida" });
      return;
    }

    const state = setPlayback(eventId, {
      url: url.trim(),
      trackId: trackId || null,
      isPlaying: !!autoplay,
      position: Number(position) || 0,
    });

    io.to(`room:${eventId}`).emit("music:load", {
      url: state.url,
      autoplay: !!autoplay,
      position: state.position || 0,
    });
    console.log(`[MUSIC] load -> room:${eventId}`, state.url);
  });

  socket.on("panel:musicPlay", () => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    const state = setPlayback(eventId, { isPlaying: true });
    
    // Enviar comando con timestamp para sincronización
    io.to(`room:${eventId}`).emit("music:play", {
      serverTime: Date.now(),
      position: state.position
    });
    
    console.log(`[MUSIC] play -> room:${eventId} from position ${state.position.toFixed(2)}s`);
  });

  socket.on("panel:musicPause", () => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    // Actualizar posición antes de pausar
    const currentPos = getCurrentPosition(eventId);
    const state = setPlayback(eventId, { isPlaying: false, position: currentPos });
    
    io.to(`room:${eventId}`).emit("music:pause", {
      position: state.position,
      serverTime: Date.now()
    });
    
    console.log(`[MUSIC] pause -> room:${eventId} at position ${state.position.toFixed(2)}s`);
  });

  socket.on("panel:musicSeek", ({ time }) => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    const pos = Number(time) || 0;
    const state = setPlayback(eventId, { position: pos });
    
    io.to(`room:${eventId}`).emit("music:seek", { 
      time: pos,
      serverTime: Date.now() 
    });
    
    console.log(`[MUSIC] seek -> room:${eventId} pos=${pos}s`);
  });

  socket.on("panel:musicStop", () => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    // Detener y reiniciar a posición 0
    const state = setPlayback(eventId, { 
      isPlaying: false, 
      position: 0,
      startTime: null 
    });
    
    io.to(`room:${eventId}`).emit("music:stop", {
      serverTime: Date.now()
    });
    
    console.log(`[MUSIC] stop -> room:${eventId}`);
  });

  socket.on("panel:musicVolume", ({ volume }) => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    const vol = Math.max(0, Math.min(1, Number(volume) || 0));
    setPlayback(eventId, { volume: vol });
    io.to(`room:${eventId}`).emit("music:volume", { volume: vol });
    console.log(`[MUSIC] volume -> room:${eventId} vol=${vol}`);
  });

  // ---- music playback control - only admins can send these commands ----
  // (Tus handlers existentes de música avanzada — se mantienen)
  function sanitizeMusicPayload(payload) {
    if (!payload) return null;

    const sanitized = {};

    if (typeof payload.trackId === "string" && payload.trackId.trim()) {
      sanitized.trackId = payload.trackId.trim();
    }

    if (typeof payload.t0 === "number" && !isNaN(payload.t0)) {
      sanitized.t0 = payload.t0;
    }

    if (typeof payload.bpm === "number" && !isNaN(payload.bpm)) {
      sanitized.bpm = Math.max(60, Math.min(200, payload.bpm));
    } else {
      sanitized.bpm = 120;
    }

    if (typeof payload.beatOffset === "number" && !isNaN(payload.beatOffset)) {
      sanitized.beatOffset = Math.max(-2, Math.min(2, payload.beatOffset));
    } else {
      sanitized.beatOffset = 0;
    }

    if (typeof payload.gain === "number" && !isNaN(payload.gain)) {
      sanitized.gain = Math.max(0, Math.min(1, payload.gain));
    } else {
      sanitized.gain = 1;
    }

    sanitized.loop = !!payload.loop;

    if ([1, 2, 4].includes(payload.subdivision)) {
      sanitized.subdivision = payload.subdivision;
    } else {
      sanitized.subdivision = 1;
    }

    if (
      typeof payload.positionSec === "number" &&
      !isNaN(payload.positionSec) &&
      payload.positionSec >= 0
    ) {
      sanitized.positionSec = payload.positionSec;
    }

    return sanitized;
  }

  socket.on("music:play", (payload) => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    const sanitizedPayload = sanitizeMusicPayload(payload);
    if (!sanitizedPayload || !sanitizedPayload.trackId) return;

    const tracks = trackCatalog.get(eventId) || [];
    const track = tracks.find((t) => t.trackId === sanitizedPayload.trackId);

    const candidateUrl =
      typeof payload?.url === "string" && payload.url.trim()
        ? payload.url.trim()
        : track?.url || "";

    if (!candidateUrl) {
      socket.emit("error", { message: `URL not found for track ${sanitizedPayload.trackId}` });
      return;
    }

    const out = { ...sanitizedPayload, url: candidateUrl };
    // Actualiza estado también
    setPlayback(eventId, {
      url: out.url,
      trackId: out.trackId,
      isPlaying: true,
      position: out.positionSec ?? 0,
    });

    console.log("[music:play]", {
      room: `room:${eventId}`,
      trackId: out.trackId,
      url: out.url,
      t0: out.t0,
      bpm: out.bpm,
    });

    io.to(`room:${eventId}`).emit("music:play", out);
  });

  socket.on("music:pause", () => {
    if (socket.data?.role !== "admin") return;

    const eventId = socket.data?.eventId;
    if (!eventId) return;

    setPlayback(eventId, { isPlaying: false });
    io.to(`room:${eventId}`).emit("music:pause");
  });

  socket.on("music:seek", (payload) => {
    if (socket.data?.role !== "admin") return;
    const eventId = socket.data?.eventId;
    if (!eventId) return;

    const sanitizedPayload = sanitizeMusicPayload(payload);
    if (!sanitizedPayload || typeof sanitizedPayload.positionSec !== "number") return;

    const tracks = trackCatalog.get(eventId) || [];
    const track = tracks.find((t) => t.trackId === sanitizedPayload.trackId);

    const candidateUrl =
      typeof payload?.url === "string" && payload.url.trim()
        ? payload.url.trim()
        : track?.url || "";

    const out = candidateUrl ? { ...sanitizedPayload, url: candidateUrl } : sanitizedPayload;

    setPlayback(eventId, { position: out.positionSec || 0 });

    console.log("[music:seek]", {
      room: `room:${eventId}`,
      trackId: out.trackId,
      url: out.url,
      pos: out.positionSec,
      t0: out.t0,
    });

    io.to(`room:${eventId}`).emit("music:seek", out);
  });

  socket.on("music:stop", () => {
    if (socket.data?.role !== "admin") return;

    const eventId = socket.data?.eventId;
    if (!eventId) return;

    setPlayback(eventId, { isPlaying: false, position: 0 });
    io.to(`room:${eventId}`).emit("music:stop");
  });

  socket.on("beat:config", (payload) => {
    if (socket.data?.role !== "admin") return;

    const eventId = socket.data?.eventId;
    if (!eventId) return;

    const sanitizedPayload = sanitizeMusicPayload(payload);
    if (!sanitizedPayload) return;

    const beatConfig = {
      bpm: sanitizedPayload.bpm,
      beatOffset: sanitizedPayload.beatOffset,
      subdivision: sanitizedPayload.subdivision,
    };

    io.to(`room:${eventId}`).emit("beat:config", beatConfig);
  });

  socket.on("disconnect", () => {
    const eventId = socket.data?.eventId;
    if (eventId) {
      const room = `room:${eventId}`;
      console.log(`[DISCONNECT] ${socket.id} (${socket.data?.role}) left room: ${room}`);
      emitRoomStats(room);
    } else {
      console.log(`[DISCONNECT] ${socket.id} (${socket.data?.role}) - no room`);
    }
  });
});

// ------------------- HTTP -------------------
const PORT = process.env.PORT || 3000;
const MAX_PORT_ATTEMPTS = 10; // Intentar hasta 10 puertos diferentes

// Función para intentar iniciar el servidor en diferentes puertos
function startServer(port, attempt = 0) {
  httpServer
    .listen(port)
    .on("listening", () => {
      console.log(`LightShow listo: http://localhost:${port}`);
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
        console.warn(`Puerto ${port} en uso, intentando con ${port + 1}...`);
        // Cerrar el servidor e intentar con otro puerto
        httpServer.close();
        startServer(port + 1, attempt + 1);
      } else {
        console.error("Error al iniciar el servidor:", err);
        process.exit(1);
      }
    });
}

// Iniciar el servidor con el primer puerto
startServer(PORT);
