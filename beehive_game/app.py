"""
Beehive Sandbox Game - Flask Backend
A realistic bee colony simulation with dynamic world generation
"""

from flask import Flask, render_template, jsonify
import random

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/generate_chunk/<int:chunk_x>/<int:chunk_y>')
def generate_chunk(chunk_x, chunk_y):
    """Generate a chunk of the world dynamically"""
    chunk_size = 32
    chunk_data = []
    
    # Seed-based generation for consistency
    random.seed(f"{chunk_x},{chunk_y}")
    
    for y in range(chunk_size):
        for x in range(chunk_size):
            world_x = chunk_x * chunk_size + x
            world_y = chunk_y * chunk_size + y
            
            # Generate resources based on noise-like patterns
            cell_type = 0  # Empty by default
            resource_amount = 0
            
            # Pollen flowers (3-5% chance)
            if random.random() < 0.04:
                cell_type = 3  # Pollen
                resource_amount = random.randint(40, 80)
            # Propolis trees (1-2% chance)
            elif random.random() < 0.015:
                cell_type = 4  # Propolis
                resource_amount = random.randint(80, 150)
            
            chunk_data.append({
                'x': world_x,
                'y': world_y,
                't': cell_type,
                'r': resource_amount
            })
    
    return jsonify(chunk_data)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
