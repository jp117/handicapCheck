import sys
import datetime
import requests # type: ignore
import csv
import openpyxl # type: ignore
import os
from dotenv import load_dotenv
import pandas as pd
from pathlib import Path

# Load environment variables
load_dotenv()

date = datetime.datetime.strptime(sys.argv[1], '%m-%d-%y').date()

# Get API key from environment variable
api_key = os.getenv('MTECH_API_KEY')
mtechAPIUrl = f'https://www.clubmtech.com/cmtapi/teetimes/?apikey={api_key}&TheDate={date.month}-{date.day}-{date.year}'

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

def getUSGAData():
    file='usgaReports/usga-{}-{}-{}.xlsx'.format(date.month, date.day, date.year)
    postData = openpyxl.load_workbook(file)
    sheet = postData.active
    golfers = []
    for row in sheet:
        golfers.append([cell.value for cell in row])
    return golfers[1:]

def checkPosting(golfer):
    y = 0
    while y < len(getUSGAData()):
        for usga in getUSGAData():
            if int(usga[0]) == int(golfer):
                return True
            else: y+=1
    return False

# Define the function BEFORE it's called
def update_excel_report(report_file, golfer_list):
    # Get today's date formatted as mm-dd-yy
    today_date = datetime.date.strftime(date, "%m-%d-%y")
    
    # Create DataFrame from existing file or create new one
    if os.path.exists(report_file):
        try:
            df = pd.read_excel(report_file)
        except:
            df = pd.DataFrame(columns=['Name', 'Count', 'Dates'])
    else:
        # Make sure the reports directory exists
        Path('reports').mkdir(parents=True, exist_ok=True)
        df = pd.DataFrame(columns=['Name', 'Count', 'Dates'])
    
    # Make sure the DataFrame has the necessary columns
    if 'Name' not in df.columns:
        df['Name'] = ''
    if 'Count' not in df.columns:
        df['Count'] = 0
    if 'Dates' not in df.columns:
        df['Dates'] = ''
    
    # Update counts and dates for golfers
    for golfer_name in golfer_list:
        # Normalize the golfer name to avoid key errors
        golfer_name = golfer_name.strip() if isinstance(golfer_name, str) else str(golfer_name)
        
        # Check if golfer exists in the dataframe
        mask = df['Name'] == golfer_name
        if mask.any():
            # Increment count
            df.loc[mask, 'Count'] += 1
            
            # Append today's date to the dates list
            current_dates = df.loc[mask, 'Dates'].iloc[0]
            if isinstance(current_dates, str) and current_dates:
                new_dates = current_dates + ", " + today_date
            else:
                new_dates = today_date
            df.loc[mask, 'Dates'] = new_dates
        else:
            # Add new golfer with count 1 and today's date
            new_row = pd.DataFrame({'Name': [golfer_name], 'Count': [1], 'Dates': [today_date]})
            df = pd.concat([df, new_row], ignore_index=True)
    
    # Sort by count (highest first)
    df = df.sort_values('Count', ascending=False)
    
    # Save the updated file
    df.to_excel(report_file, index=False)
    print(f"Updated report at {report_file}")

if __name__ == "__main__":
    noGHIN = []
    noPost = []
    tee_data = getMTechData()
    
    # Collect all golfer[1] values to check for duplicates
    all_golfer_values = [g[1] for g in tee_data if len(g) > 1]
    
    for golfer in tee_data:
        # Check if this golfer's value appears elsewhere in the data
        if len(golfer) > 1 and all_golfer_values.count(golfer[1]) > 1:
            if golfer[3] != "":
                if not checkPosting(golfer[3]): noPost.append(removeAfterCharacter(golfer[2], '-'))
            elif golfer[3] == "":
                noGHIN.append(removeAfterCharacter(golfer[2], "-"))
    
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
    
    # Update noPost Excel file
    update_excel_report('reports/noPost.xlsx', noPost)
    
    # Update noGHIN Excel file
    update_excel_report('reports/noGHIN.xlsx', noGHIN)