import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import './Home.css'

// Get server URL from environment or use current hostname
const getSocketServerURL = () => {
    // In development, use the current hostname instead of localhost
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3000`;
};
const SOCKET_SERVER = getSocketServerURL()

function Home({ onCreateRoom, onJoinRoom }) {
    const [joinCode, setJoinCode] = useState('')
    const [error, setError] = useState('')
    const [socket, setSocket] = useState(null)

    useEffect(() => {
        // Initialize socket connection
        const newSocket = io(SOCKET_SERVER)
        setSocket(newSocket)

        // Listen for room creation
        newSocket.on('room-created', ({ roomCode }) => {
            onCreateRoom(roomCode)
        })

        return () => {
            newSocket.disconnect()
        }
    }, [onCreateRoom])

    const handleCreateRoom = () => {
        if (socket) {
            socket.emit('create-room')
        }
    }

    const handleJoinRoom = () => {
        if (!joinCode.trim()) {
            setError('Please enter a room code')
            return
        }
        setError('')
        onJoinRoom(joinCode.toUpperCase())
    }

    const handleInputChange = (e) => {
        setJoinCode(e.target.value.toUpperCase())
        setError('')
    }

    return (
        <div className="home">
            <div className="home-background">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
                <div className="gradient-orb orb-3"></div>
            </div>

            <div className="home-content">
                <div className="hero animate-fade-in">
                    <h1 className="hero-title">
                        Connect Face to Face
                    </h1>
                    <p className="hero-subtitle">
                        High-quality video calls with crystal clear audio.
                        <br />
                        Simple, secure, and instant.
                    </p>
                </div>

                <div className="actions-container animate-fade-in">
                    <div className="action-card glass">
                        <div className="action-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3 className="action-title">Start New Call</h3>
                        <p className="action-description">
                            Create a new room and invite others with a unique code
                        </p>
                        <button className="btn btn-primary" onClick={handleCreateRoom}>
                            Create Room
                        </button>
                    </div>

                    <div className="divider">
                        <span>OR</span>
                    </div>

                    <div className="action-card glass">
                        <div className="action-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3 className="action-title">Join Existing Call</h3>
                        <p className="action-description">
                            Enter a room code to join an ongoing conversation
                        </p>
                        <div className="join-form">
                            <input
                                type="text"
                                className="input-code"
                                placeholder="Enter room code"
                                value={joinCode}
                                onChange={handleInputChange}
                                maxLength={6}
                                onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
                            />
                            {error && <p className="error-message">{error}</p>}
                            <button className="btn btn-secondary" onClick={handleJoinRoom}>
                                Join Room
                            </button>
                        </div>
                    </div>
                </div>

                <div className="features animate-fade-in">
                    <div className="feature">
                        <div className="feature-icon">🔒</div>
                        <span>End-to-End Encrypted</span>
                    </div>
                    <div className="feature">
                        <div className="feature-icon">⚡</div>
                        <span>Instant Connection</span>
                    </div>
                    <div className="feature">
                        <div className="feature-icon">🎥</div>
                        <span>HD Video Quality</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Home
