import openpyxl
from datetime import date
from pathlib import Path

class USGAProcessor:
    """Processor for USGA report data."""
    
    def __init__(self, reports_dir='usgaReports'):
        self.reports_dir = Path(reports_dir)
        if not self.reports_dir.exists():
            self.reports_dir.mkdir(parents=True)
    
    def get_report_data(self, target_date: date):
        """Get USGA report data for a specific date."""
        file_path = self.reports_dir / f'usga-{target_date.month}-{target_date.day}-{target_date.year}.xlsx'
        
        if not file_path.exists():
            raise FileNotFoundError(f"USGA report not found for date {target_date}")
        
        workbook = openpyxl.load_workbook(file_path)
        sheet = workbook.active
        
        # Convert sheet data to list, skipping header row
        return [[cell.value for cell in row] for row in sheet][1:]
    
    def check_posting(self, golfer_id: str, target_date: date) -> bool:
        """Check if a golfer has posted their score for a specific date."""
        try:
            report_data = self.get_report_data(target_date)
            return any(int(row[0]) == int(golfer_id) for row in report_data)
        except FileNotFoundError:
            print(f"Warning: No USGA report found for {target_date}")
            return False 