import { useState } from 'react'
import Home from './components/Home'
import Room from './components/Room'

function App() {
    const [currentView, setCurrentView] = useState('home')
    const [roomCode, setRoomCode] = useState('')

    const handleCreateRoom = (code) => {
        setRoomCode(code)
        setCurrentView('room')
    }

    const handleJoinRoom = (code) => {
        setRoomCode(code)
        setCurrentView('room')
    }

    const handleLeaveRoom = () => {
        setRoomCode('')
        setCurrentView('home')
    }

    return (
        <>
            {currentView === 'home' && (
                <Home
                    onCreateRoom={handleCreateRoom}
                    onJoinRoom={handleJoinRoom}
                />
            )}
            {currentView === 'room' && (
                <Room
                    roomCode={roomCode}
                    onLeave={handleLeaveRoom}
                />
            )}
        </>
    )
}

export default App
