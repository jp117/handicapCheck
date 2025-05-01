import sys
import datetime
import requests # type: ignore
import csv
import openpyxl # type: ignore
import os
from dotenv import load_dotenv
import pandas as pd
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pickle
import time

# Load environment variables
load_dotenv()

# Parse date with flexible year format
date_str = sys.argv[1]
try:
    # Try 4-digit year format first
    date = datetime.datetime.strptime(date_str, '%m-%d-%Y').date()
except ValueError:
    # If that fails, try 2-digit year format
    date = datetime.datetime.strptime(date_str, '%m-%d-%y').date()

# Get API key from environment variable
api_key = os.getenv('MTECH_API_KEY')
mtechAPIUrl = f'https://www.clubmtech.com/cmtapi/teetimes/?apikey={api_key}&TheDate={date.month}-{date.day}-{date.year}'

# Update SCOPES to include Google Sheets
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/spreadsheets'
]

# Add at the top with other global variables
cached_sheets = {}

def get_google_creds():
    """Get and refresh Google credentials."""
    creds = None
    if os.path.exists('token.json'):
        with open('token.json', 'rb') as token:
            creds = pickle.load(token)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'wb') as token:
            pickle.dump(creds, token)
    return creds

def update_google_sheet(sheet_id, sheet_name, golfer_list):
    """Update Google Sheet with golfer data."""
    global cached_sheets
    creds = get_google_creds()
    service = build('sheets', 'v4', credentials=creds)
    today_date = datetime.date.strftime(date, "%m-%d-%y")
    
    try:
        # Use cached data if available
        if sheet_name in cached_sheets:
            existing_data = cached_sheets[sheet_name]
        else:
            # Get existing data
            result = service.spreadsheets().values().get(
                spreadsheetId=sheet_id,
                range=f'{sheet_name}!A:C'
            ).execute()
            existing_data = result.get('values', [])
            cached_sheets[sheet_name] = existing_data
            
        if not existing_data:
            existing_data = [['Name', 'Count', 'Dates']]
        
        # Convert to dictionary for easier lookup
        data_dict = {row[0]: {'count': int(row[1]), 'dates': row[2]} 
                    for row in existing_data[1:] if len(row) >= 3}
        
        # Update data
        for golfer_name in golfer_list:
            golfer_name = golfer_name.strip() if isinstance(golfer_name, str) else str(golfer_name)
            
            if golfer_name in data_dict:
                # Update existing golfer
                data_dict[golfer_name]['count'] += 1
                current_dates = data_dict[golfer_name]['dates']
                data_dict[golfer_name]['dates'] = f"{current_dates}, {today_date}"
            else:
                # Add new golfer
                data_dict[golfer_name] = {'count': 1, 'dates': today_date}
        
        # Convert back to list format and sort by count
        updated_data = [[name, str(data['count']), data['dates']] 
                       for name, data in data_dict.items()]
        updated_data.sort(key=lambda x: int(x[1]), reverse=True)
        
        # Add header
        final_data = [['Name', 'Count', 'Dates']] + updated_data
        
        # Clear existing data
        service.spreadsheets().values().clear(
            spreadsheetId=sheet_id,
            range=f'{sheet_name}!A:C'
        ).execute()
        
        # Update sheet
        service.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=f'{sheet_name}!A1',
            valueInputOption='RAW',
            body={'values': final_data}
        ).execute()
        
        print(f"Updated Google Sheet: {sheet_name}")
        
    except Exception as e:
        print(f"Error updating Google Sheet: {e}")

def test_gmail_connection():
    """Test Gmail API connection and list recent emails."""
    creds = None
    # The file token.json stores the user's access and refresh tokens
    if os.path.exists('token.json'):
        with open('token.json', 'rb') as token:
            creds = pickle.load(token)
    
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open('token.json', 'wb') as token:
            pickle.dump(creds, token)

    try:
        # Create Gmail API service
        service = build('gmail', 'v1', credentials=creds)
        
        # Get list of messages
        results = service.users().messages().list(userId='nhcchandicapcheck@gmail.com', maxResults=5).execute()
        messages = results.get('messages', [])

        if not messages:
            print('No messages found.')
            return
        
        print('Recent emails:')
        for message in messages:
            msg = service.users().messages().get(userId='nhcchandicapcheck@gmail.com', id=message['id']).execute()
            headers = msg['payload']['headers']
            subject = next(h['value'] for h in headers if h['name'] == 'Subject')
            print(f'- {subject}')
        
        return True
    except Exception as e:
        print(f'An error occurred: {e}')
        return False

def removeAfterCharacter(text, char):
    index = text.find(char)
    if index != -1:
        return text[:index]
    return text


def getMTechData():
    with requests.Session() as s:
        download = s.get(mtechAPIUrl)

        decodedContet = download.content.decode('utf-8')

        teeSheet = csv.reader(decodedContet.splitlines(), delimiter=",")
        teeSheet = list(teeSheet)
        teeSheet = teeSheet[1:]
        
        return teeSheet

