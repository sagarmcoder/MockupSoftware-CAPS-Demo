"""Synthetic payroll adapter owned by the demo application.

The CAPS runtime remains the policy and execution engine. This adapter is the
demo sink contract: it accepts only the bounded synthetic employee identifiers
that the server-owned directory can issue and never connects to a real payroll
system.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict


_SYNTHETIC_EMPLOYEE_ID = re.compile(r"^(?:E10[4-6]|EMP[0-9]{4})$")


def _is_synthetic_employee(employee_id: str) -> bool:
    return bool(_SYNTHETIC_EMPLOYEE_ID.fullmatch(employee_id))


def _response(data: Dict[str, Any], *, trace_id: str, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    action_log = os.getenv("CAPS_PAYROLL_ACTION_LOG", "").strip()
    if action_log and tool_name in {"change_hourly_rate", "disburse_bank_payment"}:
        path = Path(action_log)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"tool_name": tool_name, "params": params, "trace_id": trace_id}) + "\n")
    return {
        "ok": True,
        "data": data,
        "error_code": None,
        "retryable": False,
        "message": "synthetic payroll adapter response",
    }


def search_time_entries(params: Dict[str, Any], _request_context: Dict[str, Any], trace_id: str) -> Dict[str, Any]:
    employee_id = str(params.get("employee_id", "")).strip()
    if not _is_synthetic_employee(employee_id):
        return {"ok": False, "data": None, "error_code": "EMPLOYEE_NOT_FOUND", "retryable": False}
    return _response(
        {"employee_id": employee_id, "approved_hours": 38.5, "status": "Approved", "entries": 5},
        trace_id=trace_id,
        tool_name="search_time_entries",
        params=params,
    )


def change_hourly_rate(params: Dict[str, Any], _request_context: Dict[str, Any], trace_id: str) -> Dict[str, Any]:
    employee_id = str(params.get("employee_id", "")).strip()
    try:
        new_rate = float(params.get("new_rate"))
    except (TypeError, ValueError):
        return {"ok": False, "data": None, "error_code": "INVALID_RATE", "retryable": False}
    if not _is_synthetic_employee(employee_id) or not 0 < new_rate <= 200:
        return {"ok": False, "data": None, "error_code": "INVALID_RATE_REQUEST", "retryable": False}
    return _response(
        {"employee_id": employee_id, "new_rate": new_rate, "status": "synthetic_action_recorded"},
        trace_id=trace_id,
        tool_name="change_hourly_rate",
        params=params,
    )


def disburse_bank_payment(params: Dict[str, Any], _request_context: Dict[str, Any], trace_id: str) -> Dict[str, Any]:
    employee_id = str(params.get("employee_id", "")).strip()
    if not _is_synthetic_employee(employee_id):
        return {"ok": False, "data": None, "error_code": "EMPLOYEE_NOT_FOUND", "retryable": False}
    return _response(
        {"employee_id": employee_id, "status": "synthetic_action_recorded"},
        trace_id=trace_id,
        tool_name="disburse_bank_payment",
        params=params,
    )
