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
