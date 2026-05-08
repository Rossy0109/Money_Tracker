import os
import sys

# Ensure the root and the server directory are in the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'Foot_Print_of_Money', 'server'))

from server import app

# Vercel requires the variable to be named 'app'
app = app
