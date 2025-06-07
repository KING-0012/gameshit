#!/usr/bin/env python3
import subprocess
import json
import threading
import time
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import logging
import os

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class OllamaService:
    def __init__(self, model_name="Tohur/natsumura-storytelling-rp-llama-3.1"):
        self.model_name = model_name
        
    def generate_response(self, prompt, conversation_history=None):
        """Generate response from Ollama model"""
        try:
            # Build context with conversation history
            full_context = ""
            if conversation_history:
                for msg in conversation_history:
                    full_context += f"{msg['role']}: {msg['content']}\n"
            full_context += f"user: {prompt}\nassistant:"
            
            # Call Ollama
            cmd = ["ollama", "run", self.model_name]
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8"
            )
            
            stdout, stderr = process.communicate(input=full_context)
            
            if process.returncode != 0:
                logger.error(f"Ollama error: {stderr}")
                return {"error": f"LLM Error: {stderr}"}
                
            return {"response": stdout.strip()}
            
        except Exception as e:
            logger.error(f"Error calling Ollama: {str(e)}")
            return {"error": f"Service error: {str(e)}"}

    def stream_response(self, prompt, conversation_history=None):
        """Stream response from Ollama model"""
        try:
            # Build context
            full_context = ""
            if conversation_history:
                for msg in conversation_history:
                    full_context += f"{msg['role']}: {msg['content']}\n"
            full_context += f"user: {prompt}\nassistant:"
            
            cmd = ["ollama", "run", self.model_name]
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                bufsize=1
            )
            
            # Send input and close stdin
            process.stdin.write(full_context)
            process.stdin.close()
            
            # Stream output
            for line in iter(process.stdout.readline, ''):
                if line.strip():
                    yield f"data: {json.dumps({'text': line.strip()})}\n\n"
            
            process.stdout.close()
            process.wait()
            
        except Exception as e:
            logger.error(f"Streaming error: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

# Initialize Ollama service
ollama = OllamaService()

# Game state storage (in production, use a database)
game_sessions = {}

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "model": ollama.model_name})

@app.route('/api/generate', methods=['POST'])
def generate_text():
    data = request.json
    prompt = data.get('prompt', '')
    conversation_history = data.get('history', [])
    
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    result = ollama.generate_response(prompt, conversation_history)
    return jsonify(result)

@app.route('/api/stream', methods=['POST'])
def stream_text():
    data = request.json
    prompt = data.get('prompt', '')
    conversation_history = data.get('history', [])
    
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    def generate():
        yield "data: {\"start\": true}\n\n"
        for chunk in ollama.stream_response(prompt, conversation_history):
            yield chunk
        yield "data: {\"end\": true}\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/game/create-character', methods=['POST'])
def create_character():
    """Generate character creation questions using LLM"""
    data = request.json
    session_id = data.get('session_id', 'default')
    previous_answers = data.get('answers', [])
    
    # Build prompt for character creation
    if not previous_answers:
        prompt = """You are creating a strategic ruler character for a text-based game. Ask the first character creation question that will determine both roleplay aspects and game stats. Focus on their background, personality, or origin story. Make it engaging and consequential. Only ask ONE question."""
    else:
        # Build context from previous answers
        context = "Previous character creation answers:\n"
        for i, answer in enumerate(previous_answers, 1):
            context += f"Q{i}: {answer['question']}\nA{i}: {answer['answer']}\n"
        
        prompt = f"""{context}

Based on the answers above, ask the next character creation question that builds on what we know. Focus on aspects like:
- Leadership style
- Moral compass  
- Special skills or background
- Personal motivations
- Political views

Only ask ONE question. Make it meaningful for both story and game mechanics."""
    
    result = ollama.generate_response(prompt)
    
    if 'error' in result:
        return jsonify(result), 500
    
    return jsonify({
        "question": result['response'],
        "session_id": session_id
    })

@app.route('/api/game/generate-event', methods=['POST'])
def generate_event():
    """Generate game events based on current state"""
    data = request.json
    session_id = data.get('session_id', 'default')
    game_state = data.get('game_state', {})
    
    # Build prompt based on game state
    ruler_name = game_state.get('ruler_name', 'Unknown Ruler')
    resources = game_state.get('resources', {})
    relationships = game_state.get('relationships', {})
    location = game_state.get('current_location', 'Your Capitol')
    
    prompt = f"""You are generating an event for a strategic ruler game. Current situation:

Ruler: {ruler_name}
Location: {location}
Resources: {json.dumps(resources)}
Relationships: {json.dumps(relationships)}

Generate a dynamic event that:
1. Presents a challenging decision
2. Has 2-3 meaningful choices
3. Could affect resources, relationships, or story
4. Fits the ruler's current situation
5. Can range from political intrigue to personal drama to military challenges

Format as:
EVENT: [Description of what happens]
CHOICES:
1. [Choice 1]
2. [Choice 2] 
3. [Choice 3] (if applicable)

Make it engaging and consequential!"""
    
    result = ollama.generate_response(prompt)
    
    if 'error' in result:
        return jsonify(result), 500
    
    return jsonify({
        "event": result['response'],
        "session_id": session_id
    })

@app.route('/api/game/process-choice', methods=['POST'])
def process_choice():
    """Process player choice and determine consequences"""
    data = request.json
    session_id = data.get('session_id', 'default')
    event = data.get('event', '')
    choice = data.get('choice', '')
    game_state = data.get('game_state', {})
    
    prompt = f"""You are processing a player's choice in a strategic ruler game.

Current Game State: {json.dumps(game_state)}
Recent Event: {event}
Player Choice: {choice}

Determine the consequences of this choice:
1. Immediate narrative outcome
2. Resource changes (gold, army, influence, etc.)
3. Relationship changes with factions/characters
4. Any new information or story developments

Format as:
OUTCOME: [What happens as a result]
RESOURCE_CHANGES: [JSON format like {{"gold": +100, "army": -50}}]
RELATIONSHIP_CHANGES: [JSON format like {{"nobles": +10, "peasants": -5}}]
NEW_DEVELOPMENTS: [Any new story elements or unlocked content]

Be specific about numbers and consequences!"""
    
    result = ollama.generate_response(prompt)
    
    if 'error' in result:
        return jsonify(result), 500
    
    return jsonify({
        "consequences": result['response'],
        "session_id": session_id
    })

@app.route('/api/game/save-state', methods=['POST'])
def save_game_state():
    """Save game state"""
    data = request.json
    session_id = data.get('session_id', 'default')
    game_state = data.get('game_state', {})
    
    game_sessions[session_id] = game_state
    return jsonify({"success": True, "session_id": session_id})

@app.route('/api/game/load-state/<session_id>', methods=['GET'])
def load_game_state(session_id):
    """Load game state"""
    game_state = game_sessions.get(session_id, {})
    return jsonify({"game_state": game_state, "session_id": session_id})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001, debug=True)
