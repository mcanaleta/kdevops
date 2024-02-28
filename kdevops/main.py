import json

from kdevops.GCBMicroservice import GCBMicroservice


def read_microservice_config():
    with open("./kdevops.json", "r") as f:
        data = json.load(f)
    return GCBMicroservice(**data)


def main():
    service = read_microservice_config()
    service.main()
