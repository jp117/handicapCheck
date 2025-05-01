FROM python:3.13

WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application files after installing dependencies
COPY app.py .
COPY credentials.json .

ENTRYPOINT [ "python", "./app.py" ]