from pydantic import BaseModel


class GCBSchedule(BaseModel):
    name: str
    path: str
    frequency: str
    body: dict


class GCBWorkflow(BaseModel):
    name: str
    path: str
    body: str
    description: str
