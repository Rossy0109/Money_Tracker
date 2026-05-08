from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/api/debug', methods=['GET'])
def debug():
    return jsonify({"status": "minimal-flask-ok"})
