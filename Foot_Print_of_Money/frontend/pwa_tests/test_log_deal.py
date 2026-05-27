import pytest
from unittest.mock import patch, MagicMock
from log_deal import append_to_sheet

@patch('log_deal.build')
@patch('log_deal.get_credentials')
@patch('os.getenv')
def test_append_to_sheet_success(mock_env, mock_creds, mock_build):
    # Setup
    mock_env.return_value = 'test_id'
    mock_service = MagicMock()
    mock_append = MagicMock()
    mock_append.execute.return_value = {'updates': {'updatedRows': 1}}
    mock_service.spreadsheets().values().append = mock_append
    mock_build.return_value = mock_service
    
    # Execution
    data = ['2026-05-10', 'Acme Corp', 'Sent', '$1', 'Q2', 'Agent']
    append_to_sheet('Pipeline!A1', data)
    
    # Assertions
    mock_append.assert_called_once()
    assert mock_append.call_args.kwargs['spreadsheetId'] == 'test_id'
