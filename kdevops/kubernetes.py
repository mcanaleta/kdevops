from dataclasses import dataclass
import base64
import json
import tempfile
import yaml

from kdevops.cmds import cmd, cmd_output


@dataclass
class KubernetesContext:
    context: str
    namespace: str

    def ensure_namespace(self, namespace: str):
        if namespace not in cmd_output("kubectl get namespaces"):
            cmd_output(f"kubectl create namespace {namespace}")

    def kubectl(self, args: str):
        cmd(f"kubectl {
            args} --context {self.context} --namespace {self.namespace}")

    def kubectl_apply_raw(self, content: str):
        with tempfile.NamedTemporaryFile("w", delete=True) as f:
            f.write(content)
            f.flush()
            self.kubectl(f"apply -f {f.name}")

    def set_secret(self, name: str, data: dict[str, str]):
        secret_yaml = yaml.dump({
            "apiVersion": "v1",
            "kind": "Secret",
            "metadata": {
                "name": name
            },
            "data": {key: base64.b64encode(value.encode()).decode() for key, value in data.items()}
        })
        self.kubectl_apply_raw(secret_yaml)

    def set_secret_from_op(self, vault: str, name: str, kube_name: str):
        op_output = json.loads(cmd_output(
            f"op item get --vault {vault} {name} --format json"))
        data = {}
        if "fields" in op_output:
            for field in op_output["fields"]:
                if field["purpose"] == "NOTES":
                    continue
                if "value" in field:
                    data[field["id"]] = field["value"]
                elif "reference" in field:
                    ref = field["reference"]
                    value = cmd_output(f"op read {ref}")
                    data[field["id"]] = value
        if "files" in op_output:
            for file in op_output["files"]:
                ref = f"op://{vault}/{name}/{file['name']}"
                value = cmd_output(f"op read {ref}")
                data[file["name"]] = value
        self.set_secret(kube_name, data)
