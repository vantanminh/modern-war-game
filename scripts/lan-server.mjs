import http from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.LAN_PORT ?? 8787);

/** @typedef {{ socket: import('ws').WebSocket, playerId: string, roomId: string }} ClientSlot */
/** @typedef {{ id: string, teamCount: number, started: boolean, host: import('ws').WebSocket, clients: ClientSlot[] }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map();

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Modern War LAN relay is running.\n');
});

const wss = new WebSocketServer({ server });

function teamIdAt(index) {
  return `team${index + 1}`;
}

function sendJson(socket, payload) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function broadcastLobby(room) {
  const payload = {
    type: 'lobby',
    teamCount: room.teamCount,
    connected: room.clients.length,
    players: room.clients.map((client) => client.playerId),
  };

  room.clients.forEach((client) => {
    sendJson(client.socket, payload);
  });
}

function removeClient(socket) {
  rooms.forEach((room, roomId) => {
    const before = room.clients.length;
    room.clients = room.clients.filter((client) => client.socket !== socket);

    if (room.clients.length === 0) {
      rooms.delete(roomId);
      return;
    }

    if (before !== room.clients.length) {
      if (room.host === socket) {
        room.host = room.clients[0].socket;
      }
      broadcastLobby(room);
    }
  });
}

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return;
    }

    if (message.type === 'create-room') {
      const roomId = typeof message.roomId === 'string' && message.roomId.trim() ? message.roomId.trim() : 'lan-room';
      const teamCount = Math.max(2, Math.min(4, Number(message.teamCount) || 2));
      const room = {
        id: roomId,
        teamCount,
        started: false,
        host: socket,
        clients: [
          {
            socket,
            playerId: teamIdAt(0),
            roomId,
          },
        ],
      };
      rooms.set(roomId, room);
      sendJson(socket, { type: 'assigned', playerId: teamIdAt(0) });
      broadcastLobby(room);
      return;
    }

    if (message.type === 'join-room') {
      const roomId = typeof message.roomId === 'string' ? message.roomId.trim() : '';
      const room = rooms.get(roomId);
      if (!room || room.clients.length >= room.teamCount) {
        sendJson(socket, { type: 'error', reason: 'room-not-available' });
        return;
      }

      const playerId = teamIdAt(room.clients.length);
      room.clients.push({ socket, playerId, roomId });
      sendJson(socket, { type: 'assigned', playerId });
      broadcastLobby(room);
      return;
    }

    const room = [...rooms.values()].find((entry) =>
      entry.clients.some((client) => client.socket === socket),
    );

    if (!room) {
      return;
    }

    const slot = room.clients.find((client) => client.socket === socket);
    if (!slot) {
      return;
    }

    if (message.type === 'start-match' && room.host === socket) {
      room.started = true;
      room.clients.forEach((client) => {
        sendJson(client.socket, {
          type: 'start',
          teamCount: room.teamCount,
        });
      });
      return;
    }

    if (message.type === 'input' && room.host !== socket) {
      sendJson(room.host, {
        type: 'input',
        command: {
          ...message.command,
          playerId: slot.playerId,
        },
      });
      return;
    }

    if (message.type === 'snapshot' && room.host === socket) {
      room.clients.forEach((client) => {
        if (client.socket !== socket) {
          sendJson(client.socket, {
            type: 'snapshot',
            sim: message.sim,
          });
        }
      });
    }
  });

  socket.on('close', () => {
    removeClient(socket);
  });
});

server.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[lan-server] Listening on ws://0.0.0.0:${port}`);
});
