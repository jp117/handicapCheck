# Handicap Check

Confirm NHCC golfers posted scores on days they played.

## Project Structure
```
handicapCheck/
├── src/
│   ├── gmail/         # Gmail API integration
│   ├── usga/          # USGA report processing
│   ├── mtech/         # MTech API integration
│   └── reports/       # Report generation
├── tests/             # Test files
├── usgaReports/       # USGA report files
├── reports/           # Generated reports
├── app.py            # Main application
├── requirements.txt   # Python dependencies
└── README.md         # This file
```

## Setup

### Prerequisites
- Python 3.9 or higher
- Docker (recommended for running the app)
- Google Cloud project with Gmail and Google Sheets API enabled

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd handicapCheck
```

2. Create and activate a virtual environment (optional but recommended):
```bash
python3 -m venv venv
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
Create a `.env` file in the project root with:
```
MTECH_API_KEY=your_mtech_api_key
GOOGLE_SHEET_ID=your_spreadsheet_id
ROSTER_SHEET_ID=your_roster_spreadsheet_id
```

5. Set up Google API:
- Go to Google Cloud Console
- Create a new project
- Enable Gmail API and Google Sheets API
- Create OAuth 2.0 credentials
- Download credentials and save as `credentials.json` in project root
- Run the provided `auth.py` script locally to generate `token.json`

### Google Sheets Setup

- In your main Google Sheet (GOOGLE_SHEET_ID), create the following tabs:
    - `NoPost` — for tracking golfers who didn't post scores
    - `NoGHIN` — for tracking golfers without GHIN numbers
    - `ExcludedDates` — for specifying dates/times to exclude from posting checks

- In your roster Google Sheet (ROSTER_SHEET_ID), create:
    - `Sheet1` — Column A: Name, Column B: GHIN

#### ExcludedDates Sheet Format

| Date      | Start Time | End Time |
|-----------|------------|----------|
| 04-29-25  |            |          |  ← Exclude entire day
| 04-30-25  | 07:00      | 09:00    |  ← Exclude 7-9 AM
| 05-01-25  | 13:00      |          |  ← Exclude after 1 PM
| 05-02-25  |            | 13:00    |  ← Exclude before 1 PM

- Date format: `MM-DD-YY`
- Time format: `HH:MM` (24-hour, no seconds)

## Running the Application

### With Docker (recommended)

1. Build the Docker image:
```bash
docker build -t handicapcheck .
```

2. Run the script:
```bash
docker run \
  -v $(pwd)/credentials.json:/app/credentials.json \
  -v $(pwd)/token.json:/app/token.json \
  --env-file .env \
  handicapcheck mm-dd-yy
```
Replace `mm-dd-yy` with the date you want to check (e.g., `04-29-25`).

### How it Works

- Fetches tee times from MTech API
- Downloads USGA report from email (sent the day after play)
- Compares players who played against those who posted
- Checks roster for GHIN numbers
- Skips dates/times specified in the ExcludedDates sheet
- Updates Google Sheets with results:
    - `NoPost` tab: golfers who didn't post scores
    - `NoGHIN` tab: golfers without GHIN numbers

## No Longer Needed

- The `reports/` and `usgaReports/` folders are no longer used.
- All reporting and data storage is now handled via Google Sheets and email.

---

**Note:**  
- Make sure your `.env`, `credentials.json`, and `token.json` are not tracked in git.
- If you hit Google Sheets API rate limits, wait a minute and try again.