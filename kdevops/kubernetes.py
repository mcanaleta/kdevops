from dataclasses import dataclass
import base64
import json
import subprocess
import tempfile
import yaml

from kdevops import cmds


@dataclass
class KubernetesContext:
    context: str
    namespace: str

    def ensure_namespace(self, namespace: str):
        ns_yaml = yaml.dump({
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": namespace
            }
        })
        self.kubectl_apply_raw(ns_yaml)

    def kubectl_cmd(self, args: str):
        return f"kubectl --context {self.context} --namespace {self.namespace} {args}"

    def kubectl(self, args: str, check=True):
        cmd = f"kubectl --context {
            self.context} --namespace {self.namespace} {args}"
        if check:
            return cmds.cmd(cmd)
        else:
            return cmds.cmd_nocheck(cmd)

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

    def get_secret(self, name: str):
        cmd = self.kubectl_cmd(f"get secret {name} -o json")
        result = subprocess.run(cmd, shell=True, capture_output=True)
        if result.returncode == 0:
            secret_data = json.loads(result.stdout)
            data = {key: base64.b64decode(value).decode()
                    for key, value in secret_data["data"].items()}
            return data
        else:
            err = result.stderr.decode()
            if "Error from server (NotFound)" in err:
                return None
            else:
                raise Exception(err)

    def set_secret_from_op(self, vault: str, name: str, kube_name: str):
        op_output = json.loads(cmds.cmd_output(
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
                    value = cmds.cmd_output(f"op read {ref}")
                    data[field["id"]] = value
        if "files" in op_output:
            for file in op_output["files"]:
                ref = f"op://{vault}/{name}/{file['name']}"
                value = cmds.cmd_output(f"op read {ref}")
                data[file["name"]] = value
        self.set_secret(kube_name, data)
