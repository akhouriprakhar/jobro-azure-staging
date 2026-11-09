from typing import Dict


def build_azure_headers(key: str) -> Dict[str, str]:
    return {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json",
    }


def azure_resource_tagging(environment: str) -> Dict[str, str]:
    return {
        "environment": environment,
        "project": "JOBRO",
        "owner": "engineering",
    }
