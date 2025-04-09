from flask import Flask, render_template, request, jsonify
import os
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['UPLOAD_FOLDER'] = 'static/uploads'

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/save_annotation', methods=['POST'])
def save_annotation():
    data = request.json
    # Here you would save the annotation data. For now, we'll just return success
    #
    return jsonify({"success": True, "message": "Annotation saved"})

if __name__ == '__main__':
    app.run(debug=False)
