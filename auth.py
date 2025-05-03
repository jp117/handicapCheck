from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
import pickle
import os

SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/spreadsheets'
]

# Remove token.json if it's a directory
if os.path.isdir('token.json'):
    os.rmdir('token.json')

flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
creds = flow.run_local_server(port=0)

# Save the credentials with a temporary name first
temp_token_path = 'temp_token.json'
with open(temp_token_path, 'wb') as token:
    pickle.dump(creds, token)

# Rename to token.json
if os.path.exists('token.json'):
    os.remove('token.json')
os.rename(temp_token_path, 'token.json')

print("Authentication successful! token.json has been created.")