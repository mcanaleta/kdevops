"""
Module for interacting with 1Password CLI and handling environment variables.
"""
import subprocess
from typing import Dict
from kdevops import cmds


def op_eval_env_file(f: str) -> Dict[str, str]:
    """
    Reads an environment file and injects secrets from 1Password using `op inject`.

    Args:
        f (str): Path to the environment file.

    Returns:
        Dict[str, str]: A dictionary containing environment variables with their injected values.
    """
    contents = cmds.cmd_output(f"op inject -i {f}")
    result = {}
    for l in contents.split("\n"):
        parts = l.split("=")
        key = parts[0]
        value = "=".join(parts[1:])
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1]
        result[key] = value
    return result


def op_item_exists(op_vault: str, op_item_name: str) -> bool:
    """
    Checks if a 1Password item exists in the specified vault.

    Args:
        op_vault (str): The name of the 1Password vault.
        op_item_name (str): The name of the 1Password item.

    Returns:
        bool: True if the item exists, False otherwise.

    Raises:
        RuntimeError: If an unexpected error occurs when checking the item.
    """
    try:
        existing_item: subprocess.CompletedProcess = subprocess.run(
            f"op item get --vault {op_vault} {op_item_name}",
            check=False,
            shell=True,
            capture_output=True,
        )

        if existing_item.returncode == 0:
            return True

        error_string: str = existing_item.stderr.decode("utf-8")
        if "isn't an item" in error_string:
            return False
        raise subprocess.CalledProcessError(
            returncode=existing_item.returncode,
            cmd=f"op item get --vault {op_vault} {op_item_name}",
            output=existing_item.stdout,
            stderr=existing_item.stderr,
        )

    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Error checking if item exists: {
                           e.stderr.decode('utf-8')}") from e
