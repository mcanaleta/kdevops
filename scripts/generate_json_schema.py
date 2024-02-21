import json

from kdevops.GCBMicroservice import GCBMicroservice

schema = GCBMicroservice.model_json_schema()  # (1)!
with open("schema.json", "w") as f:
    f.write(json.dumps(schema, indent=2))  # (2)!
