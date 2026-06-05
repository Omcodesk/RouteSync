# predict.py - Simple ETA microservice for Transport Tracker
# -----------------------------------------------------------
# Run:
#   pip install -r requirements.txt
#   python predict.py
#
# Backend can call this when AI_URL is set:
#   AI_URL=http://localhost:5001/predict

from flask import Flask, request, jsonify # type: ignore
from flask_cors import CORS # type: ignore
import math

app = Flask(__name__)
CORS(app)  # allow Node.js server to access this API


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance (km) between two lat/lon points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


@app.route('/predict', methods=['POST'])
def predict():
    """
    Expected JSON (examples):
    { "lat": 12.34, "lng": 56.78, "speed": 20 }
    or include endpoint: { "end_lat": 12.35, "end_lng": 56.79 }
    """

    data = request.get_json(silent=True) or {}

    lat = data.get("lat")
    lng = data.get("lng")
    speed = data.get("speed", 20)

    # optional endpoint location for better ETA calculation
    end_lat = data.get("end_lat")
    end_lng = data.get("end_lng")

    # validate lat/lng/speed
    try:
        lat = float(lat)
        lng = float(lng)
        speed = float(speed)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid or missing lat/lng/speed"}), 400

    # default ETA if nothing else provided
    eta_minutes = 7

    # If endpoint coordinates exist, compute distance-based ETA
    if end_lat is not None and end_lng is not None:
        try:
            end_lat = float(end_lat)
            end_lng = float(end_lng)
            dist_km = haversine_km(lat, lng, end_lat, end_lng)
            hours = dist_km / max(speed, 1)
            eta_minutes = max(1, round(hours * 60))
        except (TypeError, ValueError):
            # fall back to simple calc below
            pass

    else:
        # fallback simple ETA: assume 1 km ahead -> time = 1 / speed (h) * 60
        try:
            eta_minutes = max(1, int(60 * (1.0 / max(speed, 1))))
        except Exception:
            eta_minutes = 7

    return jsonify({"eta": eta_minutes})


if __name__ == "__main__":
    print("ETA predictor service running on http://localhost:5001")
    app.run(port=5001, host="0.0.0.0")
