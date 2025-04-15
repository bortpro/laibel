from flask import Flask, render_template, request, jsonify
import os
import uuid
import base64
from io import BytesIO
from PIL import Image
from ultralytics import YOLO # Import YOLO
import torch # Often needed implicitly by ultralytics

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here' # Keep this secure in production
app.config['UPLOAD_FOLDER'] = 'static/uploads' # Still used for potential future uploads, though not directly now

# Ensure upload directory exists (optional if not using file system saves)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# --- AI Model Loading ---
MODEL_PATH = 'models/dome.pt' # Path relative to app.py
yolo_model = None
model_load_error = None

try:
    # Check for CUDA device, fallback to CPU if not available
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Attempting to load YOLO model on device: {device}")
    if os.path.exists(MODEL_PATH):
        yolo_model = YOLO(MODEL_PATH)
        yolo_model.to(device) # Move model to appropriate device
        print(f"YOLO model '{MODEL_PATH}' loaded successfully on {device}.")
        # Optional: Run a dummy inference to warm up
        # try:
        #     dummy_img = Image.new('RGB', (640, 480), color = 'red')
        #     yolo_model.predict(dummy_img, verbose=False)
        #     print("Model warm-up successful.")
        # except Exception as warmup_err:
        #     print(f"Warning: Model warm-up failed: {warmup_err}")
    else:
        model_load_error = f"Model file not found at {MODEL_PATH}"
        print(f"Error: {model_load_error}")

except Exception as e:
    model_load_error = f"Failed to load YOLO model: {e}"
    print(f"Error: {model_load_error}")
# --- End AI Model Loading ---


@app.route('/')
def index():
    # Pass model status to template (optional, for frontend info)
    return render_template('index.html', model_loaded=yolo_model is not None, model_error=model_load_error)

# This route is kept for potential future use but not strictly needed for current flow
@app.route('/save_annotation', methods=['POST'])
def save_annotation():
    data = request.json
    print("Received data for saving (placeholder):", data)
    # Here you would save the annotation data persistently if needed
    return jsonify({"success": True, "message": "Annotation save endpoint reached (placeholder)"})

# --- AI Assist Endpoint ---
@app.route('/ai_assist', methods=['POST'])
def ai_assist():
    if not yolo_model:
        return jsonify({"success": False, "error": f"AI model not loaded. {model_load_error or ''}"}), 500

    try:
        data = request.json
        if 'image_data' not in data:
            return jsonify({"success": False, "error": "Missing image_data in request"}), 400

        image_data_url = data['image_data']
        # Decode Base64 image data URL (e.g., "data:image/png;base64,iVBOR...")
        try:
            header, encoded = image_data_url.split(",", 1)
            image_bytes = base64.b64decode(encoded)
            image = Image.open(BytesIO(image_bytes)).convert('RGB') # Ensure RGB
        except Exception as decode_err:
            print(f"Error decoding image: {decode_err}")
            return jsonify({"success": False, "error": f"Invalid image data format: {decode_err}"}), 400

        print(f"Performing AI inference on image of size {image.size}...")

        # Perform prediction
        # Adjust confidence threshold as needed
        results = yolo_model.predict(image, conf=0.25, verbose=False) # verbose=False reduces console spam

        detected_boxes = []
        if results and len(results) > 0:
            # Results is usually a list, take the first element
            result = results[0]
            boxes = result.boxes
            class_names = result.names # Dictionary {index: name}

            if boxes is not None:
                print(f"Detected {len(boxes)} potential objects.")
                for box in boxes:
                    xyxy = box.xyxy[0].cpu().numpy() # Get coordinates (x_min, y_min, x_max, y_max)
                    conf = float(box.conf[0].cpu().numpy()) # Get confidence
                    cls_index = int(box.cls[0].cpu().numpy()) # Get class index
                    label = class_names.get(cls_index, f"class_{cls_index}") # Get class name

                    detected_boxes.append({
                        "x_min": int(xyxy[0]),
                        "y_min": int(xyxy[1]),
                        "x_max": int(xyxy[2]),
                        "y_max": int(xyxy[3]),
                        "label": label,
                        "confidence": round(conf, 3) # Include confidence
                    })
            else:
                print("No boxes found in the results.")
        else:
             print("Inference returned no results or unexpected format.")


        print(f"AI Assist finished. Found {len(detected_boxes)} boxes above threshold.")
        return jsonify({
            "success": True,
            "boxes": detected_boxes
        })

    except Exception as e:
        print(f"Error during AI Assist processing: {e}")
        import traceback
        traceback.print_exc() # Print detailed traceback to Flask console
        return jsonify({"success": False, "error": f"Internal server error during inference: {e}"}), 500
# --- End AI Assist Endpoint ---

if __name__ == '__main__':
    # Use host='0.0.0.0' to make it accessible on your network
    # debug=True is helpful for development, but set to False for production
    # use_reloader=False prevents the app from restarting twice when loading the model initially
    app.run(debug=True, use_reloader=False)
