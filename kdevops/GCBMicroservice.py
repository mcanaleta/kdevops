import json
import re
import subprocess
import sys
import time
from functools import cached_property
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel

from .cloudbuild import cloudbuild_generate
from .terraform import (
    TerraformFile,
    TerraformProject,
    TFExpression,
    TFProjectRole,
    TFSecretRole,
)
from .types import GCBSchedule, GCBWorkflow


class GCBMicroservice(BaseModel):
    project_id: str
    name: str
    terraform_bucket: str
    terraform_prefix: str
    domain: Optional[str] = None
    env: Optional[Dict[str, str]] = {}
    env_prod: Optional[Dict[str, str]] = {}
    secrets: Optional[Dict[str, str]] = {}
    service_account: Optional[str] = None
    schedules: List[GCBSchedule] = []
    workflows: List[GCBWorkflow] = []
    project_roles: List[str] = []
    public: bool = True
    region: str = "europe-west1"
    registry_region: str = "europe"
    scheduler_region: str = "europe-west1"
    cpu: str = "1000m"
    memory: str = "1G"
    github_user: Optional[str] = None
    github_repo: Optional[str] = None
    # builds may be restricted to europe-west1 https://cloud.google.com/build/docs/locations
    cloudbuild_region: str = "europe-west1"
    server_root: str = "."
    """
    resource "google_cloudbuildv2_repository" "my-repository" {
    location = "us-central1"
    name = "my-repo"
    parent_connection = google_cloudbuildv2_connection.my-connection.name
    remote_uri = "https://github.com/myuser/myrepo.git"
    }
    """

    @cached_property
    def registry(self):
        return f"{self.registry_region}-docker.pkg.dev"

    @cached_property
    def image_name(self):
        return self.name

    @cached_property
    def image_url(self):
        return f"{self.registry}/{self.project_id}/{self.image_name}/{self.image_name}"

    @cached_property
    def image_url_latest(self):
        return f"{self.image_url}:latest"

    @cached_property
    def localarch_image_url(self):
        return f"{self.image_name}_localarch"

    @cached_property
    def sa_cloudbuild(self):
        return self.name + "-cloudbuild"

    @cached_property
    def sa_scheduler(self):
        return self.name + "-scheduler"

    def init(self):
        self.generate()
        subprocess.run(["terraform", "init"], cwd="./terraform")
        # run terraform apply in folder ./terraform/

    def apply(self):
        self.generate()
        subprocess.run(["terraform", "apply"], cwd="./terraform")
        # run terraform apply in folder ./terraform/

    def generate(self):
        self.generate_terraform()
        self.generate_cloudbuild()

    def generate_terraform(self):
        project = TerraformProject()
        project.files.append(self.generate_main())
        project.files.append(self.generate_secrets())
        project.files.append(self.generate_iam())
        project.files.append(self.generate_ci())
        project.files.append(self.generate_cloudrun())
        project.files.append(self.generate_google_services())
        project.files.append(self.generate_schedules())
        project.generate_contents()

    def generate_cloudbuild(self):
        cloudbuild_generate(self)

    def generate_main(self):
        base = TerraformFile("main")
        base.content.append(
            dict(
                _type="terraform",
                required_providers=dict(
                    google=dict(
                        _includeEquals=True,
                        source="hashicorp/google",
                    ),
                ),
                backend_gcs=dict(
                    _type="backend",
                    _name="gcs",
                    bucket=self.terraform_bucket,
                    prefix=self.terraform_prefix,
                ),
            )
        ),

        base.content.append(
            dict(
                _type="provider",
                _name="google",
                project=self.project_id,
                region=self.region,
            )
        )

        return base

    def generate_google_services(self):
        google_services = [
            "artifactregistry",
            "run",
            "cloudbuild",
            "secretmanager",
            "iam",
            "cloudscheduler",
            "sheets",
        ]

        file = TerraformFile("google_services")
        for service in google_services:
            file.content.append(
                dict(
                    _resource="google_project_service",
                    _name=service,
                    project=self.project_id,
                    service=service + ".googleapis.com",
                )
            )
        return file

    def generate_secrets(self):
        secrets = TerraformFile("secrets")
        for k, v in self.secrets.items():
            secrets.content.append(
                dict(
                    _resource="google_secret_manager_secret",
                    _name=v,
                    secret_id=v,
                    replication=dict(auto={}),
                    depends_on=[
                        TFExpression("google_project_service.secretmanager"),
                    ],
                )
            )

        return secrets

    def generate_ci(self):
        ci = TerraformFile("ci")
        ci.content.append(
            dict(
                _resource="google_artifact_registry_repository",
                _name=self.name,
                location=self.registry_region,
                repository_id=self.name,
                format="DOCKER",
                depends_on=[
                    TFExpression("google_project_service.artifactregistry"),
                ],
            )
        )

        repo = self.github_repo or self.name
        ci.content.append(
            dict(
                _resource="google_cloudbuildv2_repository",
                _name=self.name,
                location=self.cloudbuild_region,
                name=repo,
                parent_connection="github",
                remote_uri=f"https://github.com/{self.github_user}/{repo}.git",
            )
        )

        ci.content.append(
            dict(
                _resource="google_cloudbuild_trigger",
                _name=self.name,
                name=self.name,
                location=self.cloudbuild_region,
                filename="cloudbuild.yaml",
                service_account=f"projects/{self.project_id}/serviceAccounts/${{google_service_account.{self.sa_cloudbuild}.email}}",
                repository_event_config=dict(
                    repository=TFExpression(
                        f"google_cloudbuildv2_repository.{self.name}.id"
                    ),
                    push=dict(branch="^main$"),
                ),
            )
        )
        return ci

    def generate_cloudrun(self):
        file = TerraformFile("cloudrun")

        service = dict(
            _resource="google_cloud_run_v2_service",
            _name=self.name,
            name=self.name,
            location=self.region,
            template=dict(
                containers=dict(
                    image=self.image_url + ":latest",
                    resources=dict(
                        limits=dict(
                            _includeEquals=True,
                            cpu=self.cpu,
                            memory=self.memory,
                        ),
                        cpu_idle=TFExpression("true"),
                    ),
                ),
                service_account=TFExpression(
                    f"google_service_account.{self.name}.email"
                ),
            ),
            lifecycle=dict(
                ignore_changes=[
                    TFExpression("template[0].containers[0].image"),
                    TFExpression("client"),
                    TFExpression("client_version"),
                ]
            ),
        )

        for k, v in self.secrets.items():
            service["template"]["containers"]["env_scret" + k] = dict(
                _type="env",
                name=k,
                value_source=dict(
                    secret_key_ref=dict(
                        secret=TFExpression(
                            f"google_secret_manager_secret.{v}.secret_id"
                        ),
                        version="latest",
                    )
                ),
            )

        merged_env = {**self.env, **self.env_prod}
        for k, v in merged_env.items():
            service["template"]["containers"]["env" + k] = dict(
                _type="env",
                name=k,
                value=v,
            )

        file.content.append(
            dict(
                _data="google_iam_policy",
                _name="noauth",
                binding=dict(role="roles/run.invoker", members=["allUsers"]),
            )
        )

        if self.public:
            file.content.append(
                dict(
                    _resource="google_cloud_run_v2_service_iam_policy",
                    _name="noauth",
                    project=self.project_id,
                    location=TFExpression(
                        f"google_cloud_run_v2_service.{self.name}.location"
                    ),
                    name=TFExpression(f"google_cloud_run_v2_service.{self.name}.name"),
                    policy_data=TFExpression(
                        "data.google_iam_policy.noauth.policy_data"
                    ),
                )
            )

        file.content.append(service)
        if self.domain:
            domain_mapping = dict(
                _resource="google_cloud_run_domain_mapping",
                _name=self.name,
                location=self.region,
                name=self.domain,
                spec=dict(
                    route_name=TFExpression(
                        f"google_cloud_run_v2_service.{self.name}.name"
                    ),
                ),
                metadata=dict(
                    namespace=self.project_id,
                ),
                depends_on=[
                    TFExpression(f"google_cloud_run_v2_service.{self.name}"),
                ],
            )
            file.content.append(domain_mapping)
        return file

    def generate_iam(self):
        iam = TerraformFile("iam")

        iam.add_service_account(
            self.name,
            [
                *[TFProjectRole(r, self.project_id) for r in self.project_roles],
                *[TFSecretRole(s) for s in self.secrets.values()],
            ],
        )

        iam.content.append(
            dict(
                _resource="google_service_account_key",
                _name=self.name,
                service_account_id=TFExpression(
                    f"google_service_account.{self.name}.id"
                ),
            )
        )

        iam.content.append(
            dict(
                _resource="local_file",
                _name=self.name + "_key",
                filename=f"{self.name}-key.json",
                content=TFExpression(
                    f"base64decode(google_service_account_key.{self.name}.private_key)"
                ),
            )
        )

        iam.add_service_account(
            self.sa_cloudbuild,
            [
                TFProjectRole("run.developer", self.project_id),
                TFProjectRole("cloudbuild.builds.editor", self.project_id),
                TFProjectRole("logging.logWriter", self.project_id),
                TFProjectRole("artifactregistry.writer", self.project_id),
                TFProjectRole("iam.serviceAccountUser", self.project_id),
            ],
        )

        iam.add_service_account(
            self.sa_scheduler,
            [
                TFProjectRole("run.invoker", self.project_id),
            ],
        )
        return iam

    def generate_schedules(self):
        schedules = TerraformFile("schedules")
        for schedule in self.schedules:
            bodyjson = json.dumps(schedule.body)
            bodydoublejson = json.dumps(bodyjson)
            bodyexpression = f"base64encode({bodydoublejson})"
            schedules.content.append(
                dict(
                    _resource="google_cloud_scheduler_job",
                    _name=schedule.name,
                    name=schedule.name,
                    schedule=schedule.frequency,
                    time_zone="Europe/Madrid",
                    region=self.scheduler_region,
                    http_target=dict(
                        http_method="POST",
                        uri=TFExpression(
                            f'"${{google_cloud_run_v2_service.{self.name}.uri}}/{schedule.path}"'
                        ),
                        body=TFExpression(bodyexpression),
                        headers={
                            "_includeEquals": True,
                            "Content-Type": "application/json",
                        },
                        oidc_token=dict(
                            service_account_email=TFExpression(
                                f"google_service_account.{self.sa_scheduler}.email"
                            ),
                        ),
                    ),
                    depends_on=[
                        TFExpression(f"google_cloud_run_v2_service.{self.name}"),
                        TFExpression(f"google_project_service.cloudscheduler"),
                    ],
                )
            )
        return schedules

    def getenv(self):
        with open(f"{self.server_root}/.env.local", "w") as f, open(
            "./.env.local.docker", "w"
        ) as fd:
            for k, v in self.env.items():
                f.write(f"{k}={v}\n")
                fd.write(f"{k}={v}\n")
            for k, v in self.secrets.items():
                cmd = f"gcloud secrets versions access latest --secret={v} --project={self.project_id}"
                value = subprocess.check_output(cmd.split()).decode().strip()
                f.write(f"{k}={value}\n")
                fd.write(f"{k}={value}\n")
            creds_path = f"./terraform/{self.name}-key.json"
            rel_path = Path(creds_path).relative_to(self.server_root, walk_up=True)
            f.write(f"GOOGLE_APPLICATION_CREDENTIALS={rel_path}\n")
            fd.write(f"GOOGLE_APPLICATION_CREDENTIALS=/app/{self.name}-key.json\n")

    def build(self, tag: Optional[str] = None):
        tag = tag or f"local{time.time().__floor__()}"
        image_url_tag = f"{self.image_url}:{tag}"
        subprocess.run(
            [
                "docker",
                "buildx",
                "build",
                "--progress",
                "plain",
                "--platform",
                "linux/amd64",
                "-t",
                image_url_tag,
                "-t",
                self.image_url_latest,
                ".",
            ],
            check=True,
        )
        return tag

    def buildlocalarch(self):
        subprocess.run(
            [
                "docker",
                "build",
                "--progress",
                "plain",
                "-t",
                self.localarch_image_url,
                ".",
            ],
            check=True,
        )
        return self.localarch_image_url

    def push(self, tag: Optional[str] = None):
        tag = self.build()
        image_url_tag = f"{self.image_url}:{tag}"
        subprocess.run(
            [
                "docker",
                "push",
                image_url_tag,
            ],
            check=True,
        )
        subprocess.run(
            [
                "docker",
                "push",
                self.image_url_latest,
            ],
            check=True,
        )
        return tag

    def deploy(self):
        tag = self.push()
        image_url_tag = f"{self.image_url}:{tag}"
        subprocess.run(
            [
                "gcloud",
                "run",
                "services",
                "update",
                self.name,
                f"--image={image_url_tag}",
                f"--region={self.region}",
                f"--project={self.project_id}",
            ],
            check=True,
        )

        print(f"Deploying {image_url_tag}")

    def localrun(self):
        tag = self.buildlocalarch()

        subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "-p",
                "8080:8080",
                "--env-file",
                "./.env.local.docker",
                "-v",
                f"./terraform/{self.name}-key.json:/app/{self.name}-key.json",
                "backoffice_localarch",
            ],
            check=True,
        )

    def main(self):
        print(sys.argv)
        cmd = sys.argv[1]
        if cmd == "build":
            self.build()
        if cmd == "buildlocalarch":
            self.buildlocalarch()
        if cmd == "push":
            self.push()
        if cmd == "deploy":
            self.deploy()
        if cmd == "infra":
            self.apply()
        elif cmd == "getenv":
            self.getenv()
        elif cmd == "init":
            self.init()
        elif cmd == "localrun":
            self.localrun()
