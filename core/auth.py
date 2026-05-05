"""
core/auth.py — Password helpers (v2)
======================================
Re-exports from core/security.py to maintain backward compatibility.
All callers that did `from core.auth import hash_password, verify_password`
continue to work without modification.
"""
from core.security import hash_password, verify_password

__all__ = ["hash_password", "verify_password"]
