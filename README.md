# Confirm NHCC golfers posted on days they played

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
- Python 3.12 or higher
- Git

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd handicapCheck
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/Scripts/activate  # On Windows
# OR
source venv/bin/activate     # On Unix/MacOS
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

5. Set up Gmail API:
- Go to Google Cloud Console
- Create a new project
- Enable Gmail API
- Create OAuth 2.0 credentials
- Download credentials and save as `credentials.json` in project root

### Obtain USGA Reports
* Download the report from the "Played / Posted Report (Players)" from USGA Admin portal
* Rename the file to `usga-mm-dd-yyyy.xlsx`
* Move it to the folder "usgaReports"

### Running the Application
```bash
python app.py mm-dd-yy
```

## Development

### Adding New Features
1. Create new modules in appropriate directories under `src/`
2. Update requirements.txt if new dependencies are added
3. Test changes locally
4. Submit pull request

### Testing
```bash
python -m pytest tests/
```

## License
[Your License Here]

### To Do List
* Publish the report of non-posters outside of terminal

## Setup Instructions

1. Create a `.env` file with your API keys:
```
MTECH_API_KEY=your_mtech_api_key
GOOGLE_SHEET_ID=your_spreadsheet_id
ROSTER_SHEET_ID=your_roster_spreadsheet_id
```