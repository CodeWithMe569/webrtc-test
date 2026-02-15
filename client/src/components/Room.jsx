import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import './Room.css'

// Get server URL from environment or use current hostname
const getSocketServerURL = () => {
    // In production, use environment variable; in development, use current hostname
    if (import.meta.env.VITE_SOCKET_SERVER) {
        return import.meta.env.VITE_SOCKET_SERVER;
    }
    // Fallback for development
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3000`;
};
const SOCKET_SERVER = getSocketServerURL()

// ICE servers for WebRTC (using free STUN servers)
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
}

function Room({ roomCode, onLeave }) {
    const [socket, setSocket] = useState(null)
    const [isConnected, setIsConnected] = useState(false)
    const [isVideoEnabled, setIsVideoEnabled] = useState(true)
    const [isAudioEnabled, setIsAudioEnabled] = useState(true)
    const [connectionStatus, setConnectionStatus] = useState('Connecting...')
    const [copied, setCopied] = useState(false)

    const localVideoRef = useRef(null)
    const remoteVideoRef = useRef(null)
    const peerConnectionRef = useRef(null)
    const localStreamRef = useRef(null)

    useEffect(() => {
        initializeCall()

        return () => {
            cleanup()
        }
    }, [])

    const initializeCall = async () => {
        try {
            // Get local media stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true
            })

            localStreamRef.current = stream
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream
            }

            // Initialize socket connection
            const newSocket = io(SOCKET_SERVER)
            setSocket(newSocket)

            // Socket event handlers
            newSocket.on('connect', () => {
                console.log('Socket connected')
                setConnectionStatus('Joining room...')

                // Join or create room based on whether we have a roomCode
                if (roomCode) {
                    newSocket.emit('join-room', { roomCode })
                } else {
                    newSocket.emit('create-room')
                }
            })

            newSocket.on('room-created', ({ roomCode: newRoomCode }) => {
                console.log('Room created:', newRoomCode)
                setConnectionStatus('Waiting for participant...')
            })

            newSocket.on('room-joined', () => {
                console.log('Joined room successfully')
                setConnectionStatus('Connected')
            })

            newSocket.on('user-joined', async ({ userId }) => {
                console.log('User joined:', userId)
                setConnectionStatus('Connecting to peer...')
                await createOffer(newSocket, stream)
            })

            newSocket.on('offer', async ({ offer, userId }) => {
                console.log('Received offer from:', userId)
                await handleOffer(offer, newSocket, stream)
            })

            newSocket.on('answer', async ({ answer }) => {
                console.log('Received answer')
                await handleAnswer(answer)
            })

            newSocket.on('ice-candidate', async ({ candidate }) => {
                console.log('Received ICE candidate')
                await handleIceCandidate(candidate)
            })

            newSocket.on('user-left', () => {
                console.log('User left')
                setIsConnected(false)
                setConnectionStatus('Participant left')
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = null
                }
            })

            newSocket.on('error', ({ message }) => {
                console.error('Socket error:', message)
                setConnectionStatus(`Error: ${message}`)
            })

        } catch (error) {
            console.error('Error initializing call:', error)
            setConnectionStatus('Failed to access camera/microphone')
        }
    }

    const createPeerConnection = (socket, stream) => {
        const peerConnection = new RTCPeerConnection(ICE_SERVERS)
        peerConnectionRef.current = peerConnection

        // Add local stream tracks to peer connection
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream)
        })

        // Handle incoming remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote track')
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0]
                setIsConnected(true)
                setConnectionStatus('Connected')
            }
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('Sending ICE candidate')
                socket.emit('ice-candidate', {
                    candidate: event.candidate,
                    roomCode
                })
            }
        }

        // Connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState)
            if (peerConnection.connectionState === 'connected') {
                setConnectionStatus('Connected')
            } else if (peerConnection.connectionState === 'disconnected') {
                setConnectionStatus('Disconnected')
                setIsConnected(false)
            } else if (peerConnection.connectionState === 'failed') {
                setConnectionStatus('Connection failed')
                setIsConnected(false)
            }
        }

        return peerConnection
    }

    const createOffer = async (socket, stream) => {
        try {
            const peerConnection = createPeerConnection(socket, stream)
            const offer = await peerConnection.createOffer()
            await peerConnection.setLocalDescription(offer)

            console.log('Sending offer')
            socket.emit('offer', { offer, roomCode })
        } catch (error) {
            console.error('Error creating offer:', error)
        }
    }

    const handleOffer = async (offer, socket, stream) => {
        try {
            const peerConnection = createPeerConnection(socket, stream)
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

            const answer = await peerConnection.createAnswer()
            await peerConnection.setLocalDescription(answer)

            console.log('Sending answer')
            socket.emit('answer', { answer, roomCode })
        } catch (error) {
            console.error('Error handling offer:', error)
        }
    }

    const handleAnswer = async (answer) => {
        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer))
        } catch (error) {
            console.error('Error handling answer:', error)
        }
    }

    const handleIceCandidate = async (candidate) => {
        try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (error) {
            console.error('Error handling ICE candidate:', error)
        }
    }

    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0]
            videoTrack.enabled = !videoTrack.enabled
            setIsVideoEnabled(videoTrack.enabled)
        }
    }

    const toggleAudio = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0]
            audioTrack.enabled = !audioTrack.enabled
            setIsAudioEnabled(audioTrack.enabled)
        }
    }

    const handleHangUp = () => {
        cleanup()
        onLeave()
    }

    const cleanup = () => {
        // Stop all tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop())
        }

        // Close peer connection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close()
        }

        // Disconnect socket
        if (socket) {
            socket.emit('leave-room', { roomCode })
            socket.disconnect()
        }
    }

    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomCode)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="room">
            <div className="room-header">
                <div className="room-info">
                    <div className="room-code-container">
                        <span className="room-label">Room Code:</span>
                        <code className="room-code">{roomCode}</code>
                        <button className="copy-btn" onClick={copyRoomCode} title="Copy room code">
                            {copied ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </button>
                    </div>
                    <div className={`status-indicator ${isConnected ? 'connected' : 'connecting'}`}>
                        <span className="status-dot"></span>
                        <span className="status-text">{connectionStatus}</span>
                    </div>
                </div>
            </div>

            <div className="video-container">
                <div className="video-wrapper remote-video">
                    <video ref={remoteVideoRef} autoPlay playsInline />
                    {!isConnected && (
                        <div className="video-placeholder">
                            <div className="placeholder-icon animate-pulse">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <p>Waiting for participant...</p>
                        </div>
                    )}
                </div>

                <div className="video-wrapper local-video">
                    <video ref={localVideoRef} autoPlay playsInline muted />
                    {!isVideoEnabled && (
                        <div className="video-off-overlay">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 1l22 22M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    )}
                    <div className="local-label">You</div>
                </div>
            </div>

            <div className="controls">
                <button
                    className={`control-btn ${!isAudioEnabled ? 'disabled' : ''}`}
                    onClick={toggleAudio}
                    title={isAudioEnabled ? 'Mute' : 'Unmute'}
                >
                    {isAudioEnabled ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </button>

                <button
                    className="control-btn hang-up"
                    onClick={handleHangUp}
                    title="Hang up"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="23" y1="1" x2="1" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>

                <button
                    className={`control-btn ${!isVideoEnabled ? 'disabled' : ''}`}
                    onClick={toggleVideo}
                    title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                    {isVideoEnabled ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 7l-7 5 7 5V7zM16 5H3a2 2 0 00-2 2v10a2 2 0 002 2h13a2 2 0 002-2V7a2 2 0 00-2-2z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" strokeLinecap="round" strokeLinejoin="round" />
                            <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    )
}

export default Room
