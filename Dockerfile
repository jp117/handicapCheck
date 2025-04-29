FROM python:3.13

ADD app.py .
ADD credentials.json .

RUN pip install requests openpyxl python-dotenv pandas google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client

ENTRYPOINT [ "python", "./app.py" ]