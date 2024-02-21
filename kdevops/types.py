from dataclasses import dataclass


@dataclass
class GCBSchedule:
    name: str
    path: str
    frequency: str
    body: any


@dataclass
class GCBWorkflow:
    name: str
    path: str
    body: str
    description: str
