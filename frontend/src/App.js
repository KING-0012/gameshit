import React, { useState, useEffect } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const GamePhase = {
  CHARACTER_CREATION: 'character_creation',
  MAIN_GAME: 'main_game',
  EVENT: 'event',
  PROCESSING: 'processing'
};

const App = () => {
  const [gamePhase, setGamePhase] = useState(GamePhase.CHARACTER_CREATION);
  const [sessionId] = useState(`session_${Date.now()}`);
  const [loading, setLoading] = useState(false);
  
  // Character Creation State
  const [characterAnswers, setCharacterAnswers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  
  // Game State
  const [gameState, setGameState] = useState({
    ruler_name: '',
    resources: {
      gold: 1000,
      army: 500,
      influence: 50,
      territory: 1
    },
    relationships: {
      nobles: 0,
      peasants: 0,
      military: 0,
      church: 0,
      merchants: 0
    },
    current_location: 'Your Capitol',
    events_completed: 0,
    character_traits: []
  });
  
  // Event State
  const [currentEvent, setCurrentEvent] = useState('');
  const [eventChoices, setEventChoices] = useState([]);
  const [consequences, setConsequences] = useState('');

  // Initialize first character creation question
  useEffect(() => {
    if (gamePhase === GamePhase.CHARACTER_CREATION && !currentQuestion) {
      generateCharacterQuestion();
    }
  }, [gamePhase, currentQuestion]);

  const generateCharacterQuestion = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/game/create-character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          answers: characterAnswers
        })
      });
      
      const data = await response.json();
      if (data.error) {
        console.error('Error:', data.error);
        setCurrentQuestion('Error generating question. Please try again.');
      } else {
        setCurrentQuestion(data.question);
      }
    } catch (error) {
      console.error('Network error:', error);
      setCurrentQuestion('Network error. Please check your connection.');
    }
    setLoading(false);
  };

  const submitCharacterAnswer = async () => {
    if (!answerInput.trim()) return;
    
    const newAnswer = {
      question: currentQuestion,
      answer: answerInput.trim()
    };
    
    const updatedAnswers = [...characterAnswers, newAnswer];
    setCharacterAnswers(updatedAnswers);
    setAnswerInput('');
    
    // After 5 questions, move to main game
    if (updatedAnswers.length >= 5) {
      finalizeCharacter(updatedAnswers);
    } else {
      setCurrentQuestion('');
      generateCharacterQuestion();
    }
  };

  const finalizeCharacter = async (answers) => {
    setLoading(true);
    
    // Extract ruler name from first answer or ask for it
    const rulerName = answers[0]?.answer || 'Unknown Ruler';
    
    // Update game state with character creation results
    const updatedGameState = {
      ...gameState,
      ruler_name: rulerName,
      character_traits: answers
    };
    
    setGameState(updatedGameState);
    
    // Save initial game state
    await fetch(`${BACKEND_URL}/api/game/save-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        game_state: updatedGameState
      })
    });
    
    setGamePhase(GamePhase.MAIN_GAME);
    setLoading(false);
  };

  const generateEvent = async () => {
    setGamePhase(GamePhase.PROCESSING);
    setLoading(true);
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/game/generate-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          game_state: gameState
        })
      });
      
      const data = await response.json();
      if (data.error) {
        console.error('Error:', data.error);
        setCurrentEvent('Error generating event. Please try again.');
        setGamePhase(GamePhase.MAIN_GAME);
      } else {
        parseEventResponse(data.event);
        setGamePhase(GamePhase.EVENT);
      }
    } catch (error) {
      console.error('Network error:', error);
      setCurrentEvent('Network error. Please check your connection.');
      setGamePhase(GamePhase.MAIN_GAME);
    }
    setLoading(false);
  };

  const parseEventResponse = (eventText) => {
    const lines = eventText.split('\n');
    let event = '';
    let choices = [];
    let currentSection = '';
    
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('EVENT:')) {
        currentSection = 'event';
        event += line.replace('EVENT:', '').trim() + ' ';
      } else if (line.startsWith('CHOICES:')) {
        currentSection = 'choices';
      } else if (/^\d+\./.test(line)) {
        choices.push(line);
      } else if (currentSection === 'event' && line) {
        event += line + ' ';
      }
    }
    
    setCurrentEvent(event.trim());
    setEventChoices(choices);
  };

  const makeChoice = async (choice) => {
    setGamePhase(GamePhase.PROCESSING);
    setLoading(true);
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/game/process-choice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          event: currentEvent,
          choice: choice,
          game_state: gameState
        })
      });
      
      const data = await response.json();
      if (data.error) {
        console.error('Error:', data.error);
        setConsequences('Error processing choice. Please try again.');
      } else {
        setConsequences(data.consequences);
        processConsequences(data.consequences);
      }
    } catch (error) {
      console.error('Network error:', error);
      setConsequences('Network error. Please check your connection.');
    }
    setLoading(false);
  };

  const processConsequences = (consequenceText) => {
    // Parse consequences and update game state
    const lines = consequenceText.split('\n');
    let resourceChanges = {};
    let relationshipChanges = {};
    
    for (let line of lines) {
      if (line.includes('RESOURCE_CHANGES:')) {
        try {
          const jsonMatch = line.match(/\{.*\}/);
          if (jsonMatch) {
            resourceChanges = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.log('Could not parse resource changes');
        }
      }
      if (line.includes('RELATIONSHIP_CHANGES:')) {
        try {
          const jsonMatch = line.match(/\{.*\}/);
          if (jsonMatch) {
            relationshipChanges = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.log('Could not parse relationship changes');
        }
      }
    }
    
    // Apply changes to game state
    const newGameState = { ...gameState };
    
    // Update resources
    Object.keys(resourceChanges).forEach(key => {
      if (newGameState.resources[key] !== undefined) {
        newGameState.resources[key] += resourceChanges[key];
      }
    });
    
    // Update relationships
    Object.keys(relationshipChanges).forEach(key => {
      if (newGameState.relationships[key] !== undefined) {
        newGameState.relationships[key] += relationshipChanges[key];
      }
    });
    
    newGameState.events_completed += 1;
    setGameState(newGameState);
  };

  const continueGame = () => {
    setGamePhase(GamePhase.MAIN_GAME);
    setCurrentEvent('');
    setEventChoices([]);
    setConsequences('');
  };

  const renderCharacterCreation = () => (
    <div className="character-creation">
      <h1 className="text-4xl font-bold mb-8 text-center text-purple-800">
        🏰 Create Your Ruler 👑
      </h1>
      
      <div className="progress-bar mb-6">
        <div className="bg-gray-200 rounded-full h-2">
          <div 
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(characterAnswers.length / 5) * 100}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Question {characterAnswers.length + 1} of 5
        </p>
      </div>

      <div className="question-container">
        <div className="question-box">
          <h3 className="text-xl font-semibold mb-4">Character Creation</h3>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Generating question...</p>
            </div>
          ) : (
            <>
              <p className="question-text">{currentQuestion}</p>
              <div className="mt-6">
                <textarea
                  value={answerInput}
                  onChange={(e) => setAnswerInput(e.target.value)}
                  placeholder="Your answer..."
                  className="w-full p-4 border rounded-lg resize-none"
                  rows="3"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitCharacterAnswer();
                    }
                  }}
                />
                <button
                  onClick={submitCharacterAnswer}
                  disabled={!answerInput.trim() || loading}
                  className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {characterAnswers.length > 0 && (
        <div className="answers-summary mt-8">
          <h4 className="text-lg font-semibold mb-4">Your Story So Far:</h4>
          <div className="space-y-2">
            {characterAnswers.map((qa, index) => (
              <div key={index} className="bg-gray-50 p-3 rounded">
                <p className="text-sm text-gray-600">Q{index + 1}: {qa.question}</p>
                <p className="font-medium">A: {qa.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderMainGame = () => (
    <div className="main-game">
      <div className="game-header">
        <h1 className="text-3xl font-bold text-center mb-2">
          👑 Ruler: {gameState.ruler_name}
        </h1>
        <p className="text-center text-gray-600 mb-6">
          📍 {gameState.current_location} | Events Completed: {gameState.events_completed}
        </p>
      </div>

      <div className="game-dashboard">
        <div className="resources-panel">
          <h3 className="text-xl font-semibold mb-4">💰 Resources</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="stat-box">
              <span className="stat-label">Gold:</span>
              <span className="stat-value">{gameState.resources.gold}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Army:</span>
              <span className="stat-value">{gameState.resources.army}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Influence:</span>
              <span className="stat-value">{gameState.resources.influence}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Territory:</span>
              <span className="stat-value">{gameState.resources.territory}</span>
            </div>
          </div>
        </div>

        <div className="relationships-panel">
          <h3 className="text-xl font-semibold mb-4">🤝 Relationships</h3>
          <div className="space-y-2">
            {Object.entries(gameState.relationships).map(([faction, value]) => (
              <div key={faction} className="relationship-item">
                <span className="capitalize">{faction}:</span>
                <div className="relationship-bar">
                  <div 
                    className={`relationship-fill ${value >= 0 ? 'positive' : 'negative'}`}
                    style={{ width: `${Math.abs(value)}%` }}
                  ></div>
                </div>
                <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {value > 0 ? '+' : ''}{value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="actions-panel">
        <h3 className="text-xl font-semibold mb-4">⚡ Actions</h3>
        <div className="action-buttons">
          <button 
            onClick={generateEvent}
            disabled={loading}
            className="action-btn primary"
          >
            🎭 New Event
          </button>
          <button className="action-btn secondary">
            🗺️ Explore
          </button>
          <button className="action-btn secondary">
            ⚔️ Military
          </button>
          <button className="action-btn secondary">
            🏛️ Diplomacy
          </button>
        </div>
      </div>
    </div>
  );

  const renderEvent = () => (
    <div className="event-phase">
      <h2 className="text-2xl font-bold mb-6 text-center">🎭 Current Event</h2>
      
      <div className="event-container">
        <div className="event-description">
          <p className="text-lg leading-relaxed">{currentEvent}</p>
        </div>
        
        <div className="choices-container">
          <h3 className="text-xl font-semibold mb-4">Choose your action:</h3>
          <div className="choices-list">
            {eventChoices.map((choice, index) => (
              <button
                key={index}
                onClick={() => makeChoice(choice)}
                disabled={loading}
                className="choice-btn"
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        {consequences && (
          <div className="consequences-container">
            <h3 className="text-xl font-semibold mb-4">⚡ Consequences:</h3>
            <div className="consequences-text">
              <p>{consequences}</p>
            </div>
            <button 
              onClick={continueGame}
              className="mt-4 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
            >
              Continue Ruling
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="processing-phase">
      <div className="text-center py-12">
        <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-6"></div>
        <h2 className="text-2xl font-semibold mb-2">Processing...</h2>
        <p className="text-gray-600">The realm responds to your decision...</p>
      </div>
    </div>
  );

  return (
    <div className="app">
      <div className="container">
        {gamePhase === GamePhase.CHARACTER_CREATION && renderCharacterCreation()}
        {gamePhase === GamePhase.MAIN_GAME && renderMainGame()}
        {gamePhase === GamePhase.EVENT && renderEvent()}
        {gamePhase === GamePhase.PROCESSING && renderProcessing()}
      </div>
    </div>
  );
};

export default App;