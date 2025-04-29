import requests
import csv
import os
from datetime import date

class MTechClient:
    """Client for interacting with MTech API."""
    
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('MTECH_API_KEY')
        if not self.api_key:
            raise ValueError("MTech API key is required")
    
    def get_tee_times(self, target_date: date):
        """Get tee times from MTech API for a specific date."""
        api_url = (
            f'https://www.clubmtech.com/cmtapi/teetimes/'
            f'?apikey={self.api_key}'
            f'&TheDate={target_date.month}-{target_date.day}-{target_date.year}'
        )
        
        with requests.Session() as session:
            response = session.get(api_url)
            response.raise_for_status()
            
            decoded_content = response.content.decode('utf-8')
            tee_sheet = list(csv.reader(decoded_content.splitlines(), delimiter=","))
            
            # Skip header row
            return tee_sheet[1:]
    
    @staticmethod
    def remove_after_character(text: str, char: str) -> str:
        """Remove everything after a specific character in a string."""
        index = text.find(char)
        if index != -1:
            return text[:index]
        return text 