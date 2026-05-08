import os
import sys
import typing
import logging
from typing import Optional, Any, Dict
from dotenv import load_dotenv

# 1. Logging Configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 2. Python 3.13 Compatibility Patch (Pydantic v1 Fix)
def apply_pydantic_patch():
    """Fixes ForwardRef._evaluate in Python 3.13 for Pydantic v1 compatibility."""
    if sys.version_info >= (3, 13):
        orig_evaluate = typing.ForwardRef._evaluate
        def _evaluate_patched(self, globalns, localns, *args, **kwargs):
            # Python 3.13: (self, globalns, localns, type_params, *, recursive_guard=set())
            # Pydantic v1: (globalns, localns, recursive_guard)
            if len(args) == 1 and 'recursive_guard' not in kwargs:
                return orig_evaluate(self, globalns, localns, (), recursive_guard=args[0])
            return orig_evaluate(self, globalns, localns, *args, **kwargs)
        typing.ForwardRef._evaluate = _evaluate_patched
        logger.info("Applied Python 3.13 compatibility patch for Pydantic.")

apply_pydantic_patch()

# Import Supabase after patch
try:
    from supabase import create_client, Client
except ImportError:
    logger.error("Supabase library not found. Please run 'pip install supabase'.")
    Client = Any # type: ignore

# 3. Environment Validation
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def validate_env():
    missing = []
    if not SUPABASE_URL: missing.append("SUPABASE_URL")
    if not SUPABASE_KEY: missing.append("SUPABASE_KEY")
    if missing:
        critical_error = f"Missing required environment variables: {', '.join(missing)}"
        logger.error(critical_error)
        raise RuntimeError(critical_error)

# 4. Centralized Supabase Client
_supabase_instance: Optional[Client] = None

def get_supabase_client() -> Client:
    global _supabase_instance
    if _supabase_instance is None:
        validate_env()
        try:
            _supabase_instance = create_client(SUPABASE_URL, SUPABASE_KEY) # type: ignore
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            raise
    return _supabase_instance

# 5. Standardized API Response Helpers
def success_response(data: Any, status_code: int = 200):
    return {
        "status": "success",
        "data": data
    }, status_code

def error_response(message: str, code: str = "INTERNAL_ERROR", status_code: int = 500):
    return {
        "status": "error",
        "error": {
            "message": message,
            "code": code
        }
    }, status_code

# 6. PDF Generation Utility
try:
    from fpdf import FPDF
except ImportError:
    FPDF = object # type: ignore

class PDFReport(FPDF):
    def header(self):
        self.set_font('helvetica', 'B', 15)
        self.cell(0, 10, 'Financial Transaction Report', border=True, ln=1, align='C')
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('helvetica', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')

def generate_report_pdf(transactions):
    pdf = PDFReport()
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.set_font('helvetica', '', 10)
    
    # Table Header
    pdf.set_fill_color(200, 220, 255)
    pdf.cell(40, 10, 'Date', 1, 0, 'C', True)
    pdf.cell(80, 10, 'Description', 1, 0, 'C', True)
    pdf.cell(30, 10, 'Type', 1, 0, 'C', True)
    pdf.cell(40, 10, 'Amount', 1, 1, 'C', True)
    
    # Table Rows
    for t in transactions:
        date_str = str(t.get('occurred_at', ''))[:10]
        note_str = str(t.get('notes', ''))[:40] if t.get('notes') else 'N/A'
        t_type = str(t.get('type', '')).capitalize()
        amount_str = f"{t.get('currency', '')} {float(t.get('amount', 0)):.2f}"
        
        pdf.cell(40, 10, date_str, 1)
        pdf.cell(80, 10, note_str, 1)
        pdf.cell(30, 10, t_type, 1)
        pdf.cell(40, 10, amount_str, 1, 1, 'R')
        
    return pdf.output()

# 7. Mock Bank Provider
import random
from datetime import datetime, timedelta

class MockBankProvider:
    @staticmethod
    def fetch_transactions(count=5):
        vendors = ["Starbucks", "Amazon", "Uber", "Netflix", "Shell", "Walmart"]
        mock_data = []
        for i in range(count):
            mock_data.append({
                "amount": round(random.uniform(10.0, 500.0), 2),
                "currency": "USD",
                "notes": f"Bank Sync: {random.choice(vendors)}",
                "type": "expense",
                "occurred_at": (datetime.now() - timedelta(days=random.randint(0, 7))).isoformat(),
                "is_cleared": True,
                "vendor": random.choice(vendors)
            })
        return mock_data
