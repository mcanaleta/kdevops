# converst dict to terraform .tf format
import json
from abc import abstractmethod
from calendar import c
from dataclasses import dataclass, field
from math import e
from os import name
from pathlib import Path
from typing import List
from unittest import result


class TFExpression:
    def __init__(self, expression):
        self.expression = expression

    def __str__(self):
        return self.expression


class TFRole:
    @abstractmethod
    def to_dict(self):
        pass


@dataclass
class TFServiceAccount:
    name: str


@dataclass
class TFProjectRole(TFRole):
    role: str
    project_id: str

    def to_dict(self):
        return dict(
            _resource="google_project_iam_member",
            _name=self.role.replace(".", "-").replace("/", "-"),
            project=self.project_id,
            role="roles/" + self.role,
        )


@dataclass
class TerraformFile:
    name: str
    content: List[dict] = field(default_factory=list)

    def add_service_account(self, name, roles: List[TFRole]):
        terraform_type_map = {
            "run": "run.invoker",
            "secretmanager": "secret_manager_secret",
            "project": "project",
        }

        self.content.append(
            dict(
                _resource="google_service_account",
                _name=name,
                account_id=name,
                display_name=name,
            )
        )

        for role in roles:
            data = role.to_dict()
            data["_name"] = name + "-" + data["_name"]
            data["member"] = (
                "serviceAccount:${google_service_account." + name + ".email}"
            )
            self.content.append(data)

    def generate_contents(self):
        result = ""
        for item in self.content:
            result += dict_to_terraform(None, item) + "\n\n\n"
        return result


@dataclass
class TerraformProject:
    files: List[TerraformFile] = field(default_factory=list)

    def generate_contents(self):
        Path("terraform").mkdir(exist_ok=True)
        for file in self.files:
            path = f"terraform/{file.name}.tf"
            with open(path, "w") as f:
                contents = file.generate_contents()
                f.write(contents)


@dataclass
class TFSecretRole(TFRole):
    secret_name: str
    role: str = "secretmanager.secretAccessor"

    def to_dict(self):
        return dict(
            _resource="google_secret_manager_secret_iam_member",
            _name=self.role.split(".")[-1] + "-" + self.secret_name,
            secret_id=TFExpression(
                f"google_secret_manager_secret.{self.secret_name}.secret_id"
            ),
            role="roles/" + self.role,
        )


def terraform_name(k, v):
    if isinstance(v, dict):
        if v.get("_type"):
            if v.get("_name"):
                return f"{v.get('_type')} \"{v.get('_name')}\""
            else:
                return v["_type"]
        elif v.get("_resource"):
            return f"resource \"{v.get('_resource')}\" \"{v.get('_name')}\""
        elif v.get("_data"):
            return f'data "{v.get("_data")}" "{v.get("_name")}"'
    if not k:
        return None
    if "-" in k:
        return f'"{k}"'
    else:
        return f"{k}"


def dict_to_terraform(key, value, indent=""):
    name = terraform_name(key, value)
    if isinstance(value, dict):
        if not name:
            raise Exception("No name")
        contents = ""
        for k, v in value.items():
            if k in ["_type", "_resource", "_data", "_name", "_includeEquals"]:
                continue

            contents += dict_to_terraform(k, v, indent + "  ") + "\n"

        includeEquals = value.get("_includeEquals")
        j = " = " if includeEquals else " "
        return f"{indent}{name}{j}{{\n{contents}{indent}}}"
        # elif isinstance(v, list):
        #     result += f"{indent}{k} = [\n"
        #     for item in v:
        #         result += f"{dict_to_terraform(item, indent+'  ')}\n"
        #     result += f"{indent}]\n"
        # else:
        #     result += (f"{indent}{k} = {dict_to_terraform(v)}\n")

    prefix = name + " = " if key else ""
    prefix = f"{indent}{prefix}"
    if isinstance(value, list):
        contents = ""
        contents = ",\n".join(
            [dict_to_terraform(None, item, indent + "  ") for item in value]
        )
        return f"{prefix}[\n{contents}\n{indent}]"
    elif isinstance(value, str):
        valj = json.dumps(value)
        return f"{prefix}{valj}"
    elif isinstance(value, TFExpression):
        return f"{prefix}{value}"
    else:
        raise Exception(f"Unknown type {type(value)}")
