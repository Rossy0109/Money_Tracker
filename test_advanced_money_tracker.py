import unittest
import sys
import os

# Add the parent directory to the sys.path to allow importing advanced_money_tracker
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Mock tkinter and other GUI-related imports for testing non-GUI logic
# This is a common practice when testing parts of a GUI application
# that don't directly interact with the GUI.
class MockTk:
    def Tk(self): return self
    def Toplevel(self, master=None): return self
    def geometry(self, geo): pass
    def title(self, title): pass
    def configure(self, **kwargs): pass
    def pack(self, **kwargs): pass
    def pack_propagate(self, flag): pass
    def winfo_screenwidth(self): return 1000
    def winfo_screenheight(self): return 800
    def grab_set(self): pass
    def wait_window(self): pass
    def destroy(self): pass
    def protocol(self, name, func): pass
    def mainloop(self): pass

class MockMessagebox:
    def showerror(self, title, message): pass
    def showinfo(self, title, message): pass

class MockTtk:
    def Treeview(self, master, columns, show, height): return self
    def heading(self, col, text): pass
    def column(self, col, width): pass
    def pack(self, **kwargs): pass
    def configure(self, **kwargs): pass
    def get_children(self): return []
    def delete(self, item): pass
    def insert(self, parent, index, values, iid): pass
    def bind(self, event, callback): pass
    def Combobox(self, master, textvariable, values, width, state): return self
    def grid(self, **kwargs): pass
    def current(self, index): pass

class MockDateEntry:
    def __init__(self, master, **kwargs): pass
    def pack(self, **kwargs): pass
    def grid(self, **kwargs): pass
    def set_date(self, date): pass
    def get_date(self): return "2025-01-01" # Mock return value

class MockStringVar:
    def __init__(self, value=''): self._value = value
    def get(self): return self._value
    def set(self, value): self._value = value
    def trace_add(self, mode, callback): pass

class MockIntVar:
    def __init__(self, value=0): self._value = value
    def get(self): return self._value
    def set(self, value): self._value = value

# Replace tkinter and its modules with mocks
tk = MockTk()
ttk = MockTtk()
messagebox = MockMessagebox()
DateEntry = MockDateEntry # Mock the DateEntry class
tk.StringVar = MockStringVar
tk.IntVar = MockIntVar
tk.Label = lambda master, **kwargs: MockTk()
tk.Frame = lambda master, **kwargs: MockTk()
tk.Button = lambda master, **kwargs: MockTk()
tk.Entry = lambda master, **kwargs: MockTk()
tk.Text = lambda master, **kwargs: MockTk()
tk.Radiobutton = lambda master, **kwargs: MockTk()
tk.LabelFrame = lambda master, **kwargs: MockTk()
tk.Checkbutton = lambda master, **kwargs: MockTk()


# Import the class after mocking its dependencies
from advanced_money_tracker import AdvancedMoneyTracker

class TestAdvancedMoneyTracker(unittest.TestCase):

    def setUp(self):
        # Create a dummy root for the AdvancedMoneyTracker instance
        self.mock_root = MockTk()
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
        self.assertFalse(self.app.is_numeric(None))  # Test with None

    def test_is_numeric_with_commas(self):
        # is_numeric should handle standard numeric formats, not localized ones
        self.assertFalse(self.app.is_numeric("1,234.56"))

if __name__ == '__main__':
    unittest.main()
