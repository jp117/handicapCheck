from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pickle
import os

class GmailClient:
    """Client for interacting with Gmail API."""
    
    SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
    
    def __init__(self, credentials_path='credentials.json', token_path='token.json'):
        self.credentials_path = credentials_path
        self.token_path = token_path
        self.service = None
    
    def authenticate(self):
        """Authenticate with Gmail API using OAuth2."""
        creds = None
        if os.path.exists(self.token_path):
            with open(self.token_path, 'rb') as token:
                creds = pickle.load(token)
        
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_path, self.SCOPES)
                creds = flow.run_local_server(port=0)
            with open(self.token_path, 'wb') as token:
                pickle.dump(creds, token)
        
        self.service = build('gmail', 'v1', credentials=creds)
        return self.service
    
    def get_recent_emails(self, user_id, max_results=5):
        """Get recent emails from the specified user."""
        if not self.service:
            self.authenticate()
            
        try:
            results = self.service.users().messages().list(
                userId=user_id, 
                maxResults=max_results
            ).execute()
            
            messages = results.get('messages', [])
            if not messages:
                return []
            
            emails = []
            for message in messages:
                msg = self.service.users().messages().get(
                    userId=user_id, 
                    id=message['id']
                ).execute()
                headers = msg['payload']['headers']
                subject = next(
                    (h['value'] for h in headers if h['name'] == 'Subject'),
                    'No Subject'
                )
                emails.append(subject)
            
            return emails
            
        except Exception as e:
            print(f'An error occurred: {e}')
            return [] 