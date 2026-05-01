import unittest
import sys
import os
from unittest.mock import MagicMock

# Mock tkinter and other GUI-related modules in sys.modules
# This must be done BEFORE importing advanced_money_tracker
mock_tk = MagicMock()
mock_ttk = MagicMock()
mock_messagebox = MagicMock()
mock_filedialog = MagicMock()

sys.modules['tkinter'] = mock_tk
sys.modules['tkinter.ttk'] = mock_ttk
sys.modules['tkinter.messagebox'] = mock_messagebox
sys.modules['tkinter.filedialog'] = mock_filedialog

# Mock other optional dependencies
sys.modules['tkcalendar'] = MagicMock()
sys.modules['reportlab'] = MagicMock()
sys.modules['reportlab.lib'] = MagicMock()
sys.modules['reportlab.lib.pagesizes'] = MagicMock()
sys.modules['reportlab.platypus'] = MagicMock()
sys.modules['reportlab.lib.styles'] = MagicMock()
sys.modules['reportlab.lib.units'] = MagicMock()
sys.modules['openpyxl'] = MagicMock()
sys.modules['openpyxl.styles'] = MagicMock()
sys.modules['matplotlib'] = MagicMock()
sys.modules['matplotlib.pyplot'] = MagicMock()
sys.modules['matplotlib.backends'] = MagicMock()
sys.modules['matplotlib.backends.backend_tkagg'] = MagicMock()
sys.modules['matplotlib.figure'] = MagicMock()
sys.modules['PIL'] = MagicMock()
sys.modules['PIL.Image'] = MagicMock()
sys.modules['PIL.ImageTk'] = MagicMock()
sys.modules['google_auth_oauthlib'] = MagicMock()
sys.modules['google_auth_oauthlib.flow'] = MagicMock()
sys.modules['googleapiclient'] = MagicMock()
sys.modules['googleapiclient.discovery'] = MagicMock()
sys.modules['googleapiclient.http'] = MagicMock()
sys.modules['google'] = MagicMock()
sys.modules['google.auth'] = MagicMock()
sys.modules['google.auth.transport'] = MagicMock()
sys.modules['google.auth.transport.requests'] = MagicMock()
sys.modules['drive_sync'] = MagicMock()

# Add the parent directory to the sys.path to allow importing advanced_money_tracker
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Now import the class
from advanced_money_tracker import AdvancedMoneyTracker

class TestAdvancedMoneyTracker(unittest.TestCase):

    def setUp(self):
        # Create a dummy root for the AdvancedMoneyTracker instance
        self.mock_root = MagicMock()
        # Mocking database interaction to avoid errors during init
        with unittest.mock.patch.object(AdvancedMoneyTracker, 'init_database'):
            with unittest.mock.patch.object(AdvancedMoneyTracker, 'check_password_exists', return_value=False):
                with unittest.mock.patch.object(AdvancedMoneyTracker, 'create_modern_gui'):
                    with unittest.mock.patch.object(AdvancedMoneyTracker, 'show_dashboard'):
                        self.app = AdvancedMoneyTracker(self.mock_root)

    def test_is_numeric_valid_integers(self):
        self.assertTrue(self.app.is_numeric("123"))
        self.assertTrue(self.app.is_numeric("0"))
        self.assertTrue(self.app.is_numeric("-45"))

    def test_is_numeric_valid_floats(self):
        self.assertTrue(self.app.is_numeric("123.45"))
        self.assertTrue(self.app.is_numeric("0.0"))
        self.assertTrue(self.app.is_numeric("-67.89"))

    def test_is_numeric_invalid_strings(self):
        self.assertFalse(self.app.is_numeric("abc"))
        self.assertFalse(self.app.is_numeric("123a"))
        self.assertFalse(self.app.is_numeric("a123"))
        self.assertFalse(self.app.is_numeric(""))
        self.assertFalse(self.app.is_numeric(" "))
        self.assertFalse(self.app.is_numeric(None)) # Test with None

    def test_is_numeric_with_commas(self):
        # is_numeric should handle standard numeric formats, not localized ones
        self.assertFalse(self.app.is_numeric("1,234.56"))

if __name__ == '__main__':
    unittest.main()
