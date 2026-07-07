# Stage 1: Build the React + Vite frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the FastAPI backend runner
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy compiled frontend static assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy backend files and configuration scripts
COPY backend/ /app/backend/
COPY run.py /app/
COPY sample_fir.txt /app/
COPY create_template.py /app/

# Generate the Excel upload template file
RUN python create_template.py

# Create database and uploads directories
RUN mkdir -p /app/backend/static/uploads /app/backend/data

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=8000
ENV PYTHONPATH=/app

EXPOSE 8000

# Start Uvicorn FastAPI application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
