"""
This module provides utilities for managing Google Cloud service accounts.
"""

import subprocess


class GCloudError(Exception):
    """Custom exception for GCloud related errors."""


def gcloud_ensure_service_account(project: str, name: str):
    """
    Ensure that a Google Cloud service account exists for the given project and name.
    """
    full_name = f"{name}@{project}.iam.gserviceaccount.com"
    describe_result = subprocess.run(
        f"gcloud iam service-accounts describe {full_name}",
        shell=True,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE)
    if describe_result.returncode == 0:
        return
    if not "NOT_FOUND" in describe_result.stderr.decode():
        raise GCloudError(describe_result.stderr)
    subprocess.run(
        f"gcloud iam service-accounts create {name} --project {project}", shell=True, check=True)


def gcloud_ensure_sa_binding(project: str, name: str, role: str):
    """
    Ensure that a Google Cloud service account has the given role.
    """
    full_name = f"{name}@{project}.iam.gserviceaccount.com"
    result = subprocess.run(
        f"gcloud projects add-iam-policy-binding {project} --member serviceAccount:{full_name} --role {role}",
        shell=True,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE)
    if result.returncode != 0:
        raise GCloudError(result.stderr)


def gcloud_generate_key(project: str, name: str, keyfile: str):
    """
    Generate a key for the given Google Cloud service account.
    """
    full_name = f"{name}@{project}.iam.gserviceaccount.com"
    subprocess.run(
        f"gcloud iam service-accounts keys create {keyfile} --iam-account {full_name}",
        shell=True,
        check=True)
