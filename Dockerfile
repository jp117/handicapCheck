FROM python:3.13

ADD app.py .

RUN pip install requests openpyxl python-dotenv pandas

ENTRYPOINT [ "python", "./app.py" ]