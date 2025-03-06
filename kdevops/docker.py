import base64
from dataclasses import dataclass
from kdevops import cmds
from pathlib import Path
import tempfile
import os


@dataclass
class Docker:
    docker_command: str = "docker"

    def build(self, img: str, path=".", repo=None, platform=None, dockerfile=None):
        img_full = f"{repo}/{img}" if repo else img
        img_latest = f"{img_full}:latest"

        # Build the Docker image
        args = [f"-t {img_latest}"]
        if dockerfile:
            args.append(f"-f {dockerfile}")
        if platform:
            args.append(f"--platform {platform}")
        args = " ".join(args)
        cmds.cmd(f"{self.docker_command} build {path} {args}")

        # Get the SHA of the latest image
        sha = cmds.cmd_output(
            f"{self.docker_command} images --no-trunc --quiet {img_latest}").replace("sha256:", "")
        img_tagged = f"{img_full}:{sha}"
        print(f"Image SHA: {sha}")

        # Tag and push the image
        cmds.cmd(f"{self.docker_command} tag {img_latest} {img_tagged}")
        if repo is not None:
            cmds.cmd(f"{self.docker_command} push {img_tagged}")

        return img_tagged

    def run(self, img: str, it=False, cmd: str = None, detach=False, rm=True, **kwargs):
        args = ["run"]
        if detach:
            args.append("-d")
        if rm:
            args.append("--rm")
        if it:
            args.append("-it")
        args.append(img)
        if cmd:
            args.append(cmd)
        args = " ".join(args)
        cmds.cmd(f"{self.docker_command} {args}")


@dataclass
class MinikubeDocker(Docker):
    def __post_init__(self):
        tmp_dir = tempfile.gettempdir()
        tmp_file_path = os.path.join(tmp_dir, "minikube_docker")
        with open(tmp_file_path, 'w') as tmpfile:
            env_contents = cmd_output("minikube docker-env --shell bash")
            tmpfile.write(env_contents)
            tmpfile.write("\ndocker $@")
        Path(tmp_file_path).chmod(0o755)
        self.docker_command = tmp_file_path


def docker_generate_config(host, username, password):
    credentials = f"{username}:{password}"
    encoded_credentials = base64.b64encode(credentials.encode()).decode()
    docker_config = {"auths": {host: {"auth": encoded_credentials}}}
    return docker_config
