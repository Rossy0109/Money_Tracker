FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Initialize DB on build (optional, usually done at runtime or via volume)
RUN python init_db.py

ENV PORT 5000
EXPOSE 5000

CMD ["python", "server.py"]
