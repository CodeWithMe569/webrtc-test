import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

// Configure CORS for both Express and Socket.IO
app.use(cors());

const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins in development
        methods: ["GET", "POST"]
    }
});

// Store room information
const rooms = new Map();

// Generate unique room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create a new room
    socket.on('create-room', () => {
        const roomCode = generateRoomCode();
        rooms.set(roomCode, {
            host: socket.id,
            participants: [socket.id],
            createdAt: Date.now()
        });

        socket.join(roomCode);
        socket.emit('room-created', { roomCode });
        console.log(`Room created: ${roomCode} by ${socket.id}`);
    });

    // Join an existing room
    socket.on('join-room', ({ roomCode }) => {
        const room = rooms.get(roomCode);

        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        // Check if room already has 2 participants (1-1 call limit)
        if (room.participants.length >= 2) {
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        room.participants.push(socket.id);
        socket.join(roomCode);

        // Notify the user who joined
        socket.emit('room-joined', { roomCode });

        // Notify other participant that someone joined
        socket.to(roomCode).emit('user-joined', { userId: socket.id });

        console.log(`User ${socket.id} joined room: ${roomCode}`);
    });

    // WebRTC Signaling: Forward offer
    socket.on('offer', ({ offer, roomCode }) => {
        console.log(`Offer received from ${socket.id} in room ${roomCode}`);
        socket.to(roomCode).emit('offer', { offer, userId: socket.id });
    });

    // WebRTC Signaling: Forward answer
    socket.on('answer', ({ answer, roomCode }) => {
        console.log(`Answer received from ${socket.id} in room ${roomCode}`);
        socket.to(roomCode).emit('answer', { answer, userId: socket.id });
    });

    // WebRTC Signaling: Forward ICE candidates
    socket.on('ice-candidate', ({ candidate, roomCode }) => {
        console.log(`ICE candidate received from ${socket.id} in room ${roomCode}`);
        socket.to(roomCode).emit('ice-candidate', { candidate, userId: socket.id });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        // Clean up rooms
        rooms.forEach((room, roomCode) => {
            const index = room.participants.indexOf(socket.id);
            if (index !== -1) {
                room.participants.splice(index, 1);

                // Notify other participants
                socket.to(roomCode).emit('user-left', { userId: socket.id });

                // Delete room if empty
                if (room.participants.length === 0) {
                    rooms.delete(roomCode);
                    console.log(`Room ${roomCode} deleted (empty)`);
                }
            }
        });
    });

    // Explicit leave room
    socket.on('leave-room', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (room) {
            const index = room.participants.indexOf(socket.id);
            if (index !== -1) {
                room.participants.splice(index, 1);
                socket.leave(roomCode);
                socket.to(roomCode).emit('user-left', { userId: socket.id });

                if (room.participants.length === 0) {
                    rooms.delete(roomCode);
                    console.log(`Room ${roomCode} deleted (empty)`);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`🚀 WebRTC Signaling Server running on port ${PORT}`);
});
