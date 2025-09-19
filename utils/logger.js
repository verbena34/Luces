// Función de utilidad para loggear información importante durante desarrollo
function logInfo(type, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

// Función de utilidad para registrar errores
function logError(type, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] [${type}] ${error}`);
}

// Esta función se puede usar para loguear cuando alguien entra a una sala
function logRoomJoin(socketId, role, eventId) {
  logInfo("JOIN", `Socket ${socketId} joined room ${eventId} as ${role}`);
}

// Esta función se puede usar para loguear cuando alguien sale de una sala
function logRoomLeave(socketId, role, eventId) {
  logInfo("LEAVE", `Socket ${socketId} left room ${eventId} as ${role}`);
}

// Exportar las funciones
module.exports = {
  logInfo,
  logError,
  logRoomJoin,
  logRoomLeave,
};