def get_email_attachment(search_date):
    """Get XLSX attachment from GHIN email for the specified date."""
    creds = get_google_creds()
    service = build('gmail', 'v1', credentials=creds)
    
    # Format date for email search (next day after golf date)
    email_date = search_date + datetime.timedelta(days=1)
    search_query = f'from:reporting@ghin.com subject:"Auto-Generated Scheduled Report - Played / Posted Report (Player Rounds)" after:{email_date.strftime("%Y/%m/%d")} before:{(email_date + datetime.timedelta(days=1)).strftime("%Y/%m/%d")}'
    
    print(f"Searching for email with query: {search_query}")
    
    try:
        # Search for the email
        results = service.users().messages().list(userId='me', q=search_query).execute()
        messages = results.get('messages', [])

        if not messages:
            raise Exception(f"No email found from reporting@ghin.com for date {email_date.strftime('%m-%d-%y')}")

        # Get the first matching email
        msg = service.users().messages().get(userId='me', id=messages[0]['id']).execute()

        # Get the attachment
        if 'parts' not in msg['payload']:
            raise Exception("Email has no attachments")

        for part in msg['payload']['parts']:
            if part.get('filename', '').endswith('.xlsx'):
                attachment_id = part['body']['attachmentId']
                attachment = service.users().messages().attachments().get(
                    userId='me', 
                    messageId=messages[0]['id'], 
                    id=attachment_id
                ).execute()
                
                # Decode attachment data
                file_data = attachment['data']
                file_data = file_data.replace('-', '+').replace('_', '/')
                
                # Create a temporary file to store the Excel data
                import tempfile
                import base64
                
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
                temp_file.write(base64.urlsafe_b64decode(file_data))
                temp_file.close()
                
                print(f"Successfully downloaded XLSX attachment")
                return temp_file.name
                
        raise Exception("No XLSX attachment found in email")
        
    except Exception as e:
        print(f"Error getting email attachment: {e}")
        raise

def getUSGAData():
    """Get USGA data once and cache it."""
    if not hasattr(getUSGAData, 'cached_data'):
        try:
            # Get the XLSX file from email
            excel_file = get_email_attachment(date)
            
            # Read the Excel file
            postData = openpyxl.load_workbook(excel_file)
            sheet = postData.active
            golfers = []
            for row in sheet:
                golfers.append([cell.value for cell in row])
            
            # Clean up temporary file
            os.unlink(excel_file)
            
            # Cache the data
            getUSGAData.cached_data = golfers[1:]  # Skip header row
            
        except Exception as e:
            print(f"Error reading USGA data: {e}")
            raise
            
    return getUSGAData.cached_data

def checkPosting(golfer):
    """Check if a golfer has posted their score."""
    try:
        usga_data = getUSGAData()  # This will now use cached data after first call
        golfer_id = int(golfer)
        
        for usga in usga_data:
            if int(usga[0]) == golfer_id:
                return True
        return False
    except Exception as e:
        print(f"Error checking posting: {e}")
        return False

def normalize_name(name):
    """Normalize name by removing extra spaces and special characters"""
    return ' '.join(name.strip().lower().split())

def cache_sheet_data():
    """Cache all sheet data at startup to avoid rate limits"""
    creds = get_google_creds()
    service = build('sheets', 'v4', credentials=creds)
    
    # Cache all needed data
    try:
        # Get excluded dates
        result = service.spreadsheets().values().get(
            spreadsheetId=os.getenv('GOOGLE_SHEET_ID'),
            range='ExcludedDates!A:C'
        ).execute()
        cache_sheet_data.excluded_dates = result.get('values', [])
        
        # Get roster data
        result = service.spreadsheets().values().get(
            spreadsheetId=os.getenv('ROSTER_SHEET_ID'),
            range='Sheet1!A:B'
        ).execute()
        cache_sheet_data.roster = result.get('values', [])
        
        return True
    except Exception as e:
        print(f"Error caching sheet data: {e}")
        return False

def get_sheet(sheet_name):
    """Get a specific sheet from the Google Spreadsheet with caching."""
    global cached_sheets
    
    # Return cached data if available
    if sheet_name in cached_sheets:
        return cached_sheets[sheet_name]
        
    try:
        creds = get_google_creds()
        service = build('sheets', 'v4', credentials=creds)
        
        # Get the sheet data
        result = service.spreadsheets().values().get(
            spreadsheetId=os.getenv('GOOGLE_SHEET_ID'),
            range=f'{sheet_name}!A:C'
        ).execute()
        
        # Cache the result
        cached_sheets[sheet_name] = result.get('values', [])
        return cached_sheets[sheet_name]
    except Exception as e:
        return None

def get_excluded_times(date_str):
    excluded_times = []
    try:
        # Get the ExcludedDates sheet
        values = get_sheet('ExcludedDates')
        if not values:
            return excluded_times

        # Skip header row
        for row in values[1:]:
            if len(row) >= 1 and row[0] == date_str:
                # If there are no times specified, exclude the entire day
                if len(row) == 1 or (len(row) > 1 and not row[1].strip() and (len(row) <= 2 or not row[2].strip())):
                    excluded_times.append((None, None))
                else:
                    start_time = row[1] if len(row) > 1 and row[1] else None
                    end_time = row[2] if len(row) > 2 and row[2] else None
                    excluded_times.append((start_time, end_time))
    except Exception as e:
        return excluded_times
    return excluded_times

def check_roster(golfer_name):
    """Check if golfer exists in roster and has a GHIN number"""
    if not hasattr(cache_sheet_data, 'roster'):
        return False, False
        
    normalized_golfer = normalize_name(golfer_name)
    
    for row in cache_sheet_data.roster[1:]:  # Skip header
        if not row[0]:  # Skip empty names
            continue
            
        if normalize_name(row[0]) == normalized_golfer:
            has_ghin = len(row) > 1 and row[1] and row[1].strip()
            return True, has_ghin
            
    return False, False

def parse_mtech_time(time_str):
    try:
        parsed_time = datetime.datetime.strptime(time_str, '%I:%M %p').time()
        return parsed_time
    except Exception as e:
        return None

def is_time_excluded(tee_time):
    try:
        parsed_time = parse_mtech_time(tee_time)
        if not parsed_time:
            return False

        date_str = get_current_date()
        excluded_times = get_excluded_times(date_str)

        for start_time_str, end_time_str in excluded_times:
            # If both times are None, it's a full day exclusion
            if start_time_str is None and end_time_str is None:
                return True

            if start_time_str:
                start_time = datetime.datetime.strptime(start_time_str, '%H:%M').time()
            else:
                start_time = None

            if end_time_str:
                end_time = datetime.datetime.strptime(end_time_str, '%H:%M').time()
            else:
                end_time = None

            # Check if the tee time falls within the exclusion period
            if (start_time is None or parsed_time >= start_time) and \
               (end_time is None or parsed_time <= end_time):
                return True

        return False
    except Exception as e:
        return False

def get_current_date():
    """Get the current date in the format used in the ExcludedDates sheet"""
    return date.strftime("%m-%d-%y")  # Make sure we're using the right format

if __name__ == "__main__":
    # Cache sheet data at startup
    print("Caching sheet data...")
    if not cache_sheet_data():
        print("Failed to cache sheet data. Exiting.")
        sys.exit(1)
    
    # Test Gmail connection first
    print("Testing Gmail connection...")
    test_gmail_connection()
    
    noGHIN = []
    noPost = []
    tee_data = getMTechData()
    
    print(f"Checking golf rounds for {date.strftime('%m-%d-%y')}")
    print(f"Looking for USGA report email from {(date + datetime.timedelta(days=1)).strftime('%m-%d-%y')}")
    
    # Collect all golfer[1] values to check for duplicates
    all_golfer_values = [g[1] for g in tee_data if len(g) > 1]
    
    for golfer in tee_data:
        # Check if this golfer's value appears elsewhere in the data
        if len(golfer) > 1 and all_golfer_values.count(golfer[1]) > 1:
            # Check if tee time should be excluded
            if len(golfer) > 1:
                if not is_time_excluded(golfer[1]):
                    if golfer[3] != "":
                        if not checkPosting(golfer[3]): 
                            noPost.append(removeAfterCharacter(golfer[2], '-'))
                    elif golfer[3] == "":
                        # Check roster before adding to noGHIN
                        golfer_name = removeAfterCharacter(golfer[2], "-")
                        exists_in_roster, has_ghin = check_roster(golfer_name)
                        
                        if not exists_in_roster or not has_ghin:
                            noGHIN.append(golfer_name)
    
    print('The following golfers did not post: ', end='')
    if noPost:
        print(', '.join(noPost) + '.')
    else:
        print('None.')
    
    print('The following golfers have no GHIN: ', end='')
    if noGHIN:
        print(', '.join(noGHIN) + '.')
    else:
        print('None.')
        
    print('Handicap report done for ' + datetime.date.strftime(date, "%m-%d-%y"))
    
    # Make sure we have a reports directory
    Path('reports').mkdir(parents=True, exist_ok=True)
    
    # Replace the Excel report updates with Google Sheets updates
    SPREADSHEET_ID = os.getenv('GOOGLE_SHEET_ID')
    
    # Update both sheets
    update_google_sheet(SPREADSHEET_ID, 'NoPost', noPost)
    time.sleep(1)  # Add 1 second delay between updates
    update_google_sheet(SPREADSHEET_ID, 'NoGHIN', noGHIN)